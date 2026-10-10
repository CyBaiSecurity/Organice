import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAPER, priorityColor, taskInk } from '../../src/theme/palette.ts';

test('priority 0 keeps the normal ink, and 1, 2, 3 are low, medium, high', () => {
  assert.equal(priorityColor(0, '#000000'), '#000000');
  assert.equal(priorityColor(1, '#000000'), '#1F6B4A');
  assert.equal(priorityColor(2, '#000000'), '#8A5A00');
  assert.equal(priorityColor(3, '#000000'), '#9B2C2C');
  assert.equal(priorityColor(9, '#111111'), '#111111');
});

test('a dark sheet uses the lighter priority colors so the title stays readable', () => {
  assert.equal(taskInk(0, PAPER.light), PAPER.light.text);
  assert.equal(taskInk(1, PAPER.light), '#1F6B4A');
  assert.equal(taskInk(2, PAPER.light), '#8A5A00');
  assert.equal(taskInk(3, PAPER.light), '#9B2C2C');
  assert.equal(taskInk(0, PAPER.dark), PAPER.dark.text);
  assert.equal(taskInk(1, PAPER.dark), '#8FCBAA');
  assert.equal(taskInk(2, PAPER.dark), '#F0C36A');
  assert.equal(taskInk(3, PAPER.dark), '#F0A0A0');
});
