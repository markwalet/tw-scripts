import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAcademy, nobleTarget } from '../../src/package-planner/core/noble-target.js';
import { academyPage as academy } from './fixtures/academy.js';

test('noble target: reads price and stored packages from the academy page', () => {
  assert.deepEqual(parseAcademy(academy(72, 15)), { price: 72, stored: 15 });
  assert.deepEqual(parseAcademy(academy(72, 0)), { price: 72, stored: 0 });
});

test('noble target: X nobles cost p + (p+1) + … + (p+X−1) packages, minus what is stored', () => {
  // The two screenshots: price 72, stored 10 and 15. One noble -> the page's "still required".
  assert.deepEqual(nobleTarget(1, 72, 15), { packages: 72, missing: 57 });
  assert.deepEqual(nobleTarget(1, 72, 10), { packages: 72, missing: 62 });
  assert.deepEqual(nobleTarget(5, 72, 15), { packages: 370, missing: 355 });
  assert.deepEqual(nobleTarget(5, 72, 10), { packages: 370, missing: 360 });
  assert.deepEqual(nobleTarget(2, 3, 10), { packages: 7, missing: 0 }, 'more stored than needed');
});

test('noble target: a page without the package cells -> null', () => {
  assert.equal(parseAcademy('<h2>Academy</h2><p>not built</p>'), null);
});
