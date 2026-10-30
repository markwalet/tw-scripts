import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, findAll, find, textOf, is, intOf } from '../src/shared/html.js';

test('parseHtml: unclosed td/tr are closed by the next one (HTML table rules)', () => {
  const root = parseHtml('<table><tr><td>1<td>2<tr><td>3</table>');
  const rows = findAll(root, is({ tag: 'tr' }));
  assert.deepEqual(rows.map((r) => findAll(r, is({ tag: 'td' })).map(textOf)), [['1', '2'], ['3']]);
});

test('parseHtml: nested tables keep their own rows', () => {
  const root = parseHtml('<table id="a"><tr><td><table><tr><td>in</td></tr></table></td><td>out</td></tr></table>');
  const outer = find(root, is({ id: 'a' }));
  const outerRow = outer && find(outer, is({ tag: 'tr' }));
  assert.deepEqual(outerRow?.children.map((c) => textOf(c)), ['in', 'out']);
});

test('parseHtml: script bodies are raw text, entities are decoded, quoted ">" stays in attributes', () => {
  const root = parseHtml('<script>if (a < b) { x = "<td>"; }</script><a href="?a=1&amp;b=2" title="x > y">&lt;all&gt;&nbsp;</a>');
  assert.equal(findAll(root, is({ tag: 'td' })).length, 0);
  const a = find(root, is({ tag: 'a' }));
  assert.equal(a?.attrs.href, '?a=1&b=2');
  assert.equal(a?.attrs.title, 'x > y');
  assert.equal(a && textOf(a), '<all> ');
});

test('intOf: every digit counts, thousands separators of any locale', () => {
  assert.equal(intOf('2.016.000'), 2016000);
  assert.equal(intOf('2,016,000'), 2016000);
  assert.ok(Number.isNaN(intOf('')));
});

test('parseHtml: many raw-text tags in a large page stay linear (no per-tag lowercase of the page)', () => {
  const pad = 'x'.repeat(400);
  const page = Array.from({ length: 4000 }, (_, k) => `<p>${pad}</p><SCRIPT>var a${k} = 1;</Script>`).join('');
  const t0 = performance.now();
  const scripts = findAll(parseHtml(page), is({ tag: 'script' }));
  const ms = performance.now() - t0;
  assert.equal(scripts.length, 4000);
  assert.equal(textOf(scripts[3999]), 'var a3999 = 1;');
  assert.ok(ms < 500, `parse took ${Math.round(ms)} ms`);
});
