# Routine API

Data and domain contract for the UI worker and the reminder worker. Import pure functions from `@/domain/routine`. Import repository functions from `@/db`. Blocks in the database use snake_case rows. Day math uses camelCase views. Map a row with `toRoutineBlockView` before `deriveDay` or `reminderOccurrences`.

The source timezone is `Asia/Manila` (`ROUTINE_TIME_ZONE`). Manila is UTC+8 with no daylight-saving shift. Date helpers do not read the machine timezone. Weekdays are ISO: Monday is 1 and Sunday is 7.

`task.next_action` is a separate column from `notes`. The cap is `LIMITS.notes` (20000). Longer text is trimmed to that cap, the same way notes are. An omitted value is stored as `''`. Updating one field does not write the other.

Free period is not a column and not an override. The UI opens the selected task and Focus.

## Domain exports (`src/domain/routine.ts`)

```ts
export const ROUTINE_TIME_ZONE: 'Asia/Manila';
export const MANILA_OFFSET_MINUTES: 480;
export const REMINDER_HORIZON_DAYS: 7;

export const ROUTINE_ROLES: readonly [
  'fixed',
  'school',
  'commute',
  'first-hour-at-home',
  'evening',
  'unconfirmed-meeting',
];
export type RoutineRole = (typeof ROUTINE_ROLES)[number];

export const ROUTINE_PATTERN_IDS: readonly ['mon_wed', 'tue_thu', 'fri', 'sat', 'sun'];
export type RoutinePatternId = (typeof ROUTINE_PATTERN_IDS)[number];

export type RoutinePattern = {
  id: RoutinePatternId;
  label: string;
  weekdays: readonly number[];
};

export type RoutineBlockView = {
  id: string;
  pattern: RoutinePatternId;
  weekdays: readonly number[];
  sort: number;
  title: string;
  instructions: string;
  startMinute: number | null;
  endMinute: number | null;
  role: RoutineRole;
  enabled: boolean;
  remind: boolean;
};

export type RoutinePreview = {
  timeZone: 'Asia/Manila';
  patterns: (RoutinePattern & { blocks: RoutineBlockView[] })[];
};

export const ROUTINE_PATTERNS: readonly RoutinePattern[];
export const ROUTINE_TEMPLATE: readonly RoutineBlockView[];
export function previewRoutineTemplate(): RoutinePreview;

export const REVIEW_PROMPTS: readonly [
  { field: 'finished'; prompt: 'What got finished?' },
  { field: 'attention'; prompt: 'What needs attention?' },
  { field: 'crowded'; prompt: 'What felt too crowded?' },
];
export const SHORT_WORK_TITLE: 'Optional short work session';
export const SHORT_WORK_INSTRUCTIONS: string;
export const HOME_LATE_ESSENTIALS: string;

export type ManilaParts = { dateKey: string; minute: number; isoWeekday: number };
export function manilaParts(instant: Date): ManilaParts;
export function manilaDateKey(instant: Date): string;
export function manilaMinuteOfDay(instant: Date): number;
export function manilaWeekday(instant: Date): number;
export function isRealDateKey(value: string): boolean;
export function requireDateKey(value: string): string;
export function dateKeyWeekday(dateKey: string): number;
export function addDateDays(dateKey: string, days: number): string;
export function weekEndingSunday(dateKey: string): string;
export function manilaInstant(dateKey: string, minuteOfDay: number): Date;

export function formatWeekdays(days: readonly number[]): string;
export function parseWeekdays(stored: string): number[];
export function requireMinute(value: number): number;
export function optionalMinute(value: number | null): number | null;
export function assertClockWindow(start: number | null, end: number | null): void;
export function isRoutineRole(value: string): value is RoutineRole;
export function isRoutinePattern(value: string): value is RoutinePatternId;

export type DayOverrides = {
  noClasses: boolean;
  homeAtMinute: number | null;
  homeLate: boolean;
};
export const NO_DAY_OVERRIDES: DayOverrides;

export type OccurrenceTiming = 'clock' | 'point' | 'resolved' | 'open' | 'suggested';
export type Occurrence = {
  blockId: string | null;
  pattern: RoutinePatternId | null;
  role: RoutineRole | 'short-work';
  title: string;
  instructions: string;
  startMinute: number | null;
  endMinute: number | null;
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

export function deriveDay(
  blocks: readonly RoutineBlockView[],
  overrides: DayOverrides,
  now: Date,
  dateKey?: string,
): DayPlan;

export type ReminderOccurrence = {
  blockId: string;
  dateKey: string;
  minute: number;
  firesAt: string;
  title: string;
  role: RoutineRole;
};
export function reminderOccurrences(input: {
  blocks: readonly RoutineBlockView[];
  overridesByDate?: Readonly<Record<string, DayOverrides>>;
  now: Date;
  routineEnabled: boolean;
}): ReminderOccurrence[];

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
export function toRoutineBlockView(row: StoredBlock): RoutineBlockView;
```

