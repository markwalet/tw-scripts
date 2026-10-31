import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../../src/package-planner/core/solver.js';
import { verifyPlan } from './fixtures/verify-plan.js';
import { generateTinyWorld, generateWorld } from './fixtures/world-gen.js';
import { bruteForce, planModelCost } from './fixtures/brute-force.js';
import { balancerFailures } from './fixtures/balancer-failures.js';
import { academyHeavy } from './fixtures/academy-heavy.js';
import { academyHeavyProduction } from './fixtures/academy-heavy-production.js';

/** Shorthand village: id, coords, resources, merchants; full 400k warehouse. */
const village = (id, x, y, res, merchants = 100, extra = {}) => ({
  id, x, y, res, merchants, storage: 400000, academy: false, ...extra,
});
const academy = (id, x, y, res, merchants = 100, extra = {}) =>
  village(id, x, y, res, merchants, { academy: true, ...extra });

/** Options that turn the travel-cap search off: one solve under the user's cap. */
const SINGLE_SOLVE = { capFactors: [], capTighten: 0 };

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

/** The world after `sent` left: sources lose resources + merchants, targets get them in flight. */
function afterSending(world, sent) {
  const villages = world.villages.map((v) => ({ ...v, res: [...v.res], inflight: [...(v.inflight || [0, 0, 0])] }));
  const byId = new Map(villages.map((v) => [v.id, v]));
  for (const t of sent) {
    const from = byId.get(t.from);
    const to = byId.get(t.to);
    from.merchants -= t.merchants;
    for (let k = 0; k < 3; k++) {
      from.res[k] -= t.res[k];
      to.inflight[k] += t.res[k];
    }
  }
  return { villages };
}

test('a rerun with the whole previous plan in flight plans no transports, same packages', () => {
  const world = {
    villages: [
      academy(1, 500, 500, [0, 0, 0]), academy(2, 510, 500, [10000, 0, 0]),
      village(3, 503, 504, [40000, 40000, 40000]), village(4, 507, 501, [50000, 20000, 30000]), village(5, 505, 497, [30000, 60000, 40000]),
    ],
  };
  const first = solveValid(world);
  assert.ok(first.packages >= 3 && first.transports.length >= 3);
  const rerun = solveValid(afterSending(world, first.transports));
  assert.equal(rerun.packages, first.packages);
  assert.deepEqual(rerun.transports, []);
});

