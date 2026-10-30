import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTranslator, fill } from '../../src/package-planner/core/i18n.js';

test('planner i18n: fills placeholders and leaves unknown ones', () => {
  const t = makeTranslator('en');
  assert.equal(fill(t('storableNow'), { n: 12 }), 'Your academies can store 12 packages right now, without transports');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});
