import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOME_LATE_ESSENTIALS,
  NO_DAY_OVERRIDES,
  REMINDER_HORIZON_DAYS,
  REVIEW_PROMPTS,
  ROUTINE_TEMPLATE,
  SHORT_WORK_TITLE,
  addDateDays,
  assertClockWindow,
  dateKeyWeekday,
  deriveDay,
  formatWeekdays,
  occurrenceIsEarlier,
  isRealDateKey,
  manilaDateKey,
  manilaInstant,
  manilaMinuteOfDay,
  manilaWeekday,
  previewRoutineTemplate,
  reminderOccurrences,
  weekEndingSunday,
  type DayOverrides,
  type DayPlan,
  type Occurrence,
  type RoutineBlockView,
} from '../../src/domain/routine.ts';

const MONDAY = '2026-11-09';
const TUESDAY = '2026-11-10';
const WEDNESDAY = '2026-11-11';
const THURSDAY = '2026-11-12';
const FRIDAY = '2026-11-13';
const SATURDAY = '2026-11-14';
const SUNDAY = '2026-11-15';

test('Manila clock ignores the machine timezone', () => {
  assert.equal(manilaDateKey(new Date('2026-11-09T15:59:00.000Z')), MONDAY);
  assert.equal(manilaMinuteOfDay(new Date('2026-11-09T15:59:00.000Z')), 23 * 60 + 59);
  assert.equal(manilaWeekday(new Date('2026-11-09T15:59:00.000Z')), 1);
  assert.equal(manilaDateKey(new Date('2026-11-09T16:00:00.000Z')), TUESDAY);
  assert.equal(manilaMinuteOfDay(new Date('2026-11-09T16:00:00.000Z')), 0);
  assert.equal(manilaWeekday(new Date('2026-11-09T16:00:00.000Z')), 2);
  assert.equal(manilaInstant(MONDAY, 6 * 60 + 30).toISOString(), '2026-11-08T22:30:00.000Z');
  assert.equal(addDateDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDateDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDateDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isRealDateKey('2024-02-29'), true);
  assert.equal(isRealDateKey('2026-02-29'), false);
  assert.equal(isRealDateKey('2026-11-31'), false);
  assert.equal(isRealDateKey('2026-11-08'), true);
  assert.throws(() => addDateDays('2026-11-31', 1), /not valid/);
  assert.throws(() => manilaInstant(MONDAY, 1440), /minute/);
});

test('review weeks end on Sunday and do not use the Sunday-start stats week', () => {
  assert.equal(weekEndingSunday(MONDAY), SUNDAY);
  assert.equal(weekEndingSunday('2026-11-12'), SUNDAY);
  assert.equal(weekEndingSunday(SUNDAY), SUNDAY);
  assert.equal(weekEndingSunday('2026-11-08'), '2026-11-08');
  assert.equal(weekEndingSunday('2026-11-09'), '2026-11-15');
  assert.notEqual('2026-11-15', '2026-11-08');
  assert.equal(dateKeyWeekday(MONDAY), 1);
  assert.equal(dateKeyWeekday('2026-11-08'), 7);
  assert.equal(REVIEW_PROMPTS.map((item) => item.field).join(','), 'finished,attention,crowded');
});

