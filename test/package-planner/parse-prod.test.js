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
