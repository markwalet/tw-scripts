import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadOverview } from '../../src/package-planner/core/load-overview.js';
import { prodEntries } from '../../src/package-planner/core/parse-prod.js';

const fixture = readFileSync(new URL('../fixtures/package-planner/prod.html', import.meta.url), 'utf8');

/** Split the 5-row fixture into "pages" as TW would serve them without page=-1. */
function pagedFixture() {
  const rowsAt = [...fixture.matchAll(/<tr class="nowrap/g)].map((m) => m.index);
  const tableEnd = fixture.lastIndexOf('</tbody></table>');
  const head = fixture.slice(0, rowsAt[0]);
  const rows = rowsAt.map((at, i) => fixture.slice(at, rowsAt[i + 1] ?? tableEnd));
  const page = (rs) => head + rs.join('') + '</tbody></table>';
  return { 0: page(rows.slice(0, 2)), 1: page(rows.slice(2, 4)), 2: page(rows.slice(4)) };
}

test('loadOverview: page=-1 with every village -> one request', async () => {
  const asked = [];
  const r = await loadOverview({
    fetchPage: async (p) => (asked.push(p), fixture),
    parse: prodEntries,
  });
  assert.deepEqual(asked, [-1]);
  assert.deepEqual([...r.byId.keys()], [101, 102, 103, 104, 105]);
  assert.deepEqual(r.warnings, []);
});

test('loadOverview: page=-1 not honoured (too many villages) -> fetches each linked page and merges', async () => {
  const pages = pagedFixture();
  const asked = [];
  const r = await loadOverview({
    // TW caps the "all" view: page=-1 returns only the first page here.
    fetchPage: async (p) => (asked.push(p), p === -1 ? pages[0] : pages[p]),
    parse: prodEntries,
  });
  assert.deepEqual(asked, [-1, 0, 1, 2]);
  assert.deepEqual([...r.byId.keys()].sort(), [101, 102, 103, 104, 105]);
  assert.match(r.warnings.join('\n'), /paged/);
});

test('loadOverview: fewer villages than expected and no page links -> warning with both counts', async () => {
  const pages = pagedFixture();
  const noNav = pages[0].replace(/paged-nav-item/g, 'x');
  const r = await loadOverview({ fetchPage: async () => noNav, parse: prodEntries });
  assert.equal(r.byId.size, 2);
  assert.match(r.warnings.join('\n'), /read 2 of 5 villages/);
});
