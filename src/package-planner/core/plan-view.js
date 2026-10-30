// @ts-check
// package-planner/core/plan-view.js — a solver plan -> what the popup shows (layout B,
// DESIGN-package-planner.md §1): the summary line and one card per target. Pure.

/** @typedef {import('./solver.js').Plan} Plan */
/** @typedef {{ name: string, x: number, y: number }} Place */
/**
 * @typedef {{
 *   id: number, name: string, x: number, y: number, packages: number,
 *   res: { wood: number, stone: number, iron: number }, sources: number, merchants: number,
 *   lastArrivalSeconds: number, farthest: { id: number } & Place,
 * }} Card
 */

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** Seconds -> "h:mm:ss", as the market page shows a duration. @param {number} s */
export const hms = (s) => `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}`;

/** Seconds -> "h:mm" (seconds cut off, so it reads like the game's h:mm:ss). @param {number} s */
export const hm = (s) => hms(s).slice(0, -3);

/** "33140" -> "33.140", the way TW prints numbers. @param {number} n */
export const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * @param {Plan} plan
 * @param {Map<number, Place>} places  village id -> name + coords
 * @param {number} [storableNow]  packages the academies can store already, without transports
 *   (the solver total includes them)
 * @returns {{ summary: { packages: number, storableNow: number, fromTransports: number,
 *   lastArrivalSeconds: number, cards: number, sent: number }, cards: Card[] }}
 */
export function planView(plan, places, storableNow = 0) {
  const place = (/** @type {number} */ id) => places.get(id) ?? { name: `#${id}`, x: 0, y: 0 };
  const packages = new Map(plan.perAcademy.map((p) => [p.id, p.packages]));
  /** @type {Map<number, Card>} */
  const cards = new Map();
  for (const t of plan.transports) {
    let card = cards.get(t.to);
    if (!card) {
      const { name, x, y } = place(t.to);
      card = {
        id: t.to, name, x, y, packages: packages.get(t.to) ?? 0,
        res: { wood: 0, stone: 0, iron: 0 }, sources: 0, merchants: 0,
        lastArrivalSeconds: -1, farthest: { id: t.from, ...place(t.from) },
      };
      cards.set(t.to, card);
    }
    card.res.wood += t.res[0];
    card.res.stone += t.res[1];
    card.res.iron += t.res[2];
    card.sources += 1;
    card.merchants += t.merchants;
    if (t.seconds > card.lastArrivalSeconds) {
      card.lastArrivalSeconds = t.seconds;
      const { name, x, y } = place(t.from);
      card.farthest = { id: t.from, name, x, y };
    }
  }
  const list = [...cards.values()].sort((a, b) => a.lastArrivalSeconds - b.lastArrivalSeconds || a.id - b.id);
  return {
    summary: {
      packages: plan.packages,
      storableNow,
      fromTransports: Math.max(0, plan.packages - storableNow),
      lastArrivalSeconds: list.reduce((m, c) => Math.max(m, c.lastArrivalSeconds), 0),
      cards: list.length,
      sent: 0,
    },
    cards: list,
  };
}
