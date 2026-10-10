import { atLocalMinutes, readDue } from './time.ts';

export function reminderInstant(input: {
  dueAt: string | null;
  allDay: boolean;
  offsetMinutes: number | null;
}): Date | null {
  if (input.dueAt == null || input.offsetMinutes == null) return null;
  if (input.allDay) return atLocalMinutes(readDue(input.dueAt, true), 9 * 60);
  const due = readDue(input.dueAt, false);
  return new Date(due.getTime() - input.offsetMinutes * 60 * 1000);
}
