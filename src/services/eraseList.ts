import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteList, getLists, getSettings, listTasks, updateSettings } from '@/db';
import { removeTaskEvent } from '@/services/calendarDevice';
import { cancelNotification } from '@/services/notifications';

// Deletes one list after its reminders and linked events are cleared.
// Inbox stays. A list that is the default for new tasks is replaced by Inbox.
export async function eraseList(db: SQLiteDatabase, id: string): Promise<void> {
  const lists = await getLists(db);
  const list = lists.find((item) => item.id === id);
  if (!list) throw new Error('List not found.');
  if (list.is_inbox === 1) throw new Error('Inbox cannot be deleted.');
  const tasks = await listTasks(db, { listId: id, status: 'all' });
  for (const task of tasks) {
    await cancelNotification(task.notification_id);
    if (task.calendar_event_id) await removeTaskEvent(task.calendar_event_id).catch(() => undefined);
  }
  const settings = await getSettings(db);
  if (settings.default_list_id === id) {
    const inbox = lists.find((item) => item.is_inbox === 1);
    if (inbox) await updateSettings(db, { default_list_id: inbox.id });
  }
  await deleteList(db, id);
}