`weekEndingSunday` names a Monday–Sunday review by the Sunday that ends it. A review saved on Wednesday 2026-11-11 is stored as `2026-11-15`. The same is true for every day from Monday 2026-11-09 through Sunday 2026-11-15. The Sunday-start stats week that contains that Monday is the literal date `2026-11-08`. This module does not export a helper for that stats key. `startOfWeek` in `src/domain/time.ts` remains the stats helper.

`manilaInstant('2026-11-09', 390)` is Monday 6:30 Manila, which is `2026-11-08T22:30:00.000Z`.

Minutes are integers from 0 through 1439. A range must end after it starts. There is no minimum or maximum duration. Friday and Saturday sleep are 22:30–23:00 (`1350`–`1380`). A start with a null end is a point. Both null means the block has no clock.

## How `deriveDay` chooses current and next

Pass the Manila `now` and the overrides for that same Manila date. `dateKey` defaults to the Manila date of `now`. The reminder helper also calls it for other dates in the horizon. For a future date the minute used for current/next is `-1`. For a past date it is `1440`.

Disabled blocks are omitted. Role comes from the stored field. A title that says "class" does not become `school`.

Windows are half-open: a block is current when `activeStartMinute <= minute < activeEndMinute`. A point stays current until the earliest later `startMinute` on the clock, or until minute 1440 when nothing timed follows. A fixed block counts toward that next start even when its `sort` is lower. At the end minute the block is already over and the next block can be current. Unconfirmed meetings stay in `occurrences` but never become `current` or `next`.

`occurrences` stays in `sort` order. `current` and `next` do not. `current` is the focusable block that contains the minute and has the latest `activeStartMinute`. An earlier point does not stay current once a later actual-arrival window contains that minute. `next` is the next focusable block by clock. A block with no clock keeps its instructions and can still be next before the timed block that follows it in `sort` order has started, so after school the next block can be "Travel home". A future fixed block is not skipped because its `sort` is lower. Editing a start or end, appending a block, or confirming a meeting (role `fixed`) all use that same clock order.

Arrival during an in-progress fixed range, or during the last fixed point of the day (sleep, once it has started and nothing timed follows it), does not open a first-hour window over that block. Sleep stays current. Template objects are not mutated.

Overrides apply only to the `DayOverrides` object you pass:

- `noClasses` removes school and commute blocks that have not ended yet. Past school and commute blocks stay. It inserts one synthetic occurrence (`role: 'short-work'`, `synthetic: true`, `blockId: null`) titled `SHORT_WORK_TITLE`. That suggestion has no clock, so it does not fill the day. Sunday has no school or commute, so the flag adds nothing there.
- `homeAtMinute` removes the untimed commute home and starts `first-hour-at-home` at that minute for 60 minutes, clipped so it does not run through the next `fixed` clock. `evening` then runs from the end of that hour until the next `fixed` clock. Template rows are not mutated. If arrival is already inside sleep, sleep stays current.
- `homeLate` removes `evening`, removes the untimed commute home, and replaces the first-hour instructions with `HOME_LATE_ESSENTIALS`. It does not add work. Combined with `noClasses`, it also suppresses the short-work suggestion. Fixed clock blocks stay, including later prepare, wind-down, and sleep rows, and including Friday's clocked leisure block.

