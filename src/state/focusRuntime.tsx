import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SchedulableTriggerInputTypes, cancelScheduledNotificationAsync, scheduleNotificationAsync } from 'expo-notifications';

import {
  abandonSession,
  deleteSessionsStartedBefore,
  finishSession,
  getSettings,
  insertSession,
  runningSession,
  updateSession,
  updateSettings,
  type FocusRow,
} from '@/db';
import { applyFocusTransition, lastClosedBreakId, lastClosedFocusId, type FocusTransition } from '@/db/focus';
import { LIMITS } from '@/domain/limits';
import {
  abandonFocus,
  completeCountup,
  countdownDue,
  createFocusLock,
  deadlineAlertPlan,
  playbackActive,
  reconcileRunning,
  recoveryState,
  type CycleSettings,
  type ReconcileDecision,
  type RunningSnapshot,
} from '@/domain/focusLifecycle';
import { nowIso } from '@/domain/time';
import { useFocusLoop } from '@/services/focusAudio';
import { useOrganice, type SettingsRow } from '@/state/organice';

export type FocusSound = 'silence' | 'rain' | 'cafe' | 'wind';

export type FocusRunning = {
  id: string;
  mode: 'countdown' | 'countup';
  phase: 'focus' | 'break';
  planned_seconds: number | null;
  sound: FocusSound;
  started_at: string;
  task_id: string | null;
  habit_id: string | null;
  status: 'running';
};

export type FocusStartInput = {
  mode: 'countdown' | 'countup';
  sound: FocusSound;
  taskId: string | null;
  habitId: string | null;
};

type FocusControls = {
  ready: boolean;
  running: FocusRunning | null;
  stoppedByDevice: boolean;
  recoveryError: string | null;
  start: (input: FocusStartInput) => Promise<'started' | 'busy'>;
  abandon: () => Promise<void>;
  stopCountUp: () => Promise<void>;
  setSound: (sound: FocusSound) => Promise<void>;
};

const Context = createContext<FocusControls | null>(null);

