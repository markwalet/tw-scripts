// @ts-check
// core/solver.js — the package optimiser (DESIGN-package-planner.md §5). PURE: no DOM, no
// globals. Input: villages + options. Output: a transport plan.
//
// Model. Resources move in merchant loads: one "unit" = one merchant carrying
// `merchantCapacity` of a single resource. For a FIXED package count per academy, routing
// is a min-cost flow:
//
//   S ──merchants m[v]──> V_v ──exportable[v][k]──> P_vk ──cost dist(v,a)──> D_ak (demand)
//
// where D_ak's demand is the academy's deficit (packages × cost − what it already holds,
// rounded up to whole units). The greedy adds ONE package at a time, to the academy whose
// next package is cheapest. Each addition re-routes earlier flow through the residual
// graph, so an early choice never strands a later package (the nearest-first starvation
// of the old balancer, §9). An academy whose next package is infeasible drops out for good:
// feasibility is downward closed, so it can't come back. A short local search (take one
// package away, refill) then fixes most of what a greedy order gets wrong. Last, the
// merchants that combined loads save (one merchant carries 1000 of any mix) are credited
// back to their sources and the greedy goes on, while that adds packages.

/** @typedef {[number, number, number]} Res  wood, stone (clay), iron */
/**
 * @typedef {object} Village
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {Res} res            resources at home now
 * @property {number} storage     warehouse capacity
 * @property {number} merchants   merchants available at home
 * @property {boolean} [academy]  receiver-group village with an academy (a package target)
 * @property {boolean} [sender]   in the sender group (default true)
 * @property {Res} [inflight]     resources already on the way to this village
 * @property {Res} [production]   resources per hour (warehouse margin while transports travel)
 */
/**
 * @typedef {object} Transport
 * @property {number} from
 * @property {number} to
 * @property {Res} res
 * @property {number} merchants
 * @property {number} seconds
 */
/**
 * @typedef {object} Plan
 * @property {number} packages                              total new complete packages
 * @property {{ id: number, packages: number }[]} perAcademy academies that get packages
 * @property {Transport[]} transports
 * @property {number} merchants
 * @property {number} longestSeconds
 * @property {number} resourceHours                         Σ amount × travel time
 */

export const DEFAULTS = Object.freeze({
  /** @type {Res} */ cost: [28000, 30000, 25000],
  merchantCapacity: 1000,
  /** @type {Res} */ reserve: [0, 0, 0],
  keepMerchants: 0,
  maxTravelSeconds: Infinity,
  /** World speed (`speed` in the world config). Merchants walk 6 min per field ÷ this,
   *  rounded to the second (checked against the market page); unit_speed doesn't apply. */
  worldSpeed: 1,
  bufferPct: 2,
  /** Noble target: stop at this many packages. */
  maxPackages: Infinity,
  /** Prune: each source only ships to its K nearest academies… */
  nearestAcademies: 20,
  /** …unless sources × academies is at most this: then every pair is kept. On an account
   *  where nearly every village has an academy, K = 20 lost 14 of 72 packages. */
  allPairsUpTo: 10000,
  /** Greedy keeps a package costing up to this much more than the next-best estimate
   *  (saves re-evaluating stale estimates; 0 = strict cheapest-first). */
  greedyTolerance: 0.3,
  /** Local search: at most this many passes and this many tentative packages, and only
   *  on worlds with up to this many academies. */
  improveRounds: 3,
  improveBudget: 150,
  improveMaxAcademies: 40,
});

const BIG = 1 << 30;
/** Ordering penalty per merchant load for the merchant-scarce retry (see solve()). */
const MERCHANT_PENALTY = 100000;

/**
 * Plan transports that complete as many packages as possible (then: fewest
 * resource-hours). See DESIGN-package-planner.md §5.
 * @param {{ villages: Village[] }} world
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Plan}
 */
