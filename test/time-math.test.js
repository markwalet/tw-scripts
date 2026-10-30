import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendTimeMs,
  barFillPercent,
  isInGreenWindow,
  barViewModel,
  parseSnipeTime,
  msToDatetimeLocal,
  formatDuration,
  formatTabCountdown,
  parseSnipeParts,
  partsToArrivalMs,
  formatDatePart,
  formatTimePart,
  msPart,
  nudgeSegment,
} from '../src/core/time-math.js';

test('sendTimeMs subtracts duration', () => {
  assert.equal(sendTimeMs(10_000, 3_000), 7_000);
});

test('barFillPercent: on the goal ms → 0% just after, ~100% just before', () => {
  // exactly at goal → 0 distance → 0%
  assert.equal(barFillPercent(5_000, 0), 0);
  // 1ms before the next goal boundary → 99.9%
  assert.equal(barFillPercent(4_999, 0), 99.9);
});

test('barFillPercent never negative across the second boundary', () => {
  for (let ms = 0; ms < 1000; ms++) {
    const p = barFillPercent(ms, 500);
    assert.ok(p >= 0 && p <= 100, `percent out of range at ${ms}: ${p}`);
  }
});

test('isInGreenWindow: within the 1s before send, inclusive of send', () => {
  assert.equal(isInGreenWindow(9_500, 10_000), true);
  assert.equal(isInGreenWindow(10_000, 10_000), true);
  assert.equal(isInGreenWindow(10_001, 10_000), false); // past
  assert.equal(isInGreenWindow(8_999, 10_000), false); // too early
});

test('barViewModel idle when no target', () => {
  const vm = barViewModel(1234, null, 0);
  assert.equal(vm.state, 'idle');
});

test('parseSnipeTime: time-only rolls to tomorrow if passed', () => {
  const now = new Date(2026, 6, 24, 15, 0, 0).getTime(); // 24 Jul 2026 15:00:00
  const got = parseSnipeTime('14:00:00', { nowMs: now });
  const d = new Date(got);
  assert.equal(d.getDate(), 25); // rolled to next day
  assert.equal(d.getHours(), 14);
});

test('parseSnipeTime: keeps today when still upcoming, parses ms', () => {
  const now = new Date(2026, 6, 24, 15, 0, 0).getTime();
  const got = parseSnipeTime('15:50:29.838', { nowMs: now });
  const d = new Date(got);
  assert.equal(d.getDate(), 24);
  assert.equal(d.getMilliseconds(), 838);
});

test('parseSnipeTime: TW-style colon ms separator', () => {
  const now = new Date(2026, 6, 24, 15, 0, 0).getTime();
  const got = parseSnipeTime('vandaag om 15:50:29:838', { nowMs: now });
  assert.equal(new Date(got).getMilliseconds(), 838);
});

test('parseSnipeTime: full EU date (dd.mm.yyyy)', () => {
  const got = parseSnipeTime('25.12.2026 08:30:00', { nowMs: 0 });
  const d = new Date(got);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 11); // December
  assert.equal(d.getDate(), 25);
});

test('parseSnipeTime: ISO date', () => {
  const got = parseSnipeTime('2026-07-24T15:50:29.500', { nowMs: 0 });
  const d = new Date(got);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 24);
  assert.equal(d.getMilliseconds(), 500);
});

test('parseSnipeTime: garbage → null', () => {
  assert.equal(parseSnipeTime('not a time', { nowMs: 0 }), null);
  assert.equal(parseSnipeTime('', { nowMs: 0 }), null);
});

test('msToDatetimeLocal round-trips local wall-clock fields', () => {
  const ms = new Date(2026, 6, 24, 9, 5, 3).getTime();
  assert.equal(msToDatetimeLocal(ms), '2026-07-24T09:05:03');
});

test('formatDuration: MM:SS under an hour, H:MM:SS over', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(5_000), '00:05');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_661_000), '1:01:01');
});

test('formatDuration: negative clamps to 0; ceils so the last second shows 1, not 0', () => {
  assert.equal(formatDuration(-5_000), '00:00');
  assert.equal(formatDuration(0), '00:00'); // exactly at target
  assert.equal(formatDuration(1), '00:01'); // any positive remainder → at least 1
  assert.equal(formatDuration(1_000), '00:01');
  assert.equal(formatDuration(1_001), '00:02');
});

test('formatTabCountdown: precise under 2 min, coarse minutes/hours beyond', () => {
  assert.equal(formatTabCountdown(5_000), '0:05');
  assert.equal(formatTabCountdown(65_000), '1:05');
  assert.equal(formatTabCountdown(120_000), '2:00'); // boundary stays precise
  assert.equal(formatTabCountdown(121_000), '2m'); // just over → coarse
  assert.equal(formatTabCountdown(14 * 60_000), '14m');
  assert.equal(formatTabCountdown(3_600_000), '1h'); // exactly an hour, no trailing 0m
  assert.equal(formatTabCountdown(3_661_000), '1h1m');
});

