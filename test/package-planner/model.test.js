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

// Real enc1 village: mines 30/30/30, base_production 33, speed 3.6. The game reported
// wood_prod = stone_prod = iron_prod = 2.6400000293394 /s, i.e. 9504 per hour.
const enc1 = { ...config, baseProduction: 33 };

test('solverInput: production per hour from mine levels × base production × world speed', () => {
  const { world, warnings } = solverInput({
    villages: [prodVillage(1)], academyLevels: new Map([[1, 1]]), mineLevels: new Map([[1, [30, 30, 30]]]), config: enc1,
  });
  for (const rate of world.villages[0].production) assert.ok(Math.abs(rate - 9504) < 1, `rate ${rate}`);
  assert.deepEqual(warnings, []);
});

test('solverInput: each mine has its own rate; one level up is ×1.163118', () => {
  const { world } = solverInput({
    villages: [prodVillage(1)], academyLevels: new Map([[1, 1]]), mineLevels: new Map([[1, [30, 29, 1]]]), config: enc1,
  });
  const [wood, clay, iron] = world.villages[0].production;
  assert.ok(Math.abs(clay - 9504 / 1.163118) < 1, `clay ${clay}`);
  assert.ok(Math.abs(iron - 33 * 3.6) < 1e-9, `iron ${iron}`);
  assert.ok(wood > clay);
});

test('solverInput: mine level 0 counts as level 1 (safe side)', () => {
  const { world } = solverInput({
    villages: [prodVillage(1)], academyLevels: new Map([[1, 1]]), mineLevels: new Map([[1, [0, 0, 0]]]), config: enc1,
  });
  assert.ok(Math.abs(world.villages[0].production[0] - 33 * 3.6) < 1e-9);
});

test('solverInput: an academy without mine levels gets no production margin, with a warning', () => {
  const { world, warnings } = solverInput({
    villages: [prodVillage(1), prodVillage(2)], academyLevels: new Map([[1, 1], [2, 0]]), mineLevels: new Map(), config: enc1,
  });
  assert.equal(world.villages[0].production, undefined);
  assert.equal(world.villages[1].production, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /1 academ.*mine levels/);
});

test('solverInput: no base production in the config -> the classic 30, with a warning', () => {
  const { world, warnings } = solverInput({
    villages: [prodVillage(1)], academyLevels: new Map([[1, 1]]), mineLevels: new Map([[1, [1, 1, 1]]]), config: { ...config, baseProduction: null },
  });
  assert.ok(Math.abs(world.villages[0].production[0] - 30 * 3.6) < 1e-9);
  assert.match(warnings.join('\n'), /base production/);
});
