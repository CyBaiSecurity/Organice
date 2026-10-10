import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ftsQuery } from '../../src/domain/search.ts';

test('a blank search is not a match query', () => {
  assert.equal(ftsQuery(''), null);
  assert.equal(ftsQuery('   '), null);
  assert.equal(ftsQuery('" * "'), null);
});

test('a quote in the input cannot break out of the token', () => {
  const query = ftsQuery('alpha" OR "beta* "secret"');
  assert.equal(query, '"alpha"* "OR"* "beta"* "secret"*');
  assert.match(query ?? '', /^"[^"]*"\*( "[^"]*"\*)*$/);
  assert.equal(query?.includes('" OR "'), false);
});
