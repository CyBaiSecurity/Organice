import { addLocalDays, isoWeekday, startOfLocalDay } from './time.ts';

// One hour is 64 pixels, so a 30-minute task is tall enough for its title.
// Android's calendar uses the same idea: a readable hour row, and a minimum
// event height so a short task can still be tapped.
export const HOUR_HEIGHT = 64;
export const MIN_BLOCK_HEIGHT = 32;
export const HOUR_COUNT = 24;

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type MinuteSpan = { startMin: number; endMin: number };

export type DayBlock = MinuteSpan & {
  id: string;
  top: number;
  height: number;
  lane: number;
  lanes: number;
};

// The week starts on Monday, matching the habit week in the rest of the app.
export function weekContaining(day: Date): Date[] {
  const monday = addLocalDays(startOfLocalDay(day), 1 - isoWeekday(day));
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}

export function dayDelta(from: Date, to: Date): number {
  const start = startOfLocalDay(from).getTime();
  const end = startOfLocalDay(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

// 0 is midnight. The label uses a 12-hour clock because the task editor does.
export function clockLabel(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const hour12 = wrapped % 12 === 0 ? 12 : wrapped % 12;
  return `${hour12} ${wrapped < 12 ? 'AM' : 'PM'}`;
}

// locationY is the tap position inside one hour row.
// The last hour stops at 11:45 so the new 30-minute task stays on this day.
export function createMinutes(hour: number, locationY: number, hourHeight = HOUR_HEIGHT): number {
  const raw = hour * 60 + (locationY / hourHeight) * 60;
  const snapped = Math.round(raw / 15) * 15;
  const floor = hour * 60;
  const ceiling = hour >= 23 ? 23 * 60 + 45 : (hour + 1) * 60;
  return Math.max(floor, Math.min(ceiling, snapped));
}

export function minutesFromDrag(dy: number, hourHeight = HOUR_HEIGHT): number {
  return Math.round(((dy / hourHeight) * 60) / 15) * 15;
}

// Returns the minutes of this task that fall on the local day, or null when
// the task misses that day. The end minute is exclusive, so a task that
// ends at 10:00 does not also occupy 10:00.
export function clipToDay(startMs: number, endMs: number, dayStart: Date): MinuteSpan | null {
  if (!(endMs > startMs)) return null;
  const dayStartMs = startOfLocalDay(dayStart).getTime();
  const dayEndMs = addLocalDays(startOfLocalDay(dayStart), 1).getTime();
  if (!(startMs < dayEndMs && endMs > dayStartMs)) return null;
  const startMin = Math.max(0, (Math.max(startMs, dayStartMs) - dayStartMs) / 60_000);
  const endMin = Math.min(1440, (Math.min(endMs, dayEndMs) - dayStartMs) / 60_000);
  if (endMin - startMin < 1) return null;
  return { startMin, endMin };
}

export function blockTop(startMin: number, hourHeight = HOUR_HEIGHT): number {
  return (startMin / 60) * hourHeight;
}

export function blockHeight(startMin: number, endMin: number, hourHeight = HOUR_HEIGHT): number {
  const raw = ((endMin - startMin) / 60) * hourHeight;
  return Math.max(MIN_BLOCK_HEIGHT, raw) - 2;
}

// Tasks that overlap share the row side by side. A later task reuses a
// column once the earlier one has ended. A task that only touches the next
// start, and does not overlap it, keeps the full width.
export function layoutDayBlocks(items: (MinuteSpan & { id: string })[]): DayBlock[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  type Working = MinuteSpan & { id: string; lane: number };
  const clusters: Working[][] = [];
  let cluster: Working[] = [];
  let clusterEnd = -Infinity;

  function flush() {
    if (cluster.length > 0) clusters.push(cluster);
    cluster = [];
    clusterEnd = -Infinity;
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    const used = new Set(cluster.filter((entry) => entry.endMin > item.startMin).map((entry) => entry.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();

  const blocks: DayBlock[] = [];
  for (const group of clusters) {
    const lanes = group.reduce((max, entry) => Math.max(max, entry.lane + 1), 1);
    for (const entry of group) {
      blocks.push({
        id: entry.id,
        startMin: entry.startMin,
        endMin: entry.endMin,
        top: blockTop(entry.startMin),
        height: blockHeight(entry.startMin, entry.endMin),
        lane: entry.lane,
        lanes,
      });
    }
  }
  return blocks;
}
