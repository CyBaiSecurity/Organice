import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Muted } from '@/components/ui';
import { clockToParts, parseClock, partsToClock, type ClockParts } from '@/state/clock';
import { type Paper } from '@/theme/palette';

const ITEM = 44;
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

export function AlarmTime({
  label,
  value,
  onChange,
  paper,
  optional = false,
  hint,
  onDrag,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  paper: Paper;
  optional?: boolean;
  hint?: string;
  onDrag?: (active: boolean) => void;
}) {
  useEffect(() => {
    if (optional || parseClock(value) != null) return;
    onChange(partsToClock(clockToParts('')));
  }, [onChange, optional, value]);

  if (optional && value.trim() === '') {
    return (
      <View style={styles.block}>
        <Text style={[styles.label, { color: paper.muted }]}>{label}</Text>
        {hint ? <Muted color={paper.muted}>{hint}</Muted> : null}
        <Button label="Set time" color={paper.text} textColor={paper.text} outline onPress={() => onChange('09:00')} />
      </View>
    );
  }

  const parts = clockToParts(value);

  function commit(next: ClockParts) {
    onChange(partsToClock(next));
  }

  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: paper.muted }]}>{label}</Text>
      {hint ? <Muted color={paper.muted}>{hint}</Muted> : null}
      <View style={styles.row}>
        <Wheel
          items={HOURS}
          selected={parts.hour - 1}
          onSelect={(index) => commit({ ...parts, hour: index + 1 })}
          paper={paper}
          name="Hour"
          onDrag={onDrag}
        />
        <Text style={[styles.colon, { color: paper.text }]}>:</Text>
        <Wheel
          items={MINUTES}
          selected={parts.minute}
          onSelect={(index) => commit({ ...parts, minute: index })}
          paper={paper}
          name="Minute"
          onDrag={onDrag}
        />
        <Wheel
          items={PERIODS}
          selected={parts.period === 'PM' ? 1 : 0}
          onSelect={(index) => commit({ ...parts, period: index === 1 ? 'PM' : 'AM' })}
          paper={paper}
          name="AM/PM"
          onDrag={onDrag}
        />
      </View>
      {optional ? (
        <Button label="Clear time" color={paper.text} textColor={paper.text} outline onPress={() => onChange('')} />
      ) : null}
    </View>
  );
}

function Wheel({
  items,
  selected,
  onSelect,
  paper,
  name,
  onDrag,
}: {
  items: string[];
  selected: number;
  onSelect: (index: number) => void;
  paper: Paper;
  name: string;
  onDrag?: (active: boolean) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const selectedRef = useRef(selected);
  const dragging = useRef(false);
  selectedRef.current = selected;

  function scrollToSelected(animated: boolean) {
    scroller.current?.scrollTo({ y: selectedRef.current * ITEM, animated });
  }

  useEffect(() => {
    scrollToSelected(false);
  }, [selected]);

  function settle(offsetY: number) {
    const index = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / ITEM)));
    if (index !== selectedRef.current) onSelect(index);
  }

  return (
    <View style={styles.column} accessibilityLabel={`${name} ${items[selected] ?? ''}`}>
      <Text style={[styles.columnLabel, { color: paper.muted }]}>{name}</Text>
      <View style={styles.window}>
        <View pointerEvents="none" style={[styles.band, { borderColor: paper.rule }]} />
        <ScrollView
          ref={scroller}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          contentContainerStyle={styles.pad}
          onLayout={() => scrollToSelected(false)}
          onTouchStart={() => onDrag?.(true)}
          onScrollBeginDrag={() => {
            dragging.current = true;
            onDrag?.(true);
          }}
          onTouchEnd={() => {
            if (!dragging.current) onDrag?.(false);
          }}
          onTouchCancel={() => {
            dragging.current = false;
            onDrag?.(false);
          }}
          onScrollEndDrag={(event) => {
            const velocity = event.nativeEvent.velocity?.y;
            if (velocity == null || Math.abs(velocity) > 0.05) return;
            dragging.current = false;
            settle(event.nativeEvent.contentOffset.y);
            onDrag?.(false);
          }}
          onMomentumScrollEnd={(event) => {
            dragging.current = false;
            settle(event.nativeEvent.contentOffset.y);
            onDrag?.(false);
          }}>
          {items.map((item, index) => (
            <View key={item} style={styles.item}>
              <Text
                style={{
                  color: index === selected ? paper.text : paper.muted,
                  fontFamily: 'Georgia',
                  fontSize: index === selected ? 22 : 16,
                  fontWeight: index === selected ? '700' : '400',
                }}>
                {item}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { fontFamily: 'Georgia', fontSize: 11, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  colon: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '700', paddingBottom: 10, width: 12, textAlign: 'center' },
  column: { flex: 1, gap: 4 },
  columnLabel: { fontFamily: 'Georgia', fontSize: 11, textAlign: 'center' },
  window: { height: ITEM * 3, overflow: 'hidden' },
  band: { position: 'absolute', top: ITEM, left: 0, right: 0, height: ITEM, borderTopWidth: 1, borderBottomWidth: 1 },
  pad: { paddingVertical: ITEM },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
});
