import { LIMITS } from './limits.ts';

export function breakForCompletedFocus(
  cycleCount: number,
  every: number,
): { breakKind: 'short' | 'long'; cycleCount: number } {
  const clamped = clampEvery(every);
  const next = cycleCount + 1;
  const breakKind = next % clamped === 0 ? 'long' : 'short';
  return { breakKind, cycleCount: next };
}

export function cycleAfterBreak(breakKind: 'short' | 'long', cycleCount: number): number {
  if (breakKind === 'long') return 0;
  return cycleCount;
}

export function cycleAfterAbandon(): number {
  return 0;
}

function clampEvery(every: number): number {
  if (!Number.isFinite(every)) return LIMITS.longBreakEveryMin;
  const whole = Math.trunc(every);
  if (whole < LIMITS.longBreakEveryMin) return LIMITS.longBreakEveryMin;
  if (whole > LIMITS.longBreakEveryMax) return LIMITS.longBreakEveryMax;
  return whole;
}
