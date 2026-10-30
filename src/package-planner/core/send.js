// @ts-check
// package-planner/core/send.js — what one click sends (DESIGN-package-planner.md §7). Pure.
// One click = one request: Request resources fills one target from all its sources; the
// fallback (market "send") is one request per transport. Never one request per merchant.

/** @typedef {import('./solver.js').Transport} Transport */

const KEYS = /** @type {const} */ (['wood', 'stone', 'iron']);

/**
 * Body of the market's Request resources action (`ajaxaction=call`, posted with
 * `village=<target>`): `resource[<source>][wood|stone|iron]` for every planned source, the
 * keys the game's own form and approved scripts send; `target_id: 0` as in that form.
 * @param {Transport[]} transports  the whole plan; only those into `target` are used
 * @param {number} target
 * @returns {Record<string, number>}
 */
export function requestPayload(transports, target) {
  /** @type {Record<string, number>} */
  const body = { target_id: 0 };
  for (const t of transports) {
    if (t.to !== target) continue;
    KEYS.forEach((k, i) => { body[`resource[${t.from}][${k}]`] = t.res[i]; });
  }
  return body;
}

/**
 * Body of the market's send action (`ajaxaction=map_send`, posted with
 * `village=<source>`), the fallback: one transport per click.
 * @param {Transport} t
 */
export const transportPayload = (t) => ({ target_id: t.to, wood: t.res[0], stone: t.res[1], iron: t.res[2] });

/** @typedef {{ id: number, name: string, x: number, y: number }} Place */
/** @typedef {{ key: string, from: Place, to: Place, t: Transport }} Row */

/**
 * The fallback list: one row per transport into every target not sent yet, in card order.
 * @param {Transport[]} transports
 * @param {number[]} targets  card order
 * @param {Set<number>} sent  targets already requested
 * @param {Map<number, { name: string, x: number, y: number }>} places
 * @returns {Row[]}
 */
export function fallbackRows(transports, targets, sent, places) {
  const place = (/** @type {number} */ id) => {
    const p = places.get(id);
    return { id, name: p?.name ?? `#${id}`, x: p?.x ?? 0, y: p?.y ?? 0 };
  };
  return targets
    .filter((id) => !sent.has(id))
    .flatMap((id) => transports.filter((t) => t.to === id))
    .map((t) => ({ key: `${t.from}-${t.to}`, from: place(t.from), to: place(t.to), t }));
}

/**
 * @typedef {{ ok: true, message: string }
 *   | { ok: false, reason: 'game' | 'botProtect' | 'timeout' | 'unavailable', message: string }} Outcome
 */

/**
 * How a request ended, read defensively from TribalWars.post's callbacks: onSuccess gets
 * `json.response`; onError gets the game's message, nothing (bot protection: TW shows its
 * captcha) or the xhr (HTTP error). 'timeout' = no callback at all (TW calls none on 429/503).
 * @param {'success' | 'error' | 'timeout' | 'unavailable'} kind
 * @param {any} [arg]
 * @returns {Outcome}
 */
export function outcome(kind, arg) {
  if (kind === 'success') {
    const m = arg?.success ?? arg?.message;
    return { ok: true, message: typeof m === 'string' ? m : '' };
  }
  if (kind !== 'error') return { ok: false, reason: kind, message: '' };
  if (arg == null) return { ok: false, reason: 'botProtect', message: '' };
  const message = Array.isArray(arg) ? arg.join(' ') : typeof arg === 'object' ? `HTTP ${arg.status}` : String(arg);
  return { ok: false, reason: 'game', message };
}
