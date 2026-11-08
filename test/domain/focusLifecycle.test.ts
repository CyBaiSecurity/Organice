import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOCUS_RECOVERY_MESSAGE,
  abandonFocus,
  completeCountup,
  countdownDue,
  createFocusLock,
  deadlineAlertPlan,
  deadlineNotificationId,
  plannedBreakNotificationId,
  playbackActive,
  reconcileRunning,
  recoveryState,
  type CycleSettings,
  type RunningSnapshot,
} from '../../src/domain/focusLifecycle.ts';

const SHORT = 5 * 60;
const LONG = 15 * 60;
const FOCUS = 25 * 60;

function settings(cycleCount: number, every = 4): CycleSettings {
  return {
    focusCycleCount: cycleCount,
    longBreakEvery: every,
    shortBreakSeconds: SHORT,
    longBreakSeconds: LONG,
  };
}

function focusAt(startedAtMs: number, plannedSeconds: number | null, mode: 'countdown' | 'countup' = 'countdown'): RunningSnapshot {
  return { id: 'focus-1', mode, phase: 'focus', plannedSeconds, startedAtMs };
}

test('exact and late focus completion start the break at the planned deadline', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const exact = started + FOCUS * 1000;
  const onTime = reconcileRunning(focusAt(started, FOCUS), settings(0), exact);
  assert.equal(onTime.type, 'start-break');
  if (onTime.type !== 'start-break') return;
  assert.equal(onTime.focusEndedAtMs, exact);
  assert.equal(onTime.focusActualSeconds, FOCUS);
  assert.equal(onTime.breakStartedAtMs, exact);
  assert.equal(onTime.breakKind, 'short');
  assert.equal(onTime.cycleCount, 1);
  assert.equal(onTime.breakPlannedSeconds, SHORT);

  const late = exact + 60 * 1000;
  const overdue = reconcileRunning(focusAt(started, FOCUS), settings(1), late);
  assert.equal(overdue.type, 'start-break');
  if (overdue.type !== 'start-break') return;
  assert.equal(overdue.breakStartedAtMs, exact);
  assert.notEqual(overdue.breakStartedAtMs, late);
  assert.equal(overdue.focusEndedAtMs, exact);
  assert.equal(overdue.cycleCount, 2);

  const stillOpen = reconcileRunning(
    {
      id: 'break-1',
      mode: 'countdown',
      phase: 'break',
      plannedSeconds: overdue.breakPlannedSeconds,
      startedAtMs: overdue.breakStartedAtMs,
    },
    settings(overdue.cycleCount),
    late,
  );
  assert.equal(stillOpen.type, 'keep');
  assert.equal(reconcileRunning(focusAt(started, FOCUS), settings(0), exact - 1).type, 'keep');
});

test('both deadlines passed finishes the break and does not start another focus', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const focusEnd = started + FOCUS * 1000;
  const breakEnd = focusEnd + SHORT * 1000;
  const now = breakEnd + 10 * 60 * 1000;
  const decision = reconcileRunning(focusAt(started, FOCUS), settings(0), now);
  assert.equal(decision.type, 'finish-elapsed-break');
  if (decision.type !== 'finish-elapsed-break') return;
  assert.equal(decision.focusEndedAtMs, focusEnd);
  assert.equal(decision.breakStartedAtMs, focusEnd);
  assert.equal(decision.breakEndedAtMs, breakEnd);
  assert.ok(decision.breakEndedAtMs < now);
  assert.equal(decision.cycleCountAfterFocus, 1);
  assert.equal(decision.cycleCountAfterBreak, 1);
  assert.equal(decision.breakKind, 'short');
  assert.equal(reconcileRunning(null, settings(decision.cycleCountAfterBreak), now).type, 'keep');

  const atBreakEnd = reconcileRunning(focusAt(started, FOCUS), settings(3), breakEnd + (LONG - SHORT) * 1000);
  assert.equal(atBreakEnd.type, 'finish-elapsed-break');
  if (atBreakEnd.type !== 'finish-elapsed-break') return;
  assert.equal(atBreakEnd.breakKind, 'long');
  assert.equal(atBreakEnd.cycleCountAfterFocus, 4);
  assert.equal(atBreakEnd.cycleCountAfterBreak, 0);
  assert.equal(atBreakEnd.breakStartedAtMs, focusEnd);
  assert.equal(atBreakEnd.breakEndedAtMs, focusEnd + LONG * 1000);
});

