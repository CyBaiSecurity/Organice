import { useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WaveRule } from '@/components/waveRule';
import { taskInk, type Paper } from '@/theme/palette';
import { type TaskRow } from '@/state/effects';

type Section = { id: string; name: string; sort: number };
type Box = { x: number; y: number; width: number; height: number };

export function Board({
  paper,
  accent,
  sections,
  tasks,
  showCompleted,
  selecting,
  picked,
  onMove,
  onOpen,
  onAddTask,
  onRequestAdd,
  onRenameRequest,
  onDeleteSection,
  onShiftSection,
}: {
  paper: Paper;
  accent: string;
  sections: Section[];
  tasks: TaskRow[];
  showCompleted: boolean;
  selecting: boolean;
  picked: string[];
  onMove: (taskId: string, sectionId: string | null, index: number) => void;
  onOpen: (taskId: string) => void;
  onAddTask: (sectionId: string | null) => void;
  onRequestAdd: () => void;
  onRenameRequest: (id: string) => void;
  onDeleteSection: (id: string) => void;
  onShiftSection: (id: string, direction: -1 | 1) => void;
}) {
  const columnRefs = useRef<Record<string, View | null>>({});
  const stackRefs = useRef<Record<string, View | null>>({});
  const tasksRef = useRef(tasks);
  const sectionsRef = useRef(sections);
  const showRef = useRef(showCompleted);
  const moveRef = useRef(onMove);
  tasksRef.current = tasks;
  sectionsRef.current = sections;
  showRef.current = showCompleted;
  moveRef.current = onMove;
  const [dragging, setDragging] = useState(false);

  const columns = [
    { id: null as string | null, name: sections.length === 0 ? 'Tasks' : 'No section' },
    ...sections.map((section) => ({ id: section.id, name: section.name })),
  ];

  function drop(task: TaskRow, pageX: number, pageY: number) {
    const liveColumns = [
      { id: null as string | null, name: 'Unsectioned' },
      ...sectionsRef.current.map((section) => ({ id: section.id, name: section.name })),
    ];
    const keys = liveColumns.map((column) => column.id ?? 'none');
    Promise.all(
      keys.map(
        (key) =>
          new Promise<{ key: string; box: Box | null }>((resolve) => {
            const node = columnRefs.current[key];
            if (!node) {
              resolve({ key, box: null });
              return;
            }
            node.measureInWindow((x, y, width, height) => resolve({ key, box: { x, y, width, height } }));
          }),
      ),
    ).then((measured) => {
      const hit = measured.find((item) => {
        const box = item.box;
        if (!box || box.width < 1 || box.height < 1) return false;
        return pageX >= box.x && pageX <= box.x + box.width && pageY >= box.y && pageY <= box.y + box.height;
      });
      if (!hit?.box) return;
      const column = liveColumns.find((item) => (item.id ?? 'none') === hit.key);
      if (!column) return;
      const siblings = tasksRef.current
        .filter((item) => item.section_id === column.id && item.id !== task.id && (showRef.current || item.status === 'open'))
        .sort((a, b) => a.sort - b.sort);
      const stack = stackRefs.current[hit.key];
      const place = (box: Box | null) => {
        if (!box || box.height < 1 || siblings.length === 0) {
          moveRef.current(task.id, column.id, 0);
          return;
        }
        if (pageY <= box.y) {
          moveRef.current(task.id, column.id, 0);
          return;
        }
        if (pageY >= box.y + box.height) {
          moveRef.current(task.id, column.id, siblings.length);
          return;
        }
        const ratio = (pageY - box.y) / box.height;
        const index = Math.max(0, Math.min(siblings.length, Math.round(ratio * siblings.length)));
        moveRef.current(task.id, column.id, index);
      };
      if (!stack) {
        place(null);
        return;
      }
      stack.measureInWindow((x, y, width, height) => place({ x, y, width, height }));
    });
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      scrollEnabled={!dragging}
      contentContainerStyle={styles.row}
      style={styles.scroller}>
      {columns.map((column, columnIndex) => {
        const key = column.id ?? 'none';
        const cards = tasks
          .filter((task) => task.section_id === column.id && (showCompleted || task.status === 'open'))
          .sort((a, b) => a.sort - b.sort);
        const sectionIndex = column.id ? columnIndex - 1 : -1;
        return (
          <View
            key={key}
            collapsable={false}
            ref={(node) => {
              columnRefs.current[key] = node;
            }}
            style={[styles.column, { backgroundColor: paper.surface, borderColor: paper.line }]}>
            <Text style={{ color: paper.text, fontFamily: 'Georgia', fontSize: 16 }}>{column.name}</Text>
            {column.id ? (
              <View style={styles.tools}>
                <Pressable
                  disabled={sectionIndex <= 0}
                  onPress={() => onShiftSection(column.id as string, -1)}
                  style={[styles.tool, { borderColor: paper.text, opacity: sectionIndex <= 0 ? 0.35 : 1 }]}>
                  <Text style={[styles.toolText, { color: paper.text }]}>Left</Text>
                </Pressable>
                <Pressable
                  disabled={sectionIndex >= sections.length - 1}
                  onPress={() => onShiftSection(column.id as string, 1)}
                  style={[styles.tool, { borderColor: paper.text, opacity: sectionIndex >= sections.length - 1 ? 0.35 : 1 }]}>
                  <Text style={[styles.toolText, { color: paper.text }]}>Right</Text>
                </Pressable>
                <Pressable onPress={() => onRenameRequest(column.id as string)} style={[styles.tool, { borderColor: paper.text }]}>
                  <Text style={[styles.toolText, { color: paper.text }]}>Rename</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(column.name, 'Delete this section? Its tasks move to No section.', [
                      { text: 'Keep', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => onDeleteSection(column.id as string) },
                    ])
                  }
                  style={[styles.tool, { borderColor: paper.text }]}>
                  <Text style={[styles.toolText, { color: paper.text }]}>Delete</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: paper.muted, fontFamily: 'Georgia', fontSize: 12 }}>
                {sections.length === 0 ? 'Add a section when you want more than one column.' : 'These tasks are not in a section.'}
              </Text>
            )}
            <View
              collapsable={false}
              ref={(node) => {
                stackRefs.current[key] = node;
              }}
              style={styles.stack}>
              {cards.map((task) => (
                <DraggableCard
                  key={task.id}
                  task={task}
                  paper={paper}
                  accent={accent}
                  dimmed={task.status === 'completed'}
                  marked={picked.includes(task.id)}
                  selecting={selecting}
                  onOpen={() => onOpen(task.id)}
                  onDrag={setDragging}
                  onDrop={(x, y) => drop(task, x, y)}
                />
              ))}
            </View>
            <Pressable onPress={() => onAddTask(column.id)} style={styles.addTask}>
              <Text style={{ color: accent, fontFamily: 'Georgia' }}>Add task</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable style={[styles.column, { borderColor: paper.line, backgroundColor: 'transparent' }]} onPress={onRequestAdd}>
        <Text style={{ color: accent, fontFamily: 'Georgia', fontSize: 16 }}>Add section</Text>
      </Pressable>
    </ScrollView>
  );
}

function DraggableCard({
  task,
  paper,
  accent,
  dimmed,
  marked,
  selecting,
  onOpen,
  onDrop,
  onDrag,
}: {
  task: TaskRow;
  paper: Paper;
  accent: string;
  dimmed: boolean;
  marked: boolean;
  selecting: boolean;
  onOpen: () => void;
  onDrop: (pageX: number, pageY: number) => void;
  onDrag: (active: boolean) => void;
}) {
  const dropRef = useRef(onDrop);
  const openRef = useRef(onOpen);
  const dragRef = useRef(onDrag);
  const selectingRef = useRef(selecting);
  dropRef.current = onDrop;
  openRef.current = onOpen;
  dragRef.current = onDrag;
  selectingRef.current = selecting;
  const [offset, setOffset] = useState({ x: 0, y: 0, active: false });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !selectingRef.current,
      onMoveShouldSetPanResponderCapture: () => !selectingRef.current,
      onPanResponderGrant: () => {
        dragRef.current(true);
        setOffset({ x: 0, y: 0, active: true });
      },
      onPanResponderMove: (_, gesture) => setOffset({ x: gesture.dx, y: gesture.dy, active: true }),
      onPanResponderRelease: (_, gesture) => {
        dragRef.current(false);
        setOffset({ x: 0, y: 0, active: false });
        if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
          openRef.current();
          return;
        }
        dropRef.current(gesture.moveX, gesture.moveY);
      },
      onPanResponderTerminate: () => {
        dragRef.current(false);
        setOffset({ x: 0, y: 0, active: false });
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View
      collapsable={false}
      {...(selecting ? {} : responder.panHandlers)}
      style={{
        opacity: dimmed ? 0.45 : 1,
        zIndex: offset.active ? 4 : 0,
        transform: [{ translateX: offset.x }, { translateY: offset.y }],
      }}>
      {selecting ? (
        <Pressable onPress={onOpen} style={[styles.card, { borderColor: task.priority > 0 ? taskInk(task.priority, paper) : accent, backgroundColor: marked ? paper.text : 'transparent' }]}>
          <WaveRule color={marked ? paper.bg : paper.text} inset={10} />
          <Text style={{ color: marked ? paper.bg : taskInk(task.priority, paper), fontFamily: 'Georgia' }}>{task.title}</Text>
        </Pressable>
      ) : (
        <View style={[styles.card, { borderColor: task.priority > 0 ? taskInk(task.priority, paper) : accent, backgroundColor: marked ? paper.text : 'transparent' }]}>
          <WaveRule color={marked ? paper.bg : paper.text} inset={10} />
          <Text style={{ color: marked ? paper.bg : taskInk(task.priority, paper), fontFamily: 'Georgia' }}>{task.title}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: { flex: 1 },
  row: { gap: 12, paddingVertical: 8, alignItems: 'flex-start' },
  column: {
    width: 230,
    borderWidth: 1,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRadius: 20,
    padding: 10,
    gap: 8,
    minHeight: 220,
  },
  stack: { gap: 8 },
  addTask: { minHeight: 44, justifyContent: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { fontFamily: 'Georgia', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRadius: 20,
    padding: 10,
    paddingTop: 20,
    minHeight: 44,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
