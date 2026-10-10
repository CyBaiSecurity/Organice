import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId } from '../../src/domain/id.ts';

test('newId returns a uuid', () => {
  const id = newId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(newId(), newId());
});
