import type { SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import { nowIso } from '../domain/time.ts';
import type { SectionRow } from './types.ts';
import { assertRoom } from './util.ts';

export async function listSections(db: SQLiteDatabase, listId: string): Promise<SectionRow[]> {
  return db.getAllAsync<SectionRow>(
    'SELECT * FROM section WHERE list_id = ? ORDER BY sort ASC, created_at ASC, id ASC',
    listId,
  );
}

export async function createSection(db: SQLiteDatabase, listId: string, name: string): Promise<SectionRow> {
  const title = requireText(name, LIMITS.title);
  const list = await db.getFirstAsync<{ id: string }>('SELECT id FROM list WHERE id = ?', listId);
  if (!list) throw new Error('List not found.');
  let created: SectionRow | null = null;
  await db.withTransactionAsync(async () => {
    await assertRoom(
      db,
      'SELECT COUNT(*) AS n FROM section WHERE list_id = ?',
      LIMITS.sectionsPerList,
      'sections',
      listId,
    );
    const sortRow = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(sort), -1) AS n FROM section WHERE list_id = ?',
      listId,
    );
    const id = newId();
    await db.runAsync(
      'INSERT INTO section (id, list_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      listId,
      title,
      Number(sortRow?.n ?? -1) + 1,
      nowIso(),
    );
    created = await db.getFirstAsync<SectionRow>('SELECT * FROM section WHERE id = ?', id);
  });
  if (!created) throw new Error('Section was not saved.');
  return created;
}

export async function renameSection(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  const title = requireText(name, LIMITS.title);
  const result = await db.runAsync('UPDATE section SET name = ? WHERE id = ?', title, id);
  if (result.changes === 0) throw new Error('Section not found.');
}

export async function deleteSection(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM section WHERE id = ?', id);
  if (result.changes === 0) throw new Error('Section not found.');
}

export async function reorderSections(db: SQLiteDatabase, ids: string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < ids.length; index += 1) {
      const result = await db.runAsync('UPDATE section SET sort = ? WHERE id = ?', index, ids[index]);
      if (result.changes === 0) throw new Error('Section not found.');
    }
  });
}
