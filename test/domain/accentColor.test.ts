import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAPER, accentColor, accentInk } from '../../src/theme/palette.ts';

test('a known list accent keeps its color, and an unknown name falls back to ink', () => {
  assert.equal(accentColor('pine'), '#1F6B4A');
  assert.equal(accentColor('clay'), '#A15C38');
  assert.equal(accentColor('nope'), '#1F4E79');
});

test('a dark sheet uses the lighter accent so the list name stays readable', () => {
  assert.equal(accentInk('pine', PAPER.light), '#1F6B4A');
  assert.equal(accentInk('pine', PAPER.dark), '#8FCBAA');
  assert.equal(accentInk('amber', PAPER.dark), '#F0C36A');
  assert.equal(accentInk('missing', PAPER.dark), '#9BB8D4');
});
