import type { SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import type { ChecklistRow } from './types.ts';
import { assertRoom } from './util.ts';

export async function listChecklist(db: SQLiteDatabase, taskId: string): Promise<ChecklistRow[]> {
  return db.getAllAsync<ChecklistRow>(
    'SELECT * FROM checklist_item WHERE task_id = ? ORDER BY sort ASC, id ASC',
    taskId,
  );
}

export async function addChecklistItem(
  db: SQLiteDatabase,
  taskId: string,
  title: string,
): Promise<ChecklistRow> {
  const text = requireText(title, LIMITS.title);
  const task = await db.getFirstAsync<{ id: string }>('SELECT id FROM task WHERE id = ?', taskId);
  if (!task) throw new Error('Task not found.');
  let created: ChecklistRow | null = null;
  await db.withTransactionAsync(async () => {
    await assertRoom(
      db,
      'SELECT COUNT(*) AS n FROM checklist_item WHERE task_id = ?',
      LIMITS.checklist,
      'checklist',
      taskId,
    );
    const sortRow = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(sort), -1) AS n FROM checklist_item WHERE task_id = ?',
      taskId,
    );
    const id = newId();
    await db.runAsync(
      'INSERT INTO checklist_item (id, task_id, title, done, sort) VALUES (?, ?, ?, ?, ?)',
      id,
      taskId,
      text,
      0,
      Number(sortRow?.n ?? -1) + 1,
    );
    created = await db.getFirstAsync<ChecklistRow>('SELECT * FROM checklist_item WHERE id = ?', id);
  });
  if (!created) throw new Error('Checklist line was not saved.');
  return created;
}

export async function setChecklistDone(db: SQLiteDatabase, id: string, done: number): Promise<void> {
  if (done !== 0 && done !== 1) throw new Error('A checklist line is either done or not.');
  const result = await db.runAsync('UPDATE checklist_item SET done = ? WHERE id = ?', done, id);
  if (result.changes === 0) throw new Error('Checklist line not found.');
}

export async function deleteChecklistItem(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM checklist_item WHERE id = ?', id);
  if (result.changes === 0) throw new Error('Checklist line not found.');
}

export async function reorderChecklist(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < ids.length; index += 1) {
      const result = await db.runAsync('UPDATE checklist_item SET sort = ? WHERE id = ?', index, ids[index]);
      if (result.changes === 0) throw new Error('Checklist line not found.');
    }
  });
}
