import type { SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, requireText } from '../domain/limits.ts';
import {
  isRoutineNotificationId,
  parseRoutineNotificationId,
  type OwnedReminder,
} from '../domain/routineReminders.ts';
import { nowIso } from '../domain/time.ts';

export type RoutineNotificationRecord = OwnedReminder & {
  createdAt: string;
  updatedAt: string;
};

type NotificationRow = {
  identifier: string;
  block_id: string;
  local_date: string;
  fires_at: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listRoutineNotifications(db: SQLiteDatabase): Promise<RoutineNotificationRecord[]> {
  const rows = await db.getAllAsync<NotificationRow>(
    `SELECT identifier, block_id, local_date, fires_at, title, created_at, updated_at
     FROM routine_notification
     ORDER BY fires_at, identifier`,
  );
  return rows.map((row) => ({
    identifier: row.identifier,
    blockId: row.block_id,
    dateKey: row.local_date,
    firesAt: row.fires_at,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveRoutineNotification(db: SQLiteDatabase, input: OwnedReminder): Promise<void> {
  const parsed = parseRoutineNotificationId(input.identifier);
  if (!parsed || parsed.blockId !== input.blockId || parsed.dateKey !== input.dateKey) {
    throw new Error('The notification id is not valid.');
  }
  const firesAt = canonicalInstant(input.firesAt);
  if (firesAt == null) throw new Error('The time is not valid.');
  const title = requireText(String(input.title ?? ''), LIMITS.title);
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO routine_notification (
       identifier, block_id, local_date, fires_at, title, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(identifier) DO UPDATE SET
       block_id = excluded.block_id,
       local_date = excluded.local_date,
       fires_at = excluded.fires_at,
       title = excluded.title,
       updated_at = excluded.updated_at`,
    input.identifier,
    parsed.blockId,
    parsed.dateKey,
    firesAt,
    title,
    now,
    now,
  );
}

export async function deleteRoutineNotification(db: SQLiteDatabase, identifier: string): Promise<void> {
  if (!isRoutineNotificationId(identifier)) throw new Error('The notification id is not valid.');
  await db.runAsync('DELETE FROM routine_notification WHERE identifier = ?', identifier);
}

function canonicalInstant(value: string): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}
