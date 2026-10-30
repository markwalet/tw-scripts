import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIncoming, loadIncoming } from '../../src/package-planner/core/parse-incoming.js';

// Trader overview, incoming (trimmed from the user's real enc1 page; see the fixture header).
const fixture = readFileSync(new URL('../fixtures/package-planner/trader-inc.html', import.meta.url), 'utf8');

test('parseIncoming: one transport per row: target village id (not the origin or sender) and its resources', () => {
  const { transports, warnings } = parseIncoming(fixture);
  assert.deepEqual(transports, [
    { key: '#1082210', to: 2005, res: [0, 0, 1000] },
    { key: '#1082211', to: 2005, res: [28000, 30000, 0] },
    { key: '#1082212', to: 2001, res: [5000, 4000, 2500] },
  ]);
  assert.deepEqual(warnings, []);
});

test('parseIncoming: a row without a cancel checkbox is keyed by its content, not the ticking countdown', () => {
  const noIds = fixture.replace(/<input type="checkbox" name="cancel\[\]"[^>]*>/g, '');
  const ticked = noIds.replace('0:03:31', '0:03:30');
  const keys = parseIncoming(noIds).transports.map((x) => x.key);
  assert.equal(new Set(keys).size, 3);
  assert.deepEqual(parseIncoming(ticked).transports.map((x) => x.key), keys);
});

test('parseIncoming: no incoming merchants (no #trades_table, real empty state) -> nothing, no warning', () => {
  const empty = '<table class="vis"><tbody><tr><td>Your incoming merchants: 0</td></tr></tbody></table>';
  assert.deepEqual(parseIncoming(empty), { transports: [], pages: [], warnings: [], structure: { tableFound: false, rows: 0 } });
});

test('loadIncoming: sums what is on the way per target village, one request', async () => {
  const asked = [];
  const r = await loadIncoming({ fetchPage: async (p) => (asked.push(p), fixture) });
  assert.deepEqual(asked, [-1]);
  assert.deepEqual([...r.byId], [[2005, [28000, 30000, 1000]], [2001, [5000, 4000, 2500]]]);
  assert.deepEqual(r.warnings, []);
});

test('loadIncoming: a paged list -> reads every linked page and sums those (each row counted once)', async () => {
  const rowsAt = [...fixture.matchAll(/<tr class="row_/g)].map((m) => m.index);
  const end = fixture.indexOf('<tr>', rowsAt[2]);
  const nav = [0, 1].map((p) => `<a class="paged-nav-item" href="/game.php?screen=overview_villages&amp;mode=trader&amp;type=inc&amp;page=${p}">[${p + 1}]</a>`).join('');
  const page = (from, to) => nav + fixture.slice(0, rowsAt[0]) + fixture.slice(from, to) + fixture.slice(end);
  // Whether or not TW honours page=-1, the linked pages hold every row exactly once.
  const pages = { [-1]: page(rowsAt[0], rowsAt[2]), 0: page(rowsAt[0], rowsAt[2]), 1: page(rowsAt[2], end) };
  const asked = [];
  const r = await loadIncoming({ fetchPage: async (p) => (asked.push(p), pages[p]) });
  assert.deepEqual(asked, [-1, 0, 1]);
  assert.deepEqual([...r.byId], [[2005, [28000, 30000, 1000]], [2001, [5000, 4000, 2500]]]);
});

// Splits the fixture's 3 rows: page 0 = rows 1-2, page 1 = row 3, under a nav of `nav`.
function pagedFixture(nav) {
  const rowsAt = [...fixture.matchAll(/<tr class="row_/g)].map((m) => m.index);
  const end = fixture.indexOf('<tr>', rowsAt[2]);
  return (from, to) => nav + fixture.slice(0, rowsAt[0]) + fixture.slice(from, to) + fixture.slice(end);
}
const navLink = (p) => `<a class="paged-nav-item" href="/game.php?screen=overview_villages&amp;mode=trader&amp;type=inc&amp;page=${p}">[${p + 1}]</a>`;

test('loadIncoming: TW ignores page=-1 and serves page 0, whose number is not a link -> page 0 still counts', async () => {
  const nav = `<strong class="paged-nav-item"> &gt;1&lt; </strong>${navLink(1)}`;
  const rowsAt = [...fixture.matchAll(/<tr class="row_/g)].map((m) => m.index);
  const end = fixture.indexOf('<tr>', rowsAt[2]);
  const page = pagedFixture(nav);
  const pages = { [-1]: page(rowsAt[0], rowsAt[2]), 1: page(rowsAt[2], end) };
  const asked = [];
  const r = await loadIncoming({ fetchPage: async (p) => (asked.push(p), pages[p]) });
  assert.deepEqual(asked, [-1, 1]);
  assert.deepEqual([...r.byId], [[2005, [28000, 30000, 1000]], [2001, [5000, 4000, 2500]]]);
});

test('loadIncoming: TW honours page=-1 (every row) and still links the pages -> each transport counted once', async () => {
  const rowsAt = [...fixture.matchAll(/<tr class="row_/g)].map((m) => m.index);
  const end = fixture.indexOf('<tr>', rowsAt[2]);
  const page = pagedFixture(navLink(0) + navLink(1));
  const pages = { [-1]: page(rowsAt[0], end), 0: page(rowsAt[0], rowsAt[2]), 1: page(rowsAt[2], end) };
  const r = await loadIncoming({ fetchPage: async (p) => pages[p] });
  assert.deepEqual([...r.byId], [[2005, [28000, 30000, 1000]], [2001, [5000, 4000, 2500]]]);
  assert.equal(r.structure.transports, 3);
});
