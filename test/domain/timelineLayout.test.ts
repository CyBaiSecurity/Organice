import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clipToDay,
  clockLabel,
  createMinutes,
  dayDelta,
  HOUR_HEIGHT,
  layoutDayBlocks,
  minutesFromDrag,
  weekContaining,
} from '../../src/domain/timelineLayout.ts';

test('the week that contains a Wednesday starts on Monday', () => {
  const week = weekContaining(new Date(2026, 9, 7));
  assert.equal(week.length, 7);
  assert.equal(week[0]?.toDateString(), new Date(2026, 9, 5).toDateString());
  assert.equal(week[6]?.toDateString(), new Date(2026, 9, 11).toDateString());
});

test('dayDelta counts local midnights, including a move onto the same day', () => {
  assert.equal(dayDelta(new Date(2026, 9, 6, 18), new Date(2026, 9, 8, 1)), 2);
  assert.equal(dayDelta(new Date(2026, 9, 6, 9), new Date(2026, 9, 6, 23)), 0);
});

test('hour labels use a 12-hour clock', () => {
  assert.equal(clockLabel(0), '12 AM');
  assert.equal(clockLabel(9), '9 AM');
  assert.equal(clockLabel(12), '12 PM');
  assert.equal(clockLabel(15), '3 PM');
});

test('a tap in an hour snaps to 15 minutes and the last hour stays on that day', () => {
  assert.equal(createMinutes(9, HOUR_HEIGHT / 2), 9 * 60 + 30);
  assert.equal(createMinutes(9, 0), 9 * 60);
  assert.equal(createMinutes(23, HOUR_HEIGHT), 23 * 60 + 45);
});

test('a drag of one hour moves the task by 60 minutes, and a small drag snaps to nothing', () => {
  assert.equal(minutesFromDrag(HOUR_HEIGHT), 60);
  assert.equal(minutesFromDrag(HOUR_HEIGHT / 4), 15);
  assert.equal(minutesFromDrag(3), 0);
});

test('clipToDay keeps the part of a task that falls on the chosen day', () => {
  const day = new Date(2026, 9, 6);
  const start = new Date(2026, 9, 6, 10, 0).getTime();
  const end = new Date(2026, 9, 6, 11, 30).getTime();
  assert.deepEqual(clipToDay(start, end, day), { startMin: 600, endMin: 690 });

  const fromYesterday = new Date(2026, 9, 5, 22, 0).getTime();
  const untilOne = new Date(2026, 9, 6, 1, 0).getTime();
  assert.deepEqual(clipToDay(fromYesterday, untilOne, day), { startMin: 0, endMin: 60 });

  const late = new Date(2026, 9, 6, 23, 0).getTime();
  const afterMidnight = new Date(2026, 9, 7, 1, 0).getTime();
  assert.deepEqual(clipToDay(late, afterMidnight, day), { startMin: 23 * 60, endMin: 1440 });
  assert.equal(clipToDay(start, end, new Date(2026, 9, 7)), null);
  assert.equal(clipToDay(end, start, day), null);
});

test('overlapping tasks share the width, and a task that starts when another ends does not', () => {
  const blocks = layoutDayBlocks([
    { id: 'a', startMin: 600, endMin: 700 },
    { id: 'b', startMin: 630, endMin: 800 },
    { id: 'c', startMin: 750, endMin: 820 },
    { id: 'd', startMin: 800, endMin: 860 },
    { id: 'e', startMin: 860, endMin: 900 },
  ]);
  const byId = Object.fromEntries(blocks.map((block) => [block.id, block]));
  assert.equal(byId.a?.lane, 0);
  assert.equal(byId.b?.lane, 1);
  assert.equal(byId.a?.lanes, 2);
  assert.equal(byId.b?.lanes, 2);
  assert.equal(byId.c?.lane, 0);
  assert.equal(byId.c?.lanes, 2);
  assert.equal(byId.d?.lane, 1);
  assert.equal(byId.d?.lanes, 2);
  assert.equal(byId.e?.lane, 0);
  assert.equal(byId.e?.lanes, 1);
  assert.ok((byId.a?.height ?? 0) > 30);
});
