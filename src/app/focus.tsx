import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';

import { Button, Chip, Muted } from '@/components/ui';
import { abandonSession, deleteSessionsStartedBefore, finishSession, getSettings, insertSession, listHabits, listTasks, runningSession, updateSession, updateSettings } from '@/db';
import { breakForCompletedFocus, cycleAfterAbandon, cycleAfterBreak } from '@/domain/focusCycle';
import { LIMITS } from '@/domain/limits';
import { nowIso } from '@/domain/time';
import { useFocusLoop } from '@/services/focusAudio';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';
import { useColorScheme } from 'react-native';

type Running = {
  id: string;
  mode: string;
  phase: string;
  planned_seconds: number | null;
  sound: string;
  started_at: string;
  task_id: string | null;
  habit_id: string | null;
  status: string;
};

const SOUNDS = [
  { value: 'silence', label: 'Silence' },
  { value: 'rain', label: 'Rain' },
  { value: 'cafe', label: 'Café' },
  { value: 'wind', label: 'Wind' },
] as const;

export default function FocusScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, reloadSettings } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [running, setRunning] = useState<Running | null>(null);
  const [timerMode, setTimerMode] = useState<'countdown' | 'countup'>('countdown');
  const [sound, setSound] = useState(settings.white_noise);
  const [link, setLink] = useState<string>('none');
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [habits, setHabits] = useState<{ id: string; name: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const endNote = useRef<string | null>(null);
  const plannedFireAt = useRef<number | null>(null);
  const plannedBody = useRef('Focus is done');
  const armedFor = useRef<number | null>(null);
  const noteEpoch = useRef(0);
  const runningRef = useRef<Running | null>(null);
  runningRef.current = running;
  const loopOn = Boolean(running && running.phase === 'focus' && running.status === 'running');
  const { stoppedByDevice } = useFocusLoop((running?.sound ?? sound) as 'silence' | 'rain' | 'cafe' | 'wind', loopOn);

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - LIMITS.focusDays * 24 * 60 * 60 * 1000).toISOString();
    await deleteSessionsStartedBefore(db, cutoff);
    setRunning((await runningSession(db)) as Running | null);
    setTasks((await listTasks(db, { status: 'open' })) as { id: string; title: string }[]);
    setHabits(((await listHabits(db)) as { id: string; name: string; archived: number }[]).filter((habit) => habit.archived === 0));
    setReady(true);
  }, [db]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function clearEndNote() {
    noteEpoch.current += 1;
    const id = endNote.current;
    endNote.current = null;
    armedFor.current = null;
    plannedFireAt.current = null;
    if (id && id !== 'pending') await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }

  function armEnd(fireAt: number, body: string) {
    if (fireAt <= Date.now()) return;
    if (endNote.current && armedFor.current != null && Math.abs(armedFor.current - fireAt) < 1000) return;
    const previous = endNote.current;
    const epoch = noteEpoch.current;
    armedFor.current = fireAt;
    plannedFireAt.current = fireAt;
    endNote.current = 'pending';
    void (async () => {
      if (previous && previous !== 'pending') await Notifications.cancelScheduledNotificationAsync(previous).catch(() => undefined);
      if (noteEpoch.current !== epoch) return;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: 'Focus', body, data: { url: '/focus' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
        });
        if (noteEpoch.current !== epoch) {
          await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
          return;
        }
        endNote.current = id;
      } catch {
        if (noteEpoch.current === epoch && endNote.current === 'pending') endNote.current = null;
      }
    })();
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void clearEndNote();
        return;
      }
      if (next !== 'background' && next !== 'inactive') return;
      const session = runningRef.current;
      const phaseBody = session?.phase === 'break' ? 'Break is done' : 'Focus is done';
      const recorded = plannedFireAt.current;
      if (!session || session.planned_seconds == null || session.status !== 'running') {
        if (recorded != null && recorded > Date.now()) armEnd(recorded, plannedBody.current || phaseBody);
        return;
      }
      const sessionEnd = new Date(session.started_at).getTime() + session.planned_seconds * 1000;
      if (sessionEnd <= Date.now()) {
        if (recorded == null || recorded <= Date.now()) return;
        armEnd(recorded, plannedBody.current || phaseBody);
        return;
      }
      armEnd(sessionEnd, phaseBody);
    });
    return () => subscription.remove();
  }, []);

  const advance = useCallback(async (session: Running) => {
    if (session.mode === 'countup' || session.phase === 'break') {
      const elapsed = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
      const actual = session.phase === 'break' ? session.planned_seconds ?? elapsed : elapsed;
      await finishSession(db, session.id, nowIso(), actual);
      if (session.phase === 'break') {
        const latest = await getSettings(db);
        const next = cycleAfterBreak(session.planned_seconds === latest.long_break_minutes * 60 ? 'long' : 'short', latest.focus_cycle_count);
        await updateSettings(db, { focus_cycle_count: next });
        await reloadSettings();
      }
      await clearEndNote();
      refresh();
      await load();
      return;
    }
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
    await finishSession(db, session.id, nowIso(), session.planned_seconds ?? elapsed);
    const latest = await getSettings(db);
    const decision = breakForCompletedFocus(latest.focus_cycle_count, latest.long_break_every);
    await updateSettings(db, { focus_cycle_count: decision.cycleCount });
    await reloadSettings();
    const breakSeconds = (decision.breakKind === 'long' ? settings.long_break_minutes : settings.short_break_minutes) * 60;
    await insertSession(db, {
      mode: 'countdown',
      phase: 'break',
      planned_seconds: breakSeconds,
      sound: 'silence',
      task_id: null,
      habit_id: null,
      status: 'running',
      started_at: nowIso(),
    });
    await scheduleEnd(breakSeconds, 'Break is done');
    refresh();
    await load();
  }, [db, load, refresh, reloadSettings, settings.long_break_minutes, settings.short_break_minutes]);

  useEffect(() => {
    if (!running || running.mode === 'countup' || running.planned_seconds == null) return;
    const end = new Date(running.started_at).getTime() + running.planned_seconds * 1000;
    if (Date.now() >= end) advance(running).catch(() => undefined);
  }, [advance, now, running]);

  function scheduleEnd(seconds: number, body: string) {
    const fireAt = Date.now() + seconds * 1000;
    plannedFireAt.current = fireAt;
    plannedBody.current = body;
    if (AppState.currentState === 'background' || AppState.currentState === 'inactive') armEnd(fireAt, body);
  }

  async function start() {
    const current = running ?? ((await runningSession(db)) as Running | null);
    if (current && current.status === 'running') {
      runningRef.current = current;
      setRunning(current);
      Alert.alert('Replace the session', 'Starting another session abandons the current one.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: () => abandon(current).then(startFresh) },
      ]);
      return;
    }
    await startFresh();
  }

  async function startFresh() {
    const planned = timerMode === 'countdown' ? settings.focus_minutes * 60 : null;
    const taskId = link.startsWith('task:') ? link.slice(5) : null;
    const habitId = link.startsWith('habit:') ? link.slice(6) : null;
    await insertSession(db, {
      mode: timerMode,
      phase: 'focus',
      planned_seconds: planned,
      sound,
      task_id: taskId,
      habit_id: habitId,
      status: 'running',
      started_at: nowIso(),
    });
    if (planned) await scheduleEnd(planned, 'Focus is done');
    refresh();
    await load();
  }

  async function abandon(session?: Running) {
    const active = session ?? runningRef.current ?? running;
    if (!active) return;
    runningRef.current = null;
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(active.started_at).getTime()) / 1000));
    await abandonSession(db, active.id, nowIso(), elapsed);
    if (active.phase === 'focus') {
      await updateSettings(db, { focus_cycle_count: cycleAfterAbandon() });
      await reloadSettings();
    }
    await clearEndNote();
    refresh();
    await load();
  }

  async function stopCountUp() {
    if (!running) return;
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(running.started_at).getTime()) / 1000));
    await finishSession(db, running.id, nowIso(), elapsed);
    refresh();
    await load();
  }

  const remaining = running?.planned_seconds != null
    ? Math.max(0, running.planned_seconds - Math.round((now - new Date(running.started_at).getTime()) / 1000))
    : Math.round((now - new Date(running?.started_at ?? now).getTime()) / 1000);

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      {!ready ? null : running ? (
        <>
          <Text style={[styles.clock, { color: paper.text }]}>{formatSeconds(remaining)}</Text>
          <Muted color={paper.muted}>{running.phase === 'break' ? 'Break' : running.mode === 'countup' ? 'Count up' : 'Focus'}</Muted>
          {stoppedByDevice ? <Muted color={paper.muted}>Sound stopped. The timer is still running.</Muted> : null}
          {running.phase === 'focus' ? (
            <>
              <Text style={{ color: paper.text, fontSize: 18 }}>White noise</Text>
              <View style={styles.wrap}>
                {SOUNDS.map((item) => (
                  <Chip key={item.value} label={item.label} selected={(running.sound || sound) === item.value} accent={paper.text} paper={paper} onPress={() => {
                    setSound(item.value);
                    setRunning({ ...running, sound: item.value });
                    updateSession(db, running.id, { sound: item.value }).catch(() => undefined);
                  }} />
                ))}
              </View>
            </>
          ) : null}
          {running.mode === 'countup' && running.phase === 'focus' ? <Button label="Stop" color={paper.text} textColor={paper.bg} onPress={() => stopCountUp()} /> : null}
          <Button label="Abandon" color={paper.danger} textColor={paper.bg} onPress={() => abandon()} />
          {running.phase === 'break' ? <Muted color={paper.muted}>Tap Start focus when the break ends.</Muted> : null}
        </>
      ) : (
        <>
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
          <View style={styles.wrap}>
            <Chip label="None" selected={link === 'none'} accent={paper.text} paper={paper} onPress={() => setLink('none')} />
            {tasks.map((task) => (
              <Chip key={task.id} label={task.title} selected={link === `task:${task.id}`} accent={paper.text} paper={paper} onPress={() => setLink(`task:${task.id}`)} />
            ))}
            {habits.map((habit) => (
              <Chip key={habit.id} label={habit.name} selected={link === `habit:${habit.id}`} accent={paper.text} paper={paper} onPress={() => setLink(`habit:${habit.id}`)} />
            ))}
          </View>
          <Button label="Start focus" color={paper.text} textColor={paper.bg} onPress={() => start().catch((error) => Alert.alert('Focus', error instanceof Error ? error.message : 'Could not start.'))} />
        </>
      )}
    </ScrollView>
  );
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
