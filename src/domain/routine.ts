import {
  ROUTINE_PATTERN_IDS,
  ROUTINE_ROLES,
  type RoutineBlockView,
  type RoutinePatternId,
  type RoutineRole,
} from './routineTemplate.ts';

export {
  previewRoutineTemplate,
  ROUTINE_PATTERNS,
  ROUTINE_PATTERN_IDS,
  ROUTINE_ROLES,
  ROUTINE_TEMPLATE,
} from './routineTemplate.ts';
export type { RoutineBlockView, RoutinePattern, RoutinePatternId, RoutinePreview, RoutineRole } from './routineTemplate.ts';

// Philippines civil time is UTC+8 all year. The shift does not use the machine timezone.
export const ROUTINE_TIME_ZONE = 'Asia/Manila' as const;
export const MANILA_OFFSET_MINUTES = 8 * 60;
export const REMINDER_HORIZON_DAYS = 7;

export const REVIEW_PROMPTS = [
  { field: 'finished', prompt: 'What got finished?' },
  { field: 'attention', prompt: 'What needs attention?' },
  { field: 'crowded', prompt: 'What felt too crowded?' },
] as const;

export const SHORT_WORK_TITLE = 'Optional short work session';
export const SHORT_WORK_INSTRUCTIONS =
  'One finished 15–30 minute task is enough. Use it for focused work. Do not fill the rest of the day.';
export const HOME_LATE_ESSENTIALS =
  'Prioritize food, essential chores, and a short girlfriend check-in. Do not fill the time with work.';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type ManilaParts = {
  dateKey: string;
  minute: number;
  isoWeekday: number;
};

export type DayOverrides = {
  noClasses: boolean;
  homeAtMinute: number | null;
  homeLate: boolean;
};

export const NO_DAY_OVERRIDES: DayOverrides = {
  noClasses: false,
  homeAtMinute: null,
  homeLate: false,
};

export type OccurrenceTiming = 'clock' | 'point' | 'resolved' | 'open' | 'suggested';

export type Occurrence = {
  blockId: string | null;
  pattern: RoutinePatternId | null;
  role: RoutineRole | 'short-work';
  title: string;
  instructions: string;
  startMinute: number | null;
  endMinute: number | null;
  // Half-open [activeStartMinute, activeEndMinute). Null when the block has no clock yet.
  activeStartMinute: number | null;
  activeEndMinute: number | null;
  timing: OccurrenceTiming;
  synthetic: boolean;
};

export type DayPlan = {
  dateKey: string;
  isoWeekday: number;
  minute: number;
  occurrences: Occurrence[];
  current: Occurrence | null;
  next: Occurrence | null;
};

export type ReminderOccurrence = {
  blockId: string;
  dateKey: string;
  minute: number;
  firesAt: string;
  title: string;
  role: RoutineRole;
};

export function isRoutineRole(value: string): value is RoutineRole {
  return (ROUTINE_ROLES as readonly string[]).includes(value);
}

export function isRoutinePattern(value: string): value is RoutinePatternId {
  return (ROUTINE_PATTERN_IDS as readonly string[]).includes(value);
}

export function manilaParts(instant: Date): ManilaParts {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new Error('The time is not valid.');
  }
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const dateKey = padDate(year, month, day);
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { dateKey, minute, isoWeekday: jsDayToIso(shifted.getUTCDay()) };
}

export function manilaDateKey(instant: Date): string {
  return manilaParts(instant).dateKey;
}

export function manilaMinuteOfDay(instant: Date): number {
  return manilaParts(instant).minute;
}

export function manilaWeekday(instant: Date): number {
  return manilaParts(instant).isoWeekday;
}

export function isRealDateKey(value: string): boolean {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function requireDateKey(value: string): string {
  if (!isRealDateKey(value)) throw new Error('The date is not valid.');
  return value;
}

export function dateKeyWeekday(dateKey: string): number {
  const key = requireDateKey(dateKey);
  const probe = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))));
  return jsDayToIso(probe.getUTCDay());
}

export function addDateDays(dateKey: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('The date is not valid.');
  const key = requireDateKey(dateKey);
  const probe = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + days));
  return padDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
}

// Monday–Sunday review weeks are named by the Sunday that ends them.
// Habit stats still start a week on Sunday. This function does not use that rule.
export function weekEndingSunday(dateKey: string): string {
  const weekday = dateKeyWeekday(dateKey);
  const untilSunday = weekday === 7 ? 0 : 7 - weekday;
  return addDateDays(dateKey, untilSunday);
}

