import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, InkFooter, InkHeader, Muted, PageScroll, RowButton, Sheet, Star } from '@/components/ui';
import { compileIdeas, exportIdeas, getLists, importReviews, listIdeas } from '@/db';
import { buildIdeasFile } from '@/domain/ideasFile';
import { nowIso } from '@/domain/time';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';
import { pickTextFile, shareTextFile } from '@/services/shareFile';

type IdeaRow = { id: string; title: string; status: string; task_id: string | null };

export default function IdeasScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setIdeas((await listIdeas(db)) as IdeaRow[]);
    setLists((await getLists(db)) as { id: string; name: string }[]);
  }, [db]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load, tick]));

  async function compile(listId: string) {
    const again = picked.filter((id) => ideas.find((idea) => idea.id === id)?.task_id);
    const run = async () => {
      await compileIdeas(db, picked, listId);
      setPicked([]);
      refresh();
    };
    if (again.length > 0) {
      Alert.alert('Compile again', 'A task already exists for at least one selected idea. Compiling creates another task and leaves the first one.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create another', onPress: () => run().catch((error) => Alert.alert('Compile', error instanceof Error ? error.message : 'Could not compile.')) },
      ]);
      return;
    }
    await run();
  }

  async function share(ids: string[] | null) {
    const rows = await exportIdeas(db, ids);
    const file = buildIdeasFile(rows as never, nowIso());
    await shareTextFile(ids ? 'idea.json' : 'ideas.json', JSON.stringify(file, null, 2), 'application/json');
  }

  async function importFile() {
    const text = await pickTextFile();
    if (!text) return;
    const result = await importReviews(db, text);
    if ('error' in result) {
      Alert.alert('Import', result.error);
      return;
    }
    Alert.alert('Import', `Updated ${result.updated}. Skipped ${result.skipped}.`);
    refresh();
  }

  return (
    <View style={styles.screen}>
      <InkFooter color={paper.text} back />
      <InkHeader color={paper.text} />
      <PageScroll center>
      <Sheet paper={paper}>
      <Button label="Add idea" color={paper.text} textColor={paper.bg} onPress={() => router.push('/idea/new')} />
      {ideas.length === 0 ? <Muted color={paper.muted}>No ideas yet.</Muted> : null}
      {ideas.map((idea) => (
        <RowButton
          key={idea.id}
          paper={paper}
          label={`${picked.includes(idea.id) ? '● ' : ''}${idea.title}`}
          detail={ideaState(idea.status)}
          onPress={() => {
            if (picked.length > 0) {
              setPicked((current) => (current.includes(idea.id) ? current.filter((item) => item !== idea.id) : [...current, idea.id]));
              return;
            }
            router.push(`/idea/${idea.id}`);
          }}
        />
      ))}
      <View style={styles.kicker}>
        <Star color={paper.text} />
        <Text style={[styles.heading, { color: paper.text }]}>Review file</Text>
      </View>
      <Muted color={paper.muted}>Import replaces the review text only.</Muted>
      <View style={styles.row}>
        <Button label={picked.length ? 'Clear selection' : 'Select all'} color={paper.text} textColor={paper.text} outline onPress={() => setPicked(picked.length ? [] : ideas.map((idea) => idea.id))} />
        <Button label="Export all" color={paper.text} textColor={paper.text} outline onPress={() => share(null).catch((error) => Alert.alert('Export', error instanceof Error ? error.message : 'Could not export.'))} />
        <Button label="Import review" color={paper.text} textColor={paper.text} outline onPress={() => importFile().catch((error) => Alert.alert('Import', error instanceof Error ? error.message : 'Could not import.'))} />
      </View>
      {picked.length > 0 ? (
        <View style={styles.block}>
          <Text style={{ color: paper.text }}>Compile into</Text>
          {lists.map((list) => (
            <Button key={list.id} label={list.name} color={paper.text} textColor={paper.bg} onPress={() => compile(list.id).catch((error) => Alert.alert('Compile', error instanceof Error ? error.message : 'Could not compile.'))} />
          ))}
          <Button label="Export selected" color={paper.text} textColor={paper.text} outline onPress={() => share(picked).catch((error) => Alert.alert('Export', error instanceof Error ? error.message : 'Could not export.'))} />
        </View>
      ) : null}
      </Sheet>
      </PageScroll>
    </View>
  );
}

function ideaState(status: string): string {
  if (status === 'compiled') return 'Compiled into a task';
  if (status === 'reviewed') return 'Reviewed';
  return 'Not compiled';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 16, fontFamily: 'Georgia' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: { gap: 8 },
});