## Reminder candidates

`reminderOccurrences` returns an empty array when `routineEnabled` is false. A candidate also requires `enabled`, `remind`, a resolved start minute, and a role other than `unconfirmed-meeting`. The horizon is seven Manila dates beginning today (`today` through `today + 6`). `firesAt` is a UTC ISO string. Instants strictly before `now` are dropped. An instant equal to `now` is kept.

`noClasses` on a date removes that date's school and commute candidates, including ones that would otherwise have been in the future. A first-hour block is included only when that date's `homeAtMinute` resolves a start and the block's `remind` flag is on. The template sets every `remind` flag to false.

Meetings ship with a proposed 19:00–20:00 window and the role `unconfirmed-meeting`. Changing the clock does not confirm one. Set `role` to `fixed` when the user confirms a time. Until then it is visible in the day list and absent from current, next, and reminders.

The pure function does not read SQLite. Load day rows for the horizon and pass them in `overridesByDate`. Missing keys mean `NO_DAY_OVERRIDES`.

```ts
import {
  getRoutineConfig,
  getRoutineDay,
  listRoutineBlocks,
  toRoutineBlockView,
} from '@/db';
import {
  addDateDays,
  deriveDay,
  manilaDateKey,
  reminderOccurrences,
  REMINDER_HORIZON_DAYS,
  type DayOverrides,
} from '@/domain/routine';

const now = new Date();
const config = await getRoutineConfig(db);
const blocks = (await listRoutineBlocks(db)).map(toRoutineBlockView);
const today = manilaDateKey(now);
const todayState = await getRoutineDay(db, today);
const overrides: DayOverrides = {
  noClasses: todayState.noClasses,
  homeAtMinute: todayState.homeAtMinute,
  homeLate: todayState.homeLate,
};
const plan = deriveDay(blocks, overrides, now);
// plan.current and plan.next are the guide. plan.occurrences is the ordered day.

const overridesByDate: Record<string, DayOverrides> = { [today]: overrides };
for (let offset = 1; offset < REMINDER_HORIZON_DAYS; offset += 1) {
  const dateKey = addDateDays(today, offset);
  const state = await getRoutineDay(db, dateKey);
  overridesByDate[dateKey] = {
    noClasses: state.noClasses,
    homeAtMinute: state.homeAtMinute,
    homeLate: state.homeLate,
  };
}
const reminders = reminderOccurrences({
  blocks,
  overridesByDate,
  now,
  routineEnabled: config.enabled,
});
// Schedule reminders[i].firesAt. Use blockId + dateKey as the stable key.
```

## Repository exports (`src/db/index.ts`)

`previewRoutineTemplate` and `toRoutineBlockView` are re-exported from the database barrel. `migrate` applies schema version 3. Version 2 added `task.next_action` and the routine tables. Version 3 adds `routine_config.initialized` (`INTEGER NOT NULL DEFAULT 0`) when that column is missing. A database already at version 2 keeps its blocks, its `enabled` value, and its workout link. The new column starts at 0. Fresh config is `initialized: false` and `enabled: false`. Version 1 rows are kept. Running `migrate` again does not duplicate the inbox or the config row. The UI decides whether setup is needed from `config.initialized`, not from the block count and not from `enabled`.

```ts
export function previewRoutineTemplate(): RoutinePreview;
export function toRoutineBlockView(row: StoredBlock): RoutineBlockView;

export type RoutineConfig = {
  enabled: boolean;
  initialized: boolean;
  workoutHabitId: string | null;
  updatedAt: string;
};
export function getRoutineConfig(db: SQLiteDatabase): Promise<RoutineConfig>;
export function setRoutineEnabled(db: SQLiteDatabase, enabled: boolean): Promise<RoutineConfig>;

export type SetupRoutineInput = {
  workoutHabitId?: string | null;
  createWorkout?: boolean;
};
export type SetupRoutineResult = {
  config: RoutineConfig;
  blockCount: number;
  insertedBlocks: number;
  workoutHabitId: string | null;
  createdWorkout: boolean;
};
export function setupRoutine(db: SQLiteDatabase, input?: SetupRoutineInput): Promise<SetupRoutineResult>;
```

