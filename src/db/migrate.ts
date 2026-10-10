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

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = Number(row?.user_version ?? 0);
  if (version >= 1) {
    await db.execAsync('PRAGMA foreign_keys = ON');
    return;
  }

  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.withTransactionAsync(async () => {
    await db.execAsync(MIGRATION_SQL);
    await seed(db);
    await db.execAsync('PRAGMA user_version = 1');
  });
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
