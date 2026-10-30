// Review audit of the SHIPPED planner (#13): bundles src/package-planner in memory with the
// real build options and checks the text reviewers will read — no host outside TribalWars,
// every request through the one throttled queue, the reviewer banner on top, not minified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerOptions } from '../../build.mjs';
import * as esbuild from 'esbuild';

const { outputFiles } = await esbuild.build({ ...plannerOptions, write: false });
const bundle = outputFiles[0].text;
const count = (re) => (bundle.match(re) || []).length;

test('bundle audit: no URL or host outside TribalWars', () => {
  assert.deepEqual(bundle.match(/\b(?:https?|wss?):\/\/|["'`]\/\/[\w.-]/g), null, 'absolute URL in the bundle');
  for (const api of ['XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'import(', 'eval(', 'new Function', '$.ajax', '$.get', '$.post', 'getScript']) {
    assert.ok(!bundle.includes(api), `uses ${api}`);
  }
  assert.ok(!/createElement\(["'](?:script|img|iframe|link)["']/.test(bundle), 'creates a loading element');
  // Every path it requests is the game itself: /game.php (incl. link_base_pure) or the world config.
  const paths = [...bundle.matchAll(/["'`](\/[a-z_]+\.php)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(paths)].sort(), ['/game.php', '/interface.php']);
});

test('bundle audit: one fetch and one TribalWars.post, both through the 200 ms queue', () => {
  assert.equal(count(/\bfetch\(/g), 1, 'fetch call sites');
  assert.equal(count(/TribalWars\.post\(/g), 1, 'TribalWars.post call sites');
  assert.equal(count(/queue\.add\(/g), 2, 'queued call sites (fetchText + postMarket)');
  const q = /createQueue\(\{([^}]*)\}\)/.exec(bundle.slice(bundle.indexOf('// src/package-planner/adapter/tw.js')));
  assert.ok(q, 'planner queue');
  assert.ok(+(/minIntervalMs:\s*(\d+)/.exec(q[1])?.[1] ?? 0) >= 200, `queue spacing >= 200 ms: ${q[1]}`);
});

test('bundle audit: reviewer banner on top, readable (not minified)', () => {
  const banner = bundle.slice(0, bundle.indexOf('"use strict"'));
  assert.ok(bundle.indexOf('"use strict"') > 0, 'strict mode');
  for (const s of ['Noble Package Planner', 'One click = one action', 'only when you click', 'read-only', '5 requests/s', 'No external calls']) {
    assert.ok(banner.includes(s), `banner mentions "${s}"`);
  }
  // One wrapper keeps every name out of the page scope; nothing module-only is left.
  assert.ok(banner.trimEnd().endsWith('(() => {') && bundle.trimEnd().endsWith('})();'), 'wrapped in one IIFE');
  assert.ok(!/^(?:import|export)\b|import\.meta|^await\b/m.test(bundle), 'no module syntax');
  new Function(bundle); // parses as a classic script
  const lines = bundle.split('\n');
  assert.ok(lines.length > 1000 && Math.max(...lines.map((l) => l.length)) < 400, 'one statement per line');
  assert.ok(!/@type\b/.test(bundle), 'no leftover JSDoc type casts');
});
