// @ts-check
// package-planner/core/model.js — what the overviews and the world config read becomes the
// solver's input (DESIGN-package-planner.md §5 "Model"). Pure.

/** @typedef {import('./parse-prod.js').ProdVillage} ProdVillage */
/** @typedef {import('./solver.js').Village} Village */

/**
 * @param {{
 *   villages: ProdVillage[],
 *   academyLevels: Map<number, number>,   village id -> academy level (Buildings overview)
 *   incoming?: Map<number, [number, number, number]>,  village id -> resources on the way (Trader overview)
 *   config: { packageCost: { wood: number, stone: number, iron: number }, speed: number | null },
 * }} input
 */
export function solverInput({ villages, academyLevels, incoming, config }) {
  /** @type {string[]} */
  const warnings = [];
  const speed = config.speed && config.speed > 0 ? config.speed : null;
  if (!speed) warnings.push('config: world speed not found, travel times assume speed 1');
  const c = config.packageCost;
  return {
    world: {
      villages: villages.map((v) => /** @type {Village} */ ({
        id: v.id,
        x: v.x,
        y: v.y,
        res: [v.wood, v.stone, v.iron],
        storage: v.storageMax,
        merchants: v.merchantsAvailable,
        academy: (academyLevels.get(v.id) ?? 0) >= 1,
        // On the way = already there (the solver caps it by the warehouse), spec §4.
        ...(incoming?.has(v.id) ? { inflight: incoming.get(v.id) } : {}),
      })),
    },
    options: { cost: /** @type {[number, number, number]} */ ([c.wood, c.stone, c.iron]), worldSpeed: speed ?? 1 },
    warnings,
  };
}
