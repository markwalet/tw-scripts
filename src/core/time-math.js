// core/time-math.js — PURE functions, no DOM, no globals (DESIGN.md §2/§3).
// This is the correctness-critical heart of the tool, unit-tested in test/.

/**
 * Send time = arrival − travel duration. Both in epoch ms.
 * @param {number} arrivalMs
 * @param {number} durationMs
 * @returns {number}
 */
export function sendTimeMs(arrivalMs, durationMs) {
  return arrivalMs - durationMs;
}

/**
 * Bar fill within the current second, aligned to a target millisecond.
 * 0ms distance → 100%, 999ms distance → ~0%. Mirrors the original's
 * ((servertime - msGoal) % 1000) / 10, but as a clamped 0..100.
 * @param {number} serverNowMs
 * @param {number} msGoal  target millisecond within the second (0..999)
 * @returns {number} 0..100
 */
export function barFillPercent(serverNowMs, msGoal) {
  const within = (((serverNowMs - msGoal) % 1000) + 1000) % 1000; // 0..999, never negative
  return within / 10;
}

/**
 * Is the current moment inside the 1-second "click now" window before send?
 * @param {number} serverNowMs
 * @param {number} sendMs  the effective send instant (arrival − duration + offsets)
 * @returns {boolean}
 */
export function isInGreenWindow(serverNowMs, sendMs) {
  return serverNowMs > sendMs - 1000 && serverNowMs <= sendMs;
}

/**
 * Bar view-model: everything the renderer needs to paint the bar, computed here so
 * renderers stay logic-free (DESIGN.md §7).
 * @param {number} serverNowMs
 * @param {number|null} sendMs  null when no target is set
 * @param {number} msGoal
 * @returns {{ percent:number, state:'waiting'|'ready'|'idle', targetPct:number }}
 */
export function barViewModel(serverNowMs, sendMs, msGoal) {
  const percent = barFillPercent(serverNowMs, msGoal);
  const targetPct = 100; // the goal is always "full"; renderers may draw a marker here
  if (sendMs == null || Number.isNaN(sendMs)) return { percent, state: 'idle', targetPct };
  return { percent, state: isInGreenWindow(serverNowMs, sendMs) ? 'ready' : 'waiting', targetPct };
}

/**
 * Format an epoch-ms instant for an <input type="datetime-local"> value
 * (local time, `YYYY-MM-DDTHH:MM:SS`). Ported from the original's msToDatetimeLocal.
 * @param {number} ms
 * @returns {string}
 */
