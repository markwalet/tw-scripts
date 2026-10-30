// package-planner/ui/popup.js — the planner popup (layout B of the prototype, native TW
// look). The dialog is shown ONCE; every render() replaces the contents of one host
// element (re-calling Dialog.show closes and fades the dialog in again, which is slow).
// TW-specific calls (showing the dialog) come in through `deps`, from the adapter.

import { h, injectStyle } from '../../shared/dom.js';
import { fill } from '../core/i18n.js';
import { fmt, hm, hms } from '../core/plan-view.js';

const CSS = `
.pp-root{font:12px/1.4 Verdana,Arial,sans-serif;color:#000;width:min(560px,calc(100vw - 40px));box-sizing:border-box}
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
.pp-root .pp-card{background:#f4e4bc;border:1px solid #c1a264;padding:6px 8px;display:grid;grid-template-columns:1fr auto;gap:4px 10px}
.pp-root .pp-card>*{grid-column:1}
.pp-root .pp-badge{background:#5c8a3a;color:#fff;font-weight:bold;padding:1px 6px;border-radius:8px;font-size:11px}
.pp-root .pp-res{white-space:nowrap}
.pp-root .pp-res .icon{margin-right:2px}
.pp-root textarea{width:100%;height:120px;font:11px monospace;margin-top:6px}
.pp-root.pp-mobile{width:100%}
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
 *       stored: number | null, warnings: string[] }} View
 */

/**
 * @param {{
 *   t: (key: string) => string,
 *   show: (id: string, host: HTMLElement, onClose: () => void) => void,
 *   storeUrl: string,
 *   mobile: boolean,
 *   debugText: () => string,
 *   toast: (msg: string) => void,
 *   onCalculate: () => void,
 *   settingsPanel: { element: () => HTMLElement, close: () => void },
 * }} deps
 */
export function createPopup({ t, show, storeUrl, mobile, debugText, toast, onCalculate, settingsPanel }) {
  injectStyle('pp-style', CSS);
  const host = h('div');
  let shown = false;
  let debugOpen = false;
  let calculated = false;
  /** @type {View} */
  let view = { status: 'starting' };

  /** Singular/plural label: `key` with {n}, or `keyOne` for 1. */
  const count = (/** @type {string} */ key, /** @type {number} */ n) => (n === 1 ? t(`${key}One`) : fill(t(key), { n: fmt(n) }));

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
    return h('div', { className: 'pp-card', 'data-village': c.id }, [
      h('div', {}, [h('b', { text: c.name }), ' ', h('span', { className: 'pp-muted', text: `(${c.x}|${c.y})` })]),
      h('div', {}, [h('span', { className: 'pp-badge', text: count('cardPackages', c.packages) })]),
      h('div', { className: 'pp-muted' }, [
        res('wood', c.res.wood), ' ', res('stone', c.res.stone), ' ', res('iron', c.res.iron),
        ` · ${count('fromVillages', c.sources)} · `,
        h('span', { title: far, text: fill(t('cardLastArrival'), { time: hm(c.lastArrivalSeconds) }) }),
      ]),
    ]);
  }

  /** @param {Extract<View, { status: 'done' }>} v */
  function planBody(v) {
    const { summary, cards } = v.plan;
    const headline = [
      h('b', { text: count('storableAfter', summary.packages) }),
      summary.storableNow ? fill(t('storableSplit'), { now: fmt(summary.storableNow), added: fmt(summary.fromTransports) }) : '',
      v.stored == null ? '' : fill(t('storedTotal'), { n: fmt(v.stored + summary.packages) }),
      ' → ',
      storeLink(),
    ];
    return [
      h('div', { className: 'pp-summary' }, [
        h('span', {}, headline),
        cards.length
          ? h('span', { text: fill(t('lastArrival'), { time: hm(summary.lastArrivalSeconds), sent: summary.sent, total: cards.length }) })
          : h('span', { text: t(summary.packages ? 'noTransports' : 'noPackages') }),
        h('span', { className: 'pp-muted', text: fill(t('planDetail'), { ...v.detail, merchants: fmt(v.detail.merchants) }) }),
      ]),
      v.warnings.length
        ? h('ul', { className: 'pp-warn', title: t('warnings') }, v.warnings.map((w) => h('li', { text: `⚠ ${w}` })))
        : null,
      cards.length ? h('div', { className: 'pp-cards' }, cards.map(card)) : null,
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
    view = next;
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
  }

  return { render };
}
