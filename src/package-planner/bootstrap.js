// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW, opens the popup and checks the
// preconditions. Each Calculate reads the Production, Buildings and Trader (incoming)
// overviews (what is on the way counts as arrived) — plus, only with a noble target set,
// one academy page (price + stored packages; costs a request, so not otherwise) — runs the
// solver once (the plan is a snapshot) and shows it as cards.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator } from './core/i18n.js';
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

// TODO(#13): confirm author/contact for the Script Library submission.
tw.register(t('scriptName'), true, 'markwalet', 'en.tribalwars@coma.innogames.de');

/** Everything the debug summary may show; filled as we go (whitelisted in buildDebugInfo). */
/** @type {Parameters<typeof buildDebugInfo>[0]} */
const report = { env: tw.env() };
/** @type {ReturnType<typeof parseWorldConfig> | null} */
let config = null;
let busy = false;
/** Saved per world (localStorage); edited in the popup, used by the next Calculate. */
let settings = settingsStore.load(report.env?.world ?? '');

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
    save: (next) => { settings = next; settingsStore.save(report.env?.world ?? '', next); },
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

async function start() {
  popup.render({ status: 'starting' });
  const env = report.env || tw.env();
  try {
    if (!env.premium) {
      report.refused = 'noPremium';
      popup.render({ status: 'refused', reason: 'noPremium' });
      return;
    }
    const xml = await tw.worldConfigXml();
    config = parseWorldConfig(xml);
    report.config = config;
    if (!config.warnings.length) tw.cacheWorldConfig(xml);
    const pre = checkPreconditions({ premium: env.premium, gold: config.gold });
    if (!pre.ok) {
      report.refused = pre.reason;
      popup.render({ status: 'refused', reason: pre.reason });
      return;
    }
    popup.render({ status: 'ready' });
  } catch (err) {
    fail(err);
  }
}

async function calculate() {
  if (busy || !config) return;
  busy = true;
  const env = report.env || tw.env();
  try {
    popup.render({ status: 'loading' });
    const [prod, buildings, incoming] = await Promise.all([
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('prod', p)), parse: prodEntries, expected: env.villages, label: 'prod' }),
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('buildings', p)), parse: buildingsEntries, expected: env.villages, label: 'buildings' }),
      loadIncoming({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('trader', p)) }),
    ]);
    report.prod = prod;
    report.buildings = buildings;
    report.incoming = incoming;
    const villages = [...prod.byId.values()];
    const academyLevels = new Map([...buildings.byId].map(([id, b]) => [id, b.academy]));
    const mineLevels = new Map([...buildings.byId].flatMap(([id, b]) => (b.mines ? [[id, b.mines]] : [])));
    const storable = storableNow(villages, academyLevels, config.packageCost);
    report.result = storable;

    const warnings = [...config.warnings, ...prod.warnings, ...buildings.warnings, ...incoming.warnings];
    let target = null;
    const x = settings.nobles;
    const academy = x && [...buildings.byId].find(([, level]) => level > 0);
    if (academy) {
      const a = parseAcademy(await tw.fetchText(tw.academyUrl(academy[0])));
      if (a) target = { x, stored: a.stored, ...nobleTarget(x, a.price, a.stored) };
      else warnings.push(t('noAcademyPage'));
    }

    popup.render({ status: 'calculating' });
    await afterPaint();
    const input = solverInput({ villages, academyLevels, mineLevels, incoming: incoming.byId, config });
    const t0 = performance.now();
    const plan = solve(input.world, { ...input.options, ...solverOptions(settings, target?.missing) });
    const ms = Math.round(performance.now() - t0);
    const view = planView(plan, prod.byId, storable.packages);
    report.plan = {
      packages: plan.packages, cards: view.cards.length, transports: plan.transports.length,
      merchants: plan.merchants, longestSeconds: plan.longestSeconds, ms,
    };

    warnings.push(...input.warnings);
    if (storable.notInBuildings) warnings.push(`${storable.notInBuildings} villages are missing from the Buildings overview`);
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
