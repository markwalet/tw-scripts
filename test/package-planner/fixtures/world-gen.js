// Synthetic-world generator for the package-planner solver (DESIGN-package-planner.md §5).
// Deterministic (seeded) so failures reproduce. Produces the solver's input shape:
// villages with resources, warehouse, merchants, coords and an academy flag.

/** Small seeded PRNG (mulberry32). */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} p
 * @param {number} p.villages
 * @param {number} p.academies
 * @param {number} [p.seed]
 * @param {number} [p.spread]        map radius in fields around 500|500
 * @param {number} [p.storage]       max warehouse capacity
 * @param {number} [p.maxMerchants]
 * @param {number} [p.fill]          0..1, how full warehouses are on average
 * @param {boolean} [p.production]   give villages a production rate (resources/hour)
 * @param {number} [p.round]         round resources to this step (1 = exact)
 */
export function generateWorld({
  villages,
  academies,
  seed = 1,
  spread = 40,
  storage = 400000,
  maxMerchants = 235,
  fill = 0.5,
  production = false,
  round = 1,
}) {
  const r = rng(seed);
  const int = (/** @type {number} */ lo, /** @type {number} */ hi) => lo + Math.floor(r() * (hi - lo + 1));
  const isAcademy = new Set();
  while (isAcademy.size < Math.min(academies, villages)) isAcademy.add(int(0, villages - 1));
  const list = [];
  for (let i = 0; i < villages; i++) {
    const cap = Math.max(round, Math.round((storage * (0.5 + 0.5 * r())) / round) * round);
    const res = [0, 0, 0].map(() => {
      const f = Math.min(1, Math.max(0, fill + (r() - 0.5) * 0.9));
      return Math.round((cap * f) / round) * round;
    });
    list.push({
      id: i + 1,
      x: 500 + int(-spread, spread),
      y: 500 + int(-spread, spread),
      res,
      storage: cap,
      merchants: int(0, maxMerchants),
      academy: isAcademy.has(i),
      production: production ? [0, 0, 0].map(() => int(500, 3000)) : undefined,
    });
  }
  return { villages: list };
}

/**
 * Tiny worlds for brute-force comparison: few villages, small package cost, so the
 * exhaustive search over package vectors stays cheap.
 */
export function generateTinyWorld(seed) {
  const r = rng(seed * 7919 + 13);
  const villages = 3 + Math.floor(r() * 4); // 3..6
  const academies = 1 + Math.floor(r() * 3); // 1..3
  const world = generateWorld({
    villages,
    academies,
    seed,
    spread: 6,
    storage: 16000,
    maxMerchants: 10,
    fill: 0.3 + r() * 0.5,
    round: 100,
  });
  const options = {
    cost: [3000, 4000, 2000],
    maxTravelSeconds: r() < 0.5 ? Infinity : 4 * 360,
    reserve: r() < 0.3 ? [1000, 0, 500] : [0, 0, 0],
  };
  return { world, options };
}
