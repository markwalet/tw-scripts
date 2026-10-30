import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planView, hm, hms } from '../../src/package-planner/core/plan-view.js';

const names = new Map([
  [1, { name: 'North', x: 500, y: 500 }],
  [2, { name: 'South', x: 500, y: 520 }],
  [3, { name: 'Full', x: 510, y: 500 }],
  [10, { name: 'Farm A', x: 501, y: 500 }],
  [11, { name: 'Farm B', x: 505, y: 500 }],
  [12, { name: 'Farm C', x: 500, y: 521 }],
]);

const plan = {
  packages: 5,
  perAcademy: [{ id: 1, packages: 2 }, { id: 2, packages: 1 }, { id: 3, packages: 2 }],
  transports: [
    { from: 10, to: 1, res: [28000, 30000, 0], merchants: 58, seconds: 100 },
    { from: 11, to: 1, res: [28000, 30000, 50000], merchants: 108, seconds: 500 },
    { from: 12, to: 2, res: [0, 0, 400], merchants: 1, seconds: 100 },
  ],
  merchants: 167,
  longestSeconds: 500,
  resourceHours: 0,
};

test('planView: one card per target that gets transports, soonest last arrival first', () => {
  const view = planView(plan, names);
  assert.deepEqual(view.cards, [
    {
      id: 2, name: 'South', x: 500, y: 520, packages: 1,
      res: { wood: 0, stone: 0, iron: 400 }, sources: 1, merchants: 1,
      lastArrivalSeconds: 100, farthest: { id: 12, name: 'Farm C', x: 500, y: 521 },
    },
    {
      id: 1, name: 'North', x: 500, y: 500, packages: 2,
      res: { wood: 56000, stone: 60000, iron: 50000 }, sources: 2, merchants: 166,
      lastArrivalSeconds: 500, farthest: { id: 11, name: 'Farm B', x: 505, y: 500 },
    },
  ]);
});

test('planView: summary counts every package, also those that need no transport', () => {
  const view = planView(plan, names);
  assert.deepEqual(view.summary, { packages: 5, lastArrivalSeconds: 500, cards: 2, sent: 0 });
});

test('planView: empty plan -> no cards, nothing to wait for', () => {
  const view = planView({ packages: 0, perAcademy: [], transports: [], merchants: 0, longestSeconds: 0, resourceHours: 0 }, names);
  assert.deepEqual(view, { summary: { packages: 0, lastArrivalSeconds: 0, cards: 0, sent: 0 }, cards: [] });
});

test('hm / hms: durations the way the game shows them (h:mm cuts the seconds off)', () => {
  assert.equal(hms(100), '0:01:40');
  assert.equal(hms(1393), '0:23:13');
  assert.equal(hm(1393), '0:23');
  assert.equal(hm(3600), '1:00');
  assert.equal(hm(36059), '10:00');
  assert.equal(hms(90061), '25:01:01');
});
