import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { completeTask, createTask, listTaskChoices } from '../../src/db/tasks.ts';
import { getLists } from '../../src/db/lists.ts';
import { migrate } from '../../src/db/migrate.ts';

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

test('open task choices omit completed rows and notes', async () => {
  const db = open();
  await migrate(db as never);
  const lists = await getLists(db as never);
  const inbox = lists.find((list) => list.is_inbox === 1);
  assert.ok(inbox);
  const notes = `secret-note-${'n'.repeat(4000)}`;
  const finished = await createTask(db as never, { list_id: inbox.id, title: 'Finished task', notes });
  const openTask = await createTask(db as never, { list_id: inbox.id, title: 'Open task', notes });
  await completeTask(db as never, finished.id, '2026-11-08T09:00:00.000Z');

  const choices = await listTaskChoices(db as never);

  assert.equal(choices.some((choice) => choice.id === finished.id), false);
  assert.equal(choices.some((choice) => choice.title === 'Finished task'), false);
  const kept = choices.find((choice) => choice.id === openTask.id);
  assert.ok(kept);
  assert.equal(kept.title, 'Open task');
  assert.deepEqual(Object.keys(kept).sort(), ['id', 'title']);
  assert.equal(JSON.stringify(choices).includes('secret-note-'), false);
});
