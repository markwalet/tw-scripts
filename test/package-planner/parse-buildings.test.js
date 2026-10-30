import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuildings, buildingsEntries } from '../../src/package-planner/core/parse-buildings.js';

// Trimmed from the user's real enc1 Buildings overview: same 5 villages as prod.html.
// Academy level 0 renders as <span class="hidden">0</span>.
const fixture = readFileSync(new URL('../fixtures/package-planner/buildings.html', import.meta.url), 'utf8');

test('parseBuildings: academy level per village id, including level 0', () => {
  const { levels } = parseBuildings(fixture);
  assert.deepEqual([...levels.entries()], [
    [101, 2],
    [102, 2],
    [103, 2],
    [104, 0],
    [105, 3],
  ]);
});

test('parseBuildings: timber camp, clay pit and iron mine level per village id', () => {
  const { mines } = parseBuildings(fixture);
  assert.deepEqual([...mines.entries()], [
    [101, [30, 30, 30]],
    [102, [30, 30, 30]],
    [103, [28, 29, 26]],
    [104, [25, 25, 25]],
    [105, [30, 30, 30]],
  ]);
});

test('parseBuildings: a row without mine cells has no mine levels (no guess)', () => {
  const html = fixture.replace('<td class="upgrade_building b_iron">26</td>', '');
  const { mines } = parseBuildings(html);
  assert.equal(mines.has(103), false);
  assert.equal(mines.has(102), true);
});

test('buildingsEntries: academy level and mine levels per village, in loadOverview shape', () => {
  const { entries } = buildingsEntries(fixture);
  assert.deepEqual(entries[2], [103, { academy: 2, mines: [28, 29, 26] }]);
});

test('parseBuildings: header village count, no warnings on the real layout', () => {
  const page = parseBuildings(fixture);
  assert.equal(page.expectedCount, 5);
  assert.deepEqual(page.warnings, []);
});

test('parseBuildings: rows without an academy cell are reported, not guessed', () => {
  const html = fixture.replace('<td class="upgrade_building b_snob">3</td>', '');
  const page = parseBuildings(html);
  assert.equal(page.levels.has(105), false);
  assert.match(page.warnings.join('\n'), /1 of 5 rows .*academy/);
});

test('parseBuildings: no buildings table -> warning', () => {
  const page = parseBuildings('<table class="vis"><tr><td>x</td></tr></table>');
  assert.equal(page.levels.size, 0);
  assert.match(page.warnings[0], /buildings table not found/);
});
