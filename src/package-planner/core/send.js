// @ts-check
// package-planner/core/send.js — what one click sends (DESIGN-package-planner.md §7). Pure.
// One click = one request: Request resources fills one target from all its sources; the
// fallback (market "send") is one request per transport. Never one request per merchant.

import { RES } from './world-config.js';

/** @typedef {import('./solver.js').Transport} Transport */

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
    RES.forEach((k, i) => { body[`resource[${t.from}][${k}]`] = t.res[i]; });
  }
  return body;
}

/**
 * Body of the market's send action (`ajaxaction=map_send`, posted with
 * `village=<source>`), the fallback: one transport per click.
 * @param {Transport} t
 */
export const transportPayload = (t) => ({ target_id: t.to, wood: t.res[0], stone: t.res[1], iron: t.res[2] });

/**
 * Check one card against the game's own numbers before it is sent: the latest
 * `resources_left`/`traders_free` earlier answers reported per source (`left`). A source
 * short on resources or merchants sends what it has, in whole merchant loads (the excess
 * comes off its largest share first: small amounts are the package-completing top-ups);
 * less than one load drops it. No source left = skip the card. The user's limits hold here
 * too: a source may send what the game reports above its reserve, with the merchants it
 * reports minus the ones to keep home.
 * @param {Transport[]} transports  the whole plan (or at least the target's transports)
 * @param {number} target
 * @param {Map<number, Left>} left
 * @param {{ cost: number[], packages: number, carry?: number, reserve?: number[], keepMerchants?: number }} o
 * @returns {{ transports: Transport[], short: number[], mayShort: number }}
 *   mayShort = packages that may no longer complete (the most any one resource's cut covers)
 */
export function checkCard(transports, target, left, { cost, packages, carry = 1000, reserve = [0, 0, 0], keepMerchants = 0 }) {
  /** @type {number[]} */
  const short = [];
  const cut = [0, 0, 0];
  const out = transports.filter((t) => t.to === target).flatMap((t) => {
    const l = left.get(t.from);
    if (!l) return [t];
    const a = t.res.map((n, i) => Math.min(n, Math.max(0, l.res[i] - reserve[i])));
    const m = Math.min(t.merchants, Math.max(0, l.merchants - keepMerchants));
    if (m === t.merchants && a.every((n, i) => n === t.res[i])) return [t];
    short.push(t.from);
    const total = a[0] + a[1] + a[2];
    const loads = Math.floor(Math.min(total, m * carry) / carry);
    let excess = total - loads * carry;
    for (const i of [0, 1, 2].sort((x, y) => a[y] - a[x])) {
      const d = Math.min(excess, a[i]);
      a[i] -= d;
      excess -= d;
    }
    if (!loads) a.fill(0);
    a.forEach((n, i) => { cut[i] += t.res[i] - n; });
    return loads ? [{ ...t, res: /** @type {[number, number, number]} */ (a), merchants: loads }] : [];
  });
  // A package needs all three resources: the resource cut the most packages' worth decides.
  const mayShort = Math.min(packages, Math.max(...cut.map((n, i) => (cost[i] ? Math.ceil(n / cost[i]) : 0))));
  return { transports: out, short, mayShort };
}

/** Amounts + merchants of one source. @typedef {{ res: number[], merchants: number }} Load */
/**
 * @typedef {{ action: string, target: number, reason: string, message: string, raw: unknown,
 *   sources: { id: number, sent: Load | null, planned: Load | null, overview: Load | null, reported: Load | null }[] }} Failure
 */

/**
 * The evidence of a failed send, for "Copy debug info": the request (per source what was
 * sent, and the plan's amounts when the pre-check trimmed them; a source it dropped is
 * listed as sent none), the game's answer, and per source what the overview snapshot
 * showed and what the game last reported. Ids and amounts only (no names). `snapshot` and
 * `left` are what the popup knew at click time.
 * @param {{ action: string, target: number, planned: Transport[], sent: Transport[], outcome: Outcome,
 *   snapshot: Map<number, { wood?: number, stone?: number, iron?: number, merchantsAvailable?: number }>, left: Map<number, Left> }} r
 * @returns {Failure}
 */
