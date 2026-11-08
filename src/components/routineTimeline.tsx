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
  const [dayOpen, setDayOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showPast, setShowPast] = useState<boolean | null>(null);
  const live = guideOn && plan.minute >= 0 && plan.minute < 1440;
  const rows = plan.occurrences.flatMap((item, index) => {
    const now = live && sameOccurrence(plan.current, item);
    if (now) return [];
    return [
      {
        item,
        key: `${item.blockId ?? 'open'}-${index}`,
        next: live && sameOccurrence(plan.next, item),
      },
    ];
  });
  const past = rows.filter((row) => occurrenceIsEarlier(plan, row.item));
  const upcoming = rows.filter((row) => !occurrenceIsEarlier(plan, row.item));
  const pastOpen = showPast ?? upcoming.length === 0;
  const dayLabel = dayOpen ? 'Hide full day' : 'Full day';

  if (plan.occurrences.length === 0) {
    return (
      <View style={[styles.section, { borderTopColor: paper.text }]}>
        <Text style={[styles.secondary, { color: secondary }]}>Nothing is on the guide for this day.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.section, { borderTopColor: paper.text }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: dayOpen }}
        accessibilityLabel={dayLabel}
        onPress={() => setDayOpen((open) => !open)}
        style={styles.hit}>
        <Text style={[styles.body, { color: paper.text }]}>{dayLabel}</Text>
        <Text style={[styles.mark, { color: paper.text }]}>{dayOpen ? '−' : '+'}</Text>
      </Pressable>
      {dayOpen ? (
        <View style={styles.stack}>
          {rows.length === 0 ? (
            <Text style={[styles.secondary, { color: secondary }]}>Nothing else is on the guide for this day.</Text>
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
                accessibilityState={{ expanded: pastOpen }}
                accessibilityLabel={pastOpen ? 'Hide earlier' : `Earlier, ${past.length}`}
                onPress={() => setShowPast(!pastOpen)}
                style={styles.hit}>
                <Text style={[styles.body, { color: paper.text }]}>{pastOpen ? 'Hide earlier' : `Earlier (${past.length})`}</Text>
                <Text style={[styles.mark, { color: paper.text }]}>{pastOpen ? '−' : '+'}</Text>
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
  row: { item: Occurrence; key: string; next: boolean };
  open: boolean;
  paper: Paper;
  secondary: string;
  onPress: () => void;
}) {
  const item = row.item;
  const unconfirmed = item.role === 'unconfirmed-meeting';
  const schedule = occurrenceSchedule(item);
  const start = timeColumn(item);
  const showSchedule = schedule !== start && !unconfirmed;
  return (
    <View style={styles.rowBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} details for ${item.title}`}
        onPress={onPress}
        style={styles.row}>
        <Text numberOfLines={2} style={[styles.time, { color: secondary }]}>
          {start}
        </Text>
        <View style={styles.titleCol}>
          <Text style={[styles.body, { color: paper.text }]}>{item.title}</Text>
          {showSchedule ? <Text style={[styles.secondary, { color: secondary }]}>{schedule}</Text> : null}
          {row.next ? <Text style={[styles.secondary, { color: secondary }]}>Next</Text> : null}
          {unconfirmed ? <Text style={[styles.secondary, { color: secondary }]}>Needs a confirmed time</Text> : null}
          {!open && item.instructions ? <Text style={[styles.secondary, { color: secondary }]}>Instructions</Text> : null}
        </View>
        <Text style={[styles.mark, { color: paper.text }]}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          <Text style={[styles.secondary, { color: secondary }]}>{schedule}</Text>
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
  section: { gap: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  stack: { gap: 4 },
  rowBlock: { gap: 4 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  time: {
    width: 96,
    flexShrink: 0,
    paddingTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Georgia',
  },
  titleCol: { flex: 1, minWidth: 0, gap: 2 },
  mark: { width: 24, flexShrink: 0, paddingTop: 2, fontSize: 16, lineHeight: 20, textAlign: 'center', fontFamily: 'Georgia' },
  detail: { gap: 4, paddingBottom: 6 },
  body: { fontFamily: 'Georgia', fontSize: 16, lineHeight: 22, textAlign: 'left' },
  secondary: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 18, textAlign: 'left' },
  hit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
