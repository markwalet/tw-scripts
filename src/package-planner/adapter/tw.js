// package-planner/adapter/tw.js — the ONLY planner module that names TribalWars globals,
// TW-owned DOM/HTML and endpoints (DESIGN-package-planner.md §3). When TW changes
// something, this is the one file to fix.
//
// All untyped global access is funneled through this single cast, so the rest of the
// planner stays type-checked (checkJs) without a .d.ts file.
const w = /** @type {any} */ (window);

/** Register with TW's ScriptAPI (guarded no-op if unavailable). */
export function register(name, version, author, email) {
  if (w.ScriptAPI && typeof w.ScriptAPI.register === 'function') {
    w.ScriptAPI.register(name, version, author, email);
  }
}

/** Market/language code, e.g. "en" — the only language signal TW exposes. */
export const market = () => String(w.game_data?.market ?? 'en');