export function msToDatetimeLocal(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

const pad2 = (n) => String(n).padStart(2, '0');
const wrap = (n, max) => (((n % max) + max) % max);
const daysInMonth = (m, y) => new Date(y, m, 0).getDate(); // m: 1..12

/**
 * Nudge the sub-part of a segment value at the caret, by `delta`. Pure & testable.
 * - `time` ("HH:MM:SS"): caret 0-2 → hour, 3-5 → minute, else second (each wraps in range).
 * - `date` ("dd-mm-yyyy"): caret 0-2 → day, 3-5 → month, else year (day clamps to month len).
 * - `ms`: the whole value, clamped 0..999.
 * Unparseable input is returned unchanged. Caret is preserved so repeated presses stay on
 * the same sub-part.
 * @param {'date'|'time'|'ms'} kind
 * @param {string} value
 * @param {number} caret  selectionStart within the field
 * @param {number} delta
 * @returns {{ value: string, caret: number }}
 */
export function nudgeSegment(kind, value, caret, delta) {
  const v = String(value ?? '').trim();
  const pos = Number(caret) || 0;

  if (kind === 'ms') {
    const out = String(Math.min(999, Math.max(0, (parseInt(v, 10) || 0) + delta)));
    return { value: out, caret: Math.min(pos, out.length) };
  }

  if (kind === 'time') {
    const m = v.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return { value: v, caret: pos };
    let hh = Number(m[1]);
    let mm = Number(m[2]);
    let ss = Number(m[3]);
    const idx = pos <= 2 ? 0 : pos <= 5 ? 1 : 2;
    if (idx === 0) hh = wrap(hh + delta, 24);
    else if (idx === 1) mm = wrap(mm + delta, 60);
    else ss = wrap(ss + delta, 60);
    return { value: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`, caret: pos };
  }

  // date, "dd-mm-yyyy"
  const m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!m) return { value: v, caret: pos };
  let dd = Number(m[1]);
  let mo = Number(m[2]);
  let yy = m[3].length < 4 ? 2000 + Number(m[3]) : Number(m[3]);
  const idx = pos <= 2 ? 0 : pos <= 5 ? 1 : 2;
  if (idx === 0) {
    const dim = daysInMonth(mo, yy);
    dd = wrap(dd - 1 + delta, dim) + 1;
  } else if (idx === 1) {
    mo = wrap(mo - 1 + delta, 12) + 1;
  } else {
    yy = Math.max(1970, yy + delta);
  }
  dd = Math.min(dd, daysInMonth(mo, yy)); // keep day valid after a month/year change
  return { value: `${pad2(dd)}-${pad2(mo)}-${yy}`, caret: pos };
}

/** Millisecond-of-second (0..999) of an epoch-ms instant. */
export function msPart(ms) {
  return (((Math.floor(ms) % 1000) + 1000) % 1000);
}

/** Format the DATE segment of an instant as `yyyy-mm-dd` (ISO, large→small). */
export function formatDatePart(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format the TIME segment of an instant as 24h `HH:MM:SS`. */
export function formatTimePart(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Format an instant as `dd-mm-yyyy HH:MM:SS.mmm` — round-trippable via parseSnipeParts. */
export function formatFull(ms) {
  return `${formatDatePart(ms)} ${formatTimePart(ms)}.${String(msPart(ms)).padStart(3, '0')}`;
}

/** Format an instant as a live clock `HH:MM:SS.mmm` (for the bar). */
export function formatClock(ms) {
  return `${formatTimePart(ms)}.${String(msPart(ms)).padStart(3, '0')}`;
}

/**
 * Extract the three snipe segments from an arbitrary string (for smart paste). Any part
 * that isn't present comes back `null`, so the caller keeps the existing segment value.
 * Handles 24h and AM/PM, `.mmm`/`:mmm` ms, and dd-mm-yyyy / dd.mm.yyyy / yyyy-mm-dd dates.
 * @param {string} str
 * @returns {{ date: string|null, time: string|null, ms: number|null }}
 */
export function parseSnipeParts(str) {
  const out = { date: /** @type {string|null} */ (null), time: /** @type {string|null} */ (null), ms: /** @type {number|null} */ (null) };
  if (typeof str !== 'string') return out;
  const s = str.trim();
  if (!s) return out;

  const tm = s.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\s*(am|pm)?/i);
  if (tm) {
    let H = Number(tm[1]);
    const M = Number(tm[2]);
    const S = Number(tm[3]);
    const ap = tm[5]?.toLowerCase();
    if (ap === 'pm' && H < 12) H += 12;
    if (ap === 'am' && H === 12) H = 0;
    if (H <= 23 && M <= 59 && S <= 59) {
      out.time = `${pad2(H)}:${pad2(M)}:${pad2(S)}`;
      if (tm[4] != null) out.ms = Number(tm[4].padEnd(3, '0'));
    }
  }

  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const eu = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (iso) {
    out.date = `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  } else if (eu) {
    let y = Number(eu[3]);
    if (y < 100) y += 2000;
    out.date = `${y}-${pad2(Number(eu[2]))}-${pad2(Number(eu[1]))}`;
  }
  return out;
}

/**
 * Combine the three segments into a full arrival instant (epoch ms, ms-precise).
 * Empty date → today, rolling to tomorrow if the time already passed. Returns null if the
 * time segment is missing/invalid.
 * @param {{ date?: string, time?: string, ms?: string|number }} parts
 * @param {{ nowMs: number }} ctx
 * @returns {number|null}
 */
export function partsToArrivalMs(parts, ctx) {
  const timeStr = String(parts.time ?? '').trim();
  const tm = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!tm) return null;
  const H = Number(tm[1]);
  const M = Number(tm[2]);
  const S = Number(tm[3]);
  if (H > 23 || M > 59 || S > 59) return null;

  let msNum = parseInt(String(parts.ms ?? 0), 10);
  if (!Number.isFinite(msNum)) msNum = 0;
  msNum = Math.min(999, Math.max(0, msNum));

  const dateStr = String(parts.date ?? '').trim();
  if (dateStr) {
    const eu = dateStr.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);
    const iso = dateStr.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    let y;
    let mo;
    let d;
    if (eu) {
      d = Number(eu[1]);
      mo = Number(eu[2]);
      y = Number(eu[3]);
      if (y < 100) y += 2000;
    } else if (iso) {
      y = Number(iso[1]);
      mo = Number(iso[2]);
      d = Number(iso[3]);
    } else {
      return null;
    }
    const dt = new Date(y, mo - 1, d, H, M, S, msNum);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  // No date → today, rolling to tomorrow if already passed.
  const ref = new Date(ctx.nowMs);
  let dt = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), H, M, S, msNum);
  if (dt.getTime() <= ctx.nowMs) dt = new Date(dt.getTime() + 24 * 3600 * 1000);
  return dt.getTime();
}

