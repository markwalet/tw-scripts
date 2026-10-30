// Benchmark harness: run a solver on a world, check the plan, time it, and compare the
// package count with a cheap upper bound (resources and warehouses only, ignoring
// merchants and distance). Reusable by the solver ticket and by `solver.bench.js`.

import { DEFAULTS } from '../../../src/package-planner/core/solver.js';
import { verifyPlan } from './verify-plan.js';

/** Packages the resources and the academy warehouses could hold at best. */
export function upperBound(world, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const totals = [0, 0, 0];
  let warehouses = 0;
  for (const v of world.villages) {
    for (let k = 0; k < 3; k++) totals[k] += v.academy ? v.res[k] : Math.max(0, v.res[k] - o.reserve[k]);
    if (v.academy) {
      const room = v.storage * (1 - o.bufferPct / 100);
      warehouses += Math.min(...[0, 1, 2].map((k) => Math.floor(Math.max(room, v.res[k]) / o.cost[k])));
    }
  }
  return Math.min(warehouses, ...totals.map((t, k) => Math.floor(t / o.cost[k])), o.maxPackages);
}

/**
 * @param {(world: any, options: any) => any} solver
 * @returns {{ packages: number, bound: number, ms: number, merchants: number, longestSeconds: number, resourceHours: number, errors: string[] }}
 */
export function runCase(solver, world, options = {}, repeat = 1) {
  let plan;
  const t0 = performance.now();
  for (let i = 0; i < repeat; i++) plan = solver(world, options);
  const ms = (performance.now() - t0) / repeat;
  return {
    packages: plan.packages,
    bound: upperBound(world, options),
    ms: Math.round(ms * 10) / 10,
    merchants: plan.merchants,
    longestSeconds: plan.longestSeconds,
    resourceHours: Math.round(plan.resourceHours),
    errors: verifyPlan(world, options, plan),
  };
}
