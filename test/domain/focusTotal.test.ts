import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusSecondsToday } from '../../src/domain/focusTotal.ts';

test('today focus seconds ignore abandoned sessions and other phases', () => {
  const today = new Date(2026, 9, 8, 12, 0, 0, 0);
  const total = focusSecondsToday(
    [
      {
        endedAt: new Date(2026, 9, 8, 9, 0, 0, 0).toISOString(),
        actualSeconds: 100,
        status: 'completed',
        phase: 'focus',
      },
      {
        endedAt: new Date(2026, 9, 8, 11, 0, 0, 0).toISOString(),
        actualSeconds: 50,
        status: 'completed',
        phase: 'focus',
      },
      {
        endedAt: new Date(2026, 9, 8, 12, 0, 0, 0).toISOString(),
        actualSeconds: null,
        status: 'completed',
        phase: 'focus',
      },
      {
        endedAt: new Date(2026, 9, 8, 13, 0, 0, 0).toISOString(),
        actualSeconds: 999,
        status: 'abandoned',
        phase: 'focus',
      },
      {
        endedAt: new Date(2026, 9, 8, 14, 0, 0, 0).toISOString(),
        actualSeconds: 300,
        status: 'completed',
        phase: 'break',
      },
      {
        endedAt: new Date(2026, 9, 7, 23, 0, 0, 0).toISOString(),
        actualSeconds: 400,
        status: 'completed',
        phase: 'focus',
      },
    ],
    today,
  );
  assert.equal(total, 150);
});
