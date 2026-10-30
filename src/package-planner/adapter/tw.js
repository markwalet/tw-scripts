// package-planner/adapter/tw.js — the ONLY planner module that names TribalWars globals,
// TW-owned DOM/HTML and endpoints (DESIGN-package-planner.md §3). When TW changes
// something, this is the one file to fix.
//
// All untyped global access is funneled through this single cast, so the rest of the
// planner stays type-checked (checkJs) without a .d.ts file.
const w = /** @type {any} */ (window);

import { createQueue } from '../../shared/queue.js';
import { outcome } from '../core/send.js';

/** Register with TW's ScriptAPI (guarded no-op if unavailable). */
export function register(name, version, author, email) {
  if (w.ScriptAPI && typeof w.ScriptAPI.register === 'function') {
    w.ScriptAPI.register(name, version, author, email);
  }
}

/** Market/language code, e.g. "en" — the only language signal TW exposes. */
export const market = () => String(w.game_data?.market ?? 'en');

const gd = () => w.game_data || {};

/** Facts about the session the planner needs (and the debug summary may show). */
export function env() {
  const g = gd();
  const villages = parseInt(g.player?.villages, 10);
  return {
    world: String(g.world ?? ''),
    market: market(),
    device: String(g.device ?? ''),
    version: String(g.majorVersion ?? ''),
    // Both are set on a premium account (verified on enc1): prefer the feature flag.
    premium: g.features?.Premium ? g.features.Premium.active === true : w.premium === true,
    sitting: parseInt(g.player?.sitter, 10) > 0,
    villages: Number.isFinite(villages) ? villages : null,
  };
}

// Every request goes through ONE throttled queue: starts >= 200 ms apart (<= 5/s).
const queue = createQueue({ concurrency: 2, maxAttempts: 2, minIntervalMs: 200 });

/** GET a same-origin URL as text, through the throttled queue. @param {string} url */
export function fetchText(url) {
  return queue.add(() =>
    fetch(url, { credentials: 'same-origin' }).then((res) => {
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      return res.text();
    }),
  );
}

/**
 * POST one market action through TW's own request helper (adds the csrf token, `&t=` when
 * sitting, and shows the game's error/captcha). Resolves once with how it ended; never
 * rejects, so the queue never retries. TW calls no callback on HTTP 429/503: a watchdog
 * turns "no answer" into a failure.
 * @param {'call' | 'map_send'} action
 * @param {number} village  target for 'call', source for 'map_send'
 * @param {Record<string, number>} data
 * @returns {Promise<import('../core/send.js').Outcome>}
 */
export function postMarket(action, village, data, timeoutMs = 10000) {
  return queue.add(() => new Promise((resolve) => {
    let timer = 0;
    const end = (/** @type {Parameters<typeof outcome>} */ ...r) => { clearTimeout(timer); resolve(outcome(...r)); };
    if (!w.TribalWars || typeof w.TribalWars.post !== 'function') return end('unavailable');
    timer = setTimeout(() => end('timeout'), timeoutMs);
    w.TribalWars.post('market', { ajaxaction: action, village }, data,
      (/** @type {unknown} */ r) => end('success', r), (/** @type {unknown} */ e) => end('error', e));
  }));
}

/**
 * URL of a premium village overview, group "all". TW's own buildURL adds `&t=<id>` when
 * sitting; the fallback does the same.
 * @param {'prod' | 'buildings' | 'trader'} mode  trader = incoming transports (type=inc)
 * @param {number} page  -1 = all on one page
 */
export function overviewUrl(mode, page) {
  const params = { mode, ...(mode === 'trader' ? { type: 'inc' } : {}), group: 0, page };
  if (w.TribalWars && typeof w.TribalWars.buildURL === 'function') {
    return String(w.TribalWars.buildURL('GET', 'overview_villages', params));
  }
  const g = gd();
  const base = String(g.link_base_pure ?? '/game.php?screen=');
  const t = parseInt(g.player?.sitter, 10) > 0 ? `&t=${g.player.id}` : '';
  return `${base}overview_villages&${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')}${t}`;
}

/** Link to Academy › Store (the mass-store sub-tab). */
export const academyStoreUrl = () => `${String(gd().link_base_pure ?? '/game.php?screen=')}snob&mode=reserve`;

const CONFIG_TTL_MS = 24 * 3600 * 1000;

/**
 * The public world config XML, cached per world for a day (only after it parsed fine,
 * see `cacheWorldConfig`).
 * @returns {Promise<string>}
 */
export async function worldConfigXml() {
  try {
    const cached = JSON.parse(localStorage.getItem(`${gd().world}pp_config`) || 'null');
    if (cached && Date.now() - cached.at < CONFIG_TTL_MS && typeof cached.xml === 'string') return cached.xml;
  } catch {
    /* no cache */
  }
  return fetchText('/interface.php?func=get_config');
}

/** @param {string} xml */
export function cacheWorldConfig(xml) {
  try {
    localStorage.setItem(`${gd().world}pp_config`, JSON.stringify({ at: Date.now(), xml }));
  } catch {
    /* storage full/blocked: just refetch next time */
  }
}

/**
 * Show `host` in TW's native dialog. Dialog.show only accepts a string, a jQuery object
 * or a 1-arg function (Dialog.isContentValid), so wrap the node in $(…). Call ONCE;
 * later renders replace host's children (re-showing closes and fades in again).
 * @param {string} id
 * @param {HTMLElement} host
 * @param {() => void} onClose
 */
export function showDialog(id, host, onClose) {
  if (w.Dialog && typeof w.Dialog.show === 'function' && w.jQuery) {
    w.Dialog.show(id, w.jQuery(host), onClose);
    return;
  }
  // Outside the game (or TW changed): a plain overlay so the result is still visible.
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText = 'background:#f4e4bc;border:2px solid #7d5a29;padding:12px;max-height:90vh;overflow:auto';
  box.appendChild(host);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onClose();
    }
  });
  document.body.appendChild(overlay);
}

/** True on TW's mobile site. */
export const isMobile = () => gd().device ? gd().device !== 'desktop' : !!document.getElementById('mobileHeader');

/** Short in-game toast, if TW's UI helper exists. @param {string} msg */
export function toast(msg) {
  if (w.UI && typeof w.UI.SuccessMessage === 'function') w.UI.SuccessMessage(msg, 1500);
}
