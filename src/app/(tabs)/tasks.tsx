import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Field, InkFooter, InkHeader, PageScroll, RowButton, Sheet, Star } from '@/components/ui';
import { createList, getLists, listTasks } from '@/db';
import { ACCENT_NAMES, PAPER, accentColor, accentInk, taskInk } from '@/theme/palette';
import { useOrganice } from '@/state/organice';
import { useColorScheme } from 'react-native';

type ListRow = { id: string; name: string; accent: string; is_inbox: number };

export default function TasksScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [lists, setLists] = useState<ListRow[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; title: string; priority: number }[]>([]);
  const [settled, setSettled] = useState('');
  const [generation, setGeneration] = useState(0);
  const [name, setName] = useState('');
  const [listAccent, setListAccent] = useState('ink');
  const [composing, setComposing] = useState(false);

  const loadLists = useCallback(async () => {
    setLists((await getLists(db)) as ListRow[]);
  }, [db]);

  useFocusEffect(useCallback(() => {
    setGeneration((value) => value + 1);
    loadLists().catch((error) => Alert.alert('Tasks', error instanceof Error ? error.message : 'Could not load lists.'));
  }, [loadLists]));

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setSettled('');
      return;
    }
    let cancelled = false;
    listTasks(db, { search: trimmed })
      .then((rows) => {
        if (cancelled) return;
        setHits(rows as { id: string; title: string; priority: number }[]);
        setSettled(trimmed);
      })
      .catch((error) => {
        if (cancelled) return;
        Alert.alert('Tasks', error instanceof Error ? error.message : 'Could not search tasks.');
      });
    return () => {
      cancelled = true;
    };
  }, [db, generation, query]);

  async function addList() {
    try {
      await createList(db, { name, accent: listAccent });
    } catch (error) {
      Alert.alert('List', error instanceof Error ? error.message : 'Could not create the list.');
      return;
    }
    setName('');
    setComposing(false);
    refresh();
    loadLists().catch((error) => Alert.alert('Tasks', error instanceof Error ? error.message : 'Could not load lists.'));
  }

  return (
    <View style={styles.screen}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll center={!query.trim()} keyboardShouldPersistTaps="handled">
      <Sheet paper={paper}>
      <Field label="Search titles and notes" value={query} onChangeText={setQuery} paper={paper} />
      {hits.map((task) => (
        <RowButton key={task.id} paper={paper} wave label={task.title} labelColor={taskInk(task.priority, paper)} onPress={() => router.push(`/task/${task.id}`)} />
      ))}
      {query.trim() && settled === query.trim() && hits.length === 0 ? (
        <Text style={{ color: paper.muted }}>No tasks match that search.</Text>
      ) : null}
      <View style={styles.kicker}>
        <Star color={paper.text} />
        <Text style={[styles.heading, { color: paper.text }]}>Your lists</Text>
      </View>
      {lists.map((list) => (
        <RowButton key={list.id} paper={paper} wave label={list.name} detail={list.is_inbox ? 'Inbox' : undefined} labelColor={accentInk(list.accent, paper)} onPress={() => router.push(`/list/${list.id}`)} />
      ))}
      <Button
        label={composing ? 'Close new list' : 'Create list'}
        color={paper.text}
        textColor={paper.text}
        outline
        onPress={() => setComposing((open) => !open)}
      />
      {composing ? (
        <View style={styles.compose}>
          <Field label="List name" value={name} onChangeText={setName} paper={paper} placeholder="School, home, work" />
          <Text style={{ color: paper.muted }}>List color</Text>
          <View style={styles.accents}>
            {ACCENT_NAMES.map((item) => {
              const selected = listAccent === item;
              const ink = accentInk(item, paper);
              return (
                <Button
                  key={item}
                  label={item[0].toUpperCase() + item.slice(1)}
                  color={selected ? accentColor(item) : ink}
                  textColor={selected ? '#F4F4F4' : ink}
                  outline={!selected}
                  onPress={() => setListAccent(item)}
                />
              );
            })}
          </View>
          <Button label="Save list" color={paper.text} textColor={paper.bg} onPress={addList} />
        </View>
      ) : null}
      </Sheet>
      </PageScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 16, fontFamily: 'Georgia' },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compose: { gap: 12 },
});
