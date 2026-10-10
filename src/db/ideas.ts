import type { SQLiteDatabase } from 'expo-sqlite';

import { applyReviewImport, buildIdeasFile, parseIdeasFile, statusAfterReviewDeleted, type IdeaExport } from '../domain/ideasFile.ts';
import { LIMITS, cleanText, requireText } from '../domain/limits.ts';
import { newId } from '../domain/id.ts';
import { nowIso } from '../domain/time.ts';
import { insertTask } from './tasks.ts';
import type { IdeaDetail, IdeaRow } from './types.ts';
import { assertRoom } from './util.ts';

export async function listIdeas(db: SQLiteDatabase): Promise<IdeaRow[]> {
  return db.getAllAsync<IdeaRow>('SELECT * FROM idea ORDER BY updated_at DESC, id DESC');
}

export async function getIdea(db: SQLiteDatabase, id: string): Promise<IdeaDetail | null> {
  return db.getFirstAsync<IdeaDetail>(
    `SELECT idea.id, idea.title, idea.body, idea.status, idea.task_id, idea.created_at, idea.updated_at,
            idea_review.text AS review_text, idea_review.reviewed_at AS reviewed_at
     FROM idea
     LEFT JOIN idea_review ON idea_review.idea_id = idea.id
     WHERE idea.id = ?`,
    id,
  );
}

export async function createIdea(
  db: SQLiteDatabase,
  input: { title: string; body?: string | null },
): Promise<IdeaRow> {
  const title = requireText(input.title, LIMITS.title);
  const body = cleanText(input.body ?? '', LIMITS.notes);
  let created: IdeaRow | null = null;
  await db.withTransactionAsync(async () => {
    await assertRoom(db, 'SELECT COUNT(*) AS n FROM idea', LIMITS.ideas, 'ideas');
    const id = newId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO idea (id, title, body, status, task_id, created_at, updated_at)
       VALUES (?, ?, ?, 'raw', NULL, ?, ?)`,
      id,
      title,
      body,
      now,
      now,
    );
    created = await db.getFirstAsync<IdeaRow>('SELECT * FROM idea WHERE id = ?', id);
  });
  if (!created) throw new Error('Idea was not saved.');
  return created;
}

export async function updateIdea(
  db: SQLiteDatabase,
  id: string,
  patch: { title?: string; body?: string | null },
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM idea WHERE id = ?', id);
  if (!existing) throw new Error('Idea not found.');
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(requireText(patch.title, LIMITS.title));
  }
  if (patch.body !== undefined) {
    sets.push('body = ?');
    params.push(cleanText(patch.body ?? '', LIMITS.notes));
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.runAsync(`UPDATE idea SET ${sets.join(', ')} WHERE id = ?`, ...params);
}

export async function deleteIdea(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM idea WHERE id = ?', id);
  if (result.changes === 0) throw new Error('Idea not found.');
}

export async function compileIdeas(db: SQLiteDatabase, ideaIds: string[], listId: string): Promise<void> {
  const list = await db.getFirstAsync<{ id: string }>('SELECT id FROM list WHERE id = ?', listId);
  if (!list) throw new Error('List not found.');
  await db.withTransactionAsync(async () => {
    for (const ideaId of ideaIds) {
      const idea = await db.getFirstAsync<IdeaRow>('SELECT * FROM idea WHERE id = ?', ideaId);
      if (!idea) throw new Error('Idea not found.');
      const task = await insertTask(db, {
        list_id: listId,
        title: idea.title,
        notes: idea.body,
      });
      await db.runAsync(
        `UPDATE idea SET status = 'compiled', task_id = ?, updated_at = ? WHERE id = ?`,
        task.id,
        nowIso(),
        idea.id,
      );
    }
  });
}

export async function exportIdeas(db: SQLiteDatabase, ids: string[] | null): Promise<IdeaExport[]> {
  const ideas = await loadExports(db, ids);
  return buildIdeasFile(ideas, nowIso()).ideas;
}

export async function importReviews(
  db: SQLiteDatabase,
  fileText: string,
): Promise<{ error: string } | { updated: number; skipped: number }> {
  const parsed = parseIdeasFile(fileText);
  if (!parsed.ok) return { error: parsed.error };
  const local = await loadExports(db, null);
  const applied = applyReviewImport(local, parsed.file);
  const before = new Map(local.map((idea) => [idea.id, idea]));
  await db.withTransactionAsync(async () => {
    for (const idea of applied.ideas) {
      const previous = before.get(idea.id);
      if (!previous || idea.review == null) continue;
      const same =
        previous.status === idea.status &&
        previous.review?.text === idea.review.text &&
        previous.review?.reviewedAt === idea.review.reviewedAt;
      if (same) continue;
      await db.runAsync(
        `INSERT INTO idea_review (idea_id, text, reviewed_at) VALUES (?, ?, ?)
         ON CONFLICT(idea_id) DO UPDATE SET text = excluded.text, reviewed_at = excluded.reviewed_at`,
        idea.id,
        idea.review.text,
        idea.review.reviewedAt,
      );
      await db.runAsync('UPDATE idea SET status = ? WHERE id = ?', idea.status, idea.id);
    }
  });
  return { updated: applied.updated, skipped: applied.skipped };
}

export async function deleteReview(db: SQLiteDatabase, ideaId: string): Promise<void> {
  const idea = await db.getFirstAsync<{ task_id: string | null }>('SELECT task_id FROM idea WHERE id = ?', ideaId);
  if (!idea) throw new Error('Idea not found.');
  const status = statusAfterReviewDeleted(idea.task_id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM idea_review WHERE idea_id = ?', ideaId);
    await db.runAsync('UPDATE idea SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), ideaId);
  });
}

async function loadExports(db: SQLiteDatabase, ids: string[] | null): Promise<IdeaExport[]> {
  const rows = await db.getAllAsync<IdeaDetail>(
    `SELECT idea.id, idea.title, idea.body, idea.status, idea.task_id, idea.created_at, idea.updated_at,
            idea_review.text AS review_text, idea_review.reviewed_at AS reviewed_at
     FROM idea
     LEFT JOIN idea_review ON idea_review.idea_id = idea.id
     ORDER BY idea.updated_at DESC, idea.id DESC`,
  );
  const mapped = rows.map(toExport);
  if (ids == null) return mapped;
  const byId = new Map(mapped.map((idea) => [idea.id, idea]));
  const selected: IdeaExport[] = [];
  for (const id of ids) {
    const idea = byId.get(id);
    if (idea) selected.push(idea);
  }
  return selected;
}

function toExport(row: IdeaDetail): IdeaExport {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    taskId: row.task_id,
    updatedAt: row.updated_at,
    review:
      row.review_text == null || row.reviewed_at == null
        ? null
        : { text: row.review_text, reviewedAt: row.reviewed_at },
  };
}
