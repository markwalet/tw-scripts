# timetool2 — Design

A ground-up rewrite of `timetool.js`, a TribalWars (NL servers) attack-timing aid.
This document captures the locked design decisions and their rationale. It is the
spec the implementation is built against.

> **Legality**: timetool2 is a *timing aid only*. It informs and cues the human; it
> never auto-clicks, auto-submits, or sends an attack. Every "send" is a manual
> click. Anything that would automate the send itself is explicitly out of scope.

---

## 1. What the tool does

Rebuilt on the confirm/rally screen, with feature parity to the original plus new
features. Core value: help the user click "Aanvallen" at the exact millisecond so an
attack lands on a chosen arrival time (sniping / coordinated timing).

### Ported features (parity)
- **Snipe progress bar** — refills each second, orange while waiting, green in the
  1-second window to click. (Now the visual centerpiece; see §7.)
- **Snipe time + snipe ms inputs** — target an exact arrival time/millisecond.
- **Send-time ("Stuurtijd") row + live countdown** — arrival − travel duration.
- **Tab-title countdown** — `Send in: …` (now a toggle).
- **"Too Late!" state** — timers turn red once passed.
- **Incomings/commands enhancer** — lists running commands to the target with a
  "Send in" column; click a row to fill the snipe time. (See §5.)
- **Per-world remembered settings** (localStorage).
- **`console.log('sent at X ms')`** — kept as a free self-check.

### New features
- **Countdown cues** — configurable audio/visual alerts (absorbs the old end-time
  sound). See §6.
- **Settings panel** — in-page config (gear → native TW dialog). See §8.
- **i18n** — game-language auto-detect + override. See §9.
- **Swappable visual renderer** — build-time, for evaluating looks. See §7.

