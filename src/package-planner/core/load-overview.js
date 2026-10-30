// package-planner/core/load-overview.js — read a whole village overview. Asks for
// page=-1 ("all") first; when that holds fewer villages than expected (TW caps the "all"
// view, ~1000 villages), fetches every page the nav links to and merges by village id.
// Pure: the caller supplies fetchPage (which goes through the throttled queue).

/**
 * @template T
 * @typedef {{
 *   entries: Array<[number, T]>,
 *   expectedCount: number | null,
 *   pages: number[],
 *   groups?: Array<[number, string]>,   the village-group menu (Production overview)
 *   warnings: string[],
 *   structure: object,
 * }} OverviewPage
 */

/**
 * @template T
 * @param {{
 *   fetchPage: (page: number) => Promise<string>,
 *   parse: (html: string) => OverviewPage<T>,
 *   expected?: number | null,          // e.g. game_data.player.villages (group "all")
 *   label?: string,
 * }} opts
 */
export async function loadOverview({ fetchPage, parse, expected = null, label = 'overview' }) {
  const first = parse(await fetchPage(-1));
  /** @type {Map<number, T>} */
  const byId = new Map(first.entries);
  const warnings = [...first.warnings];
  const want = Math.max(first.expectedCount ?? 0, expected ?? 0) || null;
  let pagesFetched = 0;

  if (want != null && byId.size < want && first.pages.length) {
    warnings.push(`${label}: "all" view held ${byId.size} of ${want} villages, read it paged (${first.pages.length} pages)`);
    for (const p of first.pages) {
      const page = parse(await fetchPage(p));
      pagesFetched += 1;
      for (const [id, v] of page.entries) if (!byId.has(id)) byId.set(id, v);
      for (const w of page.warnings) if (!warnings.includes(w)) warnings.push(w);
    }
  }
  if (want != null && byId.size < want) warnings.push(`${label}: read ${byId.size} of ${want} villages`);

  return {
    byId,
    groups: first.groups,
    warnings,
    structure: { ...first.structure, expectedCount: first.expectedCount, pagesLinked: first.pages.length, pagesFetched, read: byId.size },
  };
}
