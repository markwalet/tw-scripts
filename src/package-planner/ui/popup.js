// package-planner/ui/popup.js — the planner popup (spec §1 layout B, native TW
// look). The dialog is shown ONCE; every render() replaces the contents of one host
// element (re-calling Dialog.show closes and fades the dialog in again, which is slow).
// TW-specific calls (showing the dialog) come in through `deps`, from the adapter.
// Mobile (TW's mobile site, or TW's Dialog `mobile` class below 500 px): full width,
// one-column cards with a full-width tap-sized send button, no auto-focus.

import { h, injectStyle } from '../../shared/dom.js';
import { fill, plural } from '../core/i18n.js';
import { fmt, hm, hms } from '../core/plan-view.js';
import { requestPayload, transportPayload, fallbackRows } from '../core/send.js';

/** Click lock after each send (approved-scripts pattern): holding Enter = one send per lock. */
const LOCK_MS = 200;

const CSS = `
.pp-root{font:12px/1.4 Verdana,Arial,sans-serif;color:#000;width:min(560px,calc(100vw - 40px));box-sizing:border-box;overflow-wrap:anywhere}
.pp-root *{box-sizing:border-box}
.pp-root h3{margin:0 0 6px;font-size:14px}
.pp-root .pp-muted{color:#7d5a29;font-size:11px}
.pp-root .pp-summary{background:#fff5da;border:1px solid #c1a264;padding:6px 8px;margin:8px 0;display:flex;flex-direction:column;gap:4px}
.pp-root .pp-summary b{font-size:13px}
.pp-root .pp-error{background:#f8d8d0;border:1px solid #b5482b;padding:6px 8px;margin:8px 0}
.pp-root .pp-warn{margin:6px 0;padding-left:18px;color:#7d3a00;font-size:11px}
.pp-root .pp-link{color:#603000;font-weight:bold}
.pp-root .pp-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-top:8px}
.pp-root .pp-calc{display:flex;margin:8px 0}
.pp-root .pp-calc .btn{flex:1;padding:6px}
.pp-root .pp-cards{display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto}
.pp-root .pp-card{background:#f4e4bc;border:1px solid #c1a264;padding:6px 8px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px}
.pp-root .pp-card>*{grid-column:1}
.pp-root .pp-card>.btn{grid-column:2;grid-row:1/span 3;align-self:start}
.pp-root .pp-card.pp-done{opacity:.45}
.pp-root .pp-badge{background:#5c8a3a;color:#fff;font-weight:bold;padding:1px 6px;border-radius:8px;font-size:11px}
.pp-root .pp-res{white-space:nowrap}
.pp-root .pp-res .icon{margin-right:2px}
.pp-root textarea{width:100%;height:120px;font:11px monospace;margin-top:6px}
.pp-mobile,.mobile .pp-root{width:100%}
.pp-mobile .pp-cards,.mobile .pp-cards{max-height:none}
.pp-mobile .pp-card,.mobile .pp-card{grid-template-columns:minmax(0,1fr)}
.pp-mobile .pp-card>.btn,.mobile .pp-card>.btn{grid-column:1;grid-row:auto}
.pp-mobile .btn,.mobile .pp-root .btn{min-height:40px}
`;

/** @typedef {import('../core/plan-view.js').Card} Card */
/** @typedef {ReturnType<typeof import('../core/plan-view.js').planView>} PlanView */

/**
 * @typedef {{ status: 'starting' }
 *   | { status: 'ready' }
 *   | { status: 'loading' }
 *   | { status: 'calculating' }
 *   | { status: 'refused', reason: string }
 *   | { status: 'error' }
 *   | { status: 'done', plan: PlanView, detail: { merchants: number, academies: number, villages: number },
 *       target: { x: number, stored: number, packages: number, missing: number } | null, warnings: string[],
 *       transports: import('../core/solver.js').Transport[], places: Map<number, { name: string, x: number, y: number }> }} View
 */
/** @typedef {import('../core/send.js').Outcome} Outcome */
/** @typedef {import('../core/send.js').Row} Row */

/**
 * @param {{
 *   t: (key: string) => string,
 *   show: (id: string, host: HTMLElement, onClose: () => void) => void,
 *   storeUrl: string,
 *   mobile: boolean,
 *   debugText: () => string,
 *   toast: (msg: string) => void,
 *   onCalculate: () => void,
 *   post: (action: 'call' | 'map_send', village: number, data: Record<string, number>) => Promise<Outcome>,
 *   settingsPanel: { element: () => HTMLElement, close: () => void },
 * }} deps
 */