export function solve(world, options = {}) {
  const model = buildModel(world, { ...DEFAULTS, ...options });
  let best = optimise(model, 0);
  // Cheapest-first spends merchants on cheap but merchant-hungry packages. When merchants
  // ran out before the resources did, retry with every merchant load made expensive (this
  // only changes the greedy's ORDER: for fixed packages the routing is the same min-cost
  // flow, since the number of loads is fixed by the deficits). Keep the better plan.
  if (best.packages < model.bound && best.merchantsLeft < 0.05 * model.merchants) {
    const alt = optimise(model, MERCHANT_PENALTY);
    if (alt.packages > best.packages || (alt.packages === best.packages && alt.resourceHours < best.resourceHours)) best = alt;
  }
  const { merchantsLeft, ...plan } = best;
  return plan;
}

/** Everything about the input that doesn't depend on the plan. */
function buildModel(/** @type {{ villages: Village[] }} */ world, /** @type {typeof DEFAULTS} */ o) {
  const U = o.merchantCapacity;
  const c = o.cost;
  const villages = world.villages;
  const academies = villages.filter((v) => v.academy);
  const senders = villages.filter((v) => v.sender !== false && v.merchants - o.keepMerchants > 0);
  const aIndex = new Map(academies.map((a, i) => [a, i]));

  // Candidate edges: within max travel, K nearest academies per source (all on small worlds).
  /** @type {{ s: number, a: number, d: number, seconds: number }[]} */
  const edges = [];
  const K = senders.length * academies.length <= o.allPairsUpTo ? Infinity : o.nearestAcademies;
  const longest = new Array(academies.length).fill(0);
  senders.forEach((v, s) => {
    const near = [];
    for (let a = 0; a < academies.length; a++) {
      if (academies[a] === v) continue;
      const d = Math.hypot(v.x - academies[a].x, v.y - academies[a].y);
      const seconds = Math.round((d * 360) / o.worldSpeed);
      if (seconds <= o.maxTravelSeconds) near.push({ s, a, d, seconds });
    }
    near.sort((p, q) => p.d - q.d);
    for (const e of near.slice(0, K)) {
      edges.push(e);
      longest[e.a] = Math.max(longest[e.a], e.seconds);
    }
  });

  // Per academy: what it holds (in-flight counts, capped by the warehouse) and the most
  // packages its warehouse allows. Imports must fit under storage − buffer − production
  // during the longest candidate trip (safe side; optimise() narrows it to the plan's own
  // longest arrival afterwards).
  const info = academies.map((a, i) => {
    const inflight = a.inflight || [0, 0, 0];
    const own = [0, 1, 2].map((k) => Math.min(a.res[k] + inflight[k], a.storage));
    /** Packages that fit when transports arrive up to `seconds` from now. */
    const fit = (/** @type {number} */ seconds) => Math.min(...[0, 1, 2].map((k) => {
      const prod = a.production ? a.production[k] : 0;
      const limit = Math.floor(a.storage * (1 - o.bufferPct / 100) - (prod * seconds) / 3600);
      return Math.floor(Math.max(limit, own[k]) / c[k]);
    }));
    return { own, inflightHeld: own.map((x, k) => Math.max(0, x - a.res[k])), max: fit(longest[i]), fit };
  });

  const bound = Math.min(
    o.maxPackages,
    info.reduce((sum, x) => sum + x.max, 0),
    ...[0, 1, 2].map((k) => Math.floor(villages.reduce((sum, v) => sum + v.res[k] + (v.inflight ? v.inflight[k] : 0), 0) / c[k])),
  );
  const merchants = senders.reduce((sum, v) => sum + v.merchants - o.keepMerchants, 0);

  return {
    o, academies, senders, aIndex, edges, info, bound, merchants,
    /** Units of resource k academy ai still needs for n packages. */
    deficit: (/** @type {number} */ ai, /** @type {number} */ n, /** @type {number} */ k) =>
      Math.ceil(Math.max(0, n * c[k] - info[ai].own[k]) / U),
    /** Whole units a village may ship of resource k; an academy keeps what its n packages need. */
    exportable: (/** @type {Village} */ v, /** @type {number} */ n, /** @type {number} */ k) => {
      const ai = aIndex.get(v);
      const keep = ai === undefined ? o.reserve[k] : Math.max(o.reserve[k], n * c[k] - info[ai].inflightHeld[k]);
      return Math.floor(Math.max(0, v.res[k] - keep) / U);
    },
  };
}

