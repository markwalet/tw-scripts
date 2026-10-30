import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsStore, solverOptions } from '../../src/package-planner/core/settings.js';
import { solve } from '../../src/package-planner/core/solver.js';

// One empty academy (100k warehouse) and one source 5 fields away (1800 s at speed 1)
// holding exactly 3 packages, with 83 merchants per package.
const world = {
  villages: [
    { id: 1, x: 500, y: 500, res: [0, 0, 0], storage: 100000, merchants: 0, academy: true },
    { id: 2, x: 503, y: 504, res: [84000, 90000, 75000], storage: 400000, merchants: 249, academy: false },
  ],
};
const packagesWith = (change) => solve(world, solverOptions({ ...settingsStore.defaults(), ...change })).packages;

test('planner settings: defaults plan every package the warehouse fits', () => {
  assert.equal(packagesWith({}), 3);
});

test('planner settings: max travel time shorter than the trip -> no packages', () => {
  assert.equal(packagesWith({ maxTravelSeconds: 1800 }), 3);
  assert.equal(packagesWith({ maxTravelSeconds: 1799 }), 0);
});

test('planner settings: a reserve stays in the sender', () => {
  assert.equal(packagesWith({ reserve: [0, 1, 0] }), 2);
});

test('planner settings: merchants kept home are not used', () => {
  assert.equal(packagesWith({ keepMerchants: 1 }), 2);
});

test('planner settings: the warehouse buffer leaves room free at the academy', () => {
  // 3 packages = 90k clay; a 10% buffer leaves 90k room, 11% only 89k.
  assert.equal(packagesWith({ bufferPct: 10 }), 3);
  assert.equal(packagesWith({ bufferPct: 11 }), 2);
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), raw: data };
}

test('planner settings: defaults per DESIGN §6, saved per world', () => {
  const storage = memoryStorage();
  assert.deepEqual(settingsStore.load('en150', storage), {
    version: 1, maxTravelSeconds: null, reserve: [0, 0, 0], keepMerchants: 0, bufferPct: 2,
  });
  settingsStore.save('en150', { ...settingsStore.defaults(), keepMerchants: 5 }, storage);
  assert.ok(storage.raw.has('en150pp_settings'));
  assert.equal(settingsStore.load('en150', storage).keepMerchants, 5);
  assert.equal(settingsStore.load('en151', storage).keepMerchants, 0);
});

test('planner settings: migration keeps valid stored values and replaces broken or missing ones', () => {
  const storage = memoryStorage({
    en150pp_settings: JSON.stringify({ version: 0, maxTravelSeconds: 7200, reserve: [5000, 'x', -1], keepMerchants: -3, bufferPct: 'lots' }),
  });
  assert.deepEqual(settingsStore.load('en150', storage), {
    version: 1, maxTravelSeconds: 7200, reserve: [5000, 0, 0], keepMerchants: 0, bufferPct: 2,
  });
  assert.equal(settingsStore.migrate({ maxTravelSeconds: 0 }).maxTravelSeconds, null, '0 = no limit');
  assert.deepEqual(settingsStore.migrate({ reserve: 'nope' }).reserve, [0, 0, 0]);
});
