import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestPayload, transportPayload, fallbackRows, leftAfter, outcome } from '../../src/package-planner/core/send.js';

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

test('fallbackRows: one row per transport into the failed target, in plan order, with names', () => {
  const places = new Map([[1, { name: 'North', x: 500, y: 500 }], [2, { name: 'South', x: 500, y: 520 }], [10, { name: 'Farm A', x: 501, y: 500 }]]);
  const rows = fallbackRows(transports, 1, places);
  assert.deepEqual(rows.map((r) => [r.key, r.from.name, r.to.name, r.t.merchants]), [
    ['10-1', 'Farm A', 'North', 58],
    ['11-1', '#11', 'North', 53],
  ]);
  assert.deepEqual(rows[0].from, { id: 10, name: 'Farm A', x: 501, y: 500 });
});

test('fallbackRows: checked against what the game last reported, with the user\'s limits', () => {
  // 11 has 20,500 iron above its reserve: trimmed to 23 loads; 12 has 300 iron: dropped.
  const left = new Map([[11, { id: 11, res: [1000, 2000, 25500], merchants: 53 }], [12, { id: 12, res: [0, 0, 300], merchants: 5 }]]);
  const limits = { reserve: [0, 0, 5000], keepMerchants: 0 };
  assert.deepEqual(fallbackRows(transports, 1, new Map(), left, limits).map((r) => [r.key, r.t.res, r.t.merchants]), [
    ['10-1', [28000, 30000, 0], 58],
    ['11-1', [1000, 2000, 20000], 23],
  ]);
  assert.deepEqual(fallbackRows(transports, 2, new Map(), left, limits), []);
});

test('leftAfter: a source the answer reports keeps the game\'s numbers', () => {
  const reported = [{ id: 10, res: [100, 200, 300], merchants: 4 }];
  assert.deepEqual(leftAfter([transports[0]], reported, new Map(), new Map()), reported);
});

test('leftAfter: an answer without numbers (map_send) subtracts what was sent from the last report', () => {
  const left = new Map([[11, { id: 11, res: [5000, 6000, 60000], merchants: 60 }]]);
  assert.deepEqual(leftAfter([transports[1]], [], left, new Map()), [{ id: 11, res: [4000, 4000, 10000], merchants: 7 }]);
});

test('leftAfter: never reported = the overview snapshot minus what was sent; no numbers at all = nothing known', () => {
  const snapshot = new Map([[10, { wood: 30000, stone: 30500, iron: 7, merchantsAvailable: 60 }]]);
  assert.deepEqual(leftAfter([transports[0], transports[2]], [], new Map(), snapshot), [{ id: 10, res: [2000, 500, 7], merchants: 2 }]);
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
  // Several errors come as an HTML list: plain text, items joined.
  assert.deepEqual(brief(outcome('error', '<ul><li>Not enough wood</li><li class="x">Not enough <b>clay</b> &amp; iron</li></ul>')),
    { ok: false, reason: 'game', message: 'Not enough wood · Not enough clay & iron' });
  assert.equal(outcome('error', 'a &lt;script&gt; b').message, 'a <script> b');
  assert.deepEqual(brief(outcome('error', undefined)), { ok: false, reason: 'botProtect', message: '' });
  // An HTTP error is not the game refusing this one card: it stops all sending.
  assert.deepEqual(brief(outcome('error', { status: 500 })), { ok: false, reason: 'http', message: 'HTTP 500' });
  assert.deepEqual(brief(outcome('timeout')), { ok: false, reason: 'timeout', message: '' });
  assert.deepEqual(brief(outcome('unavailable')), { ok: false, reason: 'unavailable', message: '' });
});