### Dropped
- **`delay` input** (#9) — never used; removes the `confirmenhancersettings` machinery.
- **`timeBarWidth`** (#13) — obscure cosmetic bookmarklet var. May return as an
  advanced setting later.
- **Reaction-latency / offset tracking** — see §10 (dropped for v1, with reasoning).

---

## 2. Architecture

- **Author in plain JS** across multiple modules in `src/`, **bundle with esbuild**
  to a single, **non-minified** `dist/timetool2.js` — the file TW hosts and reviews.
  Readable output is a hard requirement (reviewers read the hosted file).
- **Types via JSDoc**, not TypeScript. `@typedef`/`@param`/`@type` give editor-level
  type safety (with `jsconfig.json` `"checkJs": true`) at no learning cost and no new
  syntax. **esbuild strips comments from the output unpredictably** (JSDoc always gone;
  ordinary comments survive in some AST positions, not others), so we do **not** rely on
  source comments reaching the shipped file. Reviewer-facing "what/why" lives in the
  **build banner** (`build.mjs`) — the one block guaranteed to ship — which states plainly
  that the tool is a timing aid only, never auto-clicks, and is read-only. Source comments
  are for *us*; the banner is for *reviewers*.

### Module map
```
src/
  bootstrap.js          # entry: ScriptAPI.register, detect page, wire modules, start loop
  adapter/
    tw.js               # the volatile TW surface (globals + TW-owned DOM) — see §3
    clock.js            # clock() -> Timing.getCurrentServerTime() + refocus resync (§4)
  core/                 # pure JS, no DOM, no globals — unit-tested in test/
    time-math.js        # arrival parsing, tz conversion, sendTime = arrival - duration
    settings.js         # schema (JSDoc-typed), defaults, load/save, migration (§8)
    i18n.js             # string tables + market->lang detection + lookup (§9)
    queue.js            # ported request throttle/retry (twLib), read-only GETs
  ui/
    dom.js              # tiny element builder (no innerHTML soup)
    renderer.js         # one-line re-export of the active renderer (§7)
    renderers/
      modern.js         # candidate look A
      native.js         # candidate look B
      minimal.js        # candidate look C
    snipe-bar.js        # bar CONTROLLER (logic) -> talks to renderer
    incomings.js        # commands-table controller (§5)
    settings-panel.js   # gear -> native Dialog popup (§8)
    cues.js             # audio/visual cue scheduling (§6)
    notify.js           # title/favicon side-effects (kept out of renderers)
  test/                 # unit tests for core/*
build.mjs               # esbuild -> dist/timetool2.js
```

---

## 3. Adapter boundary (pragmatic)

Rule of thumb: **"Did TW put this on the page, or did I?"**

- **Through `adapter/`** (things TW owns — volatile): all globals (`Timing`,
  `game_data`, `TribalWars`, `ScriptAPI`, TW's `$`), the clock, the `global_tick`
  event bind/unbind, sounds, and **lookups of TW-owned DOM** (`#date_arrival`,
  `#command-data-form`, `.commands-container`, `#serverTime`, `data-endtime` reads).
  Defensive null-checks live here. When TW changes a selector, this is the one file
  to fix, and the one place a reviewer sees everything the script reaches into.
- **Direct access allowed** for elements *we* created (`#tt2-bar`, our panel nodes) —
  TW will never rename those.

`core/` stays 100% pure (no globals, no DOM) so it is unit-testable without a live
TW page.

---

## 4. Time & sync (the foundation)

Verified against TW's compiled `game.js`:

```js
Timing.getCurrentServerTime = () => this.initial_server_time + this.getElapsedTimeSinceLoad();
Timing.getElapsedTimeSinceLoad = () => performance.now() - (navigation_timing.connectEnd ?? 0);
```

Findings:
- **`getCurrentServerTime()` is the sole source of truth.** It is computed *on demand*
  from a server timestamp captured once at load (`initial_server_time`, itself
  network-latency-corrected via `PerformanceNavigationTiming`) plus elapsed time
  measured by **`performance.now()`** (monotonic — immune to wall-clock jumps, NTP,
  DST). The server-time value is **never** incremented by the tick loop, so it does
  not accumulate drift.
- **The tick loop (`doGlobalTick` / `tickHandlers` / `global_tick`) is a repaint pump,
  not a clock** — handlers *read* the clock each second and reschedule to the next
  whole second.

Decisions:
- **Use `Timing.getCurrentServerTime()` everywhere; build no clock of our own.** TW's
  is monotonic and latency-corrected — anything we rolled would be strictly worse.
- **Drop the original's whole-hour `serverOffset` hack** (`Math.round(… / 36e5) * …`).
  Compute the server↔browser-local offset *precisely* from the epoch clock for the
  `datetime-local` conversion.
- **Repaint via `requestAnimationFrame`**, re-reading the clock every frame (sampling,
  never accumulating). rAF auto-pauses when hidden and resumes cleanly.
- **Refocus resync (the Chrome tab-switch fix):** Chrome throttles background timers
  (down to ~1/min under intensive throttling), so the bar *renders* stale after
  switching back — but the clock value itself was never wrong. On `visibilitychange`
  (→ visible) and `focus`, force an immediate clock re-read + repaint so the bar snaps
  correct instantly instead of waiting for the next throttled tick. The original has
  **no** such handling; this is the fix for the reported desync.

---

## 5. Incomings / commands table

- **Reuse TW's native `.commands-container` table wholesale** — keep all of TW's
  columns and rendering; we only *append* the "Send in" column
  (`arrival_endtime − duration`). No rebuilding, no custom sorting (TW's rendering is
  the source of truth).
- **Read values by data, not by translated text.** Replace the original's
  `th:contains("Aankomst")` header detection and natural-language date parsing
  (`fillSnipeTool`, orig. lines 268–287) with reads of the row's `data-endtime`
  (+ the ms sub-span TW renders as the grey `:838`). This is language-independent on
  every server and kills the main fragility.
- **Click-to-fill becomes precise and one-click** — reading the timestamp directly
  drops an exact ms-accurate arrival into the snipe field with no string parsing.
  (This is the most-used path.)

---

## 6. Countdown cues (single toggle)

- **Alerts only** — beeps/flashes that tell you *when* to click. Fully legal.
- **One cue moment: send** (click-to-launch) — T-3/2/1s lead-in + a distinct "now" tone.
  (Arrival sound was cut as unwanted; the `endTimeWarning` sound is not ported.)
- **Background-reliable audio** via the Web Audio clock: tones are pre-scheduled at
  absolute times so they fire even when the tab is throttled/hidden — this is inherent
  to AudioContext, so it's always on when cues are enabled (no separate toggle). The
  context is unlocked on the first user gesture (browsers require it).
- **Settings: one `enabled` toggle + a volume slider** (`settings.cues = {enabled,
  volume}`). Keep it simple — no master/sub-toggle matrix.
- Visual cue hook lives in the renderer (`cue({kind})`, fired from the render loop on
  green-window entry and send); audio + tab-title are global side-effects in
  `cues.js` / `notify.js`, not in the renderer.

---

## 7. Visual renderer (swappable, build-time)

- The look is **not** user-configurable (for now). The renderer is a **dev/build-time
  swap** so we can evaluate candidate looks in-game: change one line in
  `ui/renderer.js` (or an esbuild `--alias`), recompile, compare.
- Three candidates to evaluate: **modern distinct card**, **native polished**
  (TW parchment/wood), **refined minimal**.
- **Contract** — all timing logic stays in controllers/clock; the renderer only
  paints and reports input via callbacks. This is what guarantees the looks are
  interchangeable:
  ```js
  export const Renderer = {
    mount(rootEl, { i18n, initialValues, handlers }) {},
    renderBar({ percent, state, targetPct, msText, clockText }) {},   // state: waiting|ready|idle
    renderSendTime({ sendDate, endtime, tooLate }) {},
    reflectInputs({ time, ms, remember }) {},
    cue({ kind }) {},                                                 // enter-green|send|arrival
    styleIncomingSendCell(cellEl, { sendEndtime }) {},
    mountSettings(rootEl, { schema, values, onChange }) {},
    destroy() {},
  };
  // input flows out via handlers: onTimeChange, onMsChange, onRememberToggle,
  //                               onCommandClick, onOpenSettings
  ```
- Renderer gets **data in only** (a `percent`+`state`, never `Timing`/durations) and
  owns its inputs but never mutates app state. TW's incomings table stays TW's; the
  renderer only styles the one appended cell.
- Scoped CSS: every class `.tt2-…`. The bar is the hero — taller, high-contrast, ms
  tick marks, a target marker, smooth orange→green, numeric ms readout.

---

## 8. Settings

- **Schema is a plain JS object, typed via JSDoc**, with a `version` for migrating the
  original's old localStorage keys (`<world>snipesettings`, etc.). Two-level nothing —
  just defaults + migration.
  ```js
  /** @typedef {Object} Settings
   *  @property {number} version
   *  @property {{waiting:string, ready:string, idle:string}} colors
   *  @property {{master:boolean, sendBeeps:boolean, arrivalSound:boolean,
   *              background:boolean, volume:number}} cues
   *  @property {boolean} tabTitle
   *  @property {'auto'|'nl'|'en'|'de'} language */
  ```
- **Persisted per-world in localStorage** (each world is its own origin; keep the
  `game_data.world` prefix as belt-and-suspenders).
- **Placement is hybrid:**
  - *Main panel, always visible:* the per-send controls — snipe time, snipe ms,
    remember.
  - *Gear → native TW `Dialog` popup:* set-once config — colors, cue toggles/volume,
    tab-title toggle, language, export/import (JSON).
- Use TW's native `Dialog.show(id, contentEl, priority, opts)` for the popup (correct
  look, overlay, no z-index fights). The `Dialog.show` call lives in `adapter/`; the
  renderer's `mountSettings` renders into the dialog's content node.
- The original's bookmarklet override vars (`timeColor`, etc.) may still be read as
  initial values for back-compat, but the panel is the real control surface.

---

## 9. i18n

Two independent concerns, deliberately separated:

1. **Reading TW data is language-agnostic by design** — we read timestamps and
   `data-*` attributes, never translated text. So the tool works on any language
   server with zero translation and **zero** dependence on `window.lang`. (The
   original's `window.lang['57d28d1b…']` "tomorrow" hack disappears because we no
   longer parse date text — see §5.)
2. **Our own UI labels** use a small hand-written string table (no library; ~15 LOC +
   a few hundred bytes per filled language):
   ```js
   const STRINGS = { nl: { snipeTime:'snipe tijd', sendIn:'verstuur over', … },
                     en: { … } };
   ```

Resolution:
```js
const detected = MARKET_TO_LANG[game_data.market] ?? 'en';   // game's set language
const lang = settings.language === 'auto' ? detected : settings.language;
const t = k => STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;       // fallback: en, then key
```
- **Default `auto`** follows the game via `game_data.market` (the only language signal
  TW exposes) — Dutch out-of-the-box on the NL server.
- **Override** via the settings dropdown (`auto|nl|en|de`), persisted per-world.
- **v1 coverage:** `nl` + `en` filled; `de`/others are easily-addable stubs that fall
  back to English per-key (never blank).

---

## 10. Reaction-latency / offset tracking — dropped for v1

Investigated twice; dropped both times, but the reasoning changed:

- **First pass:** assumed TW exposed only second-resolution registered arrival, so only
  a ping-blind "clicking consistency" stat was feasible — not worth it.
- **Second pass:** the incomings screenshot proved TW renders **ms-precision
  server-registered arrival** (the grey `:838`, from `getMilliseconds()` in `game.js`),
  which *is* true end-to-end landing accuracy (reaction + network). So the valuable
  version became feasible.
- **Why still dropped:** the send is a **native form POST that navigates**, destroying
  the script instance — so measurement can't happen in-place. It requires a deferred
  cross-load handoff: stash `{target, intendedArrival}` in localStorage on the submit
  click, then resolve it on a *later* background `info_village` fetch. This only
  captures a *subset* of sends (those where you revisit the target before the command
  lands), and the command-row **correlation** (matching the right row when multiple
  commands target one village) is fragile.

**v1:** keep only the free `console.log('sent at X ms')`. Revisit post-v1, starting
with a throwaway spike to prove the deferred-handoff + correlation on live data before
committing any storage/UI.

---

## 11. Interop with off-pack / the planner

Verified byte-compatible against `off-pack.js`:
- The planner emits attack links to `screen=place` with
  **`arrivalTimestamp=<Date.getTime()>`** (Unix **ms**). timetool2 reads it from
  `document.referrer` on the confirm screen and fills the snipe tool directly (no
  parsing — it's already a timestamp). **This is a must-keep contract.**
- `endTimeWarning=1` (arrival sound trigger) is also read from the referrer; it comes
  from the standalone Planner, not off-pack.
- **Coexistence = side-by-side (as the original behaves), with hygiene.** off-pack also
  consumes `arrivalTimestamp` and adds its own "Massa Planning Aankomst" row; both UIs
  simply show. The only real overlap is the tab title via `global_tick` (last action
  wins — cosmetic). timetool2 **namespaces its event (`global_tick.timetool2`)** and
  only `.off()`s its own, so it never rips out off-pack's handlers and never stacks
  duplicates (the one thing the original was sloppy about).

Three time-entry paths, in priority order — only the last has the "too many clicks"
pain, which lowers the stakes on manual entry:
1. **Planner auto-fill** (`arrivalTimestamp`) — zero clicks.
2. **Click-to-fill** from a command row — one click, now ms-precise (§5).
3. **Manual entry** — a **segmented `date | time | ms` control** (three custom-styled
   text fields, not a native picker). Each segment takes smart paste: pasting a full
   timestamp into any segment distributes across all three (`parseSnipeParts`). Date
   defaults to **today**; time defaults to the **expected arrival** (now + travel
   duration) so the bar is meaningful on load; ms defaults to 0. There is **no separate
   "snipe ms" field** — ms is the third segment (arrival is ms-precise; send = arrival −
   duration). The `send:` line and bar clock render 24h `dd-mm-yyyy HH:MM:SS(.mmm)` so
   values copy straight back in.

---

## Open / deferred
- Pick the shipping renderer after evaluating the three candidates in-game.
- Fill/proofread additional language tables (`de`, …) as contributors provide them.
- Post-v1: reaction-latency spike (§10).

### Known gaps after the v1 scaffold+integration
- **`TODO(live)` in `incomings.js`** — the exact insertion point of TW's fetched
  commands table into the confirm form (currently appended to the end as a placeholder),
  and confirming the `.grey.small` ms sub-span is present on every AJAX-fetched row (the
  *format* is verified against `game.js`; the fetched-partial DOM is not). Needs one live
  page to finish.
- **Language change is persist-only** — the setting saves and applies on next page load,
  but the translator and already-rendered labels are not rebuilt live (the panel captures
  `t` at construction). Acceptable for v1; rebuild-on-change is a later refinement.
- **`remember` persists only the toggle, not the values** — the v1 settings schema has
  `remember` but does not store the last snipe time/ms (the original did). So toggling it
  currently has nothing to restore. Add `msGoal`/`arrival` persistence to the schema when
  wiring remember fully.
- **Colors** now apply via CSS custom properties (`--tt2-wait/ready/idle`) set on
  `:root` from settings; renderers reference them with hardcoded fallbacks.
