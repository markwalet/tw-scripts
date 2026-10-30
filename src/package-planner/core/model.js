// @ts-check
// package-planner/core/model.js — what the overviews and the world config read becomes the
// solver's input (DESIGN-package-planner.md §5 "Model"). Pure.

/** @typedef {import('./parse-prod.js').ProdVillage} ProdVillage */
/** @typedef {import('./solver.js').Village} Village */
/** @typedef {[number, number, number]} Res */

/** Base production per hour when the world config has none (the classic value). */
const CLASSIC_BASE_PRODUCTION = 30;

/**
 * Resources per hour of one mine: base × 1.163118^(level − 1) × world speed (matches the
 * game's wood_prod on a real enc1 village). Level 0 counts as level 1 (safe side).
 * @param {number} level @param {number} base @param {number} speed
 */
const perHour = (level, base, speed) => base * 1.163118 ** (Math.max(1, level) - 1) * speed;

/**
 * @param {{
 *   villages: ProdVillage[],
 *   academyLevels: Map<number, number>,   village id -> academy level (Buildings overview)
 *   mineLevels?: Map<number, Res>,        village id -> timber camp, clay pit, iron mine level
 *   incoming?: Map<number, Res>,          village id -> resources on the way (Trader overview)
 *   config: { packageCost: { wood: number, stone: number, iron: number }, speed: number | null, baseProduction?: number | null },
 * }} input
 */
export function solverInput({ villages, academyLevels, mineLevels = new Map(), incoming, config }) {
  /** @type {string[]} */
  const warnings = [];
  const speed = config.speed && config.speed > 0 ? config.speed : null;
  if (!speed) warnings.push('config: world speed not found, travel times assume speed 1');
  const c = config.packageCost;
  const base = config.baseProduction && config.baseProduction > 0 ? config.baseProduction : null;
  let noMines = 0;
  let needBase = false;

  const out = villages.map((v) => {
    /** @type {Village} */
    const sv = {
      id: v.id,
      x: v.x,
      y: v.y,
      res: [v.wood, v.stone, v.iron],
      storage: v.storageMax,
      merchants: v.merchantsAvailable,
      academy: (academyLevels.get(v.id) ?? 0) >= 1,
    };
    // On the way = already there (the solver caps it by the warehouse), spec §4.
    if (incoming?.has(v.id)) sv.inflight = incoming.get(v.id);
    // Production only matters where resources arrive: the warehouse margin (§5).
    if (sv.academy) {
      const mines = mineLevels.get(v.id);
      if (!mines) noMines += 1;
      else {
        needBase = true;
        sv.production = /** @type {Res} */ (mines.map((l) => perHour(l, base ?? CLASSIC_BASE_PRODUCTION, speed ?? 1)));
      }
    }
    return sv;
  });
  if (needBase && !base) warnings.push(`config: base production not found, warehouse margin assumes ${CLASSIC_BASE_PRODUCTION}/hour`);
  if (noMines) warnings.push(`buildings: ${noMines} academies without mine levels, no production margin for them`);

  return {
    world: { villages: out },
    options: { cost: /** @type {Res} */ ([c.wood, c.stone, c.iron]), worldSpeed: speed ?? 1 },
    warnings,
  };
}
