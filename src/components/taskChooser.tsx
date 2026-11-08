import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { QuietButton, SelectRow, routineInk } from '@/components/routineForms';
import { Field, errorText } from '@/components/ui';
import { listTaskChoices } from '@/db/tasks';
import type { Paper } from '@/theme/palette';

const PAGE_SIZE = 50;

export function TaskChooser({
  paper,
  selectedId,
  onSelect,
}: {
  paper: Paper;
  selectedId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const db = useSQLiteContext();
  const { secondary } = routineInk(paper);
  const [tasks, setTasks] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    listTaskChoices(db)
      .then((rows) => {
        if (!alive) return;
        setTasks(rows.map((row) => ({ id: row.id, title: row.title })));
      })
      .catch((caught) => {
        if (alive) setError(errorText(caught));
      });
    return () => {
      alive = false;
    };
  }, [db]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (tasks ?? []).filter((task) => task.title.toLowerCase().includes(needle));
  }, [query, tasks]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = shown.slice(start, start + PAGE_SIZE);
  const selected = selectedId == null ? null : (tasks ?? []).find((task) => task.id === selectedId) ?? null;
  const selectedVisible = selected != null && visible.some((task) => task.id === selected.id);

  return (
    <View style={styles.stack}>
      <Field label="Find a task" value={query} onChangeText={setQuery} paper={paper} placeholder="Title" />
      {error ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      {tasks == null && !error ? <Text style={[styles.secondary, { color: secondary }]}>Loading open tasks…</Text> : null}
      {tasks != null && shown.length === 0 ? <Text style={[styles.secondary, { color: secondary }]}>No open task matches.</Text> : null}
      {shown.length > 0 ? (
        <Text style={[styles.secondary, { color: secondary }]}>
          {`Showing ${start + 1}–${start + visible.length} of ${shown.length}. Page ${safePage + 1} of ${pageCount}.`}
        </Text>
      ) : null}
      {selected && !selectedVisible ? <Text style={[styles.secondary, { color: secondary }]}>{`Chosen: ${selected.title}`}</Text> : null}
      {visible.length > 0 ? (
        <View style={[styles.list, { borderColor: routineInk(paper).rule, backgroundColor: paper.surface }]}>
          {visible.map((task) => (
            <SelectRow
              key={task.id}
              label={task.title}
              selected={task.id === selectedId}
              paper={paper}
              trailing={task.id === selectedId ? 'Selected' : undefined}
              onPress={() => onSelect(task.id)}
            />
          ))}
        </View>
      ) : null}
      {safePage > 0 || safePage + 1 < pageCount ? (
        <View style={styles.row}>
          {safePage > 0 ? (
            <QuietButton label="Previous page" paper={paper} fill onPress={() => setPage(safePage - 1)} />
          ) : null}
          {safePage + 1 < pageCount ? (
            <QuietButton label="Next page" paper={paper} fill onPress={() => setPage(safePage + 1)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  list: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
});
