// ui/notify.js — the tab-title side-effect (DESIGN.md §6/§7). Kept OUT of the renderers,
// which only do in-panel visuals. Driven each frame from the snipe-bar loop.

let enabled = true;
/** @type {string|null} the page's original title, captured once so we can restore it. */
let original = null;
/** True while we're actively showing a countdown, so we only restore after overriding. */
let overriding = false;

/** Capture the original document.title once, before we start overwriting it. */
export function initTabTitle() {
  if (original === null) original = document.title;
}

export function setTabTitleEnabled(on) {
  enabled = on;
  if (!on) restore();
}

/**
 * Show a countdown in the tab title, or restore the original when there's nothing to show
 * (no target) or the feature is off. Crucially it NEVER blanks the title: if we never
 * overrode it, or the captured original was empty, we leave whatever TW set in place.
 * @param {string} text  e.g. "0:14:40" — empty/falsy means "nothing to count down to"
 */
export function updateTabTitle(text) {
  if (enabled && text) {
    document.title = `Send in: ${text}`;
    overriding = true;
  } else {
    restore();
  }
}

function restore() {
  if (overriding && original) document.title = original;
  overriding = false;
}
