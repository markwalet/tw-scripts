import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore } from '../src/shared/settings-store.js';

/** Minimal in-memory Storage stand-in. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    raw: data,
  };
}

const store = createSettingsStore({
  name: 'demo',
  version: 2,
  defaults: () => ({ size: 3, nested: { a: 1, b: 2 } }),
  migrate: (raw, base) => ({
    ...base,
    ...raw,
    nested: { ...base.nested, ...(raw.nested || {}) },
    // v1 called it `count`
    size: typeof raw.size === 'number' ? raw.size : typeof raw.count === 'number' ? raw.count : base.size,
  }),
});

test('settings store: defaults carry the schema version', () => {
  assert.deepEqual(store.defaults(), { version: 2, size: 3, nested: { a: 1, b: 2 } });
});

test('settings store: load on an empty world returns defaults', () => {
  assert.deepEqual(store.load('nl1', memoryStorage()), store.defaults());
});

test('settings store: save then load round-trips, keyed per world', () => {
  const storage = memoryStorage();
  store.save('nl1', { ...store.defaults(), size: 9 }, storage);
  assert.equal(store.load('nl1', storage).size, 9);
  assert.equal(store.load('nl2', storage).size, 3, 'other world untouched');
  assert.ok(storage.raw.has('nl1demo'), 'key is <world><name>');
});

test('settings store: load runs the schema migration and stamps the current version', () => {
  const storage = memoryStorage({ nl1demo: JSON.stringify({ version: 1, count: 7, nested: { b: 5 } }) });
  const got = store.load('nl1', storage);
  assert.equal(got.size, 7);
  assert.deepEqual(got.nested, { a: 1, b: 5 });
  assert.equal(got.version, 2);
});

test('settings store: load falls back to defaults on corrupt JSON', () => {
  const storage = memoryStorage({ nl1demo: '{nope' });
  assert.deepEqual(store.load('nl1', storage), store.defaults());
});

test('settings store: storage must be passed in, the global localStorage is never read', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage({ nl1demo: JSON.stringify({ size: 9 }) }), configurable: true, writable: true });
  try {
    assert.throws(() => store.load('nl1'), TypeError);
    assert.throws(() => store.save('nl1', store.defaults()), TypeError);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
  }
});

test('settings store: export/import round-trips; import throws on malformed JSON', () => {
  const s = { ...store.defaults(), size: 4 };
  const json = store.exportJSON(s);
  assert.ok(json.includes('\n'), 'pretty-printed');
  assert.deepEqual(store.importJSON(json), s);
  assert.throws(() => store.importJSON('not json'), SyntaxError);
});
