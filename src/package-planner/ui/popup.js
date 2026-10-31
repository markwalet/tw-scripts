// package-planner/ui/popup.js — the planner popup (spec §1 layout B, native TW
// look). The dialog is shown ONCE; every render() replaces the contents of one host
// element (re-calling Dialog.show closes and fades the dialog in again, which is slow).
// TW-specific calls (showing the dialog) come in through `deps`, from the adapter.
// Mobile (TW's mobile site, or TW's Dialog `mobile` class below 500 px): full width,
// one-column cards with a full-width tap-sized send button, no auto-focus.

import { h, injectStyle } from '../../shared/dom.js';
import { fill, plural } from '../core/i18n.js';
import { fmt, hm, hms } from '../core/plan-view.js';
import { requestPayload, transportPayload, fallbackRows, leftAfter, checkCard, failureRecord } from '../core/send.js';
import { RES } from '../core/world-config.js';

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
.pp-root .pp-card>.pp-error,.pp-root .pp-card>.pp-rows{grid-column:1/-1;margin:2px 0 0}
.pp-root .pp-row{border-top:1px solid #c1a264;padding:4px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px}
.pp-root .pp-row>*{grid-column:1}
.pp-root .pp-row>.btn{grid-column:2;grid-row:1/span 3;align-self:start}
.pp-root .pp-card.pp-done,.pp-root .pp-row.pp-done{opacity:.45}
.pp-root .pp-badge{background:#5c8a3a;color:#fff;font-weight:bold;padding:1px 6px;border-radius:8px;font-size:11px}
.pp-root .pp-short{color:#b5482b;font-size:11px}
.pp-root .pp-res{white-space:nowrap}
.pp-root .pp-res .icon{margin-right:2px}
.pp-root textarea{width:100%;height:120px;font:11px monospace;margin-top:6px}
.pp-mobile,.mobile .pp-root{width:100%}
.pp-mobile .pp-cards,.mobile .pp-cards{max-height:none}
.pp-mobile .pp-card,.mobile .pp-card,.pp-mobile .pp-row,.mobile .pp-row{grid-template-columns:minmax(0,1fr)}
.pp-mobile .pp-card>.btn,.mobile .pp-card>.btn,.pp-mobile .pp-row>.btn,.mobile .pp-row>.btn{grid-column:1;grid-row:auto}
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
 *       transports: Transport[], cost: number[], limits: { reserve: number[], keepMerchants: number },
 *       places: Map<number, { name: string, x: number, y: number, wood?: number, stone?: number, iron?: number, merchantsAvailable?: number }> }} View
 */
/** @typedef {import('../core/solver.js').Transport} Transport */
/** @typedef {import('../core/send.js').Outcome} Outcome */
/** @typedef {import('../core/send.js').Row} Row */
/** @typedef {import('../core/send.js').Left} Left */
/** @typedef {ReturnType<typeof checkCard>} Check */
/** What a click sends, kept for the failure record. @typedef {{ action: 'call' | 'map_send', target: number, planned: Transport[], sent: Transport[] }} Req */
/** What ended all sending: a failure that is not one card's, or the game refusing twice in a row. @typedef {Exclude<Outcome, { ok: true }> | { ok: false, reason: 'repeated', message: string }} Stop */

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
 *   onFailure: (f: import('../core/send.js').Failure) => void,
 * }} deps
 */
