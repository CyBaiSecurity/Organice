import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCheckDate, clampedCount, isDueOn, toggledBoolean } from '../../src/domain/habits.ts';

test('habit checks cannot move into the future', () => {
  assert.equal(canCheckDate('2026-10-08', '2026-10-08'), true);
  assert.equal(canCheckDate('2026-10-07', '2026-10-08'), true);
  assert.equal(canCheckDate('2026-10-09', '2026-10-08'), false);
});

test('a check is offered only on a weekday the habit is due', () => {
  const saturday = new Date(2026, 9, 10);
  assert.equal(isDueOn('1,2,3,4,5', saturday), false);
  assert.equal(isDueOn('6', saturday), true);
  assert.equal(isDueOn('1, 6', saturday), true);
});

test('boolean and count check-ins stay inside their ranges', () => {
  assert.equal(toggledBoolean(null), 1);
  assert.equal(toggledBoolean(0), 1);
  assert.equal(toggledBoolean(1), null);
  assert.equal(clampedCount(3.9), 3);
  assert.equal(clampedCount(-4), 0);
  assert.equal(clampedCount(10001), 10000);
  assert.equal(clampedCount(Number.NaN), 0);
});
