import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clockToParts, partsToClock } from '../../src/state/clock.ts';

test('midnight, noon, and the afternoon convert between 24-hour text and an alarm clock', () => {
  assert.deepEqual(clockToParts('00:00'), { hour: 12, minute: 0, period: 'AM' });
  assert.equal(partsToClock({ hour: 12, minute: 0, period: 'AM' }), '00:00');
  assert.deepEqual(clockToParts('00:30'), { hour: 12, minute: 30, period: 'AM' });
  assert.equal(partsToClock({ hour: 12, minute: 30, period: 'AM' }), '00:30');
  assert.deepEqual(clockToParts('09:05'), { hour: 9, minute: 5, period: 'AM' });
  assert.equal(partsToClock({ hour: 9, minute: 5, period: 'AM' }), '09:05');
  assert.deepEqual(clockToParts('12:00'), { hour: 12, minute: 0, period: 'PM' });
  assert.equal(partsToClock({ hour: 12, minute: 0, period: 'PM' }), '12:00');
  assert.deepEqual(clockToParts('13:15'), { hour: 1, minute: 15, period: 'PM' });
  assert.equal(partsToClock({ hour: 1, minute: 15, period: 'PM' }), '13:15');
  assert.deepEqual(clockToParts('23:59'), { hour: 11, minute: 59, period: 'PM' });
  assert.equal(partsToClock({ hour: 11, minute: 59, period: 'PM' }), '23:59');
});

test('a blank clock opens at 9:00 AM', () => {
  assert.deepEqual(clockToParts(''), { hour: 9, minute: 0, period: 'AM' });
  assert.deepEqual(clockToParts('nope'), { hour: 9, minute: 0, period: 'AM' });
});
