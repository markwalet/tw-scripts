// package-planner/ui/popup.js — the planner popup (layout B of the prototype, native TW
// look). The dialog is shown ONCE; every render() replaces the contents of one host
// element (re-calling Dialog.show closes and fades the dialog in again, which is slow).
// TW-specific calls (showing the dialog) come in through `deps`, from the adapter.

import { h, injectStyle } from '../../shared/dom.js';
import { fill } from '../core/i18n.js';

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
.pp-root textarea{width:100%;height:120px;font:11px monospace;margin-top:6px}
.pp-root.pp-mobile{width:100%}
`;

/** "33140" -> "33.140", the way TW prints numbers. @param {number} n */
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * @typedef {{ status: 'loading' }
 *   | { status: 'refused', reason: string }
 *   | { status: 'error' }
 *   | { status: 'done', result: { packages: number, academies: number, villages: number },
 *       cost: { wood: number, stone: number, iron: number }, warnings: string[] }} View
 */

/**
 * @param {{
 *   t: (key: string) => string,
 *   show: (id: string, host: HTMLElement, onClose: () => void) => void,
 *   storeUrl: string,
 *   mobile: boolean,
 *   debugText: () => string,
 *   toast: (msg: string) => void,
 * }} deps
 */
export function createPopup({ t, show, storeUrl, mobile, debugText, toast }) {
  injectStyle('pp-style', CSS);
  const host = h('div');
  let shown = false;
  let debugOpen = false;
  /** @type {View} */
  let view = { status: 'loading' };

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

  function body() {
    switch (view.status) {
      case 'loading':
        return [h('p', { text: t('loading') })];
      case 'refused':
        return [h('div', { className: 'pp-error', text: t(view.reason) })];
      case 'error':
        return [h('div', { className: 'pp-error', text: t('failed') })];
      case 'done': {
        const { result, cost, warnings } = view;
        const headline = result.packages === 1 ? t('storableNowOne') : fill(t('storableNow'), { n: fmt(result.packages) });
        return [
          h('div', { className: 'pp-summary' }, [
            h('span', {}, [h('b', { text: headline }), ' → ', h('a', { className: 'pp-link', href: storeUrl, text: t('academyStore') })]),
            h('span', {
              className: 'pp-muted',
              text: fill(t('storableDetail'), {
                academies: result.academies,
                villages: result.villages,
                wood: fmt(cost.wood),
                stone: fmt(cost.stone),
                iron: fmt(cost.iron),
              }),
            }),
          ]),
          warnings.length
            ? h('ul', { className: 'pp-warn', title: t('warnings') }, warnings.map((w) => h('li', { text: `⚠ ${w}` })))
            : null,
        ];
      }
    }
  }

  /** @param {View} next */
  function render(next) {
    view = next;
    const root = h('div', { className: mobile ? 'pp-root pp-mobile' : 'pp-root' }, [
      h('h3', { text: t('scriptName') }),
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
