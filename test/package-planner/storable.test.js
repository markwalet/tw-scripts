import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storableNow } from '../../src/package-planner/core/storable.js';
import { checkPreconditions } from '../../src/package-planner/core/preconditions.js';

const COST = { wood: 28000, stone: 30000, iron: 25000 };
const village = (id, wood, stone, iron) => ({ id, x: 500, y: 500, wood, stone, iron, storageMax: 400000, merchantsAvailable: 10, merchantsTotal: 10 });

test('storableNow: sums whole packages per academy village, limited by its scarcest resource', () => {
  const villages = [
    village(1, 60000, 95000, 80000), // wood 2.14, stone 3.16, iron 3.2 -> 2
    village(2, 28000, 30000, 25000), // exactly 1
    village(3, 27999, 90000, 90000), // 0: one short on wood
    village(4, 900000, 900000, 900000), // no academy -> ignored
  ];
  const levels = new Map([[1, 1], [2, 3], [3, 2], [4, 0]]);
  assert.deepEqual(storableNow(villages, levels, COST), {
    packages: 3,
    academies: 3,
    villages: 4,
    notInBuildings: 0,
  });
});

test('storableNow: the user-page fixture numbers (5 villages, 4 academies)', () => {
  // Values from test/fixtures/package-planner/{prod,buildings}.html, worked by hand:
  // 101: 33140/44720/50294 -> 1; 102: 4789/... -> 0; 103: 87645/115798/29890 -> 1;
  // 104: academy 0; 105: 24106/... -> 0.
  const villages = [
    village(101, 33140, 44720, 50294),
    village(102, 4789, 16695, 1998),
    village(103, 87645, 115798, 29890),
    village(104, 30879, 60779, 719),
    village(105, 24106, 66537, 14187),
  ];
  const levels = new Map([[101, 2], [102, 2], [103, 2], [104, 0], [105, 3]]);
  assert.equal(storableNow(villages, levels, COST).packages, 2);
});

test('storableNow: villages missing from the buildings overview are counted, not assumed academies', () => {
  const r = storableNow([village(1, 1e6, 1e6, 1e6)], new Map(), COST);
  assert.deepEqual(r, { packages: 0, academies: 0, villages: 1, notInBuildings: 1 });
});

test('checkPreconditions: premium + classic world is ok', () => {
  assert.deepEqual(checkPreconditions({ premium: true, gold: false }), { ok: true });
});

test('checkPreconditions: no premium is refused first', () => {
  assert.deepEqual(checkPreconditions({ premium: false, gold: true }), { ok: false, reason: 'noPremium' });
});

test('checkPreconditions: coin world is refused', () => {
  assert.deepEqual(checkPreconditions({ premium: true, gold: true }), { ok: false, reason: 'coinWorld' });
});

test('checkPreconditions: unknown world type proceeds (the config warning is shown)', () => {
  assert.deepEqual(checkPreconditions({ premium: true, gold: null }), { ok: true });
});

test('storableNow: what is already on the way counts (capped by the warehouse, like the solver)', () => {
  const villages = [
    village(1, 0, 30000, 25000), // + 28000 wood on the way -> 1
    { ...village(2, 390000, 390000, 390000), storageMax: 400000 }, // + 50000 each: capped at 400000 -> 13 (not 14)
  ];
  const levels = new Map([[1, 1], [2, 1]]);
  const incoming = new Map([[1, [28000, 0, 0]], [2, [50000, 50000, 50000]]]);
  assert.equal(storableNow(villages, levels, COST, null, incoming).packages, 1 + 13);
});

test('storableNow: with a receiver group only its academies count', () => {
  const villages = [village(1, 60000, 95000, 80000), village(2, 28000, 30000, 25000)];
  const levels = new Map([[1, 1], [2, 1]]);
  assert.deepEqual(storableNow(villages, levels, COST, new Set([2])), { packages: 1, academies: 1, villages: 2, notInBuildings: 0 });
});
