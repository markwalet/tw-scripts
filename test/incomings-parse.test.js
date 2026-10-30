import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEndtimeAttr,
  parseMsSubSpanText,
  combineArrivalMs,
  arrivalMsFromRowData,
  sendCellEndtimeSecs,
} from '../src/core/incomings-parse.js';

test('parseEndtimeAttr: parses a numeric string', () => {
  assert.equal(parseEndtimeAttr('1785000000'), 1785000000);
});

test('parseEndtimeAttr: parses an actual number too', () => {
  assert.equal(parseEndtimeAttr(1785000000), 1785000000);
});

test('parseEndtimeAttr: missing/garbage -> NaN', () => {
  assert.ok(Number.isNaN(parseEndtimeAttr(null)));
  assert.ok(Number.isNaN(parseEndtimeAttr(undefined)));
  assert.ok(Number.isNaN(parseEndtimeAttr('')));
  assert.ok(Number.isNaN(parseEndtimeAttr('not-a-number')));
});

test('parseMsSubSpanText: plain 3-digit text', () => {
  assert.equal(parseMsSubSpanText('838'), 838);
});

test('parseMsSubSpanText: zero-padded low value', () => {
  assert.equal(parseMsSubSpanText('083'), 83);
});

test('parseMsSubSpanText: strips stray colon/whitespace', () => {
  assert.equal(parseMsSubSpanText(':838'), 838);
  assert.equal(parseMsSubSpanText('  838  '), 838);
});

test('parseMsSubSpanText: missing/empty/non-numeric -> 0', () => {
  assert.equal(parseMsSubSpanText(null), 0);
  assert.equal(parseMsSubSpanText(undefined), 0);
  assert.equal(parseMsSubSpanText(''), 0);
  assert.equal(parseMsSubSpanText('grey small'), 0);
});

test('parseMsSubSpanText: clamps out-of-range values into 0..999', () => {
  assert.equal(parseMsSubSpanText('12345'), 999);
});

test('combineArrivalMs: seconds + ms combine to full precision', () => {
  assert.equal(combineArrivalMs(1000, 838), 1000838);
});

test('combineArrivalMs: NaN ms part degrades to :000 (second precision)', () => {
  assert.equal(combineArrivalMs(1000, NaN), 1000000);
});

test('combineArrivalMs: missing ms part (undefined) also degrades to :000', () => {
  assert.equal(combineArrivalMs(1000, undefined), 1000000);
});

test('combineArrivalMs: non-finite endtimeSecs propagates as NaN', () => {
  assert.ok(Number.isNaN(combineArrivalMs(NaN, 838)));
  assert.ok(Number.isNaN(combineArrivalMs(Infinity, 838)));
});

test('arrivalMsFromRowData: composes attribute + sub-span text end to end', () => {
  assert.equal(arrivalMsFromRowData('1000', '838'), 1000838);
});

test('arrivalMsFromRowData: missing ms sub-span still yields second precision', () => {
  assert.equal(arrivalMsFromRowData('1000', null), 1000000);
});

test('arrivalMsFromRowData: missing data-endtime -> NaN (row unusable)', () => {
  assert.ok(Number.isNaN(arrivalMsFromRowData(null, '838')));
});

test('sendCellEndtimeSecs: arrival minus duration, in epoch seconds', () => {
  assert.equal(sendCellEndtimeSecs(1_000_000, 400_000), 600);
});

test('sendCellEndtimeSecs: sub-second precision survives the /1000', () => {
  assert.equal(sendCellEndtimeSecs(1_000_838, 400_000), 600.838);
});

test('sendCellEndtimeSecs: can go negative (attack can no longer land in time)', () => {
  assert.equal(sendCellEndtimeSecs(1_000_000, 1_500_000), -500);
});

test('sendCellEndtimeSecs: missing duration treated as 0', () => {
  assert.equal(sendCellEndtimeSecs(1_000_000, NaN), 1000);
  assert.equal(sendCellEndtimeSecs(1_000_000, undefined), 1000);
});

test('sendCellEndtimeSecs: non-finite arrivalMs -> NaN', () => {
  assert.ok(Number.isNaN(sendCellEndtimeSecs(NaN, 400_000)));
});
