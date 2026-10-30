// package-planner/core/parse-incoming.js — Trader overview, incoming
// (overview_villages&mode=trader&type=inc) -> the transports on the way and what they
// carry. Pure. In-flight resources count as present at the target (spec §4).
//
// Verified on a real enc1 page: one <tr> per transport in table#trades_table; the target
// is the LAST info_village link of the row (the origin comes first; the sender is an
// info_player link); each carried resource is an element with class wood/stone/iron
// (`span.icon.header iron`) whose wrapper holds the amount ("1.000"); a resource that is
// not carried is absent. No incoming merchants = no #trades_table. Never reads text labels.

import { parseHtml, find, findAll, textOf, hasClass, intOf, is } from '../../shared/html.js';
import { pageNumbers, rowShape } from './overview.js';

/** @typedef {[number, number, number]} Res */
/** @typedef {import('../../shared/html.js').El} El */

const RES = ['wood', 'stone', 'iron'];
const VILLAGE_LINK = /[?&]screen=info_village\b.*?[?&]id=(\d+)/;

/** @param {string} html */
export function parseIncoming(html) {
  const root = parseHtml(html);
  /** @type {{ to: number, res: Res }[]} */
  const transports = [];
  /** @type {string[]} */
  const warnings = [];
  const pages = pageNumbers(root);
  const table = find(root, is({ tag: 'table', id: 'trades_table' }));
  if (!table) return { transports, pages, warnings, structure: { tableFound: false, rows: 0 } };

  const villageLink = (/** @type {El} */ e) => e.tag === 'a' && VILLAGE_LINK.test(e.attrs.href || '');
  const rows = findAll(table, (el) => el.tag === 'tr' && !!find(el, villageLink));
  let skipped = 0;
  for (const tr of rows) {
    const links = findAll(tr, villageLink);
    const to = parseInt(VILLAGE_LINK.exec(links[links.length - 1].attrs.href)[1], 10);
    /** @type {Res} */
    const res = RES.map((k) => {
      const el = find(tr, (e) => hasClass(e, k));
      return el ? intOf(textOf(el.parent || el)) : 0;
    });
    if (res.some((n) => !Number.isFinite(n))) {
      skipped += 1;
      continue;
    }
    transports.push({ to, res });
  }
  if (skipped) warnings.push(`trader: ${skipped} of ${rows.length} rows skipped (amount not readable)`);
  return { transports, pages, warnings, structure: { tableFound: true, rows: rows.length, firstRow: rows[0] ? rowShape(rows[0]) : null } };
}

/**
 * Everything on the way, summed per target village. Asks for page=-1 ("all"); when the
 * list links pages, reads those instead (each row sits on exactly one page, whether or not
 * TW honoured page=-1). The caller's fetchPage goes through the throttled queue.
 * @param {{ fetchPage: (page: number) => Promise<string> }} opts
 */
export async function loadIncoming({ fetchPage }) {
  const first = parseIncoming(await fetchPage(-1));
  const parsed = first.pages.length ? [] : [first];
  for (const p of first.pages) parsed.push(parseIncoming(await fetchPage(p)));
  /** @type {Map<number, Res>} */
  const byId = new Map();
  for (const { to, res } of parsed.flatMap((x) => x.transports)) {
    const sum = byId.get(to) || [0, 0, 0];
    byId.set(to, sum.map((n, k) => n + res[k]));
  }
  return {
    byId,
    warnings: [...new Set(parsed.flatMap((x) => x.warnings))],
    structure: { ...first.structure, pagesLinked: first.pages.length, transports: parsed.reduce((n, x) => n + x.transports.length, 0), targets: byId.size },
  };
}
