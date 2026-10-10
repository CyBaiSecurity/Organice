import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, useColorScheme, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AlarmTime } from '@/components/alarmTime';
import { Button, Chip, Field, Muted } from '@/components/ui';
import {
  addChecklistItem,
  completeTask,
  createSection,
  createTask,
  deleteChecklistItem,
  deleteTask,
  getLists,
  getTask,
  listChecklist,
  listSections,
  reopenTask,
  reorderChecklist,
  setChecklistDone,
  updateTask,
} from '@/db';
import { addLocalDays, isoWeekday, localDateKey, nowIso, readDue, startOfLocalDay, WEEK_LABELS } from '@/domain/time';
import { snoozedAt } from '@/domain/snooze';
import { combineDateAndTime, dateKeyInput, formatDay, parseClock } from '@/state/clock';
import { eventSpan, syncTaskSideEffects, unlinkCalendar, type TaskRow } from '@/state/effects';
import { useOrganice } from '@/state/organice';
import { PAPER, accentColor, accentInk, taskInk } from '@/theme/palette';
import { cancelNotification, scheduleTaskReminder } from '@/services/notifications';
import { removeTaskEvent, saveTaskEvent } from '@/services/calendarDevice';

const PRIORITIES = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];
const OFFSETS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At the deadline' },
  { value: 5, label: '5 min before' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];
const REPEAT = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'after_complete', label: 'After you complete it' },
];

function clockFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function sameDueInstant(stored: string | null, next: string | null, allDay: boolean): boolean {
  if (stored == null || next == null) return stored === next;
  if (allDay) return stored.slice(0, 10) === next.slice(0, 10);
  const left = new Date(stored);
  const right = new Date(next);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
    && left.getHours() === right.getHours()
    && left.getMinutes() === right.getMinutes();
}

function alertSync(error: unknown) {
  Alert.alert('Task', error instanceof Error ? error.message : 'Could not update the reminder or the calendar.');
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthCells(cursor: Date): ({ day: number; key: string } | null)[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = first.getDay();
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: ({ day: number; key: string } | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ day, key: localDateKey(date) });
  }
  return cells;
}

