// ui/renderers/_base.js — shared implementation of the Renderer contract, parameterized
// by a theme (name + CSS). modern/native/minimal each build a Renderer from this with
// their own styling. A renderer that needs a genuinely different LAYOUT can ignore this
// base and implement the contract directly — the swap point (renderer.js) doesn't care.

import { h, injectStyle } from '../../shared/dom.js';

/**
 * @typedef {Object} RendererTheme
 * @property {string} name       used for the style-tag id and a root data-attr
 * @property {string} css        scoped CSS (all selectors under .tt2-panel[data-look=name])
 */

const two = (n) => String(n).padStart(2, '0');

// The seven atomic segments, ordered large → small (year first, ms last).
const SEG_DEFS = [
  { k: 'y', len: 4, min: 1970, max: 9999, ph: 'yyyy' },
  { k: 'mo', len: 2, min: 1, max: 12, ph: 'mm' },
  { k: 'd', len: 2, min: 1, max: 31, ph: 'dd' },
  { k: 'H', len: 2, min: 0, max: 23, ph: 'HH' },
  { k: 'M', len: 2, min: 0, max: 59, ph: 'MM' },
  { k: 'S', len: 2, min: 0, max: 59, ph: 'SS' },
  { k: 'ms', len: 3, min: 0, max: 999, ph: 'ms' },
];

/** Display formatting per segment: year/ms as-is, the rest zero-padded to 2. */
const fmtSeg = (def, n) => (def.k === 'y' || def.k === 'ms' ? String(n) : two(n));

/** Fill the seven segment inputs from a {date, time, ms} composite. */
function fillSegments(inputs, { date, time, ms }) {
  if (date != null) {
    const m = String(date).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      inputs.y.value = m[1];
      inputs.mo.value = two(m[2]);
      inputs.d.value = two(m[3]);
    }
  }
  if (time != null) {
    const m = String(time).match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (m) {
      inputs.H.value = two(m[1]);
      inputs.M.value = m[2];
      inputs.S.value = m[3];
    }
  }
  if (ms != null && ms !== '') inputs.ms.value = String(ms);
}

/**
 * @param {RendererTheme} theme
 * @returns {import('../renderer.js').Renderer}
 */