test('duplicate reconcile is guarded and idempotent', async () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const now = started + FOCUS * 1000 + 1000;
  const first = reconcileRunning(focusAt(started, FOCUS), settings(0), now);
  const second = reconcileRunning(focusAt(started, FOCUS), settings(0), now);
  assert.deepEqual(first, second);

  const lock = createFocusLock();
  let calls = 0;
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = lock.reconcile(async () => {
    calls += 1;
    await hold;
  });
  const joined = lock.reconcile(async () => {
    calls += 1;
  });
  assert.equal(running, joined);
  release();
  await joined;
  assert.equal(calls, 1);

  await lock.reconcile(async () => {
    calls += 1;
  });
  assert.equal(calls, 2);

  const order: string[] = [];
  let releaseOrder: () => void = () => undefined;
  const orderHold = new Promise<void>((resolve) => {
    releaseOrder = resolve;
  });
  const reconciling = lock.reconcile(async () => {
    order.push('reconcile');
    await orderHold;
    order.push('reconcile-done');
  });
  const action = lock.run(async () => {
    order.push('abandon');
  });
  releaseOrder();
  await action;
  await reconciling;
  assert.deepEqual(order, ['reconcile', 'reconcile-done', 'abandon']);
});

test('countup does not auto-complete and invalid clocks stay running', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const later = started + 3 * 60 * 60 * 1000;
  assert.equal(reconcileRunning(focusAt(started, null, 'countup'), settings(2), later).type, 'keep');
  assert.equal(reconcileRunning(focusAt(started, FOCUS, 'countup'), settings(2), later).type, 'keep');
  assert.equal(countdownDue(focusAt(started, FOCUS, 'countup'), later), false);
  assert.equal(reconcileRunning(focusAt(Number.NaN, FOCUS), settings(0), later).type, 'keep');
  assert.equal(reconcileRunning(focusAt(started, -1), settings(0), later).type, 'keep');
  const stopped = completeCountup(started, started + 90_500);
  assert.equal(stopped.actualSeconds, 91);
  assert.equal(stopped.endedAtMs, started + 90_500);
  assert.equal(completeCountup(Number.NaN, later).actualSeconds, 0);
});

test('abandon resets the focus cycle and leaves a break cycle in place', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const abandoned = abandonFocus({ phase: 'focus', startedAtMs: started }, started + 50_000, 3);
  assert.equal(abandoned.actualSeconds, 50);
  assert.equal(abandoned.endedAtMs, started + 50_000);
  assert.equal(abandoned.resetCycle, true);
  assert.equal(abandoned.cycleCount, 0);

  const breakAbandoned = abandonFocus({ phase: 'break', startedAtMs: started }, started + 10_000, 3);
  assert.equal(breakAbandoned.resetCycle, false);
  assert.equal(breakAbandoned.cycleCount, 3);

  const breakEnd = started + SHORT * 1000;
  const finished = reconcileRunning(
    { id: 'break-1', mode: 'countdown', phase: 'break', plannedSeconds: SHORT, startedAtMs: started },
    settings(2),
    breakEnd + 5000,
  );
  assert.equal(finished.type, 'finish-break');
  if (finished.type !== 'finish-break') return;
  assert.equal(finished.endedAtMs, breakEnd);
  assert.equal(finished.actualSeconds, SHORT);
  assert.equal(finished.breakKind, 'short');
  assert.equal(finished.cycleCount, 2);
  assert.equal(reconcileRunning(null, settings(finished.cycleCount), breakEnd + 5000).type, 'keep');

  const longBreak = reconcileRunning(
    { id: 'break-2', mode: 'countdown', phase: 'break', plannedSeconds: LONG, startedAtMs: started },
    settings(4),
    started + LONG * 1000,
  );
  assert.equal(longBreak.type, 'finish-break');
  if (longBreak.type !== 'finish-break') return;
  assert.equal(longBreak.breakKind, 'long');
  assert.equal(longBreak.cycleCount, 0);
});

test('equal break lengths follow the cycle position', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const equal: CycleSettings = {
    focusCycleCount: 1,
    longBreakEvery: 4,
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 5 * 60,
  };
  const first = reconcileRunning(
    { id: 'break-1', mode: 'countdown', phase: 'break', plannedSeconds: 5 * 60, startedAtMs: started },
    equal,
    started + 5 * 60 * 1000,
  );
  assert.equal(first.type, 'finish-break');
  if (first.type !== 'finish-break') return;
  assert.equal(first.breakKind, 'short');
  assert.equal(first.cycleCount, 1);

  const fourth = reconcileRunning(
    { id: 'break-4', mode: 'countdown', phase: 'break', plannedSeconds: 5 * 60, startedAtMs: started },
    { ...equal, focusCycleCount: 4 },
    started + 5 * 60 * 1000,
  );
  assert.equal(fourth.type, 'finish-break');
  if (fourth.type !== 'finish-break') return;
  assert.equal(fourth.breakKind, 'long');
  assert.equal(fourth.cycleCount, 0);
});

