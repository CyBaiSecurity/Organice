import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Field, Muted } from '@/components/ui';
import { createIdea, deleteIdea, deleteReview, getIdea, updateIdea } from '@/db';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';

type IdeaDetail = {
  id: string;
  title: string;
  body: string;
  status: string;
  task_id: string | null;
  review_text: string | null;
  reviewed_at: string | null;
};

export default function IdeaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const isNew = id === 'new';

  const load = useCallback(async () => {
    if (isNew) return;
    const row = (await getIdea(db, id)) as IdeaDetail | null;
    setIdea(row);
    if (row) {
      setTitle(row.title);
      setBody(row.body);
    }
  }, [db, id, isNew]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  async function saveNew() {
    try {
      await createIdea(db, { title, body });
      refresh();
      router.back();
    } catch (error) {
      Alert.alert('Idea', error instanceof Error ? error.message : 'Could not save.');
    }
  }

  if (!isNew && !idea) return null;

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: isNew ? 'New idea' : 'Idea' }} />
      <Field label="Title" value={title} onChangeText={setTitle} paper={paper} />
      <Field label="Idea notes" value={body} onChangeText={setBody} paper={paper} multiline />
      {isNew ? (
        <>
          <Button label="Save idea" color={paper.text} textColor={paper.bg} onPress={() => saveNew()} />
        </>
      ) : null}
      {!isNew && idea ? (
        <>
          <Button
            label="Save idea"
            color={paper.text}
            textColor={paper.bg}
            onPress={() => updateIdea(db, id, { title, body }).then(refresh).catch((error) => Alert.alert('Idea', error instanceof Error ? error.message : 'Could not save.'))}
          />
          <Muted color={paper.muted}>Status: {idea.status}</Muted>
          {idea.review_text ? (
            <>
              <Text style={{ color: paper.text, fontSize: 18 }}>Review</Text>
              <Text style={{ color: paper.text }}>{idea.review_text}</Text>
              <Muted color={paper.muted}>{idea.reviewed_at ?? ''}</Muted>
              <Button
                label="Delete review"
                color={paper.text}
                textColor={paper.text}
                outline
                onPress={() =>
                  Alert.alert('Delete review', 'The review text will be removed. The idea itself stays.', [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteReview(db, id).then(() => { refresh(); load(); }),
                    },
                  ])
                }
              />
            </>
          ) : (
            <Muted color={paper.muted}>No review yet.</Muted>
          )}
          <Button
            label="Delete idea"
            color={paper.danger}
            textColor={paper.bg}
            onPress={() =>
              Alert.alert('Delete idea', 'The compiled task, if there is one, stays.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteIdea(db, id).then(() => { refresh(); router.back(); }),
                },
              ])
            }
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 40 },
});
