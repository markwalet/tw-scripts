// core/settings.js — per-world settings: schema, defaults, load/save, migration (§8).
// Pure-ish: storage is injected so this stays testable (pass a Map-like in tests).

/**
 * @typedef {Object} Settings
 * @property {number} version
 * @property {{ waiting:string, ready:string, idle:string }} colors
 * @property {{ enabled:boolean, volume:number }} cues
 * @property {boolean} tabTitle
 * @property {'auto'|'nl'|'en'|'de'} language
 * @property {boolean} remember
 */

const SCHEMA_VERSION = 1;

/** @returns {Settings} */
export function defaults() {
  return {
    version: SCHEMA_VERSION,
    colors: { waiting: '#ff9933', ready: 'green', idle: 'green' },
    // Single cue toggle: on → countdown beeps (always background-capable). volume 0..1.
    cues: { enabled: true, volume: 0.5 },
    tabTitle: true,
    language: 'auto',
    remember: false,
  };
}

/**
 * Migrate an older stored object to the current schema. Extend as versions grow.
 * @param {any} raw
 * @returns {Settings}
 */
export function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  // v0 (original timetool) had no version and only snipe/remember keys — start clean
  // but preserve `remember` if present. Deep-merge known groups defensively.
  const rawCues = raw.cues || {};
  return {
    ...base,
    ...raw,
    version: SCHEMA_VERSION,
    colors: { ...base.colors, ...(raw.colors || {}) },
    // Normalize cues to the current {enabled, volume} shape; map the old `master` flag
    // onto `enabled` so pre-existing stored settings keep their on/off state.
    cues: {
      enabled:
        typeof rawCues.enabled === 'boolean'
          ? rawCues.enabled
          : typeof rawCues.master === 'boolean'
            ? rawCues.master
            : base.cues.enabled,
      volume: typeof rawCues.volume === 'number' ? rawCues.volume : base.cues.volume,
    },
    remember: typeof raw.remember === 'boolean' ? raw.remember : base.remember,
  };
}

const KEY = (world) => `${world}timetool2settings`;

/**
 * @param {string} world
 * @param {Storage} [storage]
 * @returns {Settings}
 */
export function load(world, storage = localStorage) {
  try {
    const raw = storage.getItem(KEY(world));
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return defaults();
  }
}

/**
 * @param {string} world
 * @param {Settings} settings
 * @param {Storage} [storage]
 */
export function save(world, settings, storage = localStorage) {
  try {
    storage.setItem(KEY(world), JSON.stringify(settings));
  } catch (err) {
    console.error('[timetool2] settings save failed', err);
  }
}

/**
 * Serialize settings for export (e.g. a downloadable .json file). Pure — no DOM/globals.
 * @param {Settings} settings
 * @returns {string} pretty-printed JSON
 */
export function exportJSON(settings) {
  return JSON.stringify(settings, null, 2);
}

/**
 * Parse a previously-exported (or hand-edited) JSON string back into a valid Settings
 * object. Always runs the result through `migrate()`, so missing/extra/old-shaped keys
 * are normalized against current defaults exactly like a stored value would be.
 *
 * Contract: throws on malformed JSON (whatever `JSON.parse` throws, typically a
 * `SyntaxError`) — it does NOT swallow parse errors into a null/default return. Callers
 * (e.g. the settings panel's import control) must wrap this in try/catch and surface the
 * error; never let it escape uncaught into the UI.
 * @param {string} str
 * @returns {Settings}
 * @throws {SyntaxError} if `str` is not valid JSON
 */
export function importJSON(str) {
  const raw = JSON.parse(str);
  return migrate(raw);
}
