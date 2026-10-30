import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcome } from '../../src/package-planner/core/send.js';

// Verified live shape (enc1): traders_free is a number, traders_total a string.
const shipped = {
  success: 'The resources were shipped',
  transport_info: [
    { village_id: 10, resources_left: { wood: 28393, stone: 75059, iron: 5073 }, needed_trader_capacity: 1000, traders_total: '19', traders_free: 18 },
    { village_id: '11', resources_left: { wood: '0', stone: 12, iron: null }, traders_free: '3' },
    { resources_left: { wood: 1 } }, // no village id: ignored
  ],
};

test('outcome: success keeps what the game reports per source (resources left, free merchants)', () => {
  assert.deepEqual(outcome('success', shipped).left, [
    { id: 10, res: [28393, 75059, 5073], merchants: 18 },
    { id: 11, res: [0, 12, 0], merchants: 3 },
  ]);
  assert.deepEqual(outcome('success', { success: 'ok' }).left, []);
});

test('outcome: a failure keeps the raw answer (the game\'s message, or the HTTP status)', () => {
  assert.equal(outcome('error', 'Not enough resources available').raw, 'Not enough resources available');
  assert.deepEqual(outcome('error', { status: 503, responseText: 'x'.repeat(5000) }).raw, { status: 503 });
  assert.equal(outcome('timeout').raw, null);
});
