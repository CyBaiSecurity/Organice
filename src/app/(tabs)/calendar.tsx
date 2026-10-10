import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, InkFooter, InkHeader, Muted, PageScroll, RowButton, Sheet, Title } from '@/components/ui';
import { getCachedEvents, listTasks, replaceCache } from '@/db';
import { addLocalDays, localDateKey, parseLocalDateKey, readDue, startOfLocalDay } from '@/domain/time';
import { formatTime } from '@/state/clock';
import { useOrganice } from '@/state/organice';
import { PAPER, taskInk } from '@/theme/palette';
import { calendarAvailability, eventsBetween, openDeviceEvent, requestCalendarAccess, type DeviceEvent } from '@/services/calendarDevice';
import { useColorScheme } from 'react-native';
import { type TaskRow } from '@/state/effects';

function eventCoversDay(event: DeviceEvent, dayKey: string): boolean {
  if (event.allDay) return event.startAt.slice(0, 10) <= dayKey && event.endAt.slice(0, 10) > dayKey;
  const dayStart = startOfLocalDay(parseLocalDateKey(dayKey));
  const dayEnd = addLocalDays(dayStart, 1);
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return start < dayEnd && end > dayStart;
}

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(localDateKey(new Date()));
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>('undetermined');
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = (first.getDay() + 6) % 7;
    const start = addLocalDays(first, -pad);
    return Array.from({ length: 42 }, (_, index) => addLocalDays(start, index));
  }, [cursor]);

  const load = useCallback(async () => {
    const access = await calendarAvailability();
    setPermission(access);
    const start = grid[0];
    const end = addLocalDays(grid[grid.length - 1], 1);
    setTasks((await listTasks(db, { status: 'all' })) as TaskRow[]);
    if (access !== 'granted') {
      setEvents([]);
      return;
    }
    try {
      const rows = await eventsBetween(start, end);
      setEvents(rows);
      setFailed(false);
      const fetchedAt = new Date().toISOString();
      setUpdated(fetchedAt);
      await replaceCache(
        db,
        rows.map((event) => ({
          event_id: event.id,
          calendar_id: event.calendarId,
          title: event.title,
          start_at: event.startAt,
          end_at: event.endAt,
          all_day: event.allDay ? 1 : 0,
          fetched_at: fetchedAt,
        })),
        start.toISOString(),
        end.toISOString(),
      );
    } catch {
      setFailed(true);
      const cached = (await getCachedEvents(db, start.toISOString(), end.toISOString())) as {
        event_id: string;
        calendar_id: string;
        title: string;
        start_at: string;
        end_at: string;
        all_day: number;
        fetched_at: string;
      }[];
      setEvents(cached.map((row) => ({ id: row.event_id, calendarId: row.calendar_id, title: row.title, startAt: row.start_at, endAt: row.end_at, allDay: row.all_day === 1 })));
      setUpdated(cached[0]?.fetched_at ?? null);
    }
  }, [db, grid]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  useEffect(() => {
    listTasks(db, { status: 'all' }).then((rows) => setTasks(rows as TaskRow[])).catch(() => undefined);
  }, [db, tick]);

  const todayKey = localDateKey(new Date());
  const owned = new Map(tasks.filter((task) => task.calendar_event_id).map((task) => [task.calendar_event_id as string, task]));
  const dayTasks = tasks.filter((task) => task.due_at != null && task.due_at.length > 0 && localDateKey(readDue(task.due_at, task.all_day === 1)) === selected);
  const dayEvents = events.filter((event) => eventCoversDay(event, selected));
  const marks = new Set<string>();
  for (const task of tasks) {
    if (task.due_at) marks.add(localDateKey(readDue(task.due_at, task.all_day === 1)));
  }
  for (const day of grid) {
    const key = localDateKey(day);
    if (events.some((event) => eventCoversDay(event, key))) marks.add(key);
  }

  return (
    <View style={styles.screen}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll
        center
        refreshControl={<RefreshControl refreshing={loading} tintColor={paper.text} onRefresh={() => { setLoading(true); load().finally(() => setLoading(false)); }} />}>
      <Sheet paper={paper}>
      <View style={styles.header}>
        <View style={styles.month}>
          <Title color={paper.text}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Title>
        </View>
        <View style={styles.navPair}>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} hitSlop={8}><Text style={[styles.nav, { color: paper.text }]}>Prev</Text></Pressable>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} hitSlop={8}><Text style={[styles.nav, { color: paper.text }]}>Next</Text></Pressable>
        </View>
      </View>
      <View style={styles.grid}>
        {grid.map((day) => {
          const key = localDateKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const chosen = key === selected;
          const today = key === todayKey;
          return (
            <Pressable key={key} style={styles.cell} onPress={() => setSelected(key)} accessibilityLabel={today ? `${key}, today` : key}>
              <View style={[styles.day, { backgroundColor: chosen ? paper.text : 'transparent', borderColor: today || chosen ? paper.text : 'transparent' }]}>
                <Text style={{ color: chosen ? paper.bg : today || inMonth ? paper.text : paper.muted, fontWeight: today ? '700' : '400' }}>{day.getDate()}</Text>
              </View>
              {marks.has(key) ? <View style={[styles.mark, { backgroundColor: key === selected ? paper.bg : paper.text }]} /> : <View style={styles.mark} />}
            </Pressable>
          );
        })}
      </View>
      {permission === 'denied' || permission === 'undetermined' ? (
        <View style={styles.block}>
          <Muted color={paper.muted}>Allow calendar access to show events.</Muted>
          <Button
            label={permission === 'denied' ? 'Open system settings' : 'Allow calendar'}
            color={paper.text}
            textColor={paper.bg}
            onPress={() => {
              if (permission === 'denied') Linking.openSettings();
              else requestCalendarAccess().then(() => load());
            }}
          />
        </View>
      ) : null}
      {permission === 'unavailable' ? <Muted color={paper.muted}>No calendar on this phone.</Muted> : null}
      {failed && updated ? <Muted color={paper.muted}>Last update {updated}.</Muted> : null}
      <Text style={{ color: paper.text, fontSize: 18 }}>{selected}</Text>
      {dayTasks.filter((task) => task.all_day === 1).map((task) => (
        <RowButton key={task.id} paper={paper} wave label={task.title} detail="Task · all day" labelColor={taskInk(task.priority, paper)} struck={task.status === 'completed'} onPress={() => router.push(`/task/${task.id}`)} />
      ))}
      {dayEvents.filter((event) => event.allDay && !owned.has(event.id)).map((event) => (
        <RowButton key={event.id} paper={paper} label={event.title} detail="Event · all day" onPress={() => openDeviceEvent(event.id).catch(() => undefined)} />
      ))}
      {dayTasks.filter((task) => task.all_day !== 1).map((task) => (
        <RowButton key={task.id} paper={paper} wave label={task.title} detail={task.due_at ? `Task · ${formatTime(new Date(task.due_at))}` : 'Task'} labelColor={taskInk(task.priority, paper)} struck={task.status === 'completed'} onPress={() => router.push(`/task/${task.id}`)} />
      ))}
      {dayEvents.filter((event) => !event.allDay).map((event) => {
        const task = owned.get(event.id);
        return (
          <RowButton
            key={event.id}
            paper={paper}
            wave={task !== undefined}
            label={event.title}
            detail={`Event · ${formatTime(new Date(event.startAt))}`}
            labelColor={task ? taskInk(task.priority, paper) : undefined}
            struck={task?.status === 'completed'}
            onPress={() => {
              if (task) router.push(`/task/${task.id}`);
              else openDeviceEvent(event.id).catch(() => undefined);
            }}
          />
        );
      })}
      </Sheet>
      </PageScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  month: { flex: 1 },
  navPair: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nav: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', paddingVertical: 8, paddingHorizontal: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 4, gap: 4 },
  day: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  mark: { width: 6, height: 6, borderRadius: 2 },
  block: { gap: 8 },
});
