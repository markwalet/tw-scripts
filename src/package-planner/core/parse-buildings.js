// package-planner/core/parse-buildings.js — Buildings overview
// (overview_villages&mode=buildings) -> academy level per village id. Pure.
//
// Verified on a real enc1 page: table#buildings_table, one <tr id="v_<id>"> per village
// (also span.quickedit-vn[data-id]); the academy is td.upgrade_building.b_snob. Level 0
// renders as <span class="hidden">0</span>, so read the text, not visibility. The column
// set differs per world, so we use the b_<building> class, never a column index.
// Mines (b_wood/b_stone/b_iron) give the production rate for the warehouse margin (§5).

import { parseHtml, find, findAll, textOf, hasClass, intOf, is } from '../../shared/html.js';
import { headerVillageCount, pageNumbers, rowShape } from './overview.js';

/** @typedef {import('../../shared/html.js').El} El */

/** @param {El} tr */
function villageId(tr) {
  const fromRow = /^v_(\d+)$/.exec(tr.attrs.id || '');
  if (fromRow) return parseInt(fromRow[1], 10);
  return intOf(find(tr, (e) => hasClass(e, 'quickedit-vn'))?.attrs['data-id'] || '');
}

/** Level in the row's td.<building> cell; NaN when the cell is missing. @param {El} tr @param {string} building */
function cellLevel(tr, building) {
  const cell = find(tr, (e) => e.tag === 'td' && hasClass(e, building));
  return cell ? intOf(textOf(cell)) : NaN;
}

/**
 * @param {string} html
 */
export function parseBuildings(html) {
  const root = parseHtml(html);
  /** @type {string[]} */
  const warnings = [];
  /** @type {Map<number, number>} village id -> academy level */
  const levels = new Map();
  /** @type {Map<number, [number, number, number]>} village id -> timber camp, clay pit, iron mine level */
  const mines = new Map();
  const pages = pageNumbers(root);
  const table = find(root, is({ tag: 'table', id: 'buildings_table' }));
  if (!table) {
    warnings.push('buildings: buildings table not found');
    return { levels, mines, expectedCount: null, pages, warnings, structure: { tableFound: false } };
  }

  const rows = findAll(table, (el) => el.tag === 'tr' && Number.isFinite(villageId(el)));
  let noAcademyCell = 0;
  for (const tr of rows) {
    const mine = ['b_wood', 'b_stone', 'b_iron'].map((b) => cellLevel(tr, b));
    if (mine.every(Number.isFinite)) mines.set(villageId(tr), /** @type {[number, number, number]} */ (mine));
    const cell = find(tr, (e) => e.tag === 'td' && hasClass(e, 'b_snob'));
    if (!cell) {
      noAcademyCell += 1;
      continue;
    }
    const level = intOf(textOf(cell));
    levels.set(villageId(tr), Number.isFinite(level) ? level : 0);
  }
  if (noAcademyCell) warnings.push(`buildings: ${noAcademyCell} of ${rows.length} rows have no academy cell (td.b_snob)`);

  return {
    levels,
    mines,
    expectedCount: headerVillageCount(table),
    pages,
    warnings,
    structure: {
      tableFound: true,
      rows: rows.length,
      firstRow: rows[0] ? rowShape(rows[0]) : null,
    },
  };
}

/** parseBuildings in the shape loadOverview() takes: academy + mine levels keyed by village id. @param {string} html */
export function buildingsEntries(html) {
  const { levels, mines, ...rest } = parseBuildings(html);
  return { ...rest, entries: [...levels.entries()].map(([id, academy]) => /** @type {[number, { academy: number, mines: [number, number, number] | null }]} */ ([id, { academy, mines: mines.get(id) || null }])) };
}
