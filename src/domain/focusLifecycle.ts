import { breakForCompletedFocus, cycleAfterAbandon, cycleAfterBreak } from './focusCycle.ts';
import { LIMITS } from './limits.ts';

export type FocusPhase = 'focus' | 'break';
export type FocusMode = 'countdown' | 'countup';
export type BreakKind = 'short' | 'long';

export type RunningSnapshot = {
  id: string;
  mode: FocusMode;
  phase: FocusPhase;
  plannedSeconds: number | null;
  startedAtMs: number;
};

export type CycleSettings = {
  focusCycleCount: number;
  longBreakEvery: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
};

export type ReconcileDecision =
  | { type: 'keep' }
  | {
      type: 'start-break';
      focusId: string;
      focusEndedAtMs: number;
      focusActualSeconds: number;
      breakKind: BreakKind;
      cycleCount: number;
      breakStartedAtMs: number;
      breakPlannedSeconds: number;
    }
  | {
      type: 'finish-elapsed-break';
      focusId: string;
      focusEndedAtMs: number;
      focusActualSeconds: number;
      breakKind: BreakKind;
      cycleCountAfterFocus: number;
      breakStartedAtMs: number;
      breakPlannedSeconds: number;
      breakEndedAtMs: number;
      breakActualSeconds: number;
      cycleCountAfterBreak: number;
    }
  | {
      type: 'finish-break';
      breakId: string;
      endedAtMs: number;
      actualSeconds: number;
      breakKind: BreakKind;
      cycleCount: number;
    };

export function sessionDeadlineMs(session: {
  mode: FocusMode;
  plannedSeconds: number | null;
  startedAtMs: number;
}): number | null {
  if (session.mode === 'countup') return null;
  if (session.plannedSeconds == null || !Number.isFinite(session.plannedSeconds) || session.plannedSeconds < 0) {
    return null;
  }
  if (!Number.isFinite(session.startedAtMs)) return null;
  return session.startedAtMs + session.plannedSeconds * 1000;
}

export function countdownDue(session: RunningSnapshot, nowMs: number): boolean {
  const deadline = sessionDeadlineMs(session);
  return deadline != null && Number.isFinite(nowMs) && nowMs >= deadline;
}

// Ids are derived from the session row, so a restarted process can cancel the same notification.
export function deadlineNotificationId(sessionId: string): string {
  return `focus-deadline-${sessionId}`;
}

// Armed when a countdown focus starts, before the break row exists. Derived from that focus id.
export function plannedBreakNotificationId(focusSessionId: string): string {
  return `focus-break-deadline-${focusSessionId}`;
}

export type DeadlineAlert = {
  identifier: string;
  fireAtMs: number;
  title: 'Focus';
  body: 'Focus is done' | 'Break is done';
};

export const FOCUS_RECOVERY_MESSAGE = 'Focus could not catch up. It will try again.';

export function recoveryState(outcome: 'restored' | 'failed'): { ready: true; error: string | null } {
  if (outcome === 'failed') return { ready: true, error: FOCUS_RECOVERY_MESSAGE };
  return { ready: true, error: null };
}

// The operating system delivers these alerts. JavaScript does not keep running while the app is suspended.
export function deadlineAlertPlan(
  session: RunningSnapshot | null,
  settings: CycleSettings,
  nowMs: number,
  knownSessionIds: readonly string[],
): { schedule: DeadlineAlert[]; cancel: string[] } {
  const schedule = session == null || session.mode === 'countup' ? [] : alertsForCountdown(session, settings, nowMs);
  const keep = new Set(schedule.map((alert) => alert.identifier));
  const cancel: string[] = [];
  const seen = new Set<string>();
  for (const sessionId of knownSessionIds) {
    if (sessionId.length === 0) continue;
    for (const identifier of [deadlineNotificationId(sessionId), plannedBreakNotificationId(sessionId)]) {
      if (keep.has(identifier) || seen.has(identifier)) continue;
      seen.add(identifier);
      cancel.push(identifier);
    }
  }
  return { schedule, cancel };
}

export function playbackActive(session: { phase: string; status: string; sound: string } | null): boolean {
  if (!session) return false;
  return session.status === 'running' && session.phase === 'focus' && session.sound !== 'silence';
}

