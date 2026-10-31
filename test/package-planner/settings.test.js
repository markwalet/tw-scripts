import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsStore, solverOptions, readForm, formFields, settingsLine } from '../../src/package-planner/core/settings.js';
import { makeTranslator } from '../../src/package-planner/core/i18n.js';
import { solve } from '../../src/package-planner/core/solver.js';

// One empty academy (100k warehouse) and one source 5 fields away (1800 s at speed 1)
// holding exactly 3 packages, with 83 merchants per package.
const world = {
  villages: [
    { id: 1, x: 500, y: 500, res: [0, 0, 0], storage: 100000, merchants: 0, academy: true },
    { id: 2, x: 503, y: 504, res: [84000, 90000, 75000], storage: 400000, merchants: 249, academy: false },
  ],
};
const packagesWith = (change) => solve(world, solverOptions({ ...settingsStore.defaults(), ...change })).packages;

test('planner settings: the edit form reads what players type', () => {
  const current = settingsStore.defaults();
  const { settings, invalid } = readForm(
    { maxTravel: '3:00', wood: '10.000', stone: '5000', iron: '', keepMerchants: '12', bufferPct: '2,5', countProduction: '1', nobles: '', senderGroup: '0', receiverGroup: '0' },
    current,
  );
  assert.deepEqual(invalid, []);
  assert.deepEqual(settings, {
    version: 1, maxTravelSeconds: 10800, reserve: [10000, 5000, 0], keepMerchants: 12, bufferPct: 2.5, countProduction: true, nobles: null, senderGroup: 0, receiverGroup: 0, groups: [],
  });
  assert.equal(readForm({ ...formFields(current), maxTravel: '1:30:15' }, current).settings.maxTravelSeconds, 5415);
  assert.equal(readForm({ ...formFields(current), maxTravel: '' }, current).settings.maxTravelSeconds, null, 'empty = no limit');
});

test('planner settings: a field that does not parse keeps its value and is reported', () => {
  const current = { ...settingsStore.defaults(), maxTravelSeconds: 3600, keepMerchants: 4 };
  const { settings, invalid } = readForm({ ...formFields(current), maxTravel: '3:75', keepMerchants: 'many', bufferPct: '-1' }, current);
  assert.deepEqual(invalid, ['maxTravel', 'keepMerchants', 'bufferPct']);
  assert.deepEqual(settings, current);
});

test('planner settings: form fields show the current settings', () => {
  const s = { ...settingsStore.defaults(), maxTravelSeconds: 10800, reserve: [10000, 0, 500], keepMerchants: 3 };
  assert.deepEqual(formFields(s), {
    maxTravel: '3:00', wood: '10000', stone: '0', iron: '500', keepMerchants: '3', bufferPct: '2', countProduction: '1', nobles: '', senderGroup: '0', receiverGroup: '0',
  });
  assert.equal(formFields(settingsStore.defaults()).maxTravel, '');
});

test('planner settings: the collapsed line', () => {
  const t = makeTranslator('en');
  assert.equal(settingsLine(settingsStore.defaults(), t), 'No travel limit · reserve 0/0/0 · keep 0 merchants · buffer 2% · All → All');
  const s = { ...settingsStore.defaults(), maxTravelSeconds: 10800, reserve: [10000, 0, 500], keepMerchants: 1, bufferPct: 2.5 };
  assert.equal(settingsLine(s, t), 'Max 3:00 · reserve 10.000/0/500 · keep 1 merchant · buffer 2.5% · All → All');
});

test('planner settings: defaults plan every package the warehouse fits', () => {
  assert.equal(packagesWith({}), 3);
});

test('planner settings: max travel time shorter than the trip -> no packages', () => {
  assert.equal(packagesWith({ maxTravelSeconds: 1800 }), 3);
  assert.equal(packagesWith({ maxTravelSeconds: 1799 }), 0);
});

test('planner settings: a reserve stays in the sender', () => {
  assert.equal(packagesWith({ reserve: [0, 1, 0] }), 2);
});

test('planner settings: merchants kept home are not used', () => {
  assert.equal(packagesWith({ keepMerchants: 1 }), 2);
});

test('planner settings: the warehouse buffer leaves room free at the academy', () => {
  // 3 packages = 90k clay; a 10% buffer leaves 90k room, 11% only 89k.
  assert.equal(packagesWith({ bufferPct: 10 }), 3);
  assert.equal(packagesWith({ bufferPct: 11 }), 2);
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), raw: data };
}

test('planner settings: defaults per DESIGN §6, saved per world', () => {
  const storage = memoryStorage();
  assert.deepEqual(settingsStore.load('en150', storage), {
    version: 1, maxTravelSeconds: null, reserve: [0, 0, 0], keepMerchants: 0, bufferPct: 2, countProduction: true, nobles: null, senderGroup: 0, receiverGroup: 0, groups: [],
  });
  settingsStore.save('en150', { ...settingsStore.defaults(), keepMerchants: 5 }, storage);
  assert.ok(storage.raw.has('en150pp_settings'));
  assert.equal(settingsStore.load('en150', storage).keepMerchants, 5);
  assert.equal(settingsStore.load('en151', storage).keepMerchants, 0);
});

