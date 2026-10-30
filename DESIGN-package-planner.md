# Noble Package Planner — Design

A TribalWars (international, `.net`) script for **classic worlds** (resource packages, no
coin minting). It plans market transports between the player's own villages so academy
villages end up holding as many **complete noble packages** as possible, then lets the
player send them with as few clicks as the rules allow. The player stores the packages
themselves (Academy › Store); this script never stores, trains or submits anything else.

This document holds the locked decisions (grilling session, 2026-10-30) and their
rationale. It is the spec the implementation is built against. Lives in the same repo as
timetool2 and shares its adapter/core/ui conventions (see `CLAUDE.md`, `DESIGN.md`).

> **Legality**: one click = one action. Every transport/request is a manual click (or a
> held Enter key moving through the list, the pattern every approved resource sender
> uses). No auto-send, no reacting to events, no external network calls, no Premium
> Exchange. Built for Support approval and the in-game **Script Library**.

---

## 1. User flow

1. Run from the quickbar — **any page**. A native TW popup (`Dialog.show`) opens.
2. **Settings** are at the top of the popup (§6), with a **Calculate** button.
3. Calculate → reads all data (§4), runs the solver (§5), renders **below the settings in
   the same popup**:
   - a **summary line**: `+N packages · M merchants · longest trip h:mm`, plus
     `After arrival: N packages ready to store → Academy › Store` (link to the academy's
     Store sub-tab), and, if a noble target is set, `X nobles = P packages, Q still missing`;
   - the **send list**: one row per target (§7).
4. Change a setting → press Calculate again. The plan is a **snapshot**: computed once per
   Calculate, never re-planned under the user's mouse.
5. Click each row's Send button, or hold **Enter** (desktop).
6. The player goes to Academy › Store when resources have arrived and mass-stores.

**Popup layout** (picked from the prototype, variant B; `src/package-planner/ui/popup.prototype.js`):
- ~560 px wide on desktop, full width on mobile.
- Settings collapsed into one line (`⚙ Max 3:00 · reserve 0/0/0 · keep 0 merchants · All → All`)
  with an *edit* link that unfolds the settings table; a full-width Calculate button.
- One **summary line**, no stat tiles: `N packages storable after everything arrives (S already now, N−S from these transports) → Academy › Store`
  (the solver total includes what the academies can store already without transports),
  `Last arrival in h:mm · k of n sent`, and the noble-target line when set.
- One **card per target**: name + coords; `N packages to store after arrival`;
  wood/clay/iron totals · `from K villages` · `last arrival in h:mm` (only the latest
  arrival, never per-source times). No abbreviations anywhere.
- The send button sits **top-right of every card**. A sent card **moves to the bottom**
  (greyed, `✓ Sent`) at once, so the list keeps its height (TW centres the dialog
  vertically; removing cards made it jump) and the next card's button lands under the
  cursor: repeated clicking on one spot or holding Enter goes fast. Only the ~200 ms
  lock remains.
- The dialog is shown **once**; re-renders replace its contents (re-calling
  `Dialog.show` closes and fades it in again, which is slow).

**Failure / captcha**: a failed click shows the game's error and greys out the remaining
rows. No retry or captcha logic. The player refreshes, solves the captcha and runs the
script again; in-flight transports count as already arrived (§4), so the new plan picks
up where the old one stopped.

## 2. Preconditions (refuse with a clear message otherwise)

- **Premium account** (`window.premium`) — the data comes from premium overviews. Always
  required; no non-premium mode.
- **Classic world**: world config `snob.gold === 0`. Coin worlds (`gold = 1`) are refused.
- Works while **sitting** another account: TW's request helper adds `&t=<id>`
  automatically; our own GETs (and the Academy › Store link) get it from `core/urls.js`
  `withSitter`, applied in the adapter's `fetchText`, when `game_data.player.sitter > 0`.

## 3. Architecture

Same layering as timetool2 (`DESIGN.md` §2–3), with a second esbuild entry producing
`dist/package-planner.js` (readable, non-minified IIFE, reviewer banner in `build.mjs`).

