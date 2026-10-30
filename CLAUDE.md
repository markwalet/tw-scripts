# CLAUDE.md — working in tw-scripts

TribalWars scripts. Two of them live here:

- **timetool2** — attack-timing aid (NL), a ground-up rewrite of the original
  `timetool.js`. **`DESIGN.md` is its spec — read it first; it holds every locked
  decision and the rationale.** Most of this file is the operational how-to for it.
- **Noble Package Planner** (in design, `.net` classic worlds) — plans market transports
  so academy villages can store noble resource packages. Spec:
  **`DESIGN-package-planner.md`**. Same layering rules as below (adapter / pure core / ui).

## What this tool is (and the hard line)

A **timing aid only**: it renders a countdown/progress bar + inputs on the attack-confirm
screen and cues *when* to click. It **never** auto-clicks, auto-submits, or sends an
attack — every send is a manual human click. The only network use is **read-only** (fetches
the target's command list to show running commands). Do not add auto-clicking, auto-send,
farm loops, or anything that submits an attack: that would make it an illegal bot and is
out of scope, permanently.

## Commands

```bash
npm install                       # once
npm run build                     # bundle both scripts: dist/timetool2.js (renderer: modern)
                                  #   + dist/package-planner.js
npm run build -- --renderer=native   # or minimal — swap timetool2's look (DESIGN.md §7);
                                     # the planner has no renderer (native look only)
npm run watch                     # rebuild both on change
npm test                          # unit tests for core/ + shared/ (node --test)
```

- Both outputs are readable, non-minified IIFEs with their own reviewer banner in
  `build.mjs`. To try the planner: paste `dist/package-planner.js` into the console on any
  TW page.

- Node 24, ESM (`"type": "module"`). esbuild is the only dependency.
- Gotcha: the test script uses a glob (`"test/**/*.test.js"`); `node --test test/` alone
  fails in this Node version (treats the dir as a module).

## Layout & the layering rule

```
src/
  shared/          generic modules used by BOTH scripts — never script-specific
    dom.js         h() element builder (no innerHTML soup) + injectStyle()
    queue.js       retry queue, throttled: request starts >= 200 ms apart (<= 5/s, the
                   approval limit); injectable now/setTimer for tests
    settings-store.js  createSettingsStore({name, version, defaults, migrate}) ->
                   per-world load/save/migrate/export/import (key `${world}${name}`)
    i18n.js        createI18n({tables, marketToLang}) -> translator + market->lang
    html.js        parseHtml() -> light element tree + find/findAll/textOf/intOf. Pure (no
                   DOM), so page parsers unit-test in Node against saved pages
  package-planner/ the Noble Package Planner (entry -> dist/package-planner.js)
    bootstrap.js   entry: register, popup, preconditions; Calculate: overviews -> solve
                   (after a paint) -> cards
    adapter/tw.js  the planner's ONLY TW-globals/DOM/endpoint module (own `w` cast):
                   env, throttled fetchText, overview/config URLs, Dialog.show($(host))
    core/          PURE: parse-prod / parse-buildings / world-config parsers, overview.js
                   (header `order=` keys, paging), load-overview (page=-1 then paged),
                   parse-incoming (Trader incoming -> in-flight per target; last
                   info_village link + .wood/.stone/.iron wrapper amounts), storable, preconditions, debug-info (whitelisted, scrubbed), i18n,
                   solver (§5, incl. merchant rounding), model (overviews -> solver
                   input), plan-view (plan -> summary + cards, h:mm)
    ui/popup.js    layout B; Dialog shown once, renders swap the host's children
  test/fixtures/package-planner/  trimmed, anonymised slices of the user's real enc1
                   pages (prod, buildings) + real public world configs (classic, coin)
  bootstrap.js     timetool2 entry: register, detect page, wire modules, start
  adapter/         the ONLY place that touches TW globals + TW-owned DOM
    tw.js          globals (Timing, game_data, TribalWars, $, ScriptAPI, Dialog), TW DOM, fetch
    clock.js       now() + refocus-resync (the Chrome tab-switch fix)
  core/            PURE JS — no DOM, no globals — unit-tested in test/
    time-math.js   send-time, bar math, snipe-time parser  (the correctness-critical part)
    settings.js    timetool2's settings schema on shared/settings-store.js
    i18n.js        timetool2's UI-label tables on shared/i18n.js; DATA reads are language-agnostic
  ui/
    renderer.js    re-exports the active renderer from `@renderer` (build-time alias)
    renderers/     modern.js (default) | native.js | minimal.js  + _base.js (shared impl)
    snipe-bar.js   the bar CONTROLLER: state + rAF loop + resync + passive submit listener
    incomings.js   TW commands table + "Send in" column + click-to-fill
    settings-panel.js  gear -> native TW Dialog popup
    cues.js        Web Audio countdown beeps (background-reliable) + visual cue hook
    notify.js      tab-title side-effect (kept out of renderers)
```

**Adapter boundary (pragmatic, DESIGN.md §3).** Rule of thumb when writing any line:
*"Did TW put this on the page, or did I?"*
- TW's globals / TW-rendered DOM (`#date_arrival`, `.commands-container`, `data-endtime`,
  `Timing`, `game_data`, …) → go through `adapter/`. That's the one file to fix when TW
  changes something, and where defensive null-checks live.
