import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { TaskChooser } from '@/components/taskChooser';
import { PrimaryButton, QuietButton, RoutineScreen, routineInk } from '@/components/routineForms';
import { getRoutineReview, getTask, saveRoutineReview, type RoutineReview, type RoutineReviewInput } from '@/db';
import { errorText } from '@/components/ui';
import { REVIEW_PROMPTS, addDateDays, manilaDateKey, weekEndingSunday } from '@/domain/routine';
import { manilaDayLabel, usePaper } from '@/state/routine';
import { useOrganice } from '@/state/organice';

export default function RoutineReviewScreen() {
  const db = useSQLiteContext();
  const paper = usePaper();
  const { secondary, rule } = routineInk(paper);
  const { refresh } = useOrganice();
  const [anchor, setAnchor] = useState(() => manilaDateKey(new Date()));
  const ending = weekEndingSunday(anchor);
  const currentEnding = weekEndingSunday(manilaDateKey(new Date()));
  const monday = addDateDays(ending, 1);
  const [review, setReview] = useState<RoutineReview | null>(null);
  const [finished, setFinished] = useState('');
  const [attention, setAttention] = useState('');
  const [crowded, setCrowded] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [pickedTitle, setPickedTitle] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const ticket = useRef(0);
  const pickTicket = useRef(0);
  const dirtyRef = useRef(false);
  const selectionTouchedRef = useRef(false);
  dirtyRef.current = dirty;
  selectionTouchedRef.current = selectionTouched;

  const load = useCallback(async () => {
    const id = ++ticket.current;
    pickTicket.current += 1;
    setLoading(true);
    setError(null);
    setReview(null);
    setFinished('');
    setAttention('');
    setCrowded('');
    setChosen(null);
    setBaseline(null);
    setSavedTitle(null);
    setPickedTitle(null);
    try {
      const next = await getRoutineReview(db, ending);
      if (id !== ticket.current) return;
      let title: string | null = null;
      if (next.nextTaskId && next.nextTaskStatus !== 'missing') {
        const task = await getTask(db, next.nextTaskId);
        if (id !== ticket.current) return;
        title = task?.title ?? null;
      }
      if (id !== ticket.current) return;
      setReview(next);
      setFinished(next.finished);
      setAttention(next.attention);
      setCrowded(next.crowded);
      setChosen(next.nextTaskId);
      setBaseline(next.nextTaskId);
      setSavedTitle(title);
      setDirty(false);
      setSelectionTouched(false);
    } catch (caught) {
      if (id !== ticket.current) return;
      setError(errorText(caught));
    } finally {
      if (id === ticket.current) setLoading(false);
    }
  }, [db, ending]);

  useFocusEffect(
    useCallback(() => {
      if (dirtyRef.current || selectionTouchedRef.current) return;
      void load();
    }, [load]),
  );

  function edit(field: 'finished' | 'attention' | 'crowded', value: string) {
    setDirty(true);
    if (field === 'finished') setFinished(value);
    if (field === 'attention') setAttention(value);
    if (field === 'crowded') setCrowded(value);
  }

  function shiftWeek(nextAnchor: string) {
    setDirty(false);
    setSelectionTouched(false);
    setPickerOpen(false);
    setAnchor(nextAnchor);
  }

  function chooseTask(taskId: string) {
    setSelectionTouched(true);
    setChosen(taskId);
    const id = ++pickTicket.current;
    void getTask(db, taskId)
      .then((task) => {
        if (id !== pickTicket.current) return;
        setPickedTitle(task?.title ?? null);
      })
      .catch(() => {
        if (id !== pickTicket.current) return;
        setPickedTitle(null);
      });
  }

  async function save() {
    if (saving || loading || review == null || weekEndingSunday(anchor) !== review.weekEnding) return;
    setSaving(true);
    setError(null);
    const input: RoutineReviewInput = { finished, attention, crowded };
    if (selectionTouched) input.nextTaskId = chosen;
    try {
      await saveRoutineReview(db, ending, input);
      refresh();
      setDirty(false);
      setSelectionTouched(false);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  const answers = { finished, attention, crowded };
  const savedTaskNote =
    review?.nextTaskStatus === 'completed'
      ? `${savedTitle ?? 'The saved task'} is finished. You can update these notes without choosing it again.`
      : review?.nextTaskStatus === 'missing'
        ? 'The saved task is gone. You can update these notes without choosing it again.'
        : null;
  const selectionNote =
    !selectionTouched
      ? null
      : chosen == null
        ? 'No task will be assigned for this Monday.'
        : chosen === baseline
          ? null
          : pickedTitle
            ? `Selected: ${pickedTitle}`
            : 'A task is selected for this Monday.';

  return (
    <RoutineScreen
      paper={paper}
      footer={<PrimaryButton label={saving ? 'Saving…' : 'Save review'} paper={paper} onPress={() => void save()} />}>
      <Text style={[styles.heading, { color: paper.text }]}>
        {manilaDayLabel(addDateDays(ending, -6))} through {manilaDayLabel(ending)}
      </Text>
      <Text style={[styles.secondary, { color: secondary }]}>Your own notes. Nothing here is counted for you.</Text>
      <View style={styles.row}>
        <QuietButton label="Previous week" paper={paper} fill onPress={() => shiftWeek(addDateDays(ending, -7))} />
        {ending < currentEnding ? (
          <QuietButton label="Next week" paper={paper} fill onPress={() => shiftWeek(addDateDays(ending, 7))} />
        ) : null}
      </View>
      {loading ? <Text style={[styles.secondary, { color: secondary }]}>Loading this week…</Text> : null}
      {error ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      {error ? <QuietButton label="Try again" paper={paper} onPress={() => void load()} /> : null}
      {!loading && review && !review.saved ? (
        <Text style={[styles.secondary, { color: secondary }]}>Nothing is saved for this week yet.</Text>
      ) : null}
      {REVIEW_PROMPTS.map((item) => (
        <View key={item.field} style={[styles.prompt, { backgroundColor: paper.surface, borderColor: rule }]}>
          <Text style={[styles.promptTitle, { color: paper.text }]}>{item.prompt}</Text>
          <TextInput
            accessibilityLabel={item.prompt}
            value={answers[item.field]}
            onChangeText={(value) => edit(item.field, value)}
            multiline
            textAlignVertical="top"
            style={[styles.input, { color: paper.text }]}
          />
        </View>
      ))}
      <View style={styles.section}>
        <Text style={[styles.heading, { color: paper.text }]}>Monday’s task</Text>
        <Text style={[styles.secondary, { color: secondary }]}>For {manilaDayLabel(monday)}.</Text>
        {savedTaskNote ? <Text style={[styles.body, { color: paper.text }]}>{savedTaskNote}</Text> : null}
        {review?.nextTaskStatus === 'open' && savedTitle ? (
          <Text style={[styles.secondary, { color: secondary }]}>Saved task: {savedTitle}</Text>
        ) : null}
        {!selectionTouched && review && review.nextTaskStatus !== 'open' && !savedTaskNote ? (
          <Text style={[styles.secondary, { color: secondary }]}>No task is saved for this Monday.</Text>
        ) : null}
        {selectionNote ? <Text style={[styles.body, { color: paper.text }]}>{selectionNote}</Text> : null}
        <View style={styles.row}>
          <QuietButton
            label={pickerOpen ? 'Hide tasks' : 'Choose a task'}
            paper={paper}
            fill
            onPress={() => setPickerOpen((open) => !open)}
          />
          <QuietButton
            label="Don’t assign a task"
            paper={paper}
            fill
            onPress={() => {
              pickTicket.current += 1;
              setSelectionTouched(true);
              setChosen(null);
              setPickedTitle(null);
            }}
          />
        </View>
        {pickerOpen ? <TaskChooser paper={paper} selectedId={chosen} onSelect={chooseTask} /> : null}
      </View>
    </RoutineScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8 },
  prompt: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 8 },
  promptTitle: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  input: { minHeight: 88, fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, padding: 0 },
});
