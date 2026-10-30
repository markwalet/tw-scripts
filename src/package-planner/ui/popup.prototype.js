// PROTOTYPE — throwaway. Not part of any build. Delete once a variant is picked.
// Question: what should the Noble Package Planner popup look like?
// Three structurally different variants of the popup (DESIGN-package-planner.md §1/§6/§7),
// switchable via the floating bar at the bottom (or ← / → keys). Fake data, no network:
// "Send" only marks the row done. Paste the whole file into the console on any TW page.
(function () {
  'use strict';

  // ---------- fake data -------------------------------------------------------------
  const RES = ['wood', 'stone', 'iron'];
  const fmt = (n) => n.toLocaleString('de-DE');
  const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
  const vname = (i) => `${String(i).padStart(3, '0')} Village`;
  const coord = (i) => `${430 + ((i * 7) % 30)}|${510 + ((i * 11) % 25)}`;

  let seed = 7;
  const rnd = (a, b) => { seed = (seed * 9301 + 49297) % 233280; return a + Math.floor((seed / 233280) * (b - a)); };

  function makePlan() {
    seed = 7;
    const targets = [];
    for (let t = 0; t < 9; t++) {
      const packages = rnd(1, 5);
      const nSrc = rnd(1, 6);
      const sources = [];
      for (let s = 0; s < nSrc; s++) {
        const id = rnd(10, 180);
        const r = { wood: rnd(1, 30) * 1000, stone: rnd(1, 30) * 1000, iron: rnd(1, 26) * 1000 };
        const total = r.wood + r.stone + r.iron;
        sources.push({ id, name: vname(id), coord: coord(id), ...r, merchants: Math.ceil(total / 1000), minutes: rnd(6, 170) });
      }
      const id = rnd(10, 180);
      const sum = (k) => sources.reduce((a, s) => a + s[k], 0);
      targets.push({
        id, name: vname(id), coord: coord(id), packages,
        wood: sum('wood'), stone: sum('stone'), iron: sum('iron'), merchants: sum('merchants'),
        longest: Math.max(...sources.map((s) => s.minutes)), sources,
        whPct: rnd(55, 97), done: false,
      });
    }
    targets.sort((a, b) => a.longest - b.longest);
    return targets;
  }

  const state = {
    variant: 1,
    calculated: false,
    settings: { maxTime: '3:00', resWood: 0, resStone: 0, resIron: 0, keepMerchants: 0, senderGroup: 'All', receiverGroup: 'All', nobles: '', buffer: 2 },
    plan: [],
    stored: 15,
    expanded: new Set(),
    settingsOpen: false,
  };

  const totals = () => {
    const p = state.plan;
    return {
      packages: p.reduce((a, t) => a + t.packages, 0),
      merchants: p.reduce((a, t) => a + t.merchants, 0),
      longest: p.length ? Math.max(...p.map((t) => t.longest)) : 0,
      done: p.filter((t) => t.done).length,
    };
  };

  // ---------- tiny element builder ------------------------------------------------------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  const icon = (res) => h('span', { class: `icon header ${res}` });
  const resCells = (o) => RES.map((r) => h('td', { class: 'pp-num' }, icon(r), ' ', fmt(o[r])));

  // ---------- styles (native TW look) ---------------------------------------------------
  const CSS = `
  .pp-root{font:12px/1.4 Verdana,Arial,sans-serif;color:#000;width:min(780px,calc(100vw - 40px));box-sizing:border-box}
  .pp-root *{box-sizing:border-box}
  .pp-root.pp-narrow{width:min(560px,calc(100vw - 40px))}
  .pp-root h3{margin:0 0 6px;font-size:14px}
  .pp-root .pp-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .pp-root .pp-muted{color:#7d5a29;font-size:11px}
  .pp-root table.vis{width:100%}
  .pp-root input[type=text],.pp-root input[type=number],.pp-root select{width:70px;font-size:12px}
  .pp-root select{width:auto}
  .pp-root .pp-summary{background:#fff5da;border:1px solid #c1a264;padding:6px 8px;margin:8px 0;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}
  .pp-root .pp-summary b{font-size:13px}
  .pp-root tr.pp-done td{opacity:.45;text-decoration:line-through}
  .pp-root tr.pp-src td{background:#f8ecc8;font-size:11px}
  .pp-root .pp-link{cursor:pointer;color:#603000;font-weight:bold}
  .pp-root .pp-actions{display:flex;gap:6px;align-items:center;margin:8px 0}
  /* B: cards */
  .pp-root .pp-chipline{background:#fff5da;border:1px solid #c1a264;padding:5px 8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
  .pp-root .pp-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
  .pp-root .pp-tile{background:#f4e4bc;border:1px solid #c1a264;padding:6px;text-align:center}
  .pp-root .pp-tile b{display:block;font-size:18px}
  .pp-root .pp-cards{display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto}
  .pp-root .pp-card{background:#f4e4bc;border:1px solid #c1a264;padding:6px 8px;display:grid;grid-template-columns:1fr auto;gap:4px 10px}
  .pp-root .pp-card.pp-done{opacity:.45}
  .pp-root .pp-badge{background:#5c8a3a;color:#fff;font-weight:bold;padding:1px 6px;border-radius:8px;font-size:11px}
  .pp-root .pp-meter{height:7px;background:#d6c08a;border:1px solid #a58b5c;grid-column:1/-1}
  .pp-root .pp-meter i{display:block;height:100%;background:#5c8a3a}
  .pp-root .pp-srcline{grid-column:1/-1;font-size:11px;color:#4a3018;display:flex;flex-wrap:wrap;gap:2px 10px}
  /* C: split + send-next */
  .pp-root .pp-split{display:grid;grid-template-columns:220px 1fr;gap:10px}
  .pp-root .pp-side table.vis td{padding:3px 4px}
  .pp-root .pp-next{background:#fff5da;border:2px solid #7d5a29;padding:10px;text-align:center}
  .pp-root .pp-next .pp-big{font-size:16px;padding:10px 28px;margin-top:8px}
  .pp-root .pp-queue{max-height:38vh;overflow:auto;margin-top:8px}
  .pp-root .pp-queue td.pp-cur{font-weight:bold;background:#fff5da}
  @media (max-width:600px){
    .pp-root .pp-split{grid-template-columns:1fr}
    .pp-root .pp-tiles{grid-template-columns:repeat(2,1fr)}
    .pp-root .pp-hide-m{display:none}
  }
  #pp-switcher{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100000;
    background:#111;color:#fff;border-radius:999px;padding:6px 10px;display:flex;gap:10px;align-items:center;
    font:13px/1 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)}
  #pp-switcher button{background:#333;color:#fff;border:0;border-radius:999px;width:28px;height:28px;cursor:pointer;font-size:15px}
  #pp-switcher .pp-tag{background:#e63;border-radius:4px;padding:2px 5px;font-size:10px;font-weight:700}
  #pp-fallback{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center}
  #pp-fallback>div{background:#f4e4bc;border:2px solid #7d5a29;padding:12px;max-height:90vh;overflow:auto}
  `;
  document.getElementById('pp-proto-style')?.remove();
  document.head.append(h('style', { id: 'pp-proto-style' }, CSS));

  // ---------- shared behaviour ----------------------------------------------------------
  let locked = false;
  let rerendering = false;
  function send(t, root) {
    if (locked || t.done) return;
    locked = true;
    t.done = true;
    if (window.UI?.SuccessMessage) UI.SuccessMessage(`(prototype) Requested resources for ${t.name}`, 800);
    // Remove the row right away so the next row's button lands under the cursor; only the
    // ~200 ms click lock (approved-scripts pattern) stays.
    render();
    const buttons = () => document.querySelectorAll('.pp-root button.pp-send');
    buttons().forEach((b) => (b.disabled = true));
    setTimeout(() => {
      locked = false;
      buttons().forEach((b) => (b.disabled = false));
      buttons()[0]?.focus();
    }, 200);
  }

  function calculate() {
    state.plan = makePlan();
    state.calculated = true;
    state.expanded.clear();
    render();
    document.querySelector('.pp-root button.pp-send')?.focus();
  }

  const setVal = (k) => (e) => { state.settings[k] = e.target.value; };
  const input = (k, w) => h('input', { type: 'text', value: state.settings[k], style: w ? `width:${w}px` : '', oninput: setVal(k) });
  const group = (k) => h('select', { onchange: setVal(k) }, ['All', 'Academies', 'Offense', 'Defense'].map((g) => h('option', { selected: state.settings[k] === g }, g)));

  function settingsRows() {
    const s = state.settings;
    return [
      ['Max travel time (h:mm)', input('maxTime', 60), 'empty = no limit'],
      ['Reserve per resource', h('span', {}, icon('wood'), input('resWood', 55), ' ', icon('stone'), input('resStone', 55), ' ', icon('iron'), input('resIron', 55)), ''],
      ['Merchants to keep home', input('keepMerchants', 50), ''],
      ['Senders', group('senderGroup'), 'group'],
      ['Receivers', group('receiverGroup'), 'group (academy villages only)'],
      ['Collect for X new nobles', input('nobles', 50), 'empty = as many as possible'],
      ['Warehouse buffer (%)', input('buffer', 40), 'on top of production during travel'],
    ];
  }

  function nobleLine() {
    const x = parseInt(state.settings.nobles, 10);
    if (!x) return null;
    const need = Array.from({ length: x }, (_, i) => 72 + i).reduce((a, b) => a + b, 0) - state.stored;
    const got = totals().packages;
    return h('span', {}, `${x} nobles = ${need} packages · ${Math.max(0, need - got)} still missing`);
  }

  function storeLink() {
    return h('a', { class: 'pp-link', href: (window.game_data?.link_base_pure || '/game.php?') + 'snob&mode=reserve', target: '_blank' }, 'Academy › Store');
  }

  // ---------- Variant A: classic form → table ------------------------------------------
  function VariantA(root) {
    const t = totals();
    root.append(
      h('h3', {}, 'Noble Package Planner'),
      h('table', { class: 'vis' },
        h('tr', {}, h('th', { colspan: 3 }, 'Settings')),
        settingsRows().map(([l, c, hint]) => h('tr', {}, h('td', {}, l), h('td', {}, c), h('td', { class: 'pp-muted pp-hide-m' }, hint))),
      ),
      h('div', { class: 'pp-actions' }, h('button', { class: 'btn', onclick: calculate }, state.calculated ? 'Recalculate' : 'Calculate')),
    );
    if (!state.calculated) return;
    root.append(
      h('div', { class: 'pp-summary' },
        h('b', {}, `+${t.packages} packages`), h('span', {}, `${t.merchants} merchants`), h('span', {}, `longest trip ${hm(t.longest)}`),
        h('span', {}, `After arrival: ${state.stored + t.packages} packages ready to store → `, storeLink()),
        nobleLine(),
      ),
      h('table', { class: 'vis' },
        h('tr', {}, h('th', {}, 'Target'), h('th', {}, 'Pkgs'), h('th', { class: 'pp-hide-m' }, 'Wood'), h('th', { class: 'pp-hide-m' }, 'Clay'), h('th', { class: 'pp-hide-m' }, 'Iron'),
          h('th', {}, 'Merch.'), h('th', {}, 'Sources'), h('th', {}, 'Longest'), h('th', {}, '')),
        state.plan.flatMap((tg) => {
          const open = state.expanded.has(tg.id);
          const rows = [h('tr', { class: tg.done ? 'pp-done' : '' },
            h('td', {}, h('a', { class: 'pp-link' }, `${tg.name} (${tg.coord})`)),
            h('td', { class: 'pp-num' }, `+${tg.packages}`),
            ...resCells(tg).map((c) => (c.classList.add('pp-hide-m'), c)),
            h('td', { class: 'pp-num' }, tg.merchants),
            h('td', {}, h('a', { class: 'pp-link', onclick: () => { open ? state.expanded.delete(tg.id) : state.expanded.add(tg.id); render(); } }, `${tg.sources.length} ${open ? '▴' : '▾'}`)),
            h('td', { class: 'pp-num' }, hm(tg.longest)),
            h('td', {}, h('button', { class: 'btn pp-send', disabled: tg.done, onclick: () => send(tg, root) }, tg.done ? '✓' : 'Request')),
          )];
          if (open) for (const s of tg.sources) rows.push(h('tr', { class: 'pp-src' },
            h('td', {}, `  ← ${s.name} (${s.coord})`), h('td', {}), ...resCells(s).map((c) => (c.classList.add('pp-hide-m'), c)),
            h('td', { class: 'pp-num' }, s.merchants), h('td', {}), h('td', { class: 'pp-num' }, hm(s.minutes)), h('td', {})));
          return rows;
        }),
      ),
      h('p', { class: 'pp-muted' }, `${t.done}/${state.plan.length} sent · hold Enter to go down the list`),
    );
  }

  // ---------- Variant B: collapsed settings + tiles + cards ----------------------------
  function VariantB(root) {
    const s = state.settings;
    const t = totals();
    const chip = `Max ${s.maxTime || '∞'} · reserve ${s.resWood}/${s.resStone}/${s.resIron} · keep ${s.keepMerchants} merchants · ${s.senderGroup} → ${s.receiverGroup}` + (s.nobles ? ` · ${s.nobles} nobles` : '');
    root.append(
      h('h3', {}, 'Noble Package Planner'),
      h('div', { class: 'pp-chipline' }, h('span', {}, '⚙ ', chip),
        h('a', { class: 'pp-link', onclick: () => { state.settingsOpen = !state.settingsOpen; render(); } }, state.settingsOpen ? 'close' : 'edit')),
      state.settingsOpen ? h('table', { class: 'vis', style: 'margin-top:4px' }, settingsRows().map(([l, c]) => h('tr', {}, h('td', {}, l), h('td', {}, c)))) : '',
      h('div', { class: 'pp-actions' }, h('button', { class: 'btn btn-confirm-yes', style: 'flex:1;padding:6px', onclick: () => { state.settingsOpen = false; calculate(); } }, state.calculated ? 'Recalculate' : 'Calculate plan')),
    );
    if (!state.calculated) return;
    // Sent cards move to the bottom (greyed) instead of disappearing: the list keeps its
    // height, so TW's vertically-centred dialog doesn't jump and the next button stays put.
    const left = state.plan.filter((tg) => !tg.done);
    const sent = state.plan.filter((tg) => tg.done);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    root.append(
      h('div', { class: 'pp-summary' },
        h('span', {}, h('b', {}, plural(t.packages, 'new package')), ` after everything arrives (${state.stored + t.packages} stored in total) → `, storeLink()),
        h('span', {}, `Last arrival in ${hm(t.longest)} · ${t.done} of ${state.plan.length} sent`),
        nobleLine(),
      ),
      left.length ? '' : h('p', {}, h('b', {}, 'All sent. '), 'Store the packages once everything has arrived: ', storeLink()),
      h('div', { class: 'pp-cards' }, [...left, ...sent].map((tg) => h('div', { class: tg.done ? 'pp-card pp-done' : 'pp-card' },
        h('div', {}, h('b', {}, tg.name), ' ', h('span', { class: 'pp-muted' }, tg.coord)),
        h('div', { style: 'grid-row:span 3;align-self:start' }, tg.done
          ? h('button', { class: 'btn', disabled: true }, '✓ Sent')
          : h('button', { class: 'btn pp-send', onclick: () => send(tg, root) }, 'Request')),
        h('div', {}, h('span', { class: 'pp-badge' }, `${plural(tg.packages, 'package')} to store after arrival`)),
        h('div', { class: 'pp-muted' }, icon('wood'), fmt(tg.wood), ' ', icon('stone'), fmt(tg.stone), ' ', icon('iron'), fmt(tg.iron),
          ` · from ${plural(tg.sources.length, 'village')} · last arrival in ${hm(tg.longest)}`),
      ))),
    );
  }

  // ---------- Variant C: side settings + one big "send next" ---------------------------
  function VariantC(root) {
    const t = totals();
    const cur = state.plan.find((x) => !x.done);
    const side = h('div', { class: 'pp-side' },
      h('table', { class: 'vis' }, h('tr', {}, h('th', { colspan: 2 }, 'Settings')),
        settingsRows().map(([l, c]) => [h('tr', {}, h('td', { colspan: 2, class: 'pp-muted' }, l)), h('tr', {}, h('td', { colspan: 2 }, c))])),
      h('div', { class: 'pp-actions' }, h('button', { class: 'btn', style: 'width:100%', onclick: calculate }, state.calculated ? 'Recalculate' : 'Calculate')),
    );
    let main;
    if (!state.calculated) main = h('div', { class: 'pp-next' }, h('p', {}, 'Set your options and press Calculate.'));
    else main = h('div', {},
      h('div', { class: 'pp-summary' }, h('b', {}, `+${t.packages} packages`), `${t.merchants} merchants · longest ${hm(t.longest)}`, h('span', {}, '→ ', storeLink()), nobleLine()),
      cur
        ? h('div', { class: 'pp-next' },
          h('div', { class: 'pp-muted' }, `Next (${t.done + 1} of ${state.plan.length})`),
          h('div', { style: 'font-size:15px;font-weight:bold;margin:4px 0' }, `${cur.name} (${cur.coord}) · +${cur.packages} packages`),
          h('div', {}, icon('wood'), fmt(cur.wood), '  ', icon('stone'), fmt(cur.stone), '  ', icon('iron'), fmt(cur.iron)),
          h('div', { class: 'pp-muted' }, `from ${cur.sources.length} villages · ${cur.merchants} merchants · arrives in ≤ ${hm(cur.longest)}`),
          h('button', { class: 'btn btn-confirm-yes pp-send pp-big', onclick: () => send(cur, root) }, 'Request  ⏎'),
        )
        : h('div', { class: 'pp-next' }, h('b', {}, 'All sent ✓'), h('p', {}, 'Store once resources arrive: ', storeLink())),
      h('div', { class: 'pp-queue' }, h('table', { class: 'vis' }, state.plan.map((tg) => h('tr', { class: tg.done ? 'pp-done' : '' },
        h('td', { class: tg === cur ? 'pp-cur' : '' }, tg.done ? '✓ ' : tg === cur ? '▶ ' : '', tg.name),
        h('td', { class: 'pp-num' }, `+${tg.packages}`), h('td', { class: 'pp-num' }, hm(tg.longest)))))),
    );
    root.append(h('h3', {}, 'Noble Package Planner'), h('div', { class: 'pp-split' }, side, main));
  }

  // ---------- mount + switcher -----------------------------------------------------------
  const VARIANTS = [
    ['A', 'Classic: form → table, expandable sources', VariantA],
    ['B', 'Compact: settings chip, summary line, cards', VariantB],
    ['C', 'Focus: side settings, one big "send next"', VariantC],
  ];

  // The dialog is shown once (TW sizes it from the content at show time and fades it in);
  // ordinary re-renders only swap the contents of `host`. Only a variant switch re-shows
  // it, because the variants have different widths.
  const host = h('div');
  let shownVariant = -1;

  function render() {
    const root = h('div', { class: state.variant === 1 ? 'pp-root pp-narrow' : 'pp-root' });
    VARIANTS[state.variant][2](root);
    host.replaceChildren(root);
    if (shownVariant === state.variant && host.isConnected) return;
    shownVariant = state.variant;
    const hasDialog = window.Dialog && typeof Dialog.show === 'function' && window.jQuery;
    // Re-showing the same dialog id closes it first (firing the close callback), so
    // only clean up on a real close, not on our own re-render.
    if (hasDialog) {
      rerendering = true;
      // Dialog only accepts a string, a jQuery object or a 1-arg function — not a raw node.
      Dialog.show('pp_prototype', jQuery(host), () => { if (!rerendering) cleanup(); });
      rerendering = false;
    }
    else {
      document.getElementById('pp-fallback')?.remove();
      document.body.append(h('div', { id: 'pp-fallback', onclick: (e) => { if (e.target.id === 'pp-fallback') { e.target.remove(); cleanup(); } } }, h('div', {}, host)));
    }
    updateSwitcher();
  }

  function updateSwitcher() {
    const sw = document.getElementById('pp-switcher');
    if (sw) sw.querySelector('.pp-label').textContent = `${VARIANTS[state.variant][0]} — ${VARIANTS[state.variant][1]}`;
  }

  function cycle(d) {
    state.variant = (state.variant + d + VARIANTS.length) % VARIANTS.length;
    render();
  }

  function onKey(e) {
    if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'ArrowLeft') cycle(-1);
    if (e.key === 'ArrowRight') cycle(1);
  }

  function cleanup() {
    document.getElementById('pp-switcher')?.remove();
    document.removeEventListener('keydown', onKey);
  }

  cleanup();
  document.body.append(h('div', { id: 'pp-switcher' },
    h('span', { class: 'pp-tag' }, 'PROTOTYPE'),
    h('button', { onclick: () => cycle(-1), title: 'previous (←)' }, '‹'),
    h('span', { class: 'pp-label' }, ''),
    h('button', { onclick: () => cycle(1), title: 'next (→)' }, '›'),
  ));
  document.addEventListener('keydown', onKey);
  render();
})();
