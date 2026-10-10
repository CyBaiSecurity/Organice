import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Field, Muted } from '@/components/ui';
import { deleteHabit, getCheckins, listHabits, setCheckin, updateHabit } from '@/db';
import { canCheckDate, clampedCount, isDueOn } from '@/domain/habits';
import { localDateKey, parseLocalDateKey, WEEK_LABELS } from '@/domain/time';
import { clockLabel, parseClock } from '@/state/clock';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';
import { cancelNotification, scheduleHabitReminders } from '@/services/notifications';

type Habit = {
  id: string;
  name: string;
  kind: string;
  goal: number | null;
  unit: string | null;
  weekdays: string;
  reminder_minute: number | null;
  notification_id: string | null;
  archived: number;
};

export default function HabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, reloadSettings } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [habit, setHabit] = useState<Habit | null>(null);
  const [checks, setChecks] = useState<Record<string, number>>({});
  const [reminder, setReminder] = useState('');
  const today = localDateKey(new Date());

  const load = useCallback(async () => {
    const rows = (await listHabits(db)) as Habit[];
    const row = rows.find((item) => item.id === id) ?? null;
    setHabit(row);
    if (!row) return;
    setReminder(row.reminder_minute == null ? '' : clockLabel(row.reminder_minute));
    const cursor = new Date();
    const from = localDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const to = localDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), last));
    const checkRows = (await getCheckins(db, id, from, to)) as { local_date: string; value: number }[];
    setChecks(Object.fromEntries(checkRows.map((item) => [item.local_date, item.value])));
  }, [db, id]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  if (!habit) return null;
  const monthCursor = new Date();
  const days = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const leadingBlanks = first.getDay();
  const slots = [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({ kind: 'blank' as const, key: `blank-${index}`, day: 0 })),
    ...Array.from({ length: days }, (_, index) => ({
      kind: 'day' as const,
      key: localDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), index + 1)),
      day: index + 1,
    })),
  ];

  function canMark(key: string): boolean {
    return habit != null && canCheckDate(key, today) && isDueOn(habit.weekdays, parseLocalDateKey(key));
  }

  async function mark(key: string) {
    if (!habit || !canMark(key)) return;
    if (habit.kind === 'boolean') {
      const next = checks[key] ? null : 1;
      await setCheckin(db, habit.id, key, next);
      setChecks((existing) => withCheck(existing, key, next));
      return;
    }
    const next = clampedCount((checks[key] ?? 0) + 1);
    await setCheckin(db, habit.id, key, next);
    setChecks((existing) => withCheck(existing, key, next));
  }

  async function lower(key: string) {
    if (!habit || !canMark(key)) return;
    if (habit.kind === 'boolean') {
      await mark(key);
      return;
    }
    const current = checks[key] ?? 0;
    const next = current === 0 || current === 1 ? null : clampedCount(current - 1);
    await setCheckin(db, habit.id, key, next);
    setChecks((existing) => withCheck(existing, key, next));
  }

  async function saveReminder() {
    if (!habit) return;
    const minute = reminder.trim() ? parseClock(reminder) : null;
    if (reminder.trim() && minute == null) {
      Alert.alert('Reminder', 'Use a 24-hour time, such as 07:30.');
      return;
    }
    const weekdays = habit.weekdays.split(',').map(Number).filter((day) => day >= 1 && day <= 7);
    const scheduled = minute == null
      ? { ids: null as string | null, inexact: false }
      : await scheduleHabitReminders({
          name: habit.name,
          habitId: habit.id,
          minuteOfDay: minute,
          isoWeekdays: weekdays,
          previousIds: habit.notification_id,
        });
    if (minute == null) await cancelNotification(habit.notification_id);
    await updateHabit(db, habit.id, { reminder_minute: minute, notification_id: scheduled.ids });
    setHabit({ ...habit, reminder_minute: minute, notification_id: scheduled.ids });
    if (scheduled.inexact) await updateSettingsInexact();
    refresh();
  }

  async function updateSettingsInexact() {
    const { updateSettings } = await import('@/db');
    await updateSettings(db, { reminders_inexact: 1 });
    await reloadSettings().catch(() => undefined);
  }

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      <Text style={{ color: paper.text, fontSize: 28, fontFamily: 'Georgia' }}>{habit.name}</Text>
      <Text style={{ color: paper.muted }}>{monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
      <Muted color={paper.muted}>Tap a due day to check it. Long-press a count to lower it.</Muted>
      <View style={styles.grid}>
        <View style={styles.week}>
          {WEEK_LABELS.map((day) => (
            <Text key={day.label} style={[styles.cell, { color: paper.muted, textAlign: 'center' }]}>{day.label}</Text>
          ))}
        </View>
        {weeks(slots).map((row, rowIndex) => (
          <View key={rowIndex} style={styles.week}>
            {row.map((slot) => {
              if (slot.kind === 'blank') return <View key={slot.key} style={styles.cell} />;
              const future = !canCheckDate(slot.key, today);
              const due = isDueOn(habit.weekdays, parseLocalDateKey(slot.key));
              const value = checks[slot.key] ?? 0;
              const isToday = slot.key === today;
              const dayColor = isToday || (!future && due) ? paper.text : paper.muted;
              const label = (
                <View style={styles.dayLine}>
                  <View style={[styles.todayRing, { borderColor: isToday ? paper.text : 'transparent' }]}>
                    <Text style={{ color: dayColor, fontFamily: 'Georgia', textAlign: 'center', fontWeight: isToday || (value > 0 && !future) ? '700' : '400' }}>
                      {slot.day}
                    </Text>
                  </View>
                  {habit.kind === 'count' && value > 0 ? (
                    <Text style={{ color: dayColor, fontFamily: 'Georgia', fontWeight: '700' }}>{value}</Text>
                  ) : null}
                </View>
              );
              if (!due || future) return <View key={slot.key} style={styles.cell}>{label}</View>;
              return (
                <Pressable
                  key={slot.key}
                  onPress={() => mark(slot.key).catch(() => undefined)}
                  onLongPress={() => lower(slot.key).catch(() => undefined)}
                  style={styles.cell}>
                  {label}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Field label="Reminder time (24-hour, optional)" value={reminder} onChangeText={setReminder} paper={paper} placeholder="07:30" />
      <Button label="Save reminder" color={paper.text} textColor={paper.bg} onPress={() => saveReminder().catch((error) => Alert.alert('Reminder', error instanceof Error ? error.message : 'Could not schedule.'))} />
      <Muted color={paper.muted}>Archive hides it from today.</Muted>
      <Button
        label={habit.archived ? 'Restore habit' : 'Archive habit'}
        color={paper.text}
        textColor={paper.bg}
        onPress={() => updateHabit(db, habit.id, { archived: habit.archived ? 0 : 1 }).then(() => { refresh(); load(); })}
      />
      <Button
        label="Delete habit"
        color={paper.danger}
        textColor={paper.bg}
        onPress={() =>
          Alert.alert('Delete habit', 'Check-ins are deleted with it.', [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                cancelNotification(habit.notification_id).finally(() => {
                  deleteHabit(db, habit.id).then(() => {
                    refresh();
                    router.back();
                  });
                });
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}

function withCheck(source: Record<string, number>, key: string, value: number | null): Record<string, number> {
  const next = { ...source };
  if (value == null) delete next[key];
  else next[key] = value;
  return next;
}

function weeks<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 7) rows.push(items.slice(index, index + 7));
  return rows;
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 40 },
  grid: { gap: 2 },
  week: { flexDirection: 'row', width: '100%' },
  cell: { width: '14.2857%', paddingVertical: 6, alignItems: 'center' },
  dayLine: { alignItems: 'center', gap: 2 },
  todayRing: { minWidth: 28, height: 28, paddingHorizontal: 2, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