- Elements *we* created (`#tt2-*`, our panel) → touch directly.
- `core/` must stay pure (no DOM, no globals) so it keeps unit-testing without a TW page.
  `shared/` follows the same rule except `dom.js` (touches only `document`, never TW).
  Anything generic both scripts need goes in `shared/` — don't copy it between scripts.
  All untyped global access is funneled through the single `const w = (window)` cast in
  `adapter/tw.js` — keep it that way so `checkJs` covers the rest.

## Invariants — don't regress these

- **Clock:** always `Timing.getCurrentServerTime()` (via `adapter/clock.js` `now()`).
  Never build a second clock, never accumulate elapsed time by ticking a counter, never
  reintroduce the original's whole-hour `serverOffset` hack. Verified against `game.js`
  (DESIGN.md §4).
- **Repaint:** `requestAnimationFrame`, re-reading the clock every frame (sample, don't
  accumulate). On `visibilitychange`/`focus`, force an immediate repaint (`onResync`) —
  this is the fix for the Chrome background-throttle desync.
- **Events:** only ever bind/unbind our namespaced `global_tick.timetool2`. Never
  `$(TribalWars).off("global_tick")` (would rip out off-pack/the planner). DESIGN.md §11.
- **Planner/off-pack contract:** read `arrivalTimestamp` (epoch ms) + `endTimeWarning`
  from `document.referrer` and fill directly (no parsing). Verified byte-compatible with
  `off-pack.js` — must keep. DESIGN.md §11.
- **Incomings parsing:** read `data-endtime` (+ ms sub-span), NEVER translated header text
  (`th:contains("Aankomst")`) or natural-language dates. Keeps it language-independent.
- **`dist/` is generated** — never hand-edit; edit `src/` and rebuild.

## Reviewer-facing text lives in the build banner

esbuild strips comments from `dist/` unpredictably (JSDoc always gone; other comments
survive only in some positions). So **do not** rely on source comments reaching the shipped
file. The reviewer-facing "what/why + it's a timing aid, never auto-clicks, read-only"
summary is the `banner` in `build.mjs` — the one block guaranteed to ship. Update it there.

## Reference files (repo root, NOT bundled)

- `timetool.js` — the original script being replaced (behavioural reference).
- `game.js` — TW's compiled client. Source of truth for how `Timing`, `ScriptAPI`,
  `Dialog`, command rendering, etc. actually work. **Huge minified file** — grep with
  fixed strings and bounded patterns; complex regexes catastrophically backtrack and hang.
- `off-pack.js` — Devil's off-pack/planner. Source of the `arrivalTimestamp` contract.

## Status (v1 integrated)

Engine + core + all feature modules are implemented and wired: snipe bar, cues (Web Audio,
background-reliable, unlocked on first user gesture), settings popup (colors, cue toggles +
volume, tab-title, language, export/import), incomings (fetch + append "Send in" +
click-to-fill), planner/off-pack `arrivalTimestamp` handoff. Unit tests green; all three
renderers build.

What still needs a **live TW page** or is a known v1 gap — search `TODO(live)` and see the
"Known gaps" list at the bottom of DESIGN.md: incomings table insertion point + ms sub-span
presence on fetched rows; language change is persist-only (applies on reload); `remember`
persists the toggle but not the snipe values yet. Deferred: reaction-latency spike (§10).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues (`markwalet/tw-scripts`, via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.