`getRoutineConfig` after migrate returns `enabled: false`, `initialized: false`, and `workoutHabitId: null`. The first `setupRoutine` copies `ROUTINE_TEMPLATE` when `routine_block` is empty, sets `initialized` and `enabled` to true, and applies the workout choice. Those writes share one transaction. A later `setupRoutine` is not a reset: it keeps `enabled`, the workout choice, edited blocks, and deleted blocks. Deleting every block does not make the next setup seed again.

`createWorkout: true` inserts one boolean habit named `Workout` on weekdays `1,3,5` when no workout is linked yet. The insert uses the same habit cap as `createHabit` (`LIMITS.habits`, currently 40), and archived habits count. The cap check runs inside the setup transaction and before the habit insert. If it fails, the seed and the `initialized` / `enabled` updates roll back with it. It does not write check-ins. Saturday makeup is the instruction text on `sat-work`, not a habit row. `workoutHabitId` links an existing habit. Passing `createWorkout: true` together with `workoutHabitId` throws `Choose an existing workout or create one.` and writes nothing. A missing id, when it is the only workout argument, throws `Habit not found.` and rolls back that call. The first saved link is kept. Setup never inserts tasks.

## Source template conversion

`previewRoutineTemplate()` returns `{ timeZone: 'Asia/Manila', patterns }`. Each pattern has `id`, `label`, `weekdays`, and `blocks`. Each block is a `RoutineBlockView`:

| Field | Type |
| --- | --- |
| `id` | `string` |
| `pattern` | `'mon_wed' \| 'tue_thu' \| 'fri' \| 'sat' \| 'sun'` |
| `weekdays` | `number[]` (ISO, Monday 1 through Sunday 7) |
| `sort` | `number` |
| `title` | `string` |
| `instructions` | `string` |
| `startMinute` | `number \| null` |
| `endMinute` | `number \| null` |
| `role` | `RoutineRole` |
| `enabled` | `boolean` |
| `remind` | `boolean` |

`ROUTINE_TEMPLATE` is those blocks in one array. There is no Markdown parse step. `toRoutineBlockView(row)` maps a stored row onto that view: `start_minute` / `end_minute` become `startMinute` / `endMinute`, `weekdays` such as `'1,3'` becomes `[1, 3]`, and `enabled` / `remind` become booleans. An unknown `pattern` throws `Pattern is not valid.` An unknown `role` throws `Role is not valid.` Setup copies the view fields into `routine_block` once. Later edits stay in that table. Notification rows are not part of this contract.

```ts
export type RoutineBlockRow = {
  id: string;
  pattern: RoutinePatternId;
  weekdays: string;
  sort: number;
  title: string;
  instructions: string;
  start_minute: number | null;
  end_minute: number | null;
  role: RoutineRole;
  enabled: number;
  remind: number;
  created_at: string;
  updated_at: string;
};
export type RoutineBlockInput = {
  pattern: RoutinePatternId;
  weekdays: number[];
  title: string;
  instructions?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  role: RoutineRole;
  enabled?: boolean;
  remind?: boolean;
  sort?: number;
};
export type RoutineBlockPatch = Partial<RoutineBlockInput>;

export function listRoutineBlocks(db: SQLiteDatabase): Promise<RoutineBlockRow[]>;
export function addRoutineBlock(db: SQLiteDatabase, input: RoutineBlockInput): Promise<RoutineBlockRow>;
export function updateRoutineBlock(db: SQLiteDatabase, id: string, patch: RoutineBlockPatch): Promise<RoutineBlockRow>;
export function deleteRoutineBlock(db: SQLiteDatabase, id: string): Promise<void>;
```

`weekdays` is stored as a sorted unique list such as `'1,3'`. `enabled` defaults to 1 and `remind` defaults to 0 on `addRoutineBlock`. Template ids (`mon-wed-wake`, `mon-meeting`, `fri-sleep`, and the rest of `ROUTINE_TEMPLATE`) are stable. Added blocks get `newId()`. User text is bound. A quote or `DROP TABLE` fragment is stored as text.