test('a rerun after a partial send plans only the rest: the same packages, nothing sent twice', () => {
  const world = {
    villages: [
      academy(1, 500, 500, [0, 0, 0]), academy(2, 510, 500, [10000, 0, 0]),
      village(3, 503, 504, [40000, 40000, 40000]), village(4, 507, 501, [50000, 20000, 30000]), village(5, 505, 497, [30000, 60000, 40000]),
    ],
  };
  const first = solveValid(world);
  const sent = first.transports.slice(0, 2);
  const rerun = solveValid(afterSending(world, sent));
  assert.equal(rerun.packages, first.packages);
  assert.ok(rerun.transports.length > 0);
  const shipped = (ts) => ts.reduce((s, t) => s + t.res[0] + t.res[1] + t.res[2], 0);
  assert.ok(shipped(rerun.transports) <= shipped(first.transports) - shipped(sent));
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

test('one merchant carries a mix of resources: the merchants that saves carry another package', () => {
  // Each academy holds 500 wood + 500 clay, so a package needs 27.5k + 29.5k + 25k = 82k:
  // 82 merchants, although per resource that is 28 + 30 + 25 = 83 loads. 165 merchants
  // carry two packages (164), not one.
  const world = {
    villages: [
      academy(1, 500, 500, [500, 500, 0], 0), academy(2, 510, 500, [500, 500, 0], 0),
      village(3, 505, 500, [100000, 100000, 100000], 165),
    ],
  };
  const plan = solveValid(world);
  assert.equal(plan.packages, 2);
  assert.equal(plan.merchants, 164);
});

test("an academy's partial loads share one merchant even when another source ships farther", () => {
  // The near source (60 merchants) ships 5k wood + all clay and iron; the far one only
  // has wood (23k). The 500 wood + 500 clay over 82k come off the same transport: 82
  // merchants, not 83.
  const world = {
    villages: [
      academy(1, 500, 500, [500, 500, 0], 0),
      village(2, 503, 500, [100000, 100000, 100000], 60), village(3, 510, 500, [100000, 0, 0], 100),
    ],
  };
  const plan = solveValid(world);
  assert.equal(plan.packages, 1);
  assert.equal(plan.merchants, 82);
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

test("counting production: the target's own production until its last arrival replaces part of the transport", () => {
  // Iron short by a whole package (25k); the only source is 5 fields away (1800 s) and the
  // academy makes 10k iron/hour: 5k of it is there when the transport arrives.
  const world = {
    villages: [
      academy(1, 500, 500, [28000, 30000, 0], 0, { production: [0, 0, 10000] }),
      village(2, 503, 504, [90000, 90000, 90000]),
    ],
  };
  const off = solveValid(world);
  assert.deepEqual(off.transports, [{ from: 2, to: 1, res: [0, 0, 25000], merchants: 25, seconds: 1800 }]);
  const on = solveValid(world, { countProduction: true });
  assert.equal(on.packages, 1);
  assert.deepEqual(on.transports, [{ from: 2, to: 1, res: [0, 0, 20000], merchants: 20, seconds: 1800 }]);
});

test('counting production: when it covers the whole shortfall, one load of the last delivery stays', () => {
  // 2k iron short; 5k is made during the 1800 s trip. Without any transport there is no
  // arrival to count production until, so one load of the farthest delivery is kept.
  const world = {
    villages: [
      academy(1, 500, 500, [28000, 30000, 23000], 0, { production: [0, 0, 10000] }),
      village(2, 503, 504, [0, 0, 90000]),
    ],
  };
  assert.deepEqual(solveValid(world).transports.map((t) => t.res), [[0, 0, 2000]]);
  assert.deepEqual(solveValid(world, { countProduction: true }).transports.map((t) => t.res), [[0, 0, 1000]]);
});

test('counting production: random worlds with production stay valid and never lose packages', () => {
  let gained = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { world, options } = generateTinyWorld(seed);
    const off = solveValid(world, options);
    const on = solveValid(world, { ...options, countProduction: true });
    assert.ok(on.packages >= off.packages, `seed ${seed}: ${on.packages} < ${off.packages}`);
    if (on.packages > off.packages) gained++;
  }
  assert.ok(gained > 0, 'production never added a package');
  // Mid-size worlds: many academies, so one academy's pin re-routes another's deliveries.
  for (let seed = 1; seed <= 12; seed++) {
    const world = generateWorld({ seed, villages: 60, academies: 30, production: true, maxMerchants: seed % 3 ? undefined : 60 });
    const off = solveValid(world, SINGLE_SOLVE);
    const on = solveValid(world, { ...SINGLE_SOLVE, countProduction: true });
    assert.ok(on.packages >= off.packages, `mid-size seed ${seed}: ${on.packages} < ${off.packages}`);
    assert.ok(on.packages > off.packages || on.merchants <= off.merchants, `mid-size seed ${seed}: more merchants for as many packages`);
  }
});

test('counting production on the real account: two more packages, fewer merchants, same last arrival', () => {
  // 63 academies making up to 9504/hour each. Pinning one academy's farthest load moves
  // flow, so the next academy's farthest delivery is read after it (reading them all first
  // once pinned a delivery that no longer carried anything: an invalid plan).
  const { world, options } = academyHeavyProduction;
  const off = solveValid(world, options);
  const on = solveValid(world, { ...options, countProduction: true });
  assert.deepEqual([off.packages, off.longestSeconds], [72, 1140]);
  assert.deepEqual([on.packages, on.longestSeconds], [74, 1140]);
  assert.ok(on.merchants < off.merchants, `${on.merchants} vs ${off.merchants} merchants`);
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
    // The travel-cap search never makes a plan worse: as many packages, and then never a
    // later last arrival than the single solve under the user's cap.
    const single = solveValid(world, { ...options, ...SINGLE_SOLVE });
    assert.ok(plan.packages > single.packages || (plan.packages === single.packages && plan.longestSeconds <= single.longestSeconds), `seed ${seed}: worse than one solve`);
    // The single solve's routing: resource-hours. Allowed slack: 6%, in at most 1% of
    // worlds (the spike measured 1 world in 3000 off, by 5%).
    assert.equal(single.packages, best.packages, `seed ${seed}`);
    const cost = planModelCost(world, options, single);
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

test('as many packages: the earlier last arrival wins over fewer resource-hours', () => {
  // Each source holds one package, each warehouse fits one. Nearest-first: 1 + 7.8 fields
  // (last arrival 7.8); crosswise: 5 + 5 fields, more resource-hours, all there after 5.
  const one = [28000, 30000, 25000];
  const small = { storage: 40000 };
  const world = {
    villages: [
      academy(1, 500, 500, [0, 0, 0], 0, small), academy(2, 506, 500, [0, 0, 0], 0, small),
      village(3, 501, 500, one), village(4, 500, 505, one),
    ],
  };
  const plan = solveValid(world);
  assert.equal(plan.packages, 2);
  assert.equal(plan.longestSeconds, 5 * 360);
  assert.deepEqual(plan.transports.map((t) => [t.from, t.to]).sort(), [[3, 2], [4, 1]]);
});

test('merchant-scarce retry: as many packages, the earlier last arrival wins (not fewer resource-hours)', () => {
  // One solve on a merchant-scarce world: both orderings make 35 packages; the merchant-
  // penalised one arrives by 4:28 (16,071 s), the cheaper one by 4:42 (16,924 s).
  const plan = solveValid(generateWorld({ seed: 2, villages: 30, academies: 10, maxMerchants: 30 }), SINGLE_SOLVE);
  assert.deepEqual([plan.packages, plan.longestSeconds], [35, 16071]);
});

test('most packages first, then the earliest last arrival: a tighter travel cap the user never set can win both', () => {
  // Single solves on this real account: no cap 71 / 0:31, cap 25 min 71 / 0:23, cap 20 min
  // 72 / 0:20. The solver tries such caps itself and keeps the best plan.
  const { world, options } = academyHeavyProduction;
  const plan = solveValid(world, options);
  assert.ok(plan.packages >= 72, `${plan.packages} packages`);
  assert.ok(plan.longestSeconds <= 20 * 60, `last arrival ${plan.longestSeconds} s`);
});

for (const [name, { world, options, expected }] of Object.entries(balancerFailures)) {
  test(`old balancer failure case: ${name}`, () => {
    const plan = solveValid(world, options);
    assert.equal(plan.packages, expected.packages);
    assert.deepEqual(plan.perAcademy, expected.perAcademy);
    if (expected.transports) assert.deepEqual(plan.transports, expected.transports);
  });
}
