import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyReviewImport,
  buildIdeasFile,
  parseIdeasFile,
  statusAfterReviewDeleted,
  type IdeaExport,
} from '../../src/domain/ideasFile.ts';

function localIdea(review: IdeaExport['review']): IdeaExport {
  return {
    id: 'idea-1',
    title: 'Local title',
    body: 'Local body',
    status: 'compiled',
    taskId: 'task-1',
    updatedAt: '2026-10-01T00:00:00.000Z',
    review,
  };
}

test('a wrong version writes nothing because parsing fails', () => {
  const parsed = parseIdeasFile(
    '{"organice":2,"exportedAt":"2026-10-08T00:00:00.000Z","ideas":[]}',
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal('file' in parsed, false);
  assert.equal(parseIdeasFile('not json').ok, false);
  assert.equal(parseIdeasFile('{"organice":1,"exportedAt":"x"}').ok, false);
});

test('a matching review updates text and status and keeps the title', () => {
  const local = [localIdea({ text: 'old', reviewedAt: '2026-10-01T00:00:00.000Z' })];
  const file = buildIdeasFile(
    [
      {
        id: 'idea-1',
        title: 'File title',
        body: 'File body',
        status: 'raw',
        taskId: 'other-task',
        updatedAt: '2026-10-08T00:00:00.000Z',
        review: { text: 'new review', reviewedAt: '2026-10-08T01:00:00.000Z' },
      },
      {
        id: 'missing',
        title: 'Nope',
        body: '',
        status: 'raw',
        taskId: null,
        updatedAt: '2026-10-08T00:00:00.000Z',
        review: { text: 'ignored', reviewedAt: '2026-10-08T01:00:00.000Z' },
      },
    ],
    '2026-10-08T00:00:00.000Z',
  );
  const result = applyReviewImport(local, file);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].title, 'Local title');
  assert.equal(result.ideas[0].body, 'Local body');
  assert.equal(result.ideas[0].taskId, 'task-1');
  assert.equal(result.ideas[0].status, 'reviewed');
  assert.equal(result.ideas[0].review?.text, 'new review');
  assert.equal(local[0].title, 'Local title');
  assert.equal(local[0].status, 'compiled');
});

test('a null review keeps the old review text', () => {
  const local = [localIdea({ text: 'keep me', reviewedAt: '2026-10-01T00:00:00.000Z' })];
  const file = buildIdeasFile(
    [
      {
        ...localIdea(null),
        title: 'Changed in the file',
      },
    ],
    '2026-10-08T00:00:00.000Z',
  );
  const result = applyReviewImport(local, file);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.ideas[0].review?.text, 'keep me');
  assert.equal(result.ideas[0].title, 'Local title');
  assert.equal(result.ideas[0].status, 'compiled');
});

test('an empty or oversized review is skipped', () => {
  const local = [localIdea(null)];
  const file = buildIdeasFile(
    [
      {
        ...localIdea({ text: '', reviewedAt: '2026-10-08T00:00:00.000Z' }),
      },
      {
        ...localIdea({ text: 'x'.repeat(20001), reviewedAt: '2026-10-08T00:00:00.000Z' }),
      },
    ],
    '2026-10-08T00:00:00.000Z',
  );
  const result = applyReviewImport(local, file);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.ideas[0].review, null);
  assert.equal(result.ideas[0].status, 'compiled');
});

test('unknown fields are ignored and deleting a review restores status', () => {
  const parsed = parseIdeasFile(
    JSON.stringify({
      organice: 1,
      exportedAt: '2026-10-08T00:00:00.000Z',
      note: 'ignore',
      ideas: [
        {
          id: 'idea-1',
          title: 'Title',
          body: 'Body',
          status: 'raw',
          taskId: null,
          updatedAt: '2026-10-08T00:00:00.000Z',
          review: null,
          extra: true,
        },
      ],
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal('note' in parsed.file, false);
    assert.equal('extra' in parsed.file.ideas[0], false);
    assert.equal(parsed.file.ideas[0].title, 'Title');
  }
  assert.equal(statusAfterReviewDeleted('task-1'), 'compiled');
  assert.equal(statusAfterReviewDeleted(''), 'raw');
  assert.equal(statusAfterReviewDeleted(null), 'raw');
});
