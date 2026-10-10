import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, cleanText, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import { nextDue, type RepeatKind } from '../domain/repeat.ts';
import { ftsQuery } from '../domain/search.ts';
import { nowIso, readDue, storedDue } from '../domain/time.ts';
import type { TaskInput, TaskListFilter, TaskPatch, TaskRow } from './types.ts';
import { assertRoom, emptyToNull, flag, hasOwn, wholeOrNull } from './util.ts';

const SEARCH_CAP = 200;
const KINDS: readonly RepeatKind[] = ['none', 'daily', 'weekly', 'monthly', 'after_complete'];
const TASK_COLUMNS = [
  'list_id',
  'section_id',
  'title',
  'notes',
  'priority',
  'all_day',
  'start_at',
  'due_at',
  'repeat_kind',
  'repeat_days',
  'repeat_interval_days',
  'repeat_month_day',
  'reminder_offset_minutes',
  'notification_id',
  'calendar_id',
  'calendar_event_id',
  'sort',
  'updated_at',
] as const;

export async function getTask(db: SQLiteDatabase, id: string): Promise<TaskRow | null> {
  return db.getFirstAsync<TaskRow>('SELECT * FROM task WHERE id = ?', id);
}

export async function createTask(db: SQLiteDatabase, input: TaskInput): Promise<TaskRow> {
  let created: TaskRow | null = null;
  await db.withTransactionAsync(async () => {
    created = await insertTask(db, input);
  });
  if (!created) throw new Error('Task was not saved.');
  return created;
}