test('the template has five patterns, seven weekdays, and exact source clocks', () => {
  const preview = previewRoutineTemplate();
  assert.equal(preview.timeZone, 'Asia/Manila');
  assert.deepEqual(preview.patterns.map((pattern) => pattern.id), ['mon_wed', 'tue_thu', 'fri', 'sat', 'sun']);
  assert.equal(new Set(ROUTINE_TEMPLATE.map((block) => block.id)).size, ROUTINE_TEMPLATE.length);
  assert.equal(ROUTINE_TEMPLATE.every((block) => block.remind === false && block.enabled === true), true);

  assert.deepEqual(clockOf('mon-wed-wake'), [6 * 60 + 30, null]);
  assert.deepEqual(clockOf('mon-wed-workout'), [6 * 60 + 40, 7 * 60 + 15]);
  assert.deepEqual(clockOf('mon-wed-commute-in'), [8 * 60, 10 * 60]);
  assert.deepEqual(clockOf('mon-wed-class-morning'), [10 * 60, 12 * 60]);
  assert.deepEqual(clockOf('mon-wed-lunch'), [12 * 60, 13 * 60]);
  assert.deepEqual(clockOf('mon-wed-class-afternoon'), [13 * 60, 17 * 60]);
  assert.deepEqual(clockOf('mon-wed-commute-home'), [null, null]);
  assert.deepEqual(clockOf('mon-wed-first-hour'), [null, null]);
  assert.deepEqual(clockOf('mon-wed-prepare'), [22 * 60, 22 * 60 + 30]);
  assert.deepEqual(clockOf('mon-wed-sleep'), [22 * 60 + 30, null]);
  assert.deepEqual(clockOf('mon-meeting'), [19 * 60, 20 * 60]);
  assert.equal(block('mon-meeting').role, 'unconfirmed-meeting');
  assert.deepEqual(block('mon-meeting').weekdays, [1]);
  assert.match(block('mon-wed-class-morning').instructions, /If there’s no class/);
  assert.match(block('mon-wed-lunch').instructions, /Adjust this around your actual lunch break/);
  assert.match(block('mon-meeting').instructions, /7:00–8:00 pm/);
  assert.match(block('mon-meeting').instructions, /8:30–9:30 pm/);
  assert.match(block('mon-wed-prepare').instructions, /you’ll do next/);

  assert.deepEqual(clockOf('tue-thu-wake'), [6 * 60, null]);
  assert.deepEqual(clockOf('tue-thu-choose-task'), [7 * 60, 7 * 60 + 20]);
  assert.deepEqual(clockOf('tue-thu-buffer'), [7 * 60 + 20, 7 * 60 + 30]);
  assert.deepEqual(clockOf('tue-thu-commute-in'), [7 * 60 + 30, 9 * 60]);
  assert.deepEqual(clockOf('tue-class-morning'), [9 * 60, 12 * 60]);
  assert.deepEqual(clockOf('thu-class-morning'), [9 * 60, 12 * 60]);
  assert.match(block('tue-class-morning').instructions, /30-minute school break/);
  assert.doesNotMatch(block('thu-class-morning').instructions, /30-minute school break/);
  assert.match(block('tue-thu-choose-task').instructions, /yesterday’s learning/);
  assert.equal(block('thu-meeting').role, 'unconfirmed-meeting');
  assert.deepEqual(block('thu-meeting').weekdays, [4]);
  assert.match(block('thu-meeting').instructions, /8:30–9:30 pm/);
  assert.deepEqual(clockOf('tue-thu-commute-home'), [null, null]);
  assert.deepEqual(clockOf('tue-thu-first-hour'), [null, null]);

  assert.deepEqual(clockOf('fri-wake'), [7 * 60, null]);
  assert.deepEqual(clockOf('fri-workout'), [7 * 60 + 15, 7 * 60 + 50]);
  assert.deepEqual(clockOf('fri-group-work'), [13 * 60, 15 * 60]);
  assert.equal(block('fri-group-work').role, 'school');
  assert.match(block('fri-group-work').instructions, /Otherwise, use this for errands or rest/);
  assert.match(block('fri-resume').instructions, /you’ve actually completed/);
  assert.deepEqual(clockOf('fri-sleep'), [22 * 60 + 30, 23 * 60]);
  assert.deepEqual(clockOf('fri-prepare'), [21 * 60 + 30, 22 * 60 + 30]);

  assert.deepEqual(clockOf('sat-morning'), [7 * 60, 8 * 60]);
  assert.deepEqual(clockOf('sat-work'), [8 * 60, 9 * 60 + 30]);
  assert.match(block('sat-work').instructions, /If you miss a workout, use Saturday morning/);
  assert.match(block('sat-video').instructions, /step—script, record, or edit/);
  assert.deepEqual(clockOf('sat-sleep'), [22 * 60 + 30, 23 * 60]);
  assert.equal(ROUTINE_TEMPLATE.some((item) => item.weekdays.length === 1 && item.weekdays[0] === 6 && item.title === 'Workout'), false);

  assert.deepEqual(clockOf('sun-morning'), [7 * 60, 8 * 60 + 30]);
  assert.deepEqual(clockOf('sun-review'), [17 * 60, 17 * 60 + 15]);
  assert.deepEqual(clockOf('sun-choose'), [17 * 60 + 15, 17 * 60 + 30]);
  assert.match(block('sun-review').instructions, /what felt too crowded\?/);
  assert.match(block('sun-choose').instructions, /Monday’s first task/);
  assert.deepEqual(clockOf('sun-sleep'), [22 * 60 + 30, null]);
  assert.deepEqual(clockOf('sun-wind-down'), [21 * 60 + 30, 22 * 60 + 30]);

  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    assert.equal(ROUTINE_TEMPLATE.some((item) => item.weekdays.includes(day)), true);
  }
  assert.equal(block('mon-wed-class-morning').role, 'school');
  assert.equal(block('mon-wed-lunch').role, 'fixed');
  assert.doesNotThrow(() => assertClockWindow(22 * 60 + 30, 23 * 60));
  assert.doesNotThrow(() => assertClockWindow(13 * 60, 18 * 60));
  assert.throws(() => assertClockWindow(null, 60), /end must be after/);
  assert.equal(formatWeekdays([3, 1, 1]), '1,3');
});

