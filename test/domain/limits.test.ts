import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, cleanText, requireText } from '../../src/domain/limits.ts';

test('cleanText trims before it slices', () => {
  assert.equal(cleanText('  abcdef  ', 3), 'abc');
  assert.equal(cleanText('  hi  ', 10), 'hi');
});

test('requireText rejects an empty title', () => {
  assert.equal(requireText('  hello  ', LIMITS.title), 'hello');
  assert.throws(() => requireText('   ', 10), { message: 'Title is required' });
});
