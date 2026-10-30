// shared/settings-store.js — generic per-world settings store: versioned defaults,
// migration, load/save, export/import. Each script supplies its own schema; this module
// owns the plumbing. Pure-ish: storage is injected (pass a Map-like in tests).

/**
 * @template {object} S
 * @param {{
 *   name: string,                                   // storage key suffix: `${world}${name}`
 *   version: number,                                // current schema version
 *   defaults: () => S,                              // fresh defaults (without `version`)
 *   migrate?: (raw: any, base: S) => S,             // older/partial stored object -> S
 * }} schema
 */
export function createSettingsStore({ name, version, defaults: makeDefaults, migrate: schemaMigrate }) {
  const key = (world) => `${world}${name}`;

  /** @returns {S & { version: number }} */
  function defaults() {
    return { ...makeDefaults(), version };
  }

  /**
   * Bring any stored/imported value onto the current schema. Non-objects -> defaults.
   * Without a schema migrate, known keys are shallow-merged over the defaults.
   * @param {any} raw
   * @returns {S & { version: number }}
   */
  function migrate(raw) {
    const base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    const merged = schemaMigrate ? schemaMigrate(raw, base) : { ...base, ...raw };
    return { ...merged, version };
  }

  /**
   * @param {string} world
   * @param {Pick<Storage, 'getItem'>} [storage]
   */
  function load(world, storage = localStorage) {
    try {
      const raw = storage.getItem(key(world));
      return migrate(raw ? JSON.parse(raw) : null);
    } catch {
      return defaults();
    }
  }

  /**
   * @param {string} world
   * @param {S} settings
   * @param {Pick<Storage, 'setItem'>} [storage]
   */
  function save(world, settings, storage = localStorage) {
    try {
      storage.setItem(key(world), JSON.stringify(settings));
    } catch (err) {
      console.error(`[${name}] settings save failed`, err);
    }
  }

  /**
   * Serialize for export (pretty-printed JSON). Pure.
   * @param {S} settings
   */
  function exportJSON(settings) {
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Parse an exported (or hand-edited) JSON string, normalized through `migrate()`.
   * Throws on malformed JSON (does NOT swallow it) — callers catch and surface it.
   * @param {string} str
   * @throws {SyntaxError}
   */
  function importJSON(str) {
    return migrate(JSON.parse(str));
  }

  return { defaults, migrate, load, save, exportJSON, importJSON };
}
