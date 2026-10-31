// Headless smoke test of sending (#6): runs the BUILT dist/package-planner.js in Chrome
// with stubbed TW globals (TribalWars.post records calls and never touches a server) on
// overview fixtures with several targets, then clicks through the popup.
//   npm run build && node test/package-planner/send.smoke.mjs
// Checks: lock ~200 ms, sent card moves to the bottom (list keeps its length), focus moves
// to the next button (holding Enter = repeated clicks on the focused button), one request
// per click, the failure path and the fallback. #19: a game error fails only its card (its
// own village-by-village rows, the other cards keep sending); bot protection, an HTTP error
// or no answer stop everything; one-at-a-time = no request while another is pending.
// mobile-sitter: TW mobile + sitting, 360 px wide window, TW-like Dialog stub: no horizontal
// scroll, send buttons on screen and tap-sized, no auto-focus, `&t=` on every own GET.
// Review fixes: TribalWars.post throwing is never re-sent; an open settings input survives re-renders;
// a cached config keeps its time; a failed start retries on Calculate; two runs share 5/s.
// #16 (stubbed game with real per-source stock): precheck = after a successful answer the
// next card whose source the game reports short is trimmed/marked before its send;
// failure-record = a failed send leaves the request, answer and per-source numbers in
// "Copy debug info", also after Recalculate; fallback-precheck = the fallback list after a
// failure leaves out a source the game reports short.
// Review fixes 3: game-error-twice = after a game error focus stays put, a second one in a
// row stops everything; recalc-pending = Recalculate waits for the pending answer and a
// captcha still stops the next plan; fallback-recheck = open rows are rebuilt after every
// answer, no row while a request is pending; map-send-left = a map_send answer without
// numbers subtracts what was sent, and a failed card sent row by row counts as sent.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clusterFixtures } from './fixtures/clusters.js';
import { academyPage } from './fixtures/academy.js';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const bundle = readFileSync(new URL('../../dist/package-planner.js', import.meta.url), 'utf8');
const fx = { ...clusterFixtures(4), academy: academyPage(2, 3) };

