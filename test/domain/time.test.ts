import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addLocalDays,
  atLocalMinutes,
  isDateKey,
  isoWeekday,
  localDateKey,
  monthGrid,
  minutesOfDay,
  notificationWeekday,
  nowIso,
  parseLocalDateKey,
  readDue,
  startOfLocalDay,
  storedDue,
} from '../../src/domain/time.ts';

test('nowIso uses the instant clock in UTC', () => {
  const date = new Date('2026-10-08T01:02:03.004Z');
  assert.equal(nowIso(date), '2026-10-08T01:02:03.004Z');
});

test('startOfLocalDay and addLocalDays keep the calendar clock', () => {
  const input = new Date(2026, 9, 8, 15, 45, 30, 12);
  const start = startOfLocalDay(input);
  assert.equal(input.getHours(), 15);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
  assert.equal(start.getDate(), 8);

  const next = addLocalDays(new Date(2026, 0, 31, 9, 30, 0, 0), 1);
  assert.equal(next.getMonth(), 1);
  assert.equal(next.getDate(), 1);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 30);
});

test('date keys round-trip through local midnight', () => {
  const key = '2026-10-08';
  const parsed = parseLocalDateKey(key);
  assert.equal(localDateKey(parsed), key);
  assert.equal(parsed.getHours(), 0);
  assert.equal(isDateKey(key), true);
  assert.equal(isDateKey('2026-10-8'), false);
  assert.equal(isDateKey('2026-10-08T00:00:00'), false);
});

test('a month grid and its week start on Sunday', () => {
  const grid = monthGrid(new Date(2026, 9, 15));
  assert.equal(grid.length, 42);
  assert.equal(localDateKey(grid[0] as Date), '2026-09-27');
  assert.equal(grid[0]?.getDay(), 0);
  assert.equal(localDateKey(grid[4] as Date), '2026-10-01');
  assert.equal(grid[6]?.getDay(), 6);
});

test('ISO weekdays convert to Expo notification weekdays', () => {
  const monday = new Date(2026, 9, 5, 9, 0, 0, 0);
  const sunday = new Date(2026, 9, 4, 9, 0, 0, 0);
  assert.equal(isoWeekday(monday), 1);
  assert.equal(isoWeekday(sunday), 7);
  assert.equal(notificationWeekday(1), 2);
  assert.equal(notificationWeekday(7), 1);
  assert.equal(notificationWeekday(6), 7);
});

test('minutes roll into the next local day', () => {
  const day = new Date(2026, 9, 8, 15, 45, 0, 0);
  const snapshot = day.getTime();
  assert.equal(minutesOfDay(day), 15 * 60 + 45);
  const rolled = atLocalMinutes(day, 1500);
  assert.equal(day.getTime(), snapshot);
  assert.equal(rolled.getDate(), 9);
  assert.equal(rolled.getHours(), 1);
  assert.equal(rolled.getMinutes(), 0);
});

test('stored due keeps a date key for all-day and an ISO instant otherwise', () => {
  const date = new Date(2026, 9, 8, 23, 30, 0, 0);
  assert.equal(storedDue(date, true), '2026-10-08');
  assert.equal(storedDue(date, false), date.toISOString());
  const allDay = readDue('2026-10-08T15:00:00.000Z', true);
  assert.equal(localDateKey(allDay), '2026-10-08');
  assert.equal(allDay.getHours(), 0);
  const timed = readDue('2026-10-06T01:00:00.000Z', false);
  assert.equal(timed.toISOString(), '2026-10-06T01:00:00.000Z');
});