test('half-open windows, point times, and weekday selection', () => {
  const mondayMorning = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 6 * 60 + 30));
  assert.equal(mondayMorning.dateKey, MONDAY);
  assert.equal(mondayMorning.current?.blockId, 'mon-wed-wake');
  assert.equal(mondayMorning.next?.blockId, 'mon-wed-workout');

  const justBeforeWorkout = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 6 * 60 + 39));
  assert.equal(justBeforeWorkout.current?.blockId, 'mon-wed-wake');
  const workoutStart = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 6 * 60 + 40));
  assert.equal(workoutStart.current?.blockId, 'mon-wed-workout');

  const noon = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 12 * 60));
  assert.equal(noon.current?.blockId, 'mon-wed-lunch');
  const beforeNoon = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 12 * 60 - 1));
  assert.equal(beforeNoon.current?.blockId, 'mon-wed-class-morning');

  const afterSchool = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 17 * 60 + 30));
  assert.equal(afterSchool.current, null);
  assert.equal(afterSchool.next?.blockId, 'mon-wed-commute-home');

  const meetingHour = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 19 * 60));
  assert.equal(meetingHour.current, null);
  assert.equal(meetingHour.occurrences.some((item) => item.blockId === 'mon-meeting'), true);
  assert.equal(meetingHour.next?.role === 'unconfirmed-meeting', false);

  const prepare = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 22 * 60));
  assert.equal(prepare.current?.blockId, 'mon-wed-prepare');
  assert.equal(prepare.next?.blockId, 'mon-wed-sleep');
  const sleep = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 22 * 60 + 30));
  assert.equal(sleep.current?.blockId, 'mon-wed-sleep');
  assert.equal(sleep.next, null);
  const late = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 23 * 60 + 30));
  assert.equal(late.current?.blockId, 'mon-wed-sleep');

  const wednesday = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(WEDNESDAY, 19 * 60));
  assert.equal(wednesday.occurrences.some((item) => item.blockId === 'mon-meeting'), false);
  assert.equal(wednesday.occurrences.some((item) => item.blockId === 'mon-wed-wake'), true);

  const tuesday = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(TUESDAY, 6 * 60));
  assert.equal(tuesday.current?.blockId, 'tue-thu-wake');
  assert.equal(tuesday.occurrences.some((item) => item.blockId === 'tue-class-morning'), true);
  assert.equal(tuesday.occurrences.some((item) => item.blockId === 'thu-meeting'), false);

  const thursday = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(THURSDAY, 9 * 60));
  assert.equal(thursday.occurrences.some((item) => item.blockId === 'thu-meeting'), true);
  assert.equal(thursday.occurrences.some((item) => item.blockId === 'tue-class-morning'), false);

  const fridaySleepEnd = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(FRIDAY, 23 * 60));
  assert.equal(fridaySleepEnd.current, null);
  const fridaySleep = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(FRIDAY, 22 * 60 + 45));
  assert.equal(fridaySleep.current?.blockId, 'fri-sleep');

  const sunday = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(SUNDAY, 17 * 60));
  assert.equal(sunday.current?.blockId, 'sun-review');
  const sundaySleep = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(SUNDAY, 22 * 60 + 30));
  assert.equal(sundaySleep.current?.blockId, 'sun-sleep');

  const midnight = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, new Date('2026-11-09T16:00:00.000Z'));
  assert.equal(midnight.dateKey, TUESDAY);
  assert.equal(midnight.occurrences[0]?.blockId, 'tue-thu-wake');
  assert.equal(midnight.current, null);
  assert.equal(midnight.next?.blockId, 'tue-thu-wake');
});

