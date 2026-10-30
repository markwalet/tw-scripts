// package-planner/core/parse-buildings.js — Buildings overview
// (overview_villages&mode=buildings) -> academy level per village id. Pure.
//
// Verified on a real enc1 page: table#buildings_table, one <tr id="v_<id>"> per village
// (also span.quickedit-vn[data-id]); the academy is td.upgrade_building.b_snob. Level 0
// renders as <span class="hidden">0</span>, so read the text, not visibility. The column
// set differs per world, so we use the b_<building> class, never a column index.

import { parseHtml, find, findAll, textOf, hasClass, intOf, is } from '../../shared/html.js';
import { headerVillageCount, pageNumbers, rowShape } from './overview.js';

/** @typedef {import('../../shared/html.js').El} El */

/** @param {El} tr */
function villageId(tr) {
  const fromRow = /^v_(\d+)$/.exec(tr.attrs.id || '');
  if (fromRow) return parseInt(fromRow[1], 10);
  return intOf(find(tr, (e) => hasClass(e, 'quickedit-vn'))?.attrs['data-id'] || '');
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
  const pages = pageNumbers(root);
  const table = find(root, is({ tag: 'table', id: 'buildings_table' }));
  if (!table) {
    warnings.push('buildings: buildings table not found');
    return { levels, expectedCount: null, pages, warnings, structure: { tableFound: false } };
  }

  const rows = findAll(table, (el) => el.tag === 'tr' && Number.isFinite(villageId(el)));
  let noAcademyCell = 0;
  for (const tr of rows) {
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

/** parseBuildings in the shape loadOverview() takes (academy level keyed by village id). @param {string} html */
export function buildingsEntries(html) {
  const { levels, ...rest } = parseBuildings(html);
  return { ...rest, entries: [...levels.entries()] };
}
