// core/settings.js — timetool2's per-world settings schema (§8). The load/save/migrate/
// export/import plumbing is the shared store (shared/settings-store.js); this file only
// holds the schema: defaults + how older stored shapes map onto the current one.

import { createSettingsStore } from '../shared/settings-store.js';

/**
 * @typedef {Object} Settings
 * @property {number} version
 * @property {{ waiting:string, ready:string, idle:string }} colors
 * @property {{ enabled:boolean, volume:number }} cues
 * @property {boolean} tabTitle
 * @property {'auto'|'nl'|'en'|'de'} language
 * @property {boolean} remember
 */

const store = createSettingsStore({
  name: 'timetool2settings', // key `${world}timetool2settings` — unchanged, keeps stored data
  version: 1,
  defaults: () => ({
    colors: { waiting: '#ff9933', ready: 'green', idle: 'green' },
    // Single cue toggle: on → countdown beeps (always background-capable). volume 0..1.
    cues: { enabled: true, volume: 0.5 },
    tabTitle: true,
    /** @type {'auto'|'nl'|'en'|'de'} */
    language: 'auto',
    remember: false,
  }),
  // v0 (original timetool) had no version and only snipe/remember keys — start clean
  // but preserve `remember` if present. Deep-merge known groups defensively.
  migrate: (raw, base) => {
    const rawCues = raw.cues || {};
    return {
      ...base,
      ...raw,
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
  },
});

export const { defaults, migrate, load, save, exportJSON, importJSON } = store;
