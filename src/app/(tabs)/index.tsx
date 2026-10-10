import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Card, Empty, InkFooter, InkHeader, Muted, PageScroll, RowButton, Sheet, Star, WaveRule } from '@/components/ui';
import {
  getCachedEvents,
  getCheckinsBetween,
  listHabits,
  openTasksWithDue,
  replaceCache,
  runningSession,
  sessionsEndedSince,
  setCheckin,
} from '@/db';
import { splitAgenda, taskSchedule, type AgendaItem } from '@/domain/agenda';
import { focusSecondsToday } from '@/domain/focusTotal';
import { isDueOn, toggledBoolean } from '@/domain/habits';
import { scheduledDates } from '@/domain/habitStats';
import { addLocalDays, isoWeekday, localDateKey, startOfLocalDay } from '@/domain/time';
import { formatDay, formatTime } from '@/state/clock';
import { useOrganice } from '@/state/organice';
import { PAPER, taskInk } from '@/theme/palette';
import { eventsBetween, openDeviceEvent } from '@/services/calendarDevice';
import { useColorScheme } from 'react-native';

type HabitRow = {
  id: string;
  name: string;
  kind: string;
  goal: number | null;
  unit: string | null;
  weekdays: string;
  archived: number;
};

type RunningSession = {
  mode: string;
  phase: string;
  status: string;
  started_at: string;
  planned_seconds: number | null;
};

type DashEvent = {
  id: string;
  calendarId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
};