test('countdown alerts cover focus end and the expected break end', () => {
  const started = Date.parse('2026-11-08T01:00:00.000Z');
  const focusEnd = started + FOCUS * 1000;
  const early = deadlineAlertPlan(focusAt(started, FOCUS), settings(0), started + 1000, ['focus-1']);
  assert.deepEqual(early.schedule.map((alert) => alert.identifier), [
    deadlineNotificationId('focus-1'),
    plannedBreakNotificationId('focus-1'),
  ]);
  assert.equal(early.schedule[0]?.fireAtMs, focusEnd);
  assert.equal(early.schedule[0]?.body, 'Focus is done');
  assert.equal(early.schedule[1]?.fireAtMs, focusEnd + SHORT * 1000);
  assert.equal(early.schedule[1]?.body, 'Break is done');
  assert.deepEqual(early.cancel, []);
  assert.equal(deadlineNotificationId('focus-1'), deadlineNotificationId('focus-1'));
  assert.notEqual(deadlineNotificationId('focus-1'), plannedBreakNotificationId('focus-1'));

  const suspended = deadlineAlertPlan(focusAt(started, FOCUS), settings(0), focusEnd + 60 * 1000, ['focus-1']);
  assert.deepEqual(suspended.schedule.map((alert) => alert.body), ['Break is done']);
  assert.equal(suspended.schedule[0]?.fireAtMs, focusEnd + SHORT * 1000);
  assert.deepEqual(suspended.cancel, [deadlineNotificationId('focus-1')]);

  const longer = deadlineAlertPlan(
    focusAt(started, FOCUS),
    { ...settings(0), shortBreakSeconds: 10 * 60 },
    started + 1000,
    ['focus-1'],
  );
  assert.equal(longer.schedule[1]?.fireAtMs, focusEnd + 10 * 60 * 1000);

  const longBreak = deadlineAlertPlan(focusAt(started, FOCUS), settings(3), started + 1000, ['focus-1']);
  assert.equal(longBreak.schedule[1]?.fireAtMs, focusEnd + LONG * 1000);

  const duringBreak = deadlineAlertPlan(
    { id: 'break-9', mode: 'countdown', phase: 'break', plannedSeconds: SHORT, startedAtMs: focusEnd },
    settings(1),
    focusEnd + 1000,
    ['break-9', 'focus-1'],
  );
  assert.deepEqual(duringBreak.schedule.map((alert) => alert.identifier), [deadlineNotificationId('break-9')]);
  assert.equal(duringBreak.schedule[0]?.fireAtMs, focusEnd + SHORT * 1000);
  assert.ok(duringBreak.cancel.includes(plannedBreakNotificationId('focus-1')));
  assert.ok(duringBreak.cancel.includes(deadlineNotificationId('focus-1')));

  assert.deepEqual(deadlineAlertPlan(focusAt(started, null, 'countup'), settings(0), focusEnd, ['focus-1']).schedule, []);
  const idle = deadlineAlertPlan(null, settings(1), focusEnd + SHORT * 1000, ['focus-1', 'break-9']);
  assert.deepEqual(idle.schedule, []);
  assert.ok(idle.cancel.includes(deadlineNotificationId('focus-1')));
  assert.ok(idle.cancel.includes(plannedBreakNotificationId('focus-1')));
  assert.ok(idle.cancel.includes(deadlineNotificationId('break-9')));
});

test('automatic recovery keeps a fixed message and clears it when restore works', () => {
  const failed = recoveryState('failed');
  const restored = recoveryState('restored');
  assert.equal(failed.ready, true);
  assert.equal(failed.error, FOCUS_RECOVERY_MESSAGE);
  assert.equal(restored.ready, true);
  assert.equal(restored.error, null);
  assert.equal(FOCUS_RECOVERY_MESSAGE.includes('sqlite'), false);
  assert.equal(FOCUS_RECOVERY_MESSAGE.toLowerCase().includes('stack'), false);
});

test('sound stays on only for a running focus loop', () => {
  assert.equal(playbackActive({ phase: 'focus', status: 'running', sound: 'rain' }), true);
  assert.equal(playbackActive({ phase: 'break', status: 'running', sound: 'rain' }), false);
  assert.equal(playbackActive({ phase: 'focus', status: 'completed', sound: 'rain' }), false);
  assert.equal(playbackActive({ phase: 'focus', status: 'abandoned', sound: 'cafe' }), false);
  assert.equal(playbackActive({ phase: 'focus', status: 'running', sound: 'silence' }), false);
  assert.equal(playbackActive(null), false);
});