/**
 * Greedy + local search for one ordering penalty (cost added per merchant load).
 * @param {ReturnType<typeof buildModel>} model
 * @param {number} penalty
 */
function optimise(model, penalty) {
  const { o, academies, senders, aIndex, edges, info, deficit, exportable } = model;
  const U = o.merchantCapacity;
  const c = o.cost;

  // Network: S = 0, V_s, P_sk, D_ak.
  const V = (/** @type {number} */ s) => 1 + s;
  const P = (/** @type {number} */ s, /** @type {number} */ k) => 1 + senders.length + 3 * s + k;
  const D = (/** @type {number} */ a, /** @type {number} */ k) => 1 + 4 * senders.length + 3 * a + k;
  const net = new FlowNetwork(1 + 4 * senders.length + 3 * academies.length);
  /** Export arcs of academies that also send: academy index -> arc per resource. */
  const exportArcs = new Map();
  const merchantArcs = senders.map((v, s) => {
    const arc = net.addArc(0, V(s), v.merchants - o.keepMerchants, 0);
    const arcs = [0, 1, 2].map((k) => net.addArc(V(s), P(s, k), exportable(v, 0, k), 0));
    const ai = aIndex.get(v);
    if (ai !== undefined) exportArcs.set(ai, arcs);
    return arc;
  });
  const shipArcs = edges.map((e) => [0, 1, 2].map((k) => net.addArc(P(e.s, k), D(e.a, k), BIG, Math.round(e.d * 100) + penalty)));
  net.freeze();

  const n = new Array(academies.length).fill(0);
  const max = info.map((x) => x.max);
  let alive = max.map((m) => m > 0);
  /** Estimated cost of each academy's next package (exact when evaluated, then stale). */
  const key = new Array(academies.length).fill(0);
  let total = 0;
  let attempts = 0;
  let budget = Infinity;

  /** Change academy a's package count by ±1 and re-route. False if infeasible. */
  const step = (/** @type {number} */ a, /** @type {number} */ by) => {
    n[a] += by;
    total += by;
    for (let k = 0; k < 3; k++) {
      net.addDemand(D(a, k), deficit(a, n[a], k) - deficit(a, n[a] - by, k));
      const arcs = exportArcs.get(a);
      if (arcs) net.setCap(arcs[k], exportable(academies[a], n[a], k));
    }
    return net.resolve();
  };

  /** Lower bound on academy a's next package: every missing load at its cheapest path. */
  const lowerBound = (/** @type {number} */ a) => {
    let lb = 0;
    for (let k = 0; k < 3; k++) {
      const units = deficit(a, n[a] + 1, k) - deficit(a, n[a], k);
      if (units) lb += units * net.cheapestPath(D(a, k));
    }
    return lb;
  };

  // Greedy: cheapest next package, evaluated lazily (try it; keep it if it's still the
  // cheapest estimate, else roll back with its now-exact cost). Before trying a stale
  // estimate, a cheap lower bound may already show it's not the cheapest (or impossible).
  let epoch = 0;
  const seen = new Array(academies.length).fill(-1);
  const fill = () => {
    while (total < o.maxPackages && attempts < budget) {
      let best = -1;
      let second = Infinity;
      for (let a = 0; a < academies.length; a++) {
        if (!alive[a]) continue;
        if (best < 0 || key[a] < key[best]) { if (best >= 0) second = Math.min(second, key[best]); best = a; }
        else second = Math.min(second, key[a]);
      }
      if (best < 0) return;
      if (seen[best] < epoch) {
        seen[best] = epoch;
        const lb = lowerBound(best);
        if (lb === Infinity) { alive[best] = false; continue; }
        if (lb > key[best]) key[best] = lb;
        if (lb > second * (1 + o.greedyTolerance)) continue;
      }
      const cp = net.checkpoint();
      const before = net.totalCost;
      const ok = step(best, +1);
      attempts++;
      const cost = net.totalCost - before;
      if (ok && cost <= second * (1 + o.greedyTolerance)) {
        net.commit();
        epoch++;
        key[best] = cost;
        if (n[best] >= max[best]) alive[best] = false;
      } else {
        net.rollback(cp);
        n[best]--;
        total--;
        if (ok) { key[best] = cost; seen[best] = epoch; }
        else alive[best] = false;
      }
    }
  };
  fill();

  /** Tentative: apply `change`, refill greedily; keep it if `better(before)`, else undo. */
  const attempt = (/** @type {() => void} */ change, /** @type {(before: { total: number, cost: number }) => boolean} */ better) => {
    const cp = net.checkpoint();
    const saved = { n: [...n], key: [...key], alive, total, cost: net.totalCost };
    change();
    epoch++;
    fill();
    if (better(saved)) return net.commit(), true;
    net.rollback(cp);
    n.splice(0, n.length, ...saved.n);
    key.splice(0, key.length, ...saved.key);
    ({ alive, total } = saved);
    return false;
  };

  // Local search: take one package away from an academy and refill greedily. Keep the
  // result if it has more packages, or as many for fewer resource-hours. Bounded by a
  // budget of tentative packages. It pays off on small and mid-size worlds (up to +9% on
  // merchant-scarce ones); on big worlds each refill is slow and the spike measured no gain.
  budget = academies.length <= o.improveMaxAcademies ? attempts + o.improveBudget : 0;
  for (let round = 0, improved = true; improved && round < o.improveRounds && attempts < budget; round++) {
    improved = false;
    for (let a = 0; a < academies.length && attempts < budget; a++) {
      if (n[a] && attempt(() => { step(a, -1); alive = n.map((x, i) => i !== a && x < max[i]); },
        (was) => total > was.total || (total === was.total && net.totalCost < was.cost))) improved = true;
    }
  }

  // Production margin, narrowed. It is circular: the margin limits the plan, and the plan
  // sets the longest arrival. The greedy above assumed the longest CANDIDATE trip into each
  // academy (safe). An academy now held at that cap gets the margin of its own longest
  // planned arrival instead, and from here on only takes deliveries that arrive no later
  // (its longer arcs close). Then the greedy goes on in the same network. Valid by
  // construction, no second solve.
  const horizon = new Array(academies.length).fill(-1);
  edges.forEach((e, i) => {
    if (shipArcs[i].some((arc) => net.flow(arc) > 0)) horizon[e.a] = Math.max(horizon[e.a], e.seconds);
  });
  alive = academies.map((_, a) => {
    if (n[a] < max[a] || horizon[a] < 0) return false;
    const m = info[a].fit(horizon[a]);
    if (m <= max[a]) return false;
    max[a] = m;
    return true;
  });
  if (alive.some(Boolean)) {
    edges.forEach((e, i) => {
      if (alive[e.a] && e.seconds > horizon[e.a]) for (const arc of shipArcs[i]) net.setCap(arc, 0);
    });
    epoch++;
    budget = Infinity;
    fill();
  }

  // Read the flow back as transports; trim each academy's overshoot (< one load per
  // resource) off its farthest deliveries, so a partial last merchant only ever completes
  // a package. Nothing is dropped from the books: every planned resource is delivered.
  const readBack = () => {
    /** @type {Map<string, Transport & { d: number, s: number }>} */
    const byPair = new Map();
    edges.forEach((e, i) => {
      for (let k = 0; k < 3; k++) {
        const units = net.flow(shipArcs[i][k]);
        if (!units) continue;
        const id = `${e.s},${e.a}`;
        let t = byPair.get(id);
        if (!t) {
          t = { from: senders[e.s].id, to: academies[e.a].id, res: [0, 0, 0], merchants: 0, seconds: e.seconds, d: e.d, s: e.s };
          byPair.set(id, t);
        }
        t.res[k] += units * U;
      }
    });
    const transports = [...byPair.values()];
    academies.forEach((a, ai) => {
      const into = transports.filter((t) => t.to === a.id).sort((p, q) => q.d - p.d);
      const over = [0, 1, 2].map((k) => into.reduce((sum, t) => sum + t.res[k], 0) - Math.max(0, n[ai] * c[k] - info[ai].own[k]));
      // All overshoot off ONE transport if one carries enough of each: those partial loads
      // then share merchants. Else off the farthest deliveries of each resource.
      const one = into.find((t) => t.res.every((x, k) => x >= over[k]));
      for (let k = 0; k < 3; k++) {
        for (const t of one ? [one] : into) {
          const cut = Math.min(over[k], t.res[k]);
          t.res[k] -= cut;
          over[k] -= cut;
        }
      }
    });
    const result = transports.filter((t) => t.res[0] + t.res[1] + t.res[2] > 0);
    /** Merchants each source really uses: one per 1000 of COMBINED resources. */
    const used = senders.map(() => 0);
    for (const t of result) used[t.s] += t.merchants = Math.ceil((t.res[0] + t.res[1] + t.res[2]) / U);
    return { result, used };
  };

  // Combined loads. The flow counts a merchant per 1000 of ONE resource, but after the trim
  // a merchant carries 1000 of any mix (730 wood + 270 clay = 1 merchant, not 2). Credit
  // each source the merchants that saves and let the greedy go on; keep the result only if
  // it gained packages and every source still fits its real merchants. Repeat.
  const avail = senders.map((v) => v.merchants - o.keepMerchants);
  let read = readBack();
  let next = read;
  budget = senders.length * academies.length <= o.allPairsUpTo ? Infinity : 0;
  while (budget && attempt(() => {
    senders.forEach((_, s) => net.setCap(merchantArcs[s], avail[s] + net.flow(merchantArcs[s]) - read.used[s]));
    net.resolve();
    alive = n.map((x, i) => x < max[i]);
  }, (was) => total > was.total && (next = readBack()).used.every((u, s) => u <= avail[s]))) read = next;
  const result = read.result.map(({ d, s, ...t }) => t);

  return {
    packages: total,
    perAcademy: academies.map((a, i) => ({ id: a.id, packages: n[i] })).filter((p) => p.packages > 0),
    transports: result,
    merchants: result.reduce((sum, t) => sum + t.merchants, 0),
    longestSeconds: result.reduce((m, t) => Math.max(m, t.seconds), 0),
    resourceHours: result.reduce((sum, t) => sum + ((t.res[0] + t.res[1] + t.res[2]) * t.seconds) / 3600, 0),
    merchantsLeft: avail.reduce((sum, m, s) => sum + m - net.flow(merchantArcs[s]), 0),
  };
}