const CALENDAR_FRESH_MS = 60_000;
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function eventsFromCache(
  rows: { event_id: string; calendar_id: string; title: string; start_at: string; end_at: string; all_day: number }[],
): DashEvent[] {
  return rows.map((row) => ({
    id: row.event_id,
    calendarId: row.calendar_id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
  }));
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function runningLabel(session: RunningSession, nowMs: number): string {
  const elapsed = Math.max(0, Math.round((nowMs - new Date(session.started_at).getTime()) / 1000));
  if (session.phase === 'break') {
    const left = session.planned_seconds == null ? elapsed : Math.max(0, session.planned_seconds - elapsed);
    return `Break · ${formatClock(left)} left`;
  }
  if (session.mode === 'countup') return `Count up · ${formatClock(elapsed)} elapsed`;
  const left = session.planned_seconds == null ? elapsed : Math.max(0, session.planned_seconds - elapsed);
  return `Focus · ${formatClock(left)} left`;
}

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [checks, setChecks] = useState<Record<string, number>>({});
  const [week, setWeek] = useState<Record<string, Record<string, number>>>({});
  const [focusLabel, setFocusLabel] = useState('0 min today');
  const [session, setSession] = useState<RunningSession | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [outsideOpen, setOutsideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const paintGeneration = useRef(0);
  const eventsFetchedAt = useRef<number | null>(null);

  const load = useCallback(async (forceEvents = false) => {
    const started = ++paintGeneration.current;
    const now = new Date();
    const today = startOfLocalDay(now);
    const todayKey = localDateKey(now);
    const tomorrow = addLocalDays(today, 1);
    const yesterday = addLocalDays(today, -1);
    const rangeEnd = addLocalDays(tomorrow, 1);
    const rangeStartIso = yesterday.toISOString();
    const rangeEndIso = rangeEnd.toISOString();
    const tasks = await openTasksWithDue(db);
    if (paintGeneration.current !== started) return;
    let events: DashEvent[] = [];
    const fresh = eventsFetchedAt.current != null && Date.now() - eventsFetchedAt.current < CALENDAR_FRESH_MS;
    if (!forceEvents && fresh) {
      events = eventsFromCache(await getCachedEvents(db, rangeStartIso, rangeEndIso));
    } else {
      try {
        events = await eventsBetween(yesterday, rangeEnd);
        await replaceCache(
          db,
          events.map((event) => ({
            event_id: event.id,
            calendar_id: event.calendarId,
            title: event.title,
            start_at: event.startAt,
            end_at: event.endAt,
            all_day: event.allDay ? 1 : 0,
            fetched_at: new Date().toISOString(),
          })),
          rangeStartIso,
          rangeEndIso,
        );
        eventsFetchedAt.current = Date.now();
      } catch {
        events = eventsFromCache(await getCachedEvents(db, rangeStartIso, rangeEndIso));
      }
    }
    if (paintGeneration.current !== started) return;
    const agenda: AgendaItem[] = [
      ...(tasks as { id: string; title: string; all_day: number; start_at: string | null; due_at: string | null; priority: number }[]).map((task) => ({
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        allDay: task.all_day === 1,
        startAt: task.start_at,
        dueAt: task.due_at,
        priority: task.priority,
      })),
      ...events.map((event) => ({
        kind: 'event' as const,
        id: event.id,
        title: event.title,
        allDay: event.allDay,
        startAt: event.startAt,
        dueAt: event.startAt,
      })),
    ];
    const habitRows = ((await listHabits(db)) as HabitRow[]).filter((habit) => habit.archived === 0);
    const due = habitRows.filter((habit) => isDueOn(habit.weekdays, now));
    const dueIds = new Set(due.map((habit) => habit.id));
    const from = localDateKey(addLocalDays(today, -6));
    const checkinRows = await getCheckinsBetween(db, from, todayKey);
    if (paintGeneration.current !== started) return;
    const nextChecks: Record<string, number> = {};
    const nextWeek: Record<string, Record<string, number>> = {};
    for (const habit of habitRows) nextWeek[habit.id] = {};
    for (const row of checkinRows) {
      const bucket = nextWeek[row.habit_id];
      if (!bucket) continue;
      bucket[row.local_date] = row.value;
      if (row.local_date === todayKey && dueIds.has(row.habit_id)) nextChecks[row.habit_id] = row.value;
    }
    const sessions = await sessionsEndedSince(db, today.toISOString());
    const seconds = focusSecondsToday(
      sessions.map((session) => ({
        endedAt: session.ended_at,
        actualSeconds: session.actual_seconds,
        status: session.status,
        phase: session.phase,
      })),
      now,
    );
    const active = (await runningSession(db)) as RunningSession | null;
    if (paintGeneration.current !== started) return;
    setItems(agenda);
    setHabits(habitRows);
    setChecks(nextChecks);
    setWeek(nextWeek);
    setFocusLabel(`${Math.floor(seconds / 60)} min today`);
    setSession(active && active.status === 'running' ? active : null);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, tick]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const now = new Date();
  const split = splitAgenda({
    items,
    now,
    workStartMinute: settings.work_start_minute,
    workEndMinute: settings.work_end_minute,
  });
  const dueHabits = habits.filter((habit) => isDueOn(habit.weekdays, now));
  const clear = split.overdue.length === 0 && split.allDay.length === 0 && split.inside.length === 0 && split.outside.length === 0 && dueHabits.length === 0;
  const hasUnfinishedTask = [...split.overdue, ...split.allDay, ...split.inside, ...split.outside].some((item) => item.kind === 'task');
  const overdueRed = mode === 'dark' ? '#FF8A80' : '#C4272F';

  function renderAgenda(item: AgendaItem, bucket: 'overdue' | 'allDay' | 'inside' | 'outside') {
    const schedule = item.kind === 'task' ? taskSchedule(item, now) : null;
    let detail: string | undefined;
    if (schedule) detail = schedule.detail;
    else if (bucket === 'allDay') detail = 'All-day event';
    else if (bucket === 'inside') detail = item.startAt ? formatTime(new Date(item.startAt)) : undefined;
    else if (bucket === 'outside') detail = 'Event';
    else detail = 'Overdue';
    return (
      <RowButton
        key={`${item.kind}-${item.id}`}
        paper={paper}
        wave={item.kind === 'task'}
        label={item.title}
        detail={detail}
        note={schedule?.overdue ? 'Overdue' : undefined}
        noteColor={overdueRed}
        labelColor={item.kind === 'task' ? taskInk(item.priority ?? 0, paper) : undefined}
        onPress={() => openAgenda(item)}
      />
    );
  }

  async function toggleHabit(habit: HabitRow) {
    const actedAt = new Date();
    if (!isDueOn(habit.weekdays, actedAt)) return;
    paintGeneration.current += 1;
    const todayKey = localDateKey(actedAt);
    const next =
      habit.kind === 'count'
        ? Math.min(10000, (checks[habit.id] ?? 0) + 1)
        : toggledBoolean(checks[habit.id] ?? null);
    await setCheckin(db, habit.id, todayKey, next);
    setChecks((current) => {
      const copy = { ...current };
      if (next == null) delete copy[habit.id];
      else copy[habit.id] = next;
      return copy;
    });
    setWeek((current) => {
      const habitWeek = { ...(current[habit.id] ?? {}) };
      if (next == null) delete habitWeek[todayKey];
      else habitWeek[todayKey] = next;
      return { ...current, [habit.id]: habitWeek };
    });
  }

  async function lowerHabit(habit: HabitRow) {
    if (habit.kind !== 'count') return;
    const actedAt = new Date();
    if (!isDueOn(habit.weekdays, actedAt)) return;
    const todayKey = localDateKey(actedAt);
    const current = checks[habit.id] ?? 0;
    if (current <= 0) return;
    paintGeneration.current += 1;
    const next = current === 1 ? null : current - 1;
    await setCheckin(db, habit.id, todayKey, next);
    setChecks((existing) => {
      const copy = { ...existing };
      if (next == null) delete copy[habit.id];
      else copy[habit.id] = next;
      return copy;
    });
    setWeek((existing) => {
      const habitWeek = { ...(existing[habit.id] ?? {}) };
      if (next == null) delete habitWeek[todayKey];
      else habitWeek[todayKey] = next;
      return { ...existing, [habit.id]: habitWeek };
    });
  }

  function openAgenda(item: AgendaItem) {
    if (item.kind === 'task') {
      router.push(`/task/${item.id}`);
      return;
    }
    openDeviceEvent(item.id).catch((error) => {
      Alert.alert('Calendar', error instanceof Error ? error.message : 'Could not open the event.');
    });
  }

  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(startOfLocalDay(now), index - 6));

  return (
    <View style={styles.screen}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll
        refreshControl={<RefreshControl refreshing={loading} tintColor={paper.text} onRefresh={() => { setLoading(true); load(true).finally(() => setLoading(false)); }} />}>
      <Sheet paper={paper}>
      <View style={styles.header}>
        <Text numberOfLines={2} style={[styles.date, { color: paper.text }]}>{formatDay(now)}</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={8}
          style={[styles.settings, { backgroundColor: paper.surface, borderColor: paper.text, borderTopColor: paper.text, borderRightColor: paper.text, borderBottomColor: paper.text, borderLeftColor: paper.text }]}>
          <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={20} tintColor={paper.text} weight="regular" />
        </Pressable>
      </View>
      <Card paper={paper}>
        <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 16 }}>{session ? runningLabel(session, nowMs) : focusLabel}</Text>
        <Button label={session ? 'Open focus' : 'Start focus'} color={paper.text} textColor={paper.bg} onPress={() => router.push('/focus')} />
      </Card>
      <View style={styles.habitActions}>
        <View style={styles.habitAction}>
          <Button label="Add habit" color={paper.text} textColor={paper.bg} onPress={() => router.push({ pathname: '/habits', params: { compose: '1' } })} />
        </View>
        <View style={styles.habitAction}>
          <Button label="Edit habits" color={paper.text} textColor={paper.text} outline onPress={() => router.push({ pathname: '/habits', params: { compose: '0' } })} />
        </View>
      </View>
      <Button label="Statistics" color={paper.text} textColor={paper.text} outline onPress={() => router.push('/stats')} />
      {habits.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.kicker}>
            <Star color={paper.text} />
            <Muted color={paper.muted}>Habits</Muted>
          </View>
          {habits.map((habit) => {
            const dueToday = isDueOn(habit.weekdays, now);
            const count = checks[habit.id] ?? 0;
            const done = habit.kind !== 'count' && count > 0;
            const checkLabel = habit.kind === 'count' ? `${count}${habit.unit ? ` ${habit.unit}` : ''}` : done ? 'Done' : 'Check';
            return (
            <View
              key={habit.id}
              style={[
                styles.habitCard,
                {
                  backgroundColor: paper.surface,
                  borderColor: paper.rule,
                  borderTopColor: paper.rule,
                  borderRightColor: paper.rule,
                  borderBottomColor: paper.rule,
                  borderLeftColor: paper.rule,
                },
              ]}>
              <WaveRule color={paper.text} inset={14} />
              <View style={styles.habit}>
                <Text style={{ color: paper.text, flex: 1 }}>{habit.name}</Text>
                {dueToday ? (
                <View style={styles.habitTaps}>
                  {habit.kind === 'count' && count > 0 ? (
                    <Pressable
                      onPress={() => lowerHabit(habit)}
                      accessibilityRole="button"
                      accessibilityLabel={`Lower ${habit.name}`}
                      style={[styles.check, { backgroundColor: 'transparent', borderColor: paper.text }]}>
                      <Text style={[styles.checkText, { color: paper.text }]}>Lower</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => toggleHabit(habit)}
                    accessibilityRole="button"
                    accessibilityLabel={done ? `${habit.name} is done` : `Mark ${habit.name}`}
                    style={[
                      styles.check,
                      done || (habit.kind === 'count' && count > 0)
                        ? { backgroundColor: paper.text, borderColor: paper.text }
                        : { backgroundColor: 'transparent', borderColor: paper.text },
                    ]}>
                    <Text style={[styles.checkText, { color: done || (habit.kind === 'count' && count > 0) ? paper.bg : paper.text }]}>
                      {checkLabel}
                    </Text>
                  </Pressable>
                </View>
                ) : null}
              </View>
              <View style={styles.week}>
                {scheduledDates(days, habit.weekdays).map((day) => {
                  const key = localDateKey(day);
                  const filled = (week[habit.id]?.[key] ?? 0) > 0;
                  const today = key === localDateKey(now);
                  return (
                    <View key={key} style={styles.day}>
                      <Text numberOfLines={1} style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 12, fontWeight: today ? '700' : '400' }}>
                        {WEEKDAY_SHORT[isoWeekday(day) - 1]}
                      </Text>
                      <View style={[styles.mark, { backgroundColor: filled ? paper.text : paper.surface, borderColor: paper.text, borderBottomColor: paper.text }]} />
                    </View>
                  );
                })}
              </View>
            </View>
            );
          })}
        </View>
      ) : (
        <Muted color={paper.muted}>No habit is due today.</Muted>
      )}
      {hasUnfinishedTask ? (
        <View style={styles.taskHeading}>
          <Star color={paper.text} />
          <Muted color={paper.muted}>Unfinished tasks</Muted>
        </View>
      ) : null}
      {split.overdue.map((item) => renderAgenda(item, 'overdue'))}
      {split.allDay.map((item) => renderAgenda(item, 'allDay'))}
      {split.inside.map((item) => renderAgenda(item, 'inside'))}
      {split.outside.length > 0 ? (
        <View>
          <Pressable onPress={() => setOutsideOpen((open) => !open)}>
            <Text style={{ color: paper.text, paddingVertical: 12 }}>Outside working hours ({split.outside.length})</Text>
          </Pressable>
          {outsideOpen ? split.outside.map((item) => renderAgenda(item, 'outside')) : null}
        </View>
      ) : null}
      {clear ? (
        <Empty title="Today is clear" body="Nothing is due, and no habit is scheduled." color={paper.text} muted={paper.muted} />
      ) : null}
      {clear ? (
        <View style={styles.actions}>
          <Button label="New task" color={paper.text} textColor={paper.bg} onPress={() => router.push('/task/new')} />
          <Button label="New idea" color={paper.text} textColor={paper.text} outline onPress={() => router.push('/ideas')} />
        </View>
      ) : null}
      </Sheet>
      </PageScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  date: { flex: 1, fontFamily: 'Georgia', fontSize: 22, lineHeight: 26 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  block: { gap: 8 },
  habitActions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  habitAction: { flex: 1 },
  habitCard: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 12,
    gap: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
  habit: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  habitTaps: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  check: {
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  settings: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  mark: { alignSelf: 'stretch', height: 14, borderRadius: 7, borderWidth: 1, borderBottomWidth: 1 },
  actions: { gap: 8 },
});
