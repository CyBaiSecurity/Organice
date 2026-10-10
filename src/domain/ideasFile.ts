import { LIMITS } from './limits.ts';

export type IdeaStatus = 'raw' | 'compiled' | 'reviewed';

export type IdeaExport = {
  id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  taskId: string | null;
  updatedAt: string;
  review: null | { text: string; reviewedAt: string };
};

export type IdeasFile = {
  organice: 1;
  exportedAt: string;
  ideas: IdeaExport[];
};

export function buildIdeasFile(ideas: IdeaExport[], exportedAt: string): IdeasFile {
  return { organice: 1, exportedAt, ideas };
}

export function parseIdeasFile(
  text: string,
): { ok: true; file: IdeasFile } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!isRecord(data)) return { ok: false, error: 'Ideas file must be an object' };
  if (data.organice !== 1) return { ok: false, error: 'Unsupported organice version' };
  if (typeof data.exportedAt !== 'string') return { ok: false, error: 'exportedAt is required' };
  if (!Array.isArray(data.ideas)) return { ok: false, error: 'ideas must be an array' };

  const ideas: IdeaExport[] = [];
  for (const item of data.ideas) {
    const parsed = parseIdea(item);
    if (!parsed.ok) return parsed;
    ideas.push(parsed.idea);
  }
  return { ok: true, file: { organice: 1, exportedAt: data.exportedAt, ideas } };
}

export function applyReviewImport(
  local: IdeaExport[],
  file: IdeasFile,
): { ideas: IdeaExport[]; updated: number; skipped: number } {
  const ideas = local.map((idea) => ({
    ...idea,
    review: idea.review === null ? null : { ...idea.review },
  }));
  const indexById = new Map<string, number>();
  for (let index = 0; index < ideas.length; index += 1) {
    if (!indexById.has(ideas[index].id)) indexById.set(ideas[index].id, index);
  }

  let updated = 0;
  let skipped = 0;
  for (const incoming of file.ideas) {
    const index = indexById.get(incoming.id);
    if (index === undefined) {
      skipped += 1;
      continue;
    }
    if (incoming.review === null) continue;
    const text = incoming.review.text;
    if (typeof text !== 'string' || text.length === 0 || text.length > LIMITS.notes) {
      skipped += 1;
      continue;
    }
    const current = ideas[index];
    ideas[index] = {
      ...current,
      status: 'reviewed',
      review: { text, reviewedAt: incoming.review.reviewedAt },
    };
    updated += 1;
  }
  return { ideas, updated, skipped };
}

export function statusAfterReviewDeleted(taskId: string | null): IdeaStatus {
  if (taskId !== null && taskId.length > 0) return 'compiled';
  return 'raw';
}

function parseIdea(
  value: unknown,
): { ok: true; idea: IdeaExport } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'Idea must be an object' };
  if (typeof value.id !== 'string' || value.id.length === 0) {
    return { ok: false, error: 'Idea id is required' };
  }
  if (typeof value.title !== 'string' || typeof value.body !== 'string') {
    return { ok: false, error: 'Idea title and body must be strings' };
  }
  if (!isStatus(value.status)) return { ok: false, error: 'Idea status is invalid' };
  if (!(value.taskId === null || typeof value.taskId === 'string')) {
    return { ok: false, error: 'Idea taskId is invalid' };
  }
  if (typeof value.updatedAt !== 'string') return { ok: false, error: 'Idea updatedAt is required' };
  const review = parseReview(value.review);
  if (!review.ok) return review;
  return {
    ok: true,
    idea: {
      id: value.id,
      title: value.title,
      body: value.body,
      status: value.status,
      taskId: value.taskId,
      updatedAt: value.updatedAt,
      review: review.review,
    },
  };
}

function parseReview(
  value: unknown,
): { ok: true; review: IdeaExport['review'] } | { ok: false; error: string } {
  if (value === null) return { ok: true, review: null };
  if (!isRecord(value)) return { ok: false, error: 'Idea review is invalid' };
  if (typeof value.text !== 'string' || typeof value.reviewedAt !== 'string') {
    return { ok: false, error: 'Idea review is invalid' };
  }
  return { ok: true, review: { text: value.text, reviewedAt: value.reviewedAt } };
}

function isStatus(value: unknown): value is IdeaStatus {
  return value === 'raw' || value === 'compiled' || value === 'reviewed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
