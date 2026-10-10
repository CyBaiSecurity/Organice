export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function clockLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export type ClockParts = { hour: number; minute: number; period: 'AM' | 'PM' };

// An empty or unreadable clock opens at 9:00 AM. 12 AM is midnight and 12 PM is noon.
export function clockToParts(value: string): ClockParts {
  const total = parseClock(value);
  const minutes = total == null ? 9 * 60 : total;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period: ClockParts['period'] = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, minute, period };
}

export function partsToClock(parts: ClockParts): string {
  const hour12 = parts.hour === 12 ? 0 : parts.hour;
  const hour24 = parts.period === 'PM' ? hour12 + 12 : hour12;
  return clockLabel(hour24 * 60 + parts.minute);
}

export function dateKeyInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function combineDateAndTime(dateKey: string, minutes: number | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (minutes != null) date.setMinutes(minutes);
  return date;
}
