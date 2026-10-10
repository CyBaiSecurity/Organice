import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getSettings } from '@/db';

export type SettingsRow = {
  appearance: string;
  accent: string;
  work_start_minute: number;
  work_end_minute: number;
  default_list_id: string | null;
  default_reminder_offset: number | null;
  writable_calendar_id: string | null;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
  white_noise: string;
  focus_cycle_count: number;
  reminders_inexact: number;
};

type OrganiceContext = {
  tick: number;
  refresh: () => void;
  settings: SettingsRow;
  reloadSettings: () => Promise<void>;
};

const DEFAULTS: SettingsRow = {
  appearance: 'system',
  accent: 'ink',
  work_start_minute: 8 * 60,
  work_end_minute: 22 * 60,
  default_list_id: null,
  default_reminder_offset: 15,
  writable_calendar_id: null,
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  long_break_every: 4,
  white_noise: 'silence',
  focus_cycle_count: 0,
  reminders_inexact: 0,
};

const Context = createContext<OrganiceContext | null>(null);

export function OrganiceProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState<SettingsRow>(DEFAULTS);

  const reloadSettings = useCallback(async () => {
    const row = (await getSettings(db)) as SettingsRow;
    setSettings({ ...DEFAULTS, ...row });
  }, [db]);

  useEffect(() => {
    reloadSettings().catch(() => undefined);
  }, [reloadSettings]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const value = useMemo(
    () => ({ tick, refresh, settings, reloadSettings }),
    [tick, refresh, settings, reloadSettings],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOrganice(): OrganiceContext {
  const value = useContext(Context);
  if (!value) throw new Error('OrganiceProvider is missing.');
  return value;
}