function DeadlineDropdown({
  dateKey,
  onChange,
  paper,
  title = 'Deadline date',
  emptyLabel = 'No deadline',
}: {
  dateKey: string;
  onChange: (value: string) => void;
  paper: { bg: string; surface: string; text: string; muted: string; line: string; rule: string };
  title?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = dateKey ? combineDateAndTime(dateKey, 0) : null;
  const [cursor, setCursor] = useState(() => startOfMonth(parsed ?? new Date()));
  const todayKey = localDateKey(new Date());
  const tomorrowKey = localDateKey(addLocalDays(startOfLocalDay(new Date()), 1));
  const label = parsed ? formatDay(parsed) : emptyLabel;

  function toggle() {
    const current = dateKey ? combineDateAndTime(dateKey, 0) : null;
    setCursor(startOfMonth(current ?? new Date()));
    setOpen((value) => !value);
  }

  function choose(key: string) {
    onChange(key);
    setOpen(false);
  }

  const shortcuts = [
    { key: '', label: emptyLabel },
    { key: todayKey, label: 'Today' },
    { key: tomorrowKey, label: 'Tomorrow' },
  ];

  return (
    <View style={styles.field}>
      <Text style={{ color: paper.muted, fontSize: 13 }}>{title}</Text>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${label}`}
        style={[styles.deadline, { backgroundColor: paper.surface, borderColor: paper.rule }]}>
        <Text style={{ color: paper.text, fontSize: 16, flex: 1 }}>{label}</Text>
        <Text style={{ color: paper.muted, fontSize: 16 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.menu, { backgroundColor: paper.surface, borderColor: paper.rule }]}>
          {shortcuts.map((item) => {
            const selected = dateKey === item.key;
            return (
              <Pressable key={item.label} onPress={() => choose(item.key)} style={styles.menuRow}>
                <Text style={{ color: paper.text, fontWeight: selected ? '700' : '400' }}>{item.label}</Text>
              </Pressable>
            );
          })}
          <View style={styles.monthRow}>
            <Pressable onPress={() => setCursor((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() - 1, 1)))} hitSlop={8} accessibilityLabel="Previous month">
              <Text style={{ color: paper.text, fontSize: 22 }}>‹</Text>
            </Pressable>
            <Text style={{ color: paper.text }}>
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable onPress={() => setCursor((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1)))} hitSlop={8} accessibilityLabel="Next month">
              <Text style={{ color: paper.text, fontSize: 22 }}>›</Text>
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {WEEK_LABELS.map((day) => (
              <View key={day.label} style={styles.dayCell}>
                <Text style={{ color: paper.muted }}>{day.label.slice(0, 1)}</Text>
              </View>
            ))}
            {monthCells(cursor).map((cell, index) => {
              if (!cell) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const selected = cell.key === dateKey;
              const today = cell.key === todayKey;
              return (
                <Pressable key={cell.key} onPress={() => choose(cell.key)} style={styles.dayCell} accessibilityLabel={today ? `${cell.key}, today` : cell.key}>
                  <View style={[styles.dayDot, { backgroundColor: selected ? paper.text : 'transparent', borderColor: today || selected ? paper.text : 'transparent' }]}>
                    <Text style={{ color: selected ? paper.bg : paper.text, fontWeight: today ? '700' : '400' }}>{cell.day}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function TaskScreen() {
  const params = useLocalSearchParams<{ id: string; listId?: string; sectionId?: string; start?: string; due?: string }>();
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [task, setTask] = useState<TaskRow | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [listId, setListId] = useState(params.listId ?? settings.default_list_id ?? '');
  const [lists, setLists] = useState<{ id: string; name: string; accent: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(params.id === 'new' && typeof params.sectionId === 'string' ? params.sectionId : null);
  const [sectionName, setSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [priority, setPriority] = useState(0);
  const [allDay, setAllDay] = useState(false);
  const [dateKey, setDateKey] = useState(params.due ? dateKeyInput(new Date(params.due)) : '');
  const [dueClock, setDueClock] = useState(clockFromIso(params.due));
  const [startClock, setStartClock] = useState(clockFromIso(params.start));
  const [startDateKey, setStartDateKey] = useState(() => {
    const start = typeof params.start === 'string' ? params.start : '';
    const due = typeof params.due === 'string' ? params.due : '';
    if (!start) return '';
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return '';
    const startKey = localDateKey(startDate);
    const dueKey = due ? localDateKey(new Date(due)) : '';
    return startKey !== dueKey ? startKey : '';
  });
  const [repeat, setRepeat] = useState('none');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [interval, setInterval] = useState('1');
  const [offset, setOffset] = useState<number | null>(settings.default_reminder_offset);
  const [lines, setLines] = useState<{ id: string; title: string; done: number }[]>([]);
  const [line, setLine] = useState('');
  const [onCalendar, setOnCalendar] = useState(false);
  const [pageScroll, setPageScroll] = useState(true);
  const notificationId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const listRows = (await getLists(db)) as { id: string; name: string; accent: string }[];
    setLists(listRows);
    if (params.id === 'new') {
      setListId((current) => current || listRows[0]?.id || '');
      return;
    }
    const row = (await getTask(db, params.id)) as TaskRow | null;
    if (!row) return;
    setTask(row);
    setTitle(row.title);
    setNotes(row.notes);
    setListId(row.list_id);
    setSectionId(row.section_id);
    setPriority(row.priority);
    setAllDay(row.all_day === 1);
    setRepeat(row.repeat_kind);
    setWeekdays(row.repeat_days ? row.repeat_days.split(',').map(Number) : []);
    setInterval(String(row.repeat_interval_days ?? 1));
    setOffset(row.reminder_offset_minutes);
    setOnCalendar(Boolean(row.calendar_event_id));
    if (row.due_at) {
      const due = readDue(row.due_at, row.all_day === 1);
      setDateKey(localDateKey(due));
      if (row.all_day !== 1) setDueClock(`${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`);
    }
    if (row.start_at) {
      const start = new Date(row.start_at);
      setStartClock(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
      const startKey = Number.isNaN(start.getTime()) ? '' : localDateKey(start);
      const dueKey = row.due_at ? localDateKey(readDue(row.due_at, row.all_day === 1)) : '';
      setStartDateKey(startKey && startKey !== dueKey ? startKey : '');
    } else {
      setStartClock('');
      setStartDateKey('');
    }
    notificationId.current = row.notification_id;
    setLines((await listChecklist(db, row.id)) as { id: string; title: string; done: number }[]);
  }, [db, params.id]);

  const reloadLines = useCallback(async () => {
    if (params.id === 'new') return;
    setLines((await listChecklist(db, params.id)) as { id: string; title: string; done: number }[]);
  }, [db, params.id]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const sectionRequest = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    if (!listId) return;
    const request = ++sectionRequest.current;
    listSections(db, listId)
      .then((rows) => {
        if (request !== sectionRequest.current) return;
        const next = rows.map((row) => ({ id: row.id, name: row.name }));
        setSections(next);
        setSectionId((current) => (current && next.some((section) => section.id === current) ? current : null));
      })
      .catch(() => undefined);
  }, [db, listId]);

  function spanFromFields(): { start_at: string | null; due_at: string | null; all_day: number } {
    if (!dateKey.trim()) return { start_at: null, due_at: null, all_day: allDay ? 1 : 0 };
    if (allDay) return { start_at: null, due_at: dateKey.trim(), all_day: 1 };
    const dueMinutes = parseClock(dueClock);
    const startMinutes = parseClock(startClock);
    const due = combineDateAndTime(dateKey, dueMinutes);
    const startDay = startDateKey.trim() || dateKey;
    const start = startMinutes == null ? null : combineDateAndTime(startDay, startMinutes);
    return {
      start_at: start ? start.toISOString() : null,
      due_at: due ? due.toISOString() : null,
      all_day: 0,
    };
  }

  function changeDeadline(next: string) {
    setStartDateKey((current) => (current === '' || current === dateKey || current === next ? '' : current));
    setDateKey(next);
  }

  function changeStartClock(value: string) {
    setStartClock(value);
    if (parseClock(value) == null) setStartDateKey('');
  }

  async function addSection() {
    if (!listId) return;
    try {
      const created = await createSection(db, listId, sectionName);
      setSections((current) => [...current, { id: created.id, name: created.name }]);
      setSectionId(created.id);
      setSectionName('');
      setAddingSection(false);
      refresh();
    } catch (error) {
      Alert.alert('Section', error instanceof Error ? error.message : 'Could not add the section.');
    }
  }

  async function save() {
    if (saving.current) return;
    saving.current = true;
    const span = spanFromFields();
    const patch = {
      title,
      notes,
      list_id: listId,
      section_id: sectionId,
      priority,
      all_day: span.all_day,
      start_at: span.start_at,
      due_at: span.due_at,
      repeat_kind: repeat,
      repeat_days: repeat === 'weekly' ? weekdays.join(',') : null,
      repeat_interval_days: repeat === 'after_complete' ? Number(interval) || 1 : null,
      reminder_offset_minutes: span.due_at ? offset : null,
    };
    try {
      const id = params.id === 'new' ? ((await createTask(db, patch)) as TaskRow).id : params.id;
      if (params.id !== 'new') await updateTask(db, params.id, patch);
      refresh();
      if (router.canGoBack()) router.back();
      else router.replace(listId ? `/list/${listId}` : '/todo');
      const nextOffset = span.due_at ? offset : null;
      const keepNotification = params.id !== 'new'
        && task != null
        && task.status === 'open'
        && notificationId.current != null
        && task.all_day === span.all_day
        && task.reminder_offset_minutes === nextOffset
        && sameDueInstant(task.due_at, span.due_at, span.all_day === 1);
      syncTaskSideEffects(db, id, keepNotification ? { keepNotification: true } : undefined).catch(alertSync);
    } catch (error) {
      saving.current = false;
      Alert.alert('Task', error instanceof Error ? error.message : 'Could not save the task.');
    }
  }

  async function finish() {
    if (!task) return;
    try {
      await completeTask(db, task.id, nowIso());
    } catch (error) {
      Alert.alert('Task', error instanceof Error ? error.message : 'Could not complete the task.');
      return;
    }
    refresh();
    router.back();
    syncTaskSideEffects(db, task.id).catch(alertSync);
  }

  async function reopen() {
    if (!task) return;
    try {
      await reopenTask(db, task.id);
    } catch (error) {
      Alert.alert('Task', error instanceof Error ? error.message : 'Could not reopen the task.');
      return;
    }
    refresh();
    load().catch(() => undefined);
    syncTaskSideEffects(db, task.id).catch(alertSync);
  }

  async function destroy() {
    if (!task) return;
    await cancelNotification(task.notification_id);
    if (task.calendar_event_id) await removeTaskEvent(task.calendar_event_id).catch(() => undefined);
    await deleteTask(db, task.id);
    refresh();
    router.back();
  }

  async function linkCalendar(next: boolean) {
    if (!task) return;
    if (!next) {
      await unlinkCalendar(db, task);
      setOnCalendar(false);
      refresh();
      return;
    }
    if (!settings.writable_calendar_id) {
      Alert.alert('Calendar', 'Choose a writable calendar in Settings first. Organice uses the calendar already on this phone.');
      router.push('/settings');
      return;
    }
    const draft = { ...task, ...spanFromFields() } as TaskRow;
    const span = eventSpan(draft);
    if (!span) {
      Alert.alert('Calendar', 'Set a start and an end, or turn on all day with a date.');
      return;
    }
    const saved = await saveTaskEvent({
      calendarId: settings.writable_calendar_id,
      existingEventId: task.calendar_event_id,
      title: title || task.title,
      notes,
      start: span.start,
      end: span.end,
      allDay: draft.all_day === 1,
    });
    await updateTask(db, task.id, { calendar_id: saved.calendarId, calendar_event_id: saved.eventId });
    setOnCalendar(true);
    refresh();
  }

  async function snooze(choice: '10m' | '1h' | 'tomorrow') {
    if (!task) return;
    const when = snoozedAt(choice, new Date(), settings.work_start_minute);
    const scheduled = await scheduleTaskReminder({ title: task.title, when, taskId: task.id, previousId: notificationId.current ?? task.notification_id });
    await updateTask(db, task.id, { notification_id: scheduled.id });
    notificationId.current = scheduled.id;
    setTask((current) => (current ? { ...current, notification_id: scheduled.id } : current));
    refresh();
  }

  async function moveLine(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const order = lines.map((item) => item.id);
    const moved = order[index];
    order[index] = order[target];
    order[target] = moved;
    await reorderChecklist(db, order);
    await reloadLines();
  }

  return (
    <ScrollView scrollEnabled={pageScroll} style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save"
              onPress={() => {
                save().catch(() => undefined);
              }}
              hitSlop={8}
              style={styles.save}>
              <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17, fontWeight: '700' }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <Field label="Title" value={title} onChangeText={setTitle} paper={paper} />
      <Field label="Notes" value={notes} onChangeText={setNotes} paper={paper} multiline />
      <Text style={{ color: paper.muted }}>List</Text>
      <View style={styles.wrap}>
        {lists.map((list) => (
          <Chip
            key={list.id}
            label={list.name}
            selected={list.id === listId}
            accent={accentColor(list.accent)}
            idleColor={accentInk(list.accent, paper)}
            paper={paper}
            onPress={() => {
              if (list.id === listId) return;
              setListId(list.id);
              setSectionId(null);
              setAddingSection(false);
              setSectionName('');
            }}
          />
        ))}
      </View>
      <Text style={{ color: paper.muted }}>Section</Text>
      <Muted color={paper.muted}>A section is a group on this list. The board shows each section as its own column.</Muted>
      <View style={styles.wrap}>
        <Chip label="No section" selected={sectionId == null} accent={paper.text} paper={paper} onPress={() => setSectionId(null)} />
        {sections.map((section) => (
          <Chip key={section.id} label={section.name} selected={section.id === sectionId} accent={paper.text} paper={paper} onPress={() => setSectionId(section.id)} />
        ))}
      </View>
      {addingSection ? (
        <View style={styles.wrap}>
          <Field label="Section name" value={sectionName} onChangeText={setSectionName} paper={paper} placeholder="School, errands" />
          <Button label="Save section" color={paper.text} textColor={paper.bg} onPress={() => { addSection().catch(() => undefined); }} />
          <Button label="Cancel" color={paper.text} textColor={paper.text} outline onPress={() => { setAddingSection(false); setSectionName(''); }} />
        </View>
      ) : (
        <Button label="Add section" color={paper.text} textColor={paper.text} outline onPress={() => setAddingSection(true)} />
      )}
      <DeadlineDropdown dateKey={dateKey} onChange={changeDeadline} paper={paper} />
      {allDay ? null : (
        <View style={styles.times}>
          <AlarmTime
            label="Start time"
            value={startClock}
            onChange={changeStartClock}
            paper={paper}
            optional
            onDrag={(active) => setPageScroll(!active)}
          />
          {parseClock(startClock) != null ? (
            <DeadlineDropdown
              title="Start date"
              emptyLabel="Same as deadline"
              dateKey={startDateKey || dateKey}
              onChange={(key) => setStartDateKey(!key || key === dateKey ? '' : key)}
              paper={paper}
            />
          ) : null}
          <AlarmTime
            label="Deadline time"
            value={dueClock}
            onChange={setDueClock}
            paper={paper}
            onDrag={(active) => setPageScroll(!active)}
          />
        </View>
      )}
      <View style={styles.switchRow}>
        <Text style={{ color: paper.text }}>All-day deadline</Text>
        <Switch
          value={allDay}
          onValueChange={(value) => {
            setAllDay(value);
            if (value && offset !== null && offset !== 0) setOffset(0);
          }}
        />
      </View>
      <Text style={{ color: paper.muted }}>Priority</Text>
      <View style={styles.wrap}>
        {PRIORITIES.map((item) => (
          <Chip key={item.value} label={item.label} selected={priority === item.value} accent={taskInk(item.value, paper)} paper={paper} onPress={() => setPriority(item.value)} />
        ))}
      </View>
      <Text style={{ color: paper.muted }}>Reminder</Text>
      <View style={styles.wrap}>
        {(allDay ? OFFSETS.filter((item) => item.value == null || item.value === 0) : OFFSETS).map((item) => {
          const shown = allDay && offset !== null ? 0 : offset;
          return (
            <Chip key={item.label} label={item.label} selected={shown === item.value} accent={paper.text} paper={paper} onPress={() => setOffset(item.value)} />
          );
        })}
      </View>
      <Text style={{ color: paper.muted }}>Repeat</Text>
      <View style={styles.wrap}>
        {REPEAT.map((item) => (
          <Chip key={item.value} label={item.label} selected={repeat === item.value} accent={paper.text} paper={paper} onPress={() => {
            setRepeat(item.value);
            if (item.value === 'weekly' && weekdays.length === 0 && dateKey) {
              const date = combineDateAndTime(dateKey, 0);
              if (date) setWeekdays([isoWeekday(date)]);
            }
          }} />
        ))}
      </View>
      {repeat === 'weekly' ? (
        <View style={styles.wrap}>
          {WEEK_LABELS.map((day) => (
              <Chip
                key={day.label}
                label={day.label}
                selected={weekdays.includes(day.iso)}
                accent={paper.text}
                paper={paper}
                onPress={() => setWeekdays((current) => (current.includes(day.iso) ? current.filter((item) => item !== day.iso) : [...current, day.iso]))}
              />
          ))}
        </View>
      ) : null}
      {repeat === 'after_complete' ? <Field label="Days after completion" value={interval} onChangeText={setInterval} paper={paper} /> : null}
      {task ? (
        <View style={styles.switchRow}>
          <Text style={{ color: paper.text, flex: 1 }}>Also show on the phone calendar</Text>
          <Switch value={onCalendar} onValueChange={(value) => linkCalendar(value).catch((error) => Alert.alert('Calendar', error instanceof Error ? error.message : 'Could not update the event.'))} />
        </View>
      ) : null}
      {task && task.status === 'open' ? (
        <>
          <View style={styles.wrap}>
            <Button label="Snooze reminder 10 min" color={paper.text} textColor={paper.text} outline onPress={() => snooze('10m')} />
            <Button label="Snooze reminder 1 hour" color={paper.text} textColor={paper.text} outline onPress={() => snooze('1h')} />
            <Button label="Snooze reminder to tomorrow morning" color={paper.text} textColor={paper.text} outline onPress={() => snooze('tomorrow')} />
          </View>
        </>
      ) : null}
      {task ? (
        <>
          <Text style={{ color: paper.muted }}>Checklist</Text>
          {lines.map((item, index) => (
            <View key={item.id} style={styles.switchRow}>
              <Text
                style={{ color: paper.text, flex: 1 }}
                onPress={() => {
                  setChecklistDone(db, item.id, item.done ? 0 : 1)
                    .then(() => reloadLines())
                    .catch((error) => Alert.alert('Checklist', error instanceof Error ? error.message : 'Could not update the line.'));
                }}>
                {item.done ? '☑' : '☐'} {item.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move line up"
                disabled={index === 0}
                hitSlop={6}
                onPress={() => {
                  moveLine(index, -1).catch((error) => Alert.alert('Checklist', error instanceof Error ? error.message : 'Could not reorder the lines.'));
                }}>
                <Text style={{ color: paper.text, opacity: index === 0 ? 0.35 : 1 }}>Up</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move line down"
                disabled={index === lines.length - 1}
                hitSlop={6}
                onPress={() => {
                  moveLine(index, 1).catch((error) => Alert.alert('Checklist', error instanceof Error ? error.message : 'Could not reorder the lines.'));
                }}>
                <Text style={{ color: paper.text, opacity: index === lines.length - 1 ? 0.35 : 1 }}>Down</Text>
              </Pressable>
              <Text
                style={{ color: paper.danger }}
                onPress={() =>
                  Alert.alert('Remove this line?', undefined, [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => {
                        deleteChecklistItem(db, item.id)
                          .then(() => reloadLines())
                          .catch((error) => Alert.alert('Checklist', error instanceof Error ? error.message : 'Could not remove the line.'));
                      },
                    },
                  ])
                }>
                Remove
              </Text>
            </View>
          ))}
          <Field label="Checklist line" value={line} onChangeText={setLine} paper={paper} placeholder="What to check off" />
          <Button label="Add line" color={paper.text} textColor={paper.text} outline onPress={() => { addChecklistItem(db, task.id, line).then(() => { setLine(''); return reloadLines(); }).catch((error) => Alert.alert('Checklist', error instanceof Error ? error.message : 'Could not add the line.')); }} />
          {task.status === 'open' ? <Button label="Complete" color={paper.text} textColor={paper.bg} onPress={() => finish()} /> : <Button label="Reopen" color={paper.text} textColor={paper.bg} onPress={() => reopen()} />}
          <Button label="Delete task" color={paper.danger} textColor={paper.bg} onPress={() => Alert.alert('Delete task', 'This cannot be undone.', [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => destroy() }])} />
        </>
      ) : (
        <Text style={{ color: paper.muted }}>A title is required. Tap Save at the top to store the task.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 64 },
  save: { minHeight: 44, justifyContent: 'center', paddingRight: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  times: { gap: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  field: { gap: 6 },
  deadline: { borderWidth: 1, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menu: { borderWidth: 1, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderRadius: 20, padding: 12, gap: 4 },
  menuRow: { paddingVertical: 10, paddingHorizontal: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.285%', height: 40, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
