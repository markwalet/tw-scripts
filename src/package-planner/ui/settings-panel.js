// package-planner/ui/settings-panel.js — the settings at the top of the popup (layout B,
// DESIGN-package-planner.md §1/§6): one collapsed line with an *edit* link that unfolds the
// settings table. Every change is parsed and saved at once (per world, via `save`); the
// next Calculate uses it. Inputs are never rebuilt while typing (that would drop focus):
// a change only updates the line and marks invalid fields, and popup renders reuse the
// open panel element.

import { h, injectStyle } from '../../shared/dom.js';
import { formFields, readForm, settingsLine } from '../core/settings.js';

const CSS = `
.pp-root .pp-chipline{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.pp-root .pp-settings{margin-top:4px;width:100%}
.pp-root .pp-settings input{padding:1px 3px}
.pp-root .pp-settings .icon{margin:0 2px 0 4px}
.pp-root .pp-settings .pp-invalid{border:1px solid #b5482b;background:#f8d8d0}
.pp-root.pp-mobile .pp-hint{display:none}
`;

/** @typedef {import('../core/settings.js').Settings} Settings */
/** @typedef {import('../core/settings.js').FormFields} FormFields */

/**
 * @template {Settings} S
 * @param {{ t: (key: string) => string, get: () => S, save: (s: S) => void }} deps
 */
export function createSettingsPanel({ t, get, save }) {
  injectStyle('pp-settings-style', CSS);
  let open = false;
  /** @type {HTMLElement | null} */
  let node = null;

  function build() {
    const line = h('span', { text: `⚙ ${settingsLine(get(), t)}` });
    const toggle = h('a', {
      className: 'pp-link',
      href: '#',
      text: t(open ? 'close' : 'edit'),
      on: { click: (/** @type {Event} */ e) => { e.preventDefault(); open = !open; rebuild(); } },
    });
    return h('div', {}, [h('div', { className: 'pp-chipline' }, [line, toggle]), open ? table(line) : null]);
  }

  /** @param {HTMLElement} line */
  function table(line) {
    const f = formFields(get());
    /** @type {Partial<Record<keyof FormFields, HTMLInputElement>>} */
    const inputs = {};
    function onChange() {
      const fields = /** @type {FormFields} */ (Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])));
      const { settings, invalid } = readForm(fields, get());
      save(settings);
      line.textContent = `⚙ ${settingsLine(settings, t)}`;
      for (const [k, el] of Object.entries(inputs)) {
        const bad = invalid.includes(/** @type {keyof FormFields} */ (k));
        el.classList.toggle('pp-invalid', bad);
        el.title = bad ? t('invalidSetting') : '';
      }
    }
    /** @param {keyof FormFields} k @param {number} width */
    const input = (k, width) =>
      (inputs[k] = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: f[k], size: width, on: { change: onChange } })));
    /** A group dropdown: All + the groups last read from an overview. @param {'senderGroup' | 'receiverGroup'} k */
    const group = (k) => (inputs[k] = /** @type {HTMLInputElement} */ (h('select', { on: { change: onChange } },
      [[0, t('allGroups')], ...get().groups].map(([id, name]) => h('option', { value: id, text: name, selected: `${id}` === f[k] || null })))));
    /** @param {'wood' | 'stone' | 'iron'} k */
    const res = (k) => [h('span', { className: `icon header ${k}`, title: t(k) }), input(k, 6)];
    const row = (/** @type {string} */ label, /** @type {Node[]} */ cells, hint = '') =>
      h('tr', {}, [h('td', { text: t(label) }), h('td', {}, cells), h('td', { className: 'pp-muted pp-hint', text: hint && t(hint) })]);
    return h('table', { className: 'vis pp-settings' }, [
      row('maxTravelLabel', [input('maxTravel', 6)], 'maxTravelHint'),
      row('reserveLabel', [...res('wood'), ...res('stone'), ...res('iron')], 'reserveHint'),
      row('keepMerchantsLabel', [input('keepMerchants', 4)]),
      row('bufferLabel', [input('bufferPct', 4)], 'bufferHint'),
      row('senderGroupLabel', [group('senderGroup')]),
      row('receiverGroupLabel', [group('receiverGroup')], 'receiverGroupHint'),
      row('noblesLabel', [input('nobles', 4)], 'noblesHint'),
    ]);
  }

  function rebuild() {
    const next = build();
    node?.replaceWith(next);
    node = next;
  }

  return {
    /**
     * The panel, for a popup render. While the table is open it is the same element (its
     * inputs keep focus and typed text); folded, the line is rebuilt (settings may have
     * changed, e.g. the group list after a Calculate).
     */
    element() {
      if (!node || !open) rebuild();
      return /** @type {HTMLElement} */ (node);
    },
    /** Fold the table back into the line (on Calculate). */
    close() {
      if (!open) return;
      open = false;
      rebuild();
    },
  };
}
