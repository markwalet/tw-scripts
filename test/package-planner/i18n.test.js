import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTranslator, fill } from '../../src/package-planner/core/i18n.js';

test('planner i18n: fills placeholders and leaves unknown ones', () => {
  const t = makeTranslator('en');
  assert.equal(fill(t('cardPackages'), { n: 12 }), '12 packages to store after arrival');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});