/**
 * Tab-title countdown: coarse `Xm` / `HhMm` when more than 2 min out (per-second updates
 * aren't useful that far away and get throttled in a background tab anyway), switching to
 * precise `M:SS` inside the last 2 minutes.
 * @param {number} ms
 * @returns {string}
 */
export function formatTabCountdown(ms) {
  // ceil, not floor: during the final second there's still ~1s to wait, so it should read
  // "1", reaching 0 only exactly at send — never a premature "0" while you're still waiting.
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s <= 120) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const totalMin = Math.floor(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

/**
 * Format a positive duration (ms) as a countdown: `H:MM:SS`, or `MM:SS` under an hour.
 * Negatives clamp to 0. Used for the tab-title "Send in: …" countdown.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  // ceil so the last second reads "1", reaching 0 only exactly at the target (see above).
  let s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/**
 * Smart snipe-time parser (DESIGN.md §11, path 3). Accepts:
 *   - "HH:MM:SS"            time today (rolls to tomorrow if already past)
 *   - "HH:MM:SS.mmm"        with milliseconds
 *   - "HH:MM:SS:mmm"        TW-style ms separator
 *   - "vandaag om 15:50:29:838" / any prose — words ignored, digits parsed
 *   - "YYYY-MM-DD HH:MM:SS[.mmm]" or with 'T'  full date-time (no roll)
 *
 * Interpreted in LOCAL time (matches datetime-local + how the user reads the clock).
 * @param {string} input
 * @param {{ nowMs: number }} ctx  reference "now" (injected → pure/testable)
 * @returns {number|null} epoch ms, or null if unparseable
 */
export function parseSnipeTime(input, ctx) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  const hasFullDate = /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(s);
  const timeMatch = s.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?/);
  if (!timeMatch) return null;

  const [, hh, mm, ss, msRaw] = timeMatch;
  const ms = msRaw ? Number(msRaw.padEnd(3, '0')) : 0;
  const H = Number(hh);
  const M = Number(mm);
  const S = Number(ss);
  if (H > 23 || M > 59 || S > 59) return null;

  if (hasFullDate) {
    let year;
    let month;
    let day;
    const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else {
      // DD.MM.YYYY / DD/MM/YYYY (EU order — NL server default)
      const eu = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
      if (!eu) return null;
      day = Number(eu[1]);
      month = Number(eu[2]);
      year = Number(eu[3]);
      if (year < 100) year += 2000;
    }
    const dt = new Date(year, month - 1, day, H, M, S, ms);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  // Time-only: today, rolling to tomorrow if the instant has already passed.
  const ref = new Date(ctx.nowMs);
  let dt = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), H, M, S, ms);
  if (dt.getTime() <= ctx.nowMs) dt = new Date(dt.getTime() + 24 * 3600 * 1000);
  return dt.getTime();
}