export function createPopup({ t, show, storeUrl, mobile, debugText, toast, onCalculate, post, settingsPanel, onFailure }) {
  injectStyle('pp-style', CSS);
  const host = h('div');
  let shown = false;
  let debugOpen = false;
  let calculated = false;
  /** @type {View} */
  let view = { status: 'starting' };

  // Sending state of the current plan; replaced whenever a new view arrives (Recalculate
  // waits for a pending answer, so no answer of an old plan is left to come). Keys: card =
  // target id, fallback row = 'from-to'. status: 'pending' = clicked, no answer yet; 'sent'
  // = the game confirmed it; 'failed' = the game refused it (errors: its message; only that
  // card/row stops, #19); 'skipped' = the game reports its sources no longer have it. rows:
  // a failed card's own fallback rows, once the user asked for them, rebuilt after every
  // answer. left: what each source has left per the game's answers (or what was sent
  // subtracted, when an answer has no numbers); checks: cards that differ from the plan.
  /** @returns {{ status: Map<number | string, 'pending' | 'sent' | 'failed' | 'skipped'>, errors: Map<number | string, string>, rows: Map<number, Row[]>, locked: boolean, left: Map<number, Left>, checks: Map<number, Check> }} */
  const fresh = () => ({ status: new Map(), errors: new Map(), rows: new Map(), locked: false, left: new Map(), checks: new Map() });
  let send = fresh();
  /**
   * What ended all sending (bot protection, HTTP error, no answer, unavailable, or two game
   * errors in a row: something the game refuses whatever is sent, e.g. a stale session).
   * For the popup's lifetime, whichever plan's request it came from: the player refreshes.
   * @type {Stop | null}
   */
  let stop = null;
  /** Game errors in a row (any success resets it); the second stops everything. */
  let gameErrors = 0;
  /** After a game error, focus stays put: the next send is a deliberate click, not a held Enter. */
  let holdFocus = false;
  /** Requests waiting for an answer, across plans: strictly one at a time (spec §7). */
  let inFlight = 0;
  /** Buttons stay disabled until the lock is over AND the previous answer has arrived. */
  const busy = () => send.locked || inFlight > 0;
  /** The plan's transports per target, grouped once per view. @type {Map<number, Transport[]>} */
  let byTarget = new Map();
  const plannedFor = (/** @type {number} */ id) => byTarget.get(id) ?? [];
  let focusNext = false;
  /** @type {HTMLElement | null} */
  let firstSend = null;

  /**
   * One click = one request, and strictly one at a time: the next button unlocks once the
   * answer has arrived and LOCK_MS has passed, whichever is later, so each pre-check uses
   * the game's latest numbers. The item moves to the bottom at once (list keeps its height,
   * so TW's centred dialog doesn't jump); then focus goes to the next button, so holding
   * Enter walks down the list (not after a game error: see holdFocus).
   * @param {number | string} key @param {Req} req
   */
  function click(key, req) {
    if (busy() || stop || send.status.has(key)) return;
    const s = send;
    s.locked = true;
    holdFocus = false;
    inFlight += 1;
    s.status.set(key, 'pending');
    const payload = req.action === 'call' ? requestPayload(req.sent, req.target) : transportPayload(req.sent[0]);
    // What was known when the request went out (later answers or a new plan change both).
    const known = { snapshot: view.status === 'done' ? view.places : new Map(), left: new Map(s.left) };
    post(req.action, req.action === 'call' ? req.target : req.sent[0].from, payload).then((o) => {
      inFlight -= 1;
      // Evidence first (also for an answer to an old plan): kept until the popup closes.
      if (!o.ok) onFailure(failureRecord({ ...req, ...known, outcome: o }));
      // A failure that ends all sending applies whichever plan sent it.
      if (o.ok) gameErrors = 0;
      else if (o.reason !== 'game') stop ??= o;
      else if (++gameErrors >= 2) stop ??= { ok: false, reason: 'repeated', message: o.message };
      else holdFocus = true;
      if (s === send) {
        if (o.ok) {
          s.status.set(key, 'sent');
          if (o.message) toast(o.message);
          for (const l of leftAfter(req.sent, o.left, s.left, known.snapshot)) s.left.set(l.id, l);
        } else {
          s.status.set(key, 'failed');
          if (o.reason === 'game') s.errors.set(key, o.message);
        }
        recheck();
      }
      if (!busy() && !holdFocus) focusNext = true;
      render(view);
    });
    render(view);
    setTimeout(() => {
      if (s !== send) return;
      s.locked = false;
      if (!busy() && !holdFocus) focusNext = true;
      render(view);
    }, LOCK_MS);
  }

  /** Card/row button: send while pending, else a greyed label. @param {number | string} key @param {string} label @param {() => void} onClick */
  function sendButton(key, label, onClick) {
    const st = send.status.get(key);
    if (st || stop) return h('button', { className: 'btn', type: 'button', disabled: 'disabled', text: t(st === 'failed' ? 'sendFailed' : st || 'notSent') });
    const b = h('button', { className: 'btn pp-send', type: 'button', disabled: busy() ? 'disabled' : null, text: label, on: { click: onClick } });
    firstSend ??= b;
    return b;
  }

  /** Pending first, sent/failed/skipped at the bottom; keeps the list's length. @template T @param {T[]} items @param {(x: T) => number | string} key */
  const pendingFirst = (items, key) => [...items.filter((x) => !send.status.has(key(x))), ...items.filter((x) => send.status.has(key(x)))];
  /** Greyed once done; a failed one stays readable (its message, its fallback) unless all sending stopped. */
  const greyed = (/** @type {string} */ base, /** @type {number | string} */ key) => {
    const st = send.status.get(key);
    return stop || (st && st !== 'failed') ? `${base} pp-done` : base;
  };

  /**
   * Check every card not sent yet against what the game reported (spec §7): a card with a
   * short source sends what it has (marked reduced); none left = skipped, no request.
   * Open fallback rows the same way: a row not clicked yet is rebuilt from the latest
   * numbers (trimmed; none left = skipped); a clicked row keeps what it sent.
   */
  function recheck() {
    if (view.status !== 'done') return;
    for (const c of view.plan.cards) {
      if (send.status.has(c.id)) continue;
      const chk = checkCard(plannedFor(c.id), c.id, send.left, { cost: view.cost, packages: c.packages, ...view.limits });
      if (!chk.short.length) send.checks.delete(c.id);
      else if (chk.transports.length) send.checks.set(c.id, chk);
      else send.status.set(c.id, 'skipped');
    }
    for (const [id, old] of send.rows) {
      const now = new Map(fallbackRows(plannedFor(id), id, view.places, send.left, view.limits).map((r) => [r.key, r]));
      send.rows.set(id, old.map((r) => {
        if (send.status.has(r.key)) return r;
        const n = now.get(r.key);
        if (!n) send.status.set(r.key, 'skipped');
        return n ?? r;
      }));
    }
  }

  /**
   * A failed card's own fallback: one transport per click into that target, checked
   * against what the game last reported (and again after every answer). The other cards
   * are not touched. Not while a request is pending: its answer may change the numbers.
   * @param {number} id
   */
  function useFallback(id) {
    if (view.status !== 'done' || busy() || stop) return;
    send.rows.set(id, fallbackRows(plannedFor(id), id, view.places, send.left, view.limits));
    render(view);
  }

  /** @param {Row} r */
  function row(r) {
    const { t: tr, from, to } = r;
    const err = send.errors.get(r.key);
    return h('div', { className: greyed('pp-row', r.key), 'data-to': r.to.id, 'data-key': r.key }, [
      h('div', {}, [h('b', { text: from.name }), ` (${from.x}|${from.y}) → `, h('b', { text: to.name }), ` (${to.x}|${to.y})`]),
      sendButton(r.key, t('send'), () => click(r.key, { action: 'map_send', target: tr.to, planned: [tr], sent: [tr] })),
      h('div', { className: 'pp-muted' }, [
        ...resources(tr.res),
        `· ${plural(t, 'rowLine', tr.merchants, { time: hms(tr.seconds) })}`,
      ]),
      err != null ? h('div', { className: 'pp-short', text: fill(t('failCard'), { message: err }) }) : null,
    ]);
  }

  /** A failure that ended all sending (not the game refusing one card: that shows on the card). */
  function failureBox() {
    const f = stop;
    if (!f) return null;
    const text = f.reason === 'http' || f.reason === 'repeated' ? fill(t(f.reason === 'http' ? 'failHttp' : 'failRepeated'), { message: f.message })
      : t(f.reason === 'botProtect' ? 'failBotProtect' : f.reason === 'timeout' ? 'failTimeout' : 'failUnavailable');
    return h('div', { className: 'pp-error', text });
  }

  /** The game's message on a failed card, its fallback button, or its rows. @param {number} id */
  function cardFailure(id) {
    const err = send.errors.get(id);
    if (err == null) return [];
    const rows = send.rows.get(id);
    return [
      h('div', { className: 'pp-error' }, [
        fill(t('failCard'), { message: err }),
        rows || stop ? null : h('div', { className: 'pp-actions' }, [
          h('button', { className: 'btn pp-fallback', type: 'button', disabled: busy() ? 'disabled' : null, text: t('fallback'), on: { click: () => useFallback(id) } }),
        ]),
      ]),
      rows ? h('div', { className: 'pp-rows' }, rows.length ? pendingFirst(rows, (r) => r.key).map(row) : [h('span', { className: 'pp-short', text: t('skippedNote') })]) : null,
    ];
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

  /** Wood/clay/iron amounts with TW's icons, each followed by a space. @param {number[]} amounts */
  const resources = (amounts) => RES.flatMap((k, i) => [
    h('span', { className: 'pp-res', title: t(k) }, [h('span', { className: `icon header ${k}` }), fmt(amounts[i])]), ' ',
  ]);

  /** @param {Card} c */
  function card(c) {
    const far = fill(t('farthest'), { name: c.farthest.name, x: c.farthest.x, y: c.farthest.y, time: hms(c.lastArrivalSeconds) });
    const planned = plannedFor(c.id);
    const chk = send.checks.get(c.id);
    const note = send.status.get(c.id) === 'skipped' ? t('skippedNote') : chk?.mayShort ? plural(t, 'reduced', chk.mayShort) : '';
    return h('div', { className: greyed('pp-card', c.id), 'data-village': c.id }, [
      h('div', {}, [h('b', { text: c.name }), ' ', h('span', { className: 'pp-muted', text: `(${c.x}|${c.y})` })]),
      sendButton(c.id, t('request'), () => click(c.id, { action: 'call', target: c.id, planned, sent: chk?.transports ?? planned })),
      h('div', {}, [h('span', { className: 'pp-badge', text: plural(t, 'cardPackages', c.packages) }), note ? h('span', { className: 'pp-short', text: ` ${note}` }) : null]),
      h('div', { className: 'pp-muted' }, [
        ...resources(RES.map((k) => c.res[k])),
        `· ${plural(t, 'fromVillages', c.sources)} · `,
        h('span', { title: far, text: fill(t('cardLastArrival'), { time: hm(c.lastArrivalSeconds) }) }),
      ]),
      ...cardFailure(c.id),
    ]);
  }

  /** @param {Extract<View, { status: 'done' }>} v */
  function planBody(v) {
    const { summary, cards } = v.plan;
    // A failed card counts as sent once every one of its fallback rows was sent.
    const rowsSent = (/** @type {number} */ id) => !!send.rows.get(id)?.length && !!send.rows.get(id)?.every((r) => send.status.get(r.key) === 'sent');
    const sentCount = cards.filter((c) => send.status.get(c.id) === 'sent' || rowsSent(c.id)).length;
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
          ? h('span', { text: fill(t('lastArrival'), { time: hm(summary.lastArrivalSeconds), sent: sentCount, total: cards.length }) })
          : h('span', { text: t(summary.packages ? 'noTransports' : 'noPackages') }),
        h('span', { className: 'pp-muted', text: fill(t('planDetail'), { ...v.detail, merchants: fmt(v.detail.merchants) }) }),
      ]),
      v.warnings.length
        ? h('ul', { className: 'pp-warn', title: t('warnings') }, v.warnings.map((w) => h('li', { text: `⚠ ${w}` })))
        : null,
      failureBox(),
      cards.length
        ? h('div', { className: 'pp-cards' }, pendingFirst(cards, (c) => c.id).map(card))
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
    // Not while a request is pending: its answer belongs to the plan that sent it.
    const working = view.status === 'loading' || view.status === 'calculating' || inFlight > 0;
    return h('div', { className: 'pp-calc' }, [
      h('button', {
        className: 'btn btn-confirm-yes',
        type: 'button',
        disabled: working ? 'disabled' : null,
        text: t(calculated ? 'recalculate' : 'calculate'),
        on: { click: () => { calculated = true; settingsPanel.close(); onCalculate(); } },
      }),
    ]);
  }

  // The settings panel sits in its own slot that renders leave alone (an open settings
  // table keeps its inputs, focus and typed text); everything below it is rebuilt.
  const settingsSlot = h('div');
  const main = h('div');
  host.appendChild(h('div', { className: mobile ? 'pp-root pp-mobile' : 'pp-root' }, [h('h3', { text: t('scriptName') }), settingsSlot, main]));

  /** @param {View} next */
  function render(next) {
    if (next !== view) {
      send = fresh();
      focusNext = next.status === 'done';
      holdFocus = false;
      byTarget = new Map();
      if (next.status === 'done') {
        for (const x of next.transports) {
          const list = byTarget.get(x.to);
          if (list) list.push(x);
          else byTarget.set(x.to, [x]);
        }
      }
    }
    view = next;
    firstSend = null;
    const active = document.activeElement;
    // Focus may move to the next send button only from a send button or from nothing
    // (never out of a settings field the user is typing in).
    const focusFree = !active || active === document.body || (main.contains(active) && active.classList.contains('pp-send'));
    const panel = configurable() ? settingsPanel.element() : null;
    if (!panel) settingsSlot.replaceChildren();
    else if (settingsSlot.firstChild !== panel) settingsSlot.replaceChildren(panel);
    main.replaceChildren(...[
      calculateButton(),
      ...body().filter(Boolean),
      h('div', { className: 'pp-actions' }, [
        h('button', { className: 'btn', type: 'button', text: t('copyDebug'), on: { click: copyDebug } }),
      ]),
      debugOpen ? h('p', { className: 'pp-muted', text: t('copyManual') }) : null,
      debugOpen ? h('textarea', { readonly: 'readonly', text: debugText() }) : null,
    ].filter(Boolean));
    if (!shown) {
      shown = true; // once: if the user closes it, later renders just update a detached host
      show('package_planner', host, () => {});
    }
    // An answer re-renders the list: a focused send button keeps focus on the first one
    // (holding Enter keeps walking down the list).
    const lostSendFocus = focusFree && active !== document.activeElement && !!active?.classList?.contains('pp-send');
    if (focusNext || lostSendFocus) {
      focusNext = false;
      if (focusFree && firstSend && !mobile && !holdFocus) firstSend.focus(); // mobile: tap only, no Enter-hold
    }
  }

  return { render };
}
