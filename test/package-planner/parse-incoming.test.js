import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIncoming, loadIncoming } from '../../src/package-planner/core/parse-incoming.js';

// Trader overview, incoming (trimmed from the user's real enc1 page; see the fixture header).
const fixture = readFileSync(new URL('../fixtures/package-planner/trader-inc.html', import.meta.url), 'utf8');

test('parseIncoming: one transport per row: target village id (not the origin or sender) and its resources', () => {
  const { transports, warnings } = parseIncoming(fixture);
  assert.deepEqual(transports, [
    { to: 2005, res: [0, 0, 1000] },
    { to: 2005, res: [28000, 30000, 0] },
    { to: 2001, res: [5000, 4000, 2500] },
  ]);
  assert.deepEqual(warnings, []);
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
