import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { MIGRATION_SQL } from '../../src/db/migrate.ts';

test('migration SQL creates the tables and does not seed the inbox', () => {
  assert.equal(MIGRATION_SQL.includes('Inbox'), false);
  assert.equal(/insert\s+into\s+list/i.test(MIGRATION_SQL), false);
  assert.equal(/insert\s+into\s+settings/i.test(MIGRATION_SQL), false);

  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  let fts = true;
  try {
    db.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(body)');
    db.exec('DROP TABLE fts_probe');
  } catch {
    fts = false;
  }

  if (fts) {
    db.exec(MIGRATION_SQL);
  } else {
    const marker = MIGRATION_SQL.indexOf('CREATE VIRTUAL TABLE task_fts');
    assert.notEqual(marker, -1);
    db.exec(MIGRATION_SQL.slice(0, marker));
  }

  assert.equal(tableExists(db, 'task'), true);
  assert.equal(tableExists(db, 'idea_review'), true);
  if (fts) {
    assert.equal(tableExists(db, 'task_fts'), true);
  }
  db.close();
});

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(name) as
    | { name: string }
    | undefined;
  return row != null;
}
