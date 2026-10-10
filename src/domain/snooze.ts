import { addLocalDays, atLocalMinutes } from './time.ts';

export type SnoozeChoice = '10m' | '1h' | 'tomorrow';

export function snoozedAt(choice: SnoozeChoice, now: Date, workStartMinute: number): Date {
  if (choice === '10m') return new Date(now.getTime() + 10 * 60 * 1000);
  if (choice === '1h') return new Date(now.getTime() + 60 * 60 * 1000);
  return atLocalMinutes(addLocalDays(now, 1), workStartMinute);
}
