// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW, opens the popup and checks the
// preconditions. Each Calculate reads the Production, Buildings and Trader (incoming)
// overviews (what is on the way counts as arrived) — plus, only with a noble target set,
// one academy page (price + stored packages; costs a request, so not otherwise) — runs the
// solver once (the plan is a snapshot) and shows it as cards.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator, fill } from './core/i18n.js';
import { parseWorldConfig, RES } from './core/world-config.js';
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
  // Failed-send evidence, kept for "Copy debug info" until the popup closes (last 5).
  onFailure: (f) => { report.failures = [...(report.failures || []), f].slice(-5); },
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

/**
 * Read the world config and check the preconditions. True = ready to calculate. When it
 * fails (e.g. the config request), the error shows with the Calculate button, which runs
 * this again first.
 */
async function start() {
  config = null;
  popup.render({ status: 'starting' });
  try {
    if (refused(null)) return false; // before any request
    const { xml, cached } = await tw.worldConfigXml();
    const parsed = parseWorldConfig(xml);
    report.config = parsed;
    // Only a fresh fetch is stored: re-storing a cache read would renew its day forever.
    if (!cached && !parsed.warnings.length) tw.cacheWorldConfig(xml);
    if (refused(parsed.gold)) return false;
    config = parsed;
    popup.render({ status: 'ready' });
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

async function calculate() {
  if (busy) return;
  busy = true;
  try {
    if (!config && !(await start())) return;
    const cfg = /** @type {NonNullable<typeof config>} */ (config); // set by start()
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
    const storable = storableNow(villages, academyLevels, cfg.packageCost, receivers, incoming.byId);
    report.result = storable;

    const warnings = [...cfg.warnings, ...prod.warnings, ...buildings.warnings, ...incoming.warnings];
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
    const input = solverInput({ villages, academyLevels, mineLevels, incoming: incoming.byId, senders, receivers, config: cfg });
    const t0 = performance.now();
    const limits = solverOptions(settings, target?.missing);
    const plan = solve(input.world, { ...input.options, ...limits });
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
      cost: RES.map((k) => cfg.packageCost[k]),
      limits: { reserve: limits.reserve, keepMerchants: limits.keepMerchants },
      places: prod.byId,
    });
  } catch (err) {
    fail(err);
  } finally {
    busy = false;
  }
}

busy = true;
start().finally(() => { busy = false; });
