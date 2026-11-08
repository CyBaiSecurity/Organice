import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { occurrenceSchedule, sameOccurrence } from '@/state/routine';
import { clockLabel } from '@/state/clock';
import { occurrenceIsEarlier, type DayPlan, type Occurrence } from '@/domain/routine';
import type { Paper } from '@/theme/palette';

export function RoutineTimeline({
  plan,
  guideOn,
  paper,
  secondary,
  resetKey,
}: {
  plan: DayPlan;
  guideOn: boolean;
  paper: Paper;
  secondary: string;
  resetKey: string;
}) {
  return <TimelineBody key={resetKey} plan={plan} guideOn={guideOn} paper={paper} secondary={secondary} />;
}

function TimelineBody({
  plan,
  guideOn,
  paper,
  secondary,
}: {
  plan: DayPlan;
  guideOn: boolean;
  paper: Paper;
  secondary: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showPast, setShowPast] = useState<boolean | null>(null);
  const rows = plan.occurrences.map((item, index) => ({
    item,
    key: `${item.blockId ?? 'open'}-${index}`,
    now: guideOn && sameOccurrence(plan.current, item),
    next: guideOn && sameOccurrence(plan.next, item) && !sameOccurrence(plan.current, item),
  }));
  const past = rows.filter((row) => !row.now && occurrenceIsEarlier(plan, row.item));
  const upcoming = rows.filter((row) => row.now || !occurrenceIsEarlier(plan, row.item));
  const pastOpen = showPast ?? upcoming.length === 0;

  return (
    <View style={styles.stack}>
      <Text style={[styles.heading, { color: paper.text }]}>Day</Text>
      {upcoming.length === 0 && past.length === 0 ? (
        <Text style={[styles.secondary, { color: secondary }]}>Nothing is on the guide for this day.</Text>
      ) : null}
      {upcoming.map((row) => (
        <TimelineRow
          key={row.key}
          row={row}
          open={openKey === row.key}
          paper={paper}
          secondary={secondary}
          onPress={() => setOpenKey((current) => (current === row.key ? null : row.key))}
        />
      ))}
      {past.length > 0 ? (
        <View style={styles.stack}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowPast(!pastOpen)}
            style={styles.hit}>
            <Text style={[styles.body, { color: paper.text }]}>{pastOpen ? 'Hide earlier' : `Earlier (${past.length})`}</Text>
          </Pressable>
          {pastOpen
            ? past.map((row) => (
                <TimelineRow
                  key={row.key}
                  row={row}
                  open={openKey === row.key}
                  paper={paper}
                  secondary={secondary}
                  onPress={() => setOpenKey((current) => (current === row.key ? null : row.key))}
                />
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

function TimelineRow({
  row,
  open,
  paper,
  secondary,
  onPress,
}: {
  row: { item: Occurrence; key: string; now: boolean; next: boolean };
  open: boolean;
  paper: Paper;
  secondary: string;
  onPress: () => void;
}) {
  const item = row.item;
  const unconfirmed = item.role === 'unconfirmed-meeting';
  return (
    <View style={styles.rowBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} details for ${item.title}`}
        onPress={onPress}
        style={styles.row}>
        <Text style={[styles.time, { color: secondary }]}>{timeColumn(item)}</Text>
        <View style={styles.titleCol}>
          <Text style={[styles.body, { color: paper.text }]}>{item.title}</Text>
          {row.now ? <Text style={[styles.secondary, { color: paper.text }]}>Now</Text> : null}
          {row.next && !row.now ? <Text style={[styles.secondary, { color: secondary }]}>Next</Text> : null}
          {unconfirmed ? <Text style={[styles.secondary, { color: secondary }]}>Needs a confirmed time</Text> : null}
          {!open && item.instructions ? <Text style={[styles.secondary, { color: secondary }]}>Instructions</Text> : null}
        </View>
        <Text style={[styles.mark, { color: paper.text }]}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          <Text style={[styles.secondary, { color: secondary }]}>{occurrenceSchedule(item)}</Text>
          {item.instructions ? <Text style={[styles.body, { color: paper.text }]}>{item.instructions}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function timeColumn(item: Occurrence): string {
  if (item.role === 'unconfirmed-meeting') return '—';
  if (item.synthetic || item.timing === 'suggested' || item.startMinute == null) return 'Open';
  return clockLabel(item.startMinute);
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
  rowBlock: { gap: 4 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  time: { width: 64, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: 'Georgia' },
  titleCol: { flex: 1, gap: 2 },
  mark: { width: 24, fontSize: 16, lineHeight: 20, textAlign: 'center', fontFamily: 'Georgia' },
  detail: { paddingLeft: 76, gap: 4, paddingBottom: 6 },
  heading: { fontFamily: 'Georgia', fontSize: 20, lineHeight: 26 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18 },
  hit: { minHeight: 44, justifyContent: 'center' },
});
