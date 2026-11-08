import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveDay, manilaInstant, NO_DAY_OVERRIDES, ROUTINE_TEMPLATE } from '../../src/domain/routine.ts';
import { clockLabel, clockToParts, formatTime, parseClock, partsToClock } from '../../src/state/clock.ts';

test('midnight, noon, and the afternoon convert between 24-hour text and an alarm clock', () => {
  assert.deepEqual(clockToParts('00:00'), { hour: 12, minute: 0, period: 'AM' });
  assert.equal(partsToClock({ hour: 12, minute: 0, period: 'AM' }), '00:00');
  assert.deepEqual(clockToParts('00:30'), { hour: 12, minute: 30, period: 'AM' });
  assert.equal(partsToClock({ hour: 12, minute: 30, period: 'AM' }), '00:30');
  assert.deepEqual(clockToParts('09:05'), { hour: 9, minute: 5, period: 'AM' });
  assert.equal(partsToClock({ hour: 9, minute: 5, period: 'AM' }), '09:05');
  assert.deepEqual(clockToParts('12:00'), { hour: 12, minute: 0, period: 'PM' });
  assert.equal(partsToClock({ hour: 12, minute: 0, period: 'PM' }), '12:00');
  assert.deepEqual(clockToParts('13:15'), { hour: 1, minute: 15, period: 'PM' });
  assert.equal(partsToClock({ hour: 1, minute: 15, period: 'PM' }), '13:15');
  assert.deepEqual(clockToParts('23:59'), { hour: 11, minute: 59, period: 'PM' });
  assert.equal(partsToClock({ hour: 11, minute: 59, period: 'PM' }), '23:59');
});

test('a blank clock opens at 9:00 AM', () => {
  assert.deepEqual(clockToParts(''), { hour: 9, minute: 0, period: 'AM' });
  assert.deepEqual(clockToParts('nope'), { hour: 9, minute: 0, period: 'AM' });
});

// A 12-hour shift would show midnight as 12:00 PM, or noon as 12:00 AM.
test('midnight stays 12:00 AM and noon stays 12:00 PM', () => {
  const cases: [number, string][] = [
    [0, '12:00 AM'],
    [9 * 60 + 5, '9:05 AM'],
    [12 * 60, '12:00 PM'],
    [13 * 60 + 15, '1:15 PM'],
    [23 * 60 + 59, '11:59 PM'],
    [6 * 60 + 30, '6:30 AM'],
    [22 * 60 + 30, '10:30 PM'],
  ];
  for (const [minute, label] of cases) {
    assert.equal(clockLabel(minute), label);
    assert.equal(parseClock(label), minute);
  }
  assert.equal(parseClock('12:00 AM'), 0);
  assert.equal(parseClock('12:00 PM'), 12 * 60);
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('12:00'), 12 * 60);
});

test('parseClock accepts AM/PM in any case with ordinary spaces, and still reads legacy HH:mm', () => {
  assert.equal(parseClock('9:05 am'), 9 * 60 + 5);
  assert.equal(parseClock('9:05AM'), 9 * 60 + 5);
  assert.equal(parseClock('9:05  AM'), 9 * 60 + 5);
  assert.equal(parseClock('  1:15 pm '), 13 * 60 + 15);
  assert.equal(parseClock('09:05'), 9 * 60 + 5);
  assert.equal(parseClock('0:15'), 15);
  assert.equal(parseClock('23:59'), 23 * 60 + 59);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('23:60'), null);
  assert.equal(parseClock('13:00 PM'), null);
  assert.equal(parseClock('0:15 AM'), null);
  assert.equal(parseClock('00:15 AM'), null);
  assert.equal(parseClock('12:60 PM'), null);
  assert.equal(parseClock('12:00 XM'), null);
  assert.equal(parseClock('1:15\tPM'), null);
  assert.equal(parseClock(''), null);
});

test('12-hour text opens the same alarm clock as its legacy 24-hour form', () => {
  assert.deepEqual(clockToParts('12:00 AM'), { hour: 12, minute: 0, period: 'AM' });
  assert.deepEqual(clockToParts('12:00 PM'), { hour: 12, minute: 0, period: 'PM' });
  assert.deepEqual(clockToParts('1:15 pm'), { hour: 1, minute: 15, period: 'PM' });
  assert.deepEqual(clockToParts('9:05 AM'), { hour: 9, minute: 5, period: 'AM' });
  assert.deepEqual(clockToParts('11:59 PM'), { hour: 11, minute: 59, period: 'PM' });
  assert.deepEqual(clockToParts('12:00 am'), clockToParts('00:00'));
  assert.deepEqual(clockToParts('1:15 PM'), clockToParts('13:15'));
  assert.deepEqual(clockToParts('13:00 PM'), { hour: 9, minute: 0, period: 'AM' });
  assert.deepEqual(clockToParts('24:00'), { hour: 9, minute: 0, period: 'AM' });
});

test('formatTime uses the shared 12-hour label for that minute', () => {
  const afternoon = new Date(2026, 0, 1, 13, 15, 45);
  assert.equal(formatTime(afternoon), '1:15 PM');
  assert.equal(formatTime(afternoon), clockLabel(13 * 60 + 15));
  assert.equal(formatTime(new Date(2026, 0, 1, 0, 0, 30)), '12:00 AM');
  assert.equal(formatTime(new Date(2026, 0, 1, 9, 5, 59)), '9:05 AM');
  assert.equal(formatTime(new Date(2026, 0, 1, 12, 0)), '12:00 PM');
  assert.equal(formatTime(new Date(2026, 0, 1, 23, 59)), '11:59 PM');
});

test('a home arrival with no later fixed block ends at 12:00 AM, not noon', () => {
  const first = ROUTINE_TEMPLATE.find((block) => block.role === 'first-hour-at-home' && block.weekdays.includes(1));
  assert.ok(first);
  const plan = deriveDay([first], { ...NO_DAY_OVERRIDES, homeAtMinute: 1410 }, manilaInstant('2026-11-09', 1410));
  const arrival = plan.occurrences[0];
  assert.equal(arrival?.startMinute, 1410);
  assert.equal(arrival?.endMinute, 1440);
  assert.equal(clockLabel(arrival?.startMinute ?? -1), '11:30 PM');
  assert.equal(clockLabel(arrival?.endMinute ?? -1), '12:00 AM');
});

test('every minute round-trips through the 12-hour label and the 24-hour wheel value', () => {
  for (let minute = 0; minute < 1440; minute += 1) {
    const hour = Math.floor(minute / 60);
    const mins = minute % 60;
    const canonical = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    assert.equal(parseClock(clockLabel(minute)), minute, canonical);
    assert.equal(parseClock(canonical), minute, canonical);
    assert.equal(partsToClock(clockToParts(clockLabel(minute))), canonical, canonical);
    assert.equal(partsToClock(clockToParts(canonical)), canonical, canonical);
  }
});
