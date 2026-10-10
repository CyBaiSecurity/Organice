import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextDue } from '../../src/domain/repeat.ts';
import { addLocalDays, localDateKey } from '../../src/domain/time.ts';

const empty = {
  weekdays: null as number[] | null,
  monthDay: null as number | null,
  intervalDays: null as number | null,
};

test('daily returns the first slot after both the due instant and a late completion', () => {
  const dueAt = '2026-10-06T01:00:00.000Z';
  const completedAt = '2026-10-08T03:00:00.000Z';
  const due = new Date(dueAt);
  const completed = new Date(completedAt);
  let expected = new Date(due.getTime());
  let steps = 0;
  while (steps < 10) {
    expected = addLocalDays(expected, 1);
    steps += 1;
    if (expected.getTime() > due.getTime() && expected.getTime() > completed.getTime()) break;
  }
  const result = nextDue({
    dueAt,
    allDay: false,
    completedAt,
    kind: 'daily',
    ...empty,
  });
  const resultDate = new Date(result);
  assert.equal(result, expected.toISOString());
  assert.ok(resultDate.getTime() > due.getTime());
  assert.ok(resultDate.getTime() > completed.getTime());
  assert.equal(resultDate.getHours(), due.getHours());
  assert.equal(resultDate.getMinutes(), due.getMinutes());
  assert.equal(resultDate.getSeconds(), due.getSeconds());
  assert.notEqual(resultDate.getHours(), completed.getHours());
  assert.ok(steps > 1);
  const previous = addLocalDays(resultDate, -1);
  const previousIsAfterBoth =
    previous.getTime() > due.getTime() && previous.getTime() > completed.getTime();
  assert.equal(previousIsAfterBoth, false);
});

test('early completion of a daily task still moves at least one interval past the due', () => {
  const due = new Date(2026, 9, 6, 9, 0, 0, 0);
  const completed = new Date(2026, 9, 5, 12, 0, 0, 0);
  const result = nextDue({
    dueAt: due.toISOString(),
    allDay: false,
    completedAt: completed.toISOString(),
    kind: 'daily',
    ...empty,
  });
  assert.equal(result, new Date(2026, 9, 7, 9, 0, 0, 0).toISOString());
  assert.ok(new Date(result).getTime() > due.getTime());
});

test('weekly Monday and Wednesday lands on Wednesday of the same week', () => {
  const due = new Date(2026, 9, 5, 9, 0, 0, 0);
  const completed = new Date(2026, 9, 5, 10, 0, 0, 0);
  const result = nextDue({
    dueAt: due.toISOString(),
    allDay: false,
    completedAt: completed.toISOString(),
    kind: 'weekly',
    weekdays: [1, 3],
    monthDay: null,
    intervalDays: null,
  });
  assert.equal(result, new Date(2026, 9, 7, 9, 0, 0, 0).toISOString());
});

test('weekly with no weekdays repeats the due weekday', () => {
  const due = new Date(2026, 9, 5, 9, 0, 0, 0);
  const completed = new Date(2026, 9, 5, 10, 0, 0, 0);
  const result = nextDue({
    dueAt: due.toISOString(),
    allDay: false,
    completedAt: completed.toISOString(),
    kind: 'weekly',
    weekdays: [],
    monthDay: null,
    intervalDays: null,
  });
  assert.equal(result, new Date(2026, 9, 12, 9, 0, 0, 0).toISOString());
});

test('monthly keeps the 31st anchor across short months', () => {
  const january = new Date(2026, 0, 31, 9, 0, 0, 0);
  const february = new Date(2026, 1, 28, 10, 0, 0, 0);
  const march = nextDue({
    dueAt: january.toISOString(),
    allDay: false,
    completedAt: february.toISOString(),
    kind: 'monthly',
    weekdays: null,
    monthDay: 31,
    intervalDays: null,
  });
  assert.equal(march, new Date(2026, 2, 31, 9, 0, 0, 0).toISOString());

  const afterMarch = nextDue({
    dueAt: march,
    allDay: false,
    completedAt: new Date(2026, 2, 31, 9, 30, 0, 0).toISOString(),
    kind: 'monthly',
    weekdays: null,
    monthDay: 31,
    intervalDays: null,
  });
  assert.equal(afterMarch, new Date(2026, 3, 30, 9, 0, 0, 0).toISOString());

  const may = nextDue({
    dueAt: afterMarch,
    allDay: false,
    completedAt: new Date(2026, 3, 30, 10, 0, 0, 0).toISOString(),
    kind: 'monthly',
    weekdays: null,
    monthDay: 31,
    intervalDays: null,
  });
  assert.equal(may, new Date(2026, 4, 31, 9, 0, 0, 0).toISOString());
});

test('after completion keeps the completion clock N local days later', () => {
  const due = new Date(2026, 5, 1, 8, 0, 0, 0);
  const completed = new Date(2026, 5, 10, 14, 45, 0, 0);
  const result = nextDue({
    dueAt: due.toISOString(),
    allDay: false,
    completedAt: completed.toISOString(),
    kind: 'after_complete',
    weekdays: null,
    monthDay: null,
    intervalDays: 3,
  });
  const expected = new Date(2026, 5, 13, 14, 45, 0, 0);
  assert.equal(result, expected.toISOString());
  assert.equal(new Date(result).getHours(), completed.getHours());
  assert.equal(new Date(result).getMinutes(), completed.getMinutes());
});

test('all-day after completion stores a date key N local days later', () => {
  const completed = new Date(2026, 5, 10, 14, 45, 0, 0);
  const result = nextDue({
    dueAt: '2026-06-01',
    allDay: true,
    completedAt: completed.toISOString(),
    kind: 'after_complete',
    weekdays: null,
    monthDay: null,
    intervalDays: 3,
  });
  assert.equal(result, localDateKey(addLocalDays(completed, 3)));
});
