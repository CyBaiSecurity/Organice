import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  compileIdeas,
  completeTask,
  createIdea,
  createList,
  createSection,
  createTask,
  deleteIdea,
  deleteList,
  exportIdeas,
  finishSession,
  getCachedEvents,
  getIdea,
  getLists,
  getTask,
  importReviews,
  insertSession,
  listTasks,
  migrate,
  renameList,
  replaceCache,
  setCheckin,
  updateSession,
  updateTask,
} from '../../src/db/index.ts';
import { createHabit } from '../../src/db/habits.ts';
import { getCheckins } from '../../src/db/habits.ts';
import { abandonSession } from '../../src/db/focus.ts';

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

test('migrate seeds one Inbox and a second migrate does not add another', async () => {
  const db = await ready();
  await migrate(db as never);
  const lists = await getLists(db as never);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, 'Inbox');
  assert.equal(lists[0].is_inbox, 1);
  await assert.rejects(() => renameList(db as never, lists[0].id, 'Other'), /Inbox cannot be renamed/);
  await assert.rejects(() => deleteList(db as never, lists[0].id), /Inbox cannot be deleted/);
});

test('a daily completion writes one row and skips the missed day', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  const due = new Date(2026, 9, 6, 9, 0, 0);
  const task = await createTask(db as never, {
    list_id: inbox.id,
    title: 'Water',
    notes: 'The green bottle',
    priority: 2,
    due_at: due.toISOString(),
    repeat_kind: 'daily',
  });
  await createSection(db as never, inbox.id, 'Morning');
  const completed = new Date(2026, 9, 8, 10, 0, 0);
  const next = await completeTask(db as never, task.id, completed.toISOString());
  assert.equal(next.status, 'open');
  assert.equal(next.due_at, new Date(2026, 9, 9, 9, 0, 0).toISOString());
  const completions = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM completion');
  const tasks = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM task');
  assert.equal(completions?.n, 1);
  assert.equal(tasks?.n, 1);
});

test('a monthly anchor survives a clamped due and a later save of that same day', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  const task = await createTask(db as never, {
    list_id: inbox.id,
    title: 'Rent',
    all_day: 1,
    due_at: '2026-01-31',
    repeat_kind: 'monthly',
  });
  assert.equal(task.repeat_month_day, 31);
  const clamped = await completeTask(db as never, task.id, new Date(2026, 1, 1, 9, 0, 0).toISOString());
  assert.equal(clamped.due_at, '2026-02-28');
  assert.equal(clamped.repeat_month_day, 31);
  const saved = await updateTask(db as never, task.id, {
    due_at: '2026-02-28',
    all_day: 1,
    repeat_kind: 'monthly',
  });
  assert.equal(saved.repeat_month_day, 31);
  const march = await completeTask(db as never, task.id, new Date(2026, 2, 1, 9, 0, 0).toISOString());
  assert.equal(march.due_at, '2026-03-31');
  assert.equal(march.repeat_month_day, 31);
});

test('moving a task to another list clears the old section', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  const other = await createList(db as never, { name: 'Shop', accent: 'pine' });
  const section = await createSection(db as never, inbox.id, 'Aisle');
  const task = await createTask(db as never, {
    list_id: inbox.id,
    section_id: section.id,
    title: 'Milk',
  });
  const moved = await updateTask(db as never, task.id, { list_id: other.id, section_id: section.id });
  assert.equal(moved.list_id, other.id);
  assert.equal(moved.section_id, null);
  const dest = await createSection(db as never, other.id, 'Produce');
  const bread = await createTask(db as never, {
    list_id: inbox.id,
    section_id: section.id,
    title: 'Bread',
  });
  const kept = await updateTask(db as never, bread.id, { list_id: other.id, section_id: dest.id });
  assert.equal(kept.list_id, other.id);
  assert.equal(kept.section_id, dest.id);
});

test('completing a repeating task moves the start by the same amount as the due', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  const start = new Date(2026, 9, 6, 10, 0, 0);
  const due = new Date(2026, 9, 6, 11, 0, 0);
  const task = await createTask(db as never, {
    list_id: inbox.id,
    title: 'Block',
    start_at: start.toISOString(),
    due_at: due.toISOString(),
    repeat_kind: 'daily',
  });
  const next = await completeTask(db as never, task.id, new Date(2026, 9, 6, 12, 0, 0).toISOString());
  assert.equal(next.due_at, new Date(2026, 9, 7, 11, 0, 0).toISOString());
  assert.equal(next.start_at, new Date(2026, 9, 7, 10, 0, 0).toISOString());
});

test('search quotes the tokens and does not throw on quotes or stars', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  await createTask(db as never, { list_id: inbox.id, title: 'zephyr-needle', notes: 'cedar shavings' });
  const hits = await listTasks(db as never, { search: 'zephyr' });
  assert.equal(hits.length, 1);
  const prefix = await listTasks(db as never, { search: 'zeph' });
  assert.equal(prefix.length, 1);
  const note = await listTasks(db as never, { search: 'ced' });
  assert.equal(note.length, 1);
  const messy = await listTasks(db as never, { search: '"zephyr"*' });
  assert.equal(messy.length, 1);
});

