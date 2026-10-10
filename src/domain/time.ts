export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(key: string): Date {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function isoWeekday(date: Date): number {
  const day = date.getDay();
  if (day === 0) return 7;
  return day;
}

// Every calendar row uses this order. Sunday is column 0. The stored habit
// number stays on the ISO scale, where Monday is 1 and Sunday is 7.
export const WEEK_LABELS = [
  { iso: 7, label: 'Sun' },
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
] as const;

export function weekdayShort(date: Date): string {
  return WEEK_LABELS[date.getDay()]?.label ?? '';
}

export function startOfWeek(date: Date): Date {
  return addLocalDays(startOfLocalDay(date), -date.getDay());
}

export function weekContaining(date: Date): Date[] {
  const sunday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(sunday, index));
}

export function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addLocalDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addLocalDays(start, index));
}

// Expo notifications count 1 as Sunday. ISO weekdays count 1 as Monday.
export function notificationWeekday(iso: number): number {
  return (iso % 7) + 1;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function atLocalMinutes(day: Date, minutes: number): Date {
  const whole = Math.trunc(minutes);
  const days = Math.floor(whole / 1440);
  const remainder = whole - days * 1440;
  const result = addLocalDays(startOfLocalDay(day), days);
  result.setHours(Math.floor(remainder / 60), remainder % 60, 0, 0);
  return result;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): boolean {
  return DATE_KEY.test(value);
}

export function storedDue(date: Date, allDay: boolean): string {
  if (allDay) return localDateKey(date);
  return date.toISOString();
}

export function readDue(stored: string, allDay: boolean): Date {
  if (allDay) return parseLocalDateKey(stored.slice(0, 10));
  return new Date(stored);
}