/**
 * Min-cost flow on a residual graph, solved by successive shortest paths (Dijkstra with
 * node potentials). Supply comes from node 0 (S, unlimited, optional); demands sit on
 * nodes (`addDemand`). Capacities may change (`setCap`); the flow that no longer fits
 * becomes an excess/demand pair that `resolve` re-routes, so potentials stay valid.
 * Every change is logged, so a tentative step can be rolled back cheaply.
 */
class FlowNetwork {
  /** @param {number} nodes */
  constructor(nodes) {
    this.nodes = nodes;
    /** @type {number[]} */ this._tail = [];
    /** @type {number[]} */ this._head = [];
    /** @type {number[]} */ this._cap = [];
    /** @type {number[]} */ this._cost = [];
    this.totalCost = 0;
    this.head = new Int32Array(0);
    this.cap = new Int32Array(0);
    this.cost = new Float64Array(0);
    this.adjStart = new Int32Array(0);
    this.adj = new Int32Array(0);
    this.pi = new Float64Array(nodes);
    this.bal = new Int32Array(nodes); // > 0 excess, < 0 unmet demand
    /** @type {number[]} */ this.pending = [];
    this.dist = new Float64Array(nodes).fill(Infinity);
    this.prev = new Int32Array(nodes);
    this.path = new Int32Array(nodes);
    /** @type {number[]} */ this.touched = [];
    this.heap = new MinHeap(16);
    /** Undo log: triples (array id, index, old value). */
    /** @type {number[]} */ this.log = [];
    this.open = 0;
    this.lastDist = 0;
  }

