// @ts-check
// package-planner/core/settings.js — the planner's per-world settings (DESIGN-package-
// planner.md §6): schema + migration on the shared store, the solver options they become,
// the edit form's parsing and the collapsed one-line summary. Pure (storage is injected).

import { createSettingsStore } from '../../shared/settings-store.js';
import { fill } from './i18n.js';
import { fmt, hm, hms } from './plan-view.js';

/**
 * @typedef {{
 *   maxTravelSeconds: number | null,   null = no limit
 *   reserve: [number, number, number], wood, clay, iron kept in every sender
 *   keepMerchants: number,
 *   bufferPct: number,                 warehouse buffer (on top of the production margin)
 *   nobles: number | null,             collect for this many new nobles; null = as many packages as possible
 * }} Settings
 */

/** @returns {Settings} */
const defaults = () => ({ maxTravelSeconds: null, reserve: [0, 0, 0], keepMerchants: 0, bufferPct: 2, nobles: null });

/** A non-negative finite number, else the fallback. @param {unknown} v @param {number} fallback */
const amount = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * Any stored (or imported) object -> valid v1 settings: valid fields are kept, broken or
 * missing ones get their default. Later versions add their fields here (#10 groups) and
 * keep reading the old ones.
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
    nobles: Math.floor(amount(raw.nobles, 0)) || null,
  };
}

export const settingsStore = createSettingsStore({ name: 'pp_settings', version: 1, defaults, migrate });

/**
 * The solver options these settings set (merged over the ones from the world config).
 * @param {Settings} s @param {number} [maxPackages]  noble target: packages still missing
 */
export const solverOptions = (s, maxPackages = Infinity) => ({
  maxPackages,
  maxTravelSeconds: s.maxTravelSeconds ?? Infinity,
  reserve: /** @type {Settings['reserve']} */ ([...s.reserve]),
  keepMerchants: s.keepMerchants,
  bufferPct: s.bufferPct,
});

/** @typedef {{ maxTravel: string, wood: string, stone: string, iron: string, keepMerchants: string, bufferPct: string, nobles: string }} FormFields */

/** "3:00" -> 10800 s; "" -> null; h, h:mm or h:mm:ss; anything else -> undefined. @param {string} v */
function parseDuration(v) {
  if (!v) return null;
  const m = /^(\d+)(?::([0-5]\d))?(?::([0-5]\d))?$/.exec(v);
  if (!m) return undefined;
  const seconds = +m[1] * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
  return seconds > 0 ? seconds : null;
}

/** "10.000" -> 10000 (dots, commas and spaces as thousands separators); "" -> 0. @param {string} v */
function parseCount(v) {
  const digits = v.replace(/[.,\s]/g, '');
  return digits === '' ? 0 : /^\d+$/.test(digits) ? +digits : undefined;
}

/** "2,5" -> 2.5; "" -> 0. @param {string} v */
function parsePct(v) {
  const s = v.replace(',', '.');
  return s === '' ? 0 : /^\d+(\.\d+)?$/.test(s) ? +s : undefined;
}

/**
 * The edit form's inputs -> settings. A field that does not parse keeps its current value
 * and is listed in `invalid` (the popup marks it).
 * @template {Settings} S
 * @param {FormFields} f @param {S} current
 * @returns {{ settings: S, invalid: (keyof FormFields)[] }}
 */
export function readForm(f, current) {
  /** @type {(keyof FormFields)[]} */
  const invalid = [];
  /** @template T @param {keyof FormFields} key @param {T | undefined} v @param {T} keep @returns {T} */
  const take = (key, v, keep) => {
    if (v !== undefined) return v;
    invalid.push(key);
    return keep;
  };
  const maxTravelSeconds = take('maxTravel', parseDuration(f.maxTravel.trim()), current.maxTravelSeconds);
  const reserve = /** @type {const} */ (['wood', 'stone', 'iron']).map((k, i) => take(k, parseCount(f[k].trim()), current.reserve[i]));
  const keepMerchants = take('keepMerchants', parseCount(f.keepMerchants.trim()), current.keepMerchants);
  const bufferPct = take('bufferPct', parsePct(f.bufferPct.trim()), current.bufferPct);
  const nobles = take('nobles', parseCount(f.nobles.trim()), current.nobles) || null;
  return {
    settings: { ...current, maxTravelSeconds, reserve: /** @type {Settings['reserve']} */ (reserve), keepMerchants, bufferPct, nobles },
    invalid,
  };
}

/** Seconds -> the form's h:mm (h:mm:ss when it has seconds). @param {number} s */
const duration = (s) => (s % 60 ? hms(s) : hm(s));

/** @param {Settings} s @returns {FormFields} */
export const formFields = (s) => ({
  maxTravel: s.maxTravelSeconds == null ? '' : duration(s.maxTravelSeconds),
  wood: String(s.reserve[0]),
  stone: String(s.reserve[1]),
  iron: String(s.reserve[2]),
  keepMerchants: String(s.keepMerchants),
  bufferPct: String(s.bufferPct),
  nobles: s.nobles ? String(s.nobles) : '',
});

/**
 * The collapsed settings line: "Max 3:00 · reserve 0/0/0 · keep 0 merchants · buffer 2%".
 * Room for the group filters (#10).
 * @param {Settings} s @param {(key: string) => string} t
 */
export function settingsLine(s, t) {
  const [wood, stone, iron] = s.reserve.map(fmt);
  return [
    s.maxTravelSeconds == null ? t('noTravelLimit') : fill(t('settingMax'), { time: duration(s.maxTravelSeconds) }),
    fill(t('settingReserve'), { wood, stone, iron }),
    s.keepMerchants === 1 ? t('settingKeepOne') : fill(t('settingKeep'), { n: fmt(s.keepMerchants) }),
    fill(t('settingBuffer'), { pct: s.bufferPct }),
    ...(s.nobles ? [s.nobles === 1 ? t('settingNoblesOne') : fill(t('settingNobles'), { n: s.nobles })] : []),
  ].join(' · ');
}
