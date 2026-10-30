import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../../src/package-planner/core/solver.js';
import { verifyPlan } from './fixtures/verify-plan.js';
import { generateTinyWorld } from './fixtures/world-gen.js';
import { bruteForce, planModelCost } from './fixtures/brute-force.js';

/** Shorthand village: id, coords, resources, merchants; full 400k warehouse. */
const village = (id, x, y, res, merchants = 100, extra = {}) => ({
  id, x, y, res, merchants, storage: 400000, academy: false, ...extra,
});
const academy = (id, x, y, res, merchants = 100, extra = {}) =>
  village(id, x, y, res, merchants, { academy: true, ...extra });

function solveValid(world, options = {}) {
  const plan = solve(world, options);
  assert.deepEqual(verifyPlan(world, options, plan), []);
  return plan;
}

test('one source completes one package at an empty academy, exact amounts', () => {
  const world = {
    villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [40000, 40000, 40000])],
  };
  const plan = solveValid(world);
  assert.equal(plan.packages, 1);
  assert.deepEqual(plan.transports, [
    { from: 2, to: 1, res: [28000, 30000, 25000], merchants: 83, seconds: 5 * 360 },
  ]);
});

test('tiny random worlds: package count equals the brute-force optimum, cost no worse than 2%', () => {
  let worse = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { world, options } = generateTinyWorld(seed);
    const plan = solveValid(world, options);
    const best = bruteForce(world, options);
    assert.equal(plan.packages, best.packages, `seed ${seed}`);
    const cost = planModelCost(world, options, plan);
    assert.ok(cost >= best.cost, `seed ${seed}: beats the optimum?`);
    assert.ok(cost <= best.cost * 1.02, `seed ${seed}: cost ${cost} vs optimum ${best.cost}`);
    if (cost > best.cost) worse++;
  }
  assert.ok(worse <= 15, `${worse} of 300 worlds not cost-optimal`);
});
