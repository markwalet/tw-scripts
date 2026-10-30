// adapter/clock.js — the clock façade + the refocus-resync fix (DESIGN.md §4).
//
// TW's Timing.getCurrentServerTime() is already correct on demand (monotonic anchor),
// so we never build our own clock. The ONLY thing we add is a repaint trigger on
// focus/visibility: Chrome throttles background timers, so after a tab switch the BAR
// renders stale even though the clock value was never wrong. On return we force an
// immediate re-read + repaint instead of waiting for the next throttled tick.

import { serverNow } from './tw.js';

/** Current server time in epoch ms — the single source of truth. */
export const now = () => serverNow();

/** @type {Set<() => void>} listeners fired when the tab regains focus/visibility. */
const resyncListeners = new Set();

/**
 * Register a callback to run the instant the tab becomes visible/focused again.
 * Controllers use this to force an immediate repaint after Chrome un-throttles.
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function onResync(fn) {
  resyncListeners.add(fn);
  return () => resyncListeners.delete(fn);
}

let installed = false;

/** Install the visibility/focus handlers once. */
export function installResync() {
  if (installed) return;
  installed = true;

  const fire = () => {
    for (const fn of resyncListeners) {
      try {
        fn();
      } catch (err) {
        // A single bad listener must not kill the resync for the others.
        console.error('[timetool2] resync listener failed', err);
      }
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fire();
  });
  window.addEventListener('focus', fire);
}