export function makeRenderer(theme) {
  /** @type {Record<string, any>} */
  const refs = {};

  return {
    mount(rootEl, { t, initialValues, handlers }) {
      injectStyle(`tt2-style-${theme.name}`, theme.css);

      // Segmented date · time . ms spinner (atomic segments, native-picker feel):
      //   • click/tab a segment → it highlights (selected); typing OVERWRITES it and
      //     auto-advances to the next when full          • ↑/↓ spins it (Shift = ×10)
      //   • wheel spins it        • ←/→ hop between segments at the edge
      //   • paste a full timestamp into any segment → distributes across all
      /** @type {Record<string, HTMLInputElement>} */
      const inputs = {};
      const order = SEG_DEFS.map((d) => d.k);
      const idx = (k) => order.indexOf(k);
      const focusSeg = (k) => {
        const el = inputs[k];
        if (el) { el.focus(); el.select(); }
      };
      const advance = (k) => idx(k) < order.length - 1 && focusSeg(order[idx(k) + 1]);
      const retreat = (k) => idx(k) > 0 && focusSeg(order[idx(k) - 1]);

      const assemble = () => {
        const g = (k, len) => (inputs[k].value === '' ? '' : String(inputs[k].value).padStart(len, '0'));
        return {
          date: `${g('y', 4)}-${g('mo', 2)}-${g('d', 2)}`,
          time: `${g('H', 2)}:${g('M', 2)}:${g('S', 2)}`,
          ms: inputs.ms.value === '' ? '0' : inputs.ms.value,
        };
      };
      const emit = () => handlers.onArrivalInput(assemble());

      // Read the seven fields into one Date, and write one Date back to the seven fields.
      const readDate = () => {
        const n = (k, d) => {
          const v = parseInt(inputs[k].value, 10);
          return Number.isFinite(v) ? v : d;
        };
        return new Date(n('y', 2000), n('mo', 1) - 1, n('d', 1), n('H', 0), n('M', 0), n('S', 0), n('ms', 0));
      };
      const writeDate = (dt) => {
        inputs.d.value = two(dt.getDate());
        inputs.mo.value = two(dt.getMonth() + 1);
        inputs.y.value = String(dt.getFullYear());
        inputs.H.value = two(dt.getHours());
        inputs.M.value = two(dt.getMinutes());
        inputs.S.value = two(dt.getSeconds());
        inputs.ms.value = String(dt.getMilliseconds());
      };

      // Spin one segment WITH carry: apply the matching Date setter, then rewrite all
      // fields. Date does the carrying (59s→+1min, 999ms→+1s, Jan 31→Feb 1, leap years…).
      const spin = (def, delta) => {
        const dt = readDate();
        if (def.k === 'y') dt.setFullYear(dt.getFullYear() + delta);
        else if (def.k === 'mo') dt.setMonth(dt.getMonth() + delta);
        else if (def.k === 'd') dt.setDate(dt.getDate() + delta);
        else if (def.k === 'H') dt.setHours(dt.getHours() + delta);
        else if (def.k === 'M') dt.setMinutes(dt.getMinutes() + delta);
        else if (def.k === 'S') dt.setSeconds(dt.getSeconds() + delta);
        else dt.setMilliseconds(dt.getMilliseconds() + delta);
        writeDate(dt);
        inputs[def.k].select();
        emit();
      };

      for (const def of SEG_DEFS) {
        const el = h('input', {
          className: `tt2-seg tt2-seg-${def.k}`,
          type: 'text',
          inputmode: 'numeric',
          maxlength: String(def.len),
          placeholder: def.ph,
          'aria-label': def.ph,
        });
        inputs[def.k] = /** @type {HTMLInputElement} */ (el);

        el.addEventListener('focus', () => el.select()); // highlight → type overwrites
        el.addEventListener('input', () => {
          const v = el.value.replace(/\D/g, '').slice(0, def.len);
          el.value = v;
          emit();
          // Auto-advance: when the segment is full, or a further digit couldn't fit.
          if (v.length >= def.len || (v.length >= 1 && parseInt(v, 10) * 10 > def.max)) advance(def.k);
        });
        el.addEventListener('blur', () => {
          if (el.value === '') return;
          const n = Math.min(def.max, Math.max(def.min, parseInt(el.value, 10) || def.min));
          el.value = fmtSeg(def, n);
          emit();
        });
        el.addEventListener('paste', (e) => {
          const text = (e.clipboardData || /** @type {any} */ (window).clipboardData)?.getData('text');
          if (text && /\d/.test(text)) {
            e.preventDefault();
            handlers.onPaste(text, assemble());
          }
        });
        el.addEventListener('wheel', (e) => {
          e.preventDefault();
          spin(def, e.deltaY < 0 ? 1 : -1);
        }, { passive: false });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); // never submit the attack form
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            spin(def, e.shiftKey ? 10 : 1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            spin(def, e.shiftKey ? -10 : -1);
          } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
            e.preventDefault();
            retreat(def.k);
          } else if (e.key === 'ArrowRight' && el.selectionEnd === el.value.length) {
            // selectionEnd (not Start) so a fully-selected segment counts as "at the end"
            // and hops on the first press instead of just collapsing the selection.
            e.preventDefault();
            advance(def.k);
          } else if (e.key === 'Backspace' && el.value === '') {
            e.preventDefault();
            retreat(def.k);
          }
        });
      }

      fillSegments(inputs, initialValues);

      const sep = (txt) => h('span', { className: 'tt2-seg-sep', text: txt });
      const segmented = h('div', { className: 'tt2-datetime' }, [
        inputs.y, sep('-'), inputs.mo, sep('-'), inputs.d,
        sep(' '),
        inputs.H, sep(':'), inputs.M, sep(':'), inputs.S,
        sep('.'), inputs.ms,
      ]);

      const remember = h('input', {
        id: 'tt2-remember',
        type: 'checkbox',
        on: { change: (e) => handlers.onRememberToggle(/** @type {any} */ (e.target).checked) },
      });
      if (initialValues.remember) remember.setAttribute('checked', 'checked');

      const barFill = h('div', { id: 'tt2-bar-fill', className: 'tt2-bar-fill' });
      const barTime = h('div', { id: 'tt2-bar-time', className: 'tt2-bar-time' });
      const bar = h('div', { className: 'tt2-bar' }, [barFill, barTime]);

      const sendRow = h('div', { className: 'tt2-sendtime' });

      const gear = h('button', {
        className: 'tt2-gear',
        type: 'button',
        title: t('settings'),
        text: '⚙',
        on: { click: () => handlers.onOpenSettings() },
      });

      const panel = h('div', { className: 'tt2-panel', 'data-look': theme.name }, [
        h('div', { className: 'tt2-head' }, [h('span', { text: 'timetool2' }), gear]),
        bar,
        h('div', { className: 'tt2-row' }, [h('label', { text: `${t('arrival')}: ` }), segmented]),
        h('div', { className: 'tt2-row' }, [h('label', {}, [remember, ` ${t('remember')}`])]),
        sendRow,
      ]);

      Object.assign(refs, { panel, bar, barFill, barTime, inputs, remember, sendRow });
      rootEl.appendChild(panel);
    },

    renderBar({ percent, state, clockText }) {
      if (!refs.barFill) return;
      refs.barFill.style.width = `${percent}%`;
      refs.barFill.setAttribute('data-state', state); // CSS colors per state
      if (clockText != null) refs.barTime.textContent = clockText;
    },

    renderSendTime({ sendText, tooLate }) {
      if (!refs.sendRow) return;
      refs.sendRow.textContent = tooLate ? 'Too Late!' : sendText ? `send in: ${sendText}` : '';
      refs.sendRow.classList.toggle('tt2-toolate', !!tooLate);
    },

    reflectInputs({ date, time, ms, remember }) {
      if (refs.inputs) fillSegments(refs.inputs, { date, time, ms });
      if (remember != null && refs.remember) refs.remember.checked = remember;
    },

    cue({ kind }) {
      if (!refs.panel) return;
      refs.panel.classList.remove('tt2-cue-send', 'tt2-cue-green');
      const cls = kind === 'send' ? 'tt2-cue-send' : 'tt2-cue-green';
      refs.panel.classList.add(cls);
      setTimeout(() => refs.panel && refs.panel.classList.remove(cls), 400);
    },

    styleIncomingSendCell(cellEl) {
      cellEl.classList.add('tt2-send-cell');
    },

    mountSettings(rootEl, { values, onChange }) {
      // Minimal scaffold: a container the settings-panel controller fills. Kept here so
      // the popup matches the active look.
      rootEl.appendChild(h('div', { className: 'tt2-settings', 'data-look': theme.name }));
      void values;
      void onChange;
    },

    destroy() {
      if (refs.panel) refs.panel.remove();
    },
  };
}
