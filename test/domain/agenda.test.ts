import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitAgenda, type AgendaItem } from '../../src/domain/agenda.ts';

function at(hour: number, minute = 0): string {
  return new Date(2026, 9, 8, hour, minute, 0, 0).toISOString();
}

function item(overrides: Partial<AgendaItem> & Pick<AgendaItem, 'id' | 'kind'>): AgendaItem {
  return {
    title: overrides.id,
    allDay: false,
    startAt: null,
    dueAt: null,
    ...overrides,
  };
}

test('splits overdue, all-day, and working-hours buckets without duplicating a task', () => {
  const now = new Date(2026, 9, 8, 12, 0, 0, 0);
  const overdueTask = item({
    id: 'overdue',
    kind: 'task',
    dueAt: new Date(2026, 9, 7, 18, 0, 0, 0).toISOString(),
    startAt: at(10),
  });
  const overdueAllDay = item({
    id: 'old-all-day',
    kind: 'task',
    allDay: true,
    dueAt: '2026-10-07',
  });
  const todayAllDay = item({
    id: 'today-all-day',
    kind: 'task',
    allDay: true,
    dueAt: '2026-10-08',
    startAt: at(10),
  });
  const allDayEvent = item({
    id: 'event-all-day',
    kind: 'event',
    allDay: true,
    dueAt: '2026-10-08',
  });
  const pastEvent = item({
    id: 'past-event',
    kind: 'event',
    startAt: new Date(2026, 9, 7, 10, 0, 0, 0).toISOString(),
  });
  const atEight = item({ id: 'eight', kind: 'task', dueAt: at(8) });
  const atNine = item({ id: 'nine', kind: 'event', startAt: at(9) });
  const atEleven = item({ id: 'eleven', kind: 'task', startAt: at(11), dueAt: at(18) });
  const atThree = item({ id: 'three', kind: 'task', dueAt: at(15) });
  const atFive = item({ id: 'five', kind: 'event', startAt: at(17) });
  const atEightPm = item({ id: 'evening', kind: 'task', dueAt: at(20) });
  const tomorrow = item({
    id: 'tomorrow',
    kind: 'task',
    dueAt: new Date(2026, 9, 9, 10, 0, 0, 0).toISOString(),
  });

  const result = splitAgenda({
    items: [
      atThree,
      overdueTask,
      allDayEvent,
      atEightPm,
      atEleven,
      todayAllDay,
      pastEvent,
      atFive,
      overdueAllDay,
      atNine,
      tomorrow,
      atEight,
    ],
    now,
    workStartMinute: 9 * 60,
    workEndMinute: 17 * 60,
  });

  assert.deepEqual(
    result.overdue.map((entry) => entry.id),
    ['overdue', 'old-all-day'],
  );
  assert.deepEqual(
    result.allDay.map((entry) => entry.id),
    ['event-all-day', 'today-all-day'],
  );
  assert.deepEqual(
    result.inside.map((entry) => entry.id),
    ['nine', 'eleven', 'three'],
  );
  assert.deepEqual(
    result.outside.map((entry) => entry.id),
    ['eight', 'five', 'evening'],
  );
  const seen = [...result.overdue, ...result.allDay, ...result.inside, ...result.outside];
  assert.equal(seen.filter((entry) => entry.id === 'overdue').length, 1);
  assert.equal(seen.filter((entry) => entry.id === 'past-event').length, 0);
  assert.equal(seen.filter((entry) => entry.id === 'tomorrow').length, 0);
});