test('no classes, home now, and home late stay on that day and can be undone', () => {
  const cancelled = deriveDay(ROUTINE_TEMPLATE, overrides({ noClasses: true }), at(MONDAY, 9 * 60));
  assert.equal(cancelled.occurrences.filter((item) => item.synthetic).length, 1);
  assert.equal(cancelled.next?.title, SHORT_WORK_TITLE);
  assert.match(cancelled.next?.instructions ?? '', /15–30/);
  assert.equal(cancelled.occurrences.some((item) => item.role === 'school' || item.role === 'commute'), false);
  assert.equal(cancelled.occurrences.some((item) => item.blockId === 'mon-wed-breakfast'), true);
  assert.equal(cancelled.occurrences.some((item) => item.blockId === 'mon-wed-lunch'), true);
  assert.equal(cancelled.occurrences.some((item) => item.blockId === 'mon-wed-sleep'), true);

  const sunday = deriveDay(ROUTINE_TEMPLATE, overrides({ noClasses: true }), at(SUNDAY, 10 * 60));
  assert.equal(sunday.occurrences.some((item) => item.synthetic), false);
  assert.equal(sunday.occurrences.length, ROUTINE_TEMPLATE.filter((item) => item.weekdays.includes(7)).length);

  const homeNow = deriveDay(ROUTINE_TEMPLATE, overrides({ homeAtMinute: 18 * 60 + 30 }), at(MONDAY, 18 * 60 + 40));
  const first = homeNow.occurrences.find((item) => item.role === 'first-hour-at-home');
  const evening = homeNow.occurrences.find((item) => item.role === 'evening');
  assert.equal(homeNow.current?.role, 'first-hour-at-home');
  assert.equal(first?.startMinute, 18 * 60 + 30);
  assert.equal(first?.endMinute, 19 * 60 + 30);
  assert.match(first?.instructions ?? '', /arrival update/);
  assert.equal(evening?.startMinute, 19 * 60 + 30);
  assert.equal(evening?.endMinute, 22 * 60);
  assert.equal(homeNow.next?.role, 'evening');
  assert.equal(homeNow.occurrences.some((item) => item.blockId === 'mon-wed-commute-home'), false);
  assert.equal(block('mon-wed-first-hour').startMinute, null);

  const afterFirstHour = deriveDay(ROUTINE_TEMPLATE, overrides({ homeAtMinute: 18 * 60 + 30 }), at(MONDAY, 19 * 60 + 30));
  assert.equal(afterFirstHour.current?.role, 'evening');
  const windDown = deriveDay(ROUTINE_TEMPLATE, overrides({ homeAtMinute: 18 * 60 + 30 }), at(MONDAY, 22 * 60));
  assert.equal(windDown.current?.blockId, 'mon-wed-prepare');

  const homeLate = deriveDay(ROUTINE_TEMPLATE, overrides({ homeLate: true }), at(MONDAY, 18 * 60 + 40));
  assert.equal(homeLate.occurrences.some((item) => item.role === 'evening'), false);
  assert.equal(homeLate.occurrences.some((item) => item.synthetic), false);
  assert.equal(homeLate.occurrences.find((item) => item.role === 'first-hour-at-home')?.instructions, HOME_LATE_ESSENTIALS);
  assert.equal(homeLate.occurrences.find((item) => item.role === 'first-hour-at-home')?.startMinute, null);
  assert.equal(homeLate.occurrences.some((item) => item.blockId === 'mon-wed-prepare'), true);
  assert.equal(homeLate.occurrences.some((item) => item.blockId === 'mon-wed-sleep'), true);
  assert.match(homeLate.occurrences.find((item) => item.blockId === 'mon-wed-prepare')?.instructions ?? '', /you’ll do next/);

  const both = deriveDay(
    ROUTINE_TEMPLATE,
    overrides({ noClasses: true, homeLate: true, homeAtMinute: 18 * 60 + 30 }),
    at(MONDAY, 18 * 60 + 40),
  );
  assert.equal(both.occurrences.some((item) => item.synthetic), false);
  assert.equal(both.occurrences.some((item) => item.role === 'evening'), false);
  assert.equal(both.occurrences.some((item) => item.blockId === 'mon-wed-commute-home'), false);
  assert.equal(both.current?.role, 'first-hour-at-home');
  assert.equal(both.current?.instructions, HOME_LATE_ESSENTIALS);

  const arrivedDuringSleep = deriveDay(ROUTINE_TEMPLATE, overrides({ homeAtMinute: 22 * 60 + 40 }), at(MONDAY, 22 * 60 + 40));
  assert.equal(arrivedDuringSleep.current?.blockId, 'mon-wed-sleep');

  const undone = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 18 * 60 + 40));
  assert.equal(undone.occurrences.some((item) => item.role === 'evening'), true);
  assert.equal(undone.occurrences.some((item) => item.blockId === 'mon-wed-class-afternoon'), true);
  assert.equal(undone.occurrences.find((item) => item.role === 'first-hour-at-home')?.startMinute, null);

  const tuesdayPlain = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(TUESDAY, 9 * 60));
  assert.equal(tuesdayPlain.occurrences.some((item) => item.synthetic), false);
  assert.equal(tuesdayPlain.current?.blockId, 'tue-class-morning');

  const disabled = ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-wed-workout' ? { ...item, enabled: false } : item,
  );
  const skipped = deriveDay(disabled, NO_DAY_OVERRIDES, at(MONDAY, 6 * 60 + 45));
  assert.equal(skipped.occurrences.some((item) => item.blockId === 'mon-wed-workout'), false);
  assert.equal(skipped.current?.blockId, 'mon-wed-wake');
  assert.equal(skipped.next?.blockId, 'mon-wed-breakfast');

  const titledLikeClass: RoutineBlockView = {
    id: 'custom-class',
    pattern: 'mon_wed',
    weekdays: [1],
    sort: 15,
    title: 'Attend class',
    instructions: 'This title is not a role.',
    startMinute: 6 * 60 + 35,
    endMinute: 6 * 60 + 50,
    role: 'fixed',
    enabled: true,
    remind: false,
  };
  const custom = deriveDay([...ROUTINE_TEMPLATE, titledLikeClass], NO_DAY_OVERRIDES, at(MONDAY, 6 * 60 + 36));
  assert.equal(custom.current?.role, 'fixed');
  assert.equal(custom.current?.blockId, 'custom-class');
});

