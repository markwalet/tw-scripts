// package-planner/core/preconditions.js — refuse with a clear reason when the planner
// can't work (DESIGN-package-planner.md §2). Pure; reasons are i18n keys.

/**
 * @param {{ premium: boolean, gold: boolean | null }} facts  gold null = config unreadable
 * @returns {{ ok: true } | { ok: false, reason: 'noPremium' | 'coinWorld' }}
 */
export function checkPreconditions({ premium, gold }) {
  if (!premium) return { ok: false, reason: 'noPremium' };
  if (gold === true) return { ok: false, reason: 'coinWorld' };
  return { ok: true };
}
