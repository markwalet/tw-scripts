// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW, opens the popup and checks the
// preconditions. Each Calculate reads the Production + Buildings overviews, runs the
// solver once (the plan is a snapshot) and shows it as cards.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator } from './core/i18n.js';
import { parseWorldConfig } from './core/world-config.js';
import { checkPreconditions } from './core/preconditions.js';
import { loadOverview } from './core/load-overview.js';
import { prodEntries } from './core/parse-prod.js';
import { buildingsEntries } from './core/parse-buildings.js';
import { storableNow } from './core/storable.js';
import { solverInput } from './core/model.js';
import { solve } from './core/solver.js';
import { planView } from './core/plan-view.js';
import { buildDebugInfo } from './core/debug-info.js';
import { createPopup } from './ui/popup.js';

const t = makeTranslator(resolveLang('auto', tw.market()));

// TODO(#13): confirm author/contact for the Script Library submission.
tw.register(t('scriptName'), true, 'markwalet', 'en.tribalwars@coma.innogames.de');

/** Everything the debug summary may show; filled as we go (whitelisted in buildDebugInfo). */
/** @type {Parameters<typeof buildDebugInfo>[0]} */
const report = { env: tw.env() };
/** @type {ReturnType<typeof parseWorldConfig> | null} */
let config = null;
let busy = false;

const popup = createPopup({
  t,
  show: tw.showDialog,
  storeUrl: tw.academyStoreUrl(),
  mobile: tw.isMobile(),
  debugText: () => buildDebugInfo(report),
  toast: tw.toast,
  onCalculate: () => { calculate(); },
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
    const [prod, buildings] = await Promise.all([
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('prod', p)), parse: prodEntries, expected: env.villages, label: 'prod' }),
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('buildings', p)), parse: buildingsEntries, expected: env.villages, label: 'buildings' }),
    ]);
    report.prod = prod;
    report.buildings = buildings;
    const villages = [...prod.byId.values()];
    const storable = storableNow(villages, buildings.byId, config.packageCost);
    report.result = storable;

    popup.render({ status: 'calculating' });
    await afterPaint();
    const input = solverInput({ villages, academyLevels: buildings.byId, config });
    const t0 = performance.now();
    const plan = solve(input.world, input.options);
    const ms = Math.round(performance.now() - t0);
    const view = planView(plan, prod.byId, storable.packages);
    report.plan = {
      packages: plan.packages, cards: view.cards.length, transports: plan.transports.length,
      merchants: plan.merchants, longestSeconds: plan.longestSeconds, ms,
    };

    const warnings = [...config.warnings, ...input.warnings, ...prod.warnings, ...buildings.warnings];
    if (storable.notInBuildings) warnings.push(`${storable.notInBuildings} villages are missing from the Buildings overview`);
    popup.render({
      status: 'done',
      plan: view,
      detail: { merchants: plan.merchants, academies: storable.academies, villages: villages.length },
      stored: null, // packages already stored: read from the academy page with the noble target (#10)
      warnings,
    });
  } catch (err) {
    fail(err);
  } finally {
    busy = false;
  }
}

start();
