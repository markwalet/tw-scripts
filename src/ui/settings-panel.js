// ui/settings-panel.js — gear → native TW Dialog popup for set-once config (DESIGN.md §8).
// Everyday controls (snipe time/ms/remember) live on the main panel, NOT here.

import * as tw from '../adapter/tw.js';
import { h, injectStyle } from '../shared/dom.js';
import { Renderer } from './renderer.js';
import { _availableLangs } from '../core/i18n.js';
import { exportJSON, importJSON } from '../core/settings.js';

/**
 * Scoped stylesheet for the settings popup, injected once regardless of which
 * renderer is active. Keeps layout consistent (row spacing, aligned two-column
 * color grid, muted helper text, padding) no matter what CSS the host renderer ships.
 * Every selector is scoped under `.tt2-settings-root` (DESIGN.md §7 scoped-CSS rule).
 */
const SETTINGS_STYLE_ID = 'tt2-settings-style';
const SETTINGS_CSS = `
.tt2-settings-root { padding: 8px 2px; }
.tt2-settings-root h3, .tt2-settings-root h4 { margin: 0.6em 0 0.3em; }
.tt2-settings-root .tt2-row { margin: 6px 0; display: flex; align-items: center; gap: 6px; }
/* label fills, swatch pinned to the right so all three swatches line up on the right edge */
.tt2-settings-root .tt2-color-row { display: grid; grid-template-columns: 1fr 32px; align-items: center; gap: 8px; }
.tt2-settings-root .tt2-color-row label { text-align: left; }
.tt2-settings-root .tt2-color-row input[type="color"] {
  width: 32px; height: 24px; padding: 0; border: 1px solid #7d5a29; box-sizing: border-box; justify-self: end;
}
.tt2-settings-root .tt2-cue-row { flex-direction: column; align-items: flex-start; }
.tt2-settings-root .tt2-cue-label { display: flex; align-items: center; gap: 6px; }
.tt2-settings-root .tt2-cue-desc { font-size: 0.85em; opacity: 0.7; margin: 2px 0 0 22px; }
.tt2-settings-root .tt2-file-label { display: inline-block; cursor: pointer; }
.tt2-settings-root .tt2-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.tt2-settings-root .tt2-import-error { font-size: 0.9em; }
`;

/**
 * Normalize a CSS color value (hex or a named color like "green") to `#rrggbb` so it can
 * seed an `<input type="color">`, which only accepts that exact format. Falls back to
 * `fallback` if the value can't be resolved (shouldn't happen for valid Settings, but
 * color inputs must never be handed something they'll silently reject).
 * @param {string} value
 * @param {string} [fallback]
 * @returns {string}
 */
