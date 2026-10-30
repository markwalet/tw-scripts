// core/i18n.js — timetool2's UI-label tables (DESIGN.md §9). The translator and
// market->language logic is the shared helper (shared/i18n.js).
// NOTE: reading TW DATA is language-agnostic (we read timestamps/data-* attributes,
// never translated text), so these tables only cover OUR OWN labels.

import { createI18n } from '../shared/i18n.js';

/** Our UI strings, keyed by semantic name. nl + en filled; add tables as needed. */
const STRINGS = {
  en: {
    snipeTime: 'snipe time',
    snipeMs: 'snipe ms',
    arrival: 'arrival',
    sendIn: 'send in',
    remember: 'remember',
    sendTime: 'Send time',
    tooLate: 'Too Late!',
    settings: 'Settings',
    language: 'Language',
    colors: 'Colors',
    cues: 'Cues',
    export: 'Export',
    import: 'Import',
  },
  nl: {
    snipeTime: 'snipe tijd',
    snipeMs: 'snipe ms',
    arrival: 'aankomst',
    sendIn: 'verstuur over',
    remember: 'onthoud',
    sendTime: 'Stuurtijd',
    tooLate: 'Te laat!',
    settings: 'Instellingen',
    language: 'Taal',
    colors: 'Kleuren',
    cues: 'Signalen',
    export: 'Exporteren',
    import: 'Importeren',
  },
  // de: { ... }  // stub — falls back to en per-key until filled
};

/** Map TW market code → our language table. */
const MARKET_TO_LANG = { nl: 'nl', en: 'en', us: 'en', de: 'de' };

const i18n = createI18n({ tables: STRINGS, marketToLang: MARKET_TO_LANG });

export const { resolveLang, makeTranslator } = i18n;
export const _availableLangs = i18n.availableLangs; // for the settings dropdown
