// package-planner/core/i18n.js — the planner's UI-label tables (English only for v1;
// a language is only a table entry). Translator logic is shared/i18n.js.
// `{name}` placeholders are filled by `fill()`.

import { createI18n } from '../../shared/i18n.js';
import { fmt } from './plan-view.js';

const STRINGS = {
  en: {
    scriptName: 'Noble Package Planner',
    loading: 'Reading your villages…',
    noPremium: 'This script needs a premium account: it reads the premium village overviews.',
    coinWorld: 'This world uses gold coins, not resource packages. The planner only works on worlds with packages.',
    failed: 'Something went wrong while reading your villages. The button above tries again; if it keeps failing, use "Copy debug info" and paste it back to the author.',
    academyStore: 'Academy › Store',
    calculate: 'Calculate plan',
    recalculate: 'Recalculate',
    calculating: 'Calculating the plan…',
    intro: 'Plans market transports between your villages so your academies can store as many complete packages as possible.',
    storableAfter: '{n} packages storable after everything arrives',
    storableAfterOne: '1 package storable after everything arrives',
    storableSplit: ' ({now} already now, {added} from these transports)',
    storedTotal: ' ({n} stored in total)',
    nobleTarget: '{n} nobles = {packages} packages, {missing} still missing',
    nobleTargetOne: '1 noble = {packages} packages, {missing} still missing',
    noAcademyPage: 'Academy page not readable: no noble target',
    notInBuildings: '{n} villages are missing from the Buildings overview',
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
    pending: '… Sending',
    skipped: '– Skipped',
    skippedNote: 'Skipped: the game reports its source villages no longer have these resources or merchants.',
    reduced: 'Reduced: {n} packages may be short (the game reports a source village has less than planned).',
    reducedOne: 'Reduced: 1 package may be short (the game reports a source village has less than planned).',
    rowLine: '{n} merchants · arrival in {time}',
    rowLineOne: '1 merchant · arrival in {time}',
    failCard: 'The game answered: {message}',
    failHttp: 'The game answered with an error ({message}). Nothing more was sent: refresh the page and run the script again.',
    failBotProtect: 'The game asks for a captcha. Solve it, refresh the page and run the script again.',
    failTimeout: 'No answer from the game. Check Market › Transports, then refresh the page and run the script again.',
    failUnavailable: 'Sending is not available on this page. Refresh the page and run the script again.',
    failRepeated: 'The game refused twice in a row ({message}). Nothing more is sent: refresh the page and run the script again.',
    fallback: 'Send village by village',
    wood: 'Wood',
    stone: 'Clay',
    iron: 'Iron',
    noTravelLimit: 'No travel limit',
    settingMax: 'Max {time}',
    settingReserve: 'reserve {wood}/{stone}/{iron}',
    settingKeep: 'keep {n} merchants',
    settingKeepOne: 'keep 1 merchant',
    settingBuffer: 'buffer {pct}%',
    settingNobles: 'nobles: {n}',
    settingNoProduction: 'target production not counted',
    edit: 'edit',
    close: 'close',
    maxTravelLabel: 'Max travel time (h:mm)',
    maxTravelHint: 'empty = no limit',
    reserveLabel: 'Reserve per resource',
    reserveHint: 'stays in every sending village',
    keepMerchantsLabel: 'Merchants to keep home',
    bufferLabel: 'Warehouse buffer (%)',
    bufferHint: 'room kept free in the academy village',
    productionLabel: 'Count production until arrival',
    productionHint: 'what a target makes during the trip; turn off if other scripts spend it there',
    allGroups: 'All',
    senderGroupLabel: 'Sender group',
    receiverGroupLabel: 'Receiver group',
    receiverGroupHint: 'its academy villages receive',
    noblesLabel: 'Collect for X new nobles',
    noblesHint: 'empty = as many as possible',
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

/**
 * A counted label: `key` with `{n}` filled, or its `keyOne` variant for exactly 1.
 * @param {(key: string) => string} t @param {string} key @param {number} n
 * @param {Record<string, string | number>} [vars]
 */
export const plural = (t, key, n, vars = {}) => fill(t(n === 1 ? `${key}One` : key), { n: fmt(n), ...vars });