// ---- runs in the page -----------------------------------------------------------------
function stubs(fx, scenario) {
  window.__posts = [];
  window.__gets = [];
  const mobile = scenario.name === 'mobile-sitter';
  localStorage.clear();
  if (scenario.nobles) localStorage.setItem('en1pp_settings', JSON.stringify({ version: 1, nobles: scenario.nobles }));
  if (scenario.settings) localStorage.setItem('en1pp_settings', JSON.stringify({ version: 1, ...scenario.settings }));
  window.game_data = { world: 'en1', market: 'en', device: mobile ? 'mobile' : 'desktop', majorVersion: '9', link_base_pure: '/game.php?village=101&screen=',
    player: { id: 1, sitter: mobile ? '7' : '0' }, features: { Premium: { active: true } } };
  window.UI = { SuccessMessage() {}, ErrorMessage() {} };
  if (scenario.name === 'groups') {
    localStorage.setItem('en1pp_settings', JSON.stringify({ version: 1, senderGroup: 5, receiverGroup: 6 }));
    fx.prod = `<div class="vis_item">Groups: <strong class="group-menu-item" data-group-id="0">&gt;all&lt;</strong>
      <a class="group-menu-item" data-group-id="5" href="#">[Senders]</a> <a class="group-menu-item" data-group-id="6" href="#">[Academies]</a></div>${fx.prod}`;
  }
  if (mobile) {
    // Long names must wrap, not widen the popup.
    fx.prod = fx.prod.replaceAll('data-text="Village ', 'data-text="Averyveryverylongvillagenamewithoutanyspaces');
    // Like TW's Dialog: .popup_box gets `mobile` below 500 px; content goes in .popup_box_content.
    window.jQuery = (n) => n;
    window.Dialog = { show(id, el) {
      const box = document.createElement('div');
      box.className = `popup_box${innerWidth < 500 ? ' mobile' : ''}`;
      box.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:8px;background:#f4e4bc';
      const content = document.createElement('div');
      content.className = 'popup_box_content';
      content.appendChild(el);
      box.appendChild(content);
      document.body.appendChild(box);
    } };
  }
  if (scenario.name === 'config-cache') {
    window.__cachedAt = Date.now() - 23 * 3600 * 1000; // cached 23 h ago: still valid, must not be renewed
    localStorage.setItem('en1pp_config', JSON.stringify({ at: window.__cachedAt, xml: fx.config }));
  }
  window.__getTimes = [];
  let configFails = scenario.configFails || 0;
  window.fetch = async (url) => {
    window.__gets.push(String(url));
    window.__getTimes.push(performance.now());
    if (url.includes('get_config') && configFails > 0) {
      configFails -= 1;
      return { ok: false, status: 500, text: async () => '' };
    }
    const text = url.includes('get_config') ? fx.config : url.includes('mode=prod') ? fx.prod : url.includes('mode=buildings') ? fx.buildings : url.includes('screen=snob') ? fx.academy : '';
    return { ok: true, status: 200, text: async () => text };
  };
  window.__clip = null;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s) => { window.__clip = s; } } });
  // `stock`: like the game, a source's REAL stock (may be below the overview snapshot):
  // `call` fails with the game's message when a source has less, else it answers with
  // transport_info (resources_left + traders_free) for every source of the request.
  const stock = new Map(Object.entries(scenario.stock || {}).map(([id, s]) => [Number(id), { res: [9e5, 9e5, 9e5], merchants: 46, ...s }]));
  const real = (id) => { if (!stock.has(id)) stock.set(id, { res: [9e5, 9e5, 9e5], merchants: 46 }); return stock.get(id); };
  function game(params, data) {
    if (params.ajaxaction === 'map_send') {
      // Fallback: one transport from the posted source; answers without numbers (shape unverified).
      const s = real(+params.village);
      const r = [data.wood, data.stone, data.iron];
      const loads = Math.ceil((r[0] + r[1] + r[2]) / 1000);
      if (r.some((n, i) => n > s.res[i]) || loads > s.merchants) return null;
      s.res = s.res.map((n, i) => n - r[i]);
      s.merchants -= loads;
      return { message: 'Resources sent' };
    }
    if ((scenario.refuse || []).includes(String(params.village))) return null; // the game refuses this card's request
    const req = new Map();
    for (const [k, v] of Object.entries(data)) {
      const m = /^resource\[(\d+)\]\[(\w+)\]$/.exec(k);
      if (!m) continue;
      const r = req.get(+m[1]) || [0, 0, 0];
      r[['wood', 'stone', 'iron'].indexOf(m[2])] = v;
      req.set(+m[1], r);
    }
    const loads = (r) => Math.ceil((r[0] + r[1] + r[2]) / 1000);
    if ([...req].some(([id, r]) => r.some((n, i) => n > real(id).res[i]) || loads(r) > real(id).merchants)) return null;
    return { success: 'The resources were shipped', transport_info: [...req].map(([id, r]) => {
      const s = real(id);
      s.res = s.res.map((n, i) => n - r[i]);
      s.merchants -= loads(r);
      return { village_id: id, resources_left: { wood: s.res[0], stone: s.res[1], iron: s.res[2] }, needed_trader_capacity: loads(r) * 1000, traders_total: '46', traders_free: s.merchants };
    }) };
  }
  window.TribalWars = {
    post(screen, params, data, onSuccess, onError) {
      const n = window.__posts.push({ screen, params, data });
      if (scenario.stock) {
        const answer = game(params, data);
        setTimeout(() => (answer ? onSuccess(answer) : onError('Not enough resources available')), scenario.slowAt === n ? 1000 : 50);
        return;
      }
      if (scenario.throwAt === n) throw new Error('TribalWars.post broke'); // TW changed: throws before sending
      const slow = scenario.slowAt === n;
      const fail = [].concat(scenario.failAt).includes(n) || (slow && scenario.slowKind === 'game');
      if (fail && scenario.kind === 'noAnswer') return; // like HTTP 429/503: no callback at all
      setTimeout(() => {
        if (!fail) onSuccess({ success: 'Resources requested' });
        else if (scenario.kind === 'captcha') onError();
        else if (scenario.kind === 'http') onError({ status: 500 });
        else onError('Not enough merchants');
      }, slow ? 1000 : 50);
    },
  };
}

