import type { SQLiteDatabase } from 'expo-sqlite';

import { canCheckDate, clampedCount, toggledBoolean } from '../domain/habits.ts';
import { LIMITS, cleanText, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import { isDateKey, localDateKey, nowIso } from '../domain/time.ts';
import type { CheckinRow, HabitInput, HabitPatch, HabitRow } from './types.ts';
import { assertRoom, emptyToNull, wholeOrNull } from './util.ts';

const CHECKED = toggledBoolean(null);

export async function listHabits(db: SQLiteDatabase): Promise<HabitRow[]> {
  return db.getAllAsync<HabitRow>('SELECT * FROM habit ORDER BY created_at ASC, id ASC');
}

export async function createHabit(db: SQLiteDatabase, input: HabitInput): Promise<HabitRow> {
  const name = requireText(input.name, LIMITS.habitName);
  const kind = requireKind(input.kind);
  const weekdays = requireWeekdays(input.weekdays);
  const goal = kind === 'count' ? requireGoal(input.goal ?? null) : null;
  const unit = kind === 'count' ? optionalUnit(input.unit) : null;
  let created: HabitRow | null = null;
  await db.withTransactionAsync(async () => {
    await assertRoom(db, 'SELECT COUNT(*) AS n FROM habit', LIMITS.habits, 'habits');
    const id = newId();
    await db.runAsync(
      `INSERT INTO habit (
         id, name, kind, goal, unit, weekdays, reminder_minute, notification_id, archived, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      kind,
      goal,
      unit,
      weekdays,
      wholeOrNull(input.reminder_minute),
      emptyToNull(input.notification_id),
      input.archived === 1 ? 1 : 0,
      nowIso(),
    );
    created = await db.getFirstAsync<HabitRow>('SELECT * FROM habit WHERE id = ?', id);
  });
  if (!created) throw new Error('Habit was not saved.');
  return created;
}

export async function updateHabit(db: SQLiteDatabase, id: string, patch: HabitPatch): Promise<void> {
  const existing = await db.getFirstAsync<HabitRow>('SELECT * FROM habit WHERE id = ?', id);
  if (!existing) throw new Error('Habit not found.');
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(requireText(patch.name, LIMITS.habitName));
  }
  if (patch.kind !== undefined) {
    sets.push('kind = ?');
    params.push(requireKind(patch.kind));
  }
  if (patch.goal !== undefined) {
    sets.push('goal = ?');
    params.push(patch.goal == null ? null : requireGoal(patch.goal));
  }
  if (patch.unit !== undefined) {
    sets.push('unit = ?');
    params.push(optionalUnit(patch.unit));
  }
  if (patch.weekdays !== undefined) {
    sets.push('weekdays = ?');
    params.push(requireWeekdays(patch.weekdays));
  }
  if (patch.reminder_minute !== undefined) {
    sets.push('reminder_minute = ?');
    params.push(wholeOrNull(patch.reminder_minute));
  }
  if (patch.notification_id !== undefined) {
    sets.push('notification_id = ?');
    params.push(emptyToNull(patch.notification_id));
  }
  if (patch.archived !== undefined) {
    if (patch.archived !== 0 && patch.archived !== 1) throw new Error('Archived must be 0 or 1.');
    sets.push('archived = ?');
    params.push(patch.archived);
  }
  if (sets.length === 0) return;
  params.push(id);
  const result = await db.runAsync(`UPDATE habit SET ${sets.join(', ')} WHERE id = ?`, ...params);
  if (result.changes === 0) throw new Error('Habit not found.');
}

export async function deleteHabit(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM habit WHERE id = ?', id);
  if (result.changes === 0) throw new Error('Habit not found.');
}

export async function setCheckin(
  db: SQLiteDatabase,
  habitId: string,
  localDate: string,
  value: number | null,
  todayKey = localDateKey(new Date()),
): Promise<void> {
  if (!isDateKey(localDate) || !isDateKey(todayKey)) {
    throw new Error('The check-in date must be YYYY-MM-DD.');
  }
  if (!canCheckDate(localDate, todayKey)) throw new Error('A future date cannot be checked.');
  const habit = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM habit WHERE id = ?', habitId);
  if (!habit) throw new Error('Habit not found.');
  if (value === null) {
    await db.runAsync('DELETE FROM habit_checkin WHERE habit_id = ? AND local_date = ?', habitId, localDate);
    return;
  }
  const stored = habit.kind === 'boolean' ? booleanValue(value) : clampedCount(value);
  await db.runAsync(
    `INSERT INTO habit_checkin (habit_id, local_date, value) VALUES (?, ?, ?)
     ON CONFLICT(habit_id, local_date) DO UPDATE SET value = excluded.value`,
    habitId,
    localDate,
    stored,
  );
}

export async function getCheckins(
  db: SQLiteDatabase,
  habitId: string,
  fromKey: string,
  toKey: string,
): Promise<CheckinRow[]> {
  return db.getAllAsync<CheckinRow>(
    `SELECT habit_id, local_date, value FROM habit_checkin
     WHERE habit_id = ? AND local_date >= ? AND local_date <= ?
     ORDER BY local_date ASC`,
    habitId,
    fromKey,
    toKey,
  );
}

export async function listCheckins(db: SQLiteDatabase): Promise<CheckinRow[]> {
  return db.getAllAsync<CheckinRow>(
    'SELECT habit_id, local_date, value FROM habit_checkin ORDER BY local_date ASC, habit_id ASC',
  );
}

export async function getCheckinsBetween(
  db: SQLiteDatabase,
  fromKey: string,
  toKey: string,
): Promise<CheckinRow[]> {
  return db.getAllAsync<CheckinRow>(
    `SELECT habit_id, local_date, value FROM habit_checkin
     WHERE local_date >= ? AND local_date <= ?
     ORDER BY local_date ASC`,
    fromKey,
    toKey,
  );
}

function booleanValue(value: number): number {
  if (value !== 0 && value !== CHECKED) throw new Error('A boolean check-in must be 0 or 1.');
  return value;
}

function requireKind(value: string): 'boolean' | 'count' {
  if (value === 'boolean' || value === 'count') return value;
  throw new Error('A habit is either boolean or count.');
}

function requireWeekdays(value: string): string {
  const days = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => day >= 1 && day <= 7);
  if (days.length === 0) throw new Error('Pick at least one weekday.');
  return days.join(',');
}

function requireGoal(value: number | null): number {
  if (value == null || !Number.isFinite(value)) throw new Error('The goal must be a number.');
  const whole = Math.trunc(value);
  if (whole < 1 || whole > LIMITS.habitGoalMax) {
    throw new Error(`The goal must be between 1 and ${LIMITS.habitGoalMax}.`);
  }
  return whole;
}

function optionalUnit(value: string | null | undefined): string | null {
  if (value == null) return null;
  const unit = cleanText(value, LIMITS.habitUnit);
  return unit.length === 0 ? null : unit;
}