test('reminder candidates are fixed, future, opted in, and seven days ahead', () => {
  assert.equal(REMINDER_HORIZON_DAYS, 7);
  const reminded = ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-wed-prepare' || item.id === 'mon-meeting' || item.id === 'mon-wed-class-morning' || item.id === 'mon-wed-first-hour'
      ? { ...item, remind: true }
      : item,
  );
  const evening = at(MONDAY, 21 * 60);
  const rows = reminderOccurrences({ blocks: reminded, now: evening, routineEnabled: true });
  const ids = rows.map((item) => `${item.dateKey}:${item.blockId}`);
  assert.deepEqual(ids, [
    `${MONDAY}:mon-wed-prepare`,
    `${WEDNESDAY}:mon-wed-class-morning`,
    `${WEDNESDAY}:mon-wed-prepare`,
  ]);
  assert.equal(rows[0]?.firesAt, '2026-11-09T14:00:00.000Z');
  assert.equal(rows.some((item) => item.blockId === 'mon-meeting'), false);
  assert.equal(rows.some((item) => item.dateKey === '2026-11-16'), false);

  const noClass = reminderOccurrences({
    blocks: reminded,
    now: evening,
    routineEnabled: true,
    overridesByDate: { [WEDNESDAY]: overrides({ noClasses: true }) },
  });
  assert.deepEqual(noClass.map((item) => item.blockId), ['mon-wed-prepare', 'mon-wed-prepare']);
  assert.equal(noClass.some((item) => item.role === 'school' || item.role === 'commute'), false);

  assert.deepEqual(reminderOccurrences({ blocks: reminded, now: evening, routineEnabled: false }), []);

  const home = reminderOccurrences({
    blocks: reminded,
    now: at(MONDAY, 17 * 60),
    routineEnabled: true,
    overridesByDate: { [MONDAY]: overrides({ homeAtMinute: 18 * 60 + 30 }) },
  });
  assert.equal(home.some((item) => item.blockId === 'mon-wed-first-hour' && item.dateKey === MONDAY && item.minute === 18 * 60 + 30), true);
  assert.equal(home.some((item) => item.blockId === 'mon-wed-first-hour' && item.dateKey === WEDNESDAY), false);

  const disabled = reminded.map((item) => (item.id === 'mon-wed-prepare' ? { ...item, enabled: false } : item));
  const withoutPrepare = reminderOccurrences({ blocks: disabled, now: evening, routineEnabled: true });
  assert.equal(withoutPrepare.some((item) => item.blockId === 'mon-wed-prepare'), false);

  const justAfter = new Date(manilaInstant(MONDAY, 22 * 60).getTime() + 60_000);
  const later = reminderOccurrences({ blocks: reminded, now: justAfter, routineEnabled: true });
  assert.equal(later.some((item) => item.dateKey === MONDAY && item.blockId === 'mon-wed-prepare'), false);
  assert.equal(later.some((item) => item.dateKey === WEDNESDAY && item.blockId === 'mon-wed-prepare'), true);

  const exact = reminderOccurrences({
    blocks: reminded,
    now: manilaInstant(MONDAY, 22 * 60),
    routineEnabled: true,
  });
  assert.equal(exact.some((item) => item.dateKey === MONDAY && item.blockId === 'mon-wed-prepare'), true);
});