export function FocusRuntimeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { settings, refresh, reloadSettings } = useOrganice();
  const [running, setRunning] = useState<FocusRunning | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const runningRef = useRef<FocusRunning | null>(null);
  const settingsRef = useRef(settings);
  const armedFireAt = useRef<Map<string, number>>(new Map());
  const lockRef = useRef<ReturnType<typeof createFocusLock> | null>(null);
  const reconcileRef = useRef<() => Promise<void>>(async () => undefined);
  if (!lockRef.current) lockRef.current = createFocusLock();
  const lock = lockRef.current;
  settingsRef.current = settings;

  // useAudioPlayer releases when its component unmounts. This provider stays mounted
  // for the app lifetime, so leaving the Focus screen does not stop a running loop.
  const { stoppedByDevice } = useFocusLoop(running?.sound ?? 'silence', playbackActive(running));

  function assignRunning(next: FocusRunning | null) {
    runningRef.current = next;
    setRunning(next);
  }

  async function cancelAlert(identifier: string): Promise<void> {
    try {
      await cancelScheduledNotificationAsync(identifier);
    } catch {
      // A missing id is already cancelled. A notifications module that cannot run must not stop the timer.
    }
    armedFireAt.current.delete(identifier);
  }

  async function syncAlerts(session: FocusRunning | null, cycle: CycleSettings): Promise<void> {
    const previousFocusId = await lastClosedFocusId(db);
    const previousBreakId = await lastClosedBreakId(db);
    const known = [session?.id, previousFocusId, previousBreakId].filter((id): id is string => Boolean(id));
    const plan = deadlineAlertPlan(session ? toSnapshot(session) : null, cycle, Date.now(), known);
    const keep = new Set(plan.schedule.map((alert) => alert.identifier));
    for (const identifier of plan.cancel) await cancelAlert(identifier);
    for (const identifier of armedFireAt.current.keys()) {
      if (!keep.has(identifier)) await cancelAlert(identifier);
    }
    for (const alert of plan.schedule) {
      if (armedFireAt.current.get(alert.identifier) === alert.fireAtMs) continue;
      await cancelAlert(alert.identifier);
      try {
        await scheduleNotificationAsync({
          identifier: alert.identifier,
          content: { title: alert.title, body: alert.body, data: { url: '/focus' } },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: new Date(alert.fireAtMs) },
        });
        armedFireAt.current.set(alert.identifier, alert.fireAtMs);
      } catch {
        armedFireAt.current.delete(alert.identifier);
      }
    }
  }

  async function persistDecision(decision: ReconcileDecision): Promise<boolean> {
    const transition = toTransition(decision);
    if (!transition) return false;
    const result = await applyFocusTransition(db, transition);
    return result.applied;
  }

  async function publishRunning(): Promise<void> {
    const row = await runningSession(db);
    const next = row && row.status === 'running' ? toRunning(row) : null;
    const latest = await getSettings(db);
    assignRunning(next);
    await syncAlerts(next, toCycle(latest));
  }

  async function reconcileNow(): Promise<void> {
    try {
      await lock.reconcile(async () => {
        const cutoff = new Date(Date.now() - LIMITS.focusDays * 24 * 60 * 60 * 1000).toISOString();
        await deleteSessionsStartedBefore(db, cutoff);
        let changed = false;
        for (let pass = 0; pass < 3; pass += 1) {
          const row = await runningSession(db);
          if (!row || row.status !== 'running') break;
          const latest = await getSettings(db);
          const decision = reconcileRunning(toSnapshot(row), toCycle(latest), Date.now());
          if (decision.type === 'keep') break;
          const wrote = await persistDecision(decision);
          if (!wrote) break;
          changed = true;
        }
        await publishRunning();
        if (changed) {
          refresh();
          await reloadSettings();
        }
      });
      const restored = recoveryState('restored');
      setReady(restored.ready);
      setRecoveryError(restored.error);
    } catch {
      const failed = recoveryState('failed');
      setReady(failed.ready);
      setRecoveryError(failed.error);
      await lock.run(() => publishRunning()).catch(() => undefined);
    }
  }

  function requestReconcile(): void {
    void reconcileRef.current().catch(() => {
      const failed = recoveryState('failed');
      setReady(failed.ready);
      setRecoveryError(failed.error);
    });
  }

  reconcileRef.current = reconcileNow;

  useEffect(() => {
    requestReconcile();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestReconcile();
    });
    const timer = setInterval(() => {
      const session = runningRef.current;
      if (!session || !countdownDue(toSnapshot(session), Date.now())) return;
      requestReconcile();
    }, 1000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    requestReconcile();
  }, [ready, settings.short_break_minutes, settings.long_break_minutes, settings.long_break_every, settings.focus_cycle_count]);

  async function start(input: FocusStartInput): Promise<'started' | 'busy'> {
    return lock.run(async () => {
      const existing = await runningSession(db);
      if (existing && existing.status === 'running') {
        const next = toRunning(existing);
        assignRunning(next);
        await syncAlerts(next, toCycle(settingsRef.current));
        return 'busy';
      }
      const minutes = settingsRef.current.focus_minutes;
      const planned = input.mode === 'countdown' ? Math.trunc(minutes) * 60 : null;
      if (planned != null && (!Number.isFinite(planned) || planned < 0)) throw new Error('Focus length is invalid.');
      const row = await insertSession(db, {
        mode: input.mode,
        phase: 'focus',
        planned_seconds: planned,
        sound: input.sound,
        task_id: input.taskId,
        habit_id: input.habitId,
        status: 'running',
        started_at: nowIso(),
      });
      const next = toRunning(row);
      assignRunning(next);
      await syncAlerts(next, toCycle(settingsRef.current));
      setRecoveryError(recoveryState('restored').error);
      refresh();
      return 'started';
    });
  }

  async function abandon(): Promise<void> {
    await lock.run(async () => {
      const row = await runningSession(db);
      if (!row || row.status !== 'running') {
        assignRunning(null);
        await syncAlerts(null, toCycle(settingsRef.current));
        return;
      }
      const decision = abandonFocus(
        { phase: row.phase, startedAtMs: new Date(row.started_at).getTime() },
        Date.now(),
        settingsRef.current.focus_cycle_count,
      );
      assignRunning(null);
      try {
        await abandonSession(db, row.id, iso(decision.endedAtMs), decision.actualSeconds);
        if (decision.resetCycle) {
          await updateSettings(db, { focus_cycle_count: decision.cycleCount });
          await reloadSettings();
        }
        await syncAlerts(null, toCycle(settingsRef.current));
        setRecoveryError(recoveryState('restored').error);
        refresh();
      } catch (error) {
        await publishRunning().catch(() => undefined);
        throw error;
      }
    });
  }

  async function stopCountUp(): Promise<void> {
    await lock.run(async () => {
      const row = await runningSession(db);
      if (!row || row.status !== 'running' || row.mode !== 'countup' || row.phase !== 'focus') return;
      const decision = completeCountup(new Date(row.started_at).getTime(), Date.now());
      assignRunning(null);
      try {
        await finishSession(db, row.id, iso(decision.endedAtMs), decision.actualSeconds);
        await syncAlerts(null, toCycle(settingsRef.current));
        setRecoveryError(recoveryState('restored').error);
        refresh();
      } catch (error) {
        await publishRunning().catch(() => undefined);
        throw error;
      }
    });
  }

  async function setSound(sound: FocusSound): Promise<void> {
    await lock.run(async () => {
      const current = runningRef.current;
      if (!current || current.phase !== 'focus' || current.status !== 'running') return;
      await updateSession(db, current.id, { sound });
      assignRunning({ ...current, sound });
    });
  }

  const value: FocusControls = { ready, running, stoppedByDevice, recoveryError, start, abandon, stopCountUp, setSound };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFocusRuntime(): FocusControls {
  const value = useContext(Context);
  if (!value) throw new Error('FocusRuntimeProvider is missing.');
  return value;
}