  /** @param {number} u @param {number} v @param {number} cap @param {number} cost */
  addArc(u, v, cap, cost) {
    this._tail.push(u, v);
    this._head.push(v, u);
    this._cap.push(Math.max(0, cap), 0);
    this._cost.push(cost, -cost);
    return this._tail.length - 2;
  }

  freeze() {
    const m = this._tail.length;
    this.head = Int32Array.from(this._head);
    this.cap = Int32Array.from(this._cap);
    this.cost = Float64Array.from(this._cost);
    this.adjStart = new Int32Array(this.nodes + 1);
    for (const u of this._tail) this.adjStart[u + 1]++;
    for (let i = 0; i < this.nodes; i++) this.adjStart[i + 1] += this.adjStart[i];
    const fill = this.adjStart.slice(0, this.nodes);
    this.adj = new Int32Array(m);
    for (let e = 0; e < m; e++) this.adj[fill[this._tail[e]]++] = e;
    this.heap = new MinHeap(m + 1);
    this.arrays = [this.cap, this.pi, this.bal];
  }

  /** Logged write. @param {0|1|2} which cap, pi, bal @param {number} i @param {number} value */
  _set(which, i, value) {
    const arr = /** @type {(Int32Array|Float64Array)[]} */ (this.arrays)[which];
    if (this.open) this.log.push(which, i, arr[i]);
    arr[i] = value;
  }

