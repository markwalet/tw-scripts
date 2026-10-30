// package-planner/core/world-config.js — the public world config
// (`/interface.php?func=get_config`, XML) -> what the planner needs. Pure.
// Verified on real enc1 (classic, snob.gold=0) and enc2 (coins, gold=1) responses.
// A closed/redirected world answers with an HTML redirect page instead: we then fall
// back to the default package cost with a visible warning (DESIGN-package-planner.md §4).

import { parseHtml, find, childElements, textOf } from '../../shared/html.js';

/** @typedef {{ wood: number, stone: number, iron: number }} Cost */

/** The three market resources, in TW's order ("stone" is clay). */
export const RES = /** @type {const} */ (['wood', 'stone', 'iron']);

/** Used only when the config can't be read; always surfaced as a warning. */
export const DEFAULT_PACKAGE_COST = Object.freeze({ wood: 28000, stone: 30000, iron: 25000 });

/** @param {import('../../shared/html.js').El | null | undefined} parent @param {string} tag */
function childNumber(parent, tag) {
  const el = parent && childElements(parent, tag)[0];
  const n = el ? parseFloat(textOf(el).trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} xml
 * @returns {{ gold: boolean | null, packageCost: Cost, speed: number | null, unitSpeed: number | null, baseProduction: number | null, warnings: string[] }}
 */
export function parseWorldConfig(xml) {
  const config = find(parseHtml(xml), (e) => e.tag === 'config');
  const snob = config && childElements(config, 'snob')[0];
  /** @type {string[]} */
  const warnings = [];

  const goldFlag = childNumber(snob, 'gold');
  const wood = childNumber(snob, 'coin_wood');
  const stone = childNumber(snob, 'coin_stone');
  const iron = childNumber(snob, 'coin_iron');

  let packageCost = { ...DEFAULT_PACKAGE_COST };
  if (wood && stone && iron) packageCost = { wood, stone, iron };
  else {
    const d = DEFAULT_PACKAGE_COST;
    warnings.push(`config: package cost not found, using ${d.wood}/${d.stone}/${d.iron}`);
  }
  if (goldFlag == null) warnings.push('config: snob.gold not found (world type unknown)');

  return {
    gold: goldFlag == null ? null : goldFlag !== 0,
    packageCost,
    speed: childNumber(config, 'speed'),
    unitSpeed: childNumber(config, 'unit_speed'),
    /** Resources/hour of a level-1 mine at speed 1 (33 on enc1, not the classic 30). */
    baseProduction: childNumber(config && childElements(config, 'game')[0], 'base_production'),
    warnings,
  };
}
