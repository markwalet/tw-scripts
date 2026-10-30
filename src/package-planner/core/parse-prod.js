// package-planner/core/parse-prod.js — Production overview (overview_villages&mode=prod)
// -> per village: id, coords, resources, warehouse capacity, merchants. Pure.
//
// Verified on a real enc1 page: one <tr> per village in table#production_table; the id
// is span.quickedit-vn[data-id]; coords are the last "(x|y)" in the name label;
// resources are span.wood/.stone/.iron (class "res wood", or "warn stone"/"warn_90 stone"
// when nearly full, so never rely on .res); warehouse and merchants ("46/46") are the
// columns whose header links sort by `order=storage_max` / `order=trader_available`.
// Never reads translated header text.

import { parseHtml, find, findAll, textOf, childElements, hasClass, intOf, is } from '../../shared/html.js';
import { groupMenu, headerColumns, headerVillageCount, pageNumbers, rowShape } from './overview.js';
import { RES } from './world-config.js';

/** @typedef {import('../../shared/html.js').El} El */

/**
 * @typedef {{
 *   id: number, name: string, x: number, y: number,
 *   wood: number, stone: number, iron: number,
 *   storageMax: number, merchantsAvailable: number, merchantsTotal: number,
 * }} ProdVillage
 */

/**
 * @param {string} html
 */
export function parseProd(html) {
  const root = parseHtml(html);
  /** @type {string[]} */
  const warnings = [];
  /** @type {ProdVillage[]} */
  const villages = [];
  const pages = pageNumbers(root);
  const groups = groupMenu(root);
  const table = find(root, is({ tag: 'table', id: 'production_table' }));
  if (!table) {
    warnings.push('prod: production table not found');
    return { villages, expectedCount: null, pages, groups, warnings, structure: { tableFound: false } };
  }

  const cols = headerColumns(table);
  const rows = findAll(table, (el) => el.tag === 'tr' && !!find(el, (e) => hasClass(e, 'quickedit-vn') && !!e.attrs['data-id']));
  let skipped = 0;
  let positional = 0;

  for (const tr of rows) {
    const cells = childElements(tr, 'td');
    const id = intOf(find(tr, (e) => hasClass(e, 'quickedit-vn'))?.attrs['data-id'] || '');
    const label = find(tr, (e) => hasClass(e, 'quickedit-label')) || tr;
    const coords = [...textOf(label).matchAll(/\((\d{1,3})\|(\d{1,3})\)/g)].pop();
    // The label's data-text is the bare name; its text adds "(x|y) K55".
    const name = (label.attrs['data-text'] ?? textOf(label).replace(/\s*\(\d{1,3}\|\d{1,3}\)[^(]*$/, '')).trim();

    /** @type {Record<string, number>} */
    const res = {};
    let resCell = -1;
    for (const k of RES) {
      const span = find(tr, (e) => e.tag === 'span' && hasClass(e, k));
      res[k] = span ? intOf(textOf(span)) : NaN;
      if (span && resCell < 0) resCell = cells.findIndex((c) => c === span || !!find(c, (e) => e === span));
    }

    let storageIdx = cols.storage_max;
    let merchantIdx = cols.trader_available;
    if (storageIdx == null || merchantIdx == null) {
      positional += 1;
      if (storageIdx == null && resCell >= 0) storageIdx = resCell + 1;
      if (merchantIdx == null) {
        merchantIdx = cells.findIndex((c) => !!find(c, (e) => e.tag === 'a' && /[?&]screen=market\b/.test(e.attrs.href || '')));
      }
    }
    const storageMax = storageIdx != null && cells[storageIdx] ? intOf(textOf(cells[storageIdx])) : NaN;
    const merchants = merchantIdx != null && cells[merchantIdx] ? /(\d+)\s*\/\s*(\d+)/.exec(textOf(cells[merchantIdx])) : null;

    const v = {
      id,
      name,
      x: coords ? parseInt(coords[1], 10) : NaN,
      y: coords ? parseInt(coords[2], 10) : NaN,
      wood: res.wood,
      stone: res.stone,
      iron: res.iron,
      storageMax,
      merchantsAvailable: merchants ? parseInt(merchants[1], 10) : NaN,
      merchantsTotal: merchants ? parseInt(merchants[2], 10) : NaN,
    };
    if (Object.entries(v).some(([k, n]) => k !== 'name' && !Number.isFinite(n))) {
      skipped += 1;
      continue;
    }
    villages.push(v);
  }

  if (positional) warnings.push(`prod: warehouse/merchant header not found, read ${positional} rows by position`);
  if (skipped) warnings.push(`prod: ${skipped} of ${rows.length} rows skipped (missing fields)`);

  return {
    villages,
    expectedCount: headerVillageCount(table),
    pages,
    groups,
    warnings,
    structure: {
      tableFound: true,
      columns: cols,
      rows: rows.length,
      firstRow: rows[0] ? rowShape(rows[0]) : null,
    },
  };
}

/** parseProd in the shape loadOverview() takes (entries keyed by village id). @param {string} html */
export function prodEntries(html) {
  const { villages, ...rest } = parseProd(html);
  return { ...rest, entries: villages.map((v) => /** @type {[number, ProdVillage]} */ ([v.id, v])) };
}