function toHexColor(value, fallback = '#000000') {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle = value;
    const normalized = ctx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

/**
 * @param {{ t: (k:string)=>string, settings: import('../core/settings.js').Settings,
 *           onChange: (patch: Partial<import('../core/settings.js').Settings>) => void }} deps
 */
export function createSettingsPanel({ t, settings, onChange }) {
  function open() {
    /** @param {keyof import('../core/settings.js').Settings['colors']} key
     *  @param {string} label  human-readable description of what this bar color means */
    const colorRow = (key, label) =>
      h('div', { className: 'tt2-row tt2-color-row' }, [
        h('label', { text: `${label}:` }),
        h('input', {
          type: 'color',
          value: toHexColor(settings.colors[key]),
          on: {
            input: (e) =>
              onChange({ colors: { ...settings.colors, [key]: /** @type {any} */ (e.target).value } }),
          },
        }),
      ]);

    /** @param {keyof import('../core/settings.js').Settings['cues']} key
     *  @param {string} label   short clear label (e.g. "Countdown beeps")
     *  @param {string} desc    one-line helper text explaining what the toggle does */
    const cueCheckbox = (key, label, desc) => {
      const input = h('input', {
        type: 'checkbox',
        on: {
          change: (e) =>
            onChange({ cues: { ...settings.cues, [key]: /** @type {any} */ (e.target).checked } }),
        },
      });
      if (settings.cues[key]) input.setAttribute('checked', 'checked');
      return h('div', { className: 'tt2-row tt2-cue-row' }, [
        h('label', { className: 'tt2-cue-label' }, [input, label]),
        h('small', { className: 'tt2-cue-desc', text: desc }),
      ]);
    };

    const volumeInput = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: String(settings.cues.volume),
      on: {
        input: (e) =>
          onChange({ cues: { ...settings.cues, volume: Number(/** @type {any} */ (e.target).value) } }),
      },
    });

    const tabTitleInput = h('input', {
      type: 'checkbox',
      on: { change: (e) => onChange({ tabTitle: /** @type {any} */ (e.target).checked }) },
    });
    if (settings.tabTitle) tabTitleInput.setAttribute('checked', 'checked');

    const importError = h('span', {
      className: 'tt2-import-error',
      style: { color: '#c0392b', display: 'none', marginLeft: '6px' },
    });

    const importFileInput = h('input', {
      type: 'file',
      className: 'tt2-file-input',
      accept: 'application/json,.json',
      on: {
        change: (e) => {
          const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const imported = importJSON(String(reader.result));
              importError.style.display = 'none';
              onChange(imported);
            } catch (err) {
              importError.textContent = `${t('import')}: ${/** @type {Error} */ (err).message}`;
              importError.style.display = '';
            }
          };
          reader.onerror = () => {
            importError.textContent = `${t('import')}: read failed`;
            importError.style.display = '';
          };
          reader.readAsText(file);
          // Allow re-importing the same file again later.
          /** @type {HTMLInputElement} */ (e.target).value = '';
        },
      },
    });

    // File inputs can't carry TW's native button look directly, so wrap a visually-hidden
    // <input type="file"> in a <label class="btn"> — clicking the label opens the file
    // picker, and the label renders exactly like a native TW button.
    const importLabel = h('label', { className: 'btn tt2-file-label' }, [t('import'), importFileInput]);

    const exportButton = h('button', {
      type: 'button',
      className: 'btn',
      text: t('export'),
      on: {
        click: () => {
          const blob = new Blob([exportJSON(settings)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = h('a', { href: url, download: 'timetool2-settings.json' });
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
      },
    });

    const content = h('div', { className: 'tt2-settings-root' }, [
      h('h3', { text: t('settings') }),

      h('h4', { text: t('colors') }),
      colorRow('waiting', 'Waiting (counting down)'),
      colorRow('ready', 'Ready (click now)'),
      colorRow('idle', 'Idle (no target set)'),

      h('h4', { text: t('cues') }),
      cueCheckbox('enabled', 'Enable cues', 'countdown beeps (3·2·1) before send — also beeps when the tab is in the background'),
      h('div', { className: 'tt2-row' }, [h('label', { text: 'volume: ' }), volumeInput]),

      h('div', { className: 'tt2-row' }, [h('label', {}, [tabTitleInput, ' tab title'])]),

      h('div', { className: 'tt2-row' }, [
        h('label', { text: `${t('language')}: ` }),
        h(
          'select',
          { on: { change: (e) => onChange({ language: /** @type {any} */ (e.target).value }) } },
          ['auto', ..._availableLangs].map((l) =>
            h('option', { value: l, ...(settings.language === l ? { selected: 'selected' } : {}) }, [l]),
          ),
        ),
      ]),

      h('h4', { text: `${t('export')} / ${t('import')}` }),
      h('div', { className: 'tt2-row' }, [exportButton, importLabel, importError]),
    ]);

    injectStyle(SETTINGS_STYLE_ID, SETTINGS_CSS);
    Renderer.mountSettings(content, { schema: settings, values: settings, onChange });

    // Prefer TW's native dialog; fall back to appending inline if unavailable.
    if (!tw.showDialog('tt2-settings', content, { title: t('settings') })) {
      document.body.appendChild(content);
    }
  }

  return { open };
}
