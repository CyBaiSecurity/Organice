import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { applyFocusTransition, insertSession, lastClosedBreakId, lastClosedFocusId, runningSession } from '../../src/db/focus.ts';
import { migrate } from '../../src/db/migrate.ts';
import { getSettings, updateSettings } from '../../src/db/settings.ts';

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

function open(inject: { failBreakInsert: boolean }): Adapter {
  const db = new DatabaseSync(':memory:');
  let tail: Promise<void> = Promise.resolve();
  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, ...params) {
      if (inject.failBreakInsert && source.includes('INSERT INTO focus_session')) {
        throw new Error('injected write failure');
      }
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
      const run = tail.then(async () => {
        db.exec('BEGIN');
        try {
          await task();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

async function ready(inject = { failBreakInsert: false }): Promise<Adapter> {
  const db = open(inject);
  await migrate(db as never);
  return db;
}

test('a break insert failure rolls back the finished focus and cycle', async () => {
  const inject = { failBreakInsert: false };
  const db = await ready(inject);
  await updateSettings(db as never, { focus_cycle_count: 2 });
  const focus = await insertSession(db as never, {
    mode: 'countdown',
    phase: 'focus',
    planned_seconds: 25 * 60,
    sound: 'rain',
    status: 'running',
    started_at: '2026-11-08T01:00:00.000Z',
  });
  inject.failBreakInsert = true;
  await assert.rejects(
    () =>
      applyFocusTransition(db as never, {
        kind: 'start-break',
        focusId: focus.id,
        focusEndedAt: '2026-11-08T01:25:00.000Z',
        focusActualSeconds: 25 * 60,
        cycleCount: 3,
        breakStartedAt: '2026-11-08T01:25:00.000Z',
        breakPlannedSeconds: 5 * 60,
      }),
    /injected write failure/,
  );
  const still = await runningSession(db as never);
  assert.equal(still?.id, focus.id);
  assert.equal(still?.status, 'running');
  assert.equal(still?.phase, 'focus');
  const cycle = await getSettings(db as never);
  assert.equal(cycle.focus_cycle_count, 2);
  const breaks = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM focus_session WHERE phase = 'break'");
  assert.equal(breaks?.n, 0);
});

test('replaying or overlapping a focus transition does not insert a second break', async () => {
  const db = await ready();
  await updateSettings(db as never, { focus_cycle_count: 0 });
  const focus = await insertSession(db as never, {
    mode: 'countdown',
    phase: 'focus',
    planned_seconds: 25 * 60,
    sound: 'silence',
    status: 'running',
    started_at: '2026-11-08T01:00:00.000Z',
  });
  const transition = {
    kind: 'start-break' as const,
    focusId: focus.id,
    focusEndedAt: '2026-11-08T01:25:00.000Z',
    focusActualSeconds: 25 * 60,
    cycleCount: 1,
    breakStartedAt: '2026-11-08T01:25:00.000Z',
    breakPlannedSeconds: 5 * 60,
  };
  const [first, second] = await Promise.all([
    applyFocusTransition(db as never, transition),
    applyFocusTransition(db as never, transition),
  ]);
  const applied = [first.applied, second.applied].filter(Boolean);
  assert.equal(applied.length, 1);
  const replay = await applyFocusTransition(db as never, transition);
  assert.equal(replay.applied, false);
  assert.equal(replay.breakSession, null);
  const breaks = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM focus_session WHERE phase = 'break'");
  assert.equal(breaks?.n, 1);
  const running = await runningSession(db as never);
  assert.equal(running?.phase, 'break');
  assert.equal(running?.started_at, '2026-11-08T01:25:00.000Z');
  const cycle = await getSettings(db as never);
  assert.equal(cycle.focus_cycle_count, 1);

  const both = await applyFocusTransition(db as never, {
    kind: 'finish-elapsed-break',
    focusId: 'missing',
    focusEndedAt: '2026-11-08T02:00:00.000Z',
    focusActualSeconds: 25 * 60,
    cycleCount: 0,
    breakStartedAt: '2026-11-08T02:00:00.000Z',
    breakPlannedSeconds: 5 * 60,
    breakEndedAt: '2026-11-08T02:05:00.000Z',
    breakActualSeconds: 5 * 60,
  });
  assert.equal(both.applied, false);
  const stillOne = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM focus_session WHERE phase = 'break'");
  assert.equal(stillOne?.n, 1);
  assert.equal(await lastClosedFocusId(db as never), focus.id);
  assert.equal(await lastClosedBreakId(db as never), null);

  const runningBreak = await runningSession(db as never);
  const finished = await applyFocusTransition(db as never, {
    kind: 'finish-break',
    breakId: runningBreak?.id ?? '',
    endedAt: '2026-11-08T01:30:00.000Z',
    actualSeconds: 5 * 60,
    cycleCount: 1,
  });
  assert.equal(finished.applied, true);
  assert.equal(await runningSession(db as never), null);
  assert.equal(await lastClosedBreakId(db as never), runningBreak?.id);
  assert.equal(await lastClosedFocusId(db as never), focus.id);
  const again = await applyFocusTransition(db as never, {
    kind: 'finish-break',
    breakId: runningBreak?.id ?? '',
    endedAt: '2026-11-08T01:30:00.000Z',
    actualSeconds: 5 * 60,
    cycleCount: 0,
  });
  assert.equal(again.applied, false);
  assert.equal((await getSettings(db as never)).focus_cycle_count, 1);
});
