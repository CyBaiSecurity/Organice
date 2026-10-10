import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Card, Chip, Field, Muted } from '@/components/ui';
import { createHabit, deleteHabit, listHabits, type HabitRow } from '@/db';
import { LIMITS } from '@/domain/limits';
import { WEEK_LABELS } from '@/domain/time';
import { cancelNotification } from '@/services/notifications';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';

function trackedAs(habit: HabitRow): string {
  if (habit.kind !== 'count') return 'Yes or no';
  const goal = habit.goal ?? 1;
  return habit.unit ? `Count · goal ${goal} ${habit.unit}` : `Count · goal ${goal}`;
}

function dueDays(weekdays: string): string {
  const selected = new Set(weekdays.split(',').map((part) => Number(part)));
  const names = WEEK_LABELS.filter((day) => selected.has(day.iso)).map((day) => day.label);
  if (names.length === 0) return 'Not scheduled on any day';
  return `Due ${names.join(', ')}`;
}

export default function HabitsScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const params = useLocalSearchParams<{ compose?: string }>();
  const compose = params.compose === '1';
  const { settings, refresh, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'boolean' | 'count'>('boolean');
  const [goal, setGoal] = useState('1');
  const [unit, setUnit] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const load = useCallback(async () => {
    if (compose) {
      setReady(true);
      return;
    }
    setHabits(await listHabits(db));
    setReady(true);
  }, [db, compose]);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load, tick]));

  function askDelete(habit: HabitRow) {
    Alert.alert('Delete habit', 'Check-ins are deleted with it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          cancelNotification(habit.notification_id).finally(() => {
            deleteHabit(db, habit.id)
              .then(() => {
                load().catch(() => undefined);
                refresh();
              })
              .catch((error) => Alert.alert('Habit', error instanceof Error ? error.message : 'Could not delete the habit.'));
          });
        },
      },
    ]);
  }

  const form = (
    <>
      <Field label="Habit name" value={name} onChangeText={setName} paper={paper} />
      <Text style={{ color: paper.text, fontSize: 16 }}>How you track it</Text>
      <View style={styles.wrap}>
        <Chip label="Yes or no" selected={kind === 'boolean'} accent={paper.text} paper={paper} onPress={() => setKind('boolean')} />
        <Chip label="Count" selected={kind === 'count'} accent={paper.text} paper={paper} onPress={() => setKind('count')} />
      </View>
      {kind === 'count' ? (
        <>
          <Field label="Daily goal" value={goal} onChangeText={setGoal} paper={paper} />
          <Field label="Unit you count" value={unit} onChangeText={setUnit} paper={paper} placeholder="pages" />
        </>
      ) : null}
      <Text style={{ color: paper.text, fontSize: 16 }}>Days it is due</Text>
      <View style={styles.wrap}>
        {WEEK_LABELS.map((day) => (
            <Chip
              key={day.label}
              label={day.label}
              selected={days.includes(day.iso)}
              accent={paper.text}
              paper={paper}
              onPress={() => setDays((current) => current.includes(day.iso) ? current.filter((item) => item !== day.iso) : [...current, day.iso])}
            />
        ))}
      </View>
      <Button
        label="Create habit"
        color={paper.text}
        textColor={paper.bg}
        onPress={() => {
          let parsedGoal: number | null = null;
          if (kind === 'count') {
            parsedGoal = Number(goal);
            if (!Number.isInteger(parsedGoal) || parsedGoal < 1 || parsedGoal > LIMITS.habitGoalMax) {
              Alert.alert('Habit', 'The goal must be a whole number from 1 to 10000.');
              return;
            }
          }
          createHabit(db, {
            name,
            kind,
            goal: parsedGoal,
            unit: kind === 'count' ? unit : null,
            weekdays: days.join(','),
            reminder_minute: null,
          }).then(() => {
            setName('');
            refresh();
            router.back();
          }).catch((error) => Alert.alert('Habit', error instanceof Error ? error.message : 'Could not create the habit.'));
        }}
      />
    </>
  );

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: compose ? 'Add habit' : 'Edit habits' }} />
      {compose ? form : (
        <>
          <Button label="Statistics" color={paper.text} textColor={paper.text} outline onPress={() => router.push('/stats')} />
          {ready && habits.length === 0 ? (
            <Muted color={paper.muted}>No habits yet.</Muted>
          ) : null}
          {habits.map((habit) => (
            <Card key={habit.id} paper={paper} wave>
              <Text style={{ color: paper.text, fontSize: 18 }}>{habit.name}</Text>
              <Muted color={paper.muted}>{trackedAs(habit)}</Muted>
              <Muted color={paper.muted}>{dueDays(habit.weekdays)}</Muted>
              {habit.archived === 1 ? <Muted color={paper.muted}>Archived</Muted> : null}
              <View style={styles.wrap}>
                <Button label="Open" color={paper.text} textColor={paper.text} outline onPress={() => router.push(`/habit/${habit.id}`)} />
                <Button label="Delete" color={paper.danger} textColor={paper.bg} onPress={() => askDelete(habit)} />
              </View>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 40 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
