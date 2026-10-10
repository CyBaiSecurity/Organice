import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Board } from '@/components/board';
import { Timeline } from '@/components/timeline';
import { Button, Field, RowButton } from '@/components/ui';
import {
  completeTask,
  createSection,
  deleteSection,
  deleteTask,
  getLists,
  listSections,
  listTasks,
  renameList,
  renameSection,
  reorderSections,
  setListView,
  updateTask,
} from '@/db';
import { nowIso, startOfLocalDay } from '@/domain/time';
import { eraseList } from '@/services/eraseList';
import { syncTaskSideEffects, type TaskRow } from '@/state/effects';
import { useOrganice } from '@/state/organice';
import { PAPER, accentInk, taskInk } from '@/theme/palette';
import { cancelNotification } from '@/services/notifications';
import { removeTaskEvent } from '@/services/calendarDevice';

type ListRow = { id: string; name: string; view: string; is_inbox: number; accent: string };

const VIEWS = [
  { id: 'list', label: 'List', help: 'Tasks sit in rows. A section becomes a heading.' },
  { id: 'board', label: 'Board', help: 'Each section is a column. Drag a task to another column to change its section.' },
  { id: 'timeline', label: 'Timeline', help: 'One day, with the hours down the page. Tap an empty hour to add a task.' },
] as const;

function alertTasks(error: unknown, fallback: string) {
  Alert.alert('Tasks', error instanceof Error ? error.message : fallback);
}

