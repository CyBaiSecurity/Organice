import { LIMITS, cleanText } from './limits.ts';
import {
  REMINDER_HORIZON_DAYS,
  addDateDays,
  isRealDateKey,
  manilaDateKey,
  reminderOccurrences,
  type DayOverrides,
  type ReminderOccurrence,
  type RoutineBlockView,
} from './routine.ts';

export const ROUTINE_REMINDER_URL = '/routine' as const;

const IDENTIFIER_PREFIX = 'routine:';
const BLOCK_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type RoutineReminderSource = {
  blocks: readonly RoutineBlockView[];
  overridesByDate?: Readonly<Record<string, DayOverrides>>;
  now: Date;
  routineEnabled: boolean;
};

export type OwnedReminder = {
  identifier: string;
  blockId: string;
  dateKey: string;
  firesAt: string;
  title: string;
};

export type PendingRoutineNotification = {
  identifier: string;
  title: string;
  firesAt: string | null;
};

export type RoutineNotificationAccess = {
  platform: 'ios' | 'android' | 'web';
  canSchedule: boolean;
  channelOff: boolean;
  failed: boolean;
};

export type RoutineScheduleRequest = {
  identifier: string;
  title: string;
  body: string;
  firesAt: string;
  url: typeof ROUTINE_REMINDER_URL;
};

export type RoutineReminderPorts = {
  readAccess: () => Promise<RoutineNotificationAccess>;
  ensureChannel: () => Promise<void>;
  listOwned: () => Promise<OwnedReminder[]>;
  saveOwned: (record: OwnedReminder) => Promise<void>;
  deleteOwned: (identifier: string) => Promise<void>;
  listPending: () => Promise<PendingRoutineNotification[]>;
  schedule: (request: RoutineScheduleRequest) => Promise<string>;
  cancel: (identifier: string) => Promise<void>;
};

export type RoutineReminderReport = {
  message: string | null;
  scheduledCount: number | null;
  horizonEnd: string | null;
  pendingCount: number | null;
  missingIds: string[];
  superseded: boolean;
};

const WEB_MESSAGE =
  'Routine reminders need the phone app. They cover the next seven days after you open Organice, and they stop if it stays closed longer than that. Nothing else was changed.';
const BLOCKED_MESSAGE =
  'Notifications are blocked on this phone. Routine reminders were not changed. They cover the next seven days after you open Organice, and they are not refreshed while it stays closed.';
const CHANNEL_MESSAGE =
  'The Reminders channel is off. Routine reminders were not changed. They cover the next seven days after you open Organice.';
const PERMISSION_CHECK_MESSAGE =
  'Notification permission could not be checked. Routine reminders were not changed. They cover the next seven days after you open Organice.';
const SCHEDULE_MESSAGE = 'A routine reminder could not be scheduled.';
const SAVE_MESSAGE = 'A routine reminder is on the phone, but its record could not be saved.';
const CANCEL_MESSAGE = 'A routine reminder could not be cancelled.';
const CHANNEL_PREPARE_MESSAGE = 'The reminder channel could not be prepared.';
const READ_MESSAGE = 'Routine reminders could not be read.';
const READBACK_MESSAGE = 'Scheduled reminders could not be read back from the phone.';
const REFRESH_MESSAGE = 'Routine reminders could not be refreshed.';

export function routineHorizonEnd(now: Date): string {
  return addDateDays(manilaDateKey(now), REMINDER_HORIZON_DAYS - 1);
}

export function routineNotificationId(blockId: string, dateKey: string): string {
  const parsed = parseRoutineNotificationId(`${IDENTIFIER_PREFIX}${blockId}:${dateKey}`);
  if (!parsed || parsed.blockId !== blockId || parsed.dateKey !== dateKey) {
    throw new Error('The notification id is not valid.');
  }
  return `${IDENTIFIER_PREFIX}${blockId}:${dateKey}`;
}

export function isRoutineNotificationId(value: string): boolean {
  return parseRoutineNotificationId(value) != null;
}

export function parseRoutineNotificationId(value: string): { blockId: string; dateKey: string } | null {
  if (!value.startsWith(IDENTIFIER_PREFIX)) return null;
  const body = value.slice(IDENTIFIER_PREFIX.length);
  const split = body.lastIndexOf(':');
  if (split <= 0 || split === body.length - 1) return null;
  const blockId = body.slice(0, split);
  const dateKey = body.slice(split + 1);
  if (!BLOCK_ID.test(blockId) || !isRealDateKey(dateKey)) return null;
  return { blockId, dateKey };
}

