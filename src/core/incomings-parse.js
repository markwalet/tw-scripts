// core/incomings-parse.js — PURE functions for the incomings ("Send in" column) feature,
// no DOM, no globals (DESIGN.md §2/§3). ui/incomings.js does the DOM reads (data-endtime
// attribute value, the ms sub-span's textContent) and hands the raw strings/numbers to
// these helpers so the actual math/parsing stays unit-tested without a live TW page.
//
// Verified against TW's compiled game.js (the arrival-string builder): the ms portion is
// rendered as `:<span class="grey small">NNN</span>` where NNN is the millisecond value
// zero-padded to 3 digits (e.g. "083", "838"). This confirms DESIGN.md §5's ".grey.small"
// guess for the sub-span selector — see the TODO(live) in ui/incomings.js for the one bit
// that still needs a live page (whether *every* rendered row actually carries this span,
// e.g. already-arrived rows might not).

/**
 * Parse a row's `data-endtime` attribute (TW renders it as integer epoch seconds) into a
 * number. Never throws; unparsable input yields NaN so callers can guard once.
 * @param {string|number|null|undefined} attrValue
 * @returns {number} epoch seconds, or NaN if missing/unparsable
 */
export function parseEndtimeAttr(attrValue) {
  if (attrValue == null) return NaN;
  // Number('') is 0, not NaN — an empty attribute means "missing", not "epoch zero".
  if (typeof attrValue === 'string' && attrValue.trim() === '') return NaN;
  const n = Number(attrValue);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parse the ms sub-span's text content (e.g. "838", "083", or with stray whitespace/colon)
 * into an integer 0..999. Missing/garbage input is treated as 0 — i.e. falls back to
 * second-precision rather than failing the whole row.
 * @param {string|null|undefined} text
 * @returns {number} 0..999
 */
export function parseMsSubSpanText(text) {
  if (text == null) return 0;
  const cleaned = String(text).replace(/[^0-9]/g, '');
  if (!cleaned) return 0;
  const n = Math.trunc(Number(cleaned));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

/**
 * Combine a row's `data-endtime` (integer seconds) with the ms sub-span TW renders next to
 * it, for full millisecond-precision arrival. A missing/NaN ms part degrades gracefully to
 * ":000" (second precision) rather than poisoning the result.
 * @param {number} endtimeSecs  epoch seconds (NaN propagates — caller should already have
 *   guarded parseEndtimeAttr's result before calling this)
 * @param {number} msPart       0..999, NaN/missing treated as 0
 * @returns {number} epoch ms, or NaN if endtimeSecs itself isn't finite
 */
export function combineArrivalMs(endtimeSecs, msPart) {
  if (!Number.isFinite(endtimeSecs)) return NaN;
  const ms = Number.isFinite(msPart) ? msPart : 0;
  return endtimeSecs * 1000 + ms;
}

/**
 * One-shot composition of the two parses above + combine, for the common case of reading
 * both raw DOM strings straight off a row. Kept alongside the parts (rather than only the
 * parts) so ui/incomings.js has a single call for the whole row-reading step.
 * @param {string|number|null|undefined} endtimeAttr  raw `data-endtime` attribute value
 * @param {string|null|undefined} msSubSpanText       raw ms sub-span textContent
 * @returns {number} epoch ms, or NaN if the endtime attribute is missing/unparsable
 */
export function arrivalMsFromRowData(endtimeAttr, msSubSpanText) {
  return combineArrivalMs(parseEndtimeAttr(endtimeAttr), parseMsSubSpanText(msSubSpanText));
}

/**
 * "Send in" cell value: the epoch instant to click "Aanvallen" for this attack to land at
 * the row's arrival. arrivalMs − travel-duration, expressed in epoch seconds (matching the
 * `endtime` convention used elsewhere, e.g. ui/snipe-bar.js's renderSendTime).
 * @param {number} arrivalMs   epoch ms (row arrival)
 * @param {number} durationMs  travel duration of the attack being composed, in ms
 * @returns {number} epoch seconds (may carry a sub-second fraction); NaN if arrivalMs isn't
 *   finite. May be negative-relative-to-now in absolute terms if the attack can no longer
 *   land in time — callers decide how to present that (e.g. "too late"), this just does
 *   the subtraction.
 */
export function sendCellEndtimeSecs(arrivalMs, durationMs) {
  if (!Number.isFinite(arrivalMs)) return NaN;
  const duration = Number.isFinite(durationMs) ? durationMs : 0;
  return (arrivalMs - duration) / 1000;
}