test('planner settings: migration keeps valid stored values and replaces broken or missing ones', () => {
  const storage = memoryStorage({
    en150pp_settings: JSON.stringify({ version: 0, maxTravelSeconds: 7200, reserve: [5000, 'x', -1], keepMerchants: -3, bufferPct: 'lots' }),
  });
  assert.deepEqual(settingsStore.load('en150', storage), {
    version: 1, maxTravelSeconds: 7200, reserve: [5000, 0, 0], keepMerchants: 0, bufferPct: 2, countProduction: true, nobles: null, senderGroup: 0, receiverGroup: 0, groups: [],
  });
  assert.equal(settingsStore.migrate({ maxTravelSeconds: 0 }).maxTravelSeconds, null, '0 = no limit');
  assert.deepEqual(settingsStore.migrate({ reserve: 'nope' }).reserve, [0, 0, 0]);
});

test('planner settings: sender and receiver group (0 = All) and the known group list are saved', () => {
  const d = settingsStore.defaults();
  assert.deepEqual([d.senderGroup, d.receiverGroup, d.groups], [0, 0, []]);
  const groups = [[5267, 'Noble'], [6225, 'Academy']];
  const s = settingsStore.migrate({ senderGroup: 5267, receiverGroup: 6225, groups: [...groups, [-1, 'x'], 'bad', [7, 3]] });
  assert.deepEqual([s.senderGroup, s.receiverGroup, s.groups], [5267, 6225, groups]);
  const broken = settingsStore.migrate({ senderGroup: 'x', receiverGroup: -4, groups: 'nope' });
  assert.deepEqual([broken.senderGroup, broken.receiverGroup, broken.groups], [0, 0, []]);
});

test('planner settings: the group dropdowns and the collapsed line', () => {
  const t = makeTranslator('en');
  const current = { ...settingsStore.defaults(), groups: [[5267, 'Noble'], [6225, 'Academy']] };
  const { settings, invalid } = readForm({ ...formFields(current), senderGroup: '5267', receiverGroup: '0' }, current);
  assert.deepEqual(invalid, []);
  assert.deepEqual([settings.senderGroup, settings.receiverGroup], [5267, 0]);
  assert.deepEqual([formFields(settings).senderGroup, formFields(settings).receiverGroup], ['5267', '0']);
  assert.match(settingsLine(settings, t), / · Noble → All$/);
  assert.match(settingsLine({ ...settings, receiverGroup: 99 }, t), / · Noble → #99$/, 'a group no longer in the list');
});

test('planner settings: the noble target caps the plan at the packages still missing', () => {
  const s = { ...settingsStore.defaults(), nobles: 1 };
  assert.equal(solve(world, solverOptions(s, 2)).packages, 2);
  assert.equal(solve(world, solverOptions(s, 0)).packages, 0);
  assert.equal(solve(world, solverOptions(s, 9)).packages, 3);
});

test('planner settings: count production until arrival, default on, named in the line when off', () => {
  const d = settingsStore.defaults();
  assert.equal(d.countProduction, true);
  assert.equal(solverOptions(d).countProduction, true);
  assert.equal(settingsStore.migrate({}).countProduction, true, 'stored before the setting existed');
  assert.equal(settingsStore.migrate({ countProduction: false }).countProduction, false);
  assert.equal(settingsStore.migrate({ countProduction: 'no' }).countProduction, true);
  assert.equal(formFields(d).countProduction, '1');
  const off = readForm({ ...formFields(d), countProduction: '' }, d).settings;
  assert.equal(off.countProduction, false);
  assert.equal(formFields(off).countProduction, '');
  assert.equal(solverOptions(off).countProduction, false);
  const t = makeTranslator('en');
  assert.equal(settingsLine(d, t), 'No travel limit · reserve 0/0/0 · keep 0 merchants · buffer 2% · All → All');
  assert.equal(settingsLine(off, t), 'No travel limit · reserve 0/0/0 · keep 0 merchants · buffer 2% · All → All · target production not counted');
});

test('planner settings: collect for X new nobles (empty = as many as possible)', () => {
  const current = settingsStore.defaults();
  assert.equal(current.nobles, null);
  const read = (nobles) => readForm({ ...formFields(current), nobles }, current);
  assert.equal(read('5').settings.nobles, 5);
  assert.equal(read('').settings.nobles, null);
  assert.equal(read('0').settings.nobles, null);
  assert.deepEqual(read('a few').invalid, ['nobles']);
  assert.equal(formFields(current).nobles, '');
  assert.equal(formFields({ ...current, nobles: 5 }).nobles, '5');
  const t = makeTranslator('en');
  assert.equal(settingsLine({ ...current, nobles: 5 }, t), 'No travel limit · reserve 0/0/0 · keep 0 merchants · buffer 2% · All → All · nobles: 5');
  assert.equal(settingsStore.migrate({ nobles: 3 }).nobles, 3);
  assert.equal(settingsStore.migrate({ nobles: 0 }).nobles, null);
  assert.equal(settingsStore.migrate({ nobles: 'x' }).nobles, null);
});