export function failureRecord({ action, target, planned, sent, outcome: o, snapshot, left }) {
  const load = (/** @type {Transport} */ t) => ({ res: t.res, merchants: t.merchants });
  return {
    action, target, reason: o.ok ? '' : o.reason, message: o.message, raw: o.ok ? null : o.raw,
    sources: [...new Set([...planned, ...sent].map((t) => t.from))].map((id) => {
      const t = sent.find((x) => x.from === id);
      const p = planned.find((x) => x.from === id);
      const v = snapshot.get(id);
      const l = left.get(id);
      return {
        id,
        sent: t ? load(t) : null,
        planned: p && (!t || p.merchants !== t.merchants || p.res.some((n, i) => n !== t.res[i])) ? load(p) : null,
        overview: v ? { res: RES.map((k) => num(v[k])), merchants: num(v.merchantsAvailable) } : null,
        reported: l ? { res: l.res, merchants: l.merchants } : null,
      };
    }),
  };
}

/** @typedef {{ id: number, name: string, x: number, y: number }} Place */
/** @typedef {{ key: string, from: Place, to: Place, t: Transport }} Row */

/**
 * The fallback list: one row per transport into every target not done yet, in card order,
 * each target's transports checked like a card (checkCard) against what the game last
 * reported, within the user's limits. The fallback's own answers are not read (shape
 * unverified), so the rows are checked once, when the list is built.
 * @param {Transport[]} transports
 * @param {number[]} targets  card order
 * @param {Set<number>} done  targets requested or skipped
 * @param {Map<number, { name: string, x: number, y: number }>} places
 * @param {Map<number, Left>} [left]
 * @param {{ reserve?: number[], keepMerchants?: number }} [limits]
 * @returns {Row[]}
 */
export function fallbackRows(transports, targets, done, places, left = new Map(), limits = {}) {
  const place = (/** @type {number} */ id) => {
    const p = places.get(id);
    return { id, name: p?.name ?? `#${id}`, x: p?.x ?? 0, y: p?.y ?? 0 };
  };
  return targets
    .filter((id) => !done.has(id))
    .flatMap((id) => checkCard(transports, id, left, { ...limits, cost: [0, 0, 0], packages: 0 }).transports)
    .map((t) => ({ key: `${t.from}-${t.to}`, from: place(t.from), to: place(t.to), t }));
}

/** What the game reported for one source after a send. @typedef {{ id: number, res: number[], merchants: number }} Left */

/**
 * @typedef {{ ok: true, message: string, left: Left[] }
 *   | { ok: false, reason: 'game' | 'botProtect' | 'timeout' | 'unavailable', message: string, raw: unknown }} Outcome
 */

const num = (/** @type {unknown} */ x) => Number(x) || 0;

/**
 * How a request ended, read defensively from TribalWars.post's callbacks: onSuccess gets
 * `json.response`; onError gets the game's message, nothing (bot protection: TW shows its
 * captcha) or the xhr (HTTP error). 'timeout' = no callback at all (TW calls none on 429/503).
 * Success keeps `transport_info[]` (verified on `call`: per source `village_id`,
 * `resources_left`, `traders_free`) as `left`; a failure keeps the raw answer (xhr: status only).
 * @param {'success' | 'error' | 'timeout' | 'unavailable'} kind
 * @param {any} [arg]
 * @returns {Outcome}
 */
export function outcome(kind, arg) {
  if (kind === 'success') {
    const m = arg?.success ?? arg?.message;
    const info = Array.isArray(arg?.transport_info) ? arg.transport_info : [];
    const left = info.filter((i) => num(i?.village_id) > 0).map((i) => ({
      id: num(i.village_id), res: RES.map((k) => num(i.resources_left?.[k])), merchants: num(i.traders_free),
    }));
    return { ok: true, message: typeof m === 'string' ? m : '', left };
  }
  if (kind !== 'error') return { ok: false, reason: kind, message: '', raw: null };
  if (arg == null) return { ok: false, reason: 'botProtect', message: '', raw: null };
  const message = Array.isArray(arg) ? arg.join(' ') : typeof arg === 'object' ? `HTTP ${arg.status}` : String(arg);
  return { ok: false, reason: 'game', message, raw: typeof arg === 'object' && !Array.isArray(arg) ? { status: arg.status } : arg };
}
