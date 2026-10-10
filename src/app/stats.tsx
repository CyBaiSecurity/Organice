import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Muted, WaveRule } from '@/components/ui';
import { listCheckins, listHabits } from '@/db';
import {
  habitCsv,
  habitReport,
  type CheckMark,
  type HabitStat,
  type HabitStatSource,
} from '@/domain/habitStats';
import { localDateKey } from '@/domain/time';
import { shareTextFile } from '@/services/shareFile';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';

function percent(met: number, due: number): number {
  if (due <= 0) return 0;
  return Math.round((met / due) * 100);
}

function createdOn(iso: string, today: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return today;
  return localDateKey(date);
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [rows, setRows] = useState<HabitStat[]>([]);
  const [sources, setSources] = useState<HabitStatSource[]>([]);
  const [marks, setMarks] = useState<CheckMark[]>([]);
  const [today, setToday] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const todayKey = localDateKey(new Date());
    const [habits, checkins] = await Promise.all([listHabits(db), listCheckins(db)]);
    const nextSources = habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      kind: habit.kind,
      goal: habit.goal,
      unit: habit.unit,
      weekdays: habit.weekdays,
      createdOn: createdOn(habit.created_at, todayKey),
      archived: habit.archived,
    }));
    const nextMarks = checkins.map((row) => ({ habitId: row.habit_id, localDate: row.local_date, value: row.value }));
    setSources(nextSources);
    setMarks(nextMarks);
    setToday(todayKey);
    setRows(habitReport(nextSources, nextMarks, todayKey));
  }, [db]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  function exportCsv() {
    shareTextFile('habits.csv', habitCsv(sources, marks, today || localDateKey(new Date())), 'text/csv').catch((error) => {
      Alert.alert('Export', error instanceof Error ? error.message : 'Could not export the CSV file.');
    });
  }

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      <Muted color={paper.muted}>Due days over the last 8 weeks.</Muted>
      <Button label="Export CSV" color={paper.text} textColor={paper.bg} onPress={exportCsv} />
      {rows.length === 0 ? <Muted color={paper.muted}>No habits yet.</Muted> : null}
      {rows.map((habit) => {
        const open = openId === habit.id;
        return (
          <Pressable
            key={habit.id}
            onPress={() => setOpenId(open ? null : habit.id)}
            style={[styles.card, { backgroundColor: paper.surface, borderColor: paper.rule, borderTopColor: paper.rule, borderRightColor: paper.rule, borderBottomColor: paper.rule, borderLeftColor: paper.rule }]}>
            <WaveRule color={paper.text} inset={14} />
            <Text style={[styles.name, { color: paper.text }]}>{habit.name}</Text>
            <Muted color={paper.muted}>
              {habit.archived ? 'Archived. ' : ''}
              {habit.due === 0 ? 'No due day in the last 8 weeks.' : `${habit.met} of ${habit.due} due days, ${percent(habit.met, habit.due)} percent.`}
            </Muted>
            <View style={[styles.track, { borderColor: paper.text, borderTopColor: paper.text, borderRightColor: paper.text, borderBottomColor: paper.text, borderLeftColor: paper.text }]}>
              <View style={{ width: `${percent(habit.met, habit.due)}%`, height: '100%', backgroundColor: paper.text }} />
            </View>
            {open ? (
              <View style={styles.detail}>
                <Text style={[styles.heading, { color: paper.text }]}>By week</Text>
                <View style={styles.columns}>
                  {habit.weeks.map((week) => (
                    <View key={week.weekStart} style={styles.column}>
                      <View style={[styles.columnTrack, { borderColor: paper.text, borderTopColor: paper.text, borderRightColor: paper.text, borderBottomColor: paper.text, borderLeftColor: paper.text }]}>
                        <View style={{ height: `${percent(week.met, week.due)}%`, width: '100%', backgroundColor: paper.text }} />
                      </View>
                      <Text style={[styles.columnLabel, { color: paper.text }]}>{week.weekStart.slice(5).replace('-', '/')}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.heading, { color: paper.text }]}>By due day</Text>
                {habit.days.length === 0 ? <Muted color={paper.muted}>This habit has no due day.</Muted> : null}
                {habit.days.map((day) => (
                  <View key={day.iso} style={styles.dayRow}>
                    <Text style={[styles.dayLabel, { color: paper.text }]}>{day.label}</Text>
                    <View style={[styles.track, styles.dayTrack, { borderColor: paper.text, borderTopColor: paper.text, borderRightColor: paper.text, borderBottomColor: paper.text, borderLeftColor: paper.text }]}>
                      <View style={{ width: `${percent(day.met, day.due)}%`, height: '100%', backgroundColor: paper.text }} />
                    </View>
                    <Text style={[styles.dayCount, { color: paper.text }]}>{day.due === 0 ? '—' : `${day.met}/${day.due}`}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 40 },
  card: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderRadius: 22,
    padding: 14,
    paddingTop: 22,
    gap: 10,
    overflow: 'hidden',
  },
  name: { fontFamily: 'Georgia', fontSize: 20 },
  track: {
    height: 12,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  detail: { gap: 10 },
  heading: { fontFamily: 'Georgia', fontSize: 16 },
  columns: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: 4 },
  columnTrack: {
    height: 72,
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  columnLabel: { fontSize: 9, fontFamily: 'Georgia' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel: { width: 36, fontFamily: 'Georgia', fontSize: 13 },
  dayTrack: { flex: 1 },
  dayCount: { width: 42, textAlign: 'right', fontFamily: 'Georgia', fontSize: 13 },
});
