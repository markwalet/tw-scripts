// package-planner/core/i18n.js — the planner's UI-label tables (English only for v1;
// a language is only a table entry). Translator logic is shared/i18n.js.
// `{name}` placeholders are filled by `fill()`.

import { createI18n } from '../../shared/i18n.js';

const STRINGS = {
  en: {
    scriptName: 'Noble Package Planner',
    loading: 'Reading your villages…',
    noPremium: 'This script needs a premium account: it reads the premium village overviews.',
    coinWorld: 'This world uses gold coins, not resource packages. The planner only works on worlds with packages.',
    failed: 'Something went wrong while reading your villages. Use "Copy debug info" and paste it back to the author.',
    storableNow: 'Your academies can store {n} packages right now, without transports',
    storableNowOne: 'Your academies can store 1 package right now, without transports',
    storableDetail: '{academies} academy villages · {villages} villages read · package {wood} wood, {stone} clay, {iron} iron',
    academyStore: 'Academy › Store',
    warnings: 'Warnings',
    copyDebug: 'Copy debug info',
    copied: 'Debug info copied',
    copyManual: 'Copy the text below:',
  },
};

const i18n = createI18n({ tables: STRINGS, marketToLang: {} });

export const { resolveLang, makeTranslator } = i18n;

/**
 * Fill `{name}` placeholders.
 * @param {string} template
 * @param {Record<string, string | number>} vars
 */
export const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
