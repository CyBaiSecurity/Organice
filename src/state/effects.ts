import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettings, getTask, updateSettings, updateTask } from '@/db';
import { reminderInstant } from '@/domain/reminder';
import { readDue } from '@/domain/time';
import { removeTaskEvent, saveTaskEvent } from '@/services/calendarDevice';
import { cancelNotification, scheduleTaskReminder } from '@/services/notifications';

export type TaskRow = {
  id: string;
  list_id: string;
  section_id: string | null;
  title: string;
  notes: string;
  status: 'open' | 'completed';
  priority: number;
  all_day: number;
  start_at: string | null;
  due_at: string | null;
  repeat_kind: string;
  repeat_days: string | null;
  repeat_interval_days: number | null;
  repeat_month_day: number | null;
  reminder_offset_minutes: number | null;
  notification_id: string | null;
  calendar_id: string | null;
  calendar_event_id: string | null;
  sort: number;
  completed_at: string | null;
};

/** Schedules the one reminder and updates a linked calendar event after a task write. */
export async function syncTaskSideEffects(
  db: SQLiteDatabase,
  taskId: string,
  options?: { keepNotification?: boolean },
): Promise<void> {
  const task = (await getTask(db, taskId)) as TaskRow | null;
  if (!task) return;
  const settings = await getSettings(db);
  const keepNotification = options?.keepNotification === true && task.notification_id != null;

  let notificationId: string | null = null;
  let inexact = false;
  if (!keepNotification) {
    await cancelNotification(task.notification_id);
    if (task.status === 'open') {
      const when = reminderInstant({
        dueAt: task.due_at,
        allDay: task.all_day === 1,
        offsetMinutes: task.reminder_offset_minutes,
      });
      if (when && when.getTime() > Date.now()) {
        const scheduled = await scheduleTaskReminder({
          title: task.title,
          when,
          taskId: task.id,
          previousId: null,
        });
        notificationId = scheduled.id;
        inexact = scheduled.inexact;
      }
    }
  }

  let calendarId = task.calendar_id;
  let eventId = task.calendar_event_id;
  if (calendarId && eventId) {
    const span = eventSpan(task);
    if (span) {
      const saved = await saveTaskEvent({
        calendarId,
        existingEventId: eventId,
        title: task.title,
        notes: task.notes,
        start: span.start,
        end: span.end,
        allDay: task.all_day === 1,
      });
      calendarId = saved.calendarId;
      eventId = saved.eventId;
    }
  }

  await updateTask(db, taskId, {
    ...(keepNotification ? {} : { notification_id: notificationId }),
    calendar_id: calendarId,
    calendar_event_id: eventId,
  });
  if (inexact && Number(settings.reminders_inexact) !== 1) {
    await updateSettings(db, { reminders_inexact: 1 });
  }
}

export function eventSpan(task: TaskRow): { start: Date; end: Date } | null {
  if (task.all_day === 1 && task.due_at) {
    const start = readDue(task.due_at, true);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (task.start_at && task.due_at) {
    return { start: new Date(task.start_at), end: new Date(task.due_at) };
  }
  return null;
}

export async function unlinkCalendar(db: SQLiteDatabase, task: TaskRow): Promise<void> {
  if (task.calendar_event_id) {
    await removeTaskEvent(task.calendar_event_id);
  }
  await updateTask(db, task.id, { calendar_id: null, calendar_event_id: null });
}
