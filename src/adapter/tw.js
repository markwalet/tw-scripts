// adapter/tw.js — the ONLY module that names TribalWars globals and looks up TW-owned
// DOM (DESIGN.md §3). Everything TW can change lives here, behind typed wrappers, with
// the defensive null-checks. When TW renames a selector or tweaks a global, this is the
// one file to fix.
//
// All untyped global access is funneled through this single cast, so the rest of the
// codebase stays type-checked (checkJs) without a .d.ts file.
const w = /** @type {any} */ (window);

/* ---- globals --------------------------------------------------------------------- */

/** Register with TW's ScriptAPI (guarded no-op if unavailable). */
export function register(name, version, author, email) {
  if (w.ScriptAPI && typeof w.ScriptAPI.register === 'function') {
    w.ScriptAPI.register(name, version, author, email);
  }
}

/** Current world id, e.g. "nl123" — used to namespace per-world storage. */
export const world = () => String(w.game_data?.world ?? 'unknown');

/** Browser storage for the settings store (blocked storage -> nothing kept, no crash). */
export function storage() {
  try {
    return /** @type {Storage} */ (w.localStorage);
  } catch {
    return { getItem: () => null, setItem() {} };
  }
}

/** Market/language code, e.g. "nl" — the only language signal TW exposes (§9). */
export const market = () => String(w.game_data?.market ?? 'en');

/** Base link for background fetches, e.g. info_village pages. */
export const linkBasePure = () => String(w.game_data?.link_base_pure ?? '');

/** Play one of TW's named sounds (e.g. 'chat'). */
export function playSound(name) {
  w.TribalWars?.playSound?.(name);
}

/* ---- the clock (see also adapter/clock.js) --------------------------------------- */

/**
 * TW's authoritative server clock, in epoch ms. Computed on demand from a
 * latency-corrected load anchor + monotonic performance.now() (verified in game.js,
 * DESIGN.md §4). This is the sole source of truth — we build no clock of our own.
 * @returns {number}
 */
export const serverNow = () => Number(w.Timing?.getCurrentServerTime?.() ?? Date.now());

/* ---- the global_tick event (namespaced — DESIGN.md §11) -------------------------- */

const TICK_NS = 'global_tick.timetool2';

/** Subscribe to TW's per-second tick. We only ever bind/unbind our own namespace. */
export function onTick(handler) {
  w.$(w.TribalWars).on(TICK_NS, handler);
}
/** Remove ONLY our tick handler — never off() the bare event (would rip out off-pack). */
export function offTick() {
  w.$(w.TribalWars).off(TICK_NS);
}

/* ---- background fetch (read-only — DESIGN.md §5) --------------------------------- */

/**
 * GET a TW page as HTML text, navigation-free (used to read the target's command list).
 * Uses TW's jQuery. Returns the response body as a string.
 * @param {string} url
 * @returns {Promise<string>}
 */
export function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    w.$.get(url).done(resolve).fail(reject);
  });
}

/* ---- native settings dialog (DESIGN.md §8) --------------------------------------- */

/**
 * Show content in TW's native Dialog (correct look, overlay, no z-index fights).
 * TW's Dialog.isContentValid accepts a string, a jQuery object, or a 1-arg function — NOT
 * a bare DOM node. We wrap our element in TW's jQuery, which keeps the node (and its
 * already-attached event listeners) intact.
 */
export function showDialog(id, contentEl, opts = {}) {
  if (w.Dialog && typeof w.Dialog.show === 'function') {
    w.Dialog.show(id, w.$(contentEl), w.Dialog.PRIORITY_NONE ?? 0, opts);
    return true;
  }
  return false;
}

/* ---- TW-owned DOM ---------------------------------------------------------------- */
// Lookups of elements TW renders. Return null when absent; callers guard.

export const els = {
  /** The arrival block on the confirm screen — presence means "start the tool". */
  arrivalContainer: () => document.getElementById('date_arrival'),
  /** The confirm/command form. */
  commandForm: () => document.getElementById('command-data-form'),
  /** The submit button ("Aanvallen"). We only LISTEN to it — never click it. */
  confirmSubmit: () => document.getElementById('troop_confirm_submit'),
  /** Map body — observed to detect an attack window opening from the map. */
  dsBody: () => document.getElementById('ds_body'),
  /** Server time <p> (fallback display parsing only; prefer serverNow()). */
  serverTime: () => document.getElementById('serverTime'),
  /** Running-commands table inside fetched info_village HTML. */
  commandsContainer: (root = document) => root.querySelector('.commands-container'),
  /** Command rows inside a commands-container. */
  commandRows: (root = document) => Array.from(root.querySelectorAll('.commands-container tr.command-row')),
};

/**
 * Travel duration of the attack being composed, in ms.
 * Read from the arrival span's data-duration (seconds). 0 if unavailable.
 * @returns {number}
 */
export function attackDurationMs() {
  const span = document.querySelector('#date_arrival span');
  const secs = span ? Number(span.getAttribute('data-duration')) : NaN;
  return Number.isFinite(secs) ? secs * 1000 : 0;
}
