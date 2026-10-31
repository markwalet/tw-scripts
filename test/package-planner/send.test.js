import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestPayload, transportPayload, fallbackRows, outcome } from '../../src/package-planner/core/send.js';

const transports = [
  { from: 10, to: 1, res: [28000, 30000, 0], merchants: 58, seconds: 100 },
  { from: 11, to: 1, res: [1000, 2000, 50000], merchants: 53, seconds: 500 },
  { from: 12, to: 2, res: [0, 0, 400], merchants: 1, seconds: 100 },
];

test('requestPayload: every planned source of one target in ONE request, all three resources each', () => {
  assert.deepEqual(requestPayload(transports, 1), {
    target_id: 0,
    'resource[10][wood]': 28000, 'resource[10][stone]': 30000, 'resource[10][iron]': 0,
    'resource[11][wood]': 1000, 'resource[11][stone]': 2000, 'resource[11][iron]': 50000,
  });
});

test('transportPayload: fallback "send" body for one transport (posted with village=<source>)', () => {
  assert.deepEqual(transportPayload(transports[1]), { target_id: 1, wood: 1000, stone: 2000, iron: 50000 });
});

test('fallbackRows: one row per transport of the targets not yet sent (or skipped), in card order, with names', () => {
  const places = new Map([[1, { name: 'North', x: 500, y: 500 }], [2, { name: 'South', x: 500, y: 520 }], [10, { name: 'Farm A', x: 501, y: 500 }]]);
  const rows = fallbackRows(transports, [2, 1], new Set([2]), places);
  assert.deepEqual(rows.map((r) => [r.key, r.from.name, r.to.name, r.t.merchants]), [
    ['10-1', 'Farm A', 'North', 58],
    ['11-1', '#11', 'North', 53],
  ]);
  assert.deepEqual(rows[0].from, { id: 10, name: 'Farm A', x: 501, y: 500 });
});

test('fallbackRows: checked against what the game last reported, with the user\'s limits', () => {
  // 11 has 20,500 iron above its reserve: trimmed to 23 loads; 12 has 300 iron: dropped.
  const left = new Map([[11, { id: 11, res: [1000, 2000, 25500], merchants: 53 }], [12, { id: 12, res: [0, 0, 300], merchants: 5 }]]);
  const rows = fallbackRows(transports, [1, 2], new Set(), new Map(), left, { reserve: [0, 0, 5000], keepMerchants: 0 });
  assert.deepEqual(rows.map((r) => [r.key, r.t.res, r.t.merchants]), [
    ['10-1', [28000, 30000, 0], 58],
    ['11-1', [1000, 2000, 20000], 23],
  ]);
});

/** Outcome without the raw answer / reported sources (send-outcome.test.js checks those). */
const brief = ({ left, raw, ...o }) => o;

test('outcome: success reads the message the game returns (response.success, else .message)', () => {
  assert.deepEqual(brief(outcome('success', { success: 'Resources requested' })), { ok: true, message: 'Resources requested' });
  assert.deepEqual(brief(outcome('success', { message: 'Sent' })), { ok: true, message: 'Sent' });
  assert.deepEqual(brief(outcome('success', undefined)), { ok: true, message: '' });
});

test('outcome: failures keep the game\'s message; no argument = bot protection; no answer = timeout', () => {
  assert.deepEqual(brief(outcome('error', 'Not enough merchants')), { ok: false, reason: 'game', message: 'Not enough merchants' });
  assert.deepEqual(brief(outcome('error', ['A', 'B'])), { ok: false, reason: 'game', message: 'A B' });
  assert.deepEqual(brief(outcome('error', undefined)), { ok: false, reason: 'botProtect', message: '' });
  // An HTTP error is not the game refusing this one card: it stops all sending.
  assert.deepEqual(brief(outcome('error', { status: 500 })), { ok: false, reason: 'http', message: 'HTTP 500' });
  assert.deepEqual(brief(outcome('timeout')), { ok: false, reason: 'timeout', message: '' });
  assert.deepEqual(brief(outcome('unavailable')), { ok: false, reason: 'unavailable', message: '' });
});
