import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../../src/package-planner/core/solver.js';
import { verifyPlan } from './fixtures/verify-plan.js';
import { generateTinyWorld } from './fixtures/world-gen.js';
import { bruteForce, planModelCost } from './fixtures/brute-force.js';
import { balancerFailures } from './fixtures/balancer-failures.js';
import { academyHeavy } from './fixtures/academy-heavy.js';

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

// Real Request-resources page (enc1, world speed 3.6): source offset |dx|,|dy| from the
// target -> the game's "Duration" in seconds. Merchants: 6 min/field ÷ world speed.
const MARKET_PAGE_DURATIONS = [
  [1, 0, 100], [1, 1, 141], [2, 0, 200], [2, 1, 224], [2, 2, 283], [3, 1, 316], [3, 2, 361],
  [4, 1, 412], [4, 2, 447], [5, 0, 500], [4, 3, 500], [5, 1, 510], [5, 2, 539], [5, 3, 583],
  [6, 0, 600], [6, 1, 608], [6, 2, 632], [5, 4, 640], [6, 3, 671], [7, 0, 700], [7, 1, 707],
  [7, 2, 728], [7, 3, 762], [8, 0, 800], [8, 1, 806], [7, 4, 806], [8, 2, 825], [9, 1, 906],
  [7, 6, 922], [8, 5, 943], [10, 1, 1005], [10, 2, 1020], [10, 4, 1077], [11, 0, 1100],
  [11, 2, 1118], [11, 3, 1140], [11, 4, 1170], [12, 1, 1204], [11, 5, 1208], [12, 2, 1217],
  [12, 3, 1237], [12, 4, 1265], [12, 5, 1300], [13, 3, 1334], [13, 4, 1360], [13, 5, 1393],
];

test('travel time matches the market page for the world speed', () => {
  for (const [dx, dy, seconds] of MARKET_PAGE_DURATIONS) {
    const world = { villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 500 + dx, 500 + dy, [28000, 30000, 25000])] };
    const plan = solveValid(world, { worldSpeed: 3.6 });
    assert.equal(plan.transports[0]?.seconds, seconds, `offset ${dx}|${dy}`);
  }
});

test('max travel time is a hard limit', () => {
  // The only source is 5 fields away: 1800 s at speed 1.
  const world = { villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [90000, 90000, 90000])] };
  assert.equal(solveValid(world, { maxTravelSeconds: 1800 }).packages, 1);
  assert.equal(solveValid(world, { maxTravelSeconds: 1799 }).packages, 0);
  assert.equal(solveValid(world, { worldSpeed: 2, maxTravelSeconds: 900 }).packages, 1);
});

test('sources are emptied down to the reserve, never below', () => {
  const world = { villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [40000, 40000, 40000])] };
  assert.equal(solveValid(world, { reserve: [12000, 10000, 15000] }).packages, 1);
  assert.equal(solveValid(world, { reserve: [12001, 0, 0] }).packages, 0);
});

test('merchants bound what a source ships; kept-home merchants never leave', () => {
  // One package needs 83 merchants from a single source.
  const world = (m) => ({ villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [90000, 90000, 90000], m)] });
  assert.equal(solveValid(world(83)).packages, 1);
  assert.equal(solveValid(world(82)).packages, 0);
  assert.equal(solveValid(world(100), { keepMerchants: 17 }).packages, 1);
  assert.equal(solveValid(world(100), { keepMerchants: 18 }).packages, 0);
});

test('several packages per academy, bounded by its warehouse minus the buffer', () => {
  // 100k warehouse, 2% buffer: 98k room -> 3 packages of 30k clay, not 4.
  const world = {
    villages: [academy(1, 500, 500, [0, 0, 0], 0, { storage: 100000 }), village(2, 503, 504, [400000, 400000, 400000], 1000)],
  };
  assert.equal(solveValid(world).packages, 3);
  assert.equal(solveValid(world, { cost: [24000, 24500, 24000] }).packages, 4);
  assert.equal(solveValid(world, { cost: [24000, 24500, 24000], bufferPct: 2.1 }).packages, 3);
});

test('production during travel: an exact-fit plan that would overflow gets reduced', () => {
  // 100k warehouse, 2% buffer: 98k room = exactly 4 packages of 24.5k clay. The trip takes
  // 1800 s; 1000 clay/hour arrives meanwhile, so the 4th package would overflow.
  const world = (production) => ({
    villages: [
      academy(1, 500, 500, [0, 0, 0], 0, { storage: 100000, production }),
      village(2, 503, 504, [400000, 400000, 400000], 1000),
    ],
  });
  const cost = [24000, 24500, 24000];
  assert.equal(solveValid(world(undefined), { cost }).packages, 4);
  assert.equal(solveValid(world([0, 1000, 0]), { cost }).packages, 3);
  assert.equal(solveValid(world([0, 1000, 0]), { cost, bufferPct: 0 }).packages, 4);
});

test("production margin: the plan's own longest arrival counts, not the farthest possible source", () => {
  // 4 packages need 97.6k clay; room is 98k − 1000/hour × trip. The near source (1 field,
  // 360 s) fills it; a far one (50 fields, 5 h) would cost the margin 5000. Planning the
  // margin for the far trip the plan never makes would lose a package.
  const world = {
    villages: [
      academy(1, 500, 500, [0, 0, 0], 0, { storage: 100000, production: [0, 1000, 0] }),
      village(2, 501, 500, [400000, 400000, 400000], 1000),
      village(3, 550, 500, [400000, 400000, 400000], 1000),
    ],
  };
  const plan = solveValid(world, { cost: [24000, 24400, 24000] });
  assert.equal(plan.packages, 4);
  assert.deepEqual(plan.transports.map((t) => t.from), [2]);
});

test('villages outside the sender group never send', () => {
  const world = { villages: [academy(1, 500, 500, [0, 0, 0]), village(2, 503, 504, [90000, 90000, 90000], 100, { sender: false })] };
  assert.equal(solveValid(world).packages, 0);
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

test('a real account where nearly every village has an academy: leftovers pooled across all of them', () => {
  // 72 = the unpruned solver on this world (every source may ship to every academy); the
  // whole-load iron bound is 73. Shipping only to each source's 20 nearest academies got 58.
  const { world, options } = academyHeavy;
  assert.equal(solveValid(world, options).packages, 72);
});

for (const [name, { world, options, expected }] of Object.entries(balancerFailures)) {
  test(`old balancer failure case: ${name}`, () => {
    const plan = solveValid(world, options);
    assert.equal(plan.packages, expected.packages);
    assert.deepEqual(plan.perAcademy, expected.perAcademy);
    if (expected.transports) assert.deepEqual(plan.transports, expected.transports);
  });
}