export function manilaInstant(dateKey: string, minuteOfDay: number): Date {
  const key = requireDateKey(dateKey);
  const minute = requireMinute(minuteOfDay);
  const utc = Date.UTC(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
    0,
    minute,
  );
  return new Date(utc - MANILA_OFFSET_MINUTES * 60_000);
}

export function formatWeekdays(days: readonly number[]): string {
  if (!Array.isArray(days) || days.length === 0) throw new Error('Pick at least one weekday.');
  const parsed: number[] = [];
  for (const day of days) {
    if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error('Weekdays must be 1 through 7.');
    parsed.push(day);
  }
  return [...new Set(parsed)].sort((left, right) => left - right).join(',');
}

export function parseWeekdays(stored: string): number[] {
  if (typeof stored !== 'string' || stored.trim() === '') throw new Error('Pick at least one weekday.');
  const days = stored.split(',').map((part) => Number(part.trim()));
  return formatWeekdays(days).split(',').map((part) => Number(part));
}

export function requireMinute(value: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1439) {
    throw new Error('The minute is not valid.');
  }
  return value;
}

export function optionalMinute(value: number | null): number | null {
  if (value == null) return null;
  return requireMinute(value);
}

export function assertClockWindow(start: number | null, end: number | null): void {
  if (end == null) return;
  if (start == null || end <= start) throw new Error('The end must be after the start.');
}

export type StoredBlock = {
  id: string;
  pattern: string;
  weekdays: string;
  sort: number;
  title: string;
  instructions: string;
  start_minute: number | null;
  end_minute: number | null;
  role: string;
  enabled: number;
  remind: number;
};

export function toRoutineBlockView(row: StoredBlock): RoutineBlockView {
  if (!isRoutinePattern(row.pattern)) throw new Error('Pattern is not valid.');
  if (!isRoutineRole(row.role)) throw new Error('Role is not valid.');
  return {
    id: row.id,
    pattern: row.pattern,
    weekdays: parseWeekdays(row.weekdays),
    sort: row.sort,
    title: row.title,
    instructions: row.instructions,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    role: row.role,
    enabled: row.enabled === 1,
    remind: row.remind === 1,
  };
}

export function deriveDay(
  blocks: readonly RoutineBlockView[],
  overrides: DayOverrides,
  now: Date,
  dateKey?: string,
): DayPlan {
  const today = manilaParts(now);
  const key = dateKey == null ? today.dateKey : requireDateKey(dateKey);
  const isoWeekday = dateKeyWeekday(key);
  const minute = key === today.dateKey ? today.minute : key < today.dateKey ? 1440 : -1;
  const homeAt = overrides.homeAtMinute == null ? null : requireMinute(overrides.homeAtMinute);
  const dayOverrides: DayOverrides = {
    noClasses: overrides.noClasses === true,
    homeAtMinute: homeAt,
    homeLate: overrides.homeLate === true,
  };

  const selected = blocks
    .filter((block) => block.enabled && block.weekdays.includes(isoWeekday))
    .slice()
    .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id))
    .map(copyOccurrence);

  let removedSchool = false;
  const visible: Occurrence[] = [];
  for (const occurrence of selected) {
    if (dayOverrides.noClasses && schoolCommuteRemaining(occurrence, minute)) {
      if (!removedSchool && !dayOverrides.homeLate) {
        visible.push(shortWorkOccurrence());
        removedSchool = true;
      } else {
        removedSchool = true;
      }
      continue;
    }
    visible.push(occurrence);
  }

  let occurrences = visible;
  if (dayOverrides.homeLate || dayOverrides.homeAtMinute != null) {
    occurrences = occurrences.filter((occurrence) => !(occurrence.role === 'commute' && occurrence.timing === 'open'));
  }
  if (dayOverrides.homeLate) {
    occurrences = occurrences.filter((occurrence) => occurrence.role !== 'evening');
    const first = occurrences.find((occurrence) => occurrence.role === 'first-hour-at-home');
    if (first) first.instructions = HOME_LATE_ESSENTIALS;
  }
  applyArrival(occurrences, dayOverrides);
  assignActive(occurrences);

  return {
    dateKey: key,
    isoWeekday,
    minute,
    occurrences,
    current: pickCurrent(occurrences, minute),
    next: pickNext(occurrences, minute),
  };
}

