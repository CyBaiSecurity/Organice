import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { GuideAlerts, RoutineAction, TaskChooser, routineSecondary } from '@/components/routineGuide';
import { RoutineTimeline } from '@/components/routineTimeline';
import { errorText } from '@/components/ui';
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
  const [draftDay, setDraftDay] = useState(viewed);
  if (draftDay !== viewed) {
    setDraftDay(viewed);
    setPicking(null);
    setAdjustOpen(false);
    setActionError(null);
  }
  const secondary = routineSecondary(paper);
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
  const taskStatus = day?.selectedTaskStatus ?? 'none';
  const openTaskId = taskStatus === 'open' && day?.selectedTaskId ? day.selectedTaskId : null;
  const taskOpen = Boolean(openTaskId && state.task);
  const showSuggestion = Boolean(state.suggestion && day && taskStatus !== 'open');
  let primaryKind: 'focus' | 'use' | 'choose' | null = null;
  if (guideOn && viewingToday && !picking) {
    if (taskOpen) primaryKind = 'focus';
    else if (showSuggestion && state.suggestion) primaryKind = 'use';
    else primaryKind = 'choose';
  }
  const section = [styles.section, { borderTopColor: paper.text }];

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

  function useSuggestion() {
    const taskId = state.suggestion?.taskId;
    if (!taskId) return;
    void run(() => selectRoutineTask(db, viewed, taskId).then(() => undefined));
  }

  const current = guideOn ? plan?.current ?? null : null;
  const next = guideOn ? plan?.next ?? null : null;
  const pendingMeeting = plan?.occurrences.some((item) => item.role === 'unconfirmed-meeting') ?? false;
  const dayRelation = viewingToday ? 'today' : viewed < state.todayKey ? 'past' : 'future';

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: paper.text }]}>
          Routine
        </Text>
        <View style={styles.dateRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            hitSlop={8}
            onPress={() => setDateKey(addDateDays(viewed, -1))}
            style={styles.hit}>
            <Text style={[styles.nav, { color: paper.text }]}>Prev</Text>
          </Pressable>
          <View style={styles.dateCopy}>
            <Text style={[styles.date, { color: paper.text }]}>{manilaDayLabel(viewed)}</Text>
            <Text style={[styles.meta, { color: secondary }]}>Philippine time</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            hitSlop={8}
            onPress={() => setDateKey(addDateDays(viewed, 1))}
            style={styles.hit}>
            <Text style={[styles.nav, { color: paper.text }]}>Next</Text>
          </Pressable>
        </View>
        {!viewingToday ? (
          <RoutineAction label="Back to today" paper={paper} onPress={() => setDateKey('')} />
        ) : null}
      </View>
      {state.loading && !state.config ? <Text style={[styles.meta, { color: secondary }]}>Loading the guide…</Text> : null}
      {state.error ? <Text style={[styles.body, { color: paper.text }]}>{state.error}</Text> : null}
      {actionError ? <Text style={[styles.body, { color: paper.text }]}>{actionError}</Text> : null}
      {state.config && !guideInitialized(state.config) ? (
        <View style={styles.stack}>
          <Text style={[styles.body, { color: paper.text }]}>The guide is not on this phone yet.</Text>
          <RoutineAction label="Preview the guide" paper={paper} tone="primary" onPress={() => router.push('/routine-setup')} />
        </View>
      ) : null}
      {state.config && guideInitialized(state.config) ? (
        <>
          {!state.config.enabled ? (
            <View style={styles.stack}>
              <Text style={[styles.body, { color: paper.text }]}>The guide is off. Your edits stay as they are.</Text>
              {!viewingToday ? <OtherDay paper={paper} secondary={secondary} passed={dayRelation === 'past'} /> : null}
              <RoutineAction
                label="Turn the guide on"
                paper={paper}
                tone="primary"
                onPress={() => void run(() => setRoutineEnabled(db, true).then(() => undefined))}
              />
            </View>
          ) : viewingToday ? (
            <NowAndNext
              paper={paper}
              secondary={secondary}
              currentTitle={current?.title ?? null}
              currentSchedule={current ? occurrenceSchedule(current) : null}
              currentBody={current?.instructions ?? ''}
              nextTitle={next?.title ?? null}
              nextSchedule={next ? occurrenceSchedule(next) : null}
            />
          ) : (
            <OtherDay paper={paper} secondary={secondary} passed={dayRelation === 'past'} />
          )}
          {pendingMeeting ? (
            <Text style={[styles.body, { color: paper.text }]}>A meeting still needs a confirmed time.</Text>
          ) : null}
          <View style={section}>
            <Text style={[styles.meta, { color: secondary }]}>Task</Text>
            <TaskSummary paper={paper} secondary={secondary} task={state.task} status={taskStatus} />
            {showSuggestion && state.suggestion ? (
              <View style={styles.stack}>
                <Text style={[styles.body, { color: paper.text }]}>Earlier unfinished task: {state.suggestion.title}</Text>
                <Text style={[styles.meta, { color: secondary }]}>{manilaDayLabel(state.suggestion.localDate)}</Text>
              </View>
            ) : null}
            {picking ? (
              <View style={styles.stack}>
                <Text style={[styles.body, { color: paper.text }]}>
                  {picking === 'focus' ? 'Choose a task for this free period.' : 'Choose a task for this day.'}
                </Text>
                <TaskChooser
                  paper={paper}
                  selectedId={openTaskId}
                  onSelect={(taskId) => void chooseTask(taskId, picking === 'focus')}
                />
                <RoutineAction label="Close" paper={paper} onPress={() => setPicking(null)} />
              </View>
            ) : (
              <View style={styles.stack}>
                {primaryKind === 'focus' && openTaskId ? (
                  <RoutineAction label="Focus on this task" paper={paper} tone="primary" onPress={() => openFocus(openTaskId)} />
                ) : null}
                {primaryKind === 'use' ? (
                  <RoutineAction label="Use" paper={paper} tone="primary" onPress={useSuggestion} />
                ) : null}
                {primaryKind === 'choose' ? (
                  <RoutineAction label="Choose task" paper={paper} tone="primary" onPress={() => setPicking('choose')} />
                ) : null}
                {primaryKind !== 'focus' && taskOpen && openTaskId ? (
                  <RoutineAction label="Focus on this task" paper={paper} onPress={() => openFocus(openTaskId)} />
                ) : null}
                {taskOpen && state.task ? (
                  <RoutineAction
                    label="Edit next step"
                    paper={paper}
                    onPress={() => {
                      const taskId = state.task?.id;
                      if (!taskId) return;
                      router.push(`/task/${taskId}`);
                    }}
                  />
                ) : null}
                {showSuggestion && primaryKind !== 'use' ? (
                  <RoutineAction label="Use" paper={paper} onPress={useSuggestion} />
                ) : null}
                {primaryKind !== 'choose' ? (
                  <RoutineAction label="Choose task" paper={paper} onPress={() => setPicking('choose')} />
                ) : null}
                {viewingToday && guideOn ? (
                  <RoutineAction
                    label="Free period"
                    paper={paper}
                    onPress={() => {
                      if (openTaskId) {
                        openFocus(openTaskId);
                        return;
                      }
                      setPicking('focus');
                    }}
                  />
                ) : null}
                {day?.selectedTaskId ? (
                  <RoutineAction
                    label="Clear the chosen task"
                    paper={paper}
                    onPress={() => void run(() => selectRoutineTask(db, viewed, null).then(() => undefined))}
                  />
                ) : null}
              </View>
            )}
          </View>
          {plan ? <RoutineTimeline plan={plan} guideOn={guideOn} paper={paper} secondary={secondary} resetKey={viewed} /> : null}
          {viewingToday && guideOn && overrideLabels.length > 0 ? (
            <View style={section}>
              <Text style={[styles.sectionLabel, { color: paper.text }]}>Today’s changes</Text>
              {day?.noClasses ? <Text style={[styles.meta, { color: secondary }]}>No classes</Text> : null}
              {day?.homeAtMinute != null ? (
                <Text style={[styles.meta, { color: secondary }]}>Home now at {clockLabel(day.homeAtMinute)}</Text>
              ) : null}
              {day?.homeLate ? <Text style={[styles.meta, { color: secondary }]}>Home late</Text> : null}
              {day?.noClasses ? (
                <RoutineAction
                  label="Undo no classes"
                  paper={paper}
                  onPress={() => void run(() => updateRoutineDay(db, viewed, { noClasses: false }).then(() => undefined))}
                />
              ) : null}
              {day?.homeAtMinute != null ? (
                <RoutineAction
                  label="Undo home now"
                  paper={paper}
                  onPress={() => void run(() => updateRoutineDay(db, viewed, { homeAtMinute: null }).then(() => undefined))}
                />
              ) : null}
              {day?.homeLate ? (
                <RoutineAction
                  label="Undo home late"
                  paper={paper}
                  onPress={() => void run(() => updateRoutineDay(db, viewed, { homeLate: false }).then(() => undefined))}
                />
              ) : null}
              {overrideLabels.length > 1 ? (
                <RoutineAction
                  label={`Undo ${overrideLabels.join(' and ')}`}
                  paper={paper}
                  onPress={() => void run(() => clearRoutineOverrides(db, viewed).then(() => undefined))}
                />
              ) : null}
            </View>
          ) : null}
          {viewingToday && guideOn && canAdjust ? (
            <View style={section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: adjustOpen }}
                onPress={() => setAdjustOpen((open) => !open)}
                style={styles.hit}>
                <Text style={[styles.body, { color: paper.text }]}>{adjustOpen ? 'Hide adjustments' : 'Adjust today'}</Text>
              </Pressable>
              {adjustOpen ? (
                <View style={styles.stack}>
                  {schoolDay && !day?.noClasses ? (
                    <RoutineAction
                      label="No classes today"
                      paper={paper}
                      onPress={() => void run(() => updateRoutineDay(db, viewed, { noClasses: true }).then(() => undefined))}
                    />
                  ) : null}
                  {canComeHome && day?.homeAtMinute == null ? (
                    <RoutineAction
                      label="Home now"
                      paper={paper}
                      onPress={() =>
                        void run(() => updateRoutineDay(db, viewed, { homeAtMinute: manilaMinuteOfDay(new Date()) }).then(() => undefined))
                      }
                    />
                  ) : null}
                  {canBeLate && !day?.homeLate ? (
                    <RoutineAction
                      label="Home late"
                      paper={paper}
                      onPress={() => void run(() => updateRoutineDay(db, viewed, { homeLate: true }).then(() => undefined))}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={section}>
            <RoutineAction label="Edit the week" paper={paper} onPress={() => router.push('/routine-edit')} />
            {reviewDueToday ? (
              <RoutineAction
                label="Review this week"
                note="This week’s review is ready."
                paper={paper}
                tone="nudge"
                onPress={() => router.push('/routine-review')}
              />
            ) : (
              <RoutineAction label="Review the week" paper={paper} onPress={() => router.push('/routine-review')} />
            )}
          </View>
          <View style={section}>
            <GuideAlerts paper={paper} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function OtherDay({ paper, secondary, passed }: { paper: Paper; secondary: string; passed: boolean }) {
  return (
    <View style={styles.stack}>
      <Text style={[styles.body, { color: paper.text }]}>{passed ? 'This day has passed.' : 'This day has not started.'}</Text>
      <Text style={[styles.meta, { color: secondary }]}>You are looking at another day. Nothing here changes today.</Text>
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
  return (
    <View style={styles.stack}>
      <View style={styles.stack}>
        <Text style={[styles.meta, { color: secondary }]}>Now</Text>
        <Text style={[styles.hero, { color: paper.text }]}>{currentTitle ?? 'Nothing scheduled right now'}</Text>
        {currentTitle && currentSchedule ? <Text style={[styles.meta, { color: secondary }]}>{currentSchedule}</Text> : null}
        {currentTitle && currentBody ? <Text style={[styles.body, { color: paper.text }]}>{currentBody}</Text> : null}
        {!currentTitle && !nextTitle ? (
          <Text style={[styles.body, { color: paper.text }]}>The rest of today is open. Use it as you like.</Text>
        ) : null}
      </View>
      {nextTitle ? (
        <View style={styles.upNext}>
          <Text style={[styles.meta, { color: secondary }]}>Up next</Text>
          <Text style={[styles.body, { color: paper.text }]}>{nextTitle}</Text>
          {nextSchedule ? <Text style={[styles.meta, { color: secondary }]}>{nextSchedule}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function TaskSummary({
  paper,
  secondary,
  task,
  status,
}: {
  paper: Paper;
  secondary: string;
  task: { id: string; title: string; nextAction: string } | null;
  status: 'none' | 'open' | 'completed' | 'missing';
}) {
  if (status === 'completed') {
    return (
      <Text style={[styles.body, { color: paper.text }]}>
        {task ? `${task.title} is finished.` : 'The chosen task is finished.'} Choose another one.
      </Text>
    );
  }
  if (status === 'missing') return <Text style={[styles.body, { color: paper.text }]}>That task is gone. Choose another one.</Text>;
  if (status !== 'open' || !task) return <Text style={[styles.meta, { color: secondary }]}>Choose a task for this day.</Text>;
  return (
    <View style={styles.stack}>
      <Text style={[styles.taskTitle, { color: paper.text }]}>{task.title}</Text>
      <Text style={[styles.body, { color: paper.text }]}>{task.nextAction.trim() ? task.nextAction : 'No next step yet.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 20 },
  header: { gap: 6 },
  stack: { gap: 8 },
  section: { gap: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateCopy: { flex: 1, gap: 2 },
  title: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, textAlign: 'left' },
  date: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 18, textAlign: 'left' },
  nav: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 18 },
  hero: { fontFamily: 'Georgia', fontSize: 28, lineHeight: 34, textAlign: 'left' },
  taskTitle: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'left' },
  sectionLabel: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, textAlign: 'left' },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, textAlign: 'left' },
  meta: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, textAlign: 'left' },
  upNext: { gap: 2, marginTop: 4 },
  hit: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
});
