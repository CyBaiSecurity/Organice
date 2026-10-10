import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addLocalDays, parseLocalDateKey } from '../../src/domain/time.ts';
import {
  habitCsv,
  habitReport,
  scheduledDates,
  type HabitStatSource,
} from '../../src/domain/habitStats.ts';

const weekdayHabit: HabitStatSource = {
  id: 'h1',
  name: 'Read',
  kind: 'boolean',
  goal: null,
  unit: null,
  weekdays: '1,2,3,4,5',
  createdOn: '2026-10-05',
  archived: 0,
};

test('a weekday habit keeps only its due days in a seven-day strip', () => {
  const end = parseLocalDateKey('2026-10-10');
  const dates = Array.from({ length: 7 }, (_, index) => addLocalDays(end, index - 6));
  const shown = scheduledDates(dates, '1,2,3,4,5').map((date) => date.getDate());
  assert.deepEqual(shown, [5, 6, 7, 8, 9]);
});

test('the rate counts due days and ignores a check on a day off', () => {
  const [stat] = habitReport(
    [weekdayHabit],
    [
      { habitId: 'h1', localDate: '2026-10-05', value: 1 },
      { habitId: 'h1', localDate: '2026-10-07', value: 1 },
      { habitId: 'h1', localDate: '2026-10-10', value: 1 },
    ],
    '2026-10-10',
  );
  assert.equal(stat.due, 5);
  assert.equal(stat.met, 2);
  assert.deepEqual(
    stat.days.map((day) => day.label),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  );
  const current = stat.weeks[stat.weeks.length - 1];
  assert.equal(current.weekStart, '2026-10-05');
  assert.equal(current.due, 5);
  assert.equal(current.met, 2);
});

test('a count habit is met only when the value reaches the goal', () => {
  const [stat] = habitReport(
    [{ ...weekdayHabit, kind: 'count', goal: 10, unit: 'pages', weekdays: '1', createdOn: '2026-09-28' }],
    [
      { habitId: 'h1', localDate: '2026-10-05', value: 9 },
      { habitId: 'h1', localDate: '2026-09-28', value: 10 },
    ],
    '2026-10-10',
  );
  assert.equal(stat.due, 2);
  assert.equal(stat.met, 1);
});

test('the csv keeps missed due days, off-day checks, and quotes a comma in the name', () => {
  const csv = habitCsv(
    [{ ...weekdayHabit, name: 'Read, please', weekdays: '1' }],
    [{ habitId: 'h1', localDate: '2026-10-06', value: 1 }],
    '2026-10-06',
  );
  assert.match(csv.split('\n')[0], /^habit_id,name,kind,goal,unit,local_date,iso_weekday,scheduled,value,met$/);
  assert.match(csv, /"Read, please",boolean,,,2026-10-05,1,1,,0/);
  assert.match(csv, /"Read, please",boolean,,,2026-10-06,2,0,1,1/);
});
