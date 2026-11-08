import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { routineNotificationId } from '../../src/domain/routineReminders.ts';
import {
  getRoutineConfig,
  listRoutineBlocks,
  listRoutineNotifications,
  migrate,
  saveRoutineNotification,
  deleteRoutineNotification,
  setupRoutine,
  updateRoutineBlock,
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

test('version 4 adds notification rows without rewriting routine config', async () => {
  const fresh = open();
  await migrate(fresh as never);
  const version = await fresh.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version, 4);
  const table = await fresh.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'routine_notification'",
  );
  assert.equal(table?.name, 'routine_notification');
  const config = await getRoutineConfig(fresh as never);
  assert.equal(config.enabled, false);
  assert.equal(config.initialized, false);

  await fresh.execAsync('DROP TABLE routine_notification');
  await fresh.execAsync('PRAGMA user_version = 3');
  await setupRoutine(fresh as never);
  const block = (await listRoutineBlocks(fresh as never))[0];
  assert.ok(block);
  await updateRoutineBlock(fresh as never, block.id, { instructions: "Edited '; DROP TABLE routine_block; --" });
  await fresh.runAsync('UPDATE routine_config SET initialized = 1, enabled = 1 WHERE id = 1');
  await migrate(fresh as never);
  const upgraded = await fresh.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(upgraded?.user_version, 4);
  const kept = await getRoutineConfig(fresh as never);
  assert.equal(kept.enabled, true);
  assert.equal(kept.initialized, true);
  const blocks = await listRoutineBlocks(fresh as never);
  assert.equal(blocks[0]?.instructions, "Edited '; DROP TABLE routine_block; --");
  const restored = await fresh.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'routine_notification'",
  );
  assert.equal(restored?.name, 'routine_notification');
  assert.equal((await listRoutineBlocks(fresh as never)).length, blocks.length);

  const identifier = routineNotificationId(block.id, '2026-11-09');
  const title = "Wake up '; DROP TABLE routine_notification; --";
  await saveRoutineNotification(fresh as never, {
    identifier,
    blockId: block.id,
    dateKey: '2026-11-09',
    firesAt: '2026-11-08T22:30:00.000Z',
    title,
  });
  const rows = await listRoutineNotifications(fresh as never);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, title.trim());
  assert.equal(rows[0]?.identifier, identifier);
  const stillThere = await fresh.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'routine_notification'",
  );
  assert.equal(stillThere?.name, 'routine_notification');

  await saveRoutineNotification(fresh as never, {
    identifier,
    blockId: block.id,
    dateKey: '2026-11-09',
    firesAt: '2026-11-08T23:00:00.000Z',
    title: 'Updated title',
  });
  const updated = await listRoutineNotifications(fresh as never);
  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.title, 'Updated title');
  assert.equal(updated[0]?.firesAt, '2026-11-08T23:00:00.000Z');

  await assert.rejects(
    () => saveRoutineNotification(fresh as never, {
      identifier: 'focus-deadline-session-1',
      blockId: 'session-1',
      dateKey: '2026-11-09',
      firesAt: '2026-11-08T22:30:00.000Z',
      title: 'Focus',
    }),
    /notification id is not valid/,
  );
  await assert.rejects(
    () => saveRoutineNotification(fresh as never, {
      identifier: '8b0b6a0e-5c3d-4e42-9c1a-0a0a0a0a0a0a',
      blockId: '8b0b6a0e-5c3d-4e42-9c1a-0a0a0a0a0a0a',
      dateKey: '2026-11-09',
      firesAt: '2026-11-08T22:30:00.000Z',
      title: 'Task',
    }),
    /notification id is not valid/,
  );
  assert.equal((await listRoutineNotifications(fresh as never)).length, 1);
  await deleteRoutineNotification(fresh as never, identifier);
  assert.equal((await listRoutineNotifications(fresh as never)).length, 0);
  await deleteRoutineNotification(fresh as never, identifier);
  assert.equal((await listRoutineNotifications(fresh as never)).length, 0);
});
