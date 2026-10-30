import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n } from '../src/shared/i18n.js';

const i18n = createI18n({
  tables: {
    en: { hello: 'Hello', bye: 'Bye' },
    nl: { hello: 'Hallo' },
  },
  marketToLang: { nl: 'nl', be: 'nl', en: 'en', us: 'en' },
});

test('i18n: translator falls back lang -> en -> key', () => {
  const t = i18n.makeTranslator('nl');
  assert.equal(t('hello'), 'Hallo');
  assert.equal(t('bye'), 'Bye');
  assert.equal(t('missing'), 'missing');
});

test('i18n: an unknown language uses the English table', () => {
  assert.equal(i18n.makeTranslator('xx')('hello'), 'Hello');
});

test('i18n: resolveLang maps the TW market on auto, honours an explicit choice', () => {
  assert.equal(i18n.resolveLang('auto', 'be'), 'nl');
  assert.equal(i18n.resolveLang('auto', 'pl'), 'en');
  assert.equal(i18n.resolveLang('nl', 'us'), 'nl');
});

test('i18n: availableLangs lists the filled tables', () => {
  assert.deepEqual(i18n.availableLangs, ['en', 'nl']);
});