  /** Start a tentative change; undo it with rollback(), keep it with commit(). */
  checkpoint() {
    this.open++;
    return { at: this.log.length, totalCost: this.totalCost, pending: [...this.pending] };
  }

  /** @param {ReturnType<FlowNetwork['checkpoint']>} cp */
  rollback(cp) {
    const arrays = /** @type {(Int32Array|Float64Array)[]} */ (this.arrays);
    for (let i = this.log.length - 3; i >= cp.at; i -= 3) arrays[this.log[i]][this.log[i + 1]] = this.log[i + 2];
    this.log.length = cp.at;
    this.totalCost = cp.totalCost;
    this.pending = cp.pending;
    if (!--this.open) this.log.length = 0;
  }

  commit() {
    if (!--this.open) this.log.length = 0;
  }

  /** @param {number} arc */
  flow(arc) {
    return this.cap[arc ^ 1];
  }

  /** @param {number} node @param {number} units */
  addDemand(node, units) {
    if (!units) return;
    this._set(2, node, this.bal[node] - units);
    this.pending.push(node);
  }

  /**
   * Set an arc's capacity. Flow above a smaller cap is cut; new room on an arc that is
   * cheaper than its potentials allow (negative reduced cost) is filled at once. Either
   * leaves an excess/demand pair at the arc's ends for resolve() to re-route.
   */
  setCap(/** @type {number} */ arc, /** @type {number} */ cap) {
    const f = this.flow(arc);
    const tail = this.head[arc ^ 1];
    const head = this.head[arc];
    const rc = this.cost[arc] + this.pi[tail] - this.pi[head];
    const target = cap < f || rc < 0 ? cap : f;
    this._set(0, arc, cap - target);
    this._set(0, arc ^ 1, target);
    const moved = target - f;
    if (!moved) return;
    this.totalCost += moved * this.cost[arc];
    this._set(2, tail, this.bal[tail] - moved);
    this._set(2, head, this.bal[head] + moved);
    this.pending.push(tail, head);
  }

  /** Route every excess and demand. False if some demand can't be met. */
  resolve() {
    const { bal, cap, cost, head, prev, path } = this;
    for (;;) {
      this.pending = this.pending.filter((v) => v !== 0 && bal[v] !== 0);
      if (!this.pending.length) return true;
      const u = this.pending[this.pending.length - 1];
      const forward = bal[u] > 0;
      const t = this._search(u, forward);
      if (t < 0) return false;
      // Path arcs from the supplying end to the demanding end, and how much fits.
      const [from, to] = forward ? [u, t] : [t, u];
      let len = 0;
      if (forward) for (let v = t; v !== u; v = head[prev[v] ^ 1]) path[len++] = prev[v];
      else for (let v = t; v !== u; v = head[prev[v]]) path[len++] = prev[v];
      let amt = Math.min(from === 0 ? BIG : bal[from], to === 0 ? BIG : -bal[to]);
      for (let i = 0; i < len; i++) amt = Math.min(amt, cap[path[i]]);
      for (let i = 0; i < len; i++) {
        const e = path[i];
        this._set(0, e, cap[e] - amt);
        this._set(0, e ^ 1, cap[e ^ 1] + amt);
        this.totalCost += amt * cost[e];
      }
      if (from !== 0) this._set(2, from, bal[from] - amt);
      if (to !== 0) this._set(2, to, bal[to] + amt);
    }
  }

