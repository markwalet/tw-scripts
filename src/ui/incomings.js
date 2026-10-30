// ui/incomings.js — reuse TW's native commands table, append a "Send in" column, and
// wire click-to-fill. Reads values by data-endtime (NOT translated headers), so it is
// language-independent (DESIGN.md §5).
//
// SCAFFOLD: fetch + append wiring is sketched; the exact insertion point into the confirm
// form (and one edge case in the ms sub-span lookup) are TODO(live) pending a live page.

import * as tw from '../adapter/tw.js';
import { Renderer } from './renderer.js';
import { makeTranslator, resolveLang } from '../core/i18n.js';
import { arrivalMsFromRowData, sendCellEndtimeSecs } from '../core/incomings-parse.js';

/**
 * @param {{ queue: { add: (t: () => Promise<any>) => Promise<any> },
 *           onPick: (arrivalMs: number) => void }} deps
 */
export function createIncomings({ queue, onPick }) {
  // The "Send in" header label follows the game's own language via market auto-detect
  // (DESIGN.md §9). Note: createIncomings only receives `queue`/`onPick` from
  // bootstrap.js, so the user's explicit language override (settings.language) isn't
  // threaded in here — this always resolves via 'auto'. A deliberate, minor simplification;
  // revisit by passing `t` in if per-user override for this one label ever matters.
  const t = makeTranslator(resolveLang('auto', tw.market()));

  /**
   * Read a command row's registered arrival, in epoch ms, by data — never by translated
   * header text or natural-language dates (DESIGN.md §5). `data-endtime` is the row's
   * integer-second arrival, on the same <span> TW renders the visible time into; TW
   * additionally nests the millisecond remainder inside that span as a grey sub-span
   * (e.g. ":838"). We combine both for full ms precision via the pure helper.
   * @param {Element} row
   * @returns {number|null}
   */
  function rowArrivalMs(row) {
    const span = row.querySelector('[data-endtime]');
    if (!span) return null;
    // Confirmed against TW's compiled game.js (the arrival-string builder): the ms
    // remainder is rendered as `:<span class="grey small">NNN</span>` (zero-padded to 3
    // digits) nested *inside* the same span that carries data-endtime — so scoping the
    // lookup to `span` (not the whole row) avoids picking up an unrelated `.grey.small`
    // elsewhere in the row (e.g. another column).
    // TODO(live): game.js confirms the *format*; what's unverified is that info_village's
    // AJAX-fetched command rows use this exact same template partial (vs. some other
    // arrival-rendering path) and that the sub-span is present on every row (e.g. already-
    // landed/edge-case rows might omit it). If it's absent, arrivalMsFromRowData already
    // degrades gracefully to second precision — just confirm that's an acceptable fallback
    // in practice, and re-scope this query if a live page shows a different nesting.
    const msEl = span.querySelector('.grey.small');
    const arrival = arrivalMsFromRowData(span.getAttribute('data-endtime'), msEl?.textContent);
    return Number.isNaN(arrival) ? null : arrival;
  }

  /** Target village id from the confirm form's village anchor. */
  function targetId() {
    const form = tw.els.commandForm();
    const a = form?.querySelector('.village_anchor a');
    const href = a?.getAttribute('href') || '';
    return href.split('id=').pop() || '';
  }

  /**
   * Append a "Send in" header cell, once. TW's info_village response has no <thead> — the
   * header is just the first <tr> in the table (mirrors the original's
   * `commandsTable.find('tr:first').append('<th>Send in</th>')`, timetool.js ~line 208).
   * @param {Element} container
   */
  function appendHeaderCell(container) {
    const headerRow = container.querySelector('tr');
    if (!headerRow) return;
    const th = document.createElement('th');
    th.className = 'tt2-send-header';
    th.textContent = t('sendIn');
    headerRow.appendChild(th);
  }

  async function init() {
    const id = targetId();
    if (!id) return;
    const url = `${tw.linkBasePure()}info_village&id=${id}`;

    let html;
    try {
      html = await queue.add(() => tw.fetchHtml(url));
    } catch (err) {
      console.error('[timetool2] incomings fetch failed', err);
      return;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container = tw.els.commandsContainer(doc);
    const rows = tw.els.commandRows(doc);
    if (!container || !rows.length) return;

    const durationMs = tw.attackDurationMs();

    appendHeaderCell(container);
    for (const row of rows) {
      const arrival = rowArrivalMs(row);
      if (arrival == null) continue;
      const cell = document.createElement('td');
      cell.className = 'tt2-send-cell';
      Renderer.styleIncomingSendCell(cell, { sendEndtime: sendCellEndtimeSecs(arrival, durationMs) });
      row.appendChild(cell);
      // Click-to-fill: precise, no string parsing (DESIGN.md §5's "most-used path").
      /** @type {HTMLElement} */ (row).style.cursor = 'pointer';
      row.addEventListener('click', () => onPick(arrival));
    }

    // TODO(live): confirm the insertion point into the confirm form. The original inserted
    // its fetched table right after its own delay/remember controls
    // (`$('#remember').after(commandsTable)`, timetool.js ~line 209). timetool2's own panel
    // has no equivalent anchor element (its remember checkbox is `#tt2-remember`, inside our
    // own renderer-owned panel, not a sensible insertion anchor for TW's table) — so this
    // appends to the end of the confirm form as a functional placeholder. On a live page,
    // verify where the table should sit visually (most likely directly below the arrival
    // panel / above the troop-selection table) and swap this for an insertBefore/after a
    // concrete anchor once confirmed. Note: appendChild across documents auto-adopts the
    // node (DOM living standard), so this works even though `container` came from a
    // DOMParser'd document — no explicit importNode needed.
    const form = tw.els.commandForm();
    if (form) form.appendChild(container);
  }

  return { init };
}