// A flexible row has no agreed end. Once a later part is current, that row is earlier
// unless it is the next part. A real end is decided before that, so a future clock
// stays upcoming even when the list order is unusual.
export function occurrenceIsEarlier(plan: DayPlan, item: Occurrence): boolean {
  if (plan.minute >= 1440) return true;
  if (item.role === 'unconfirmed-meeting') return false;
  const end = item.activeEndMinute ?? item.endMinute;
  if (end != null) return end <= plan.minute;
  const current = plan.current;
  if (current == null || item === plan.next) return false;
  const currentIndex = plan.occurrences.indexOf(current);
  const itemIndex = plan.occurrences.indexOf(item);
  return currentIndex >= 0 && itemIndex >= 0 && itemIndex < currentIndex;
}

export function reminderOccurrences(input: {
  blocks: readonly RoutineBlockView[];
  overridesByDate?: Readonly<Record<string, DayOverrides>>;
  now: Date;
  routineEnabled: boolean;
}): ReminderOccurrence[] {
  if (input.routineEnabled !== true) return [];
  const today = manilaDateKey(input.now);
  const overridesByDate = input.overridesByDate ?? {};
  const byId = new Map(input.blocks.map((block) => [block.id, block]));
  const found: ReminderOccurrence[] = [];
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const dateKey = addDateDays(today, offset);
    const overrides = overridesByDate[dateKey] ?? NO_DAY_OVERRIDES;
    const plan = deriveDay(input.blocks, overrides, input.now, dateKey);
    for (const occurrence of plan.occurrences) {
      if (occurrence.blockId == null || occurrence.synthetic || occurrence.startMinute == null) continue;
      if (occurrence.role === 'unconfirmed-meeting' || occurrence.role === 'short-work') continue;
      const block = byId.get(occurrence.blockId);
      if (!block || !block.enabled || !block.remind) continue;
      if (block.role === 'unconfirmed-meeting') continue;
      const firesAt = manilaInstant(dateKey, occurrence.startMinute);
      if (firesAt.getTime() < input.now.getTime()) continue;
      found.push({
        blockId: occurrence.blockId,
        dateKey,
        minute: occurrence.startMinute,
        firesAt: firesAt.toISOString(),
        title: occurrence.title,
        role: block.role,
      });
    }
  }
  found.sort((left, right) => left.firesAt.localeCompare(right.firesAt) || left.blockId.localeCompare(right.blockId));
  return found;
}

function copyOccurrence(block: RoutineBlockView): Occurrence {
  const point = block.startMinute != null && block.endMinute == null;
  const ranged = block.startMinute != null && block.endMinute != null;
  return {
    blockId: block.id,
    pattern: block.pattern,
    role: block.role,
    title: block.title,
    instructions: block.instructions,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    activeStartMinute: null,
    activeEndMinute: null,
    timing: ranged ? 'clock' : point ? 'point' : 'open',
    synthetic: false,
  };
}

function shortWorkOccurrence(): Occurrence {
  return {
    blockId: null,
    pattern: null,
    role: 'short-work',
    title: SHORT_WORK_TITLE,
    instructions: SHORT_WORK_INSTRUCTIONS,
    startMinute: null,
    endMinute: null,
    activeStartMinute: null,
    activeEndMinute: null,
    timing: 'suggested',
    synthetic: true,
  };
}

function schoolCommuteRemaining(occurrence: Occurrence, minute: number): boolean {
  if (occurrence.role !== 'school' && occurrence.role !== 'commute') return false;
  if (occurrence.endMinute != null) return minute < occurrence.endMinute;
  return true;
}

function applyArrival(list: Occurrence[], overrides: DayOverrides): void {
  if (overrides.homeAtMinute == null) return;
  const firstIndex = list.findIndex((item) => item.role === 'first-hour-at-home');
  if (firstIndex < 0) return;
  const start = overrides.homeAtMinute;
  const first = list[firstIndex];
  if (first && !arrivalBlocked(list, start)) {
    const end = Math.min(start + 60, nextFixedBoundary(list, start) ?? 1440);
    if (end > start) {
      first.startMinute = start;
      first.endMinute = end;
      first.timing = 'resolved';
    }
  }
  if (overrides.homeLate || first?.endMinute == null) return;
  const eveningIndex = list.findIndex((item) => item.role === 'evening');
  if (eveningIndex < 0) return;
  const eveningStart = first.endMinute;
  const eveningEnd = nextFixedBoundary(list, eveningStart) ?? 1440;
  const evening = list[eveningIndex];
  if (evening && eveningEnd > eveningStart) {
    evening.startMinute = eveningStart;
    evening.endMinute = eveningEnd;
    evening.timing = 'resolved';
  }
}

