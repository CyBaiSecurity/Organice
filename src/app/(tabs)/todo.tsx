import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, InkFooter, InkHeader, Muted, PageScroll, RowButton, Sheet, Star } from '@/components/ui';
import { completeTask, getLists, listTasks } from '@/db';
import { nowIso } from '@/domain/time';
import { syncTaskSideEffects, type TaskRow } from '@/state/effects';
import { useOrganice } from '@/state/organice';
import { PAPER, taskInk } from '@/theme/palette';

function dueText(task: TaskRow): string | null {
  if (!task.due_at) return null;
  if (task.all_day === 1) return task.due_at.slice(0, 10);
  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) return null;
  return due.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function byDue(left: TaskRow, right: TaskRow): number {
  if (left.due_at && right.due_at && left.due_at !== right.due_at) return left.due_at < right.due_at ? -1 : 1;
  if (left.due_at && !right.due_at) return -1;
  if (!left.due_at && right.due_at) return 1;
  return left.title.localeCompare(right.title);
}

export default function TodoScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const started = ++generation.current;
    const [rows, lists] = await Promise.all([
      listTasks(db, { status: showCompleted ? 'all' : 'open' }),
      getLists(db),
    ]);
    if (generation.current !== started) return;
    const next: Record<string, string> = {};
    for (const list of lists) next[list.id] = list.name;
    setNames(next);
    setTasks([...rows].sort(byDue));
  }, [db, showCompleted]);

  useFocusEffect(useCallback(() => {
    load().catch((error) => Alert.alert('To-do', error instanceof Error ? error.message : 'Could not load tasks.'));
  }, [load]));

  useEffect(() => {
    load().catch((error) => Alert.alert('To-do', error instanceof Error ? error.message : 'Could not load tasks.'));
  }, [load, tick]);

  function markDone(taskId: string) {
    completeTask(db, taskId, nowIso())
      .then((updated) => {
        generation.current += 1;
        setTasks((current) =>
          current
            .map((task) => (task.id === taskId ? { ...task, ...updated } : task))
            .filter((task) => showCompleted || task.status === 'open')
            .sort(byDue),
        );
        refresh();
        syncTaskSideEffects(db, taskId).catch((error) =>
          Alert.alert('To-do', error instanceof Error ? error.message : 'Could not update the reminder or the calendar.'),
        );
      })
      .catch((error) => Alert.alert('To-do', error instanceof Error ? error.message : 'Could not complete that task.'));
  }

  return (
    <View style={styles.screen}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll center>
      <Sheet paper={paper}>
        <View style={styles.kicker}>
          <Star color={paper.text} />
          <Text style={[styles.heading, { color: paper.text }]}>{showCompleted ? 'All tasks' : 'Open tasks'}</Text>
        </View>
        <Button label="New task" color={paper.text} textColor={paper.bg} onPress={() => router.push('/task/new')} />
        <Button
          label={showCompleted ? 'Hide completed' : 'Show completed'}
          color={paper.text}
          textColor={paper.text}
          outline
          onPress={() => setShowCompleted((value) => !value)}
        />
        {tasks.length === 0 ? <Muted color={paper.muted}>{showCompleted ? 'No tasks yet.' : 'No open tasks.'}</Muted> : null}
        {tasks.map((task) => {
          const when = dueText(task);
          const listName = names[task.list_id] ?? 'List';
          const detail = [listName, task.status === 'completed' ? 'Completed' : when].filter((part) => part && part.length > 0).join(' · ');
          return (
            <View key={task.id} style={styles.taskRow}>
              <View style={styles.taskMain}>
                <RowButton
                  paper={paper}
                  wave
                  label={task.title}
                  detail={detail}
                  labelColor={taskInk(task.priority, paper)}
                  dimmed={task.status === 'completed'}
                  onPress={() => router.push(`/task/${task.id}`)}
                />
              </View>
              {task.status === 'open' ? (
                <View style={styles.done}>
                  <Button label="Done" color={paper.text} textColor={paper.bg} onPress={() => markDone(task.id)} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Sheet>
      </PageScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 16, fontFamily: 'Georgia' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskMain: { flex: 1 },
  done: { width: 88 },
});
