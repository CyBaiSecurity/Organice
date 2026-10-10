import type { SQLiteDatabase } from 'expo-sqlite';

import { LIMITS, cleanText, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import { nowIso } from '../domain/time.ts';
import type { ListRow, ListView } from './types.ts';
import { assertRoom } from './util.ts';

const VIEWS: readonly ListView[] = ['list', 'board', 'timeline'];

export async function getLists(db: SQLiteDatabase): Promise<ListRow[]> {
  return db.getAllAsync<ListRow>('SELECT * FROM list ORDER BY sort ASC, created_at ASC, id ASC');
}

export async function createList(
  db: SQLiteDatabase,
  input: { name: string; accent: string },
): Promise<ListRow> {
  const name = requireText(input.name, LIMITS.title);
  const accent = cleanText(input.accent, LIMITS.title);
  if (accent.length === 0) throw new Error('An accent is required.');
  let created: ListRow | null = null;
  await db.withTransactionAsync(async () => {
    await assertRoom(db, 'SELECT COUNT(*) AS n FROM list', LIMITS.lists, 'lists');
    const sort = (await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort), -1) AS n FROM list'))?.n;
    const id = newId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO list (id, name, accent, view, sort, is_inbox, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      accent,
      'list',
      Number(sort ?? -1) + 1,
      0,
      now,
      now,
    );
    created = await db.getFirstAsync<ListRow>('SELECT * FROM list WHERE id = ?', id);
  });
  if (!created) throw new Error('List was not saved.');
  return created;
}

export async function renameList(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  const list = await requireList(db, id);
  if (list.is_inbox === 1) throw new Error('Inbox cannot be renamed.');
  const next = requireText(name, LIMITS.title);
  await db.runAsync('UPDATE list SET name = ?, updated_at = ? WHERE id = ?', next, nowIso(), id);
}

export async function setListView(db: SQLiteDatabase, id: string, view: ListView): Promise<void> {
  await requireList(db, id);
  if (!VIEWS.includes(view)) throw new Error('The list view must be list, board, or timeline.');
  await db.runAsync('UPDATE list SET view = ?, updated_at = ? WHERE id = ?', view, nowIso(), id);
}

export async function deleteList(db: SQLiteDatabase, id: string): Promise<void> {
  const list = await requireList(db, id);
  if (list.is_inbox === 1) throw new Error('Inbox cannot be deleted.');
  await db.runAsync('DELETE FROM list WHERE id = ?', id);
}

export async function reorderLists(db: SQLiteDatabase, ids: string[]): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < ids.length; index += 1) {
      const result = await db.runAsync(
        'UPDATE list SET sort = ?, updated_at = ? WHERE id = ?',
        index,
        now,
        ids[index],
      );
      if (result.changes === 0) throw new Error('List not found.');
    }
  });
}

async function requireList(db: SQLiteDatabase, id: string): Promise<ListRow> {
  const list = await db.getFirstAsync<ListRow>('SELECT * FROM list WHERE id = ?', id);
  if (!list) throw new Error('List not found.');
  return list;
}
