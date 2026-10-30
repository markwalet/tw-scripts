// package-planner/core/overview.js — what every premium village overview has in common:
// the column a header sorts by (`order=<key>` in the th link: language-independent),
// the village count in the "Village (65)" header, the paging links, and a value-free
// "shape" of a row for the debug summary. Pure.

import { findAll, find, textOf, childElements, is } from '../../shared/html.js';

/** @typedef {import('../../shared/html.js').El} El */

/**
 * Map header sort keys to column indexes, e.g. { name: 1, storage_max: 4 }.
 * @param {El} table
 */
export function headerColumns(table) {
  const headRow = find(table, is({ tag: 'tr' }));
  /** @type {Record<string, number>} */
  const cols = {};
  if (!headRow) return cols;
  childElements(headRow).forEach((th, idx) => {
    const link = find(th, (el) => el.tag === 'a' && /[?&]order=/.test(el.attrs.href || ''));
    const key = link && /[?&]order=([a-z_]+)/.exec(link.attrs.href)?.[1];
    if (key && !(key in cols)) cols[key] = idx;
  });
  return cols;
}

/**
 * The village count in the name column header ("Village (65)"), or null.
 * @param {El} table
 */
export function headerVillageCount(table) {
  const headRow = find(table, is({ tag: 'tr' }));
  if (!headRow) return null;
  for (const th of childElements(headRow)) {
    if (!find(th, (el) => el.tag === 'a' && /[?&]order=name\b/.test(el.attrs.href || ''))) continue;
    const m = /\((\d+)\)/.exec(textOf(th));
    return m ? parseInt(m[1], 10) : null;
  }
  return null;
}

/**
 * Page numbers linked from the paging nav (`a.paged-nav-item`, or a page <select>).
 * @param {El} root
 * @returns {number[]}
 */
export function pageNumbers(root) {
  const set = new Set();
  for (const el of findAll(root, (e) => (e.tag === 'a' && /\bpaged-nav-item\b/.test(e.attrs.class || '')) || e.tag === 'option')) {
    const ref = el.attrs.href || el.attrs.value || '';
    const m = /[?&]page=(\d+)/.exec(ref);
    if (m) set.add(parseInt(m[1], 10));
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * A value-free description of a row, for the debug summary: per cell, its classes and
 * the classes of nested elements, and its text with digits -> 9 and letters -> a.
 * Leaks no names, ids or numbers.
 * @param {El} tr
 */
export function rowShape(tr) {
  return childElements(tr)
    .map((cell) => {
      const classes = [cell, ...findAll(cell, () => true)]
        .map((e) => (e.attrs.class || '').trim())
        .filter(Boolean)
        .flatMap((c) => c.split(/\s+/))
        .filter((c) => !/\d{2,}/.test(c)); // drop per-village classes like village_123
      const text = textOf(cell).replace(/\s+/g, ' ').trim().replace(/\d+/g, '9').replace(/[^\d\s9.,:/|()%+-]+/g, 'a');
      return `${cell.tag}[${[...new Set(classes)].join(' ')}]"${text.slice(0, 24)}"`;
    })
    .join(' ');
}