test('current and next follow the clock when sort, edits, or confirmation disagree', () => {
  const appended: RoutineBlockView[] = [
    ...ROUTINE_TEMPLATE,
    {
      id: 'late-sort-meeting',
      pattern: 'mon_wed',
      weekdays: [1],
      sort: 1000,
      title: 'Added meeting',
      instructions: 'Clock wins over sort.',
      startMinute: 19 * 60,
      endMinute: 20 * 60,
      role: 'fixed',
      enabled: true,
      remind: false,
    },
  ];
  const added = deriveDay(appended, NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(added.current?.blockId, 'late-sort-meeting');
  assert.equal(added.next?.blockId, 'mon-wed-prepare');
  assert.equal(added.occurrences.some((item) => item.blockId === 'mon-wed-prepare'), true);
  assert.equal(added.occurrences.at(-1)?.blockId, 'late-sort-meeting');
  const travel = added.occurrences.find((item) => item.blockId === 'mon-wed-commute-home');
  assert.equal(travel?.startMinute, null);
  assert.equal(travel?.instructions, block('mon-wed-commute-home').instructions);

  const edited = ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-wed-lunch' ? { ...item, startMinute: 15 * 60, endMinute: 16 * 60 } : item,
  );
  const overlap = deriveDay(edited, NO_DAY_OVERRIDES, at(MONDAY, 15 * 60 + 30));
  assert.equal(overlap.current?.blockId, 'mon-wed-lunch');
  assert.equal(overlap.occurrences.some((item) => item.blockId === 'mon-wed-class-afternoon'), true);
  assert.equal(overlap.next?.blockId, 'mon-wed-commute-home');

  const confirmed = ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-meeting' ? { ...item, role: 'fixed' as const } : item,
  );
  const meeting = deriveDay(confirmed, NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(meeting.current?.blockId, 'mon-meeting');
  assert.equal(meeting.current?.role, 'fixed');
  assert.equal(meeting.next?.blockId, 'mon-wed-prepare');

  const earlySort: RoutineBlockView = {
    id: 'early-sort-fixed',
    pattern: 'mon_wed',
    weekdays: [1],
    sort: 0,
    title: 'Early sort, late clock',
    instructions: 'Do not hide this.',
    startMinute: 21 * 60,
    endMinute: 21 * 60 + 30,
    role: 'fixed',
    enabled: true,
    remind: false,
  };
  const visible = deriveDay([earlySort, ...confirmed], NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(visible.occurrences[0]?.blockId, 'early-sort-fixed');
  assert.equal(visible.current?.blockId, 'mon-meeting');
  assert.equal(visible.next?.blockId, 'early-sort-fixed');
  const clipped = deriveDay([earlySort, ...ROUTINE_TEMPLATE], overrides({ homeAtMinute: 18 * 60 + 30 }), at(MONDAY, 18 * 60 + 40));
  assert.equal(clipped.occurrences.find((item) => item.role === 'evening')?.endMinute, 21 * 60);

  const bedtime = deriveDay(ROUTINE_TEMPLATE, overrides({ homeAtMinute: 22 * 60 + 40 }), at(MONDAY, 22 * 60 + 40));
  assert.equal(bedtime.current?.blockId, 'mon-wed-sleep');
  assert.equal(bedtime.occurrences.find((item) => item.role === 'first-hour-at-home')?.startMinute, null);
  assert.equal(bedtime.next, null);
  assert.equal(bedtime.occurrences.find((item) => item.blockId === 'mon-wed-prepare')?.instructions, block('mon-wed-prepare').instructions);

  const reordered = ROUTINE_TEMPLATE.map((item) => (item.id === 'mon-wed-wake' ? { ...item, sort: 1000 } : item));
  const arrived = deriveDay(reordered, overrides({ homeAtMinute: 20 * 60 }), at(MONDAY, 20 * 60 + 10));
  assert.equal(arrived.current?.role, 'first-hour-at-home');
  assert.notEqual(arrived.current?.blockId, 'mon-wed-wake');
  assert.equal(arrived.occurrences.at(-1)?.blockId, 'mon-wed-wake');
  const wake = arrived.occurrences.find((item) => item.blockId === 'mon-wed-wake');
  assert.equal(wake != null && wake.activeEndMinute != null && wake.activeEndMinute <= 20 * 60, true);
});

test('a proposed meeting does not end the blocks before it', () => {
  const mondayMeeting = block('mon-meeting');
  const thursdayMeeting = block('thu-meeting');
  const mondaySource = {
    startMinute: mondayMeeting.startMinute,
    endMinute: mondayMeeting.endMinute,
    instructions: mondayMeeting.instructions,
    weekdays: [...mondayMeeting.weekdays],
  };
  const thursdaySource = {
    startMinute: thursdayMeeting.startMinute,
    endMinute: thursdayMeeting.endMinute,
    instructions: thursdayMeeting.instructions,
    weekdays: [...thursdayMeeting.weekdays],
  };

  const mondayEvening = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(mondayEvening.current, null);
  assert.equal(mondayEvening.next?.blockId, 'mon-wed-commute-home');
  const shownMonday = mondayEvening.occurrences.find((item) => item.blockId === 'mon-meeting');
  assert.equal(shownMonday?.startMinute, 19 * 60);
  assert.equal(shownMonday?.endMinute, 20 * 60);
  assert.equal(shownMonday?.instructions, mondaySource.instructions);

  const wednesdayEvening = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(WEDNESDAY, 19 * 60 + 30));
  assert.equal(wednesdayEvening.next?.blockId, 'mon-wed-commute-home');
  assert.equal(wednesdayEvening.occurrences.some((item) => item.blockId === 'mon-meeting'), false);

  const thursdayEvening = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(THURSDAY, 19 * 60 + 30));
  assert.equal(thursdayEvening.current, null);
  assert.equal(thursdayEvening.next?.blockId, 'tue-thu-commute-home');
  const shownThursday = thursdayEvening.occurrences.find((item) => item.blockId === 'thu-meeting');
  assert.equal(shownThursday?.startMinute, 19 * 60);
  assert.equal(shownThursday?.endMinute, 20 * 60);
  assert.equal(shownThursday?.instructions, thursdaySource.instructions);

  const point: RoutineBlockView = {
    id: 'span-point',
    pattern: 'mon_wed',
    weekdays: [1],
    sort: 105,
    title: 'Open stretch',
    instructions: 'Stay open across the proposal.',
    startMinute: 18 * 60,
    endMinute: null,
    role: 'fixed',
    enabled: true,
    remind: false,
  };
  const spanning = deriveDay([point, ...ROUTINE_TEMPLATE], NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(spanning.occurrences.find((item) => item.blockId === 'span-point')?.activeEndMinute, 22 * 60);
  assert.equal(spanning.current?.blockId, 'span-point');
  assert.equal(spanning.occurrences.find((item) => item.blockId === 'mon-meeting')?.startMinute, 19 * 60);

  const confirmed = ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-meeting' ? { ...item, role: 'fixed' as const } : item,
  );
  const bounded = deriveDay([point, ...confirmed], NO_DAY_OVERRIDES, at(MONDAY, 19 * 60 + 30));
  assert.equal(bounded.occurrences.find((item) => item.blockId === 'span-point')?.activeEndMinute, 19 * 60);
  assert.equal(bounded.current?.blockId, 'mon-meeting');
  assert.equal(bounded.current?.role, 'fixed');

  assert.equal(block('mon-meeting').startMinute, mondaySource.startMinute);
  assert.equal(block('mon-meeting').endMinute, mondaySource.endMinute);
  assert.equal(block('mon-meeting').instructions, mondaySource.instructions);
  assert.deepEqual(block('mon-meeting').weekdays, mondaySource.weekdays);
  assert.equal(block('mon-meeting').role, 'unconfirmed-meeting');
  assert.equal(block('thu-meeting').startMinute, thursdaySource.startMinute);
  assert.equal(block('thu-meeting').endMinute, thursdaySource.endMinute);
  assert.equal(block('thu-meeting').instructions, thursdaySource.instructions);
  assert.deepEqual(block('thu-meeting').weekdays, thursdaySource.weekdays);
});

