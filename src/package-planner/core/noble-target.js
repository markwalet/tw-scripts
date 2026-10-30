// @ts-check
// package-planner/core/noble-target.js — "Collect for X new nobles" (DESIGN-package-planner.md
// §4/§6): price of the next noble + stored packages from the academy page, and how many
// packages X more nobles still need. Pure.

/**
 * The academy page (screen=snob) shows "<n> x <img res>" cells: price of the next noble,
 * stored packages, then "still required". Order-based, no translated text.
 * @param {string} html
 * @returns {{ price: number, stored: number } | null}
 */
export function parseAcademy(html) {
  const [price, stored] = [...html.matchAll(/(\d+)\s*x\s*<img[^>]*\/res\./g)].map((m) => +m[1]);
  return stored == null ? null : { price, stored };
}

/**
 * Each further noble costs one package more: x nobles from price p = p + (p+1) + … + (p+x−1).
 * @param {number} x @param {number} price @param {number} stored
 */
export function nobleTarget(x, price, stored) {
  const packages = x * price + (x * (x - 1)) / 2;
  return { packages, missing: Math.max(0, packages - stored) };
}
