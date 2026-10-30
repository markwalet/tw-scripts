// Solver benchmark (not part of `npm test`): node test/package-planner/solver.bench.js
// Synthetic worlds around the spec's target size (~500 villages / ~120 academies).

import { solve } from '../../src/package-planner/core/solver.js';
import { generateWorld } from './fixtures/world-gen.js';
import { runCase } from './fixtures/harness.js';

const cases = [
  { name: '100 villages / 25 academies', world: { villages: 100, academies: 25 } },
  { name: '500 / 120, half-full warehouses', world: { villages: 500, academies: 120 } },
  { name: '500 / 120, mostly full', world: { villages: 500, academies: 120, fill: 0.9 } },
  { name: '500 / 120, nearly empty', world: { villages: 500, academies: 120, fill: 0.15 } },
  { name: '500 / 120, few merchants', world: { villages: 500, academies: 120, maxMerchants: 40 } },
  { name: '500 / 120, production, max 3h', world: { villages: 500, academies: 120, production: true }, options: { maxTravelSeconds: 3 * 3600 } },
  { name: '500 / 120, wide map, max 2h', world: { villages: 500, academies: 120, spread: 120 }, options: { maxTravelSeconds: 2 * 3600 } },
  { name: '800 / 200', world: { villages: 800, academies: 200 } },
];

for (const c of cases) {
  for (const seed of [1, 2, 3]) {
    const world = generateWorld({ seed, ...c.world });
    const r = runCase(solve, world, c.options);
    console.log(
      `${c.name.padEnd(34)} seed ${seed}  ${String(r.packages).padStart(4)} / bound ${String(r.bound).padStart(4)}` +
        `  ${String(r.ms).padStart(7)} ms  ${r.merchants} merchants  ${r.errors.length ? 'INVALID: ' + r.errors[0] : 'valid'}`,
    );
  }
}
