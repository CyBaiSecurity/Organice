import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../domain/id.ts';
import { nowIso } from '../domain/time.ts';

// The inbox row and the settings row are inserted in seed() with bound parameters.
// This string has no user text, so execAsync can run it.
export const MIGRATION_SQL = `
CREATE TABLE list (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  accent TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('list', 'board', 'timeline')),
  sort INTEGER NOT NULL,
  is_inbox INTEGER NOT NULL CHECK (is_inbox IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE section (
  id TEXT PRIMARY KEY NOT NULL,
  list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE task (
  id TEXT PRIMARY KEY NOT NULL,
  list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES section(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('open', 'completed')),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 3),
  all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  start_at TEXT,
  due_at TEXT,
  repeat_kind TEXT NOT NULL CHECK (repeat_kind IN ('none', 'daily', 'weekly', 'monthly', 'after_complete')),
  repeat_days TEXT,
  repeat_interval_days INTEGER,
  repeat_month_day INTEGER,
  reminder_offset_minutes INTEGER,
  notification_id TEXT,
  calendar_id TEXT,
  calendar_event_id TEXT,
  sort INTEGER NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE checklist_item (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL CHECK (done IN (0, 1)),
  sort INTEGER NOT NULL
);

CREATE TABLE completion (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  occurrence_due_at TEXT,
  completed_at TEXT NOT NULL
);

CREATE TABLE idea (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('raw', 'compiled', 'reviewed')),
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE idea_review (
  idea_id TEXT PRIMARY KEY NOT NULL REFERENCES idea(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);

CREATE TABLE habit (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('boolean', 'count')),
  goal INTEGER,
  unit TEXT,
  weekdays TEXT NOT NULL,
  reminder_minute INTEGER,
  notification_id TEXT,
  archived INTEGER NOT NULL CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE habit_checkin (
  habit_id TEXT NOT NULL REFERENCES habit(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (habit_id, local_date)
);

CREATE TABLE focus_session (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('countdown', 'countup')),
  phase TEXT NOT NULL CHECK (phase IN ('focus', 'break')),
  planned_seconds INTEGER,
  actual_seconds INTEGER,
  sound TEXT NOT NULL CHECK (sound IN ('silence', 'rain', 'cafe', 'wind')),
  task_id TEXT,
  habit_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'abandoned')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE calendar_cache (
  event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (event_id, calendar_id)
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  appearance TEXT NOT NULL,
  accent TEXT NOT NULL,
  work_start_minute INTEGER NOT NULL,
  work_end_minute INTEGER NOT NULL,
  default_list_id TEXT,
  default_reminder_offset INTEGER,
  writable_calendar_id TEXT,
  focus_minutes INTEGER NOT NULL,
  short_break_minutes INTEGER NOT NULL,
  long_break_minutes INTEGER NOT NULL,
  long_break_every INTEGER NOT NULL,
  white_noise TEXT NOT NULL,
  focus_cycle_count INTEGER NOT NULL DEFAULT 0,
  reminders_inexact INTEGER NOT NULL DEFAULT 0,
  schema_note TEXT
);

CREATE VIRTUAL TABLE task_fts USING fts5(task_id UNINDEXED, title, notes);

CREATE TRIGGER task_fts_insert AFTER INSERT ON task BEGIN
  INSERT INTO task_fts (task_id, title, notes) VALUES (new.id, new.title, new.notes);
END;

CREATE TRIGGER task_fts_update AFTER UPDATE OF title, notes ON task BEGIN
  DELETE FROM task_fts WHERE task_id = old.id;
  INSERT INTO task_fts (task_id, title, notes) VALUES (new.id, new.title, new.notes);
END;

CREATE TRIGGER task_fts_delete AFTER DELETE ON task BEGIN
  DELETE FROM task_fts WHERE task_id = old.id;
END;
`;

