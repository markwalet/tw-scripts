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
- One **summary line**, no stat tiles: `N new packages after everything arrives (T stored in total) → Academy › Store`,
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
  automatically; our own overview GETs must add it when `game_data.player.sitter > 0`.

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
      model.js             village/academy/transport types
      solver.js            the optimiser (§5)
      rounding.js          whole-merchant rounding
      nobles.js            "X nobles -> packages" math
      parse-*.js           HTML -> data parsers (fixtures in test/)
    ui/popup.js            settings form + summary + send list (native look)
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

### Algorithm — to be settled by a spike
The model above is the **correctness spec**. Which algorithm meets it is decided by a
test-first spike, benchmarked on synthetic fixtures (~500 villages / ~120 academies,
mobile CPU budget ≲ 1 s):
- (a) greedy *cheapest next package* (repeatedly complete the package with the lowest
  marginal resource-hours, given remaining merchants) + local improvement; or
- (b) LP relaxation of the model via a small bundled solver + rounding.

Acceptance: on small fixtures, the package count equals the brute-force/LP optimum. On
large ones, within a stated tolerance and never worse than the current balancer on the
same input. Prune candidate edges by max travel time and the K nearest academies.

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
- Merchant travel speed (compare our times with the market page's own times).
- Merchant capacity on the player's world (1000?).
- Whether `call` needs the `select-village` / `target_id: 0` fields Shinko sends.
- DOM/table structure of the three overview pages (save as test fixtures).