Invalid data throws `Error` with one of these messages: `Title is required`, `Text is required.`, `The id is not valid.`, `Pattern is not valid.`, `Role is not valid.`, `Pick at least one weekday.`, `Weekdays must be 1 through 7.`, `The minute is not valid.`, `The end must be after the start.`, `The date is not valid.`, `The time is not valid.`, `Sort must be a number.`, `Enabled must be true or false.`, `Remind must be true or false.`, `No classes must be true or false.`, `Home late must be true or false.`, `Create workout must be true or false.`, `Choose an existing workout or create one.`, `Block not found.`, `Habit not found.`, `Task not found.`, `Task is not open.`, `Routine is not set up.` Reaching `LIMITS.habits` throws `LimitError` with `The habits limit has been reached.`

```ts
export type TaskLinkStatus = 'none' | 'open' | 'completed' | 'missing';
export type RoutineDayState = {
  localDate: string;
  selectedTaskId: string | null;
  selectedTaskStatus: TaskLinkStatus;
  noClasses: boolean;
  homeAtMinute: number | null;
  homeLate: boolean;
};
export type RoutineDayPatch = {
  noClasses?: boolean;
  homeAtMinute?: number | null;
  homeLate?: boolean;
};
export type EarlierTaskSuggestion = {
  taskId: string;
  localDate: string;
  title: string;
};

export function getRoutineDay(db: SQLiteDatabase, dateKey: string): Promise<RoutineDayState>;
export function updateRoutineDay(db: SQLiteDatabase, dateKey: string, patch: RoutineDayPatch): Promise<RoutineDayState>;
export function clearRoutineOverrides(db: SQLiteDatabase, dateKey: string): Promise<RoutineDayState>;
export function selectRoutineTask(db: SQLiteDatabase, dateKey: string, taskId: string | null): Promise<RoutineDayState>;
export function suggestEarlierTask(db: SQLiteDatabase, dateKey: string): Promise<EarlierTaskSuggestion | null>;
```

`getRoutineDay` does not insert a row. A missing date looks clear: no task, no overrides. `clearRoutineOverrides` sets the three override fields back to empty and keeps `selectedTaskId`. `selectRoutineTask(db, date, null)` clears only the task. Selection accepts an existing open task. A completed or missing task throws, and the previous selection stays. Deleting a task sets the foreign key to null, so day and review reads still return. A completed task remains linked with `selectedTaskStatus: 'completed'`. `suggestEarlierTask` reads the latest earlier date whose task is still open. It does not write.

```ts
export type RoutineReview = {
  weekEnding: string;
  finished: string;
  attention: string;
  crowded: string;
  nextTaskId: string | null;
  nextTaskStatus: TaskLinkStatus;
  saved: boolean;
  updatedAt: string | null;
};
export type RoutineReviewInput = {
  finished: string;
  attention: string;
  crowded: string;
  nextTaskId?: string | null;
};
export function getRoutineReview(db: SQLiteDatabase, dateKey: string): Promise<RoutineReview>;
export function saveRoutineReview(
  db: SQLiteDatabase,
  dateKey: string,
  input: RoutineReviewInput,
): Promise<RoutineReview>;
```

Pass any Manila date in the review week. The row key is `weekEnding`, the Sunday that ends that Monday–Sunday week. The three answers are whatever the user typed. Nothing fills them from tasks or habits. Omit `nextTaskId` to keep the previous review choice and to leave the following Monday's selected task alone. Include `nextTaskId` (a task id or `null`) and the same transaction also upserts that selection on the Monday after `weekEnding`. For a review saved on Sunday 2026-11-08, that Monday is 2026-11-09. `null` clears the Monday selection. The Monday row keeps its `noClasses`, `homeAtMinute`, and `homeLate` values. This write does not call `selectRoutineTask`, because that function opens another transaction. A non-open task throws inside the transaction, so the previous review text and the previous Monday selection both stay. There is no HTTP status. Failures are `Error` messages.

Notification persistence is not part of this contract. `reminderOccurrences` only returns candidates.

`createTask` and `updateTask` accept optional `next_action`. `TaskRow.next_action` is a string.