test('parseSnipeParts: time only', () => {
  assert.deepEqual(parseSnipeParts('22:00:00'), { date: null, time: '22:00:00', ms: null });
});

test('parseSnipeParts: time with .ms and :ms', () => {
  assert.deepEqual(parseSnipeParts('15:50:29.838'), { date: null, time: '15:50:29', ms: 838 });
  assert.deepEqual(parseSnipeParts('vandaag om 15:50:29:838'), { date: null, time: '15:50:29', ms: 838 });
});

test('parseSnipeParts: full dates normalize to yyyy-mm-dd', () => {
  assert.equal(parseSnipeParts('2026-08-01 22:00:00').date, '2026-08-01');
  assert.equal(parseSnipeParts('01.08.2026 22:00:00').date, '2026-08-01');
  assert.equal(parseSnipeParts('1-8-26 09:05:03').date, '2026-08-01');
});

test('parseSnipeParts: AM/PM', () => {
  assert.equal(parseSnipeParts('9:52:00 PM').time, '21:52:00');
  assert.equal(parseSnipeParts('12:00:00 AM').time, '00:00:00');
});

test('parseSnipeParts: round-trips formatFull output (yyyy-mm-dd)', () => {
  const p = parseSnipeParts('2026-08-01 21:52:00.234');
  assert.deepEqual(p, { date: '2026-08-01', time: '21:52:00', ms: 234 });
});

test('partsToArrivalMs: date+time+ms → exact instant', () => {
  const got = partsToArrivalMs({ date: '25-12-2026', time: '08:30:00', ms: '500' }, { nowMs: 0 });
  const d = new Date(got);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 25);
  assert.equal(d.getMilliseconds(), 500);
});

test('partsToArrivalMs: empty date = today, rolls to tomorrow if passed', () => {
  const now = new Date(2026, 7, 1, 15, 0, 0).getTime();
  const got = partsToArrivalMs({ date: '', time: '14:00:00', ms: 0 }, { nowMs: now });
  assert.equal(new Date(got).getDate(), 2); // tomorrow
});

test('partsToArrivalMs: missing/invalid time → null', () => {
  assert.equal(partsToArrivalMs({ date: '01-08-2026', time: '', ms: 0 }, { nowMs: 0 }), null);
  assert.equal(partsToArrivalMs({ time: '99:00:00' }, { nowMs: 0 }), null);
});

test('partsToArrivalMs: ms clamps to 0..999', () => {
  assert.equal(msPart(partsToArrivalMs({ time: '10:00:00', ms: '5000' }, { nowMs: 0 })), 999);
  assert.equal(msPart(partsToArrivalMs({ time: '10:00:00', ms: '-3' }, { nowMs: 0 })), 0);
});

test('formatDatePart / formatTimePart / msPart', () => {
  const ms = new Date(2026, 7, 1, 21, 52, 3, 234).getTime();
  assert.equal(formatDatePart(ms), '2026-08-01');
  assert.equal(formatTimePart(ms), '21:52:03');
  assert.equal(msPart(ms), 234);
});

test('nudgeSegment time: nudges the sub-part under the caret', () => {
  // caret on hour (0-2)
  assert.equal(nudgeSegment('time', '10:20:30', 0, 1).value, '11:20:30');
  assert.equal(nudgeSegment('time', '10:20:30', 1, -1).value, '09:20:30');
  // caret on minute (3-5)
  assert.equal(nudgeSegment('time', '10:20:30', 4, 1).value, '10:21:30');
  // caret on second (6-8)
  assert.equal(nudgeSegment('time', '10:20:30', 7, 5).value, '10:20:35');
});

test('nudgeSegment time: each part wraps in range without carry', () => {
  assert.equal(nudgeSegment('time', '23:00:00', 0, 1).value, '00:00:00'); // hour 23→00
  assert.equal(nudgeSegment('time', '10:59:00', 4, 1).value, '10:00:00'); // minute 59→00
  assert.equal(nudgeSegment('time', '10:00:00', 7, -1).value, '10:00:59'); // second 0→59
});

test('nudgeSegment date: day/month/year by caret, day clamps to month length', () => {
  assert.equal(nudgeSegment('date', '01-08-2026', 0, 1).value, '02-08-2026'); // day
  assert.equal(nudgeSegment('date', '31-01-2026', 4, 1).value, '28-02-2026'); // month→Feb clamps 31→28
  assert.equal(nudgeSegment('date', '01-08-2026', 8, 1).value, '01-08-2027'); // year
  assert.equal(nudgeSegment('date', '31-12-2026', 4, 1).value, '31-01-2026'); // month 12→01 wraps
});

test('nudgeSegment ms: clamps 0..999', () => {
  assert.equal(nudgeSegment('ms', '998', 0, 5).value, '999');
  assert.equal(nudgeSegment('ms', '2', 0, -5).value, '0');
});

test('nudgeSegment: unparseable value returned unchanged', () => {
  assert.deepEqual(nudgeSegment('time', '', 0, 1), { value: '', caret: 0 });
  assert.deepEqual(nudgeSegment('date', 'xx', 0, 1), { value: 'xx', caret: 0 });
});
