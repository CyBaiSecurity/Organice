import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snoozedAt } from '../../src/domain/snooze.ts';

test('snooze moves the reminder and does not change a due date', () => {
  const due = new Date(2026, 9, 8, 15, 0, 0, 0);
  const dueSnapshot = due.getTime();
  const now = new Date(2026, 9, 8, 18, 0, 0, 0);
  assert.equal(snoozedAt('10m', now, 9 * 60).getTime(), now.getTime() + 10 * 60 * 1000);
  assert.equal(snoozedAt('1h', now, 9 * 60).getTime(), now.getTime() + 60 * 60 * 1000);
  const tomorrow = snoozedAt('tomorrow', now, 9 * 60);
  assert.equal(tomorrow.getTime(), new Date(2026, 9, 9, 9, 0, 0, 0).getTime());
  assert.equal(due.getTime(), dueSnapshot);
});
