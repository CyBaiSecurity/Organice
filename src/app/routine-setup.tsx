import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
  PaperGroup,
  PrimaryButton,
  QuietButton,
  RoutineScreen,
  SelectRow,
  WeekdayPicker,
  routineInk,
} from '@/components/routineForms';
import { errorText } from '@/components/ui';
import { getRoutineConfig, listHabits, previewRoutineTemplate, setupRoutine, type SetupRoutineInput } from '@/db';
import type { RoutineBlockView } from '@/domain/routine';
import { ISO_DAYS, guideInitialized, occurrenceSchedule, usePaper, type GuideConfig } from '@/state/routine';
import { useOrganice } from '@/state/organice';

type HabitChoice = { kind: 'none' } | { kind: 'create' } | { kind: 'link'; id: string };

export default function RoutineSetupScreen() {
  const db = useSQLiteContext();
  const paper = usePaper();
  const { secondary } = routineInk(paper);
  const { refresh } = useOrganice();
  const preview = previewRoutineTemplate();
  const [weekday, setWeekday] = useState(1);
  const [config, setConfig] = useState<GuideConfig | null>(null);
  const [habits, setHabits] = useState<{ id: string; name: string; archived: number }[]>([]);
  const [choice, setChoice] = useState<HabitChoice>({ kind: 'none' });
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, rows] = await Promise.all([getRoutineConfig(db), listHabits(db)]);
      setConfig(nextConfig);
      setHabits(rows);
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

  const shown = preview.patterns
    .flatMap((pattern) => pattern.blocks)
    .filter((block) => block.weekdays.includes(weekday))
    .slice()
    .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));
  const linked = habits.find((habit) => habit.id === config?.workoutHabitId) ?? null;
  const active = habits.filter((habit) => habit.archived === 0);
  const ready = guideInitialized(config);
  const dayName = ISO_DAYS.find((day) => day.iso === weekday)?.name ?? 'This day';

  async function confirm() {
    if (saving || loading) return;
    setSaving(true);
    setError(null);
    const input: SetupRoutineInput = {};
    if (!ready && config?.workoutHabitId == null) {
      if (choice.kind === 'create') input.createWorkout = true;
      if (choice.kind === 'link') input.workoutHabitId = choice.id;
    }
    try {
      await setupRoutine(db, input);
      refresh();
      router.replace('/guide');
    } catch (caught) {
      setSaving(false);
      setError(errorText(caught));
    }
  }

  return (
    <RoutineScreen
      paper={paper}
      footer={<PrimaryButton label={saving ? 'Saving…' : 'Save on this phone'} paper={paper} onPress={() => void confirm()} />}>
      <Text style={[styles.heading, { color: paper.text }]}>Preview the week</Text>
      <Text style={[styles.body, { color: paper.text }]}>
        Saving puts a copy on this phone. You can edit or delete any part of it. Alerts stay off until you turn one on.
      </Text>
      {!loading && ready ? (
        <Text style={[styles.secondary, { color: secondary }]}>
          The guide is already on this phone. Saving again keeps your edits, including parts you removed, and keeps the guide on or off as it is now.
        </Text>
      ) : null}
      {!loading && !ready ? <Text style={[styles.secondary, { color: secondary }]}>Nothing is saved until you confirm.</Text> : null}
      {loading ? <Text style={[styles.secondary, { color: secondary }]}>Loading…</Text> : null}
      {error ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      <WeekdayPicker paper={paper} isSelected={(iso) => weekday === iso} onPress={setWeekday} />
      <Text style={[styles.secondary, { color: secondary }]}>{dayName}</Text>
      <PaperGroup paper={paper}>
        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: secondary }]}>Nothing is on this day.</Text>
        ) : (
          shown.map((block) => <PreviewRow key={block.id} block={block} text={paper.text} secondary={secondary} />)
        )}
      </PaperGroup>
      <View style={styles.section}>
        <Text style={[styles.heading, { color: paper.text }]}>Workout habit</Text>
        {ready ? (
          <Text style={[styles.secondary, { color: secondary }]}>
            {linked ? `${linked.name} stays linked.` : config?.workoutHabitId ? 'The linked workout stays.' : 'No workout habit is linked.'}{' '}
            Saving again keeps the workout choice already stored.
          </Text>
        ) : config?.workoutHabitId ? (
          <Text style={[styles.secondary, { color: secondary }]}>
            {linked ? `${linked.name} is already linked.` : 'A workout habit is already linked.'} Saving will not create another one.
          </Text>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.body, { color: paper.text }]}>{choiceLabel(choice, active)}</Text>
            <Text style={[styles.secondary, { color: secondary }]}>Choose one. This does not check the habit off for you.</Text>
            <QuietButton
              label={choicesOpen ? 'Hide workout choices' : 'Change workout choice'}
              paper={paper}
              onPress={() => setChoicesOpen((open) => !open)}
            />
            {choicesOpen ? (
              <PaperGroup paper={paper}>
                <SelectRow label="No workout habit" selected={choice.kind === 'none'} paper={paper} onPress={() => setChoice({ kind: 'none' })} />
                <SelectRow
                  label="Create a Monday, Wednesday, and Friday workout"
                  selected={choice.kind === 'create'}
                  paper={paper}
                  onPress={() => setChoice({ kind: 'create' })}
                />
                {active.length === 0 ? <Text style={[styles.empty, { color: secondary }]}>No active habit to link.</Text> : null}
                {active.map((habit) => (
                  <SelectRow
                    key={habit.id}
                    label={`Link ${habit.name}`}
                    selected={choice.kind === 'link' && choice.id === habit.id}
                    paper={paper}
                    onPress={() => setChoice({ kind: 'link', id: habit.id })}
                  />
                ))}
              </PaperGroup>
            ) : null}
          </View>
        )}
      </View>
    </RoutineScreen>
  );
}

