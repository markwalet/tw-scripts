import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSitter } from '../../src/package-planner/core/urls.js';

const prod = '/game.php?village=2001&screen=overview_villages&mode=prod&group=0&page=-1';

test('withSitter: not sitting -> URL unchanged (sitter "0", as game_data has it)', () => {
  assert.equal(withSitter(prod, { id: 1, sitter: '0' }), prod);
  assert.equal(withSitter(prod, {}), prod);
});

test('withSitter: sitting -> &t=<player id> appended', () => {
  assert.equal(withSitter(prod, { id: 848, sitter: '12' }), `${prod}&t=848`);
});

test('withSitter: never adds t twice (TW base links may already carry it)', () => {
  assert.equal(withSitter(`${prod}&t=848`, { id: 848, sitter: '12' }), `${prod}&t=848`);
});

test('withSitter: URL without a query string gets ?t=', () => {
  assert.equal(withSitter('/interface.php', { id: 848, sitter: 12 }), '/interface.php?t=848');
  assert.equal(withSitter('/interface.php?func=get_config', { id: 848, sitter: 12 }), '/interface.php?func=get_config&t=848');
});
