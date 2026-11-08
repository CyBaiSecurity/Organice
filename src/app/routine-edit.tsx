import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { GuideAlerts } from '@/components/routineGuide';
import {
  DraftForm,
  PaperGroup,
  PrimaryButton,
  QuietButton,
  RoutineScreen,
  WeekdayPicker,
  routineInk,
  type Draft,
} from '@/components/routineForms';
import { errorText } from '@/components/ui';
import {
  deleteRoutineBlock,
  getRoutineConfig,
  listHabits,
  listRoutineBlocks,
  setRoutineEnabled,
  toRoutineBlockView,
  updateRoutineBlock,
} from '@/db';
import { manilaWeekday, type RoutineBlockView } from '@/domain/routine';
import { clockLabel } from '@/state/clock';
import { ISO_DAYS, blocksOnWeekday, guideInitialized, patternForWeekday, usePaper, type GuideConfig } from '@/state/routine';
import { useOrganice } from '@/state/organice';

export default function RoutineEditScreen() {
  const db = useSQLiteContext();
  const paper = usePaper();
  const { secondary } = routineInk(paper);
  const { refresh } = useOrganice();
  const scrollRef = useRef<ScrollView>(null);
  const [config, setConfig] = useState<GuideConfig | null>(null);
  const [blocks, setBlocks] = useState<RoutineBlockView[]>([]);
  const [habitName, setHabitName] = useState<string | null>(null);
  const [day, setDay] = useState(() => manilaWeekday(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageScroll, setPageScroll] = useState(true);
  const mode = draft ? 'edit' : reordering ? 'reorder' : 'list';

  // A time-wheel drag turns the page scroller off and may never emit a release.
  // Entering or leaving the editor, or reorder, has to turn scrolling back on and jump to the top.
  useLayoutEffect(() => {
    setPageScroll(true);
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextConfig, rows, habits] = await Promise.all([getRoutineConfig(db), listRoutineBlocks(db), listHabits(db)]);
      setConfig(nextConfig);
      setBlocks(rows.map(toRoutineBlockView));
      const linked = habits.find((habit) => habit.id === nextConfig.workoutHabitId);
      setHabitName(linked?.name ?? (nextConfig.workoutHabitId ? 'Linked workout' : null));
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = blocksOnWeekday(blocks, day, true);
  const ready = config != null && guideInitialized(config);
  const dayName = ISO_DAYS.find((item) => item.iso === day)?.name ?? 'This day';

  function openBlock(block: RoutineBlockView) {
    const meeting = block.role === 'unconfirmed-meeting';
    setReordering(false);
    setPageScroll(true);
    setDraft({
      id: block.id,
      title: block.title,
      instructions: block.instructions,
      weekdays: [...block.weekdays],
      timed: meeting ? true : block.startMinute != null,
      start: meeting || block.startMinute == null ? '' : clockLabel(block.startMinute),
      end: meeting || block.endMinute == null ? '' : clockLabel(block.endMinute),
      enabled: block.enabled,
      remind: meeting ? false : block.remind,
      role: block.role,
      pattern: block.pattern,
      timeEdited: meeting ? false : true,
      meeting,
    });
    setError(null);
  }

  function startNew() {
    setReordering(false);
    setPageScroll(true);
    setDraft({
      id: null,
      title: '',
      instructions: '',
      weekdays: [day],
      timed: false,
      start: '',
      end: '',
      enabled: true,
      remind: false,
      role: 'fixed',
      pattern: patternForWeekday(day),
      timeEdited: true,
      meeting: false,
    });
    setError(null);
  }

  function closeDraft() {
    setPageScroll(true);
    setDraft(null);
  }

  async function afterWrite(reopen: string | null, replaceDraft = true) {
    refresh();
    const [nextConfig, rows] = await Promise.all([getRoutineConfig(db), listRoutineBlocks(db)]);
    const views = rows.map(toRoutineBlockView);
    setConfig(nextConfig);
    setBlocks(views);
    if (!reopen) return;
    if (!replaceDraft) {
      setDraft((current) => (current ? { ...current, id: reopen } : current));
      return;
    }
    const next = views.find((block) => block.id === reopen);
    if (next) openBlock(next);
    else setDraft(null);
  }

  async function move(id: string, direction: -1 | 1) {
    const index = visible.findIndex((block) => block.id === id);
    const current = visible[index];
    const neighbor = visible[index + direction];
    if (!current || !neighbor) return;
    setError(null);
    try {
      if (current.sort === neighbor.sort) {
        await updateRoutineBlock(db, current.id, { sort: neighbor.sort + direction });
      } else {
        await updateRoutineBlock(db, current.id, { sort: neighbor.sort });
        await updateRoutineBlock(db, neighbor.id, { sort: current.sort });
      }
      refresh();
      const rows = await listRoutineBlocks(db);
      setBlocks(rows.map(toRoutineBlockView));
    } catch (caught) {
      setError(errorText(caught));
      void load();
    }
  }

  function askDelete(block: RoutineBlockView) {
    Alert.alert('Delete this part of the day?', block.title, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteRoutineBlock(db, block.id)
            .then(async () => {
              if (draft?.id === block.id) {
                setPageScroll(true);
                setDraft(null);
              }
              await afterWrite(null);
            })
            .catch((caught) => setError(errorText(caught)));
        },
      },
    ]);
  }

  return (
    <RoutineScreen
      paper={paper}
      scrollRef={scrollRef}
      scrollEnabled={pageScroll}
      footer={
        config && guideInitialized(config) && draft == null ? (
          <PrimaryButton label="Add to this day" paper={paper} onPress={startNew} />
        ) : null
      }>
      {draft == null ? <Text style={[styles.heading, { color: paper.text }]}>Edit the week</Text> : null}
      {draft == null ? (
        <Text style={[styles.secondary, { color: secondary }]}>Changes stay on this phone. Nothing here resets the week.</Text>
      ) : null}
      {loading && !config ? <Text style={[styles.secondary, { color: secondary }]}>Loading the week…</Text> : null}
      {draft == null && error ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      {config && !ready ? (
        <View style={styles.stack}>
          <Text style={[styles.body, { color: paper.text }]}>Save the guide before editing it.</Text>
          <PrimaryButton label="Preview the guide" paper={paper} onPress={() => router.push('/routine-setup')} />
        </View>
      ) : null}
      {config && guideInitialized(config) && draft == null ? (
        <View style={styles.stack}>
          <QuietButton
            label={config.enabled ? 'Turn the guide off' : 'Turn the guide on'}
            paper={paper}
            onPress={() => {
              void setRoutineEnabled(db, !config.enabled)
                .then(async () => {
                  refresh();
                  await load();
                })
                .catch((caught) => setError(errorText(caught)));
            }}
          />
          <Text style={[styles.secondary, { color: secondary }]}>
            {habitName ? `Workout habit: ${habitName}.` : 'No workout habit is linked.'}
          </Text>
          <GuideAlerts paper={paper} />
          <Text style={[styles.body, { color: paper.text }]}>{dayName}</Text>
          <Text style={[styles.secondary, { color: secondary }]}>
            This only filters the list. Saving a part changes every weekday checked on it. Monday and Wednesday stay one shared part.
          </Text>
          <WeekdayPicker paper={paper} isSelected={(iso) => day === iso} onPress={setDay} />
          <QuietButton
            label={reordering ? 'Done reordering' : 'Reorder'}
            paper={paper}
            onPress={() => setReordering((value) => !value)}
          />
          {visible.length === 0 ? <Text style={[styles.secondary, { color: secondary }]}>Nothing is saved for this day.</Text> : null}
          {visible.length > 0 ? (
            <PaperGroup paper={paper}>
              {visible.map((block) =>
                reordering ? (
                  <View key={block.id} style={styles.block}>
                    <BlockCopy block={block} text={paper.text} secondary={secondary} />
                    <View style={styles.reorder}>
                      <QuietButton
                        label="Up"
                        paper={paper}
                        fill
                        onPress={() => void move(block.id, -1)}
                        accessibilityLabel={`Move ${block.title} up`}
                      />
                      <QuietButton
                        label="Down"
                        paper={paper}
                        fill
                        onPress={() => void move(block.id, 1)}
                        accessibilityLabel={`Move ${block.title} down`}
                      />
                    </View>
                  </View>
                ) : (
                  <Pressable
                    key={block.id}
                    collapsable={false}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${block.title}`}
                    onPress={() => openBlock(block)}
                    style={({ pressed }) => [styles.editRow, pressed ? { opacity: 0.72 } : null]}>
                    <BlockCopy block={block} text={paper.text} secondary={secondary} />
                    <Text style={[styles.editLabel, { color: secondary }]}>Edit</Text>
                  </Pressable>
                ),
              )}
            </PaperGroup>
          ) : null}
        </View>
      ) : null}
      {ready && draft ? (
        <DraftForm
          draft={draft}
          paper={paper}
          error={error}
          onChange={setDraft}
          onDrag={(active) => setPageScroll(!active)}
          onCancel={closeDraft}
          onError={setError}
          onSaved={(id, replaceDraft) => void afterWrite(id, replaceDraft).catch((caught) => setError(errorText(caught)))}
          onDelete={
            draft.id
              ? () => {
                  const block = blocks.find((item) => item.id === draft.id);
                  if (block) askDelete(block);
                }
              : null
          }
        />
      ) : null}
    </RoutineScreen>
  );
}

function BlockCopy({ block, text, secondary }: { block: RoutineBlockView; text: string; secondary: string }) {
  return (
    <View style={styles.blockBody}>
      <Text style={[styles.when, { color: secondary }]}>{scheduleLabel(block)}</Text>
      <Text style={[styles.rowTitle, { color: text }]}>{block.title}</Text>
      <StatusLine block={block} color={secondary} />
    </View>
  );
}

function StatusLine({ block, color }: { block: RoutineBlockView; color: string }) {
  if (block.enabled) return null;
  return <Text style={[styles.when, { color }]}>Hidden</Text>;
}

function scheduleLabel(block: RoutineBlockView): string {
  if (block.role === 'unconfirmed-meeting') return 'Needs a confirmed time';
  if (block.startMinute == null) return 'No fixed time';
  const start = clockLabel(block.startMinute);
  if (block.endMinute == null) return start;
  return `${start}–${clockLabel(block.endMinute)}`;
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  heading: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  block: { paddingHorizontal: 12, paddingTop: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#6E6E6E' },
  editRow: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#6E6E6E',
  },
  blockBody: { flex: 1, gap: 2 },
  editLabel: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  when: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  rowTitle: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  reorder: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
});