// Android DateTrigger readback is { type: 'date', value: epoch milliseconds }.
// iOS emits that same schedule as { type: 'timeInterval', seconds }, which is not an absolute instant.
export function nativeTriggerFiresAt(trigger: unknown): string | null {
  if (typeof trigger !== 'object' || trigger == null) return null;
  const record = trigger as Record<string, unknown>;
  if (record.type === 'timeInterval') return null;
  if (record.type === 'date' && 'value' in record) return epochMillisecondsToIso(record.value);
  if ('date' in record) return legacyDateToIso(record.date);
  return null;
}

function epochMillisecondsToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function legacyDateToIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e11 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function createRoutineReminderReconciler(ports: RoutineReminderPorts) {
  let generation = 0;
  let tail: Promise<void> = Promise.resolve();

  return {
    reconcile(source: RoutineReminderSource, portsOverride?: RoutineReminderPorts): Promise<RoutineReminderReport> {
      const ticket = ++generation;
      const current = () => ticket === generation;
      const activePorts = portsOverride ?? ports;
      const run = tail.then(async () => {
        if (!current()) return supersededReport(source.now);
        try {
          return await reconcileOnce(activePorts, source, current);
        } catch {
          return failureReport(source.now, REFRESH_MESSAGE);
        }
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

async function reconcileOnce(
  ports: RoutineReminderPorts,
  source: RoutineReminderSource,
  current: () => boolean,
): Promise<RoutineReminderReport> {
  if (!current()) return supersededReport(source.now);
  const access = await ports.readAccess();
  if (!current()) return supersededReport(source.now);
  if (access.failed) return quietReport(source.now, PERMISSION_CHECK_MESSAGE);
  if (access.platform === 'web') return quietReport(source.now, WEB_MESSAGE);
  if (!access.canSchedule) return quietReport(source.now, BLOCKED_MESSAGE);
  if (access.channelOff) return quietReport(source.now, CHANNEL_MESSAGE);

  const candidates = reminderOccurrences({
    blocks: source.blocks,
    overridesByDate: source.overridesByDate,
    now: source.now,
    routineEnabled: source.routineEnabled,
  });
  const desired = new Map<string, ReminderOccurrence>();
  for (const item of candidates) {
    desired.set(routineNotificationId(item.blockId, item.dateKey), item);
  }

  let ownedRows: OwnedReminder[];
  try {
    ownedRows = await ports.listOwned();
  } catch {
    return failureReport(source.now, READ_MESSAGE);
  }
  const owned = new Map(ownedRows.map((row) => [row.identifier, row]));

  if (desired.size > 0) {
    try {
      await ports.ensureChannel();
    } catch {
      return failureReport(source.now, CHANNEL_PREPARE_MESSAGE);
    }
  }
  if (!current()) return supersededReport(source.now);

  let before: PendingRoutineNotification[];
  try {
    before = await ports.listPending();
  } catch {
    return failureReport(source.now, READBACK_MESSAGE);
  }
  const beforeById = new Map(before.map((item) => [item.identifier, item]));
  const scheduleErrors: string[] = [];
  const saveErrors: string[] = [];
  const cancelErrors: string[] = [];

  for (const [identifier, item] of desired) {
    if (!current()) return supersededReport(source.now);
    const title = cleanText(item.title, LIMITS.title);
    if (title.length === 0) continue;
    const record: OwnedReminder = {
      identifier,
      blockId: item.blockId,
      dateKey: item.dateKey,
      firesAt: item.firesAt,
      title,
    };
    const live = beforeById.get(identifier) ?? null;
    const stored = owned.get(identifier) ?? null;
    const timingKnown = live != null && live.title === title && sameInstant(live.firesAt, item.firesAt);
    const timingStored =
      live != null &&
      live.firesAt == null &&
      live.title === title &&
      stored != null &&
      stored.title === title &&
      sameInstant(stored.firesAt, item.firesAt);
    if (timingKnown || timingStored) {
      if (timingKnown && (stored == null || stored.title !== title || !sameInstant(stored.firesAt, item.firesAt))) {
        try {
          await ports.saveOwned(record);
          owned.set(identifier, record);
        } catch {
          saveErrors.push(identifier);
        }
      }
      continue;
    }
    if (live != null) {
      try {
        await ports.cancel(identifier);
      } catch {
        cancelErrors.push(identifier);
        continue;
      }
    }
    if (!current()) return supersededReport(source.now);
    try {
      await ports.schedule({
        identifier,
        title,
        body: 'Open the guide',
        firesAt: item.firesAt,
        url: ROUTINE_REMINDER_URL,
      });
    } catch {
      scheduleErrors.push(identifier);
      continue;
    }
    try {
      await ports.saveOwned(record);
      owned.set(identifier, record);
    } catch {
      saveErrors.push(identifier);
    }
  }

  if (!current()) return supersededReport(source.now);
  let after: PendingRoutineNotification[];
  try {
    after = await ports.listPending();
  } catch {
    return failureReport(
      source.now,
      joinMessages([errorLine(scheduleErrors, SCHEDULE_MESSAGE), errorLine(saveErrors, SAVE_MESSAGE), READBACK_MESSAGE]) ??
        READBACK_MESSAGE,
    );
  }
  if (!current()) return supersededReport(source.now);

  const obsolete = new Set<string>();
  for (const identifier of owned.keys()) {
    if (!desired.has(identifier) && isRoutineNotificationId(identifier)) obsolete.add(identifier);
  }
  for (const item of after) {
    if (!desired.has(item.identifier) && isRoutineNotificationId(item.identifier)) obsolete.add(item.identifier);
  }
  for (const identifier of obsolete) {
    if (!current()) return supersededReport(source.now);
    try {
      await ports.cancel(identifier);
    } catch {
      cancelErrors.push(identifier);
      continue;
    }
    try {
      await ports.deleteOwned(identifier);
      owned.delete(identifier);
    } catch {
      cancelErrors.push(identifier);
    }
  }

  let verified: PendingRoutineNotification[];
  try {
    verified = await ports.listPending();
  } catch {
    return failureReport(
      source.now,
      joinMessages([
        errorLine(scheduleErrors, SCHEDULE_MESSAGE),
        errorLine(saveErrors, SAVE_MESSAGE),
        errorLine(cancelErrors, CANCEL_MESSAGE),
        READBACK_MESSAGE,
      ]) ?? READBACK_MESSAGE,
    );
  }

  const present = new Set(verified.map((item) => item.identifier));
  const missingIds = [...desired.keys()].filter((identifier) => !present.has(identifier));
  const scheduledCount = verified.filter((item) => isRoutineNotificationId(item.identifier)).length;
  const message = joinMessages([
    errorLine(scheduleErrors, SCHEDULE_MESSAGE),
    errorLine(saveErrors, SAVE_MESSAGE),
    errorLine(cancelErrors, CANCEL_MESSAGE),
    missingIds.length > 0 ? incompleteMessage(missingIds.length, verified.length) : null,
  ]);
  return {
    message,
    scheduledCount,
    horizonEnd: routineHorizonEnd(source.now),
    pendingCount: verified.length,
    missingIds,
    superseded: false,
  };
}

function sameInstant(left: string | null, right: string): boolean {
  if (left == null) return false;
  const first = Date.parse(left);
  const second = Date.parse(right);
  return Number.isFinite(first) && first === second;
}

function incompleteMessage(missing: number, pendingCount: number): string {
  const reminders = missing === 1 ? 'reminder is' : 'reminders are';
  const notifications = pendingCount === 1 ? 'notification is' : 'notifications are';
  return `Scheduling is incomplete. ${missing} routine ${reminders} missing. ${pendingCount} ${notifications} pending.`;
}

function errorLine(ids: string[], message: string): string | null {
  return ids.length > 0 ? message : null;
}

function joinMessages(parts: (string | null)[]): string | null {
  const text = parts.filter((part): part is string => part != null && part.length > 0).join(' ');
  return text.length > 0 ? text : null;
}

function quietReport(now: Date, message: string): RoutineReminderReport {
  return {
    message,
    scheduledCount: null,
    horizonEnd: routineHorizonEnd(now),
    pendingCount: null,
    missingIds: [],
    superseded: false,
  };
}

function failureReport(now: Date, message: string): RoutineReminderReport {
  return {
    message,
    scheduledCount: null,
    horizonEnd: routineHorizonEnd(now),
    pendingCount: null,
    missingIds: [],
    superseded: false,
  };
}

function supersededReport(now: Date): RoutineReminderReport {
  return {
    message: null,
    scheduledCount: null,
    horizonEnd: routineHorizonEnd(now),
    pendingCount: null,
    missingIds: [],
    superseded: true,
  };
}
