import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { GuideAlerts, TaskChooser } from '@/components/routineGuide';
import { RoutineTimeline } from '@/components/routineTimeline';
import { Button, errorText } from '@/components/ui';
import { clearRoutineOverrides, selectRoutineTask, setRoutineEnabled, updateRoutineDay } from '@/db';
import { addDateDays, manilaMinuteOfDay } from '@/domain/routine';
import { clockLabel } from '@/state/clock';
import {
  guideInitialized,
  manilaDayLabel,
  occurrenceSchedule,
  reviewIsDue,
  useRoutineGuide,
  weekdayHasRole,
} from '@/state/routine';
import { useOrganice } from '@/state/organice';
import type { Paper } from '@/theme/palette';

export function RoutinePage({ paper }: { paper: Paper }) {
  const db = useSQLiteContext();
  const { refresh } = useOrganice();
  const [dateKey, setDateKey] = useState('');
  const state = useRoutineGuide(dateKey || undefined);
  const viewed = dateKey || state.todayKey;
  const [picking, setPicking] = useState<'choose' | 'focus' | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const secondary = paper.text === '#000000' ? '#4A4A4A' : '#B5B5B5';
  const viewingToday = viewed === state.todayKey;
  const reviewDueToday = viewingToday && reviewIsDue(state.now);
  const guideOn = state.config?.enabled === true;
  const day = state.day;
  const plan = state.plan;
  const iso = plan?.isoWeekday ?? null;
  const schoolDay = iso != null && weekdayHasRole(state.blocks, iso, ['school', 'commute']);
  const canComeHome = iso != null && weekdayHasRole(state.blocks, iso, ['commute', 'first-hour-at-home']);
  const canBeLate = iso != null && weekdayHasRole(state.blocks, iso, ['commute', 'first-hour-at-home', 'evening']);
  const overrideLabels = [
    day?.noClasses ? 'no classes' : null,
    day?.homeAtMinute != null ? 'home now' : null,
    day?.homeLate ? 'home late' : null,
  ].filter((item): item is string => item != null);
  const canAdjust =
    (schoolDay && !day?.noClasses) || (canComeHome && day?.homeAtMinute == null) || (canBeLate && !day?.homeLate);

  async function run(work: () => Promise<void>) {
    setActionError(null);
    try {
      await work();
      refresh();
      state.reload();
    } catch (caught) {
      setActionError(errorText(caught));
    }
  }

  function openFocus(taskId: string) {
    router.push({ pathname: '/focus', params: { taskId } });
  }

  async function chooseTask(taskId: string, thenFocus: boolean) {
    setActionError(null);
    try {
      await selectRoutineTask(db, viewed, taskId);
      refresh();
      state.reload();
      setPicking(null);
      if (thenFocus) openFocus(taskId);
    } catch (caught) {
      setActionError(errorText(caught));
    }
  }

  const current = guideOn ? plan?.current ?? null : null;
  const next = guideOn ? plan?.next ?? null : null;
  const pendingMeeting = plan?.occurrences.some((item) => item.role === 'unconfirmed-meeting') ?? false;

  return (
    <View style={styles.page}>
      <View style={styles.dateRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          hitSlop={8}
          onPress={() => setDateKey(addDateDays(viewed, -1))}
          style={styles.hit}>
          <Text style={[styles.body, { color: paper.text }]}>Previous</Text>
        </Pressable>
        <View style={styles.dateCopy}>
          <Text style={[styles.date, { color: paper.text }]}>{manilaDayLabel(viewed)}</Text>
          <Text style={[styles.secondary, { color: secondary }]}>Philippine time</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          hitSlop={8}
          onPress={() => setDateKey(addDateDays(viewed, 1))}
          style={styles.hit}>
          <Text style={[styles.body, { color: paper.text }]}>Next</Text>
        </Pressable>
      </View>
      {!viewingToday ? (
        <Button label="Back to today" color={paper.text} textColor={paper.text} outline onPress={() => setDateKey('')} />
      ) : null}
      {state.loading && !state.config ? <Text style={[styles.secondary, { color: secondary }]}>Loading the guide…</Text> : null}
      {state.error ? <Text style={[styles.body, { color: paper.text }]}>{state.error}</Text> : null}
      {actionError ? <Text style={[styles.body, { color: paper.text }]}>{actionError}</Text> : null}
      {state.config && !guideInitialized(state.config) ? (
        <View style={styles.stack}>
          <Text style={[styles.body, { color: paper.text }]}>The guide is not on this phone yet.</Text>
          <Button label="Preview the guide" color={paper.text} textColor={paper.bg} onPress={() => router.push('/routine-setup')} />
        </View>
      ) : null}
      {state.config && guideInitialized(state.config) ? (
        <View style={styles.stack}>
          {!state.config.enabled ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: paper.text }]}>The guide is off. Your edits stay as they are.</Text>
              <Button
                label="Turn the guide on"
                color={paper.text}
                textColor={paper.bg}
                onPress={() => void run(() => setRoutineEnabled(db, true).then(() => undefined))}
              />
            </View>
          ) : (
            <NowAndNext paper={paper} secondary={secondary} currentTitle={current?.title ?? null} currentSchedule={current ? occurrenceSchedule(current) : null} currentBody={current?.instructions ?? ''} nextTitle={next?.title ?? null} nextSchedule={next ? occurrenceSchedule(next) : null} />
          )}
          {pendingMeeting ? <Text style={[styles.secondary, { color: secondary }]}>A meeting still needs a confirmed time.</Text> : null}
          <SelectedWork
            paper={paper}
            secondary={secondary}
            task={state.task}
            status={day?.selectedTaskStatus ?? 'none'}
            onFocus={() => {
              if (day?.selectedTaskStatus === 'open' && day.selectedTaskId) openFocus(day.selectedTaskId);
            }}
            onEdit={() => {
              if (state.task) router.push(`/task/${state.task.id}`);
            }}
          />
          {state.suggestion && day && day.selectedTaskStatus !== 'open' ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: paper.text }]}>Earlier unfinished task: {state.suggestion.title}</Text>
              <Text style={[styles.secondary, { color: secondary }]}>{manilaDayLabel(state.suggestion.localDate)}</Text>
              <Button
                label="Use"
                color={paper.text}
                textColor={paper.bg}
                onPress={() => {
                  const taskId = state.suggestion?.taskId;
                  if (!taskId) return;
                  void run(() => selectRoutineTask(db, viewed, taskId).then(() => undefined));
                }}
              />
            </View>
          ) : null}
          {picking ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: paper.text }]}>
                {picking === 'focus' ? 'Choose a task for this free period.' : 'Choose a task for this day.'}
              </Text>
              <TaskChooser
                paper={paper}
                selectedId={day?.selectedTaskStatus === 'open' ? day.selectedTaskId : null}
                onSelect={(taskId) => void chooseTask(taskId, picking === 'focus')}
              />
              <Button label="Close" color={paper.text} textColor={paper.text} outline onPress={() => setPicking(null)} />
            </View>
          ) : (
            <View style={styles.stack}>
              <Button label="Choose task" color={paper.text} textColor={paper.text} outline onPress={() => setPicking('choose')} />
              {viewingToday && guideOn ? (
                <Button
                  label="Free period"
                  color={paper.text}
                  textColor={paper.text}
                  outline
                  onPress={() => {
                    if (day?.selectedTaskStatus === 'open' && day.selectedTaskId) {
                      openFocus(day.selectedTaskId);
                      return;
                    }
                    setPicking('focus');
                  }}
                />
              ) : null}
              {day?.selectedTaskId ? (
                <Button
                  label="Clear the chosen task"
                  color={paper.text}
                  textColor={paper.text}
                  outline
                  onPress={() => void run(() => selectRoutineTask(db, viewed, null).then(() => undefined))}
                />
              ) : null}
            </View>
          )}
          {plan ? <RoutineTimeline plan={plan} guideOn={guideOn} paper={paper} secondary={secondary} resetKey={viewed} /> : null}
          {viewingToday && guideOn && overrideLabels.length > 0 ? (
            <View style={styles.stack}>
              <Text style={[styles.section, { color: paper.text }]}>Today’s changes</Text>
              {day?.noClasses ? <Text style={[styles.secondary, { color: secondary }]}>No classes</Text> : null}
              {day?.homeAtMinute != null ? (
                <Text style={[styles.secondary, { color: secondary }]}>Home now at {clockLabel(day.homeAtMinute)}</Text>
              ) : null}
              {day?.homeLate ? <Text style={[styles.secondary, { color: secondary }]}>Home late</Text> : null}
              {day?.noClasses ? (
                <Button label="Undo no classes" color={paper.text} textColor={paper.text} outline onPress={() => void run(() => updateRoutineDay(db, viewed, { noClasses: false }).then(() => undefined))} />
              ) : null}
              {day?.homeAtMinute != null ? (
                <Button label="Undo home now" color={paper.text} textColor={paper.text} outline onPress={() => void run(() => updateRoutineDay(db, viewed, { homeAtMinute: null }).then(() => undefined))} />
              ) : null}
              {day?.homeLate ? (
                <Button label="Undo home late" color={paper.text} textColor={paper.text} outline onPress={() => void run(() => updateRoutineDay(db, viewed, { homeLate: false }).then(() => undefined))} />
              ) : null}
              {overrideLabels.length > 1 ? (
                <Button
                  label={`Undo ${overrideLabels.join(' and ')}`}
                  color={paper.text}
                  textColor={paper.text}
                  outline
                  onPress={() => void run(() => clearRoutineOverrides(db, viewed).then(() => undefined))}
                />
              ) : null}
            </View>
          ) : null}
          {!viewingToday ? <Text style={[styles.secondary, { color: secondary }]}>You are looking at another day. Nothing here changes today.</Text> : null}
          {viewingToday && guideOn && canAdjust ? (
            <View style={styles.stack}>
              <Pressable accessibilityRole="button" onPress={() => setAdjustOpen((open) => !open)} style={styles.hit}>
                <Text style={[styles.body, { color: paper.text }]}>{adjustOpen ? 'Hide adjustments' : 'Adjust today'}</Text>
              </Pressable>
              {adjustOpen ? (
                <View style={styles.stack}>
                  {schoolDay && !day?.noClasses ? (
                    <Button label="No classes today" color={paper.text} textColor={paper.text} outline onPress={() => void run(() => updateRoutineDay(db, viewed, { noClasses: true }).then(() => undefined))} />
                  ) : null}
                  {canComeHome && day?.homeAtMinute == null ? (
                    <Button
                      label="Home now"
                      color={paper.text}
                      textColor={paper.text}
                      outline
                      onPress={() => void run(() => updateRoutineDay(db, viewed, { homeAtMinute: manilaMinuteOfDay(new Date()) }).then(() => undefined))}
                    />
                  ) : null}
                  {canBeLate && !day?.homeLate ? (
                    <Button label="Home late" color={paper.text} textColor={paper.text} outline onPress={() => void run(() => updateRoutineDay(db, viewed, { homeLate: true }).then(() => undefined))} />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <Button label="Edit the week" color={paper.text} textColor={paper.text} outline onPress={() => router.push('/routine-edit')} />
          {reviewDueToday ? (
            <Button label="Review this week" color={paper.text} textColor={paper.bg} onPress={() => router.push('/routine-review')} />
          ) : (
            <Button label="Review the week" color={paper.text} textColor={paper.text} outline onPress={() => router.push('/routine-review')} />
          )}
          <GuideAlerts paper={paper} />
        </View>
      ) : null}
    </View>
  );
}

function NowAndNext({
  paper,
  secondary,
  currentTitle,
  currentSchedule,
  currentBody,
  nextTitle,
  nextSchedule,
}: {
  paper: Paper;
  secondary: string;
  currentTitle: string | null;
  currentSchedule: string | null;
  currentBody: string;
  nextTitle: string | null;
  nextSchedule: string | null;
}) {
  if (!currentTitle && !nextTitle) {
    return (
      <View style={styles.stack}>
        <Text style={[styles.section, { color: paper.text }]}>Now</Text>
        <Text style={[styles.date, { color: paper.text }]}>Nothing scheduled right now</Text>
        <Text style={[styles.secondary, { color: secondary }]}>The rest of today is open. Use it as you like.</Text>
      </View>
    );
  }
  if (!currentTitle && nextTitle) {
    return (
      <View style={styles.stack}>
        <Text style={[styles.kicker, { color: secondary }]}>Next</Text>
        <Text style={[styles.date, { color: paper.text }]}>{nextTitle}</Text>
        {nextSchedule ? <Text style={[styles.secondary, { color: secondary }]}>{nextSchedule}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <View style={styles.stack}>
        <Text style={[styles.kicker, { color: secondary }]}>Now</Text>
        <Text style={[styles.date, { color: paper.text }]}>{currentTitle}</Text>
        {currentSchedule ? <Text style={[styles.secondary, { color: secondary }]}>{currentSchedule}</Text> : null}
        {currentBody ? <Text style={[styles.body, { color: paper.text }]}>{currentBody}</Text> : null}
      </View>
      {nextTitle ? (
        <View style={styles.stack}>
          <Text style={[styles.kicker, { color: secondary }]}>Next</Text>
          <Text style={[styles.body, { color: paper.text }]}>{nextTitle}</Text>
          {nextSchedule ? <Text style={[styles.secondary, { color: secondary }]}>{nextSchedule}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function SelectedWork({
  paper,
  secondary,
  task,
  status,
  onFocus,
  onEdit,
}: {
  paper: Paper;
  secondary: string;
  task: { id: string; title: string; nextAction: string } | null;
  status: 'none' | 'open' | 'completed' | 'missing';
  onFocus: () => void;
  onEdit: () => void;
}) {
  if (status === 'completed') {
    return (
      <Text style={[styles.body, { color: paper.text }]}>
        {task ? `${task.title} is finished.` : 'The chosen task is finished.'} Choose another one.
      </Text>
    );
  }
  if (status === 'missing') return <Text style={[styles.body, { color: paper.text }]}>That task is gone. Choose another one.</Text>;
  if (status !== 'open' || !task) return <Text style={[styles.secondary, { color: secondary }]}>Choose a task for this day.</Text>;
  return (
    <View style={styles.stack}>
      <Text style={[styles.kicker, { color: secondary }]}>Task</Text>
      <Text style={[styles.date, { color: paper.text }]}>{task.title}</Text>
      <Text style={[styles.body, { color: paper.text }]}>{task.nextAction.trim() ? task.nextAction : 'No next step yet.'}</Text>
      <Button label="Focus on this task" color={paper.text} textColor={paper.bg} onPress={onFocus} />
      <Button label="Edit next step" color={paper.text} textColor={paper.text} outline onPress={onEdit} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  stack: { gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateCopy: { flex: 1, alignItems: 'center', gap: 2 },
  date: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, textAlign: 'center' },
  section: { fontFamily: 'Georgia', fontSize: 20, lineHeight: 26 },
  kicker: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  hit: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
});
