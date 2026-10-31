import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCard } from '../../src/package-planner/core/send.js';

const cost = [28000, 30000, 25000];
const transports = [
  { from: 10, to: 1, res: [28000, 30000, 0], merchants: 58, seconds: 100 },
  { from: 11, to: 1, res: [1000, 2000, 50000], merchants: 53, seconds: 500 },
  { from: 12, to: 2, res: [0, 0, 4000], merchants: 4, seconds: 100 },
];
const left = (entries) => new Map(entries.map((l) => [l.id, l]));
const plain = (r) => ({ ...r, transports: r.transports.map((t) => [t.from, t.res, t.merchants]) });

test('checkCard: nothing reported, or every source still has it -> the card as planned', () => {
  assert.deepEqual(plain(checkCard(transports, 1, new Map(), { cost, packages: 3 })), {
    transports: [[10, [28000, 30000, 0], 58], [11, [1000, 2000, 50000], 53]], short: [], mayShort: 0,
  });
  const plenty = left([{ id: 10, res: [28000, 30000, 0], merchants: 58 }, { id: 11, res: [9e5, 9e5, 9e5], merchants: 99 }]);
  assert.deepEqual(checkCard(transports, 1, plenty, { cost, packages: 3 }).short, []);
});

test('checkCard: a source short on a resource sends what it has, in whole merchant loads', () => {
  // 20,500 iron left -> 23,500 in all -> 23 whole loads: the 500 over comes off the largest share.
  const r = checkCard(transports, 1, left([{ id: 11, res: [1000, 2000, 20500], merchants: 53 }]), { cost, packages: 3 });
  assert.deepEqual(plain(r), {
    transports: [[10, [28000, 30000, 0], 58], [11, [1000, 2000, 20000], 23]], short: [11], mayShort: 2, // 30,000 iron less = 2 packages
  });
});

test('checkCard: a source short on merchants sends what they carry, largest share cut first', () => {
  const r = checkCard(transports, 1, left([{ id: 10, res: [9e5, 9e5, 9e5], merchants: 50 }]), { cost, packages: 1 });
  assert.deepEqual(plain(r).transports[0], [10, [28000, 22000, 0], 50]);
  assert.equal(r.mayShort, 1); // capped at the card's packages
});

test('checkCard: a source with less than one merchant load drops out; no source left = skip the card', () => {
  const r = checkCard(transports, 2, left([{ id: 12, res: [0, 0, 900], merchants: 4 }]), { cost, packages: 1 });
  assert.deepEqual(plain(r), { transports: [], short: [12], mayShort: 1 });
});

test('checkCard: packages that may be short = the most any one resource cut covers, not their sum', () => {
  // 10 is 1,000 wood and 1,000 clay short: one package short, not two.
  const r = checkCard(transports, 1, left([{ id: 10, res: [27000, 29000, 0], merchants: 58 }]), { cost, packages: 3 });
  assert.deepEqual(plain(r).transports[0], [10, [27000, 29000, 0], 56]);
  assert.equal(r.mayShort, 1);
});