function toRunning(row: FocusRow): FocusRunning {
  return {
    id: row.id,
    mode: row.mode,
    phase: row.phase,
    planned_seconds: row.planned_seconds,
    sound: row.sound,
    started_at: row.started_at,
    task_id: row.task_id,
    habit_id: row.habit_id,
    status: 'running',
  };
}

function toSnapshot(row: { id: string; mode: 'countdown' | 'countup'; phase: 'focus' | 'break'; planned_seconds: number | null; started_at: string }): RunningSnapshot {
  return {
    id: row.id,
    mode: row.mode,
    phase: row.phase,
    plannedSeconds: row.planned_seconds,
    startedAtMs: new Date(row.started_at).getTime(),
  };
}

function toCycle(settings: SettingsRow | { focus_cycle_count: number; long_break_every: number; short_break_minutes: number; long_break_minutes: number }): CycleSettings {
  return {
    focusCycleCount: settings.focus_cycle_count,
    longBreakEvery: settings.long_break_every,
    shortBreakSeconds: wholeMinutes(settings.short_break_minutes) * 60,
    longBreakSeconds: wholeMinutes(settings.long_break_minutes) * 60,
  };
}

function wholeMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function toTransition(decision: ReconcileDecision): FocusTransition | null {
  if (decision.type === 'start-break') {
    return {
      kind: 'start-break',
      focusId: decision.focusId,
      focusEndedAt: iso(decision.focusEndedAtMs),
      focusActualSeconds: decision.focusActualSeconds,
      cycleCount: decision.cycleCount,
      breakStartedAt: iso(decision.breakStartedAtMs),
      breakPlannedSeconds: decision.breakPlannedSeconds,
    };
  }
  if (decision.type === 'finish-elapsed-break') {
    return {
      kind: 'finish-elapsed-break',
      focusId: decision.focusId,
      focusEndedAt: iso(decision.focusEndedAtMs),
      focusActualSeconds: decision.focusActualSeconds,
      cycleCount: decision.cycleCountAfterBreak,
      breakStartedAt: iso(decision.breakStartedAtMs),
      breakPlannedSeconds: decision.breakPlannedSeconds,
      breakEndedAt: iso(decision.breakEndedAtMs),
      breakActualSeconds: decision.breakActualSeconds,
    };
  }
  if (decision.type === 'finish-break') {
    return {
      kind: 'finish-break',
      breakId: decision.breakId,
      endedAt: iso(decision.endedAtMs),
      actualSeconds: decision.actualSeconds,
      cycleCount: decision.cycleCount,
    };
  }
  return null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
