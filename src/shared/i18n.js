// shared/i18n.js — UI-label translation helper. Each script passes its own label tables
// and TW-market -> language map. Covers OUR labels only: reading TW data stays
// language-agnostic (ids, attributes, timestamps — never translated text).

/**
 * @param {{
 *   tables: Record<string, Record<string, string>>,  // must contain `en` (the fallback)
 *   marketToLang?: Record<string, string>,           // game_data.market -> table key
 * }} config
 */
export function createI18n({ tables, marketToLang = {} }) {
  const en = tables.en || {};

  /**
   * Resolve the active language: an explicit setting wins; `auto` maps the market.
   * @param {string} setting  e.g. 'auto' | 'nl' | 'en'
   * @param {string} market   game_data.market
   * @returns {string}
   */
  function resolveLang(setting, market) {
    if (setting && setting !== 'auto') return setting;
    return marketToLang[market] ?? 'en';
  }

  /**
   * Build a translator bound to a language. Falls back: lang -> en -> key.
   * @param {string} lang
   * @returns {(key: string) => string}
   */
  function makeTranslator(lang) {
    const table = tables[lang] || en;
    return (key) => table[key] ?? en[key] ?? key;
  }

  return { resolveLang, makeTranslator, availableLangs: Object.keys(tables) };
}
