import type { SQLiteDatabase } from 'expo-sqlite';

import type { CalendarCacheInput } from './types.ts';
import { flag } from './util.ts';

export async function replaceCache(
  db: SQLiteDatabase,
  rows: CalendarCacheInput[],
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM calendar_cache WHERE start_at < ? AND end_at > ?',
      rangeEndIso,
      rangeStartIso,
    );
    for (const row of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO calendar_cache (
           event_id, calendar_id, title, start_at, end_at, all_day, fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.event_id,
        row.calendar_id,
        row.title ?? '',
        row.start_at,
        row.end_at,
        flag(row.all_day),
        row.fetched_at,
      );
    }
  });
}

export async function getCachedEvents(
  db: SQLiteDatabase,
  startIso: string,
  endIso: string,
): Promise<CalendarCacheInput[]> {
  return db.getAllAsync<CalendarCacheInput>(
    `SELECT event_id, calendar_id, title, start_at, end_at, all_day, fetched_at
     FROM calendar_cache
     WHERE start_at < ? AND end_at > ?
     ORDER BY start_at ASC, event_id ASC`,
    endIso,
    startIso,
  );
}
