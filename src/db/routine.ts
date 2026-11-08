import type { SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, cleanText, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import {
  assertClockWindow,
  formatWeekdays,
  isRoutinePattern,
  isRoutineRole,
  optionalMinute,
  addDateDays,
  previewRoutineTemplate,
  requireDateKey,
  ROUTINE_TEMPLATE,
  toRoutineBlockView,
  weekEndingSunday,
} from '../domain/routine.ts';
import { nowIso } from '../domain/time.ts';
import type {
  EarlierTaskSuggestion,
  RoutineBlockInput,
  RoutineBlockPatch,
  RoutineBlockRow,
  RoutineConfig,
  RoutineDayPatch,
  RoutineDayState,
  RoutineReview,
  RoutineReviewInput,
  SetupRoutineInput,
  SetupRoutineResult,
  TaskLinkStatus,
} from './types.ts';
import { assertRoom, hasOwn } from './util.ts';

export { previewRoutineTemplate, toRoutineBlockView };

type ConfigRow = {
  enabled: number;
  initialized: number;
  workout_habit_id: string | null;
  updated_at: string;
};

type DayRow = {
  local_date: string;
  selected_task_id: string | null;
  no_classes: number;
  home_at_minute: number | null;
  home_late: number;
  task_status: string | null;
};

type ReviewRow = {
  week_ending: string;
  finished: string;
  attention: string;
  crowded: string;
  next_task_id: string | null;
  updated_at: string;
  task_status: string | null;
};

export async function getRoutineConfig(db: SQLiteDatabase): Promise<RoutineConfig> {
  const row = await configRow(db);
  return {
    enabled: row.enabled === 1,
    initialized: row.initialized === 1,
    workoutHabitId: row.workout_habit_id,
    updatedAt: row.updated_at,
  };
}

export async function setRoutineEnabled(db: SQLiteDatabase, enabled: boolean): Promise<RoutineConfig> {
  if (typeof enabled !== 'boolean') throw new Error('Enabled must be true or false.');
  const result = await db.runAsync(
    'UPDATE routine_config SET enabled = ?, updated_at = ? WHERE id = 1',
    enabled ? 1 : 0,
    nowIso(),
  );
  if (result.changes === 0) throw new Error('Routine is not set up.');
  return getRoutineConfig(db);
}

export async function setupRoutine(db: SQLiteDatabase, input: SetupRoutineInput = {}): Promise<SetupRoutineResult> {
  if (input.createWorkout != null && typeof input.createWorkout !== 'boolean') {
    throw new Error('Create workout must be true or false.');
  }
  if (input.createWorkout === true && input.workoutHabitId != null) {
    throw new Error('Choose an existing workout or create one.');
  }
  let insertedBlocks = 0;
  let createdWorkout = false;
  await db.withTransactionAsync(async () => {
    const config = await configRow(db);
    if (config.initialized === 1) return;

    let workoutId = config.workout_habit_id;
    const linkedHabitId = input.workoutHabitId == null ? null : requireId(input.workoutHabitId);
    if (linkedHabitId != null) {
      const habit = await db.getFirstAsync<{ id: string }>('SELECT id FROM habit WHERE id = ?', linkedHabitId);
      if (!habit) throw new Error('Habit not found.');
    }

    const count = await scalar(db, 'SELECT COUNT(*) AS n FROM routine_block');
    if (count === 0) {
      const timestamp = nowIso();
      for (const block of ROUTINE_TEMPLATE) {
        await db.runAsync(
          `INSERT INTO routine_block (
             id, pattern, weekdays, sort, title, instructions, start_minute, end_minute,
             role, enabled, remind, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          block.id,
          block.pattern,
          formatWeekdays(block.weekdays),
          block.sort,
          block.title,
          block.instructions,
          block.startMinute,
          block.endMinute,
          block.role,
          block.enabled ? 1 : 0,
          block.remind ? 1 : 0,
          timestamp,
          timestamp,
        );
        insertedBlocks += 1;
      }
    }

    if (workoutId == null && input.createWorkout === true) {
      await assertRoom(db, 'SELECT COUNT(*) AS n FROM habit', LIMITS.habits, 'habits');
      const habitId = newId();
      const createdAt = nowIso();
      await db.runAsync(
        `INSERT INTO habit (
           id, name, kind, goal, unit, weekdays, reminder_minute, notification_id, archived, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        habitId,
        'Workout',
        'boolean',
        null,
        null,
        '1,3,5',
        null,
        null,
        0,
        createdAt,
      );
      workoutId = habitId;
      createdWorkout = true;
    } else if (workoutId == null && linkedHabitId != null) {
      workoutId = linkedHabitId;
    }

    await db.runAsync(
      'UPDATE routine_config SET initialized = 1, enabled = 1, workout_habit_id = ?, updated_at = ? WHERE id = 1',
      workoutId,
      nowIso(),
    );
  });
  const config = await getRoutineConfig(db);
  const blockCount = await scalar(db, 'SELECT COUNT(*) AS n FROM routine_block');
  return {
    config,
    blockCount,
    insertedBlocks,
    workoutHabitId: config.workoutHabitId,
    createdWorkout,
  };
}

export async function listRoutineBlocks(db: SQLiteDatabase): Promise<RoutineBlockRow[]> {
  return db.getAllAsync<RoutineBlockRow>('SELECT * FROM routine_block ORDER BY sort ASC, id ASC');
}

export async function addRoutineBlock(db: SQLiteDatabase, input: RoutineBlockInput): Promise<RoutineBlockRow> {
  const fields = readBlockInput(input);
  const id = newId();
  const timestamp = nowIso();
  const sort = input.sort == null ? (await nextBlockSort(db)) : requireSort(input.sort);
  await db.runAsync(
    `INSERT INTO routine_block (
       id, pattern, weekdays, sort, title, instructions, start_minute, end_minute,
       role, enabled, remind, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    fields.pattern,
    fields.weekdays,
    sort,
    fields.title,
    fields.instructions,
    fields.startMinute,
    fields.endMinute,
    fields.role,
    fields.enabled,
    fields.remind,
    timestamp,
    timestamp,
  );
  return requireBlock(db, id);
}

export async function updateRoutineBlock(
  db: SQLiteDatabase,
  id: string,
  patch: RoutineBlockPatch,
): Promise<RoutineBlockRow> {
  const blockId = requireId(id);
  const existing = await db.getFirstAsync<RoutineBlockRow>('SELECT * FROM routine_block WHERE id = ?', blockId);
  if (!existing) throw new Error('Block not found.');
  const view = toRoutineBlockView(existing);
  const next = {
    pattern: hasOwn(patch, 'pattern') ? requirePattern(patch.pattern) : view.pattern,
    weekdays: hasOwn(patch, 'weekdays') ? formatWeekdays(patch.weekdays ?? []) : existing.weekdays,
    title: hasOwn(patch, 'title') ? requireText(String(patch.title ?? ''), LIMITS.title) : existing.title,
    instructions: hasOwn(patch, 'instructions') ? readInstructions(patch.instructions) : existing.instructions,
    startMinute: hasOwn(patch, 'startMinute') ? optionalMinute(patch.startMinute ?? null) : existing.start_minute,
    endMinute: hasOwn(patch, 'endMinute') ? optionalMinute(patch.endMinute ?? null) : existing.end_minute,
    role: hasOwn(patch, 'role') ? requireRole(patch.role) : existing.role,
    enabled: hasOwn(patch, 'enabled') ? flag(patch.enabled, 'Enabled') : existing.enabled,
    remind: hasOwn(patch, 'remind') ? flag(patch.remind, 'Remind') : existing.remind,
    sort: hasOwn(patch, 'sort') ? requireSort(patch.sort ?? Number.NaN) : existing.sort,
  };
  assertClockWindow(next.startMinute, next.endMinute);
  await db.runAsync(
    `UPDATE routine_block
     SET pattern = ?, weekdays = ?, sort = ?, title = ?, instructions = ?, start_minute = ?, end_minute = ?,
         role = ?, enabled = ?, remind = ?, updated_at = ?
     WHERE id = ?`,
    next.pattern,
    next.weekdays,
    next.sort,
    next.title,
    next.instructions,
    next.startMinute,
    next.endMinute,
    next.role,
    next.enabled,
    next.remind,
    nowIso(),
    blockId,
  );
  return requireBlock(db, blockId);
}

export async function deleteRoutineBlock(db: SQLiteDatabase, id: string): Promise<void> {
  const blockId = requireId(id);
  const result = await db.runAsync('DELETE FROM routine_block WHERE id = ?', blockId);
  if (result.changes === 0) throw new Error('Block not found.');
}

export async function getRoutineDay(db: SQLiteDatabase, dateKey: string): Promise<RoutineDayState> {
  const localDate = requireDateKey(dateKey);
  const row = await db.getFirstAsync<DayRow>(
    `SELECT routine_day.local_date, routine_day.selected_task_id, routine_day.no_classes,
            routine_day.home_at_minute, routine_day.home_late, task.status AS task_status
     FROM routine_day
     LEFT JOIN task ON task.id = routine_day.selected_task_id
     WHERE routine_day.local_date = ?`,
    localDate,
  );
  if (!row) {
    return {
      localDate,
      selectedTaskId: null,
      selectedTaskStatus: 'none',
      noClasses: false,
      homeAtMinute: null,
      homeLate: false,
    };
  }
  return dayState(row);
}

export async function updateRoutineDay(
  db: SQLiteDatabase,
  dateKey: string,
  patch: RoutineDayPatch,
): Promise<RoutineDayState> {
  const localDate = requireDateKey(dateKey);
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<DayRow>(
      `SELECT local_date, selected_task_id, no_classes, home_at_minute, home_late, NULL AS task_status
       FROM routine_day WHERE local_date = ?`,
      localDate,
    );
    const noClasses = hasOwn(patch, 'noClasses') ? flag(patch.noClasses, 'No classes') : (existing?.no_classes ?? 0);
    const homeLate = hasOwn(patch, 'homeLate') ? flag(patch.homeLate, 'Home late') : (existing?.home_late ?? 0);
    const homeAt = hasOwn(patch, 'homeAtMinute')
      ? optionalMinute(patch.homeAtMinute ?? null)
      : (existing?.home_at_minute ?? null);
    const selected = existing?.selected_task_id ?? null;
    const timestamp = nowIso();
    await db.runAsync(
      `INSERT INTO routine_day (
         local_date, selected_task_id, no_classes, home_at_minute, home_late, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(local_date) DO UPDATE SET
         no_classes = excluded.no_classes,
         home_at_minute = excluded.home_at_minute,
         home_late = excluded.home_late,
         updated_at = excluded.updated_at`,
      localDate,
      selected,
      noClasses,
      homeAt,
      homeLate,
      timestamp,
    );
  });
  return getRoutineDay(db, localDate);
}

export async function clearRoutineOverrides(db: SQLiteDatabase, dateKey: string): Promise<RoutineDayState> {
  return updateRoutineDay(db, dateKey, { noClasses: false, homeAtMinute: null, homeLate: false });
}

export async function selectRoutineTask(
  db: SQLiteDatabase,
  dateKey: string,
  taskId: string | null,
): Promise<RoutineDayState> {
  const localDate = requireDateKey(dateKey);
  const selected = taskId == null ? null : requireId(taskId);
  await db.withTransactionAsync(async () => {
    if (selected != null) await assertOpenTask(db, selected);
    const existing = await db.getFirstAsync<{ no_classes: number; home_at_minute: number | null; home_late: number }>(
      'SELECT no_classes, home_at_minute, home_late FROM routine_day WHERE local_date = ?',
      localDate,
    );
    await db.runAsync(
      `INSERT INTO routine_day (
         local_date, selected_task_id, no_classes, home_at_minute, home_late, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(local_date) DO UPDATE SET
         selected_task_id = excluded.selected_task_id,
         updated_at = excluded.updated_at`,
      localDate,
      selected,
      existing?.no_classes ?? 0,
      existing?.home_at_minute ?? null,
      existing?.home_late ?? 0,
      nowIso(),
    );
  });
  return getRoutineDay(db, localDate);
}

export async function suggestEarlierTask(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<EarlierTaskSuggestion | null> {
  const localDate = requireDateKey(dateKey);
  return db.getFirstAsync<EarlierTaskSuggestion>(
    `SELECT routine_day.selected_task_id AS taskId, routine_day.local_date AS localDate, task.title AS title
     FROM routine_day
     JOIN task ON task.id = routine_day.selected_task_id
     WHERE routine_day.local_date < ?
       AND task.status = 'open'
     ORDER BY routine_day.local_date DESC
     LIMIT 1`,
    localDate,
  );
}

export async function getRoutineReview(db: SQLiteDatabase, dateKey: string): Promise<RoutineReview> {
  const weekEnding = weekEndingSunday(dateKey);
  const row = await db.getFirstAsync<ReviewRow>(
    `SELECT routine_review.week_ending, routine_review.finished, routine_review.attention, routine_review.crowded,
            routine_review.next_task_id, routine_review.updated_at, task.status AS task_status
     FROM routine_review
     LEFT JOIN task ON task.id = routine_review.next_task_id
     WHERE routine_review.week_ending = ?`,
    weekEnding,
  );
  if (!row) {
    return {
      weekEnding,
      finished: '',
      attention: '',
      crowded: '',
      nextTaskId: null,
      nextTaskStatus: 'none',
      saved: false,
      updatedAt: null,
    };
  }
  return {
    weekEnding: row.week_ending,
    finished: row.finished,
    attention: row.attention,
    crowded: row.crowded,
    nextTaskId: row.next_task_id,
    nextTaskStatus: linkStatus(row.next_task_id, row.task_status),
    saved: true,
    updatedAt: row.updated_at,
  };
}

export async function saveRoutineReview(
  db: SQLiteDatabase,
  dateKey: string,
  input: RoutineReviewInput,
): Promise<RoutineReview> {
  const weekEnding = weekEndingSunday(dateKey);
  const finished = readAnswer(input.finished);
  const attention = readAnswer(input.attention);
  const crowded = readAnswer(input.crowded);
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ next_task_id: string | null }>(
      'SELECT next_task_id FROM routine_review WHERE week_ending = ?',
      weekEnding,
    );
    let nextTaskId = existing?.next_task_id ?? null;
    if (hasOwn(input, 'nextTaskId')) {
      nextTaskId = input.nextTaskId == null ? null : requireId(input.nextTaskId);
      if (nextTaskId != null) await assertOpenTask(db, nextTaskId);
    }
    await db.runAsync(
      `INSERT INTO routine_review (
         week_ending, finished, attention, crowded, next_task_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_ending) DO UPDATE SET
         finished = excluded.finished,
         attention = excluded.attention,
         crowded = excluded.crowded,
         next_task_id = excluded.next_task_id,
         updated_at = excluded.updated_at`,
      weekEnding,
      finished,
      attention,
      crowded,
      nextTaskId,
      nowIso(),
    );
    if (hasOwn(input, 'nextTaskId')) {
      const monday = addDateDays(weekEnding, 1);
      const day = await db.getFirstAsync<{ no_classes: number; home_at_minute: number | null; home_late: number }>(
        'SELECT no_classes, home_at_minute, home_late FROM routine_day WHERE local_date = ?',
        monday,
      );
      await db.runAsync(
        `INSERT INTO routine_day (
           local_date, selected_task_id, no_classes, home_at_minute, home_late, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(local_date) DO UPDATE SET
           selected_task_id = excluded.selected_task_id,
           updated_at = excluded.updated_at`,
        monday,
        nextTaskId,
        day?.no_classes ?? 0,
        day?.home_at_minute ?? null,
        day?.home_late ?? 0,
        nowIso(),
      );
    }
  });
  return getRoutineReview(db, weekEnding);
}

async function configRow(db: SQLiteDatabase): Promise<ConfigRow> {
  const row = await db.getFirstAsync<ConfigRow>(
    'SELECT enabled, initialized, workout_habit_id, updated_at FROM routine_config WHERE id = 1',
  );
  if (!row) throw new Error('Routine is not set up.');
  return row;
}

async function requireBlock(db: SQLiteDatabase, id: string): Promise<RoutineBlockRow> {
  const row = await db.getFirstAsync<RoutineBlockRow>('SELECT * FROM routine_block WHERE id = ?', id);
  if (!row) throw new Error('Block not found.');
  return row;
}

async function nextBlockSort(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort), 0) AS n FROM routine_block');
  return Number(row?.n ?? 0) + 1;
}

async function scalar(db: SQLiteDatabase, sql: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(sql);
  return Number(row?.n ?? 0);
}

async function assertOpenTask(db: SQLiteDatabase, id: string): Promise<void> {
  const task = await db.getFirstAsync<{ status: string }>('SELECT status FROM task WHERE id = ?', id);
  if (!task) throw new Error('Task not found.');
  if (task.status !== 'open') throw new Error('Task is not open.');
}

function readBlockInput(input: RoutineBlockInput): {
  pattern: RoutineBlockRow['pattern'];
  weekdays: string;
  title: string;
  instructions: string;
  startMinute: number | null;
  endMinute: number | null;
  role: RoutineBlockRow['role'];
  enabled: number;
  remind: number;
} {
  const startMinute = optionalMinute(input.startMinute ?? null);
  const endMinute = optionalMinute(input.endMinute ?? null);
  assertClockWindow(startMinute, endMinute);
  return {
    pattern: requirePattern(input.pattern),
    weekdays: formatWeekdays(input.weekdays),
    title: requireText(input.title, LIMITS.title),
    instructions: readInstructions(input.instructions),
    startMinute,
    endMinute,
    role: requireRole(input.role),
    enabled: input.enabled == null ? 1 : flag(input.enabled, 'Enabled'),
    remind: input.remind == null ? 0 : flag(input.remind, 'Remind'),
  };
}

function requirePattern(value: unknown): RoutineBlockRow['pattern'] {
  if (typeof value !== 'string' || !isRoutinePattern(value)) throw new Error('Pattern is not valid.');
  return value;
}

function requireRole(value: unknown): RoutineBlockRow['role'] {
  if (typeof value !== 'string' || !isRoutineRole(value)) throw new Error('Role is not valid.');
  return value;
}

function readInstructions(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('Text is required.');
  return cleanText(value, LIMITS.notes);
}

function readAnswer(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Text is required.');
  return cleanText(value, LIMITS.notes);
}

function requireId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('The id is not valid.');
  const id = value.trim();
  if (id.length === 0 || id.length > 80) throw new Error('The id is not valid.');
  return id;
}

function requireSort(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Sort must be a number.');
  return Math.trunc(value);
}

function flag(value: unknown, name: string): number {
  if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`);
  return value ? 1 : 0;
}

function dayState(row: DayRow): RoutineDayState {
  return {
    localDate: row.local_date,
    selectedTaskId: row.selected_task_id,
    selectedTaskStatus: linkStatus(row.selected_task_id, row.task_status),
    noClasses: row.no_classes === 1,
    homeAtMinute: row.home_at_minute,
    homeLate: row.home_late === 1,
  };
}

function linkStatus(id: string | null, status: string | null): TaskLinkStatus {
  if (id == null) return 'none';
  if (status === 'open' || status === 'completed') return status;
  return 'missing';
}
