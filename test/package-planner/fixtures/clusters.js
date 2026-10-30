// Copies of the saved overview fixtures, k village clusters far apart (ids 101-105 ->
// 201-205, …; x + 30 per cluster), so the planner has several targets. For the send smoke test.
import { readFileSync } from 'node:fs';

const dir = new URL('../../fixtures/package-planner/', import.meta.url);
const read = (/** @type {string} */ n) => readFileSync(new URL(n, dir), 'utf8');

/** @param {string} html @param {number} k */
const shift = (html, k) => html
  .replace(/(?<!\d)10([1-5])(?!\d)/g, `${k}0$1`)
  .replace(/\((\d{3})\|(\d{3})\)/g, (_, x, y) => `(${Number(x) + 30 * (k - 1)}|${y})`);

/** @param {number} clusters */
export function clusterFixtures(clusters) {
  // Repeat the village rows (first village row .. last </tr> before </tbody>) inside the table.
  const many = (/** @type {string} */ n) => {
    const html = read(n);
    const start = html.search(/<tr[^>]*class="[^"]*row_[ab]/);
    const end = html.lastIndexOf('</tr>', html.indexOf('</tbody>', start)) + 5;
    const rows = html.slice(start, end);
    return html.slice(0, start) + Array.from({ length: clusters }, (_, i) => shift(rows, i + 1)).join('\n') + html.slice(end);
  };
  return { prod: many('prod.html'), buildings: many('buildings.html'), config: read('config-classic.xml') };
}