test('review import updates the review only', async () => {
  const db = await ready();
  const idea = await createIdea(db as never, { title: 'Keep this title', body: 'Keep this body' });
  const bad = await importReviews(db as never, JSON.stringify({ organice: 2, exportedAt: 'x', ideas: [] }));
  assert.equal('error' in bad, true);
  const same = await getIdea(db as never, idea.id);
  assert.equal(same?.title, 'Keep this title');
  const file = {
    organice: 1,
    exportedAt: '2026-10-08T12:00:00.000Z',
    ideas: [
      {
        id: idea.id,
        title: 'Replaced',
        body: 'Replaced',
        status: 'raw',
        taskId: null,
        updatedAt: '2026-10-08T12:00:00.000Z',
        review: { text: 'Ship the small version.', reviewedAt: '2026-10-08T12:00:00.000Z' },
      },
      {
        id: 'missing-idea',
        title: 'No',
        body: 'No',
        status: 'raw',
        taskId: null,
        updatedAt: '2026-10-08T12:00:00.000Z',
        review: { text: 'Skip me', reviewedAt: '2026-10-08T12:00:00.000Z' },
      },
    ],
  };
  const result = await importReviews(db as never, JSON.stringify(file));
  assert.deepEqual(result, { updated: 1, skipped: 1 });
  const stored = await getIdea(db as never, idea.id);
  assert.equal(stored?.title, 'Keep this title');
  assert.equal(stored?.body, 'Keep this body');
  assert.equal(stored?.status, 'reviewed');
  assert.equal(stored?.review_text, 'Ship the small version.');
  const exported = await exportIdeas(db as never, [idea.id]);
  assert.equal(exported[0].review?.text, 'Ship the small version.');
});

test('compiling twice keeps both tasks and deleting the idea leaves them', async () => {
  const db = await ready();
  const inbox = (await getLists(db as never))[0];
  const idea = await createIdea(db as never, { title: 'Write the note', body: 'Two paragraphs' });
  await compileIdeas(db as never, [idea.id], inbox.id);
  const first = await getIdea(db as never, idea.id);
  await compileIdeas(db as never, [idea.id], inbox.id);
  const second = await getIdea(db as never, idea.id);
  assert.notEqual(first?.task_id, second?.task_id);
  assert.equal(second?.status, 'compiled');
  await deleteIdea(db as never, idea.id);
  assert.equal(await getIdea(db as never, idea.id), null);
  assert.ok(await getTask(db as never, first?.task_id ?? ''));
  assert.ok(await getTask(db as never, second?.task_id ?? ''));
  assert.equal((await getTask(db as never, second?.task_id ?? ''))?.notes, 'Two paragraphs');
});

test('a check-in can be cleared and a future day is rejected', async () => {
  const db = await ready();
  const habit = await createHabit(db as never, {
    name: 'Read',
    kind: 'boolean',
    goal: null,
    unit: null,
    weekdays: '1,2,3,4,5',
    reminder_minute: null,
  });
  await setCheckin(db as never, habit.id, '2020-01-02', 1);
  await setCheckin(db as never, habit.id, '2020-01-02', null);
  const rows = await getCheckins(db as never, habit.id, '2020-01-01', '2020-01-31');
  assert.equal(rows.length, 0);
  await assert.rejects(() => setCheckin(db as never, habit.id, '2099-01-01', 1), /future/i);
});

test('finish and abandon store different statuses and the sound can change', async () => {
  const db = await ready();
  const session = await insertSession(db as never, {
    mode: 'countdown',
    phase: 'focus',
    planned_seconds: 60,
    sound: 'rain',
    status: 'running',
    started_at: '2026-10-08T12:00:00.000Z',
  });
  await updateSession(db as never, session.id, { sound: 'wind' });
  await finishSession(db as never, session.id, '2026-10-08T12:01:00.000Z', 60);
  const other = await insertSession(db as never, {
    mode: 'countup',
    phase: 'focus',
    planned_seconds: null,
    sound: 'silence',
    status: 'running',
    started_at: '2026-10-08T13:00:00.000Z',
  });
  await abandonSession(db as never, other.id, '2026-10-08T13:05:00.000Z', 300);
  const done = await db.getFirstAsync<{ status: string; sound: string }>(
    'SELECT status, sound FROM focus_session WHERE id = ?',
    session.id,
  );
  const left = await db.getFirstAsync<{ status: string }>('SELECT status FROM focus_session WHERE id = ?', other.id);
  assert.equal(done?.status, 'completed');
  assert.equal(done?.sound, 'wind');
  assert.equal(left?.status, 'abandoned');
});

test('replacing a cache range drops an event that overlaps the range', async () => {
  const db = await ready();
  const start = '2026-10-01T00:00:00.000Z';
  const end = '2026-10-31T00:00:00.000Z';
  await replaceCache(
    db as never,
    [
      {
        event_id: 'old',
        calendar_id: 'cal',
        title: 'Old',
        start_at: '2026-09-30T00:00:00.000Z',
        end_at: '2026-10-02T00:00:00.000Z',
        all_day: 0,
        fetched_at: start,
      },
    ],
    start,
    end,
  );
  await replaceCache(
    db as never,
    [
      {
        event_id: 'new',
        calendar_id: 'cal',
        title: 'New',
        start_at: '2026-10-10T00:00:00.000Z',
        end_at: '2026-10-10T01:00:00.000Z',
        all_day: 0,
        fetched_at: end,
      },
    ],
    start,
    end,
  );
  const rows = await getCachedEvents(db as never, start, end);
  assert.deepEqual(rows.map((row) => row.event_id), ['new']);
});
