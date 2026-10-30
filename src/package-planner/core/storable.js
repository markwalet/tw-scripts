// package-planner/core/storable.js — how many complete packages the academy villages
// can store without new transports: what they hold plus what is already on the way
// (capped by the warehouse, as the solver counts it). Pure.

/** @typedef {import('./parse-prod.js').ProdVillage} ProdVillage */
/** @typedef {import('./world-config.js').Cost} Cost */

/**
 * @param {ProdVillage[]} villages
 * @param {Map<number, number>} academyLevels  village id -> academy level
 * @param {Cost} cost
 * @param {Set<number> | null} [receivers]  receiver group members (null = all)
 * @param {Map<number, [number, number, number]>} [incoming]  village id -> on the way
 */
export function storableNow(villages, academyLevels, cost, receivers, incoming) {
  let packages = 0;
  let academies = 0;
  let notInBuildings = 0;
  for (const v of villages) {
    const level = academyLevels.get(v.id);
    if (level == null) {
      notInBuildings += 1;
      continue;
    }
    if (level < 1 || (receivers && !receivers.has(v.id))) continue;
    academies += 1;
    const on = incoming?.get(v.id) || [0, 0, 0];
    const has = (/** @type {number} */ n, /** @type {number} */ k) => Math.min(n + on[k], v.storageMax ?? Infinity);
    packages += Math.floor(Math.min(has(v.wood, 0) / cost.wood, has(v.stone, 1) / cost.stone, has(v.iron, 2) / cost.iron));
  }
  return { packages, academies, villages: villages.length, notInBuildings };
}
