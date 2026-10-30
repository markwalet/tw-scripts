import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorldConfig } from '../../src/package-planner/core/world-config.js';

// Real public `interface.php?func=get_config` responses: enc1 (classic, packages) and
// enc2 (coins).
const read = (f) => readFileSync(new URL(`../fixtures/package-planner/${f}`, import.meta.url), 'utf8');

test('parseWorldConfig: classic world -> package cost, gold flag and speeds', () => {
  assert.deepEqual(parseWorldConfig(read('config-classic.xml')), {
    gold: false,
    packageCost: { wood: 28000, stone: 30000, iron: 25000 },
    speed: 3.6,
    unitSpeed: 0.278,
    baseProduction: 33,
    warnings: [],
  });
});

test('parseWorldConfig: coin world -> gold true', () => {
  assert.equal(parseWorldConfig(read('config-coin.xml')).gold, true);
});

test('parseWorldConfig: a redirect page instead of XML -> fallback cost, unknown gold, warning', () => {
  const html = '<html><head><title>307 Temporary Redirect</title></head><body><center><h1>307 Temporary Redirect</h1></center></body></html>';
  const cfg = parseWorldConfig(html);
  assert.equal(cfg.gold, null);
  assert.deepEqual(cfg.packageCost, { wood: 28000, stone: 30000, iron: 25000 });
  assert.match(cfg.warnings.join('\n'), /package cost not found.*28000\/30000\/25000/);
  assert.equal(cfg.baseProduction, null);
});

test('parseWorldConfig: only the top-level <speed> counts', () => {
  const xml = '<config><unit><speed>99</speed></unit><speed>2</speed><snob><gold>0</gold><coin_wood>1</coin_wood><coin_stone>2</coin_stone><coin_iron>3</coin_iron></snob></config>';
  const cfg = parseWorldConfig(xml);
  assert.equal(cfg.speed, 2);
  assert.deepEqual(cfg.packageCost, { wood: 1, stone: 2, iron: 3 });
});