// Version 2 adds routine tables and task.next_action. There is no user text in this string.
const MIGRATION_V2_SQL = `
CREATE TABLE IF NOT EXISTS routine_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  workout_habit_id TEXT REFERENCES habit(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_block (
  id TEXT PRIMARY KEY NOT NULL,
  pattern TEXT NOT NULL CHECK (pattern IN ('mon_wed', 'tue_thu', 'fri', 'sat', 'sun')),
  weekdays TEXT NOT NULL,
  sort INTEGER NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  start_minute INTEGER CHECK (start_minute IS NULL OR (start_minute >= 0 AND start_minute <= 1439)),
  end_minute INTEGER CHECK (end_minute IS NULL OR (end_minute >= 0 AND end_minute <= 1439)),
  role TEXT NOT NULL CHECK (role IN (
    'fixed', 'school', 'commute', 'first-hour-at-home', 'evening', 'unconfirmed-meeting'
  )),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  remind INTEGER NOT NULL CHECK (remind IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_minute IS NULL OR (start_minute IS NOT NULL AND end_minute > start_minute))
);

CREATE TABLE IF NOT EXISTS routine_day (
  local_date TEXT PRIMARY KEY NOT NULL,
  selected_task_id TEXT REFERENCES task(id) ON DELETE SET NULL,
  no_classes INTEGER NOT NULL CHECK (no_classes IN (0, 1)),
  home_at_minute INTEGER CHECK (home_at_minute IS NULL OR (home_at_minute >= 0 AND home_at_minute <= 1439)),
  home_late INTEGER NOT NULL CHECK (home_late IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_review (
  week_ending TEXT PRIMARY KEY NOT NULL,
  finished TEXT NOT NULL DEFAULT '',
  attention TEXT NOT NULL DEFAULT '',
  crowded TEXT NOT NULL DEFAULT '',
  next_task_id TEXT REFERENCES task(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
`;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const version = await userVersion(db);
  if (version < 1) {
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_SQL);
      await seed(db);
      await db.execAsync('PRAGMA user_version = 1');
    });
  } else {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
  if (version < 2) await migrateToV2(db);
  if (version < 3) await migrateToV3(db);
  if (version < 4) await migrateToV4(db);
}

async function migrateToV2(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(task)');
    if (!columns.some((column) => column.name === 'next_action')) {
      await db.execAsync("ALTER TABLE task ADD COLUMN next_action TEXT NOT NULL DEFAULT ''");
    }
    await db.execAsync(MIGRATION_V2_SQL);
    await db.runAsync(
      `INSERT INTO routine_config (id, enabled, workout_habit_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      1,
      0,
      null,
      nowIso(),
    );
    await db.execAsync('PRAGMA user_version = 2');
  });
}

// Version 3 records whether setup has already run. Databases already at version 2 gain the column.
async function migrateToV3(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(routine_config)');
    if (columns.length > 0 && !columns.some((column) => column.name === 'initialized')) {
      await db.execAsync('ALTER TABLE routine_config ADD COLUMN initialized INTEGER NOT NULL DEFAULT 0');
    }
    await db.execAsync('PRAGMA user_version = 3');
  });
}

// Version 4 stores routine notification ids. It does not rewrite blocks, tasks, or config.
const MIGRATION_V4_SQL = `
CREATE TABLE IF NOT EXISTS routine_notification (
  identifier TEXT PRIMARY KEY NOT NULL,
  block_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  fires_at TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

async function migrateToV4(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(MIGRATION_V4_SQL);
    await db.execAsync('PRAGMA user_version = 4');
  });
}

async function userVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return Number(row?.user_version ?? 0);
}

async function seed(db: SQLiteDatabase): Promise<void> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO list (id, name, accent, view, sort, is_inbox, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'Inbox',
    'ink',
    'list',
    0,
    1,
    now,
    now,
  );
  await db.runAsync(
    `INSERT INTO settings (
       id, appearance, accent, work_start_minute, work_end_minute, default_list_id,
       default_reminder_offset, writable_calendar_id, focus_minutes, short_break_minutes,
       long_break_minutes, long_break_every, white_noise, focus_cycle_count,
       reminders_inexact, schema_note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    1,
    'system',
    'ink',
    480,
    1320,
    id,
    15,
    null,
    25,
    5,
    15,
    4,
    'silence',
    0,
    0,
    null,
  );
}
