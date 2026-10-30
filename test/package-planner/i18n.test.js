import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTranslator, fill } from '../../src/package-planner/core/i18n.js';

test('planner i18n: fills placeholders and leaves unknown ones', () => {
  const t = makeTranslator('en');
  assert.equal(fill(t('cardPackages'), { n: 12 }), '12 packages to store after arrival');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('planner i18n: the summary says the total is storable, split into now and from transports', () => {
  const t = makeTranslator('en');
  assert.equal(
    fill(t('storableAfter'), { n: 71 }) + fill(t('storableSplit'), { now: 17, added: 54 }),
    '71 packages storable after everything arrives (17 already now, 54 from these transports)',
  );
  assert.equal(t('storableAfterOne'), '1 package storable after everything arrives');
});
