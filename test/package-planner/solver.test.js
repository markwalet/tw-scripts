import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../../src/package-planner/core/solver.js';
import { verifyPlan } from './fixtures/verify-plan.js';
import { generateTinyWorld } from './fixtures/world-gen.js';
import { bruteForce, planModelCost } from './fixtures/brute-force.js';
import { balancerFailures } from './fixtures/balancer-failures.js';

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

test('an academy empties itself into another academy when that completes a package', () => {
  // Either direction completes one package, but only academy 2 has the merchants.
  const world = {
    villages: [academy(1, 500, 500, [28000, 30000, 0], 10), academy(2, 503, 504, [0, 0, 25000], 30)],
  };
  const plan = solveValid(world);
  assert.deepEqual(plan.perAcademy, [{ id: 1, packages: 1 }]);
  assert.deepEqual(plan.transports, [{ from: 2, to: 1, res: [0, 0, 25000], merchants: 25, seconds: 1800 }]);
});

test('resources already on the way count as present', () => {
  const world = {
    villages: [academy(1, 500, 500, [0, 0, 0], 100, { inflight: [28000, 30000, 25000] }), village(2, 503, 504, [90000, 90000, 90000])],
  };
  const plan = solveValid(world, { maxPackages: 1 });
  assert.equal(plan.packages, 1);
  assert.deepEqual(plan.transports, []);
});

test('the noble target caps the packages', () => {
  const world = { villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [90000, 90000, 90000], 300)] };
  assert.equal(solveValid(world).packages, 3);
  assert.equal(solveValid(world, { maxPackages: 2 }).packages, 2);
});

test('tiny random worlds: package count equals the brute-force optimum', () => {
  let notCheapest = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { world, options } = generateTinyWorld(seed);
    const plan = solveValid(world, options);
    const best = bruteForce(world, options);
    assert.equal(plan.packages, best.packages, `seed ${seed}`);
    // Secondary objective: resource-hours. Allowed slack: 6%, in at most 1% of worlds
    // (the spike measured 1 world in 3000 off, by 5%).
    const cost = planModelCost(world, options, plan);
    assert.ok(cost >= best.cost, `seed ${seed}: beats the optimum?`);
    assert.ok(cost <= best.cost * 1.06, `seed ${seed}: cost ${cost} vs optimum ${best.cost}`);
    if (cost > best.cost) notCheapest++;
  }
  assert.ok(notCheapest <= 4, `${notCheapest} of 400 worlds not cost-optimal`);
});

for (const [name, { world, options, expected }] of Object.entries(balancerFailures)) {
  test(`old balancer failure case: ${name}`, () => {
    const plan = solveValid(world, options);
    assert.equal(plan.packages, expected.packages);
    assert.deepEqual(plan.perAcademy, expected.perAcademy);
    if (expected.transports) assert.deepEqual(plan.transports, expected.transports);
  });
}