```
src/
  shared/                  lifted from timetool2 where generic (dom.js h(), queue.js,
                           settings load/save/migrate, i18n helper)
  package-planner/
    bootstrap.js           register, preconditions, open popup
    adapter/tw.js          ONLY place touching TW globals, TW DOM/HTML, endpoints
    core/                  PURE, unit-tested:
      model.js             overviews + world config -> solver input
      solver.js            the optimiser (§5), including the whole-merchant rounding
                           (it is part of the discretised model, so it stays inside)
      plan-view.js         plan -> summary line + one card per target, h:mm
      settings.js          per-world settings (§6): schema, migrate, solver options
      nobles.js            "X nobles -> packages" math
      parse-*.js           HTML -> data parsers (fixtures in test/)
    ui/popup.js            summary + cards (native look)
    ui/settings-panel.js   collapsed settings line + edit table
```

- `Dialog.show(id, content)` only accepts a **string, a jQuery object or a 1-arg
  function** (`Dialog.isContentValid` in `game.js`); a raw DOM node throws
  `invalid dialog content`. Wrap our `h()` trees in `$(…)`.
- **Native look only** (TW tables/buttons). Must work on **mobile** (`game_data.device`):
  rows become stacked cards; no Enter-hold there, just tap.
- **English only** for v1; every label goes through the i18n table so a language is
  only a table entry. Data parsing is language-independent (ids, attributes, numbers —
  never translated header text).
- **Size budget**: the shipped `dist/package-planner.js` stays readable and in line with
  other TW scripts: target ≤ ~60 KB, hard limit ~80 KB (timetool2 ≈ 43 KB, Shinko's
  Warehouse Balancer ≈ 92 KB, the old resources balancer ≈ 126 KB). No large LP/MILP
  library in the bundle.
