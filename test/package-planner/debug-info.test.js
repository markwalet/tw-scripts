import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDebugInfo } from '../../src/package-planner/core/debug-info.js';
import { loadOverview } from '../../src/package-planner/core/load-overview.js';
import { prodEntries } from '../../src/package-planner/core/parse-prod.js';
import { buildingsEntries } from '../../src/package-planner/core/parse-buildings.js';
import { loadIncoming } from '../../src/package-planner/core/parse-incoming.js';

const read = (f) => readFileSync(new URL(`../fixtures/package-planner/${f}`, import.meta.url), 'utf8');

async function report() {
  const prod = await loadOverview({ fetchPage: async () => read('prod.html'), parse: prodEntries, label: 'prod' });
  const buildings = await loadOverview({ fetchPage: async () => read('buildings.html'), parse: buildingsEntries, label: 'buildings' });
  return {
    env: { world: 'enc1', market: 'en', device: 'desktop', version: '8.441', premium: true, sitting: false, villages: 5 },
    config: { gold: false, packageCost: { wood: 28000, stone: 30000, iron: 25000 }, speed: 3.6, unitSpeed: 0.278, warnings: [] },
    prod,
    buildings,
    incoming: await loadIncoming({ fetchPage: async () => read('trader-inc.html') }),
    result: { packages: 2, academies: 4, villages: 5, notInBuildings: 0 },
    plan: { packages: 7, cards: 3, transports: 9, merchants: 412, longestSeconds: 1393, ms: 41 },
    error: 'GET /game.php?village=101&screen=overview_villages&t=1000001 failed: 503',
    // Must never appear in the output:
    player: { id: 1000001, name: 'Test Player' },
    csrf: 'deadbeef',
  };
}

test('buildDebugInfo: includes what the parsers saw, counts and the result', async () => {
  const out = buildDebugInfo(await report());
  assert.match(out, /Noble Package Planner debug/);
  assert.match(out, /prod: .*read 5/);
  assert.match(out, /storage_max/); // header sort keys the parser mapped
  assert.match(out, /academy levels: 0:1 2:3 3:1/);
  assert.match(out, /storable now: 2 packages in 4 academies/);
  assert.match(out, /cost 28000\/30000\/25000/);
  assert.match(out, /plan: 7 packages, 3 targets, 9 transports, 412 merchants, longest 1393 s, solved in 41 ms/);
  assert.match(out, /trader incoming: rows 3, pages linked 0, 3 transports to 2 villages/);
});

test('buildDebugInfo: leaks no player name, player/village ids, coordinates or tokens', async () => {
  const out = buildDebugInfo(await report());
  for (const secret of ['Test Player', '1000001', 'deadbeef', 'village=101', '101', '500|500', 'Village 1', '2005', '639|220']) {
    assert.equal(out.includes(secret), false, `leaked ${secret}`);
  }
  assert.match(out, /error: .*failed: 503/);
});
