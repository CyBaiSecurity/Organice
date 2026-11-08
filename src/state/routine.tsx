import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  getRoutineConfig,
  getRoutineDay,
  getTask,
  listRoutineBlocks,
  suggestEarlierTask,
  toRoutineBlockView,
  type EarlierTaskSuggestion,
  type RoutineConfig,
  type RoutineDayState,
} from '@/db';
import {
  ROUTINE_PATTERNS,
  deriveDay,
  manilaDateKey,
  manilaInstant,
  manilaParts,
  manilaWeekday,
  type DayPlan,
  type Occurrence,
  type RoutineBlockView,
  type RoutinePatternId,
  type RoutineRole,
} from '@/domain/routine';
import { clockLabel } from '@/state/clock';
import { useOrganice } from '@/state/organice';
import { PAPER, type Paper } from '@/theme/palette';

export const ISO_DAYS = [
  { iso: 1, short: 'Mon', name: 'Monday' },
  { iso: 2, short: 'Tue', name: 'Tuesday' },
  { iso: 3, short: 'Wed', name: 'Wednesday' },
  { iso: 4, short: 'Thu', name: 'Thursday' },
  { iso: 5, short: 'Fri', name: 'Friday' },
  { iso: 6, short: 'Sat', name: 'Saturday' },
  { iso: 7, short: 'Sun', name: 'Sunday' },
] as const;

export type GuideConfig = RoutineConfig & { initialized?: boolean };

export type GuideTask = {
  id: string;
  title: string;
  nextAction: string;
};

export type RoutineGuideState = {
  loading: boolean;
  error: string | null;
  config: GuideConfig | null;
  blocks: RoutineBlockView[];
  day: RoutineDayState | null;
  plan: DayPlan | null;
  task: GuideTask | null;
  suggestion: EarlierTaskSuggestion | null;
  dateKey: string;
  todayKey: string;
  now: Date;
  reload: () => void;
};

export function guideInitialized(config: GuideConfig | null): boolean {
  return config?.initialized === true;
}

export function usePaper(): Paper {
  const scheme = useColorScheme();
  const { settings } = useOrganice();
  const mode =
    settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  return PAPER[mode];
}

export function manilaDayLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(manilaInstant(dateKey, 12 * 60));
}

export function reviewIsDue(now: Date): boolean {
  const parts = manilaParts(now);
  return parts.isoWeekday === 7 && parts.minute >= 17 * 60;
}

export function patternForWeekday(iso: number): RoutinePatternId {
  return ROUTINE_PATTERNS.find((pattern) => pattern.weekdays.includes(iso))?.id ?? 'mon_wed';
}

export function blocksOnWeekday(blocks: readonly RoutineBlockView[], iso: number, includeHidden = false): RoutineBlockView[] {
  return blocks
    .filter((block) => (includeHidden || block.enabled) && block.weekdays.includes(iso))
    .slice()
    .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));
}

export function weekdayHasRole(blocks: readonly RoutineBlockView[], iso: number, roles: readonly RoutineRole[]): boolean {
  return blocksOnWeekday(blocks, iso).some((block) => roles.includes(block.role));
}

export function occurrenceSchedule(item: Occurrence): string {
  if (item.role === 'unconfirmed-meeting') return 'Needs a confirmed time';
  if (item.synthetic || item.timing === 'suggested') return 'Optional';
  if (item.startMinute == null) return 'No fixed time';
  const start = clockLabel(item.startMinute);
  if (item.endMinute == null) return start;
  return `${start}–${clockLabel(item.endMinute)}`;
}

export function sameOccurrence(left: Occurrence | null, right: Occurrence): boolean {
  if (!left) return false;
  if (left.synthetic || right.synthetic) return left.synthetic && right.synthetic && left.title === right.title;
  return left.blockId != null && left.blockId === right.blockId;
}

type LoadedGuide = {
  key: string;
  config: GuideConfig;
  blocks: RoutineBlockView[];
  day: RoutineDayState;
  task: GuideTask | null;
  suggestion: EarlierTaskSuggestion | null;
};

export function useRoutineGuide(dateKey?: string): RoutineGuideState {
  const db = useSQLiteContext();
  const { tick } = useOrganice();
  const [now, setNow] = useState(() => new Date());
  const [pulse, setPulse] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedGuide | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const dateKeyRef = useRef(dateKey);
  dateKeyRef.current = dateKey;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const bump = () => setPulse((value) => value + 1);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setNow(new Date());
        bump();
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const current = new Date();
      const wait = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 25;
      timer = setTimeout(() => {
        setNow(new Date());
        bump();
        arm();
      }, Math.max(250, wait));
    };
    arm();
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);

  const todayKey = manilaDateKey(now);
  const activeKey = dateKey ?? todayKey;

  const load = useCallback(async () => {
    const ticket = ++request.current;
    const key = dateKeyRef.current ?? manilaDateKey(new Date());
    setLoading(true);
    setError(null);
    try {
      const [config, rows, day, suggestion] = await Promise.all([
        getRoutineConfig(db),
        listRoutineBlocks(db),
        getRoutineDay(db, key),
        suggestEarlierTask(db, key),
      ]);
      if (!mounted.current || ticket !== request.current) return;
      if ((dateKeyRef.current ?? manilaDateKey(new Date())) !== key) return;
      let task: GuideTask | null = null;
      if (day.selectedTaskId && day.selectedTaskStatus !== 'missing') {
        const row = await getTask(db, day.selectedTaskId);
        if (!mounted.current || ticket !== request.current) return;
        if ((dateKeyRef.current ?? manilaDateKey(new Date())) !== key) return;
        if (row) task = { id: row.id, title: row.title, nextAction: row.next_action };
      }
      if (!mounted.current || ticket !== request.current) return;
      setLoaded({
        key,
        config,
        blocks: rows.map(toRoutineBlockView),
        day,
        task,
        suggestion,
      });
      setError(null);
    } catch (caught) {
      if (!mounted.current || ticket !== request.current) return;
      setError(caught instanceof Error && caught.message ? caught.message : 'Could not load the guide.');
    } finally {
      if (mounted.current && ticket === request.current) setLoading(false);
    }
  }, [db]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      void loadRef.current();
    }, []),
  );

  useEffect(() => {
    setNow(new Date());
    void load();
  }, [load, activeKey, tick, pulse]);

  const fresh = loaded != null && loaded.key === activeKey ? loaded : null;
  const plan = useMemo(() => {
    if (!fresh) return null;
    return deriveDay(
      fresh.blocks,
      {
        noClasses: fresh.day.noClasses,
        homeAtMinute: fresh.day.homeAtMinute,
        homeLate: fresh.day.homeLate,
      },
      now,
      fresh.key,
    );
  }, [fresh, now]);

  const reload = useCallback(() => {
    setNow(new Date());
    void load();
  }, [load]);

  return {
    loading: fresh == null && (loading || error == null),
    error,
    config: fresh?.config ?? null,
    blocks: fresh?.blocks ?? [],
    day: fresh?.day ?? null,
    plan,
    task: fresh?.task ?? null,
    suggestion: fresh?.suggestion ?? null,
    dateKey: activeKey,
    todayKey,
    now,
    reload,
  };
}

export function leadCopy(plan: DayPlan | null): { title: string; body: string } {
  if (!plan) return { title: 'Guide', body: '' };
  if (plan.current) return { title: plan.current.title, body: plan.current.instructions };
  if (plan.next) return { title: `Next: ${plan.next.title}`, body: plan.next.instructions };
  return {
    title: 'Nothing scheduled right now',
    body: 'The rest of today is open. Use it as you like.',
  };
}