- Requests go through the shared queue, throttled to **≤ 5 requests/s** (200 ms spacing,
  the approval-thread limit; RedAlert's SDK uses the same).

## 4. Data sources (all read-only)

| What | Source |
|---|---|
| Resources, warehouse capacity, merchants available/total, coords | `overview_villages&mode=prod&page=-1` (+ `group=`) |
| Academy present (snob level ≥ 1) | `overview_villages&mode=buildings&page=-1` |
| Transports already on the way | `overview_villages&mode=trader&type=inc&page=-1` |
| Package cost, `gold` flag, world/unit speed | `/interface.php?func=get_config` (`snob.coin_wood/coin_stone/coin_iron`, `snob.gold`, `speed`, `unit_speed`) — public, cached per world |
| Packages stored, price of next noble | one academy page (`screen=snob`) — only needed for the noble target |
| Merchant capacity | 1000 default; read live if a page exposes it, warn when falling back |

- **Package cost and flags are read live**, never hard-coded; fall back to 28000/30000/25000
  only when parsing fails, with a visible warning.
- **In-flight transports count as present** at the target (capped by its warehouse
  limit), so running again (or after a balancer) never sends the same resources twice.
- **Noble price** (verified on two live screenshots): price of the next noble =
  1 + existing nobles + nobles in education + conquered villages; each further noble costs
  one more package. Packages needed for X new nobles = `p + (p+1) + … + (p+X−1) − stored`.

## 5. Solver

### Objective (lexicographic)
1. **Maximise total complete packages** across all academy villages (packages are
   account-wide, so which academy stores them doesn't matter).
2. Then **minimise resource-hours on the road**: Σ amount × travel time.
3. Hard limit: **max travel time** (setting).

Planned globally across all villages at once. No clusters, no averaging. This is the
fix for what existing balancers get wrong (see §9).

### Model
- Villages *v*: resources `r[v][k]` (k ∈ wood/stone/iron), merchants `m[v]` (available −
  keep-home setting), coords. Sources = sender group; academies *A* = receiver group ∩
  villages with an academy.
- **Sources may be emptied** down to the per-resource reserve. **Academy villages can
  also send**, including emptying themselves into other academies, when that yields
  more packages.
- Academy *a* holds `n[a]` packages (integer ≥ 0). **Multiple packages per academy
  allowed**, bounded by the warehouse: for each k,
  `present + in-flight + inbound ≤ W[a]`, where
  `W[a] = storage_max − production[a][k] × (longest arrival into a) − buffer%`.
  Production at **sources** during the run is ignored (safe side). Storing a package and
  then refilling within one run is **not** modelled (time-dependent; v2 at most).
- Source merchant limit: Σ shipped out of *s* ≤ `capacity × m[s]`.
- Optional cap from the noble target: Σ n[a] ≤ packages still missing.

### Whole merchant loads
Transports are rounded to whole merchant loads (1000s of combined resources). A partial
last merchant is only allowed when it completes a package. Rounding must never silently
drop resources from the books (the bug in the current balancer, `calculateLaunches`).

### Algorithm — decided by the spike (#3): (a) greedy on a min-cost flow
The model above is the **correctness spec**. The spike (2026-10-30) compared (a) greedy
*cheapest next package* + local improvement with (b) LP relaxation + rounding, test-first,
on synthetic fixtures. **(a) wins**; (b) is not kept in the codebase.

**Discretised model** (what the solver and the brute force both optimise). One *unit* = one
merchant carrying `merchantCapacity` of one resource. A source ships whole units of what
it holds above its reserve (a sub-1000 remainder per resource stays home; it is never
planned, so never dropped from the books). An academy's deficit is rounded up to whole
units, and the overshoot (< 1 unit per resource) is trimmed off its farthest delivery:
the only partial merchant is the one that completes a package. Merchants reported per
transport are `ceil(total / capacity)`, never more than the model counted. The reserve
limits what leaves a village; an academy's own stock counts toward its own packages, and
it exports only what its packages don't need. The warehouse rule uses the longest
*candidate* trip into the academy (safe side; the actual longest arrival is shorter).

**Algorithm** (`src/package-planner/core/solver.js`, `solve(world, options) → plan`).
For a fixed package count per academy, routing is a min-cost flow
`S →(merchants) V_v →(exportable) P_vk →(distance) D_ak (deficit)`. The greedy adds one
package at a time to the academy whose next package is cheapest. It solves by successive
shortest paths, with Dijkstra on reduced costs searching *backward* from the new demand,
so each search stays local. Each addition re-routes earlier flow through the residual
graph, so early choices never strand later packages (§9 nearest-first starvation). An
academy whose next package is infeasible drops out for good (feasibility is downward
closed). Details that were measured:
- Lazy evaluation with a 30% tolerance and a cheap lower bound (one search per resource)
  before re-trying a stale estimate. Strictly cheapest-first was 1.6–3.7× slower for <1%
  better resource-hours.
- When merchants ran out before the resources did, a second pass orders by merchant loads
  first (a per-load penalty on the arc costs; for fixed packages this leaves the routing
  unchanged) and keeps the better plan: +1–2% packages on merchant-scarce worlds.
- Local search (take one package away, refill greedily), budget 150 tentative packages,
  only on worlds with ≤ 40 academies. It brings tiny worlds to the brute-force optimum
  and adds up to +9% packages on small merchant-scarce worlds. On 500/120 it gained
  nothing and cost ~1 s, so it's off there.
- Pruning: each source ships to its K = 20 nearest academies (within max travel). K = 12
  lost up to 1% packages on half-full 500/120 worlds; "K per source ∪ M per academy" lost
  more, so it was dropped. **Not on small worlds** (#5): when sources × academies ≤ 10,000,
  every pair is kept. The user's real account (63 of 65 villages have an academy, most
  holding nearly one package) got 58 packages with K = 20 and 72 with every pair (whole-load
  bound 73), in ~90 ms. Fixture: `test/package-planner/fixtures/academy-heavy.js`. Large
  academy-heavy accounts still prune at K = 20; that gap is unmeasured.
- Travel time: `round(distance × 360 / speed)` s, `speed` from the world config, no
  `unit_speed` (matches all 64 rows of the real Request-resources page, enc1 speed 3.6).

**Results** (Apple M4 Pro, Node 24; fixtures in `test/package-planner/fixtures/`, bench:
`node test/package-planner/solver.bench.js`):

| Check | (a) greedy + flow | (b) LP + rounding |
|---|---|---|
| Tiny worlds (3–6 villages, 1–3 academies) vs brute force, package count | 3000/3000 optimal | 998/1000 |
| Same, resource-hours | 2999/3000 optimal, worst +5% | — |
| 30–60 villages vs LP upper bound | = bound in 13/18; ≤ 2 below (≤ 2.6%), only when merchants bind | its own LP |
| §9 failure fixtures (cluster border, average on full warehouses, nearest-first starvation, small sends dropped, remainder cut) | all optimal | — |
| 100 villages / 25 academies | 30–180 ms | dense simplex: 29 s |
| 500 / 120, typical (half-full or full warehouses, max travel set) | 12–610 ms, = upper bound when it's reachable | dense tableau ~2,400 × 30,000 (≈ 580 MB): not feasible |
| 500 / 120, scarce (nearly empty warehouses, or 0–40 merchants) | 0.9–1.6 s | — |
| 800 / 200 | 0.2–0.8 s | — |
| Size | ≈ 19 KB bundled, not minified (≈ 9 KB minified), no dependency | + simplex, and still needs (a)'s flow for rounding |

**Mobile estimate**: phone CPUs run this kind of JS ~3–4× slower, so typical worlds take
≲ 2 s and scarce ones 3–6 s. That misses the "≲ 1 s on mobile" wish for scarce worlds.
The popup should show a *Calculating…* state and run the solver after a paint (#5).

Acceptance on large worlds: the count is reported against a cheap upper bound
(resources and warehouses only). Typical worlds reach it. On scarce worlds the bound
ignores merchants and distance, so the gap there isn't a solver gap: the LP bound on
30–60 village worlds shows ≤ 2.6%.

## 6. Settings (per world, localStorage, in-popup UI — Library requirement)

| Setting | Default |
|---|---|
| Max travel time | none |
| Reserve per resource (wood/clay/iron) | 0 |
| Merchants to keep home | 0 |
| Sender group | all |
| Receiver group | all |
| Collect for X new nobles | empty = as many packages as possible |
| Warehouse buffer | 2% (on top of the production margin) |

Export/import and schema migration follow timetool2's `settings.js`.

## 7. Sending

- **Primary: one row per target via Request resources** — one click fills one academy
  from all its planned sources:
  `TribalWars.post('market', {ajaxaction:'call', village: targetId},
  {'resource[<srcId>][wood]': n, 'resource[<srcId>][stone]': n, 'resource[<srcId>][iron]': n, …})`
  (as used by approved scripts: lllll llll's balancer, Shinko's request script).
- **Fallback: one row per transport** (source → target) via
  `TribalWars.post('market', {ajaxaction:'map_send', village: srcId},
  {target_id, wood, stone, iron})` (Shinko's Warehouse Balancer), when the request
  path fails or is unavailable.
- After a click, **lock all buttons ~200 ms, then focus the next row's button**, so
  holding Enter moves down the list (the approved-scripts pattern). Sent rows are marked
  done. Failure: see §1.
- Never one request per merchant; a row carries all three resources and N merchants.
- Implemented (#6, `core/send.js` + `ui/popup.js`): `call` body is `target_id: 0` +
  `resource[src][wood|stone|iron]` for every source (zeros included). Outcomes: success
  (toast `response.success ?? .message`), game error (message; offers the fallback list),
  bot protection (`onError()` without argument), no answer within 10 s (TW calls no
  callback on 429/503). Any failure greys out the rest. Smoke test:
  `node test/package-planner/send.smoke.mjs` (headless Chrome, stubbed `TribalWars.post`).

## 8. Out of scope

Storing packages, minting, training nobles, any auto-send/auto-repeat, external calls,
the Premium Exchange.

**Later (not v1):** "prefer villages that are almost full" option; pre-filling academies
with spare merchants after complete packages; more languages; store-and-refill within one run.

## 9. Why not the existing balancers

The player used lllll llll's resources balancer (`resBalancer.js`). Its planning:
k-means clusters that resources never cross; balancing towards the cluster *average* (when
most villages are full, nothing counts as surplus, so merchants stay idle and full warehouses
stop producing); targets filled one by one from their nearest sources (early targets eat the
nearby surplus); sends under 700 dropped and remainders cut after they were already taken
off the books. It also calls `api.counterapi.dev` with the player id. Other approved
senders (Shinko's balancer and minting sender, SaveBank's Advanced Resource Sender) are
greedy as well; none maximises account-wide packages.

## User test checkpoints (non-blocking)

The user has no way to hand us live pages up front, so three paste tests on their world
validate what can't be checked offline. Other work carries on; results come back as fixes.

1. After the tracer bullet: do the parsers read the real Production/Buildings overviews?
   (check the "storable now" number; "Copy debug info" if off)
2. After the plan cards: is the plan plausible; do travel times match the market page?
3. After sending: one real, small send; record what the game returns.

## Open / verify on a live page

- Response shape of `call` / `map_send` (handle defensively; `game_data` merge happens
  in TW's `handleResponse`).
- Merchant travel speed: formula checked on a saved Request-resources page (§5); still to
  compare the plan's times on a live page (test checkpoint 2).
- Merchant capacity on the player's world (1000?).
- Whether `call` needs the `select-village` / `target_id: 0` fields Shinko sends.
- DOM/table structure of the three overview pages (save as test fixtures).
