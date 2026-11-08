import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { reconcileRoutineReminders } from '@/services/routineReminders';
import { useOrganice } from '@/state/organice';

export type RoutineReminderStatus = {
  message: string | null;
  scheduledCount: number | null;
  horizonEnd: string | null;
  refresh: () => Promise<void>;
};

const Context = createContext<RoutineReminderStatus | null>(null);

export function RoutineReminderProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { tick } = useOrganice();
  const dbRef = useRef(db);
  dbRef.current = db;
  const again = useRef(false);
  const pump = useRef<Promise<void> | null>(null);
  const epoch = useRef(0);
  const [snapshot, setSnapshot] = useState({
    message: null as string | null,
    scheduledCount: null as number | null,
    horizonEnd: null as string | null,
  });

  const refresh = useCallback((): Promise<void> => {
    again.current = true;
    const existing = pump.current;
    if (existing) {
      return existing.then(() => (again.current ? refresh() : undefined));
    }
    const job = (async () => {
      while (again.current) {
        again.current = false;
        const ticket = ++epoch.current;
        try {
          const report = await reconcileRoutineReminders(dbRef.current);
          if (ticket !== epoch.current || report.superseded) continue;
          setSnapshot({
            message: report.message,
            scheduledCount: report.scheduledCount,
            horizonEnd: report.horizonEnd,
          });
        } catch {
          if (ticket !== epoch.current) continue;
          setSnapshot((current) => ({
            ...current,
            message: 'Routine reminders could not be refreshed.',
          }));
        }
      }
    })();
    const settled = job.finally(() => {
      if (pump.current === settled) pump.current = null;
    });
    pump.current = settled;
    return settled;
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh, tick]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refresh]);

  const value = useMemo<RoutineReminderStatus>(
    () => ({
      message: snapshot.message,
      scheduledCount: snapshot.scheduledCount,
      horizonEnd: snapshot.horizonEnd,
      refresh,
    }),
    [refresh, snapshot.horizonEnd, snapshot.message, snapshot.scheduledCount],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRoutineReminderStatus(): RoutineReminderStatus {
  const value = useContext(Context);
  if (!value) throw new Error('RoutineReminderProvider is missing.');
  return value;
}