export function reconcileRunning(
  session: RunningSnapshot | null,
  settings: CycleSettings,
  nowMs: number,
): ReconcileDecision {
  if (!session || !countdownDue(session, nowMs) || session.plannedSeconds == null) return { type: 'keep' };
  const deadline = sessionDeadlineMs(session);
  if (deadline == null) return { type: 'keep' };

  if (session.phase === 'break') {
    const breakKind = kindForStoredBreak(session.plannedSeconds, settings);
    return {
      type: 'finish-break',
      breakId: session.id,
      endedAtMs: deadline,
      actualSeconds: session.plannedSeconds,
      breakKind,
      cycleCount: cycleAfterBreak(breakKind, settings.focusCycleCount),
    };
  }

  const next = breakForCompletedFocus(settings.focusCycleCount, settings.longBreakEvery);
  const breakPlannedSeconds = next.breakKind === 'long' ? wholeSeconds(settings.longBreakSeconds) : wholeSeconds(settings.shortBreakSeconds);
  const breakStartedAtMs = deadline;
  const breakEndedAtMs = breakStartedAtMs + breakPlannedSeconds * 1000;
  if (nowMs >= breakEndedAtMs) {
    return {
      type: 'finish-elapsed-break',
      focusId: session.id,
      focusEndedAtMs: deadline,
      focusActualSeconds: session.plannedSeconds,
      breakKind: next.breakKind,
      cycleCountAfterFocus: next.cycleCount,
      breakStartedAtMs,
      breakPlannedSeconds,
      breakEndedAtMs,
      breakActualSeconds: breakPlannedSeconds,
      cycleCountAfterBreak: cycleAfterBreak(next.breakKind, next.cycleCount),
    };
  }
  return {
    type: 'start-break',
    focusId: session.id,
    focusEndedAtMs: deadline,
    focusActualSeconds: session.plannedSeconds,
    breakKind: next.breakKind,
    cycleCount: next.cycleCount,
    breakStartedAtMs,
    breakPlannedSeconds,
  };
}

export function abandonFocus(
  session: { phase: FocusPhase; startedAtMs: number },
  nowMs: number,
  cycleCount: number,
): { actualSeconds: number; endedAtMs: number; cycleCount: number; resetCycle: boolean } {
  const elapsed = elapsedSeconds(session.startedAtMs, nowMs);
  const resetCycle = session.phase === 'focus';
  return {
    actualSeconds: elapsed,
    endedAtMs: nowMs,
    cycleCount: resetCycle ? cycleAfterAbandon() : cycleCount,
    resetCycle,
  };
}

export function completeCountup(startedAtMs: number, nowMs: number): { actualSeconds: number; endedAtMs: number } {
  return { actualSeconds: elapsedSeconds(startedAtMs, nowMs), endedAtMs: nowMs };
}

// Concurrent deadline checks share one reconcile. A later call, after that work settles, runs again.
export function createFocusLock() {
  let tail: Promise<void> = Promise.resolve();
  let reconcilePromise: Promise<void> | null = null;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    run: enqueue,
    reconcile(work: () => Promise<void>): Promise<void> {
      if (reconcilePromise) return reconcilePromise;
      const slot: { current: Promise<void> | null } = { current: null };
      const pending = enqueue(work).finally(() => {
        if (reconcilePromise === slot.current) reconcilePromise = null;
      });
      slot.current = pending;
      reconcilePromise = pending;
      return pending;
    },
  };
}

function kindForStoredBreak(plannedSeconds: number, settings: CycleSettings): BreakKind {
  const short = wholeSeconds(settings.shortBreakSeconds);
  const long = wholeSeconds(settings.longBreakSeconds);
  if (plannedSeconds === long && plannedSeconds !== short) return 'long';
  if (plannedSeconds === short && plannedSeconds !== long) return 'short';
  // Equal lengths have no duration signal. A long break is the one that landed on a cycle boundary.
  const every = clampEvery(settings.longBreakEvery);
  const count = Math.trunc(settings.focusCycleCount);
  if (Number.isFinite(count) && count > 0 && count % every === 0) return 'long';
  return 'short';
}

function alertsForCountdown(session: RunningSnapshot, settings: CycleSettings, nowMs: number): DeadlineAlert[] {
  const ownEnd = sessionDeadlineMs(session);
  if (ownEnd == null || session.plannedSeconds == null || !Number.isFinite(nowMs)) return [];
  const alerts: DeadlineAlert[] = [];
  if (ownEnd > nowMs) {
    alerts.push({
      identifier: deadlineNotificationId(session.id),
      fireAtMs: ownEnd,
      title: 'Focus',
      body: session.phase === 'break' ? 'Break is done' : 'Focus is done',
    });
  }
  if (session.phase !== 'focus') return alerts;
  const next = breakForCompletedFocus(settings.focusCycleCount, settings.longBreakEvery);
  const breakSeconds = next.breakKind === 'long' ? wholeSeconds(settings.longBreakSeconds) : wholeSeconds(settings.shortBreakSeconds);
  const breakEnd = ownEnd + breakSeconds * 1000;
  if (breakEnd > nowMs) {
    alerts.push({
      identifier: plannedBreakNotificationId(session.id),
      fireAtMs: breakEnd,
      title: 'Focus',
      body: 'Break is done',
    });
  }
  return alerts;
}

function clampEvery(every: number): number {
  if (!Number.isFinite(every)) return LIMITS.longBreakEveryMin;
  const whole = Math.trunc(every);
  if (whole < LIMITS.longBreakEveryMin) return LIMITS.longBreakEveryMin;
  if (whole > LIMITS.longBreakEveryMax) return LIMITS.longBreakEveryMax;
  return whole;
}

function wholeSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.round((nowMs - startedAtMs) / 1000));
}
