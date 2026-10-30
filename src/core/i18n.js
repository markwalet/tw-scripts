// core/i18n.js — UI-label translation (DESIGN.md §9).
// NOTE: reading TW DATA is language-agnostic (we read timestamps/data-* attributes,
// never translated text), so this module only covers OUR OWN labels.

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

/**
 * Resolve the active language.
 * @param {'auto'|'nl'|'en'|'de'} setting
 * @param {string} market  game_data.market
 * @returns {string}
 */
export function resolveLang(setting, market) {
  if (setting && setting !== 'auto') return setting;
  return MARKET_TO_LANG[market] ?? 'en';
}

/**
 * Build a translator bound to a language. Falls back: lang → en → key.
 * @param {string} lang
 * @returns {(key: string) => string}
 */
export function makeTranslator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[key] ?? STRINGS.en[key] ?? key;
}

export const _availableLangs = Object.keys(STRINGS); // for the settings dropdown