  /** Cost of the cheapest path from any supply into `node` (Infinity if none). */
  cheapestPath(/** @type {number} */ node) {
    const before = this.pi[node];
    const t = this._search(node, false);
    return t < 0 ? Infinity : this.lastDist - this.pi[t] + before;
  }

  /**
   * Dijkstra on reduced costs. Forward from an excess to S or the nearest unmet demand;
   * backward from an unmet demand to S or the nearest excess. Backward keeps the search
   * local: a new package's demand sits at one academy, and its cheapest supply is usually
   * a nearby source. Updates potentials; returns the far end of the path, or -1.
   */
  _search(/** @type {number} */ start, /** @type {boolean} */ forward) {
    const { dist, prev, heap, pi, cap, cost, head, adj, adjStart, bal, touched } = this;
    for (const v of touched) dist[v] = Infinity;
    touched.length = 0;
    dist[start] = 0;
    touched.push(start);
    heap.clear();
    heap.push(start, 0);
    let target = -1;
    let dT = 0;
    while (heap.size) {
      const u = heap.popNode();
      const du = heap.lastKey;
      if (du > dist[u]) continue;
      if (u !== start && (u === 0 || (forward ? bal[u] < 0 : bal[u] > 0))) { target = u; dT = du; break; }
      // Forward: arc u->v. Backward: the paired arc v->u, read against its direction.
      const flip = forward ? 0 : 1;
      const sign = forward ? 1 : -1;
      const base = du + sign * pi[u];
      for (let i = adjStart[u], end = adjStart[u + 1]; i < end; i++) {
        const e = adj[i] ^ flip;
        if (cap[e] <= 0) continue;
        const v = head[adj[i]];
        const nd = base + cost[e] - sign * pi[v];
        if (nd < dist[v]) {
          if (dist[v] === Infinity) touched.push(v);
          dist[v] = nd;
          prev[v] = e;
          heap.push(v, nd);
        }
      }
    }
    if (target < 0) return -1;
    this.lastDist = dT;
    // Potentials: π += min(dist, dT) forward (−= backward). Only differences matter, so
    // the dT every other node would get is left out and only nodes closer than dT move.
    for (const v of touched) if (dist[v] < dT) this._set(1, v, pi[v] + (forward ? dist[v] - dT : dT - dist[v]));
    return target;
  }
}

/** Binary min-heap of (node, key) pairs with lazy deletion. */
class MinHeap {
  /** @param {number} capacity */
  constructor(capacity) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
    this.size = 0;
    this.lastKey = 0;
  }
  clear() { this.size = 0; }
  /** @param {number} node @param {number} key */
  push(node, key) {
    if (this.size === this.nodes.length) this._grow();
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.nodes[i] = this.nodes[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }
  popNode() {
    const top = this.nodes[0];
    this.lastKey = this.keys[0];
    const n = --this.size;
    const node = this.nodes[n];
    const key = this.keys[n];
    let i = 0;
    for (;;) {
      let ch = 2 * i + 1;
      if (ch >= n) break;
      if (ch + 1 < n && this.keys[ch + 1] < this.keys[ch]) ch++;
      if (this.keys[ch] >= key) break;
      this.nodes[i] = this.nodes[ch];
      this.keys[i] = this.keys[ch];
      i = ch;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
    return top;
  }
  _grow() {
    const nodes = new Int32Array(this.nodes.length * 2);
    const keys = new Float64Array(this.keys.length * 2);
    nodes.set(this.nodes);
    keys.set(this.keys);
    this.nodes = nodes;
    this.keys = keys;
  }
}