async function driver(scenario) {
  const out = { checks: [], posts: null };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out waiting'); await sleep(20); } };
  const $$ = (s) => [...document.querySelectorAll(s)];
  const ids = () => $$('.pp-card').map((c) => c.getAttribute('data-village'));
  const sendButtons = () => $$('.pp-card button.pp-send');
  try {
    await until(() => $$('.pp-calc button').length && !$$('.pp-calc button')[0].disabled);
    if (scenario.name === 'config-cache') {
      check('valid cached config used, not fetched', !window.__gets.some((u) => u.includes('get_config')), window.__gets);
      const at = JSON.parse(localStorage.getItem('en1pp_config') || '{}').at;
      check('cache time not renewed from a cache read (TTL still expires)', at === window.__cachedAt, { at, was: window.__cachedAt });
      throw 'done';
    }
    if (scenario.configFails) {
      await until(() => $$('.pp-error').length);
      check('config fetch failed: error shown with the Calculate button', $$('.pp-error').length === 1 && $$('.pp-calc button').length === 1);
      $$('.pp-calc button')[0].click();
      await until(() => $$('.pp-card').length);
      check('Calculate retries the start and plans', $$('.pp-card').length >= 3 && window.__gets.filter((u) => u.includes('get_config')).length === 3, window.__gets);
      throw 'done';
    }
    if (scenario.twice) {
      await until(() => $$('.pp-calc button').length === 2);
      $$('.pp-calc button').forEach((b) => b.click());
      await until(() => $$('.pp-cards').length === 2);
      const times = [...window.__getTimes].sort((a, b) => a - b);
      const gaps = times.slice(1).map((x, i) => x - times[i]);
      check('script run twice: still ≤ 5 requests/s (one queue for both runs)', gaps.length >= 6 && gaps.every((g) => g >= 190), gaps.map(Math.round));
      throw 'done';
    }
    $$('.pp-calc button')[0].click();
    await until(() => $$(scenario.nobles ? '.pp-summary' : '.pp-card').length);
    if (scenario.name === 'hold-enter') {
      const cached = JSON.parse(localStorage.getItem('en1pp_config') || 'null');
      check('fetched config cached', cached && typeof cached.xml === 'string' && Math.abs(Date.now() - cached.at) < 60000, cached && cached.at);
    }
    if (scenario.throwAt) {
      await sleep(300);
      sendButtons()[0].click();
      await sleep(1000); // the queue's retry would come >= 200 ms later
      check('TribalWars.post throwing: tried once, never re-sent', window.__posts.length === 1, window.__posts.length);
      const err = $$('.pp-error').map((e) => e.textContent).join(' ');
      check('TribalWars.post throwing: failure shown, nothing more to send', err.length > 0 && sendButtons().length === 0, err);
      throw 'done';
    }
    if (scenario.name === 'game-error-twice') {
      await sleep(300);
      sendButtons()[0].click(); // #1 ok
      await sleep(300);
      sendButtons()[0].click(); // #2: game error
      await sleep(300);
      check('after one game error the other cards stay usable', sendButtons().length > 0 && !$$('.pp-root > div > .pp-error').length, sendButtons().length);
      sendButtons()[0].click(); // #3, a deliberate click: game error again
      await sleep(300);
      const box = $$('.pp-error').map((e) => e.textContent).join(' ');
      check('two game errors in a row stop all sending, refresh and run again', sendButtons().length === 0 && $$('.pp-card:not(.pp-done)').length === 0
        && /twice in a row/.test(box) && /refresh the page and run the script again/.test(box), box);
      check('no fallback offered once stopped', $$('button.pp-fallback').length === 0);
      $$('.pp-card button').forEach((b) => b.click());
      check('nothing more posted', window.__posts.length === 3, window.__posts.length);
      throw 'done';
    }
    if (scenario.name === 'recalc-pending') {
      await sleep(300);
      sendButtons()[0].click(); // answered after 1 s with the captcha
      await sleep(300);
      const calc = () => $$('.pp-calc button')[0];
      check('Recalculate disabled while a request is pending', calc().disabled);
      calc().click();
      await sleep(900);
      check('the captcha stops all sending', sendButtons().length === 0 && /captcha/.test($$('.pp-error').map((e) => e.textContent).join(' ')));
      check('Recalculate enabled once the answer arrived', !calc().disabled);
      calc().click();
      await until(() => $$('.pp-card').length && !calc().disabled);
      await sleep(300);
      check('a new plan still does not send after the captcha', sendButtons().length === 0 && /captcha/.test($$('.pp-error').map((e) => e.textContent).join(' ')), sendButtons().length);
      check('one request in all', window.__posts.length === 1, window.__posts.length);
      throw 'done';
    }
    if (scenario.slowAt && !scenario.stock) {
      const before = ids();
      await sleep(300);
      sendButtons()[0].click(); // #1: answered after 1 s
      await sleep(300); // the ~200 ms lock is over, the answer is not
      check('buttons stay locked while a request is pending', sendButtons().length === before.length - 1 && sendButtons().every((b) => b.disabled), sendButtons().map((b) => b.disabled));
      sendButtons().forEach((b) => b.click());
      document.activeElement?.click?.(); // holding Enter
      check('no request posted while another is pending', window.__posts.length === 1, window.__posts.length);
      await sleep(900);
      check('next button unlocks once the answer arrived, and takes focus', sendButtons().every((b) => !b.disabled)
        && document.activeElement === sendButtons()[0] && sendButtons()[0].closest('.pp-card').getAttribute('data-village') === before[1]);
      document.activeElement.click();
      check('then one click is one request', window.__posts.length === 2 && String(window.__posts[1].params.village) === before[1], window.__posts.length);
      throw 'done';
    }
    if (scenario.name === 'settings-focus') {
      $$('.pp-link').find((a) => a.textContent === 'edit').click();
      const input = $$('.pp-settings input')[0];
      input.focus();
      input.value = '1:3'; // typing, not committed (no change event yet)
      await sleep(300);
      sendButtons()[0].click(); // re-renders the popup: on click, on the answer, after the lock
      await sleep(400);
      check('re-render keeps the settings input, its focus and the typed text', input.isConnected && document.activeElement === input && input.value === '1:3',
        { connected: input.isConnected, active: document.activeElement?.tagName, value: input.value });
      throw 'done';
    }
    if (scenario.nobles) {
      // Academy fixture: price 2, stored 3 -> 2 nobles = 2 + 3 = 5 packages, 2 still missing.
      const text = $$('.pp-summary')[0]?.textContent || '';
      check('noble target line in the summary', text.includes('2 nobles = 5 packages, 2 still missing'), text);
      check('plan capped at the missing packages', text.includes('2 packages storable') && text.includes('(5 stored in total)'), text);
      check('one academy page read', window.__gets.filter((u) => u.includes('screen=snob')).length === 1, window.__gets);
      throw 'done';
    }
    if (scenario.name === 'mobile-sitter') {
      const doc = document.documentElement;
      check('no horizontal scroll at 360 px', innerWidth <= 400 && doc.scrollWidth <= innerWidth 
        && $$('.pp-root, .pp-root *').every((e) => e.getBoundingClientRect().right <= innerWidth + 0.5 && e.scrollWidth <= e.clientWidth + 1),
        { innerWidth, scrollWidth: doc.scrollWidth, wide: $$('.pp-root, .pp-root *').filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className) });
      const rects = sendButtons().map((b) => b.getBoundingClientRect());
      check('send buttons on screen and tap-sized', rects.length >= 3 && rects.every((r) => r.left >= 0 && r.right <= innerWidth && r.height >= 36), rects.map((r) => [r.left, r.right, r.height]));
      check('no auto-focus on mobile (tap, no Enter-hold)', !document.activeElement?.classList.contains('pp-send'));
      await sleep(300);
      sendButtons()[0].click();
      check('a tap sends one request', window.__posts.length === 1, window.__posts.length);
      await sleep(250);
      check('&t=<player id> on every own GET while sitting', window.__gets.length >= 3 && window.__gets.every((u) => /[?&]t=1(&|$)/.test(u)), window.__gets);
      check('no academy page read without a noble target', !window.__gets.some((u) => u.includes('screen=snob')), window.__gets);
      const links = $$('a[href*="game.php"]').map((a) => a.getAttribute('href'));
      check('game links (Academy › Store) carry &t=', links.length >= 1 && links.every((u) => /[?&]t=1(&|$)/.test(u)), links);
      throw 'done';
    }
    if (scenario.name === 'groups') {
      const gets = window.__gets.filter((u) => u.includes('overview_villages'));
      const group = (u) => /[?&]group=(\d+)/.exec(u)?.[1];
      check('group members read first (sender, then receiver group)', group(gets[0]) === '5' && group(gets[1]) === '6' && gets[0].includes('mode=prod'), gets);
      check('every later overview read is group 0 (TW left on "all")', gets.length >= 5 && gets.slice(2).every((u) => group(u) === '0'), gets);
      check('cards with groups set', ids().length >= 3, ids());
      $$('.pp-link').find((a) => a.textContent === 'edit').click();
      const opts = $$('.pp-settings select').map((s) => [...s.options].map((o) => o.text).join('|') + '=' + s.value);
      check('group dropdowns: All + the groups from the overview, stored choice selected', opts.join() === 'All|Senders|Academies=5,All|Senders|Academies=6', opts);
      check('collapsed line names the groups', $$('.pp-chipline span')[0].textContent.endsWith('Senders → Academies'), $$('.pp-chipline span')[0].textContent);
      throw 'done';
    }
    if (scenario.stock) {
      // Plan of the 4-cluster fixture, card order 103 303 405 105 205 203 403; source 301
      // ships 13,000 iron into 303, 10,813 into 205 and 110 into 203; source 201 ships 5,813
      // into 105 and 19,000 into 203.
      const sendAll = async (n) => { for (let i = 0; i < n; i += 1) { await sleep(300); sendButtons()[0].click(); } await sleep(300); };
      const card = (id) => $$(`.pp-card[data-village="${id}"]`)[0];
      const payload = (to) => window.__posts.find((p) => String(p.params.village) === to)?.data;
      check('card order of the fixture plan', ids().join() === '103,303,405,105,205,203,403', ids());
      check('collapsed line says production is not counted', $$('.pp-chipline span')[0].textContent.endsWith(' · target production not counted'), $$('.pp-chipline span')[0].textContent);
      const rowOf = (key) => $$(`.pp-row[data-key="${key}"]`)[0];
      if (scenario.name === 'fallback-recheck') {
        await sendAll(4); // 103 303 405 ok; 105 refused by the game
        $$('.pp-card[data-village="105"] button.pp-fallback')[0].click();
        await sleep(50);
        check('rows of 105 built (201 not reported yet: as planned)', /5\.813/.test(rowOf('201-105')?.textContent || ''), rowOf('201-105')?.textContent);
        sendButtons()[0].click(); // 205: answered after 1 s
        await sleep(300);
        rowOf('201-105').querySelector('button').click();
        check('no row is sent while a card request is pending', window.__posts.length === 5, window.__posts.length);
        await sleep(900);
        sendButtons()[0].click(); // 203: the game now reports 201 has 4,813 iron left
        await sleep(300);
        check('open fallback rows rechecked after a later answer: short source trimmed', /4 merchants/.test(rowOf('201-105')?.textContent || ''), rowOf('201-105')?.textContent);
        rowOf('201-105').querySelector('button').click();
        await sleep(300);
        const q = window.__posts[6];
        check('trimmed row sends what the game reports', q?.params.ajaxaction === 'map_send' && String(q.params.village) === '201' && q.data.iron === 4000, q);
        throw 'done';
      }
      if (scenario.name === 'map-send-left') {
        await sendAll(5); // 103 303 405 105 ok (301: 10,863 iron left); 205 refused by the game
        $$('.pp-card[data-village="205"] button.pp-fallback')[0].click();
        await sleep(50);
        for (const key of ['301-205', '204-205']) { rowOf(key).querySelector('button').click(); await sleep(300); }
        check('both rows sent via map_send', window.__posts.slice(5).every((p) => p.params.ajaxaction === 'map_send') && window.__posts.length === 7
          && $$('.pp-row').every((r) => r.textContent.includes('✓ Sent')), window.__posts.length);
        check('a map_send answer without numbers: the source\'s sent amounts are subtracted, the next card using it is reduced',
          /reduced/i.test(card('203').textContent), card('203').textContent);
        await sendAll(2); // 203, 403
        check('the reduced card leaves out the source that has nothing left', !('resource[301][iron]' in (payload('203') || {})) && card('203').textContent.includes('✓ Sent'), payload('203'));
        const line = $$('.pp-summary span').map((e) => e.textContent).find((x) => / of \d+ sent/.test(x)) || '';
        check('a failed card fully sent village by village counts as sent', /7 of 7 sent/.test(line), line);
        throw 'done';
      }
      if (scenario.name === 'fallback-precheck') {
        await sendAll(6); // 103 303 405 105 205 ok (201: 500 iron left); 203 fails: 202 has 500 iron
        $$('.pp-card[data-village="203"] button.pp-fallback')[0].click();
        await sleep(50);
        const into = (id) => $$(`.pp-row[data-to="${id}"]`).length;
        check('fallback: the failed target only, source the game reports short left out', into(203) === 2 && $$('.pp-row').length === 2, { 203: into(203), all: $$('.pp-row').length });
        check('the card after the failed one still has its Request button', !!card('403').querySelector('button.pp-send'), card('403').textContent);
        throw 'done';
      }
      if (scenario.name === 'precheck') {
        await sendAll(3); // 103, 303, 405: the game now reports 301 has 5,300 iron left
        const reduced = $$('.pp-card').filter((c) => /reduced/i.test(c.textContent)).map((c) => c.getAttribute('data-village'));
        check('before the next send, the card whose source the game reports short says so', reduced.join() === '205', reduced);
        check('reduced card names the packages that may be short', /1 package may be short/.test(card('205').textContent), card('205').textContent);
        await sendAll(2); // 105, 205: 201 now has 500 iron left, 301 has 300
        check('next short card marked before its send', /reduced/i.test(card('203').textContent) && !/reduced/i.test(card('403').textContent), [card('203').textContent, card('403').textContent]);
        await sendAll(2); // 203, 403
        check('one request per click, no failure', window.__posts.length === 7 && !$$('.pp-error').length, { posts: window.__posts.length, err: $$('.pp-error').map((e) => e.textContent) });
        const p205 = payload('205');
        check('short source trimmed to what it has, whole merchant loads', p205['resource[301][iron]'] === 5000 && p205['resource[204][wood]'] === 3894, p205);
        check('source with what is planned is not trimmed (110 iron of 300 left)', payload('203')['resource[301][iron]'] === 110, payload('203'));
        const p203 = payload('203');
        check('source left with less than one load drops out of the card', !('resource[201][iron]' in p203) && p203['resource[202][iron]'] === 1000, p203);
        check('all cards sent', $$('.pp-card').every((c) => c.textContent.includes('✓ Sent')), ids());
      } else {
        await sendAll(5); // 103, 303, 405, 105 ok; 205: source 204 really has 1,000 wood (overview: 30,879)
        const err = $$('.pp-error').map((e) => e.textContent).join(' ');
        check('the game\'s failure is shown', err.includes('Not enough resources available'), err);
        $$('.pp-actions button').find((b) => b.textContent === 'Copy debug info').click();
        await sleep(100);
        const dbg = window.__clip || '';
        check('debug info: the failed request and the game\'s message', dbg.includes('failed send: call to village 205 (game): Not enough resources available'), dbg);
        check('debug info: raw answer', dbg.includes('raw: "Not enough resources available"'), dbg);
        check('debug info: source never reported: sent amounts + overview snapshot', dbg.includes('source 204: sent 3894/0/0 (4 merchants); overview 30879/60779/719 (14 merchants); game reported none'), dbg);
        check('debug info: source reported by an earlier answer', dbg.includes('source 301: sent 0/0/10813 (11 merchants); overview 33140/44720/50294 (46 merchants); game reported 900000/900000/887000 (33 merchants)'), dbg);
        check('debug info: no village names or coordinates', !/Village|\d{3}\|\d{3}/.test(dbg), dbg);
        check('failed card marked, with the game\'s message', /✗ Failed/.test(card('205').textContent) && card('205').textContent.includes('Not enough resources available'), card('205').textContent);
        await sendAll(2); // #19: the cards after the failed one still send
        const posted = window.__posts.map((p) => String(p.params.village));
        check('cards after the failed one still send', posted.join() === '103,303,405,105,205,203,403'
          && ['203', '403'].every((id) => card(id).textContent.includes('✓ Sent')), posted);
        $$('.pp-calc button')[0].click(); // a new plan: the record stays until the popup closes
        await until(() => $$('.pp-card').length && !$$('.pp-calc button')[0].disabled);
        $$('.pp-actions button').find((b) => b.textContent === 'Copy debug info').click();
        await sleep(100);
        check('debug info keeps the failure after Recalculate', (window.__clip || '').includes('failed send: call to village 205'));
      }
      throw 'done';
    }
    const before = ids();
    check('several cards', before.length >= 3, before);
    check('focus on the first send button after Calculate', document.activeElement === sendButtons()[0]);
    await sleep(300); // the request queue spaces requests >= 200 ms after the overview reads

    sendButtons()[0].click();
    sendButtons()[0]?.click(); // second click inside the lock
    const after = ids();
    check('one request per click, none during the lock', window.__posts.length === 1, window.__posts.length);
    const p = window.__posts[0];
    const keys = Object.keys(p.data);
    check('Request resources into the clicked target', p.screen === 'market' && p.params.ajaxaction === 'call' && String(p.params.village) === before[0], p.params);
    check('payload: target_id 0 + resource[src][wood|stone|iron]', p.data.target_id === 0 && keys.length > 1 && keys.slice(1).every((k) => /^resource\[\d+\]\[(wood|stone|iron)\]$/.test(k)), p.data);
    check('list keeps its length', after.length === before.length, after);
    check('sent card moved to the bottom', after[after.length - 1] === before[0] && after[0] === before[1], after);
    const last = $$('.pp-card').pop();
    check('clicked card greyed, sending (not yet answered)', last.classList.contains('pp-done') && last.textContent.includes('Sending'), last.textContent);
    check('all send buttons locked', sendButtons().every((b) => b.disabled));
    await sleep(250);
    const answered = $$('.pp-card').pop();
    check('answered card shows ✓ Sent', answered.textContent.includes('✓ Sent'), answered.textContent);
    check('unlocked after ~200 ms', sendButtons().every((b) => !b.disabled));
    check('focus moved to the next card', document.activeElement === sendButtons()[0] && document.activeElement.closest('.pp-card').getAttribute('data-village') === before[1]);

    if (scenario.name === 'hold-enter') {
      // Key repeat on the focused button ~30/s for 1 s.
      for (let t = 0; t < 1000; t += 33) { document.activeElement?.click?.(); await sleep(33); }
      await sleep(300);
      const posts = window.__posts.map((x) => String(x.params.village));
      check('holding Enter walks down the list, ≤ 1 request per 200 ms', posts.length >= 4 && posts.length <= 7, posts);
      check('each target requested once, in list order', new Set(posts).size === posts.length && posts.every((v, i) => v === before[i]), { posts, before });
    }

    if (scenario.failAt) {
      sendButtons()[0].click(); // request #2 fails
      await sleep(scenario.kind === 'noAnswer' ? 10500 : 300);
      const n = window.__posts.length;
      const err = $$('.pp-error').map((e) => e.textContent).join(' ');
      check(`failure shown (${scenario.kind})`, scenario.kind === 'game' ? err.includes('Not enough merchants') : err.length > 0, err);
      if (scenario.kind === 'game') {
        // #19: only the failed card stops; it offers its own village-by-village rows.
        const failed = $$(`.pp-card[data-village="${before[1]}"]`)[0];
        check('failed card shows ✗ Failed and the game\'s message', failed.textContent.includes('✗ Failed') && failed.textContent.includes('Not enough merchants'), failed.textContent);
        check('other cards stay usable', sendButtons().length === before.length - 2 && sendButtons().every((b) => !b.disabled), sendButtons().length);
        check('focus does not move on after a game error (the next send is a deliberate click)', !document.activeElement?.classList.contains('pp-send'), document.activeElement?.outerHTML);
        document.activeElement?.click?.(); // still holding Enter: nothing is sent
        check('holding Enter sends nothing after a game error', window.__posts.length === n, window.__posts.length);
        sendButtons()[0].click();
        await sleep(300);
        check('the next card still sends', window.__posts.length === n + 1 && String(window.__posts[n].params.village) === before[2]
          && $$(`.pp-card[data-village="${before[2]}"]`)[0].textContent.includes('✓ Sent'), window.__posts.map((p) => p.params.village));
        const fb = $$('button.pp-fallback');
        check('fallback offered on the failed card only', fb.length === 1 && fb[0].closest('.pp-card').getAttribute('data-village') === before[1], fb.length);
        fb[0].click();
        await until(() => $$('.pp-row').length);
        const tos = new Set($$('.pp-row').map((r) => r.getAttribute('data-to')));
        check('fallback rows: only the failed target', tos.size === 1 && tos.has(before[1]), [...tos]);
        $$('.pp-row button.pp-send')[0].click();
        const q = window.__posts[n + 1];
        check('fallback: one transport per click via map_send from the source', window.__posts.length === n + 2 && q.params.ajaxaction === 'map_send'
          && Number.isFinite(+q.params.village) && Object.keys(q.data).join() === 'target_id,wood,stone,iron', q);
      } else {
        check('everything stops: remaining cards greyed out, buttons disabled', sendButtons().length === 0 && $$('.pp-card:not(.pp-done)').length === 0, ids());
        $$('.pp-card button').forEach((b) => b.click());
        check('no further requests after a failure', window.__posts.length === n && n === 2, n);
        check('no fallback offered', $$('button.pp-fallback').length === 0);
      }
    }
  } catch (e) {
    if (e !== 'done') check('no exception', false, String(e && e.stack || e));
  }
  out.posts = window.__posts.length;
  const pre = document.createElement('pre');
  pre.id = 'smoke-result';
  pre.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
  parent.document.body.appendChild(pre); // parent === window outside the iframe
}

