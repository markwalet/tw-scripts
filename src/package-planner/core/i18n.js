// package-planner/core/i18n.js — the planner's UI-label tables (English only for v1;
// a language is only a table entry). Translator logic is shared/i18n.js.

import { createI18n } from '../../shared/i18n.js';

const STRINGS = {
  en: {
    scriptName: 'Noble Package Planner',
  },
};

const i18n = createI18n({ tables: STRINGS, marketToLang: {} });

export const { resolveLang, makeTranslator } = i18n;
