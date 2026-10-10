import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../domain/id.ts';
import { nowIso } from '../domain/time.ts';
import type { FocusInput, FocusRow } from './types.ts';
import { emptyToNull, wholeOrNull } from './util.ts';

const SOUNDS = ['silence', 'rain', 'cafe', 'wind'] as const;
const MODES = ['countdown', 'countup'] as const;
const PHASES = ['focus', 'break'] as const;
const STATUSES = ['running', 'completed', 'abandoned'] as const;

type StoredFocus = Omit<FocusRow, 'endedAt' | 'actualSeconds' | 'startedAt' | 'plannedSeconds'>;

export async function runningSession(db: SQLiteDatabase): Promise<FocusRow | null> {
  const row = await db.getFirstAsync<StoredFocus>(
    `SELECT * FROM focus_session WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`,
  );
  return row ? present(row) : null;
}

export async function startSession(db: SQLiteDatabase, input: FocusInput): Promise<FocusRow> {
  const status = input.status ?? 'running';
  let row: FocusRow | null = null;
  await db.withTransactionAsync(async () => {
    if (status === 'running') {
      const existing = await runningSession(db);
      if (existing) {
        row = existing;
        return;
      }
    }
    row = await writeSession(db, input, status);
  });
  if (!row) throw new Error('Focus session was not saved.');
  return row;
}

export async function insertSession(db: SQLiteDatabase, input: FocusInput): Promise<FocusRow> {
  return startSession(db, input);
}

export async function finishSession(
  db: SQLiteDatabase,
  id: string,
  endedAt: string,
  actualSeconds: number,
): Promise<void> {
  await endSession(db, id, 'completed', endedAt, actualSeconds);
}

export async function abandonSession(
  db: SQLiteDatabase,
  id: string,
  endedAt: string,
  actualSeconds: number,
): Promise<void> {
  await endSession(db, id, 'abandoned', endedAt, actualSeconds);
}

export async function sessionsEndedSince(db: SQLiteDatabase, iso: string): Promise<FocusRow[]> {
  const rows = await db.getAllAsync<StoredFocus>(
    `SELECT * FROM focus_session
     WHERE ended_at IS NOT NULL AND ended_at >= ?
     ORDER BY ended_at ASC, id ASC`,
    iso,
  );
  return rows.map(present);
}

export async function deleteSessionsStartedBefore(db: SQLiteDatabase, iso: string): Promise<void> {
  await db.runAsync('DELETE FROM focus_session WHERE started_at < ?', iso);
}

export async function updateSession(
  db: SQLiteDatabase,
  id: string,
  patch: { sound: string },
): Promise<void> {
  const sound = oneOf(patch.sound, SOUNDS, 'The sound must be silence, rain, cafe, or wind.');
  const result = await db.runAsync('UPDATE focus_session SET sound = ? WHERE id = ?', sound, id);
  if (result.changes === 0) throw new Error('Focus session not found.');
}

async function endSession(
  db: SQLiteDatabase,
  id: string,
  status: 'completed' | 'abandoned',
  endedAt: string,
  actualSeconds: number,
): Promise<void> {
  const seconds = wholeOrNull(actualSeconds);
  const result = await db.runAsync(
    `UPDATE focus_session SET status = ?, ended_at = ?, actual_seconds = ? WHERE id = ?`,
    status,
    endedAt,
    seconds,
    id,
  );
  if (result.changes === 0) throw new Error('Focus session not found.');
}

async function writeSession(
  db: SQLiteDatabase,
  input: FocusInput,
  status: FocusInput['status'],
): Promise<FocusRow> {
  const mode = oneOf(input.mode, MODES, 'Focus mode must be countdown or countup.');
  const phase = oneOf(input.phase, PHASES, 'Focus phase must be focus or break.');
  const sound = oneOf(input.sound, SOUNDS, 'The sound must be silence, rain, cafe, or wind.');
  const nextStatus = oneOf(status ?? 'running', STATUSES, 'Focus status is invalid.');
  const taskId = emptyToNull(input.task_id);
  const habitId = emptyToNull(input.habit_id);
  if (taskId && habitId) throw new Error('A focus session can link a task or a habit, not both.');
  const id = newId();
  const startedAt = input.started_at && input.started_at.length > 0 ? input.started_at : nowIso();
  await db.runAsync(
    `INSERT INTO focus_session (
       id, mode, phase, planned_seconds, actual_seconds, sound, task_id, habit_id, status, started_at, ended_at
     ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
    id,
    mode,
    phase,
    wholeOrNull(input.planned_seconds),
    sound,
    taskId,
    habitId,
    nextStatus,
    startedAt,
  );
  const row = await db.getFirstAsync<StoredFocus>('SELECT * FROM focus_session WHERE id = ?', id);
  if (!row) throw new Error('Focus session was not saved.');
  return present(row);
}

function present(row: StoredFocus): FocusRow {
  return {
    ...row,
    endedAt: row.ended_at,
    actualSeconds: row.actual_seconds,
    startedAt: row.started_at,
    plannedSeconds: row.planned_seconds,
  };
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], message: string): T {
  if (value != null && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(message);
}
