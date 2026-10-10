import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakForCompletedFocus, cycleAfterAbandon, cycleAfterBreak } from '../../src/domain/focusCycle.ts';

test('every 4 focus sessions ends in a long break that resets the count', () => {
  const kinds: string[] = [];
  const counts: number[] = [];
  let count = 0;
  for (let index = 0; index < 4; index += 1) {
    const step = breakForCompletedFocus(count, 4);
    kinds.push(step.breakKind);
    counts.push(step.cycleCount);
    count = cycleAfterBreak(step.breakKind, step.cycleCount);
  }
  assert.deepEqual(kinds, ['short', 'short', 'short', 'long']);
  assert.deepEqual(counts, [1, 2, 3, 4]);
  assert.equal(count, 0);
  assert.equal(cycleAfterBreak('short', 2), 2);
  assert.equal(cycleAfterAbandon(), 0);
});
