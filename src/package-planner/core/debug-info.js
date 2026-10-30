// package-planner/core/debug-info.js — the "Copy debug info" text: what the parsers saw
// (page structure, mapped columns, counts, warnings) so the user can paste it back when
// something is off on their real page. Pure. Built from a WHITELIST of fields: no player
// name/id, village ids/names/coords or tokens; free-text errors are scrubbed.

/**
 * Remove identifiers from free text (URLs in error messages etc.).
 * @param {string} s
 */
export function scrub(s) {
  return String(s)
    .replace(/([?&](?:village|t|id|target|target_id|h|player|player_id)=)[^&\s]*/gi, '$1…')
    .replace(/\d{4,}/g, '#')
    .replace(/\d{1,3}\|\d{1,3}/g, 'x|y');
}

/** @param {any} s structure from loadOverview */
function overviewLine(label, s) {
  if (!s) return `${label}: not loaded`;
  if (!s.tableFound) return `${label}: table not found`;
  const cols = s.columns ? ` columns ${Object.entries(s.columns).map(([k, i]) => `${k}@${i}`).join(',')}` : '';
  return `${label}: rows ${s.rows}, header count ${s.expectedCount ?? '?'}, read ${s.read}, pages linked ${s.pagesLinked}, fetched ${s.pagesFetched}${cols}`;
}

/**
 * @param {{
 *   env?: { world?: string, market?: string, device?: string, version?: string, premium?: boolean, sitting?: boolean, villages?: number | null },
 *   config?: { gold: boolean | null, packageCost: { wood: number, stone: number, iron: number }, speed: number | null, unitSpeed: number | null, warnings: string[] } | null,
 *   prod?: { byId: Map<number, any>, warnings: string[], structure: any } | null,
 *   buildings?: { byId: Map<number, { academy: number }>, warnings: string[], structure: any } | null,
 *   incoming?: { warnings: string[], structure: any } | null,
 *   result?: { packages: number, academies: number, villages: number, notInBuildings: number } | null,
 *   plan?: { packages: number, cards: number, transports: number, merchants: number, longestSeconds: number, ms: number } | null,
 *   refused?: string | null,
 *   error?: string | null,
 * }} r
 */
export function buildDebugInfo(r) {
  const e = r.env || {};
  const lines = ['Noble Package Planner debug'];
  lines.push(`env: world ${scrub(e.world ?? '?')}, market ${e.market ?? '?'}, device ${e.device ?? '?'}, game ${scrub(e.version ?? '?')}, premium ${e.premium}, sitting ${e.sitting}, villages ${e.villages ?? '?'}`);
  if (r.config) {
    const c = r.config;
    lines.push(`config: gold ${c.gold}, cost ${c.packageCost.wood}/${c.packageCost.stone}/${c.packageCost.iron}, speed ${c.speed}, unit_speed ${c.unitSpeed}`);
  }
  if (r.refused) lines.push(`refused: ${r.refused}`);
  lines.push(overviewLine('prod', r.prod?.structure));
  if (r.prod?.structure?.firstRow) lines.push(`prod first row: ${r.prod.structure.firstRow}`);
  lines.push(overviewLine('buildings', r.buildings?.structure));
  if (r.buildings?.structure?.firstRow) lines.push(`buildings first row: ${r.buildings.structure.firstRow}`);
  if (r.buildings) {
    /** @type {Record<number, number>} */
    const hist = {};
    for (const { academy: l } of r.buildings.byId.values()) hist[l] = (hist[l] || 0) + 1;
    lines.push(`academy levels: ${Object.entries(hist).map(([l, n]) => `${l}:${n}`).join(' ')}`);
  }
  const inc = r.incoming?.structure;
  lines.push(!inc ? 'trader incoming: not loaded'
    : `trader incoming: rows ${inc.rows}, pages linked ${inc.pagesLinked}, ${inc.transports} transports to ${inc.targets} villages`);
  if (inc?.firstRow) lines.push(`trader first row: ${inc.firstRow}`);
  if (r.result) {
    const x = r.result;
    lines.push(`storable now: ${x.packages} packages in ${x.academies} academies (${x.villages} villages, ${x.notInBuildings} missing from buildings)`);
  }
  if (r.plan) {
    const p = r.plan;
    lines.push(`plan: ${p.packages} packages, ${p.cards} targets, ${p.transports} transports, ${p.merchants} merchants, longest ${p.longestSeconds} s, solved in ${p.ms} ms`);
  }
  const warnings = [...(r.config?.warnings || []), ...(r.prod?.warnings || []), ...(r.buildings?.warnings || []), ...(r.incoming?.warnings || [])];
  lines.push(warnings.length ? `warnings:\n- ${warnings.map(scrub).join('\n- ')}` : 'warnings: none');
  if (r.error) lines.push(`error: ${scrub(r.error)}`);
  return lines.join('\n');
}
