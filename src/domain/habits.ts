import { weekdaySet } from './habitStats.ts';
import { LIMITS } from './limits.ts';
import { isoWeekday } from './time.ts';

export function canCheckDate(localDate: string, today: string): boolean {
  return localDate <= today;
}

// A habit is due on a date only when that date's weekday is one the person chose.
// Monday is 1 and Sunday is 7, the same numbers stored on the habit.
export function isDueOn(weekdays: string, date: Date): boolean {
  return weekdaySet(weekdays).has(isoWeekday(date));
}

export function toggledBoolean(current: number | null): number | null {
  if (current === 1) return null;
  return 1;
}

export function clampedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const whole = Math.trunc(value);
  if (whole < 0) return 0;
  if (whole > LIMITS.habitGoalMax) return LIMITS.habitGoalMax;
  return whole;
}
