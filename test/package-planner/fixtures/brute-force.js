// Brute-force optimum for tiny worlds: try EVERY package vector n (one count per academy),
// keep the feasible ones with the most packages, then the cheapest. Feasibility and cost
// for a fixed n come from a plain Bellman-Ford min-cost flow, written separately from the
// solver's Dijkstra engine so the two can disagree.
//
// It optimises the same discretised model as the solver (DESIGN-package-planner.md §5):
// one unit = one merchant load of one resource; a source ships whole units of what it has
// above its reserve; an academy's deficit is rounded up to whole units; imports must fit
// under storage × (1 − buffer) − production × longest candidate arrival.

import { DEFAULTS } from '../../../src/package-planner/core/solver.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Model cost of a plan (Σ units × distance, as the brute force counts it). */
export function planModelCost(world, options, plan) {
  const U = { ...DEFAULTS, ...options }.merchantCapacity;
  const byId = new Map(world.villages.map((v) => [v.id, v]));
  let cost = 0;
  for (const t of plan.transports) {
    const units = t.res.reduce((s, x) => s + Math.ceil(x / U), 0);
    cost += units * Math.round(dist(byId.get(t.from), byId.get(t.to)) * 100);
  }
  return cost;
}

export function bruteForce(world, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const U = o.merchantCapacity;
  const acad = world.villages.filter((v) => v.academy);
  const send = world.villages.filter((v) => v.sender !== false && v.merchants - o.keepMerchants > 0);
  const edges = [];
  for (const v of send) {
    for (const a of acad) {
      if (a === v) continue;
      const d = dist(v, a);
      const seconds = Math.round(d * o.secondsPerField);
      if (seconds <= o.maxTravelSeconds) edges.push({ v, a, d, seconds });
    }
  }
  const info = new Map(acad.map((a) => {
    const fl = a.inflight || [0, 0, 0];
    const own = a.res.map((r, k) => Math.min(r + fl[k], a.storage));
    const last = Math.max(0, ...edges.filter((e) => e.a === a).map((e) => e.seconds));
    let max = Infinity;
    for (let k = 0; k < 3; k++) {
      const prod = a.production ? a.production[k] : 0;
      const limit = Math.floor(a.storage * (1 - o.bufferPct / 100) - (prod * last) / 3600);
      max = Math.min(max, Math.floor(Math.max(limit, own[k]) / o.cost[k]));
    }
    return [a, { own, max, fromInflight: own.map((x, k) => Math.max(0, x - a.res[k])) }];
  }));

  let best = { packages: 0, cost: 0, n: acad.map(() => 0) };
  const n = acad.map(() => 0);
  const visit = (i) => {
    if (i === acad.length) {
      const total = n.reduce((s, x) => s + x, 0);
      if (total > o.maxPackages || total < best.packages) return;
      const cost = flowCost(n);
      if (cost === null) return;
      if (total > best.packages || cost < best.cost) best = { packages: total, cost, n: [...n] };
      return;
    }
    for (let x = 0; x <= info.get(acad[i]).max; x++) { n[i] = x; visit(i + 1); }
  };

  // Min-cost flow for fixed n, or null when some deficit can't be covered.
  function flowCost(nv) {
    const arcs = []; // [from, to, cap, cost]
    const node = new Map();
    const id = (key) => { if (!node.has(key)) node.set(key, node.size); return node.get(key); };
    const S = id('S');
    const T = id('T');
    const arc = (u, v, cap, cost) => { arcs.push([u, v, cap, cost], [v, u, 0, -cost]); };
    let need = 0;
    for (const v of send) {
      arc(S, id(`m${v.id}`), v.merchants - o.keepMerchants, 0);
      const ai = acad.indexOf(v);
      for (let k = 0; k < 3; k++) {
        let keep = o.reserve[k];
        if (ai >= 0) keep = Math.max(keep, nv[ai] * o.cost[k] - info.get(v).fromInflight[k]);
        arc(id(`m${v.id}`), id(`r${v.id},${k}`), Math.floor(Math.max(0, v.res[k] - keep) / U), 0);
      }
    }
    acad.forEach((a, ai) => {
      for (let k = 0; k < 3; k++) {
        const units = Math.ceil(Math.max(0, nv[ai] * o.cost[k] - info.get(a).own[k]) / U);
        need += units;
        arc(id(`d${a.id},${k}`), T, units, 0);
      }
    });
    for (const e of edges) for (let k = 0; k < 3; k++) arc(id(`r${e.v.id},${k}`), id(`d${e.a.id},${k}`), 1e9, Math.round(e.d * 100));

    let flow = 0;
    let cost = 0;
    for (;;) {
      const d = new Array(node.size).fill(Infinity);
      const prev = new Array(node.size).fill(-1);
      d[S] = 0;
      for (let round = 0; round < node.size; round++) {
        let changed = false;
        arcs.forEach(([u, v, cap, w], i) => {
          if (cap > 0 && d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = i; changed = true; }
        });
        if (!changed) break;
      }
      if (d[T] === Infinity) break;
      let amt = Infinity;
      for (let v = T; v !== S; v = arcs[prev[v]][0]) amt = Math.min(amt, arcs[prev[v]][2]);
      for (let v = T; v !== S; v = arcs[prev[v]][0]) {
        arcs[prev[v]][2] -= amt;
        arcs[prev[v] ^ 1][2] += amt;
      }
      flow += amt;
      cost += amt * d[T];
    }
    return flow === need ? cost : null;
  }

  visit(0);
  return best;
}
