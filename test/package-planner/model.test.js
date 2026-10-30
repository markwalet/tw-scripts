import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solverInput } from '../../src/package-planner/core/model.js';

const prodVillage = (id, extra = {}) => ({
  id, name: `Village ${id}`, x: 500, y: 500 + id, wood: 1000, stone: 2000, iron: 3000,
  storageMax: 400000, merchantsAvailable: 40, merchantsTotal: 46, ...extra,
});
const config = { gold: false, packageCost: { wood: 28000, stone: 30000, iron: 25000 }, speed: 3.6, unitSpeed: 0.278, warnings: [] };

test('solverInput: prod villages become solver villages; academy = academy level 1+', () => {
  const { world } = solverInput({ villages: [prodVillage(1), prodVillage(2), prodVillage(3)], academyLevels: new Map([[1, 1], [2, 0]]), config });
  assert.deepEqual(world.villages, [
    { id: 1, x: 500, y: 501, res: [1000, 2000, 3000], storage: 400000, merchants: 40, academy: true },
    { id: 2, x: 500, y: 502, res: [1000, 2000, 3000], storage: 400000, merchants: 40, academy: false },
    { id: 3, x: 500, y: 503, res: [1000, 2000, 3000], storage: 400000, merchants: 40, academy: false },
  ]);
});

test('solverInput: resources on the way (Trader overview) become the target village\'s inflight', () => {
  const { world } = solverInput({
    villages: [prodVillage(1), prodVillage(2)],
    academyLevels: new Map([[1, 1]]),
    incoming: new Map([[1, [28000, 30000, 1000]], [99, [5000, 0, 0]]]),
    config,
  });
  assert.deepEqual(world.villages.map((v) => v.inflight), [[28000, 30000, 1000], undefined]);
});

test('solverInput: package cost and world speed come from the world config', () => {
  const { options, warnings } = solverInput({ villages: [], academyLevels: new Map(), config });
  assert.deepEqual(options, { cost: [28000, 30000, 25000], worldSpeed: 3.6 });
  assert.deepEqual(warnings, []);
});

test('solverInput: no world speed in the config -> speed 1 with a warning', () => {
  const { options, warnings } = solverInput({ villages: [], academyLevels: new Map(), config: { ...config, speed: null } });
  assert.equal(options.worldSpeed, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /speed/);
});

test('solverInput: group filters — only sender-group villages send, only receiver-group academies receive', () => {
  const { world } = solverInput({
    villages: [prodVillage(1), prodVillage(2), prodVillage(3)],
    academyLevels: new Map([[1, 1], [2, 1], [3, 0]]),
    senders: new Set([2, 3]),
    receivers: new Set([1, 3]),
    config,
  });
  assert.deepEqual(world.villages.map((v) => [v.id, v.academy, v.sender]), [
    [1, true, false],   // receiver academy, not a sender
    [2, false, true],   // academy outside the receiver group: only sends
    [3, false, true],   // receiver group but no academy
  ]);
});

test('solverInput: no group (All) -> every village sends, every academy receives', () => {
  const { world } = solverInput({ villages: [prodVillage(1), prodVillage(2)], academyLevels: new Map([[1, 1], [2, 1]]), config });
  assert.deepEqual(world.villages.map((v) => [v.academy, v.sender]), [[true, undefined], [true, undefined]]);
});