test('unresolved flexible rows are earlier only once a later part is current', () => {
  const days = [
    {
      date: MONDAY,
      travel: 'mon-wed-commute-home',
      first: 'mon-wed-first-hour',
      evening: 'mon-wed-evening',
      meeting: 'mon-meeting',
      prepare: 'mon-wed-prepare',
      sleep: 'mon-wed-sleep',
    },
    {
      date: THURSDAY,
      travel: 'tue-thu-commute-home',
      first: 'tue-thu-first-hour',
      evening: 'tue-thu-evening',
      meeting: 'thu-meeting',
      prepare: 'tue-thu-prepare',
      sleep: 'tue-thu-sleep',
    },
  ];
  for (const ids of days) {
    const open = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(ids.date, 19 * 60 + 30));
    assert.equal(open.current, null);
    for (const id of [ids.travel, ids.first, ids.evening, ids.meeting]) {
      const item = byId(open, id);
      assert.equal(item.activeEndMinute ?? item.endMinute, item.role === 'unconfirmed-meeting' ? 20 * 60 : null);
      assert.equal(occurrenceIsEarlier(open, item), false);
    }

    const preparing = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(ids.date, 22 * 60));
    assert.equal(preparing.current?.blockId, ids.prepare);
    assert.equal(preparing.next?.blockId, ids.sleep);
    for (const id of [ids.travel, ids.first, ids.evening]) {
      const item = byId(preparing, id);
      assert.equal(item.activeEndMinute ?? item.endMinute, null);
      assert.ok(preparing.occurrences.indexOf(item) < preparing.occurrences.indexOf(preparing.current as Occurrence));
      assert.equal(occurrenceIsEarlier(preparing, item), true);
    }
    assert.equal(occurrenceIsEarlier(preparing, preparing.current as Occurrence), false);
    assert.equal(occurrenceIsEarlier(preparing, preparing.next as Occurrence), false);
    assert.equal(occurrenceIsEarlier(preparing, byId(preparing, ids.meeting)), false);
  }

  const history = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(TUESDAY, 12 * 60), MONDAY);
  assert.equal(history.minute, 1440);
  assert.equal(history.occurrences.length > 0, true);
  assert.equal(
    history.occurrences.every((item) => occurrenceIsEarlier(history, item)),
    true,
  );

  const live = deriveDay(ROUTINE_TEMPLATE, NO_DAY_OVERRIDES, at(MONDAY, 22 * 60));
  const current = live.current as Occurrence;
  const futureTimed: Occurrence = {
    ...current,
    blockId: 'later-fixed',
    title: 'Later fixed',
    startMinute: 23 * 60,
    endMinute: 23 * 60 + 30,
    activeStartMinute: 23 * 60,
    activeEndMinute: 23 * 60 + 30,
    timing: 'clock',
  };
  const shifted: DayPlan = { ...live, occurrences: [futureTimed, ...live.occurrences] };
  assert.ok(shifted.occurrences.indexOf(futureTimed) < shifted.occurrences.indexOf(current));
  assert.notEqual(futureTimed, shifted.next);
  assert.equal(occurrenceIsEarlier(shifted, futureTimed), false);

  const travel = byId(live, 'mon-wed-commute-home');
  const nextFirst: DayPlan = { ...live, next: travel };
  assert.ok(nextFirst.occurrences.indexOf(travel) < nextFirst.occurrences.indexOf(current));
  assert.equal(occurrenceIsEarlier(nextFirst, travel), false);
});

function byId(plan: DayPlan, id: string): Occurrence {
  const found = plan.occurrences.find((item) => item.blockId === id);
  assert.ok(found, id);
  return found;
}

function block(id: string): RoutineBlockView {
  const found = ROUTINE_TEMPLATE.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

function clockOf(id: string): [number | null, number | null] {
  const found = block(id);
  return [found.startMinute, found.endMinute];
}

function at(dateKey: string, minute: number): Date {
  return manilaInstant(dateKey, minute);
}

function overrides(patch: Partial<DayOverrides>): DayOverrides {
  return {
    noClasses: patch.noClasses ?? false,
    homeAtMinute: patch.homeAtMinute ?? null,
    homeLate: patch.homeLate ?? false,
  };
}
