export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export type ClockParts = { hour: number; minute: number; period: 'AM' | 'PM' };

function wallClock(totalMinutes: number): ClockParts {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period: ClockParts['period'] = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, minute, period };
}

export function clockLabel(minutes: number): string {
  const parts = wallClock(minutes);
  return `${parts.hour}:${String(parts.minute).padStart(2, '0')} ${parts.period}`;
}

export function formatTime(date: Date): string {
  return clockLabel(date.getHours() * 60 + date.getMinutes());
}

export function parseClock(value: string): number | null {
  const text = value.trim();
  const twelve = /^(\d{1,2}):(\d{2}) *([AaPp][Mm])$/.exec(text);
  if (twelve) {
    const hours = Number(twelve[1]);
    const mins = Number(twelve[2]);
    if (hours < 1 || hours > 12 || mins > 59) return null;
    const pm = twelve[3].toUpperCase() === 'PM';
    const hour24 = hours === 12 ? (pm ? 12 : 0) : hours + (pm ? 12 : 0);
    return hour24 * 60 + mins;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

// An empty or unreadable clock opens at 9:00 AM. 12 AM is midnight and 12 PM is noon.
export function clockToParts(value: string): ClockParts {
  const total = parseClock(value);
  return wallClock(total == null ? 9 * 60 : total);
}

function canonicalClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function partsToClock(parts: ClockParts): string {
  const hour12 = parts.hour === 12 ? 0 : parts.hour;
  const hour24 = parts.period === 'PM' ? hour12 + 12 : hour12;
  return canonicalClock(hour24 * 60 + parts.minute);
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
