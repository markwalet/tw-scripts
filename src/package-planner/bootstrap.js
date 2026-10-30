// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW, opens the popup and checks the
// preconditions. Each Calculate reads the Production, Buildings and Trader (incoming)
// overviews (what is on the way counts as arrived) — plus, only with a noble target set,
// one academy page (price + stored packages; costs a request, so not otherwise) — runs the
// solver once (the plan is a snapshot) and shows it as cards.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator, fill } from './core/i18n.js';
import { parseWorldConfig } from './core/world-config.js';
import { checkPreconditions } from './core/preconditions.js';
import { loadOverview } from './core/load-overview.js';
import { prodEntries } from './core/parse-prod.js';
import { buildingsEntries } from './core/parse-buildings.js';
import { loadIncoming } from './core/parse-incoming.js';
import { storableNow } from './core/storable.js';
import { solverInput } from './core/model.js';
import { solve } from './core/solver.js';
import { planView } from './core/plan-view.js';
import { buildDebugInfo } from './core/debug-info.js';
import { settingsStore, solverOptions } from './core/settings.js';
import { parseAcademy, nobleTarget } from './core/noble-target.js';
import { createPopup } from './ui/popup.js';
import { createSettingsPanel } from './ui/settings-panel.js';

const t = makeTranslator(resolveLang('auto', tw.market()));

// SCRIPT LIBRARY AUTHOR — decide before the forum submission: the name and contact e-mail
// TW's ScriptAPI shows for this script. TW rejects an empty e-mail on a hosted script; the
// adapter then skips registering and the planner still runs.
const AUTHOR = { name: 'markwalet', email: '' };

tw.register(t('scriptName'), true, AUTHOR.name, AUTHOR.email);

/** Everything the debug summary may show; filled as we go (whitelisted in buildDebugInfo). */
/** @type {Parameters<typeof buildDebugInfo>[0]} */
const env = tw.env();
const report = { env };
/** @type {ReturnType<typeof parseWorldConfig> | null} */
let config = null;
let busy = false;
/** Saved per world (localStorage); edited in the popup, used by the next Calculate. */
let settings = settingsStore.load(env.world, tw.storage());
const saveSettings = () => settingsStore.save(env.world, settings, tw.storage());

const popup = createPopup({
  t,
  show: tw.showDialog,
  storeUrl: tw.academyStoreUrl(),
  mobile: tw.isMobile(),
  debugText: () => buildDebugInfo(report),
  toast: tw.toast,
  onCalculate: () => { calculate(); },
  post: tw.postMarket,
  settingsPanel: createSettingsPanel({
    t,
    get: () => settings,
    save: (next) => { settings = next; saveSettings(); },
  }),
});

/** @param {unknown} err */
function fail(err) {
  report.error = String(/** @type {any} */ (err)?.message ?? err);
  console.error('[Noble Package Planner]', err);
  popup.render({ status: 'error' });
}

/**
 * Resolve after the browser painted (the solver may block the page for a second or more).
 * rAF + a timeout lands after the next paint; the 100 ms fallback covers browsers that hold
 * rAF back (a background tab).
 */
const afterPaint = () => new Promise((resolve) => {
  let done = false;
  const go = () => { if (!done) { done = true; setTimeout(resolve, 0); } };
  requestAnimationFrame(go);
  setTimeout(go, 100);
});

/**
 * Show the refusal when the planner can't work (spec §2). True = refused.
 * @param {boolean | null} gold  null = not known yet / config unreadable
 */
function refused(gold) {
  const pre = checkPreconditions({ premium: env.premium, gold });
  if (pre.ok) return false;
  report.refused = pre.reason;
  popup.render({ status: 'refused', reason: pre.reason });
  return true;
}

async function start() {
  popup.render({ status: 'starting' });
  try {
    if (refused(null)) return; // before any request
    const xml = await tw.worldConfigXml();
    config = parseWorldConfig(xml);
    report.config = config;
    if (!config.warnings.length) tw.cacheWorldConfig(xml);
    if (refused(config.gold)) return;
    popup.render({ status: 'ready' });
  } catch (err) {
    fail(err);
  }
}

async function calculate() {
  if (busy || !config) return;
  busy = true;
  try {
    popup.render({ status: 'loading' });
    const prodOf = (group = 0) =>
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('prod', p, group)), parse: prodEntries, expected: group ? null : env.villages, label: 'prod' });
    // A group's members = the rows of its Production overview (null = all). Read BEFORE
    // the group-0 overviews: TW remembers the last group, and must be left on "all"
    // (Request resources only accepts sources from the current group).
    const members = async (/** @type {number} */ g) => (g ? new Set((await prodOf(g)).byId.keys()) : null);
    const { senderGroup, receiverGroup } = settings;
    const senders = await members(senderGroup);
    const receivers = receiverGroup === senderGroup ? senders : await members(receiverGroup);
    const [prod, buildings, incoming] = await Promise.all([
      prodOf(),
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('buildings', p)), parse: buildingsEntries, expected: env.villages, label: 'buildings' }),
      loadIncoming({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('trader', p)) }),
    ]);
    report.prod = prod;
    report.buildings = buildings;
    report.incoming = incoming;
    // The group list for the dropdowns comes with the Production overview (no extra request).
    if (prod.groups?.length) settings = { ...settings, groups: prod.groups };
    saveSettings();
    const villages = [...prod.byId.values()];
    const academyLevels = new Map([...buildings.byId].map(([id, b]) => [id, b.academy]));
    const mineLevels = new Map([...buildings.byId].flatMap(([id, b]) => (b.mines ? [[id, b.mines]] : [])));
    const storable = storableNow(villages, academyLevels, config.packageCost, receivers, incoming.byId);
    report.result = storable;

    const warnings = [...config.warnings, ...prod.warnings, ...buildings.warnings, ...incoming.warnings];
    let target = null;
    const x = settings.nobles;
    const academy = x && [...academyLevels].find(([, level]) => level > 0);
    if (academy) {
      const a = parseAcademy(await tw.fetchText(tw.academyUrl(academy[0])));
      if (a) target = { x, stored: a.stored, ...nobleTarget(x, a.price, a.stored) };
      else warnings.push(t('noAcademyPage'));
    }

    popup.render({ status: 'calculating' });
    await afterPaint();
    const input = solverInput({ villages, academyLevels, mineLevels, incoming: incoming.byId, senders, receivers, config });
    const t0 = performance.now();
    const plan = solve(input.world, { ...input.options, ...solverOptions(settings, target?.missing) });
    const ms = Math.round(performance.now() - t0);
    const view = planView(plan, prod.byId, storable.packages);
    report.plan = {
      packages: plan.packages, cards: view.cards.length, transports: plan.transports.length,
      merchants: plan.merchants, longestSeconds: plan.longestSeconds, ms,
    };

    warnings.push(...input.warnings);
    if (storable.notInBuildings) warnings.push(fill(t('notInBuildings'), { n: storable.notInBuildings }));
    popup.render({
      status: 'done',
      plan: view,
      detail: { merchants: plan.merchants, academies: storable.academies, villages: villages.length },
      target,
      warnings,
      transports: plan.transports,
      places: prod.byId,
    });
  } catch (err) {
    fail(err);
  } finally {
    busy = false;
  }
}

start();
