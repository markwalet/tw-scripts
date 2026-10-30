// Headless smoke test of sending (#6): runs the BUILT dist/package-planner.js in Chrome
// with stubbed TW globals (TribalWars.post records calls and never touches a server) on
// overview fixtures with several targets, then clicks through the popup.
//   npm run build && node test/package-planner/send.smoke.mjs
// Checks: lock ~200 ms, sent card moves to the bottom (list keeps its length), focus moves
// to the next button (holding Enter = repeated clicks on the focused button), one request
// per click, the failure path (game error, bot protection, no answer) and the fallback.
// mobile-sitter: TW mobile + sitting, 360 px wide window, TW-like Dialog stub: no horizontal
// scroll, send buttons on screen and tap-sized, no auto-focus, `&t=` on every own GET.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clusterFixtures } from './fixtures/clusters.js';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const bundle = readFileSync(new URL('../../dist/package-planner.js', import.meta.url), 'utf8');
const fx = clusterFixtures(4);

// ---- runs in the page -----------------------------------------------------------------
function stubs(fx, scenario) {
  window.__posts = [];
  window.__gets = [];
  const mobile = scenario.name === 'mobile-sitter';
  window.game_data = { world: 'en1', market: 'en', device: mobile ? 'mobile' : 'desktop', majorVersion: '9', link_base_pure: '/game.php?village=101&screen=',
    player: { id: 1, sitter: mobile ? '7' : '0' }, features: { Premium: { active: true } } };
  window.UI = { SuccessMessage() {}, ErrorMessage() {} };
  localStorage.clear(); // scenarios share one Chrome profile
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
  window.fetch = async (url) => {
    window.__gets.push(String(url));
    const text = url.includes('get_config') ? fx.config : url.includes('mode=prod') ? fx.prod : url.includes('mode=buildings') ? fx.buildings : '';
    return { ok: true, status: 200, text: async () => text };
  };
  window.TribalWars = {
    post(screen, params, data, onSuccess, onError) {
      const n = window.__posts.push({ screen, params, data });
      const fail = scenario.failAt === n;
      if (fail && scenario.kind === 'noAnswer') return; // like HTTP 429/503: no callback at all
      setTimeout(() => {
        if (!fail) onSuccess({ success: 'Resources requested' });
        else if (scenario.kind === 'captcha') onError();
        else onError('Not enough merchants');
      }, 50);
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
    await until(() => $$('.pp-calc button').length);
    $$('.pp-calc button')[0].click();
    await until(() => $$('.pp-card').length);
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
    check('sent card greyed with ✓ Sent', last.classList.contains('pp-done') && last.textContent.includes('✓ Sent'), last.textContent);
    check('all send buttons locked', sendButtons().every((b) => b.disabled));
    await sleep(250);
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
      const err = $$('.pp-error').map((e) => e.textContent).join(' ');
      check(`failure shown (${scenario.kind})`, scenario.kind === 'game' ? err.includes('Not enough merchants') : err.length > 0, err);
      check('remaining cards greyed out, buttons disabled', sendButtons().length === 0 && $$('.pp-card:not(.pp-done)').length === 0, ids());
      const n = window.__posts.length;
      $$('.pp-card button').forEach((b) => b.click());
      check('no further requests after a failure', window.__posts.length === n && n === 2, n);
      const fb = $$('button.pp-fallback');
      check('fallback offered only for a game error', (scenario.kind === 'game') === (fb.length === 1), fb.length);
      if (fb.length) {
        fb[0].click();
        await until(() => sendButtons().length);
        sendButtons()[0].click();
        const q = window.__posts[n];
        check('fallback: one transport per click via map_send from the source', window.__posts.length === n + 1 && q.params.ajaxaction === 'map_send'
          && Number.isFinite(+q.params.village) && Object.keys(q.data).join() === 'target_id,wood,stone,iron', q);
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
  { name: 'no-answer', failAt: 2, kind: 'noAnswer' },
  { name: 'mobile-sitter' },
  { name: 'groups' },
];
const dir = mkdtempSync(join(tmpdir(), 'pp-smoke-'));
let failed = 0;
try {
  for (const s of scenarios) {
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>(${stubs})(${JSON.stringify(fx).replace(/</g, '\\u003c')}, ${JSON.stringify(s)});</script>
<script>${bundle.replace(/<\/script/gi, '<\\/script')}</script>
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
