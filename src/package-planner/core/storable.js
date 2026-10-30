// package-planner/core/storable.js — how many complete packages the academy villages
// can store right now, from what they hold (no transports). Pure.

/** @typedef {import('./parse-prod.js').ProdVillage} ProdVillage */
/** @typedef {import('./world-config.js').Cost} Cost */

/**
 * @param {ProdVillage[]} villages
 * @param {Map<number, number>} academyLevels  village id -> academy level
 * @param {Cost} cost
 */
export function storableNow(villages, academyLevels, cost) {
  let packages = 0;
  let academies = 0;
  let notInBuildings = 0;
  for (const v of villages) {
    const level = academyLevels.get(v.id);
    if (level == null) {
      notInBuildings += 1;
      continue;
    }
    if (level < 1) continue;
    academies += 1;
    packages += Math.floor(Math.min(v.wood / cost.wood, v.stone / cost.stone, v.iron / cost.iron));
  }
  return { packages, academies, villages: villages.length, notInBuildings };
}
