// package-planner/bootstrap.js — entry point of the Noble Package Planner
// (DESIGN-package-planner.md). Registers with TW, opens the popup, checks the
// preconditions, reads the world config and the Production + Buildings overviews, and
// shows how many packages the academies can store right now.

import * as tw from './adapter/tw.js';
import { resolveLang, makeTranslator } from './core/i18n.js';
import { parseWorldConfig } from './core/world-config.js';
import { checkPreconditions } from './core/preconditions.js';
import { loadOverview } from './core/load-overview.js';
import { prodEntries } from './core/parse-prod.js';
import { buildingsEntries } from './core/parse-buildings.js';
import { storableNow } from './core/storable.js';
import { buildDebugInfo } from './core/debug-info.js';
import { createPopup } from './ui/popup.js';

const t = makeTranslator(resolveLang('auto', tw.market()));

// TODO(#13): confirm author/contact for the Script Library submission.
tw.register(t('scriptName'), true, 'markwalet', 'en.tribalwars@coma.innogames.de');

/** Everything the debug summary may show; filled as we go (whitelisted in buildDebugInfo). */
/** @type {Parameters<typeof buildDebugInfo>[0]} */
const report = { env: tw.env() };

const popup = createPopup({
  t,
  show: tw.showDialog,
  storeUrl: tw.academyStoreUrl(),
  mobile: tw.isMobile(),
  debugText: () => buildDebugInfo(report),
  toast: tw.toast,
});

async function run() {
  popup.render({ status: 'loading' });
  const env = report.env || tw.env();
  try {
    if (!env.premium) {
      report.refused = 'noPremium';
      popup.render({ status: 'refused', reason: 'noPremium' });
      return;
    }
    const xml = await tw.worldConfigXml();
    const config = parseWorldConfig(xml);
    report.config = config;
    if (!config.warnings.length) tw.cacheWorldConfig(xml);
    const pre = checkPreconditions({ premium: env.premium, gold: config.gold });
    if (!pre.ok) {
      report.refused = pre.reason;
      popup.render({ status: 'refused', reason: pre.reason });
      return;
    }

    const [prod, buildings] = await Promise.all([
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('prod', p)), parse: prodEntries, expected: env.villages, label: 'prod' }),
      loadOverview({ fetchPage: (p) => tw.fetchText(tw.overviewUrl('buildings', p)), parse: buildingsEntries, expected: env.villages, label: 'buildings' }),
    ]);
    report.prod = prod;
    report.buildings = buildings;
    const result = storableNow([...prod.byId.values()], buildings.byId, config.packageCost);
    report.result = result;

    const warnings = [...config.warnings, ...prod.warnings, ...buildings.warnings];
    if (result.notInBuildings) warnings.push(`${result.notInBuildings} villages are missing from the Buildings overview`);
    popup.render({ status: 'done', result, cost: config.packageCost, warnings });
  } catch (err) {
    report.error = String(/** @type {any} */ (err)?.message ?? err);
    console.error('[Noble Package Planner]', err);
    popup.render({ status: 'error' });
  }
}

run();