export default function ListScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const listId = Array.isArray(params.id) ? params.id[0] : params.id;
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, reloadSettings, tick } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [list, setList] = useState<ListRow | null>(null);
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; sort: number }[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [sectionEditor, setSectionEditor] = useState<null | { mode: 'add' } | { mode: 'rename'; id: string }>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [listName, setListName] = useState('');
  const [origin, setOrigin] = useState(startOfLocalDay(new Date()));
  const [menu, setMenu] = useState<null | 'view' | 'more'>(null);
  const insets = useSafeAreaInsets();
  const loadRequest = useRef(0);
  const viewWrite = useRef(false);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    const lists = (await getLists(db)) as ListRow[];
    const nextTasks = (await listTasks(db, { listId, status: 'all' })) as TaskRow[];
    const nextSections = (await listSections(db, listId)) as { id: string; name: string; sort: number }[];
    if (request !== loadRequest.current) return;
    setList(lists.find((item) => item.id === listId) ?? null);
    setTasks(nextTasks);
    setSections(nextSections);
    setReady(true);
  }, [db, listId]);

  useFocusEffect(useCallback(() => {
    load().catch((error) => alertTasks(error, 'Could not open this list.'));
  }, [load]));

  useFocusEffect(useCallback(() => {
    return () => setMenu(null);
  }, []));

  useEffect(() => {
    load().catch((error) => alertTasks(error, 'Could not open this list.'));
  }, [load, tick]);

  async function removeSelected() {
    for (const taskId of picked) {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) continue;
      await cancelNotification(task.notification_id);
      if (task.calendar_event_id) await removeTaskEvent(task.calendar_event_id).catch(() => undefined);
      await deleteTask(db, taskId);
    }
    setPicked([]);
    setSelecting(false);
    refresh();
  }

  async function saveSection() {
    if (!list || !sectionEditor) return;
    if (name.trim().length === 0) {
      Alert.alert('Section', 'Enter a name.');
      return;
    }
    try {
      if (sectionEditor.mode === 'add') await createSection(db, list.id, name);
      else await renameSection(db, sectionEditor.id, name);
      setSectionEditor(null);
      setName('');
      refresh();
    } catch (error) {
      Alert.alert('Section', error instanceof Error ? error.message : 'Could not save the section.');
    }
  }

  async function shiftSection(sectionId: string, direction: -1 | 1) {
    const ids = sections.map((section) => section.id);
    const index = ids.indexOf(sectionId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const order = [...ids];
    const [moved] = order.splice(index, 1);
    order.splice(next, 0, moved);
    try {
      await reorderSections(db, order);
      refresh();
    } catch (error) {
      Alert.alert('Section', error instanceof Error ? error.message : 'Could not move the section.');
    }
  }

  async function moveCard(taskId: string, sectionId: string | null, index: number) {
    const column = tasks
      .filter((task) => task.section_id === sectionId && task.id !== taskId && (showCompleted || task.status === 'open'))
      .sort((left, right) => left.sort - right.sort);
    const moving = tasks.find((task) => task.id === taskId);
    if (!moving) return;
    column.splice(Math.max(0, Math.min(index, column.length)), 0, moving);
    try {
      for (let position = 0; position < column.length; position += 1) {
        const task = column[position];
        const patch: { sort?: number; section_id?: string | null } = {};
        if (task.id === taskId) patch.section_id = sectionId;
        if (task.sort !== position) patch.sort = position;
        if (patch.sort !== undefined || patch.section_id !== undefined) await updateTask(db, task.id, patch);
      }
      refresh();
    } catch (error) {
      alertTasks(error, 'Could not move that task.');
    }
  }

  async function completeSelected() {
    const ids = [...picked];
    const completed: string[] = [];
    const updates = new Map<string, TaskRow>();
    try {
      for (const taskId of ids) {
        updates.set(taskId, await completeTask(db, taskId, nowIso()));
        completed.push(taskId);
      }
      setTasks((current) => current.map((task) => updates.get(task.id) ?? task));
      setPicked([]);
      setSelecting(false);
    } catch (error) {
      setPicked((current) => current.filter((taskId) => !completed.includes(taskId)));
      alertTasks(error, 'Could not complete the selected tasks.');
    }
    refresh();
    for (const taskId of completed) {
      syncTaskSideEffects(db, taskId).catch((error) => alertTasks(error, 'Could not update the reminder or the calendar.'));
    }
  }

  function askRemoveSelected() {
    const count = picked.length;
    if (count === 0) {
      Alert.alert('Delete selected', 'Select at least one task first.');
      return;
    }
    const message = count === 1
      ? '1 selected task will be deleted.'
      : `${count} selected tasks will be deleted.`;
    Alert.alert('Delete selected', message, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeSelected().catch((error) => alertTasks(error, 'Could not delete the selected tasks.'));
        },
      },
    ]);
  }

  function askDeleteList() {
    if (!list || list.is_inbox) return;
    Alert.alert('Delete list', 'This deletes the list, its sections, and its tasks.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          eraseList(db, list.id).then(() => {
            reloadSettings().catch(() => undefined);
            refresh();
            router.back();
          }).catch((error) => Alert.alert('List', error instanceof Error ? error.message : 'Could not delete the list.'));
        },
      },
    ]);
  }

  function chooseView(viewId: 'list' | 'board' | 'timeline') {
    if (!list || list.view === viewId || viewWrite.current) {
      setMenu(null);
      return;
    }
    const previous = list.view;
    viewWrite.current = true;
    setMenu(null);
    setList((current) => (current ? { ...current, view: viewId } : current));
    setListView(db, list.id, viewId)
      .then(() => refresh())
      .catch((error) => {
        setList((current) => (current ? { ...current, view: previous } : current));
        Alert.alert('List', error instanceof Error ? error.message : 'Could not change the view.');
      })
      .finally(() => {
        viewWrite.current = false;
      });
  }

  function openSectionEditor(next: { mode: 'add' } | { mode: 'rename'; id: string }, sectionName: string) {
    setMenu(null);
    setRenaming(false);
    setSectionEditor(next);
    setName(sectionName);
  }

  async function saveListName() {
    if (!list || list.is_inbox) return;
    await renameList(db, list.id, listName);
    const next = listName.trim();
    setList((current) => (current ? { ...current, name: next } : current));
    setRenaming(false);
    refresh();
  }

  function openTask(taskId: string) {
    if (selecting) {
      setPicked((current) => (current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId]));
      return;
    }
    router.push(`/task/${taskId}`);
  }

  if (!ready || !list) {
    return (
      <View style={[styles.missing, { backgroundColor: paper.bg }]}>
        {ready ? <Text style={{ color: paper.text, fontFamily: 'Georgia' }}>This list is not on this phone.</Text> : null}
      </View>
    );
  }
  const visible = tasks.filter((task) => showCompleted || task.status === 'open');
  const listInk = accentInk(list.accent, paper);
  const currentView = VIEWS.find((view) => view.id === list.view) ?? VIEWS[0];
  const menuTop = insets.top + (Platform.OS === 'ios' ? 52 : 72);
  const headerText = { color: paper.text, fontFamily: 'Georgia', fontSize: 16, fontWeight: '700' as const };
  const groupedTasks = () => {
    if (sections.length === 0) return [{ key: 'all', title: '', rows: visible }];
    const groups = [
      { key: 'none', title: 'No section', rows: visible.filter((task) => task.section_id == null) },
      ...sections.map((section) => ({
        key: section.id,
        title: section.name,
        rows: visible.filter((task) => task.section_id === section.id),
      })),
    ];
    return groups.filter((group) => group.key !== 'none' || group.rows.length > 0);
  };

  return (
    <View style={{ flex: 1, backgroundColor: paper.bg }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Text numberOfLines={1} style={{ color: listInk, fontFamily: 'Georgia', fontSize: 20 }}>
              {list.name}
            </Text>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selecting ? 'Done selecting' : 'More actions'}
                accessibilityState={{ expanded: menu === 'more' }}
                hitSlop={8}
                onPress={() => {
                  if (selecting) {
                    setSelecting(false);
                    setPicked([]);
                    setMenu(null);
                    return;
                  }
                  setMenu((current) => (current === 'more' ? null : 'more'));
                }}
                style={styles.headerButton}>
                <Text style={headerText}>{selecting ? 'Done' : 'More'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View, ${currentView.label}`}
                accessibilityState={{ expanded: menu === 'view' }}
                hitSlop={8}
                onPress={() => setMenu((current) => (current === 'view' ? null : 'view'))}
                style={styles.headerButton}>
                <Text style={headerText}>{currentView.label} {menu === 'view' ? '▴' : '▾'}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <Modal visible={menu !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityRole="button" accessibilityLabel="Close menu" />
          <View style={[styles.menuCard, { top: menuTop, backgroundColor: paper.surface, borderColor: paper.rule }]}>
            {menu === 'view' ? VIEWS.map((view) => {
              const selected = list.view === view.id;
              return (
                <Pressable
                  key={view.id}
                  accessibilityRole="button"
                  accessibilityLabel={view.label}
                  accessibilityHint={view.help}
                  accessibilityState={{ selected }}
                  onPress={() => chooseView(view.id)}
                  style={styles.menuRow}>
                  <Text style={[styles.check, { color: paper.text }]}>{selected ? '✓' : ''}</Text>
                  <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17, fontWeight: selected ? '700' : '400' }}>{view.label}</Text>
                </Pressable>
              );
            }) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showCompleted ? 'Hide completed' : 'Show completed'}
                  onPress={() => {
                    setShowCompleted((value) => !value);
                    setMenu(null);
                  }}
                  style={styles.menuRow}>
                  <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17 }}>{showCompleted ? 'Hide completed' : 'Show completed'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select"
                  onPress={() => {
                    setSelecting(true);
                    setPicked([]);
                    setMenu(null);
                  }}
                  style={styles.menuRow}>
                  <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17 }}>Select</Text>
                </Pressable>
                {list.view === 'list' && !sectionEditor ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add section"
                    onPress={() => openSectionEditor({ mode: 'add' }, '')}
                    style={styles.menuRow}>
                    <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17 }}>Add section</Text>
                  </Pressable>
                ) : null}
                {list.is_inbox ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rename list"
                    onPress={() => {
                      setSectionEditor(null);
                      setName('');
                      setListName(list.name);
                      setRenaming(true);
                      setMenu(null);
                    }}
                    style={styles.menuRow}>
                    <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 17 }}>Rename list</Text>
                  </Pressable>
                )}
                <View style={[styles.rule, { backgroundColor: paper.rule }]} />
                {list.is_inbox ? (
                  <Text style={{ color: paper.muted, fontFamily: 'Georgia', fontSize: 15, paddingVertical: 8 }}>Inbox cannot be deleted. New tasks use it when another list is deleted.</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete list"
                    onPress={() => {
                      setMenu(null);
                      askDeleteList();
                    }}
                    style={styles.menuRow}>
                    <Text style={{ color: paper.danger, fontFamily: 'Georgia', fontSize: 17 }}>Delete list</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
      <View style={styles.toolbar}>
        {selecting ? (
          <View style={styles.views}>
            <Button label="Complete selected" color={paper.text} textColor={paper.bg} onPress={() => completeSelected().catch((error) => alertTasks(error, 'Could not complete the selected tasks.'))} />
            <Button label="Delete selected" color={paper.danger} textColor={paper.bg} onPress={askRemoveSelected} />
          </View>
        ) : null}
        {renaming ? (
          <View style={styles.editor}>
            <Field label="List name" value={listName} onChangeText={setListName} paper={paper} />
            <Button label="Save name" color={paper.text} textColor={paper.bg} onPress={() => { saveListName().catch((error) => Alert.alert('List', error instanceof Error ? error.message : 'Could not rename the list.')); }} />
            <Button label="Cancel" color={paper.text} textColor={paper.text} outline onPress={() => setRenaming(false)} />
          </View>
        ) : null}
        {sectionEditor ? (
          <View style={styles.editor}>
            <Field label={sectionEditor.mode === 'add' ? 'New section' : 'Rename section'} value={name} onChangeText={setName} paper={paper} placeholder="Section name" />
            <Button label="Save section" color={paper.text} textColor={paper.bg} onPress={() => { saveSection().catch(() => undefined); }} />
            <Button label="Cancel section" color={paper.text} textColor={paper.text} outline onPress={() => { setSectionEditor(null); setName(''); }} />
          </View>
        ) : null}
        <Button label="New task" color={paper.text} textColor={paper.bg} onPress={() => router.push({ pathname: '/task/[id]', params: { id: 'new', listId: list.id } })} />
      </View>
      {list.view === 'list' ? (
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled">
        {groupedTasks().map((group) => (
          <View key={group.key} style={styles.group}>
            {group.title ? <Text style={[styles.groupTitle, { color: paper.text }]}>{group.title}</Text> : null}
            {group.rows.map((task) => (
              <RowButton
                key={task.id}
                paper={paper}
                wave
                label={`${picked.includes(task.id) ? '● ' : ''}${task.title}`}
                detail={task.status === 'completed' ? 'Completed' : undefined}
                labelColor={taskInk(task.priority, paper)}
                dimmed={task.status === 'completed'}
                onPress={() => openTask(task.id)}
              />
            ))}
            {group.title && group.rows.length === 0 ? (
              <Text style={{ color: paper.muted, fontFamily: 'Georgia' }}>No tasks in this section.</Text>
            ) : null}
          </View>
        ))}
        {sections.length === 0 && visible.length === 0 ? (
          <Text style={{ color: paper.muted, fontFamily: 'Georgia' }}>No tasks in this list.</Text>
        ) : null}
      </ScrollView>
      ) : null}
      {list.view === 'board' ? (
        <View style={styles.stage}>
          <Board
            paper={paper}
            accent={listInk}
            sections={sections}
            tasks={tasks}
            showCompleted={showCompleted}
            selecting={selecting}
            picked={picked}
            onOpen={openTask}
            onAddTask={(sectionId) => {
              router.push({
                pathname: '/task/[id]',
                params: { id: 'new', listId: list.id, ...(sectionId ? { sectionId } : {}) },
              });
            }}
            onMove={(taskId, sectionId, index) => { moveCard(taskId, sectionId, index).catch(() => undefined); }}
            onRequestAdd={() => openSectionEditor({ mode: 'add' }, '')}
            onRenameRequest={(sectionId) => openSectionEditor({ mode: 'rename', id: sectionId }, sections.find((section) => section.id === sectionId)?.name ?? '')}
            onDeleteSection={(sectionId) => {
              deleteSection(db, sectionId).then(refresh).catch((error) => Alert.alert('Section', error instanceof Error ? error.message : 'Could not delete the section.'));
            }}
            onShiftSection={(sectionId, direction) => { shiftSection(sectionId, direction).catch(() => undefined); }}
          />
        </View>
      ) : null}
      {list.view === 'timeline' ? (
        <View style={styles.stage}>
          <Timeline
            paper={paper}
            accent={listInk}
            tasks={tasks}
            showCompleted={showCompleted}
            origin={origin}
            onShift={(days) => setOrigin(new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + days))}
            onOpen={openTask}
            onChangeSpan={(taskId, start, end) => {
              updateTask(db, taskId, { start_at: start.toISOString(), due_at: end.toISOString(), all_day: 0 })
                .then(() => {
                  refresh();
                  syncTaskSideEffects(db, taskId).catch((error) => alertTasks(error, 'Could not update the reminder or the calendar.'));
                })
                .catch((error) => alertTasks(error, 'Could not move that task.'));
            }}
            onCreate={(start, end) => {
              router.push({ pathname: '/task/[id]', params: { id: 'new', listId: list.id, start: start.toISOString(), due: end.toISOString() } });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, padding: 20, justifyContent: 'center' },
  fill: { flex: 1 },
  toolbar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 },
  stage: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  group: { gap: 8 },
  groupTitle: { fontSize: 16, fontFamily: 'Georgia' },
  views: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editor: { gap: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  backdrop: { flex: 1 },
  menuCard: { position: 'absolute', right: 12, minWidth: 220, maxWidth: 320, borderWidth: 1, borderRadius: 20, padding: 12, gap: 4 },
  menuRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  check: { width: 18, fontSize: 16 },
  rule: { height: 1, marginVertical: 4 },
});
