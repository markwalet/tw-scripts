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
    academyStore: 'Academy › Store',
    calculate: 'Calculate plan',
    recalculate: 'Recalculate',
    calculating: 'Calculating the plan…',
    intro: 'Plans market transports between your villages so your academies can store as many complete packages as possible.',
    storableAfter: '{n} packages storable after everything arrives',
    storableAfterOne: '1 package storable after everything arrives',
    storableSplit: ' ({now} already now, {added} from these transports)',
    storedTotal: ' ({n} stored in total)',
    lastArrival: 'Last arrival in {time} · {sent} of {total} sent',
    planDetail: '{merchants} merchants · {academies} academy villages · {villages} villages read',
    noTransports: 'No transports needed: your academies can store these packages right now.',
    noPackages: 'No transport can complete another package with the resources and merchants available now.',
    cardPackages: '{n} packages to store after arrival',
    cardPackagesOne: '1 package to store after arrival',
    fromVillages: 'from {n} villages',
    fromVillagesOne: 'from 1 village',
    cardLastArrival: 'last arrival in {time}',
    farthest: 'Farthest source: {name} ({x}|{y}), travel time {time}',
    request: 'Request',
    send: 'Send',
    sent: '✓ Sent',
    sendFailed: '✗ Failed',
    notSent: 'Not sent',
    rowLine: '{merchants} merchants · arrival in {time}',
    failGame: 'The game answered: {message}. The other targets were not sent: refresh the page and run the script again.',
    failBotProtect: 'The game asks for a captcha. Solve it, refresh the page and run the script again.',
    failTimeout: 'No answer from the game. Check Market › Transports, then refresh the page and run the script again.',
    failUnavailable: 'Sending is not available on this page. Refresh the page and run the script again.',
    fallback: 'Send village by village instead',
    wood: 'Wood',
    stone: 'Clay',
    iron: 'Iron',
    noTravelLimit: 'No travel limit',
    settingMax: 'Max {time}',
    settingReserve: 'reserve {wood}/{stone}/{iron}',
    settingKeep: 'keep {n} merchants',
    settingKeepOne: 'keep 1 merchant',
    settingBuffer: 'buffer {pct}%',
    edit: 'edit',
    close: 'close',
    maxTravelLabel: 'Max travel time (h:mm)',
    maxTravelHint: 'empty = no limit',
    reserveLabel: 'Reserve per resource',
    reserveHint: 'stays in every sending village',
    keepMerchantsLabel: 'Merchants to keep home',
    bufferLabel: 'Warehouse buffer (%)',
    bufferHint: 'room kept free in the academy village',
    invalidSetting: 'Not a valid value: the previous one is kept.',
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