function nextFixedBoundary(list: Occurrence[], minute: number): number | null {
  let best: number | null = null;
  for (const item of list) {
    if (!item || item.role !== 'fixed') continue;
    if (item.timing !== 'clock' && item.timing !== 'point') continue;
    if (item.startMinute == null || item.startMinute < minute) continue;
    if (best == null || item.startMinute < best) best = item.startMinute;
  }
  return best;
}

function laterTimedStart(list: Occurrence[], afterMinute: number): number | null {
  let best: number | null = null;
  for (const item of list) {
    const start = laterClockStart(item);
    if (start == null || start <= afterMinute) continue;
    if (item.timing === 'resolved') continue;
    if (best == null || start < best) best = start;
  }
  return best;
}

function arrivalBlocked(list: Occurrence[], minute: number): boolean {
  for (const item of list) {
    if (item.role !== 'fixed' || item.startMinute == null || item.startMinute > minute) continue;
    if (item.timing === 'clock' && item.endMinute != null && minute < item.endMinute) return true;
    if (item.timing === 'point' && laterTimedStart(list, item.startMinute) == null) return true;
  }
  return false;
}

function assignActive(list: Occurrence[]): void {
  for (const occurrence of list) {
    if (!occurrence || occurrence.startMinute == null) continue;
    if (occurrence.endMinute != null) {
      occurrence.activeStartMinute = occurrence.startMinute;
      occurrence.activeEndMinute = occurrence.endMinute;
      continue;
    }
    let end = 1440;
    for (const other of list) {
      const start = laterClockStart(other);
      if (start == null || start <= occurrence.startMinute) continue;
      if (start < end) end = start;
    }
    occurrence.activeStartMinute = occurrence.startMinute;
    occurrence.activeEndMinute = end;
  }
}

function takesFocus(occurrence: Occurrence): boolean {
  return occurrence.role !== 'unconfirmed-meeting';
}

function containsMinute(occurrence: Occurrence, minute: number): boolean {
  return (
    occurrence.activeStartMinute != null &&
    occurrence.activeEndMinute != null &&
    minute >= occurrence.activeStartMinute &&
    minute < occurrence.activeEndMinute
  );
}

function pickCurrent(list: Occurrence[], minute: number): Occurrence | null {
  let current: Occurrence | null = null;
  for (const occurrence of list) {
    if (!takesFocus(occurrence) || !containsMinute(occurrence, minute)) continue;
    if (current == null || startsLater(occurrence, current)) current = occurrence;
  }
  return current;
}

function startsLater(candidate: Occurrence, current: Occurrence): boolean {
  const start = candidate.activeStartMinute ?? -1;
  const best = current.activeStartMinute ?? -1;
  if (start !== best) return start > best;
  return (candidate.activeEndMinute ?? -1) > (current.activeEndMinute ?? -1);
}

// A proposed meeting keeps the clock stored on the block, but that clock is not an appointment.
// It must not end the flexible block before it. A confirmed fixed block still does.
function laterClockStart(occurrence: Occurrence | undefined): number | null {
  if (!occurrence || occurrence.role === 'unconfirmed-meeting' || occurrence.startMinute == null) return null;
  return occurrence.startMinute;
}

function sequenceKey(list: Occurrence[], index: number): number {
  const item = list[index];
  if (!item) return 1440;
  if (item.startMinute != null) return item.startMinute;
  let boundary: number | null = null;
  for (let later = index + 1; later < list.length; later += 1) {
    const start = laterClockStart(list[later]);
    if (start == null) continue;
    if (boundary == null || start < boundary) boundary = start;
  }
  return boundary == null ? 1440 : boundary - 0.5;
}

function pickNext(list: Occurrence[], minute: number): Occurrence | null {
  const current = pickCurrent(list, minute);
  const currentKey = current == null ? null : sequenceKey(list, list.indexOf(current));
  const ordered = list
    .map((item, index) => ({ item, index, key: sequenceKey(list, index) }))
    .sort((left, right) => left.key - right.key || left.index - right.index);
  for (const entry of ordered) {
    if (!takesFocus(entry.item) || entry.item === current) continue;
    if (entry.item.activeEndMinute != null && entry.item.activeEndMinute <= minute) continue;
    if (currentKey == null) {
      if (entry.item.startMinute == null) {
        if (entry.key + 0.5 > minute) return entry.item;
        continue;
      }
      if (entry.item.startMinute >= minute) return entry.item;
      continue;
    }
    if (entry.key > currentKey) return entry.item;
  }
  return null;
}

function padDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}
