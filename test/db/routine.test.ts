import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { LIMITS } from '../../src/domain/limits.ts';
import { ROUTINE_TEMPLATE, formatWeekdays, toRoutineBlockView } from '../../src/domain/routine.ts';
import { MIGRATION_SQL } from '../../src/db/migrate.ts';
import {
  addRoutineBlock,
  clearRoutineOverrides,
  completeTask,
  createHabit,
  createTask,
  deleteRoutineBlock,
  deleteTask,
  getLists,
  getRoutineConfig,
  getRoutineDay,
  getRoutineReview,
  getTask,
  listHabits,
  listRoutineBlocks,
  migrate,
  previewRoutineTemplate,
  saveRoutineReview,
  selectRoutineTask,
  setRoutineEnabled,
  setupRoutine,
  suggestEarlierTask,
  updateRoutineBlock,
  updateRoutineDay,
  updateTask,
} from '../../src/db/index.ts';

type Adapter = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

function flatten(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function open(): Adapter {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, ...params) {
      const result = db.prepare(source).run(...(flatten(params) as never[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      return db.prepare(source).all(...(flatten(params) as never[])) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]) {
      const row = db.prepare(source).get(...(flatten(params) as never[]));
      return (row as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function ready(): Promise<Adapter> {
  const db = open();
  await migrate(db as never);
  return db;
}

test('version 1 rows survive and a fresh migrate can run twice', async () => {
  const upgraded = open();
  await upgraded.execAsync(MIGRATION_SQL);
  await upgraded.execAsync('PRAGMA user_version = 1');
  await upgraded.runAsync(
    `INSERT INTO list (id, name, accent, view, sort, is_inbox, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'list-1',
    'Inbox',
    'ink',
    'list',
    0,
    1,
    '2026-11-01T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  );
  await upgraded.runAsync(
    `INSERT INTO settings (
       id, appearance, accent, work_start_minute, work_end_minute, default_list_id,
       default_reminder_offset, writable_calendar_id, focus_minutes, short_break_minutes,
       long_break_minutes, long_break_every, white_noise, focus_cycle_count,
       reminders_inexact, schema_note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    1,
    'system',
    'pine',
    480,
    1320,
    'list-1',
    15,
    null,
    25,
    5,
    15,
    4,
    'silence',
    0,
    0,
    'keep-me',
  );
  await upgraded.runAsync(
    `INSERT INTO task (
       id, list_id, section_id, title, notes, status, priority, all_day, start_at, due_at,
       repeat_kind, repeat_days, repeat_interval_days, repeat_month_day, reminder_offset_minutes,
       notification_id, calendar_id, calendar_event_id, sort, completed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'task-1',
    'list-1',
    null,
    'Old task',
    'old notes',
    'open',
    1,
    0,
    null,
    null,
    'none',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    null,
    '2026-11-01T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  );
  await upgraded.runAsync(
    `INSERT INTO idea (id, title, body, status, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    'idea-1',
    'Old idea',
    'body',
    'raw',
    null,
    '2026-11-01T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  );
  await upgraded.runAsync(
    `INSERT INTO habit (
       id, name, kind, goal, unit, weekdays, reminder_minute, notification_id, archived, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'habit-1',
    'Read',
    'boolean',
    null,
    null,
    '1,2,3,4,5',
    null,
    null,
    0,
    '2026-11-01T00:00:00.000Z',
  );

  await migrate(upgraded as never);
  const task = await upgraded.getFirstAsync<{ title: string; notes: string; next_action: string }>(
    'SELECT title, notes, next_action FROM task WHERE id = ?',
    'task-1',
  );
  assert.equal(task?.title, 'Old task');
  assert.equal(task?.notes, 'old notes');
  assert.equal(task?.next_action, '');
  const idea = await upgraded.getFirstAsync<{ title: string }>('SELECT title FROM idea WHERE id = ?', 'idea-1');
  const habit = await upgraded.getFirstAsync<{ name: string }>('SELECT name FROM habit WHERE id = ?', 'habit-1');
  const settings = await upgraded.getFirstAsync<{ accent: string; schema_note: string }>(
    'SELECT accent, schema_note FROM settings WHERE id = 1',
  );
  assert.equal(idea?.title, 'Old idea');
  assert.equal(habit?.name, 'Read');
  assert.equal(settings?.accent, 'pine');
  assert.equal(settings?.schema_note, 'keep-me');
  const version = await upgraded.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version, 4);
  await migrate(upgraded as never);
  const tasks = await upgraded.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  const configs = await upgraded.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM routine_config');
  assert.equal(tasks?.n, 1);
  assert.equal(configs?.n, 1);

  const fresh = await ready();
  await migrate(fresh as never);
  const lists = await getLists(fresh as never);
  assert.equal(lists.length, 1);
  const freshVersion = await fresh.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(freshVersion?.user_version, 4);
  const column = await fresh.getFirstAsync<{ name: string }>(
    "SELECT name FROM pragma_table_info('task') WHERE name = 'next_action'",
  );
  assert.equal(column?.name, 'next_action');
  const config = await getRoutineConfig(fresh as never);
  assert.equal(config.enabled, false);
  assert.equal(config.initialized, false);
  assert.equal(config.workoutHabitId, null);
  assert.equal((await listRoutineBlocks(fresh as never)).length, 0);

  const legacy = open();
  await legacy.execAsync(`
    CREATE TABLE routine_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      workout_habit_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE routine_block (
      id TEXT PRIMARY KEY NOT NULL,
      pattern TEXT NOT NULL,
      weekdays TEXT NOT NULL,
      sort INTEGER NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      start_minute INTEGER,
      end_minute INTEGER,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      remind INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await legacy.runAsync(
    'INSERT INTO routine_config (id, enabled, workout_habit_id, updated_at) VALUES (?, ?, ?, ?)',
    1,
    1,
    null,
    '2026-11-01T00:00:00.000Z',
  );
  await legacy.runAsync(
    `INSERT INTO routine_block (
       id, pattern, weekdays, sort, title, instructions, start_minute, end_minute,
       role, enabled, remind, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'keep-me',
    'mon_wed',
    '1,3',
    10,
    'Kept',
    'Edited already',
    390,
    null,
    'fixed',
    1,
    0,
    '2026-11-01T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  );
  await legacy.execAsync('PRAGMA user_version = 2');
  await migrate(legacy as never);
  const legacyVersion = await legacy.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(legacyVersion?.user_version, 4);
  const legacyConfig = await getRoutineConfig(legacy as never);
  assert.equal(legacyConfig.enabled, true);
  assert.equal(legacyConfig.initialized, false);
  assert.equal(legacyConfig.workoutHabitId, null);
  const kept = await listRoutineBlocks(legacy as never);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.instructions, 'Edited already');
  await migrate(legacy as never);
  assert.equal((await listRoutineBlocks(legacy as never)).length, 1);
});

test('setup seeds once, preserves later edits, and caps the workout habit', async () => {
  const db = await ready();
  const preview = previewRoutineTemplate();
  assert.equal(preview.patterns.length, 5);
  const first = await setupRoutine(db as never, { createWorkout: true });
  assert.equal(first.config.enabled, true);
  assert.equal(first.config.initialized, true);
  assert.equal(first.insertedBlocks, ROUTINE_TEMPLATE.length);
  assert.equal(first.createdWorkout, true);
  const rows = await listRoutineBlocks(db as never);
  assert.equal(rows.length, ROUTINE_TEMPLATE.length);
  for (const expected of ROUTINE_TEMPLATE) {
    const row = rows.find((item) => item.id === expected.id);
    assert.ok(row, expected.id);
    assert.equal(row?.title, expected.title);
    assert.equal(row?.instructions, expected.instructions);
    assert.equal(row?.start_minute, expected.startMinute);
    assert.equal(row?.end_minute, expected.endMinute);
    assert.equal(row?.role, expected.role);
    assert.equal(row?.weekdays, formatWeekdays(expected.weekdays));
    assert.equal(row?.pattern, expected.pattern);
    assert.equal(row?.remind, 0);
    assert.equal(row?.enabled, 1);
  }
  const tasksBefore = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  await updateRoutineBlock(db as never, 'sat-work', { instructions: 'Edited Saturday work' });
  await deleteRoutineBlock(db as never, 'sun-wind-down');
  await setRoutineEnabled(db as never, false);
  const second = await setupRoutine(db as never, { createWorkout: true });
  assert.equal(second.insertedBlocks, 0);
  assert.equal(second.createdWorkout, false);
  assert.equal(second.config.enabled, false);
  assert.equal(second.config.initialized, true);
  assert.equal(second.workoutHabitId, first.workoutHabitId);
  const edited = (await listRoutineBlocks(db as never)).find((item) => item.id === 'sat-work');
  assert.equal(edited?.instructions, 'Edited Saturday work');
  assert.equal((await listRoutineBlocks(db as never)).some((item) => item.id === 'sun-wind-down'), false);
  const habits = await listHabits(db as never);
  assert.equal(habits.length, 1);
  assert.equal(habits[0]?.name, 'Workout');
  assert.equal(habits[0]?.kind, 'boolean');
  assert.equal(habits[0]?.weekdays, '1,3,5');
  const checkins = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM habit_checkin');
  assert.equal(checkins?.n, 0);
  const tasksAfter = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  assert.equal(tasksAfter?.n, tasksBefore?.n);
  for (const row of await listRoutineBlocks(db as never)) await deleteRoutineBlock(db as never, row.id);
  const emptied = await setupRoutine(db as never, {});
  assert.equal(emptied.insertedBlocks, 0);
  assert.equal(emptied.blockCount, 0);
  assert.equal(emptied.config.initialized, true);
  assert.equal(emptied.config.enabled, false);
  assert.equal(emptied.workoutHabitId, first.workoutHabitId);

  const linked = await ready();
  const existing = await createHabit(linked as never, { name: 'Lifts', kind: 'boolean', weekdays: '1,3,5' });
  const before = (await listHabits(linked as never)).length;
  const setup = await setupRoutine(linked as never, { workoutHabitId: existing.id });
  assert.equal(setup.workoutHabitId, existing.id);
  assert.equal(setup.createdWorkout, false);
  assert.equal(setup.config.enabled, true);
  assert.equal(setup.config.initialized, true);
  assert.equal((await listHabits(linked as never)).length, before);
  await assert.rejects(
    () => setupRoutine(linked as never, { createWorkout: true, workoutHabitId: existing.id }),
    /Choose an existing workout or create one\./,
  );
  assert.equal((await getRoutineConfig(linked as never)).workoutHabitId, existing.id);
  assert.equal((await getRoutineConfig(linked as never)).enabled, true);
  const empty = await ready();
  await assert.rejects(
    () => setupRoutine(empty as never, { createWorkout: true, workoutHabitId: 'missing-habit' }),
    /Choose an existing workout or create one\./,
  );
  assert.equal((await listRoutineBlocks(empty as never)).length, 0);
  assert.equal((await getRoutineConfig(empty as never)).initialized, false);
  assert.equal((await getRoutineConfig(empty as never)).enabled, false);
  await assert.rejects(() => setupRoutine(empty as never, { workoutHabitId: 'missing-habit' }), /Habit not found/);
  assert.equal((await listRoutineBlocks(empty as never)).length, 0);
  assert.equal((await getRoutineConfig(empty as never)).initialized, false);

  const crowded = await ready();
  for (let index = 0; index < LIMITS.habits; index += 1) {
    await createHabit(crowded as never, {
      name: `Habit ${index}`,
      kind: 'boolean',
      weekdays: '1',
      archived: index === 0 ? 1 : 0,
    });
  }
  const habitCount = await crowded.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM habit');
  assert.equal(habitCount?.n, LIMITS.habits);
  await assert.rejects(() => setupRoutine(crowded as never, { createWorkout: true }), /The habits limit has been reached\./);
  assert.equal((await listRoutineBlocks(crowded as never)).length, 0);
  const crowdedConfig = await getRoutineConfig(crowded as never);
  assert.equal(crowdedConfig.initialized, false);
  assert.equal(crowdedConfig.enabled, false);
  assert.equal(crowdedConfig.workoutHabitId, null);
  const afterCap = await crowded.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM habit');
  assert.equal(afterCap?.n, LIMITS.habits);
});

test('blocks validate clocks and roles, and quoted text stays data', async () => {
  const db = await ready();
  await setupRoutine(db as never, {});
  const nasty = "O'Brien '); DROP TABLE task; --";
  const added = await addRoutineBlock(db as never, {
    pattern: 'fri',
    weekdays: [5, 5, 1],
    title: nasty,
    instructions: nasty,
    startMinute: 13 * 60,
    endMinute: 18 * 60,
    role: 'fixed',
  });
  assert.equal(added.title, nasty);
  assert.equal(added.instructions, nasty);
  assert.equal(added.weekdays, '1,5');
  assert.equal(added.remind, 0);
  assert.equal(added.role, 'fixed');
  const tasks = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  assert.equal(tasks?.n, 0);
  const renamed = await updateRoutineBlock(db as never, added.id, { title: 'Attend class' });
  assert.equal(renamed.role, 'fixed');
  assert.equal(renamed.title, 'Attend class');
  const sleep = await addRoutineBlock(db as never, {
    pattern: 'sat',
    weekdays: [6],
    title: 'Late sleep window',
    startMinute: 22 * 60 + 30,
    endMinute: 23 * 60,
    role: 'fixed',
  });
  assert.equal(sleep.start_minute, 22 * 60 + 30);
  assert.equal(sleep.end_minute, 23 * 60);
  await deleteRoutineBlock(db as never, sleep.id);
  await assert.rejects(() => deleteRoutineBlock(db as never, sleep.id), /Block not found/);
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'mon_wed', weekdays: [1], title: 'Bad', startMinute: 10, endMinute: 10, role: 'fixed' }),
    /end must be after/,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'mon_wed', weekdays: [], title: 'Bad', role: 'fixed' }),
    /weekday/i,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'mon_wed', weekdays: [0], title: 'Bad', role: 'fixed' }),
    /1 through 7/,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'mon_wed', weekdays: [1], title: 'Bad', startMinute: 1440, role: 'fixed' }),
    /minute/,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'nope' as 'fri', weekdays: [1], title: 'Bad', role: 'fixed' }),
    /Pattern/,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'fri', weekdays: [1], title: 'Bad', role: 'meeting' as 'fixed' }),
    /Role/,
  );
  await assert.rejects(
    () => addRoutineBlock(db as never, { pattern: 'fri', weekdays: [1], title: '   ', role: 'fixed' }),
    /Title is required/,
  );
  const views = (await listRoutineBlocks(db as never)).map(toRoutineBlockView);
  assert.equal(views.find((item) => item.id === 'mon-wed-class-morning')?.role, 'school');
});

test('day overrides, task links, and reviews stay manual and safe', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  assert.ok(inbox);
  const quote = 'keep "notes" \' ; DROP TABLE routine_day; --';
  const first = await createTask(db as never, {
    list_id: inbox.id,
    title: 'Draw the network',
    notes: quote,
    next_action: 'Start with the bridge',
  });
  assert.equal(first.next_action, 'Start with the bridge');
  assert.equal(first.notes, quote);
  const titled = await updateTask(db as never, first.id, { title: 'Draw the network map' });
  assert.equal(titled.notes, quote);
  assert.equal(titled.next_action, 'Start with the bridge');
  const stepped = await updateTask(db as never, first.id, { next_action: 'Label the VM' });
  assert.equal(stepped.notes, quote);
  assert.equal(stepped.next_action, 'Label the VM');
  const noted = await updateTask(db as never, first.id, { notes: 'edited notes' });
  assert.equal(noted.notes, 'edited notes');
  assert.equal(noted.next_action, 'Label the VM');
  const long = await updateTask(db as never, first.id, { next_action: 'n'.repeat(LIMITS.notes + 25) });
  assert.equal(long.next_action.length, LIMITS.notes);
  assert.equal(long.notes, 'edited notes');
  const blank = await createTask(db as never, { list_id: inbox.id, title: 'No step yet' });
  assert.equal(blank.next_action, '');

  const older = await createTask(db as never, { list_id: inbox.id, title: 'Older open task' });
  const monday = '2026-11-09';
  const tuesday = '2026-11-10';
  await selectRoutineTask(db as never, '2026-11-02', older.id);
  await selectRoutineTask(db as never, '2026-11-05', first.id);
  const suggestion = await suggestEarlierTask(db as never, monday);
  assert.equal(suggestion?.taskId, first.id);
  assert.equal(suggestion?.localDate, '2026-11-05');
  assert.equal((await getRoutineDay(db as never, monday)).selectedTaskId, null);

  const selected = await selectRoutineTask(db as never, monday, older.id);
  assert.equal(selected.selectedTaskStatus, 'open');
  const overridden = await updateRoutineDay(db as never, monday, { noClasses: true, homeAtMinute: 18 * 60 + 15, homeLate: false });
  assert.equal(overridden.noClasses, true);
  assert.equal(overridden.homeAtMinute, 18 * 60 + 15);
  assert.equal(overridden.selectedTaskId, older.id);
  const otherDay = await getRoutineDay(db as never, tuesday);
  assert.equal(otherDay.noClasses, false);
  assert.equal(otherDay.homeAtMinute, null);
  assert.equal(otherDay.selectedTaskId, null);
  const cleared = await clearRoutineOverrides(db as never, monday);
  assert.equal(cleared.noClasses, false);
  assert.equal(cleared.homeAtMinute, null);
  assert.equal(cleared.homeLate, false);
  assert.equal(cleared.selectedTaskId, older.id);

  await assert.rejects(() => updateRoutineDay(db as never, '2026-11-31', { noClasses: true }), /not valid/);
  await assert.rejects(() => updateRoutineDay(db as never, '2026-02-29', { homeAtMinute: 10 }), /not valid/);
  await assert.rejects(() => updateRoutineDay(db as never, monday, { homeAtMinute: 1440 }), /minute/);
  await assert.rejects(() => selectRoutineTask(db as never, monday, "x' OR '1'='1"), /Task not found/);
  const stillSelected = await getRoutineDay(db as never, monday);
  assert.equal(stillSelected.selectedTaskId, older.id);
  const dayRows = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM routine_day WHERE local_date = ?',
    '2026-11-31',
  );
  assert.equal(dayRows?.n, 0);

  await completeTask(db as never, first.id, '2026-11-09T12:00:00.000Z');
  const skipped = await suggestEarlierTask(db as never, monday);
  assert.equal(skipped?.taskId, older.id);
  const completedDay = await getRoutineDay(db as never, '2026-11-05');
  assert.equal(completedDay.selectedTaskStatus, 'completed');
  await assert.rejects(() => selectRoutineTask(db as never, monday, first.id), /not open/);
  assert.equal((await getRoutineDay(db as never, monday)).selectedTaskId, older.id);

  const reviewText = "finished '); DROP TABLE task; --";
  const saved = await saveRoutineReview(db as never, '2026-11-11', {
    finished: reviewText,
    attention: 'portfolio',
    crowded: 'Tuesday night',
    nextTaskId: older.id,
  });
  assert.equal(saved.weekEnding, '2026-11-15');
  assert.equal(saved.finished, reviewText);
  assert.equal(saved.saved, true);
  assert.equal(saved.nextTaskStatus, 'open');
  const sameWeek = await getRoutineReview(db as never, monday);
  assert.equal(sameWeek.finished, reviewText);
  assert.equal(sameWeek.attention, 'portfolio');
  const emptyAnswers = await getRoutineReview(db as never, '2026-11-16');
  assert.equal(emptyAnswers.saved, false);
  assert.equal(emptyAnswers.finished, '');
  assert.equal(emptyAnswers.attention, '');
  assert.equal(emptyAnswers.crowded, '');
  assert.equal(emptyAnswers.nextTaskId, null);
  await assert.rejects(
    () => saveRoutineReview(db as never, monday, { finished: 'changed', attention: 'changed', crowded: 'changed', nextTaskId: 'missing-task' }),
    /Task not found/,
  );
  const kept = await getRoutineReview(db as never, monday);
  assert.equal(kept.finished, reviewText);
  assert.equal(kept.nextTaskId, older.id);
  const preserved = await saveRoutineReview(db as never, tuesday, {
    finished: 'still manual',
    attention: 'still manual',
    crowded: 'still manual',
  });
  assert.equal(preserved.nextTaskId, older.id);
  const taskCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  assert.equal(taskCount?.n, 3);
  const stored = await getTask(db as never, older.id);
  assert.equal(stored?.notes, '');
  assert.notEqual(stored?.title, reviewText);

  await deleteTask(db as never, older.id);
  const afterDelete = await getRoutineDay(db as never, monday);
  assert.equal(afterDelete.selectedTaskId, null);
  assert.equal(afterDelete.selectedTaskStatus, 'none');
  const reviewAfter = await getRoutineReview(db as never, monday);
  assert.equal(reviewAfter.nextTaskId, null);
  assert.equal(reviewAfter.finished, 'still manual');
  assert.equal(await suggestEarlierTask(db as never, monday), null);
});

test('saving a review selects the following Monday in the same transaction', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  assert.ok(inbox);
  const task = await createTask(db as never, { list_id: inbox.id, title: 'Monday task' });
  const other = await createTask(db as never, { list_id: inbox.id, title: 'Already chosen' });
  await updateRoutineDay(db as never, '2026-11-09', {
    noClasses: true,
    homeAtMinute: 18 * 60 + 15,
    homeLate: true,
  });
  await selectRoutineTask(db as never, '2026-11-09', other.id);

  const saved = await saveRoutineReview(db as never, '2026-11-08', {
    finished: 'x',
    attention: 'y',
    crowded: 'z',
    nextTaskId: task.id,
  });
  assert.equal(saved.weekEnding, '2026-11-08');
  assert.equal(saved.nextTaskId, task.id);
  const monday = await getRoutineDay(db as never, '2026-11-09');
  assert.equal(monday.selectedTaskId, task.id);
  assert.equal(monday.noClasses, true);
  assert.equal(monday.homeAtMinute, 18 * 60 + 15);
  assert.equal(monday.homeLate, true);

  await selectRoutineTask(db as never, '2026-11-09', other.id);
  const omitted = await saveRoutineReview(db as never, '2026-11-08', {
    finished: 'x',
    attention: 'y',
    crowded: 'z',
  });
  assert.equal(omitted.nextTaskId, task.id);
  assert.equal((await getRoutineDay(db as never, '2026-11-09')).selectedTaskId, other.id);

  const cleared = await saveRoutineReview(db as never, '2026-11-08', {
    finished: 'x',
    attention: 'y',
    crowded: 'z',
    nextTaskId: null,
  });
  assert.equal(cleared.nextTaskId, null);
  const afterClear = await getRoutineDay(db as never, '2026-11-09');
  assert.equal(afterClear.selectedTaskId, null);
  assert.equal(afterClear.noClasses, true);
  assert.equal(afterClear.homeAtMinute, 18 * 60 + 15);
  assert.equal(afterClear.homeLate, true);

  await selectRoutineTask(db as never, '2026-11-09', other.id);
  await assert.rejects(
    () =>
      saveRoutineReview(db as never, '2026-11-08', {
        finished: 'nope',
        attention: 'nope',
        crowded: 'nope',
        nextTaskId: 'missing-task',
      }),
    /Task not found/,
  );
  const review = await getRoutineReview(db as never, '2026-11-08');
  assert.equal(review.finished, 'x');
  assert.equal(review.nextTaskId, null);
  const rolledBack = await getRoutineDay(db as never, '2026-11-09');
  assert.equal(rolledBack.selectedTaskId, other.id);
  assert.equal(rolledBack.noClasses, true);
  assert.equal(rolledBack.homeAtMinute, 18 * 60 + 15);
  assert.equal(rolledBack.homeLate, true);
});
