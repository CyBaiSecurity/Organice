import { formatTime } from '../state/clock.ts';
import { localDateKey, minutesOfDay, readDue, startOfLocalDay } from './time.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// A task row shows the deadline date and, when the task has a clock time, that time.
// An all-day task is overdue only after its date has passed. A timed task is overdue
// once that clock time has passed.
export function taskSchedule(item: AgendaItem, now: Date): { detail: string; overdue: boolean } | null {
  if (item.kind !== 'task' || item.dueAt == null || item.dueAt === '') return null;
  const due = readDue(item.dueAt, item.allDay);
  if (Number.isNaN(due.getTime())) return null;
  const date = `${MONTHS[due.getMonth()]} ${due.getDate()}`;
  const detail = item.allDay ? `${date}, all day` : `${date}, ${formatTime(due)}`;
  const overdue = item.allDay ? localDateKey(due) < localDateKey(now) : due.getTime() < now.getTime();
  return { detail, overdue };
}

export type AgendaItem = {
  kind: 'task' | 'event';
  id: string;
  title: string;
  allDay: boolean;
  startAt: string | null;
  dueAt: string | null;
  priority?: number;
};

export function splitAgenda(input: {
  items: AgendaItem[];
  now: Date;
  workStartMinute: number;
  workEndMinute: number;
}): { overdue: AgendaItem[]; allDay: AgendaItem[]; inside: AgendaItem[]; outside: AgendaItem[] } {
  const todayStart = startOfLocalDay(input.now);
  const todayKey = localDateKey(todayStart);
  const overdue: AgendaItem[] = [];
  const allDay: AgendaItem[] = [];
  const inside: { item: AgendaItem; at: number }[] = [];
  const outside: { item: AgendaItem; at: number }[] = [];

  for (const item of input.items) {
    const due = readInstant(item.dueAt, item.allDay);
    if (item.kind === 'task' && due !== null && due.getTime() < todayStart.getTime()) {
      overdue.push(item);
      continue;
    }
    if (item.allDay) {
      if (item.kind === 'event' || (due !== null && localDateKey(due) === todayKey)) {
        allDay.push(item);
      }
      continue;
    }
    const scheduled = readInstant(item.startAt ?? item.dueAt, false);
    if (scheduled === null || localDateKey(scheduled) !== todayKey) continue;
    const minute = minutesOfDay(scheduled);
    const placed = { item, at: scheduled.getTime() };
    if (minute >= input.workStartMinute && minute < input.workEndMinute) inside.push(placed);
    else outside.push(placed);
  }

  inside.sort((left, right) => left.at - right.at);
  outside.sort((left, right) => left.at - right.at);
  return {
    overdue,
    allDay,
    inside: inside.map((placed) => placed.item),
    outside: outside.map((placed) => placed.item),
  };
}

function readInstant(stored: string | null, allDay: boolean): Date | null {
  if (stored == null || stored === '') return null;
  const date = readDue(stored, allDay);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
