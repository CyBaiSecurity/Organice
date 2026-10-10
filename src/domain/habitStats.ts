import { addLocalDays, isoWeekday, localDateKey, parseLocalDateKey } from './time.ts';

export const HABIT_WEEK_COUNT = 8;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function weekdaySet(weekdays: string): Set<number> {
  const days = new Set<number>();
  for (const part of weekdays.split(',')) {
    const day = Number(part.trim());
    if (day >= 1 && day <= 7) days.add(day);
  }
  return days;
}

export function scheduledDates(dates: readonly Date[], weekdays: string): Date[] {
  const allowed = weekdaySet(weekdays);
  return dates.filter((date) => allowed.has(isoWeekday(date)));
}

export type HabitStatSource = {
  id: string;
  name: string;
  kind: 'boolean' | 'count';
  goal: number | null;
  unit: string | null;
  weekdays: string;
  createdOn: string;
  archived: number;
};

export type CheckMark = {
  habitId: string;
  localDate: string;
  value: number;
};

export type WeekBar = {
  weekStart: string;
  met: number;
  due: number;
};

export type DayBar = {
  iso: number;
  label: string;
  met: number;
  due: number;
};

export type HabitStat = {
  id: string;
  name: string;
  kind: 'boolean' | 'count';
  goal: number | null;
  unit: string | null;
  archived: boolean;
  met: number;
  due: number;
  weeks: WeekBar[];
  days: DayBar[];
};

function metValue(kind: 'boolean' | 'count', goal: number | null, value: number | undefined): boolean {
  if (value == null) return false;
  if (kind === 'count') return value >= (goal ?? 1);
  return value >= 1;
}

function mondayOnOrBefore(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  return localDateKey(addLocalDays(date, 1 - isoWeekday(date)));
}

function marksByHabit(marks: readonly CheckMark[]): Map<string, Map<string, number>> {
  const byHabit = new Map<string, Map<string, number>>();
  for (const mark of marks) {
    let dates = byHabit.get(mark.habitId);
    if (!dates) {
      dates = new Map();
      byHabit.set(mark.habitId, dates);
    }
    dates.set(mark.localDate, mark.value);
  }
  return byHabit;
}

export function habitReport(
  habits: readonly HabitStatSource[],
  marks: readonly CheckMark[],
  todayKey: string,
  weekCount = HABIT_WEEK_COUNT,
): HabitStat[] {
  const byHabit = marksByHabit(marks);
  const firstMonday = localDateKey(addLocalDays(parseLocalDateKey(mondayOnOrBefore(todayKey)), -7 * (weekCount - 1)));
  return habits.map((habit) => {
    const allowed = weekdaySet(habit.weekdays);
    const values = byHabit.get(habit.id) ?? new Map<string, number>();
    const weeks: WeekBar[] = [];
    let met = 0;
    let due = 0;
    const dayMet = new Map<number, { met: number; due: number }>();
    for (const iso of allowed) dayMet.set(iso, { met: 0, due: 0 });
    for (let index = 0; index < weekCount; index += 1) {
      const weekStart = localDateKey(addLocalDays(parseLocalDateKey(firstMonday), index * 7));
      let weekMet = 0;
      let weekDue = 0;
      for (let offset = 0; offset < 7; offset += 1) {
        const key = localDateKey(addLocalDays(parseLocalDateKey(weekStart), offset));
        if (key > todayKey || key < habit.createdOn) continue;
        const iso = isoWeekday(parseLocalDateKey(key));
        if (!allowed.has(iso)) continue;
        weekDue += 1;
        due += 1;
        const bucket = dayMet.get(iso);
        if (bucket) bucket.due += 1;
        if (metValue(habit.kind, habit.goal, values.get(key))) {
          weekMet += 1;
          met += 1;
          if (bucket) bucket.met += 1;
        }
      }
      weeks.push({ weekStart, met: weekMet, due: weekDue });
    }
    const days = [...allowed]
      .sort((left, right) => left - right)
      .map((iso) => {
        const bucket = dayMet.get(iso) ?? { met: 0, due: 0 };
        return { iso, label: WEEKDAY_LABELS[iso - 1] ?? '', met: bucket.met, due: bucket.due };
      });
    return {
      id: habit.id,
      name: habit.name,
      kind: habit.kind,
      goal: habit.goal,
      unit: habit.unit,
      archived: habit.archived === 1,
      met,
      due,
      weeks,
      days,
    };
  });
}

function cell(value: string | number | null): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function habitCsv(habits: readonly HabitStatSource[], marks: readonly CheckMark[], todayKey: string): string {
  const byHabit = marksByHabit(marks);
  const lines = ['habit_id,name,kind,goal,unit,local_date,iso_weekday,scheduled,value,met'];
  const sorted = [...habits].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  for (const habit of sorted) {
    if (habit.createdOn > todayKey) continue;
    const allowed = weekdaySet(habit.weekdays);
    const values = byHabit.get(habit.id) ?? new Map<string, number>();
    let cursor = habit.createdOn;
    while (cursor <= todayKey) {
      const iso = isoWeekday(parseLocalDateKey(cursor));
      const scheduled = allowed.has(iso);
      const value = values.get(cursor);
      if (scheduled || value != null) {
        lines.push(
          [
            cell(habit.id),
            cell(habit.name),
            cell(habit.kind),
            cell(habit.goal),
            cell(habit.unit),
            cell(cursor),
            cell(iso),
            cell(scheduled ? 1 : 0),
            cell(value ?? null),
            cell(metValue(habit.kind, habit.goal, value) ? 1 : 0),
          ].join(','),
        );
      }
      cursor = localDateKey(addLocalDays(parseLocalDateKey(cursor), 1));
    }
  }
  return `${lines.join('\n')}\n`;
}
