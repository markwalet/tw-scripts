// Independent plan checker: replays a plan against the raw world and lists every rule of
// DESIGN-package-planner.md §5 it breaks. Shares no logic with the solver (only the
// option defaults), so a solver bug can't hide behind the same bug in the check.

import { DEFAULTS } from '../../../src/package-planner/core/solver.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @returns {string[]} violations (empty = valid plan)
 */
export function verifyPlan(world, options, plan) {
  const o = { ...DEFAULTS, ...options };
  const cap = o.merchantCapacity;
  const byId = new Map(world.villages.map((v) => [v.id, v]));
  const errors = [];
  const out = new Map(); // id -> [w,s,i]
  const inn = new Map();
  const merchantsUsed = new Map();
  const longest = new Map(); // academy id -> longest arrival (s)
  const add = (m, id, res) => {
    const cur = m.get(id) || [0, 0, 0];
    m.set(id, cur.map((x, k) => x + res[k]));
  };

  for (const t of plan.transports) {
    const from = byId.get(t.from);
    const to = byId.get(t.to);
    if (!from || !to) { errors.push(`transport ${t.from}->${t.to}: unknown village`); continue; }
    if (t.from === t.to) errors.push(`transport ${t.from}->${t.to}: sends to itself`);
    if (from.sender === false) errors.push(`transport ${t.from}->${t.to}: source not in sender group`);
    if (!to.academy) errors.push(`transport ${t.from}->${t.to}: target is not an academy`);
    if (t.res.some((x) => !Number.isInteger(x) || x < 0)) errors.push(`transport ${t.from}->${t.to}: bad amounts ${t.res}`);
    const total = t.res[0] + t.res[1] + t.res[2];
    if (total === 0) errors.push(`transport ${t.from}->${t.to}: empty`);
    if (t.merchants !== Math.ceil(total / cap)) errors.push(`transport ${t.from}->${t.to}: ${t.merchants} merchants for ${total}`);
    const seconds = Math.round((dist(from, to) * 360) / o.worldSpeed);
    if (Math.abs(t.seconds - seconds) > 1) errors.push(`transport ${t.from}->${t.to}: travel ${t.seconds}s, expected ${seconds}s`);
    if (seconds > o.maxTravelSeconds) errors.push(`transport ${t.from}->${t.to}: ${seconds}s exceeds max travel`);
    add(out, t.from, t.res);
    add(inn, t.to, t.res);
    merchantsUsed.set(t.from, (merchantsUsed.get(t.from) || 0) + t.merchants);
    longest.set(t.to, Math.max(longest.get(t.to) || 0, seconds));
  }

  for (const [id, used] of merchantsUsed) {
    const v = byId.get(id);
    const avail = Math.max(0, v.merchants - o.keepMerchants);
    if (used > avail) errors.push(`village ${id}: uses ${used} merchants, has ${avail}`);
  }

  const packages = new Map(plan.perAcademy.map((p) => [p.id, p.packages]));
  let total = 0;
  for (const v of world.villages) {
    const o_ = out.get(v.id) || [0, 0, 0];
    const i_ = inn.get(v.id) || [0, 0, 0];
    const inflight = v.inflight || [0, 0, 0];
    const n = packages.get(v.id) || 0;
    if (n > 0 && !v.academy) errors.push(`village ${v.id}: packages planned but no academy`);
    total += n;
    for (let k = 0; k < 3; k++) {
      const homeLeft = v.res[k] - o_[k];
      if (o_[k] > 0 && homeLeft < o.reserve[k]) errors.push(`village ${v.id}: res ${k} drops to ${homeLeft}, below reserve`);
      const final = Math.min(v.res[k] + inflight[k], v.storage) - o_[k] + i_[k];
      const prod = v.production ? v.production[k] : 0;
      // Counting production: what the academy makes until its last arrival counts too.
      const made = o.countProduction ? Math.floor((prod * (longest.get(v.id) || 0)) / 3600) : 0;
      if (final + made < n * o.cost[k]) errors.push(`academy ${v.id}: res ${k} ends at ${final} + ${made} produced, ${n} packages need ${n * o.cost[k]}`);
      if (i_[k] > 0) {
        const limit = v.storage * (1 - o.bufferPct / 100) - (prod * (longest.get(v.id) || 0)) / 3600;
        if (final > limit + 1e-6) errors.push(`academy ${v.id}: res ${k} ends at ${final}, over warehouse limit ${Math.floor(limit)}`);
      }
    }
  }
  if (total !== plan.packages) errors.push(`plan claims ${plan.packages} packages, per-academy sum is ${total}`);
  if (total > o.maxPackages) errors.push(`plan has ${total} packages, cap is ${o.maxPackages}`);
  return errors;
}
