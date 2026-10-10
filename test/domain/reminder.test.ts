import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reminderInstant } from '../../src/domain/reminder.ts';
import { localDateKey } from '../../src/domain/time.ts';

test('reminders are null without a due or an offset', () => {
  assert.equal(reminderInstant({ dueAt: null, allDay: false, offsetMinutes: 15 }), null);
  assert.equal(reminderInstant({ dueAt: '2026-10-08T07:00:00.000Z', allDay: false, offsetMinutes: null }), null);
});

test('an all-day reminder is 09:00 local and a timed reminder subtracts the offset', () => {
  const allDay = reminderInstant({ dueAt: '2026-10-08', allDay: true, offsetMinutes: 15 });
  assert.ok(allDay);
  assert.equal(localDateKey(allDay), '2026-10-08');
  assert.equal(allDay.getHours(), 9);
  assert.equal(allDay.getMinutes(), 0);
  const atNine = reminderInstant({ dueAt: '2026-10-08', allDay: true, offsetMinutes: 0 });
  assert.equal(atNine?.getTime(), allDay.getTime());

  const due = new Date(2026, 9, 8, 15, 0, 0, 0);
  const hourBefore = reminderInstant({
    dueAt: due.toISOString(),
    allDay: false,
    offsetMinutes: 60,
  });
  assert.equal(hourBefore?.toISOString(), new Date(2026, 9, 8, 14, 0, 0, 0).toISOString());
  const atDue = reminderInstant({ dueAt: due.toISOString(), allDay: false, offsetMinutes: 0 });
  assert.equal(atDue?.toISOString(), due.toISOString());
});