export function createPopup({ t, show, storeUrl, mobile, debugText, toast, onCalculate, post, settingsPanel }) {
  injectStyle('pp-style', CSS);
  const host = h('div');
  let shown = false;
  let debugOpen = false;
  let calculated = false;
  /** @type {View} */
  let view = { status: 'starting' };

  // Sending state of the current plan; replaced whenever a new view arrives (or the list
  // switches to the fallback), so answers to requests of an old list are ignored.
  // rows: null = one card per target (Request resources), else the fallback list.
  /** @returns {{ rows: Row[] | null, status: Map<number | string, 'sent' | 'failed'>, failure: Outcome | null, locked: boolean }} */
  const fresh = () => ({ rows: null, status: new Map(), failure: null, locked: false });
  let send = fresh();
  let focusNext = false;
  /** @type {HTMLElement | null} */
  let firstSend = null;

  /**
   * One click = one request. The item moves to the bottom at once (list keeps its height,
   * so TW's centred dialog doesn't jump); all buttons lock for LOCK_MS, then focus goes to
   * the next button, so holding Enter walks down the list.
   * @param {number | string} key @param {() => Promise<Outcome>} run
   */
  function click(key, run) {
    if (send.locked || send.failure || send.status.has(key)) return;
    const s = send;
    s.locked = true;
    s.status.set(key, 'sent');
    run().then((o) => {
      if (s !== send) return;
      if (o.ok) { if (o.message) toast(o.message); return; }
      s.status.set(key, 'failed');
      s.failure ??= o;
      render(view);
    });
    render(view);
    setTimeout(() => {
      if (s !== send) return;
      s.locked = false;
      focusNext = true;
      render(view);
    }, LOCK_MS);
  }

  /** Card/row button: send while pending, else a greyed label. @param {number | string} key @param {string} label @param {() => void} onClick */
  function sendButton(key, label, onClick) {
    const st = send.status.get(key);
    if (st || send.failure) return h('button', { className: 'btn', type: 'button', disabled: 'disabled', text: t(st === 'sent' ? 'sent' : st ? 'sendFailed' : 'notSent') });
    const b = h('button', { className: 'btn pp-send', type: 'button', disabled: send.locked ? 'disabled' : null, text: label, on: { click: onClick } });
    firstSend ??= b;
    return b;
  }

  /** Pending first, sent/failed (greyed) at the bottom; keeps the list's length. @template T @param {T[]} items @param {(x: T) => number | string} key */
  const pendingFirst = (items, key) => [...items.filter((x) => !send.status.has(key(x))), ...items.filter((x) => send.status.has(key(x)))];
  const greyed = (/** @type {number | string} */ key) => (send.status.has(key) || send.failure ? 'pp-card pp-done' : 'pp-card');

  function useFallback() {
    if (view.status !== 'done') return;
    const sent = new Set([...send.status].filter(([, s]) => s === 'sent').map(([k]) => Number(k)));
    const rows = fallbackRows(view.transports, view.plan.cards.map((c) => c.id), sent, view.places);
    send = { ...fresh(), rows };
    focusNext = true;
    render(view);
  }

  /** @param {Row} r */
  function row(r) {
    const { t: tr, from, to } = r;
    return h('div', { className: greyed(r.key) }, [
      h('div', {}, [h('b', { text: from.name }), ` (${from.x}|${from.y}) → `, h('b', { text: to.name }), ` (${to.x}|${to.y})`]),
      sendButton(r.key, t('send'), () => click(r.key, () => post('map_send', tr.from, transportPayload(tr)))),
      h('div', { className: 'pp-muted' }, [
        res('wood', tr.res[0]), ' ', res('stone', tr.res[1]), ' ', res('iron', tr.res[2]),
        ` · ${fill(t('rowLine'), { merchants: tr.merchants, time: hms(tr.seconds) })}`,
      ]),
    ]);
  }

  function failureBox() {
    const f = send.failure;
    if (!f || f.ok) return null;
    const text = f.reason === 'game' ? fill(t('failGame'), { message: f.message })
      : t(f.reason === 'botProtect' ? 'failBotProtect' : f.reason === 'timeout' ? 'failTimeout' : 'failUnavailable');
    return h('div', { className: 'pp-error' }, [
      text,
      f.reason === 'game' && !send.rows
        ? h('div', { className: 'pp-actions' }, [h('button', { className: 'btn pp-fallback', type: 'button', text: t('fallback'), on: { click: useFallback } })])
        : null,
    ]);
  }

  async function copyDebug() {
    const text = debugText();
    try {
      await navigator.clipboard.writeText(text);
      toast(t('copied'));
      debugOpen = false;
    } catch {
      debugOpen = true; // no clipboard access: show the text to copy by hand
    }
    render(view);
  }

  const storeLink = () => h('a', { className: 'pp-link', href: storeUrl, text: t('academyStore') });

  /** @param {'wood' | 'stone' | 'iron'} k @param {number} n */
  const res = (k, n) => h('span', { className: 'pp-res', title: t(k) }, [h('span', { className: `icon header ${k}` }), fmt(n)]);

  /** @param {Card} c */
  function card(c) {
    const far = fill(t('farthest'), { name: c.farthest.name, x: c.farthest.x, y: c.farthest.y, time: hms(c.lastArrivalSeconds) });
    const tr = view.status === 'done' ? view.transports : [];
    return h('div', { className: greyed(c.id), 'data-village': c.id }, [
      h('div', {}, [h('b', { text: c.name }), ' ', h('span', { className: 'pp-muted', text: `(${c.x}|${c.y})` })]),
      sendButton(c.id, t('request'), () => click(c.id, () => post('call', c.id, requestPayload(tr, c.id)))),
      h('div', {}, [h('span', { className: 'pp-badge', text: plural(t, 'cardPackages', c.packages) })]),
      h('div', { className: 'pp-muted' }, [
        res('wood', c.res.wood), ' ', res('stone', c.res.stone), ' ', res('iron', c.res.iron),
        ` · ${plural(t, 'fromVillages', c.sources)} · `,
        h('span', { title: far, text: fill(t('cardLastArrival'), { time: hm(c.lastArrivalSeconds) }) }),
      ]),
    ]);
  }

  /** @param {Extract<View, { status: 'done' }>} v */
  function planBody(v) {
    const { summary, cards } = v.plan;
    const sentCount = [...send.status.values()].filter((s) => s === 'sent').length;
    const g = v.target;
    const headline = [
      h('b', { text: plural(t, 'storableAfter', summary.packages) }),
      summary.storableNow ? fill(t('storableSplit'), { now: fmt(summary.storableNow), added: fmt(summary.fromTransports) }) : '',
      g ? fill(t('storedTotal'), { n: fmt(g.stored + summary.packages) }) : '',
      ' → ',
      storeLink(),
    ];
    return [
      h('div', { className: 'pp-summary' }, [
        g ? h('span', { text: plural(t, 'nobleTarget', g.x, { packages: fmt(g.packages), missing: fmt(g.missing) }) }) : null,
        h('span', {}, headline),
        cards.length
          ? h('span', { text: fill(t('lastArrival'), { time: hm(summary.lastArrivalSeconds), sent: sentCount, total: send.rows ? send.rows.length : cards.length }) })
          : h('span', { text: t(summary.packages ? 'noTransports' : 'noPackages') }),
        h('span', { className: 'pp-muted', text: fill(t('planDetail'), { ...v.detail, merchants: fmt(v.detail.merchants) }) }),
      ]),
      v.warnings.length
        ? h('ul', { className: 'pp-warn', title: t('warnings') }, v.warnings.map((w) => h('li', { text: `⚠ ${w}` })))
        : null,
      failureBox(),
      cards.length
        ? h('div', { className: 'pp-cards' }, send.rows ? pendingFirst(send.rows, (r) => r.key).map(row) : pendingFirst(cards, (c) => c.id).map(card))
        : null,
    ];
  }

  function body() {
    switch (view.status) {
      case 'starting':
      case 'loading':
        return [h('p', { text: t('loading') })];
      case 'calculating':
        return [h('p', { text: t('calculating') })];
      case 'ready':
        return [h('p', { className: 'pp-muted', text: t('intro') })];
      case 'refused':
        return [h('div', { className: 'pp-error', text: t(view.reason) })];
      case 'error':
        return [h('div', { className: 'pp-error', text: t('failed') })];
      case 'done':
        return planBody(view);
    }
  }

  const configurable = () => view.status !== 'refused' && view.status !== 'starting';

  function calculateButton() {
    if (!configurable()) return null;
    const busy = view.status === 'loading' || view.status === 'calculating';
    return h('div', { className: 'pp-calc' }, [
      h('button', {
        className: 'btn btn-confirm-yes',
        type: 'button',
        disabled: busy ? 'disabled' : null,
        text: t(calculated ? 'recalculate' : 'calculate'),
        on: { click: () => { calculated = true; settingsPanel.close(); onCalculate(); } },
      }),
    ]);
  }

  /** @param {View} next */
  function render(next) {
    if (next !== view) {
      send = fresh();
      focusNext = next.status === 'done';
    }
    view = next;
    firstSend = null;
    const root = h('div', { className: mobile ? 'pp-root pp-mobile' : 'pp-root' }, [
      h('h3', { text: t('scriptName') }),
      configurable() ? settingsPanel.element() : null,
      calculateButton(),
      ...body().filter(Boolean),
      h('div', { className: 'pp-actions' }, [
        h('button', { className: 'btn', type: 'button', text: t('copyDebug'), on: { click: copyDebug } }),
      ]),
      debugOpen ? h('p', { className: 'pp-muted', text: t('copyManual') }) : null,
      debugOpen ? h('textarea', { readonly: 'readonly', text: debugText() }) : null,
    ].filter(Boolean));
    host.replaceChildren(root);
    if (!shown) {
      shown = true; // once: if the user closes it, later renders just update a detached host
      show('package_planner', host, () => {});
    }
    if (focusNext && firstSend && !mobile) { // mobile: tap only, no Enter-hold
      focusNext = false;
      firstSend.focus();
    }
  }

  return { render };
}
