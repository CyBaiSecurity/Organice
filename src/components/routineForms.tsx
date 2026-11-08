import { useState, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { AlarmTime } from '@/components/alarmTime';
import { Button, errorText } from '@/components/ui';
import { addRoutineBlock, updateRoutineBlock, type RoutineBlockPatch } from '@/db';
import { assertClockWindow, type RoutinePatternId, type RoutineRole } from '@/domain/routine';
import { parseClock } from '@/state/clock';
import { ISO_DAYS } from '@/state/routine';
import { PAPER, type Paper } from '@/theme/palette';

// Light paper.muted is black, so secondary copy uses a local gray that stays
// readable on both the white sheet and the dark sheet.
export function routineInk(paper: Paper): { secondary: string; rule: string } {
  const dark = paper.bg === PAPER.dark.bg;
  return dark ? { secondary: '#C6C6C6', rule: '#6E6E6E' } : { secondary: '#3F3F3F', rule: '#6E6E6E' };
}

export function onPrimaryInk(paper: Paper): string {
  return paper.bg === PAPER.dark.bg ? PAPER.dark.bg : '#FFFFFF';
}

export function RoutineScreen({
  paper,
  scrollRef,
  scrollEnabled = true,
  footer,
  children,
}: {
  paper: Paper;
  scrollRef?: RefObject<ScrollView | null>;
  scrollEnabled?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { rule } = routineInk(paper);
  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: paper.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        style={[styles.fill, { backgroundColor: paper.bg }]}
        contentContainerStyle={[styles.page, { paddingBottom: footer ? 24 : Math.max(insets.bottom, 16) + 28 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: paper.surface,
              borderTopColor: rule,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function QuietButton({
  label,
  onPress,
  paper,
  fill,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  paper: Paper;
  fill?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { rule } = routineInk(paper);
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quiet,
        fill ? styles.fillWidth : null,
        { borderColor: rule, backgroundColor: paper.surface, opacity: disabled ? 0.4 : pressed ? 0.72 : 1 },
      ]}>
      <Text style={[styles.quietText, { color: paper.text }]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, paper }: { label: string; onPress: () => void; paper: Paper }) {
  return <Button label={label} onPress={onPress} color={paper.text} textColor={paper.bg} />;
}

export function WeekdayPicker({
  paper,
  isSelected,
  onPress,
}: {
  paper: Paper;
  isSelected: (iso: number) => boolean;
  onPress: (iso: number) => void;
}) {
  const { rule } = routineInk(paper);
  return (
    <View style={styles.wrap}>
      {ISO_DAYS.map((day) => {
        const selected = isSelected(day.iso);
        return (
          <Pressable
            key={day.iso}
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel={day.name}
            accessibilityState={{ selected }}
            onPress={() => onPress(day.iso)}
            style={[
              styles.day,
              {
                borderColor: selected ? paper.text : rule,
                backgroundColor: selected ? paper.text : paper.surface,
              },
            ]}>
            <Text style={[styles.dayText, { color: selected ? onPrimaryInk(paper) : paper.text }]}>{day.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PaperGroup({ paper, children, style }: { paper: Paper; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { rule } = routineInk(paper);
  return <View style={[styles.group, { backgroundColor: paper.surface, borderColor: rule }, style]}>{children}</View>;
}

export function SelectRow({
  label,
  selected,
  onPress,
  paper,
  trailing,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  paper: Paper;
  trailing?: string;
}) {
  const { rule, secondary } = routineInk(paper);
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${label}, ${trailing}` : label}
      accessibilityState={{ selected: selected === true }}
      onPress={onPress}
      style={({ pressed }) => [styles.select, { borderBottomColor: rule, opacity: pressed ? 0.72 : 1 }]}>
      <View style={[styles.mark, { borderColor: paper.text, backgroundColor: selected ? paper.text : 'transparent' }]} />
      <Text style={[styles.selectLabel, { color: paper.text }]}>{label}</Text>
      {trailing ? <Text style={[styles.trailing, { color: secondary }]}>{trailing}</Text> : null}
    </Pressable>
  );
}

export type Draft = {
  id: string | null;
  title: string;
  instructions: string;
  weekdays: number[];
  timed: boolean;
  start: string;
  end: string;
  enabled: boolean;
  remind: boolean;
  role: RoutineRole;
  pattern: RoutinePatternId;
  timeEdited: boolean;
  meeting: boolean;
};

export function DraftForm({
  draft,
  paper,
  error,
  onChange,
  onDrag,
  onCancel,
  onError,
  onSaved,
  onDelete,
}: {
  draft: Draft;
  paper: Paper;
  error: string | null;
  onChange: (next: Draft) => void;
  onDrag: (active: boolean) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  onSaved: (id: string | null, replaceDraft?: boolean) => void;
  onDelete: (() => void) | null;
}) {
  const db = useSQLiteContext();
  const { secondary } = routineInk(paper);
  const [saving, setSaving] = useState(false);
  const remindBlocked = draft.meeting || !draft.timed || parseClock(draft.start) == null;
  const remindReason = draft.meeting
    ? 'Confirm a time before this meeting can send an alert.'
    : 'This part of the day has no fixed time, so it cannot send an alert.';
  const confirmable = draft.meeting && draft.id != null;

  function patchDraft(partial: Partial<Draft>) {
    onChange({ ...draft, ...partial });
  }

  function readTimes(): { startMinute: number | null; endMinute: number | null } | null {
    if (!draft.timed) return { startMinute: null, endMinute: null };
    const startMinute = parseClock(draft.start);
    if (startMinute == null) {
      onError('Set a start time, or choose no fixed time.');
      return null;
    }
    const endText = draft.end.trim();
    const endMinute = endText === '' ? null : parseClock(endText);
    if (endText !== '' && endMinute == null) {
      onError('End must be a time like 6:30 PM.');
      return null;
    }
    try {
      assertClockWindow(startMinute, endMinute);
    } catch (caught) {
      onError(errorText(caught));
      return null;
    }
    return { startMinute, endMinute };
  }

  async function save() {
    if (saving) return;
    if (draft.title.trim() === '') {
      onError('Title is required.');
      return;
    }
    if (draft.weekdays.length === 0) {
      onError('Pick at least one weekday.');
      return;
    }
    const includeTimes = !draft.meeting || draft.timeEdited;
    const clearingMeeting = draft.meeting && draft.timeEdited && draft.start.trim() === '' && draft.end.trim() === '';
    const times = !includeTimes || clearingMeeting ? { startMinute: null, endMinute: null } : readTimes();
    if (!times) return;
    const remind = !remindBlocked && draft.remind;
    setSaving(true);
    onError('');
    try {
      if (draft.id == null) {
        const created = await addRoutineBlock(db, {
          pattern: draft.pattern,
          weekdays: draft.weekdays,
          title: draft.title,
          instructions: draft.instructions,
          startMinute: times.startMinute,
          endMinute: times.endMinute,
          role: draft.meeting ? 'unconfirmed-meeting' : 'fixed',
          enabled: draft.enabled,
          remind,
        });
        onSaved(created.id, !draft.meeting);
        return;
      }
      const patch: RoutineBlockPatch = {
        title: draft.title,
        instructions: draft.instructions,
        weekdays: draft.weekdays,
        enabled: draft.enabled,
        remind,
      };
      if (includeTimes) {
        patch.startMinute = times.startMinute;
        patch.endMinute = times.endMinute;
      }
      await updateRoutineBlock(db, draft.id, patch);
      onSaved(draft.id, !draft.meeting);
    } catch (caught) {
      onError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function confirmMeeting() {
    if (draft.id == null || saving) return;
    if (draft.title.trim() === '') {
      onError('Title is required.');
      return;
    }
    if (draft.weekdays.length === 0) {
      onError('Pick at least one weekday.');
      return;
    }
    const startMinute = parseClock(draft.start);
    if (startMinute == null) {
      onError('Set the time you agreed on, then confirm it.');
      return;
    }
    const endText = draft.end.trim();
    const endMinute = endText === '' ? null : parseClock(endText);
    if (endText !== '' && endMinute == null) {
      onError('End must be a time like 6:30 PM.');
      return;
    }
    try {
      assertClockWindow(startMinute, endMinute);
    } catch (caught) {
      onError(errorText(caught));
      return;
    }
    setSaving(true);
    onError('');
    try {
      await updateRoutineBlock(db, draft.id, {
        title: draft.title,
        instructions: draft.instructions,
        weekdays: draft.weekdays,
        enabled: draft.enabled,
        role: 'fixed',
        startMinute,
        endMinute,
        remind: false,
      });
      onSaved(draft.id, true);
    } catch (caught) {
      onError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.stack}>
      <QuietButton label="Back to the list" paper={paper} onPress={onCancel} />
      <Text style={[styles.heading, { color: paper.text }]}>{draft.id == null ? 'Add to this day' : 'Edit this part'}</Text>
      <Text style={[styles.secondary, { color: secondary }]}>
        Checked days share this part. Saving changes every weekday checked here.
      </Text>
      <SentenceField label="Title" value={draft.title} onChangeText={(title) => patchDraft({ title })} paper={paper} />
      <SentenceField
        label="Instructions"
        value={draft.instructions}
        onChangeText={(instructions) => patchDraft({ instructions })}
        paper={paper}
        multiline
      />
      <Text style={[styles.secondary, { color: secondary }]}>Days</Text>
      <WeekdayPicker
        paper={paper}
        isSelected={(iso) => draft.weekdays.includes(iso)}
        onPress={(iso) => {
          const selected = draft.weekdays.includes(iso);
          const weekdays = selected ? draft.weekdays.filter((value) => value !== iso) : [...draft.weekdays, iso].sort((left, right) => left - right);
          patchDraft({ weekdays });
        }}
      />
      {draft.meeting ? (
        <View style={styles.stack}>
          <Text style={[styles.body, { color: paper.text }]}>This meeting needs a confirmed time.</Text>
          <Text style={[styles.secondary, { color: secondary }]}>
            The instructions list the times you can propose. They are not an appointment until you confirm one.
          </Text>
        </View>
      ) : (
        <View style={styles.wrap}>
          <Choice
            label="Fixed time"
            selected={draft.timed}
            paper={paper}
            onPress={() => patchDraft({ timed: true, timeEdited: true })}
          />
          <Choice
            label="No fixed time"
            selected={!draft.timed}
            paper={paper}
            onPress={() => patchDraft({ timed: false, timeEdited: true, start: '', end: '', remind: false })}
          />
        </View>
      )}
      {draft.id == null ? (
        <Choice
          label="Meeting that still needs a time"
          selected={draft.meeting}
          paper={paper}
          onPress={() =>
            patchDraft({
              meeting: !draft.meeting,
              role: !draft.meeting ? 'unconfirmed-meeting' : 'fixed',
              remind: false,
              timeEdited: true,
            })
          }
        />
      ) : null}
      {draft.timed ? (
        <View style={styles.stack}>
          <AlarmTime
            label={draft.meeting ? 'Agreed start' : 'Start'}
            value={draft.start}
            optional
            paper={paper}
            onChange={(start) => patchDraft({ start, timeEdited: true, timed: true })}
            onDrag={onDrag}
          />
          {draft.start ? (
            <QuietButton label="Remove start" paper={paper} onPress={() => patchDraft({ start: '', timeEdited: true })} />
          ) : null}
          <AlarmTime
            label={draft.meeting ? 'Agreed end' : 'End'}
            value={draft.end}
            optional
            hint="Leave this empty if it is a single time."
            paper={paper}
            onChange={(end) => patchDraft({ end, timeEdited: true })}
            onDrag={onDrag}
          />
          {draft.end ? <QuietButton label="Remove end" paper={paper} onPress={() => patchDraft({ end: '', timeEdited: true })} /> : null}
        </View>
      ) : (
        <Text style={[styles.secondary, { color: secondary }]}>No time is invented for this part of the day.</Text>
      )}
      <QuietButton
        label={draft.enabled ? 'Shown on the guide' : 'Hidden from the guide'}
        paper={paper}
        onPress={() => patchDraft({ enabled: !draft.enabled })}
      />
      {remindBlocked ? (
        <Text style={[styles.secondary, { color: secondary }]}>{remindReason}</Text>
      ) : (
        <QuietButton
          label={draft.remind ? 'Alert on' : 'Alert off'}
          paper={paper}
          onPress={() => patchDraft({ remind: !draft.remind })}
        />
      )}
      {error ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      {confirmable ? <PrimaryButton label="Confirm this time" paper={paper} onPress={() => void confirmMeeting()} /> : null}
      {confirmable ? (
        <QuietButton label={saving ? 'Saving…' : 'Save'} paper={paper} onPress={() => void save()} />
      ) : (
        <PrimaryButton label={saving ? 'Saving…' : 'Save'} paper={paper} onPress={() => void save()} />
      )}
      {onDelete ? <QuietButton label="Delete" paper={paper} onPress={onDelete} /> : null}
      <QuietButton label="Close" paper={paper} onPress={onCancel} />
    </View>
  );
}

function SentenceField({
  label,
  value,
  onChangeText,
  paper,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  paper: Paper;
  multiline?: boolean;
}) {
  const { rule, secondary } = routineInk(paper);
  return (
    <View style={styles.stack}>
      <Text style={[styles.secondary, { color: secondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline ? styles.inputMulti : null,
          { color: paper.text, backgroundColor: paper.surface, borderColor: rule },
        ]}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  paper,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  paper: Paper;
}) {
  const { rule } = routineInk(paper);
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.day,
        {
          borderColor: selected ? paper.text : rule,
          backgroundColor: selected ? paper.text : paper.surface,
        },
      ]}>
      <Text style={[styles.dayText, { color: selected ? onPrimaryInk(paper) : paper.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillWidth: { flexGrow: 1, flexBasis: 0 },
  page: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  stack: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heading: { fontFamily: 'Georgia', fontSize: 22, lineHeight: 28 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 20 },
  quiet: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietText: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 20, textAlign: 'center' },
  day: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 20 },
  group: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  select: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mark: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  selectLabel: { flex: 1, fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  trailing: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Georgia',
    fontSize: 16,
    lineHeight: 22,
  },
  inputMulti: { minHeight: 96 },
});
