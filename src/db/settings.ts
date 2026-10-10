import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { SettingsPatch, SettingsRow } from './types.ts';
import { hasOwn } from './util.ts';

const PATCH_KEYS = [
  'appearance',
  'accent',
  'work_start_minute',
  'work_end_minute',
  'default_list_id',
  'default_reminder_offset',
  'writable_calendar_id',
  'focus_minutes',
  'short_break_minutes',
  'long_break_minutes',
  'long_break_every',
  'white_noise',
  'focus_cycle_count',
  'reminders_inexact',
  'schema_note',
] as const;

export async function getSettings(db: SQLiteDatabase): Promise<SettingsRow> {
  const row = await db.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = 1');
  if (!row) throw new Error('Settings are missing.');
  return row;
}

export async function updateSettings(db: SQLiteDatabase, patch: SettingsPatch): Promise<SettingsRow> {
  const sets: string[] = [];
  const params: SQLiteBindValue[] = [];
  for (const key of PATCH_KEYS) {
    if (!hasOwn(patch, key)) continue;
    sets.push(`${key} = ?`);
    params.push(patch[key] ?? null);
  }
  if (sets.length === 0) return getSettings(db);
  params.push(1);
  await db.runAsync(`UPDATE settings SET ${sets.join(', ')} WHERE id = ?`, ...params);
  return getSettings(db);
}