function choiceLabel(choice: HabitChoice, active: { id: string; name: string }[]): string {
  if (choice.kind === 'create') return 'New Monday, Wednesday, and Friday workout.';
  if (choice.kind === 'link') {
    const habit = active.find((item) => item.id === choice.id);
    return habit ? `Link ${habit.name}.` : 'Link an existing habit.';
  }
  return 'No workout habit.';
}

function PreviewRow({ block, text, secondary }: { block: RoutineBlockView; text: string; secondary: string }) {
  const [open, setOpen] = useState(false);
  const when = occurrenceSchedule(blockAsOccurrence(block));
  return (
    <View style={styles.row}>
      <Text style={[styles.when, { color: secondary }]}>{when}</Text>
      <Text style={[styles.rowTitle, { color: text }]}>{block.title}</Text>
      {block.instructions ? (
        <Pressable
          collapsable={false}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={styles.details}>
          <Text style={[styles.detailsText, { color: secondary }]}>{open ? 'Hide instructions' : 'Instructions'}</Text>
        </Pressable>
      ) : null}
      {open && block.instructions ? <Text style={[styles.instructions, { color: text }]}>{block.instructions}</Text> : null}
    </View>
  );
}

function blockAsOccurrence(block: RoutineBlockView) {
  return {
    blockId: block.id,
    pattern: block.pattern,
    role: block.role,
    title: block.title,
    instructions: block.instructions,
    startMinute: block.role === 'unconfirmed-meeting' ? null : block.startMinute,
    endMinute: block.role === 'unconfirmed-meeting' ? null : block.endMinute,
    activeStartMinute: null,
    activeEndMinute: null,
    timing: block.role === 'unconfirmed-meeting' ? ('open' as const) : block.startMinute == null ? ('open' as const) : ('clock' as const),
    synthetic: false,
  };
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  row: { paddingHorizontal: 12, paddingTop: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#6E6E6E' },
  when: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  rowTitle: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, paddingBottom: 4 },
  details: { minHeight: 44, justifyContent: 'center' },
  detailsText: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  instructions: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, paddingBottom: 12 },
  empty: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20, padding: 12 },
});
