import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  HOUR_COUNT,
  HOUR_HEIGHT,
  WEEKDAY_SHORT,
  clipToDay,
  clockLabel,
  createMinutes,
  dayDelta,
  layoutDayBlocks,
  minutesFromDrag,
  weekContaining,
  type DayBlock,
} from '@/domain/timelineLayout';
import { atLocalMinutes, isoWeekday, localDateKey, minutesOfDay, startOfLocalDay } from '@/domain/time';
import { type TaskRow } from '@/state/effects';
import { taskInk, type Paper } from '@/theme/palette';

const GUTTER = 56;

export function Timeline({
  paper,
  accent,
  tasks,
  showCompleted,
  origin,
  onShift,
  onOpen,
  onChangeSpan,
  onCreate,
}: {
  paper: Paper;
  accent: string;
  tasks: TaskRow[];
  showCompleted: boolean;
  origin: Date;
  onShift: (days: number) => void;
  onOpen: (id: string) => void;
  onChangeSpan: (id: string, start: Date, end: Date) => void;
  onCreate: (start: Date, end: Date) => void;
}) {
  const day = startOfLocalDay(origin);
  const dayKey = localDateKey(day);
  const todayKey = localDateKey(new Date());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [gridWidth, setGridWidth] = useState(0);
  const gridScroll = useRef<ScrollView>(null);
  const placed = useMemo(() => splitTasks(tasks, day, showCompleted), [day, showCompleted, tasks]);
  const blocks = useMemo(
    () => layoutDayBlocks(placed.timed.map((item) => ({ id: item.task.id, startMin: item.startMin, endMin: item.endMin }))),
    [placed.timed],
  );
  const blockById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const minutes = dayKey === localDateKey(new Date()) ? Math.max(0, minutesOfDay(new Date()) - 60) : 8 * 60;
    const frame = requestAnimationFrame(() => {
      gridScroll.current?.scrollTo({ y: (minutes / 60) * HOUR_HEIGHT, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [dayKey]);

  const heading = day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const nowTop = (minutesOfDay(new Date(nowMs)) / 60) * HOUR_HEIGHT;

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8} onPress={() => onShift(-1)} style={styles.navHit}>
          <Text style={[styles.navText, { color: accent }]}>Earlier</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.heading, { color: paper.text }]}>{heading}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8} onPress={() => onShift(1)} style={styles.navHit}>
          <Text style={[styles.navText, { color: accent }]}>Later</Text>
        </Pressable>
      </View>
      <View style={styles.week}>
        {weekContaining(day).map((date) => {
          const key = localDateKey(date);
          const chosen = key === dayKey;
          const today = key === todayKey;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={today ? `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${date.getDate()}, today` : `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${date.getDate()}`}
              onPress={() => onShift(dayDelta(day, date))}
              style={styles.day}>
              <Text style={[styles.weekday, { color: chosen ? paper.text : paper.muted }]}>{WEEKDAY_SHORT[isoWeekday(date) - 1]}</Text>
              <View style={[styles.dayNum, { backgroundColor: chosen ? paper.text : 'transparent', borderColor: today || chosen ? paper.text : 'transparent' }]}>
                <Text style={{ color: chosen ? paper.bg : paper.text, fontFamily: 'Georgia', fontSize: 14, fontWeight: today ? '700' : '400' }}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {placed.allDay.length > 0 || placed.untimed.length > 0 ? (
        <ScrollView style={styles.band} nestedScrollEnabled>
          {placed.allDay.map((task) => (
            <BandRow key={task.id} task={task} detail={task.all_day === 1 ? 'All day' : dueLabel(task)} paper={paper} onOpen={onOpen} />
          ))}
          {placed.untimed.length > 0 ? <Text style={[styles.bandLabel, { color: paper.muted }]}>No time</Text> : null}
          {placed.untimed.map((task) => (
            <BandRow key={task.id} task={task} detail="No time" paper={paper} onOpen={onOpen} />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        ref={gridScroll}
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}>
        <View
          style={[styles.grid, { backgroundColor: paper.surface }]}
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
          {Array.from({ length: HOUR_COUNT }, (_, hour) => (
            <View key={hour} pointerEvents="none" style={[styles.hourRow, { top: hour * HOUR_HEIGHT, borderColor: paper.line }]}>
              <Text style={[styles.hourLabel, { color: paper.muted }]}>{clockLabel(hour)}</Text>
              <View style={[styles.halfHour, { backgroundColor: paper.line }]} />
            </View>
          ))}
          {Array.from({ length: HOUR_COUNT }, (_, hour) => (
            <Pressable
              key={`new-${hour}`}
              accessibilityRole="button"
              accessibilityLabel={`New task at ${clockLabel(hour)}`}
              onPress={(event) => {
                const minutes = createMinutes(hour, event.nativeEvent.locationY);
                const start = atLocalMinutes(day, minutes);
                onCreate(start, new Date(start.getTime() + 30 * 60_000));
              }}
              style={[styles.hourHit, { top: hour * HOUR_HEIGHT }]}
            />
          ))}
          {dayKey === todayKey ? (
            <View pointerEvents="none" style={[styles.now, { top: nowTop, backgroundColor: paper.text }]}>
              <View style={[styles.nowDot, { backgroundColor: paper.text }]} />
            </View>
          ) : null}
          {gridWidth > 0
            ? placed.timed.map((item) => {
                const block = blockById.get(item.task.id);
                if (!block) return null;
                return (
                  <TaskBlock
                    key={item.task.id}
                    task={item.task}
                    block={block}
                    gridWidth={gridWidth}
                    accent={accent}
                    paper={paper}
                    onOpen={() => onOpen(item.task.id)}
                    onChangeSpan={(start, end) => onChangeSpan(item.task.id, start, end)}
                  />
                );
              })
            : null}
        </View>
      </ScrollView>
    </View>
  );
}

function BandRow({ task, detail, paper, onOpen }: { task: TaskRow; detail: string; paper: Paper; onOpen: (id: string) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${task.title}, ${detail}`} onPress={() => onOpen(task.id)} style={styles.bandRow}>
      <Text numberOfLines={1} style={[styles.bandTitle, { color: taskInk(task.priority, paper) }, task.status === 'completed' ? styles.dimmed : null]}>{task.title}</Text>
      <Text style={[styles.bandDetail, { color: paper.muted }]}>{detail}</Text>
    </Pressable>
  );
}

function TaskBlock({
  task,
  block,
  gridWidth,
  accent,
  paper,
  onOpen,
  onChangeSpan,
}: {
  task: TaskRow;
  block: DayBlock;
  gridWidth: number;
  accent: string;
  paper: Paper;
  onOpen: () => void;
  onChangeSpan: (start: Date, end: Date) => void;
}) {
  const startMs = new Date(task.start_at as string).getTime();
  const endMs = new Date(task.due_at as string).getTime();
  const [drag, setDrag] = useState(0);
  const [mode, setMode] = useState<'move' | 'end'>('move');
  const openRef = useRef(onOpen);
  const changeRef = useRef(onChangeSpan);
  useEffect(() => {
    openRef.current = onOpen;
    changeRef.current = onChangeSpan;
  });
  const laneWidth = (gridWidth - GUTTER - 4) / block.lanes;
  const left = GUTTER + block.lane * laneWidth + 2;
  const width = Math.max(48, laneWidth - 4);
  const shift = (minutesFromDrag(drag) / 60) * HOUR_HEIGHT;
  const top = block.top + (mode === 'move' ? shift : 0);
  const height = Math.max(28, block.height + (mode === 'end' ? shift : 0));
  const fill = task.priority > 0 ? taskInk(task.priority, paper) : accent;
  const label = onBlockText(fill);

  const moveResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      setMode('move');
      setDrag(0);
    },
    onPanResponderMove: (_, pan) => setDrag(pan.dy),
    onPanResponderRelease: (_, pan) => {
      setDrag(0);
      if (Math.abs(pan.dy) < 8 && Math.abs(pan.dx) < 8) {
        openRef.current();
        return;
      }
      const minutes = minutesFromDrag(pan.dy);
      if (minutes === 0) return;
      changeRef.current(new Date(startMs + minutes * 60_000), new Date(endMs + minutes * 60_000));
    },
    onPanResponderTerminate: () => setDrag(0),
  }), [endMs, startMs]);

  const endResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      setMode('end');
      setDrag(0);
    },
    onPanResponderMove: (_, pan) => setDrag(pan.dy),
    onPanResponderRelease: (_, pan) => {
      setDrag(0);
      setMode('move');
      if (Math.abs(pan.dy) < 8 && Math.abs(pan.dx) < 8) {
        openRef.current();
        return;
      }
      const minutes = minutesFromDrag(pan.dy);
      if (minutes === 0) return;
      const nextEnd = new Date(endMs + minutes * 60_000);
      if (nextEnd.getTime() - startMs < 15 * 60_000) return;
      changeRef.current(new Date(startMs), nextEnd);
    },
    onPanResponderTerminate: () => {
      setDrag(0);
      setMode('move');
    },
  }), [endMs, startMs]);

  const start = new Date(startMs);
  const end = new Date(endMs);
  return (
    <View
      {...moveResponder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${formatClock(start)} to ${formatClock(end)}`}
      style={[styles.block, task.status === 'completed' ? styles.dimmed : null, { top, left, width, height, backgroundColor: fill }]}>
      <Text numberOfLines={height >= 48 ? 2 : 1} style={[styles.blockTitle, { color: label }]}>{task.title}</Text>
      {height >= 48 ? <Text numberOfLines={1} style={[styles.blockTime, { color: label }]}>{formatClock(start)}–{formatClock(end)}</Text> : null}
      <View
        {...endResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Change the end time"
        style={styles.handle}>
        <View style={[styles.handleMark, { backgroundColor: label }]} />
      </View>
    </View>
  );
}

function splitTasks(tasks: TaskRow[], day: Date, showCompleted: boolean) {
  const dayKey = localDateKey(day);
  const visible = tasks.filter((task) => showCompleted || task.status === 'open');
  const timed: { task: TaskRow; startMin: number; endMin: number }[] = [];
  const allDay: TaskRow[] = [];
  const untimed: TaskRow[] = [];
  for (const task of visible) {
    if (task.all_day === 1) {
      if (task.due_at && task.due_at.slice(0, 10) === dayKey) allDay.push(task);
      else if (!task.due_at) untimed.push(task);
      continue;
    }
    if (task.start_at && task.due_at) {
      const startMs = new Date(task.start_at).getTime();
      const endMs = new Date(task.due_at).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        untimed.push(task);
        continue;
      }
      const clip = clipToDay(startMs, endMs, day);
      if (clip) timed.push({ task, ...clip });
      continue;
    }
    const owned = task.due_at ?? task.start_at;
    if (!owned) {
      untimed.push(task);
      continue;
    }
    if (fallsOnDay(owned, dayKey)) allDay.push(task);
  }
  return { timed, allDay, untimed };
}

function fallsOnDay(stored: string, dayKey: string): boolean {
  if (stored.length <= 10) return stored.slice(0, 10) === dayKey;
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return false;
  return localDateKey(date) === dayKey;
}

function dueLabel(task: TaskRow): string {
  if (!task.due_at) return 'No deadline';
  if (task.all_day === 1) return 'All day';
  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) return 'Deadline';
  return formatClock(due);
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function onBlockText(fill: string): string {
  return luminance(fill) > 0.62 ? '#141414' : '#F4F4F4';
}

function luminance(fill: string): number {
  const hex = fill.replace('#', '');
  if (hex.length < 6) return 0;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return 0;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  navText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heading: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', fontSize: 16 },
  week: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 4, minHeight: 52 },
  weekday: { fontFamily: 'Georgia', fontSize: 11 },
  dayNum: { width: 32, height: 32, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  band: { maxHeight: 132, flexGrow: 0 },
  bandLabel: { fontFamily: 'Georgia', fontSize: 12, marginTop: 4 },
  bandRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandTitle: { flex: 1, fontFamily: 'Georgia', fontSize: 16 },
  bandDetail: { fontFamily: 'Georgia', fontSize: 12 },
  gridScroll: { flex: 1 },
  gridContent: { paddingBottom: 24 },
  grid: { height: HOUR_COUNT * HOUR_HEIGHT, position: 'relative' },
  hourRow: { position: 'absolute', left: 0, right: 0, height: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  hourLabel: { position: 'absolute', left: 0, top: 2, width: GUTTER - 6, fontFamily: 'Georgia', fontSize: 11 },
  halfHour: { position: 'absolute', left: GUTTER, right: 0, top: HOUR_HEIGHT / 2, height: StyleSheet.hairlineWidth, opacity: 0.35 },
  hourHit: { position: 'absolute', left: GUTTER, right: 0, height: HOUR_HEIGHT },
  now: { position: 'absolute', left: GUTTER - 4, right: 8, height: 2, zIndex: 3 },
  nowDot: { position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: 4 },
  block: { position: 'absolute', zIndex: 2, borderRadius: 10, paddingHorizontal: 8, paddingTop: 4, overflow: 'hidden' },
  blockTitle: { fontFamily: 'Georgia', fontSize: 13 },
  blockTime: { fontFamily: 'Georgia', fontSize: 11, opacity: 0.85 },
  handle: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, alignItems: 'center', justifyContent: 'center' },
  handleMark: { width: 22, height: 2, borderRadius: 1, opacity: 0.7 },
  dimmed: { opacity: 0.45 },
});
