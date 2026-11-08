import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, errorText } from '@/components/ui';
import { useRoutineReminderStatus } from '@/state/routineReminders';
import type { Paper } from '@/theme/palette';

export { TaskChooser } from '@/components/taskChooser';

export function GuideAlerts({ paper }: { paper: Paper }) {
  const status = useRoutineReminderStatus();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const secondary = paper.text === '#000000' ? '#4A4A4A' : '#B5B5B5';
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
      <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={styles.hit}>
        <Text style={[styles.body, { color: paper.text }]}>{open ? 'Hide alert details' : 'Alert details'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.stack}>
          <Text style={[styles.secondary, { color: secondary }]}>
            Alerts cover the next seven days. If Organice stays closed longer than that, they stop until you open it again.
          </Text>
          <Button
            label="Refresh alerts"
            color={paper.text}
            textColor={paper.text}
            outline
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
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  hit: { minHeight: 44, justifyContent: 'center' },
});
