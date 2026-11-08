import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorText } from '@/components/ui';
import { useRoutineReminderStatus } from '@/state/routineReminders';
import type { Paper } from '@/theme/palette';

export { TaskChooser } from '@/components/taskChooser';

export function routineSecondary(paper: Paper): string {
  return paper.text === '#000000' ? '#4A4A4A' : '#B5B5B5';
}

export function RoutineAction({
  label,
  onPress,
  paper,
  tone = 'quiet',
  note,
}: {
  label: string;
  onPress: () => void;
  paper: Paper;
  tone?: 'primary' | 'quiet' | 'nudge';
  note?: string;
}) {
  const filled = tone === 'primary';
  const nudge = tone === 'nudge';
  const secondary = routineSecondary(paper);
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={note ? `${note}. ${label}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        filled ? [styles.primary, { backgroundColor: paper.text }] : null,
        nudge ? [styles.nudge, { borderLeftColor: paper.text }] : null,
        pressed ? styles.pressed : null,
      ]}>
      {note ? <Text style={[styles.note, { color: secondary }]}>{note}</Text> : null}
      <Text
        style={[
          styles.actionLabel,
          {
            color: filled ? paper.bg : paper.text,
            fontWeight: filled || nudge ? '600' : '400',
            textAlign: filled ? 'center' : 'left',
          },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function GuideAlerts({ paper }: { paper: Paper }) {
  const status = useRoutineReminderStatus();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const secondary = routineSecondary(paper);
  const scheduled = status.scheduledCount;
  const through = status.horizonEnd ? ` through ${status.horizonEnd}` : '';
  const count =
    typeof scheduled !== 'number'
      ? 'The alert count is not available yet.'
      : scheduled === 0
        ? 'No routine alerts are scheduled.'
        : `${scheduled} ${scheduled === 1 ? 'routine alert is' : 'routine alerts are'} scheduled${through}.`;

  return (
    <View style={styles.stack}>
      <Text style={[styles.secondary, { color: secondary }]}>{count}</Text>
      {status.message != null ? <Text style={[styles.body, { color: paper.text }]}>{status.message}</Text> : null}
      {error != null ? <Text style={[styles.body, { color: paper.text }]}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.hit}>
        <Text style={[styles.body, { color: paper.text }]}>{open ? 'Hide alert details' : 'Alert details'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.stack}>
          <Text style={[styles.secondary, { color: secondary }]}>
            Alerts cover the next seven days. If Organice stays closed longer than that, they stop until you open it again.
          </Text>
          <RoutineAction
            label="Refresh alerts"
            paper={paper}
            onPress={() => {
              setError(null);
              void status.refresh().catch((caught: unknown) => setError(errorText(caught)));
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, textAlign: 'left' },
  secondary: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, textAlign: 'left' },
  hit: { minHeight: 44, justifyContent: 'center' },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, gap: 2 },
  primary: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  nudge: { borderLeftWidth: 3, paddingLeft: 12 },
  pressed: { opacity: 0.72 },
  actionLabel: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  note: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
});
