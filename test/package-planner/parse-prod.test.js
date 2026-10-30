import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProd } from '../../src/package-planner/core/parse-prod.js';

// Trimmed from the user's real enc1 Production overview (page=-1, 5 of the rows kept,
// names/ids/coords replaced). Header links carry `order=storage_max` etc.
const fixture = readFileSync(new URL('../fixtures/package-planner/prod.html', import.meta.url), 'utf8');

test('parseProd: reads id, name, coords, resources, warehouse and merchants per village', () => {
  const { villages } = parseProd(fixture);
  assert.equal(villages.length, 5);
  assert.deepEqual(villages[0], {
    id: 101,
    name: 'Village 1',
    x: 500,
    y: 500,
    wood: 33140,
    stone: 44720,
    iron: 50294,
    storageMax: 400000,
    merchantsAvailable: 46,
    merchantsTotal: 46,
  });
});

test('parseProd: a full/near-full resource (span.warn / span.warn_90, no .res) still parses', () => {
  const { villages } = parseProd(fixture);
  const v3 = villages.find((v) => v.id === 103);
  assert.deepEqual([v3?.wood, v3?.stone, v3?.iron, v3?.storageMax], [87645, 115798, 29890, 115798]);
  const v4 = villages.find((v) => v.id === 104);
  assert.deepEqual([v4?.wood, v4?.stone, v4?.iron, v4?.merchantsAvailable], [30879, 60779, 719, 14]);
});

test('parseProd: reports the village count from the header and the page numbers in the nav', () => {
  const page = parseProd(fixture);
  assert.equal(page.expectedCount, 5);
  assert.deepEqual(page.pages, [0, 1, 2]);
  assert.deepEqual(page.warnings, []);
});

test('parseProd: no production table -> no villages and a warning', () => {
  const page = parseProd('<html><body><p>Premium account required</p></body></html>');
  assert.deepEqual(page.villages, []);
  assert.equal(page.warnings.length, 1);
  assert.match(page.warnings[0], /production table not found/);
});

// The group menu above every overview (from the real enc1 page, hrefs shortened).
const MENU = `<div class="vis_item" align="center">Groups: <strong class="group-menu-item" data-group-id="0" data-group-type="all" data-title="">&gt;all&lt; </strong>
  <a class="group-menu-item" data-group-id="5267" data-group-type="dynamic" href="/game.php?screen=overview_villages&amp;mode=prod&amp;group=5267" data-title="">[Noble]</a>
  <a class="group-menu-item" data-group-id="6819" data-group-type="dynamic" href="/game.php?screen=overview_villages&amp;mode=prod&amp;group=6819" data-title="">[No Academy]</a> </div>`;

test('parseProd: the group menu gives the player\'s groups (id, name; "all" left out)', () => {
  assert.deepEqual(parseProd(MENU + fixture).groups, [[5267, 'Noble'], [6819, 'No Academy']]);
  // The selected group is a <strong> with ">name<".
  const picked = MENU.replace(/<a([^>]*5267[^>]*)>\[Noble\]<\/a>/, '<strong$1>&gt;Noble&lt;</strong>');
  assert.deepEqual(parseProd(picked + fixture).groups, [[5267, 'Noble'], [6819, 'No Academy']]);
  assert.deepEqual(parseProd(fixture).groups, [], 'no menu on the page');
});