// ---- runner -----------------------------------------------------------------------------
const scenarios = [
  { name: 'hold-enter' },
  { name: 'game-error', failAt: 2, kind: 'game' },
  { name: 'captcha', failAt: 2, kind: 'captcha' },
  { name: 'http-error', failAt: 2, kind: 'http' },
  { name: 'no-answer', failAt: 2, kind: 'noAnswer' },
  { name: 'mobile-sitter' },
  { name: 'groups' },
  { name: 'noble-target', nobles: 2 },
  { name: 'post-throws', throwAt: 1 },
  { name: 'one-at-a-time', slowAt: 1, slowKind: 'ok' },
  { name: 'settings-focus' },
  { name: 'config-cache' },
  { name: 'config-fails', configFails: 2 },
  { name: 'run-twice', twice: true },
  // #16: the real stock of 301 and 201 is below the overview (18,300 and 6,313 iron, not
  // 50,294 and 109,823). These stock scenarios are derived from one plan, so they plan
  // without the targets' production (#18): the send checks don't move with the solver.
  { name: 'precheck', settings: { countProduction: false }, stock: { 301: { res: [9e5, 9e5, 18300] }, 201: { res: [9e5, 9e5, 6313] } } },
  // Fallback after a failure: 201's 500 iron left (reported) drops its row into 203.
  { name: 'fallback-precheck', settings: { countProduction: false }, stock: { 201: { res: [9e5, 9e5, 6313] }, 202: { res: [9e5, 9e5, 500] } } },
  // #16: 204 really has 1,000 wood (overview 30,879): card 205 fails, evidence kept.
  // Review fixes #3 (popup): two game errors in a row stop everything; Recalculate waits
  // for the pending answer and a stop holds for the next plan too.
  { name: 'game-error-twice', failAt: [2, 3], kind: 'game' },
  { name: 'recalc-pending', slowAt: 1, slowKind: 'game', kind: 'captcha' },
  // Open fallback rows are rechecked on every answer; one request at a time holds for rows.
  { name: 'fallback-recheck', settings: { countProduction: false }, refuse: ['105'], slowAt: 5, stock: { 201: { res: [9e5, 9e5, 23813] } } },
  // map_send answers carry no numbers: the sent amounts come off the source's last known numbers.
  { name: 'map-send-left', settings: { countProduction: false }, refuse: ['205'], stock: { 301: { res: [9e5, 9e5, 23863] } } },
  { name: 'failure-record', settings: { countProduction: false }, stock: { 204: { res: [1000, 9e5, 9e5] } } },
];
const dir = mkdtempSync(join(tmpdir(), 'pp-smoke-'));
let failed = 0;
try {
  for (const s of scenarios) {
    const run = `<script>${bundle.replace(/<\/script/gi, '<\\/script')}</script>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>(${stubs})(${JSON.stringify(fx).replace(/</g, '\\u003c')}, ${JSON.stringify(s)});</script>
${s.twice ? run + run : run}
<script>(${driver})(${JSON.stringify(s)});</script></body></html>`;
    const file = join(dir, `${s.name}.html`);
    // Headless Chrome won't shrink its window below 500 px: run the narrow case in a 360 px iframe.
    const narrow = (/** @type {string} */ x) => `<!doctype html><body style="margin:0"><iframe style="width:360px;height:740px;border:0" srcdoc="${x.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></body>`;
    writeFileSync(file, s.name === 'mobile-sitter' ? narrow(html) : html);
    const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`,
      '--virtual-time-budget=30000', '--dump-dom', `file://${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
    const m = dom.match(/<pre id="smoke-result">([^<]*)<\/pre>/);
    if (!m) { console.log(`✗ ${s.name}: no result (driver did not finish)`); failed += 1; continue; }
    const out = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    for (const c of out.checks) {
      console.log(`${c.ok ? '✓' : '✗'} ${s.name}: ${c.name}${c.ok ? '' : `  ${JSON.stringify(c.detail)}`}`);
      if (!c.ok) failed += 1;
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
