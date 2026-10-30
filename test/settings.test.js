import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, exportJSON, importJSON } from '../src/core/settings.js';

test('exportJSON produces pretty-printed JSON that parses back to the same object', () => {
  const settings = defaults();
  const json = exportJSON(settings);
  assert.equal(typeof json, 'string');
  assert.ok(json.includes('\n'), 'expected pretty-printed (multi-line) output');
  assert.deepEqual(JSON.parse(json), settings);
});

test('exportJSON -> importJSON round-trips a full settings object', () => {
  const settings = {
    ...defaults(),
    tabTitle: false,
    language: 'nl',
    colors: { ...defaults().colors, waiting: '#123456' },
    cues: { ...defaults().cues, enabled: false, volume: 0.75 },
  };
  const got = importJSON(exportJSON(settings));
  assert.deepEqual(got, settings);
});

test('importJSON throws (does not swallow) on malformed JSON', () => {
  assert.throws(() => importJSON('not json'), SyntaxError);
  assert.throws(() => importJSON('{oops:'), SyntaxError);
});

test('importJSON runs migrate: an object missing groups comes back with defaults filled', () => {
  const got = importJSON(JSON.stringify({ version: 1, tabTitle: false }));
  assert.deepEqual(got.colors, defaults().colors);
  assert.deepEqual(got.cues, defaults().cues);
  assert.equal(got.tabTitle, false);
  assert.equal(got.version, defaults().version);
});

test('importJSON on JSON null falls back to defaults, same as migrate(null)', () => {
  assert.deepEqual(importJSON('null'), migrate(null));
  assert.deepEqual(importJSON('null'), defaults());
});

test('migrate maps the old cues.master flag onto the new cues.enabled', () => {
  const off = migrate({ cues: { master: false, sendBeeps: true, volume: 0.3 } });
  assert.deepEqual(off.cues, { enabled: false, volume: 0.3 });
  const on = migrate({ cues: { master: true } });
  assert.equal(on.cues.enabled, true);
});
