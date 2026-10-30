// @ts-check
// package-planner/core/settings.js — the planner's per-world settings (DESIGN-package-
// planner.md §6): schema + migration on the shared store, the solver options they become,
// the edit form's parsing and the collapsed one-line summary. Pure (storage is injected).

import { createSettingsStore } from '../../shared/settings-store.js';

/**
 * @typedef {{
 *   maxTravelSeconds: number | null,   null = no limit
 *   reserve: [number, number, number], wood, clay, iron kept in every sender
 *   keepMerchants: number,
 *   bufferPct: number,                 warehouse buffer (on top of the production margin)
 * }} Settings
 */

/** @returns {Settings} */
const defaults = () => ({ maxTravelSeconds: null, reserve: [0, 0, 0], keepMerchants: 0, bufferPct: 2 });

/** A non-negative finite number, else the fallback. @param {unknown} v @param {number} fallback */
const amount = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * Any stored (or imported) object -> valid v1 settings: valid fields are kept, broken or
 * missing ones get their default. Later versions add their fields here (#10 groups, #11
 * noble target) and keep reading the old ones.
 * @param {any} raw @param {Settings} base
 * @returns {Settings}
 */
function migrate(raw, base) {
  const max = amount(raw.maxTravelSeconds, 0);
  const reserve = Array.isArray(raw.reserve) ? raw.reserve : [];
  return {
    ...base,
    maxTravelSeconds: max > 0 ? max : null,
    reserve: /** @type {Settings['reserve']} */ (base.reserve.map((d, k) => Math.floor(amount(reserve[k], d)))),
    keepMerchants: Math.floor(amount(raw.keepMerchants, base.keepMerchants)),
    bufferPct: amount(raw.bufferPct, base.bufferPct),
  };
}

export const settingsStore = createSettingsStore({ name: 'pp_settings', version: 1, defaults, migrate });

/**
 * The solver options these settings set (merged over the ones from the world config).
 * @param {Settings} s
 */
export const solverOptions = (s) => ({
  maxTravelSeconds: s.maxTravelSeconds ?? Infinity,
  reserve: /** @type {Settings['reserve']} */ ([...s.reserve]),
  keepMerchants: s.keepMerchants,
  bufferPct: s.bufferPct,
});
