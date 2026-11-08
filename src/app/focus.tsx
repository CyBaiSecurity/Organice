import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { TaskChooser } from '@/components/taskChooser';
import { Button, Chip, Muted } from '@/components/ui';
import { listHabits } from '@/db';
import { listTaskChoices } from '@/db/tasks';
import { useOrganice } from '@/state/organice';
import { useFocusRuntime, type FocusSound } from '@/state/focusRuntime';
import { PAPER } from '@/theme/palette';

const SOUNDS = [
  { value: 'silence', label: 'Silence' },
  { value: 'rain', label: 'Rain' },
  { value: 'cafe', label: 'Café' },
  { value: 'wind', label: 'Wind' },
] as const;

export default function FocusScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const routeTaskId = typeof params.taskId === 'string' ? params.taskId : null;
  const { settings } = useOrganice();
  const runtime = useFocusRuntime();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [timerMode, setTimerMode] = useState<'countdown' | 'countup'>('countdown');
  const [sound, setSound] = useState<FocusSound>(isSound(settings.white_noise) ? settings.white_noise : 'silence');
  const [link, setLink] = useState<string>('none');
  const [openTaskIds, setOpenTaskIds] = useState<string[] | null>(null);
  const [habits, setHabits] = useState<{ id: string; name: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [listsReady, setListsReady] = useState(false);
  const seededTask = useRef<string | null>(null);
  const running = runtime.running;

  const load = useCallback(async () => {
    const choices = await listTaskChoices(db);
    setOpenTaskIds(choices.map((choice) => choice.id));
    setHabits(((await listHabits(db)) as { id: string; name: string; archived: number }[]).filter((habit) => habit.archived === 0));
    setListsReady(true);
  }, [db]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // A guide can open this route with a task. Loading the route does not start a session.
  useEffect(() => {
    if (!routeTaskId || seededTask.current === routeTaskId) return;
    if (!openTaskIds?.includes(routeTaskId)) return;
    seededTask.current = routeTaskId;
    setLink(`task:${routeTaskId}`);
  }, [routeTaskId, openTaskIds]);

  function request() {
    return {
      mode: timerMode,
      sound,
      taskId: link.startsWith('task:') ? link.slice(5) : null,
      habitId: link.startsWith('habit:') ? link.slice(6) : null,
    };
  }

  async function onStart() {
    try {
      const result = await runtime.start(request());
      if (result !== 'busy') return;
      Alert.alert('Replace the session', 'Starting another session abandons the current one.', [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: () => {
            void runtime.abandon().then(() => onStart()).catch((error) => Alert.alert('Focus', message(error)));
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Focus', message(error));
    }
  }

  const remaining = running?.planned_seconds != null
    ? Math.max(0, running.planned_seconds - Math.round((now - new Date(running.started_at).getTime()) / 1000))
    : Math.round((now - new Date(running?.started_at ?? now).getTime()) / 1000);

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      {!runtime.ready ? null : running ? (
        <>
          {runtime.recoveryError ? <Muted color={paper.muted}>{runtime.recoveryError}</Muted> : null}
          <Text style={[styles.clock, { color: paper.text }]}>{formatSeconds(remaining)}</Text>
          <Muted color={paper.muted}>{running.phase === 'break' ? 'Break' : running.mode === 'countup' ? 'Count up' : 'Focus'}</Muted>
          {runtime.stoppedByDevice ? <Muted color={paper.muted}>Sound stopped. The timer is still running.</Muted> : null}
          {running.phase === 'focus' ? (
            <>
              <Text style={{ color: paper.text, fontSize: 18 }}>White noise</Text>
              <View style={styles.wrap}>
                {SOUNDS.map((item) => (
                  <Chip key={item.value} label={item.label} selected={(running.sound || sound) === item.value} accent={paper.text} paper={paper} onPress={() => {
                    setSound(item.value);
                    void runtime.setSound(item.value).catch(() => undefined);
                  }} />
                ))}
              </View>
            </>
          ) : null}
          {running.mode === 'countup' && running.phase === 'focus' ? <Button label="Stop" color={paper.text} textColor={paper.bg} onPress={() => { void runtime.stopCountUp().catch((error) => Alert.alert('Focus', message(error))); }} /> : null}
          <Button label="Abandon" color={paper.danger} textColor={paper.bg} onPress={() => { void runtime.abandon().catch((error) => Alert.alert('Focus', message(error))); }} />
          {running.phase === 'break' ? <Muted color={paper.muted}>Tap Start focus when the break ends.</Muted> : null}
        </>
      ) : (
        <>
          {runtime.recoveryError ? <Muted color={paper.muted}>{runtime.recoveryError}</Muted> : null}
          {!listsReady ? null : <>
          <Text style={[styles.clock, { color: paper.text }]}>{settings.focus_minutes}:00</Text>
          <Text style={{ color: paper.text, fontSize: 18 }}>Timer</Text>
          <View style={styles.wrap}>
            <Chip label="Countdown" selected={timerMode === 'countdown'} accent={paper.text} paper={paper} onPress={() => setTimerMode('countdown')} />
            <Chip label="Count up" selected={timerMode === 'countup'} accent={paper.text} paper={paper} onPress={() => setTimerMode('countup')} />
          </View>
          <Text style={{ color: paper.text, fontSize: 18 }}>White noise</Text>
          <View style={styles.wrap}>
            {SOUNDS.map((item) => (
              <Chip key={item.value} label={item.label} selected={sound === item.value} accent={paper.text} paper={paper} onPress={() => setSound(item.value)} />
            ))}
          </View>
          <Text style={{ color: paper.text, fontSize: 18 }}>Link this session</Text>
          <Chip label="None" selected={link === 'none'} accent={paper.text} paper={paper} onPress={() => setLink('none')} />
          <TaskChooser
            paper={paper}
            selectedId={link.startsWith('task:') ? link.slice(5) : null}
            onSelect={(taskId) => setLink(`task:${taskId}`)}
          />
          <View style={styles.wrap}>
            {habits.map((habit) => (
              <Chip key={habit.id} label={habit.name} selected={link === `habit:${habit.id}`} accent={paper.text} paper={paper} onPress={() => setLink(`habit:${habit.id}`)} />
            ))}
          </View>
          <Button label="Start focus" color={paper.text} textColor={paper.bg} onPress={() => { void onStart(); }} />
          </>}
        </>
      )}
    </ScrollView>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not update focus.';
}

function isSound(value: string): value is FocusSound {
  return value === 'silence' || value === 'rain' || value === 'cafe' || value === 'wind';
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 40 },
  clock: { fontSize: 64, fontFamily: 'Georgia' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
