import { LIMITS } from './limits.ts';
import { addLocalDays, isoWeekday, readDue, startOfLocalDay, storedDue } from './time.ts';

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'after_complete';

const MAX_STEPS = 366 * 100;

export function nextDue(input: {
  dueAt: string;
  allDay: boolean;
  completedAt: string;
  kind: Exclude<RepeatKind, 'none'>;
  weekdays: number[] | null;
  monthDay: number | null;
  intervalDays: number | null;
}): string {
  const due = readDue(input.dueAt, input.allDay);
  const completed = new Date(input.completedAt);
  let slot: Date;
  if (input.kind === 'daily') {
    slot = nextDaily(due, completed, input.allDay);
  } else if (input.kind === 'weekly') {
    slot = nextWeekly(due, completed, input.allDay, input.weekdays);
  } else if (input.kind === 'monthly') {
    slot = nextMonthly(due, completed, input.allDay, input.monthDay);
  } else {
    slot = nextAfterComplete(due, completed, input.allDay, input.intervalDays);
  }
  return storedDue(slot, input.allDay);
}

function nextDaily(due: Date, completed: Date, allDay: boolean): Date {
  let slot = allDay ? startOfLocalDay(due) : new Date(due.getTime());
  for (let step = 0; step < MAX_STEPS; step += 1) {
    slot = addLocalDays(slot, 1);
    if (isAfterBoth(slot, due, completed)) return slot;
  }
  throw new Error('No next due');
}

function nextWeekly(due: Date, completed: Date, allDay: boolean, weekdays: number[] | null): Date {
  const allowed = weekdaySet(weekdays, due);
  let slot = allDay ? startOfLocalDay(due) : new Date(due.getTime());
  for (let step = 0; step < MAX_STEPS; step += 1) {
    slot = addLocalDays(slot, 1);
    if (!allowed.has(isoWeekday(slot))) continue;
    if (isAfterBoth(slot, due, completed)) return slot;
  }
  throw new Error('No next due');
}

function nextMonthly(due: Date, completed: Date, allDay: boolean, monthDay: number | null): Date {
  // A short month clamps that one slot. monthDay itself stays the anchor.
  const anchor = monthAnchor(monthDay, due);
  const hour = allDay ? 0 : due.getHours();
  const minute = allDay ? 0 : due.getMinutes();
  const second = allDay ? 0 : due.getSeconds();
  const millisecond = allDay ? 0 : due.getMilliseconds();
  let year = due.getFullYear();
  let month = due.getMonth();
  for (let step = 0; step < MAX_STEPS; step += 1) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const day = Math.min(anchor, daysInMonth(year, month));
    const slot = new Date(year, month, day, hour, minute, second, millisecond);
    if (isAfterBoth(slot, due, completed)) return slot;
  }
  throw new Error('No next due');
}

function nextAfterComplete(
  due: Date,
  completed: Date,
  allDay: boolean,
  intervalDays: number | null,
): Date {
  const interval = clampInterval(intervalDays);
  let slot = allDay ? startOfLocalDay(completed) : new Date(completed.getTime());
  for (let step = 0; step < MAX_STEPS; step += 1) {
    slot = addLocalDays(slot, interval);
    if (isAfterBoth(slot, due, completed)) return slot;
  }
  throw new Error('No next due');
}

function isAfterBoth(slot: Date, due: Date, completed: Date): boolean {
  return slot.getTime() > due.getTime() && slot.getTime() > completed.getTime();
}

function weekdaySet(weekdays: number[] | null, due: Date): Set<number> {
  const allowed = (weekdays ?? []).filter((day) => day >= 1 && day <= 7);
  if (allowed.length === 0) return new Set([isoWeekday(due)]);
  return new Set(allowed);
}

function monthAnchor(monthDay: number | null, due: Date): number {
  const raw = monthDay == null || !Number.isFinite(monthDay) ? due.getDate() : Math.trunc(monthDay);
  if (raw < 1) return 1;
  if (raw > 31) return 31;
  return raw;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampInterval(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return LIMITS.intervalMin;
  const whole = Math.trunc(value);
  if (whole < LIMITS.intervalMin) return LIMITS.intervalMin;
  if (whole > LIMITS.intervalMax) return LIMITS.intervalMax;
  return whole;
}
