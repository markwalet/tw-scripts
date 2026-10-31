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

**Popup layout** (picked from the prototype, variant B; the prototype was removed in #13):
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

**Live observation (enc1, first full run):** card 15 of 51 failed with the game's "Not
enough resources available" after 14 successful Request-resources clicks; the evidence was
lost on the refresh. A solver fuzz run (400 generated worlds) never ships more than a source
holds, so the overview snapshot and the source's real stock at click time diverged (cause
unknown). Hence (#16):
- **Evidence is kept automatically.** Every failed send adds a record to "Copy debug info"
  (last 5, until the popup closes; survives Recalculate): action + target village id, the
  game's message and raw answer (scrubbed; an HTTP error keeps only its status), and per
  source village id: what was sent (plus the plan's amounts when the pre-check trimmed
  them), the overview snapshot's resources + merchants, and the latest `resources_left` /
  `traders_free` the game reported for it in earlier successful answers (or `none`).
  Village ids only: no names, coordinates, player ids or tokens.
- **The game's own numbers are checked before each send** (§7).

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
    bootstrap.js           register (author constant), preconditions, open popup
    adapter/tw.js          ONLY place touching TW globals, TW DOM/HTML, endpoints
    core/                  PURE, unit-tested:
      model.js             overviews + world config -> solver input
      solver.js            the optimiser (§5), including the whole-merchant rounding
                           (it is part of the discretised model, so it stays inside)
      plan-view.js         plan -> summary line + one card per target, h:mm
      settings.js          per-world settings (§6): schema, migrate, solver options
      noble-target.js      "X nobles -> packages" math
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
- **Size**: no hard limit — keep it as small as reasonably possible without hurting
  readability (reviewers read the shipped file). Reference points from other resource
  scripts: Shinko's resource sender ≈ 26 KB (single target, no optimiser), Shinko's
  Warehouse Balancer ≈ 92 KB, Costache's resources balancer ≈ 126 KB; timetool2 ≈ 43 KB.
  Never minified or obfuscated; no large LP/MILP library in the bundle.
  **Now (#13): ≈ 79 KB** (78,635 bytes; 84,055 before the trim pass, ~77 KB before
  #8/#10/#11). The trim: one shared resource-key list, one precondition path, shared
  label/plural and resource-span helpers, JSDoc type-only comments dropped at build time
  (they named types that aren't in the shipped file), and the planner bundled flat inside
  our own `(() => { … })()` wrapper (one indent level less, ≈ 4 KB). About a third is
  the solver (§5) and the HTML reader that keeps `core/` testable without a DOM.
- Requests go through the shared queue, throttled to **≤ 5 requests/s** (200 ms spacing,
  the approval-thread limit; RedAlert's SDK uses the same).

## 4. Data sources (all read-only)

| What | Source |
|---|---|
| Resources, warehouse capacity, merchants available/total, coords | `overview_villages&mode=prod&page=-1` (+ `group=`) |
| Academy present (snob level ≥ 1), mine levels (production) | `overview_villages&mode=buildings&page=-1` |
| Transports already on the way | `overview_villages&mode=trader&type=inc&page=-1` |
| Package cost, `gold` flag, world/unit speed, base production | `/interface.php?func=get_config` (`snob.coin_wood/coin_stone/coin_iron`, `snob.gold`, `speed`, `unit_speed`, `game.base_production`) — public, cached per world |
| Packages stored, price of next noble | one academy page (`screen=snob`, of a village with an academy; "<n> x <img res>" cells: 1st = price, 2nd = stored) — fetched **only when the noble target is set** (one extra request, after the Buildings overview); without it the "stored in total" part stays hidden |
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
2. Then **earliest last arrival**: the plan's longest transport (#17, user decision
   2026-10-30: every package is usable once the last delivery is in).
3. Then **minimise resource-hours on the road**: Σ amount × travel time.
4. Hard limit: **max travel time** (setting).

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
  `buffer%` is the setting (§6); the solver option `bufferPct` defaults to 2.
- **Production rate** (#8), per academy and resource, per hour:
  `game.base_production × 1.163118^(level − 1) × speed`, with the timber camp / clay pit /
  iron mine level from the Buildings overview (`td.b_wood/b_stone/b_iron`). **Zero extra
  requests**: that overview and the world config are read anyway. Checked on a real enc1
  village: mines 30, `base_production` 33 (not the classic 30, so it's read, falling back
  to 30 with a warning), speed 3.6 → 9504/h, the game's `wood_prod` (2.64/s). Level 0
  counts as level 1 (safe side). An academy without mine levels gets no margin, with a
  warning. Not modelled: bonus villages, the premium production bonus, items and events
  (all off on enc1); the buffer % covers small gaps. The exact per-village rate exists
  (`api&ajax=resources_schedule&id=<village>`, as `ResourcesForecaster` uses), but costs a
  request per academy (~120 → 24 s at 5/s), so it isn't used.
- **The margin is circular**: it limits the plan, and the plan sets the longest arrival.
  Handled in two steps, inside one solve: (1) the greedy and local search plan with the
  margin of the longest *candidate* trip into each academy (safe: no planned trip is
  longer); (2) every academy then held at that cap gets the margin of its *own* longest
  planned arrival, its longer arcs close (so no later delivery arrives after that), and
  the greedy continues in the same network. Valid by construction, no second solve. On
  synthetic 500/120 worlds with production this adds 7–15 packages, of the 9–24 between the
  candidate-margin plan and the upper bound (re-solving with the actual arrivals got 2–3
  more, but always needed 2 extra solves: up to 3× the time on scarce worlds), at no
  measurable time cost. On the user's real account (63 academies, ≤ 9504/h, longest
  trip ~32 min, warehouses far from full) the plan is unchanged: 71 packages either way.
- **Own production until arrival** (#18, user decision 2026-10-30; setting, default on).
  An academy's packages may use what it makes until its **last planned arrival** *T[a]*:
  `present + in-flight + production[a][k] × T[a] + inbound ≥ n[a] × cost[k]`. Same rates as
  the margin above (zero extra requests); the warehouse limit still applies to the total
  (the margin's formula already counts that production). Production at **sources** stays
  ignored. Off: as before. The setting exists because other scripts may spend a target's
  resources during the trip, so its production may not stay. Packages completed partly by
  production count as "from these transports" in the summary.
- **Production credit is circular too**: it depends on *T[a]*, which the plan sets, and
  here the safe side is the *shortest* arrival, not the longest (credit for a trip the plan
  doesn't make is a package that isn't there on time). So it is counted last in each solve,
  on top of the plan without it: (1) the greedy, local search and margin narrowing run as
  before; (2) for each academy with a planned delivery, its own production until its
  farthest planned delivery is credited, and **one merchant load of that delivery is
  pinned**: taken out of the network (the source's merchants and stock, the academy's
  demand), so no later re-routing can drop it and *T[a]* only grows. The pinned resource is
  the one that still needs the most, and keeps at least one full load (so when production
  alone would cover the shortfall, one load of the last delivery remains: there has to be an
  arrival to count production until); (3) the greedy continues for every academy. One
  academy at a time, since each pin re-routes flow (reading all farthest deliveries first
  pinned loads that no longer existed: an invalid plan). After the margin narrowing, so no
  re-routing moves a delivery past a narrowed margin's horizon; last, because pinning
  earlier tied loads to far sources that the greedy then lacked (−1 to −3 packages on a
  synthetic 500/120 world). The travel-cap search (#17) bounds *T[a]* from above, so the
  credit never stretches the plan: waiting longer is not a way to more packages. Measured:
  never fewer packages than without (single solves on 500/120 production worlds, 400 tiny
  and 12 mid-size random worlds, all checked by `verify-plan`). Real saved pages (63
  academies, ≤ 9504/h): **off 72 packages / last arrival 0:19 / 1108 merchants → on 74 /
  0:19 / 1052**; fixture `academy-heavy-production.js` 72 → 74 packages, 1108 → 1074
  merchants. Synthetic 500/120 production (max 3h, 500–3000/h): same packages and last
  arrival, ~1% fewer merchants (38,463 → 38,079), +13–15% time (260–575 → 296–664 ms).
  Bundle 87.8 → 91.3 KB (+3.4 KB, not minified).
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
units, and the overshoot (< 1 unit per resource) is trimmed off its deliveries (see
*Combined loads* below): the only partial merchant is the one that completes a package.
Merchants reported per transport are `ceil(total / capacity)`, never more than the
model counted; the merchants that saves are credited back for more packages. The reserve
limits what leaves a village; an academy's own stock counts toward its own packages, and
it exports only what its packages don't need. The warehouse rule first uses the longest
*candidate* trip into the academy, then the plan's own longest arrival (see Model).

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
- **Combined loads** (#15). The flow counts a merchant per 1000 of *one* resource; a
  merchant really carries 1000 of any mix. Each academy's overshoot is trimmed off one
  transport when one carries enough of every resource (so its partial loads share
  merchants), else off the farthest deliveries. Then each source is credited the merchants
  that saves, the greedy goes on, and the result is kept only if it adds packages and every
  source still fits its real merchants (`ceil(total / 1000)` per transport); repeated until
  nothing changes. The saving is at most 2 merchants per academy (the sub-1000 rest of 3
  resources), so it only matters when a package is just short. Measured: +6 packages over
  660 merchant-scarce worlds of 10–100 villages (never fewer), tiny worlds still equal the
  brute force; on 500/120 and 800/200 it gained nothing in 24 cases and cost up to +1.1 s
  on scarce ones, so the refill runs only when sources × academies ≤ 10,000 (as pruning).
  Bench before → after: 500/120 scarce 0.95–1.72 s → 0.94–1.68 s, typical 14–656 ms →
  13–635 ms (noise), 0.1–0.3% fewer merchants. Real account: 71 packages either way, 1025 →
  1022 merchants, ~90 → ~110 ms. Finer units (100s) were not tried: ~10× the flow.
- **Earliest last arrival: a travel-cap search** (#17). The greedy minimises resource-hours
  and on the way commits to far deliveries that a tighter cap avoids, and a tighter cap can
  even complete *more* packages: on the user's real account (with production) single solves
  gave no cap 71 / last arrival 0:31, cap 25 min 71 / 0:23, 20 min 72 / 0:20, 15 min 69,
  10 min 62. So `solve` repeats the whole solve under caps of 0.85, 0.7, 0.6, 0.5 × the
  first plan's last arrival (skipping a cap the best plan already beats; stopping once one
  loses > 1% packages), then tightens the best plan by 7% up to 2 times while that improves
  it, and keeps the best plan by the order above. The user's max travel time stays the
  upper bound (every tried cap is below it). Not a binary search: packages vs cap is not
  monotone (the 72 above exists only between 19 and 21 min). **Budget**: a new solve starts
  only while the work so far plus the last solve's stays ≤ 4 M Dijkstra steps (counted, so
  it's deterministic; ~5 M/s here, ~0.5 M per solve on the real account). Worlds whose first
  solve takes > ~0.4 s get that one solve, as before. Measured: tiny worlds still equal the
  brute-force package count (400/400); the real account (fixture
  `academy-heavy-production.js`) 71 / 0:31 in ~120 ms → **72 / 0:19 in ~0.6 s** (6 solves).
  Bench, last arrival single solve → search (time before → after): 100/25 6:22, 3:45, 4:19 →
  3:06, 2:56, 3:31 (40–200 → 180–580 ms); 500/120 half-full 2:32, 1:41, 2:26 → 2:09, 1:04,
  2:26 (140–660 → 550–640 ms); mostly full 0:42 → 0:34 on one seed (13–15 → 20–23 ms);
  production max 3h 1092, 1089, 1072 packages → **1093, 1091, 1075**, last 1:21–2:08 →
  1:02–1:29 (70–140 → 260–570 ms); 800/200 1:26, 1:20 → 0:51, 0:55, third seed unchanged
  (200–780 → 700–800 ms); wide map max 2h unchanged (22–48 → 44–79 ms); nearly empty and few
  merchants unchanged, still one solve (0.95–1.67 s). Never fewer packages. Bundle
  81.5 → 83.0 KB (+1.6 KB, not minified).
- Travel time: `round(distance × 360 / speed)` s, `speed` from the world config, no
  `unit_speed` (matches all 64 rows of the real Request-resources page, enc1 speed 3.6).

**Results** (Apple M4 Pro, Node 24; fixtures in `test/package-planner/fixtures/`, bench:
`node test/package-planner/solver.bench.js`):

| Check | (a) greedy + flow | (b) LP + rounding |
|---|---|---|
| Tiny worlds (3–6 villages, 1–3 academies) vs brute force, package count | 3000/3000 optimal | 998/1000 |
| Same, resource-hours (single solve, before the cap search of #17) | 2999/3000 optimal, worst +5% | — |
| 30–60 villages vs LP upper bound | = bound in 13/18; ≤ 2 below (≤ 2.6%), only when merchants bind | its own LP |
| §9 failure fixtures (cluster border, average on full warehouses, nearest-first starvation, small sends dropped, remainder cut) | all optimal | — |
| 100 villages / 25 academies | 30–180 ms; with the cap search (#17) 0.18–0.58 s | dense simplex: 29 s |
| 500 / 120, typical (half-full or full warehouses, max travel set) | 12–610 ms, = upper bound when it's reachable; with the cap search 20–640 ms | dense tableau ~2,400 × 30,000 (≈ 580 MB): not feasible |
| 500 / 120, scarce (nearly empty warehouses, or 0–40 merchants) | 0.9–1.6 s (one solve, also with the cap search) | — |
| 800 / 200 | 0.2–0.8 s; with the cap search 0.7–0.8 s | — |
| Size | ≈ 19 KB bundled, not minified (≈ 9 KB minified), no dependency | + simplex, and still needs (a)'s flow for rounding |

**Mobile estimate**: phone CPUs run this kind of JS ~3–4× slower, so typical worlds take
≲ 2 s and scarce ones 3–6 s. That misses the "≲ 1 s on mobile" wish for scarce worlds.
The cap search (#17) keeps that ceiling (its budget is ~0.8 s here, ~3 s on a phone) but
fills it: the user's real account goes from ~0.4 s to ~2 s on a phone.
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
| Count production until arrival | on (§5; the collapsed line says "target production not counted" when off) |

Export/import and schema migration follow timetool2's `settings.js`.

**Groups** (#10, `core/overview.js` `groupMenu`, `core/model.js`):
- The group list comes from the group menu every overview renders
  (`.group-menu-item[data-group-id]`, 0 = all; names without the `[ ]` / `> <`), read from
  the Production overview Calculate fetches anyway: **0 extra requests**. It is saved with
  the settings, so the dropdowns are filled on the next open; before the first Calculate
  they only offer *All*. A group that no longer exists shows as `#id` in the settings line.
- Membership: a non-*All* group costs **one** extra request (Production overview with
  `&group=<id>`, its rows = the members); sender = receiver group is read once. The solver
  input is filtered, not the overviews: villages outside the sender group get
  `sender: false`, academies outside the receiver group are no target (and do not count in
  "storable now"). Receivers stay limited to academy villages.
- TW remembers the last group asked for (sticky, server side), and Request resources only
  accepts sources from the current group (test checkpoint 3 sent fine with group 0). So the
  group reads come **first** and every later read (Production, Buildings, Trader) uses
  `group=0`: the player is left on *All*, as every Calculate already did before groups.

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
- **Pre-check with the game's numbers (#16, `checkCard` in `core/send.js`).** A successful
  `call` answers with `transport_info[]` per source (`village_id`, `resources_left`,
  `traders_free`; verified live). The popup keeps the latest per source and, after each
  answer, checks every card not sent yet. A source short on resources or merchants sends
  what it has, in whole merchant loads (excess off its largest share first: small amounts
  are the package-completing top-ups); less than one load drops it from the card. The
  card then says `Reduced: N packages may be short` (N = Σ resources cut ÷ package cost,
  capped at the card's packages) and its one click sends the trimmed body. No source left
  = the card is skipped (`– Skipped`, greyed, moved down, no request). No extra request:
  only answers already received are used, so a card clicked while an earlier answer is
  still open is checked against older numbers. Reserves are not re-applied to the game's
  numbers (the check only stops a request the game would refuse). The fallback rows
  (`map_send`, answer shape unverified) are not pre-checked. Smoke scenarios `precheck`
  and `failure-record` (stubbed game with real per-source stock below the overview).

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

## Review audit (#13)

`test/package-planner/bundle-audit.test.js` bundles the planner with the real build options
and checks the shipped text on every `npm test`:
- **No external hosts**: no absolute or protocol-relative URL, no XMLHttpRequest /
  `$.ajax|get|post` / getScript / sendBeacon / WebSocket / EventSource / `import()` /
  `eval` / `new Function`, no script/img/iframe/link element created; the only paths
  requested are `/game.php` (incl. `game_data.link_base_pure`) and `/interface.php`
  (world config).
- **Throttle**: exactly one `fetch(` (`fetchText`) and one `TribalWars.post(`
  (`postMarket`), both inside `queue.add`; the planner's queue has `minIntervalMs: 200`
  (≤ 5 requests/s; the spacing itself is unit-tested in `test/queue.test.js`). GETs retry
  once through the queue; market posts never retry (they always resolve with an outcome).
- **Banner** on top (one click = one action, read-only, ≤ 5 requests/s, no external
  calls), strict mode, one IIFE, no module syntax, parses as a classic script, not minified.
Result on #13: all pass. Click lock 200 ms + one request per click: `send.smoke.mjs`.

## Script Library / forum submission (draft)

> **Noble Package Planner** (classic worlds, premium account)
> Plans market transports between your own villages so your academy villages can store as
> many complete noble packages as possible — account-wide, not village by village. Open it
> from the quickbar on any page, press *Calculate plan*, and you get one card per academy
> village: how many packages it can store after arrival, what comes from where, and when
> the last merchants arrive. Each card has one button that sends TW's own *Request
> resources* for that village (fallback: one transport per click). Storing the packages
> stays manual (Academy › Store).
> **Rules**: one click = one action; buttons lock 200 ms after each click; nothing is sent,
> stored, minted or trained automatically. It only reads your premium overviews, the
> world config and (with a noble target) one academy page — all from TribalWars, at most
> 5 requests per second. No external calls. Settings (travel limit, reserve, merchants to
> keep home, warehouse buffer, sender/receiver group, noble target) are saved per world.
> Source: readable, not minified.

Before submitting: fill in the ScriptAPI author/e-mail (`AUTHOR` in
`src/package-planner/bootstrap.js`; e-mail is empty for now, and TW's `register` rejects an
empty one on hosted scripts — the planner then just doesn't register).

## Open / verify on a live page

Verified on the player's world (enc1, 2026-10-30):
- `ajaxaction=call` with the current payload (`target_id: 0` + `resource[src][res]`, no
  `select-village`) works: green "The resources were shipped". Response:
  `response.success` (message), `response.transport_info[]` per source (`resources_left`,
  `needed_trader_capacity`, `traders_free` number, `traders_total` string),
  `response.total_incoming_res` (HTML amounts, `last_arrival` epoch s, `arrive` text), plus
  the target village's `game_data` (merged by TW's `handleResponse`).
- Merchant capacity 1000: `needed_trader_capacity: 1000` for one merchant.
- Overview parsers read all 65 villages correctly (test checkpoint 1; fixtures in
  `test/fixtures/package-planner/`).
- The plan was judged plausible by the player (test checkpoint 2); travel-time formula
  checked on a saved Request-resources page (§5).

Still unverified:
- The `map_send` fallback path on a live page (response handled defensively).
- Paging with more than 1000 villages (the "all" view vs paged reads; unit-tested only).
- The bot-protection path (`onError()` without argument / captcha), live.
- Mobile on a real phone (checked headless at 360 px in `send.smoke.mjs` only).