export async function insertTask(db: SQLiteDatabase, input: TaskInput): Promise<TaskRow> {
  const title = requireText(input.title, LIMITS.title);
  const notes = cleanText(input.notes ?? '', LIMITS.notes);
  const list = await db.getFirstAsync<{ id: string }>('SELECT id FROM list WHERE id = ?', input.list_id);
  if (!list) throw new Error('List not found.');
  await assertRoom(db, "SELECT COUNT(*) AS n FROM task WHERE status = 'open'", LIMITS.openTasks, 'openTasks');

  const allDay = flag(input.all_day);
  const dueAt = persistDue(input.due_at ?? null, allDay === 1);
  const startAt = allDay === 1 ? null : emptyToNull(input.start_at);
  const kind = requireKind(input.repeat_kind ?? 'none');
  const repeatDays = storedWeekdays(input.repeat_days ?? null);
  const sectionId = emptyToNull(input.section_id);
  await assertSectionOnList(db, sectionId, input.list_id);

  const sort =
    input.sort == null
      ? await nextSort(db, input.list_id)
      : requireSort(input.sort);
  const id = newId();
  const now = nowIso();
  const monthDay = kind === 'monthly' && dueAt ? readDue(dueAt, allDay === 1).getDate() : null;

  await db.runAsync(
    `INSERT INTO task (
       id, list_id, section_id, title, notes, status, priority, all_day, start_at, due_at,
       repeat_kind, repeat_days, repeat_interval_days, repeat_month_day, reminder_offset_minutes,
       notification_id, calendar_id, calendar_event_id, sort, completed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.list_id,
    sectionId,
    title,
    notes,
    'open',
    requirePriority(input.priority ?? 0),
    allDay,
    startAt,
    dueAt,
    kind,
    repeatDays,
    wholeOrNull(input.repeat_interval_days),
    monthDay,
    wholeOrNull(input.reminder_offset_minutes),
    emptyToNull(input.notification_id),
    emptyToNull(input.calendar_id),
    emptyToNull(input.calendar_event_id),
    sort,
    null,
    now,
    now,
  );
  const row = await getTask(db, id);
  if (!row) throw new Error('Task was not saved.');
  return row;
}

export async function updateTask(db: SQLiteDatabase, id: string, patch: TaskPatch): Promise<TaskRow> {
  const existing = await getTask(db, id);
  if (!existing) throw new Error('Task not found.');
  const values: Record<string, SQLiteBindValue> = {};

  if (hasOwn(patch, 'title')) values.title = requireText(String(patch.title ?? ''), LIMITS.title);
  if (hasOwn(patch, 'notes')) values.notes = cleanText(patch.notes ?? '', LIMITS.notes);
  if (hasOwn(patch, 'priority')) values.priority = requirePriority(patch.priority ?? 0);
  if (hasOwn(patch, 'reminder_offset_minutes')) {
    values.reminder_offset_minutes = wholeOrNull(patch.reminder_offset_minutes);
  }
  if (hasOwn(patch, 'notification_id')) values.notification_id = emptyToNull(patch.notification_id);
  if (hasOwn(patch, 'calendar_id')) values.calendar_id = emptyToNull(patch.calendar_id);
  if (hasOwn(patch, 'calendar_event_id')) values.calendar_event_id = emptyToNull(patch.calendar_event_id);
  if (hasOwn(patch, 'sort')) values.sort = requireSort(patch.sort ?? Number.NaN);

  const listMoving = hasOwn(patch, 'list_id') && patch.list_id !== existing.list_id;
  if (hasOwn(patch, 'list_id') && patch.list_id) {
    const list = await db.getFirstAsync<{ id: string }>('SELECT id FROM list WHERE id = ?', patch.list_id);
    if (!list) throw new Error('List not found.');
    values.list_id = patch.list_id;
  }
  if (listMoving || hasOwn(patch, 'section_id')) {
    const requested = hasOwn(patch, 'section_id') ? emptyToNull(patch.section_id) : null;
    const destination = typeof values.list_id === 'string' ? values.list_id : existing.list_id;
    if (requested == null) {
      values.section_id = null;
    } else {
      const section = await db.getFirstAsync<{ list_id: string }>('SELECT list_id FROM section WHERE id = ?', requested);
      if (!section) throw new Error('Section not found.');
      if (section.list_id === destination) values.section_id = requested;
      else if (listMoving) values.section_id = null;
      else throw new Error('That section belongs to another list.');
    }
  }

  if (hasOwn(patch, 'all_day') || hasOwn(patch, 'due_at')) {
    const allDay = hasOwn(patch, 'all_day') ? flag(patch.all_day) : existing.all_day;
    const dueSource = hasOwn(patch, 'due_at') ? patch.due_at ?? null : existing.due_at;
    values.all_day = allDay;
    values.due_at = persistDue(dueSource, allDay === 1);
    if (allDay === 1) values.start_at = null;
  }
  if (hasOwn(patch, 'start_at')) {
    const allDay = Object.prototype.hasOwnProperty.call(values, 'all_day') ? values.all_day : existing.all_day;
    if (allDay !== 1) values.start_at = emptyToNull(patch.start_at);
  }

  if (hasOwn(patch, 'repeat_kind')) values.repeat_kind = requireKind(String(patch.repeat_kind ?? 'none'));
  if (hasOwn(patch, 'repeat_days')) values.repeat_days = storedWeekdays(patch.repeat_days ?? null);
  if (hasOwn(patch, 'repeat_interval_days')) values.repeat_interval_days = wholeOrNull(patch.repeat_interval_days);

  const dueTouched = hasOwn(patch, 'due_at') || hasOwn(patch, 'all_day');
  const repeatTouched =
    hasOwn(patch, 'repeat_kind') || hasOwn(patch, 'repeat_days') || hasOwn(patch, 'repeat_interval_days');
  if (dueTouched || repeatTouched) {
    const kind = (values.repeat_kind as RepeatKind | undefined) ?? existing.repeat_kind;
    const dueAt = (Object.prototype.hasOwnProperty.call(values, 'due_at') ? values.due_at : existing.due_at) as
      | string
      | null;
    const allDay = (Object.prototype.hasOwnProperty.call(values, 'all_day') ? values.all_day : existing.all_day) === 1;
    if (kind === 'monthly') {
      // A later save of the same due day must not replace the anchor. Completion
      // writes the next due through completeTask, which does not come through here.
      // An edit that actually changes the day is a new anchor.
      const switched = hasOwn(patch, 'repeat_kind') && existing.repeat_kind !== 'monthly';
      const nextDay = typeof dueAt === 'string' && dueAt.length > 0 ? readDue(dueAt, allDay).getDate() : null;
      const previousDay =
        existing.due_at != null && existing.due_at.length > 0
          ? readDue(existing.due_at, existing.all_day === 1).getDate()
          : null;
      const dueDayChanged = hasOwn(patch, 'due_at') && nextDay !== previousDay;
      if (existing.repeat_month_day == null || switched || dueDayChanged) {
        values.repeat_month_day = nextDay;
      }
    } else if (hasOwn(patch, 'repeat_kind')) {
      values.repeat_month_day = null;
    }
  }

  const listId = typeof values.list_id === 'string' ? values.list_id : existing.list_id;
  if (Object.prototype.hasOwnProperty.call(values, 'section_id')) {
    await assertSectionOnList(db, values.section_id == null ? null : String(values.section_id), listId);
  }

  values.updated_at = nowIso();
  const columns = TASK_COLUMNS.filter((key) => Object.prototype.hasOwnProperty.call(values, key));
  if (columns.length === 1) return existing;
  const params = columns.map((key) => values[key]);
  params.push(id);
  await db.runAsync(
    `UPDATE task SET ${columns.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    ...params,
  );
  const row = await getTask(db, id);
  if (!row) throw new Error('Task not found.');
  return row;
}

export async function deleteTask(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM task WHERE id = ?', id);
  if (result.changes === 0) throw new Error('Task not found.');
}

export async function listTasks(db: SQLiteDatabase, filter: TaskListFilter = {}): Promise<TaskRow[]> {
  const status = filter.status === 'open' || filter.status === 'completed' ? filter.status : null;
  const listId = filter.listId ?? null;
  if (filter.search !== undefined) {
    const match = ftsQuery(filter.search);
    if (match == null) return [];
    return db.getAllAsync<TaskRow>(
      `SELECT task.* FROM task
       JOIN task_fts ON task_fts.task_id = task.id
       WHERE task_fts MATCH ?
         AND (? IS NULL OR task.list_id = ?)
         AND (? IS NULL OR task.status = ?)
       ORDER BY task.updated_at DESC
       LIMIT ?`,
      match,
      listId,
      listId,
      status,
      status,
      SEARCH_CAP,
    );
  }
  return db.getAllAsync<TaskRow>(
    `SELECT * FROM task
     WHERE (? IS NULL OR list_id = ?)
       AND (? IS NULL OR status = ?)
     ORDER BY sort ASC, created_at ASC, id ASC`,
    listId,
    listId,
    status,
    status,
  );
}

export async function openTasksWithDue(db: SQLiteDatabase): Promise<TaskRow[]> {
  return db.getAllAsync<TaskRow>(
    `SELECT * FROM task
     WHERE status = 'open' AND due_at IS NOT NULL
     ORDER BY due_at ASC, id ASC`,
  );
}

export async function completeTask(db: SQLiteDatabase, id: string, completedAtIso: string): Promise<TaskRow> {
  let updated: TaskRow | null = null;
  await db.withTransactionAsync(async () => {
    const task = await getTask(db, id);
    if (!task) throw new Error('Task not found.');
    const now = nowIso();
    if (task.repeat_kind === 'none') {
      await db.runAsync(
        `UPDATE task SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
        completedAtIso,
        now,
        id,
      );
    } else {
      if (!task.due_at) throw new Error('A repeating task needs a due date.');
      const kind = task.repeat_kind;
      const dueAt = nextDue({
        dueAt: task.due_at,
        allDay: task.all_day === 1,
        completedAt: completedAtIso,
        kind,
        weekdays: weekdayList(task.repeat_days),
        monthDay: task.repeat_month_day,
        intervalDays: task.repeat_interval_days,
      });
      await db.runAsync(
        `INSERT INTO completion (id, task_id, occurrence_due_at, completed_at) VALUES (?, ?, ?, ?)`,
        newId(),
        id,
        task.due_at,
        completedAtIso,
      );
      let nextStart = task.start_at;
      if (task.start_at) {
        const previousDue = readDue(task.due_at, task.all_day === 1).getTime();
        const followingDue = readDue(dueAt, task.all_day === 1).getTime();
        nextStart = new Date(new Date(task.start_at).getTime() + (followingDue - previousDue)).toISOString();
      }
      await db.runAsync(
        `UPDATE task
         SET status = 'open', completed_at = NULL, due_at = ?, start_at = ?, updated_at = ?
         WHERE id = ?`,
        dueAt,
        nextStart,
        now,
        id,
      );
      await trimCompletions(db);
    }
    updated = await getTask(db, id);
  });
  if (!updated) throw new Error('Task not found.');
  return updated;
}

export async function reopenTask(db: SQLiteDatabase, id: string): Promise<TaskRow> {
  const existing = await getTask(db, id);
  if (!existing) throw new Error('Task not found.');
  await db.runAsync(
    `UPDATE task SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?`,
    nowIso(),
    id,
  );
  const row = await getTask(db, id);
  if (!row) throw new Error('Task not found.');
  return row;
}

async function trimCompletions(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM completion');
  const extra = Number(row?.n ?? 0) - LIMITS.completions;
  if (extra <= 0) return;
  await db.runAsync(
    `DELETE FROM completion WHERE id IN (
       SELECT id FROM completion ORDER BY completed_at ASC, id ASC LIMIT ?
     )`,
    extra,
  );
}

async function nextSort(db: SQLiteDatabase, listId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(sort), -1) AS n FROM task WHERE list_id = ?',
    listId,
  );
  return Number(row?.n ?? -1) + 1;
}

async function assertSectionOnList(
  db: SQLiteDatabase,
  sectionId: string | null,
  listId: string,
): Promise<void> {
  if (sectionId == null) return;
  const section = await db.getFirstAsync<{ list_id: string }>(
    'SELECT list_id FROM section WHERE id = ?',
    sectionId,
  );
  if (!section) throw new Error('Section not found.');
  if (section.list_id !== listId) throw new Error('That section belongs to another list.');
}

function persistDue(value: string | null, allDay: boolean): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const date = readDue(trimmed, allDay);
  if (Number.isNaN(date.getTime())) throw new Error('The due date is not valid.');
  return storedDue(date, allDay);
}

function requireKind(value: string): RepeatKind {
  if ((KINDS as readonly string[]).includes(value)) return value as RepeatKind;
  throw new Error('Repeat must be none, daily, weekly, monthly, or after complete.');
}

function requirePriority(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error('Priority must be between 0 and 3.');
  }
  return value;
}

function requireSort(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Sort must be a number.');
  return Math.trunc(value);
}

function storedWeekdays(value: string | null): string | null {
  if (value == null || value.trim() === '') return null;
  const days = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => day >= 1 && day <= 7);
  if (days.length === 0) return null;
  return days.join(',');
}

function weekdayList(value: string | null): number[] | null {
  const stored = storedWeekdays(value);
  if (stored == null) return null;
  return stored.split(',').map((part) => Number(part));
}
