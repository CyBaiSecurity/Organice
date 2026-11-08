import assert from 'node:assert/strict';
import test from 'node:test';

import { ROUTINE_TEMPLATE, addDateDays, manilaInstant, reminderOccurrences, type DayOverrides, type RoutineBlockView } from '../../src/domain/routine.ts';
import {
  ROUTINE_REMINDER_URL,
  createRoutineReminderReconciler,
  isRoutineNotificationId,
  nativeTriggerFiresAt,
  routineHorizonEnd,
  routineNotificationId,
  type OwnedReminder,
  type PendingRoutineNotification,
  type RoutineNotificationAccess,
  type RoutineReminderPorts,
  type RoutineReminderReport,
  type RoutineReminderSource,
  type RoutineScheduleRequest,
} from '../../src/domain/routineReminders.ts';

const MONDAY = '2026-11-09';
const WEDNESDAY = '2026-11-11';
const FOCUS_ID = 'focus-deadline-session-1';
const TASK_ID = '8b0b6a0e-5c3d-4e42-9c1a-0a0a0a0a0a0a';
const HABIT_IDS = 'habit-one,habit-two';
const FOREIGN = [FOCUS_ID, TASK_ID, HABIT_IDS];

const GRANTED: RoutineNotificationAccess = {
  platform: 'android',
  canSchedule: true,
  channelOff: false,
  failed: false,
};

function at(dateKey: string, minute: number): Date {
  return manilaInstant(dateKey, minute);
}

function overrides(patch: Partial<DayOverrides> = {}): DayOverrides {
  return {
    noClasses: patch.noClasses ?? false,
    homeAtMinute: patch.homeAtMinute ?? null,
    homeLate: patch.homeLate ?? false,
  };
}

function view(patch: Partial<RoutineBlockView> & Pick<RoutineBlockView, 'id'>): RoutineBlockView {
  return {
    pattern: 'mon_wed',
    weekdays: [1],
    sort: 10,
    title: 'Wake up',
    instructions: 'Wake up.',
    startMinute: 10 * 60,
    endMinute: null,
    role: 'fixed',
    enabled: true,
    remind: true,
    ...patch,
  };
}

function remindedTemplate(): RoutineBlockView[] {
  return ROUTINE_TEMPLATE.map((item) =>
    item.id === 'mon-wed-prepare' ||
    item.id === 'mon-meeting' ||
    item.id === 'mon-wed-class-morning' ||
    item.id === 'mon-wed-first-hour'
      ? { ...item, remind: true }
      : item,
  );
}

function source(patch: Partial<RoutineReminderSource> & Pick<RoutineReminderSource, 'blocks' | 'now'>): RoutineReminderSource {
  return {
    routineEnabled: true,
    overridesByDate: {},
    ...patch,
  };
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Harness = {
  pending: Map<string, PendingRoutineNotification>;
  owned: Map<string, OwnedReminder>;
  scheduled: RoutineScheduleRequest[];
  cancelled: string[];
  ensureChannelCalls: number;
  reconcile: (input: RoutineReminderSource) => Promise<RoutineReminderReport>;
  releasePaused: () => void;
  paused: Promise<void>;
};

function harness(options?: {
  access?: RoutineNotificationAccess;
  hideId?: string;
  failSchedule?: (identifier: string) => boolean;
  failSaves?: number;
  failCancel?: (identifier: string) => boolean;
  pauseId?: string;
  ensureChannelError?: boolean;
  failOwned?: boolean;
  failPending?: boolean;
}): Harness {
  const pending = new Map<string, PendingRoutineNotification>();
  const owned = new Map<string, OwnedReminder>();
  for (const identifier of FOREIGN) {
    pending.set(identifier, { identifier, title: 'Keep', firesAt: null });
  }
  const scheduled: RoutineScheduleRequest[] = [];
  const cancelled: string[] = [];
  let ensureChannelCalls = 0;
  let reads = 0;
  let savesLeftToFail = options?.failSaves ?? 0;
  let pausedOnce = false;
  const pause = deferred();
  const started = deferred();
  const ports: RoutineReminderPorts = {
    readAccess: async () => options?.access ?? GRANTED,
    ensureChannel: async () => {
      ensureChannelCalls += 1;
      if (options?.ensureChannelError) throw new Error('channel down');
    },
    listOwned: async () => {
      if (options?.failOwned) throw new Error('unread');
      return [...owned.values()];
    },
    saveOwned: async (record) => {
      if (savesLeftToFail > 0) {
        savesLeftToFail -= 1;
        throw new Error('disk');
      }
      owned.set(record.identifier, { ...record });
    },
    deleteOwned: async (identifier) => {
      owned.delete(identifier);
    },
    listPending: async () => {
      if (options?.failPending) throw new Error('unread');
      reads += 1;
      const rows = [...pending.values()];
      if (options?.hideId && reads >= 2) return rows.filter((row) => row.identifier !== options.hideId);
      return rows;
    },
    schedule: async (request) => {
      scheduled.push(request);
      const remember = () => {
        pending.set(request.identifier, { identifier: request.identifier, title: request.title, firesAt: request.firesAt });
      };
      if (options?.pauseId && !pausedOnce && request.identifier === options.pauseId) {
        pausedOnce = true;
        remember();
        started.resolve();
        await pause.promise;
      }
      if (options?.failSchedule?.(request.identifier)) throw new Error('native rejected');
      remember();
      return request.identifier;
    },
    cancel: async (identifier) => {
      cancelled.push(identifier);
      if (!isRoutineNotificationId(identifier) || options?.failCancel?.(identifier)) throw new Error('cancel failed');
      pending.delete(identifier);
    },
  };
  const reconciler = createRoutineReminderReconciler(ports);
  return {
    pending,
    owned,
    scheduled,
    cancelled,
    get ensureChannelCalls() {
      return ensureChannelCalls;
    },
    reconcile: (input) => reconciler.reconcile(input),
    releasePaused: () => pause.resolve(),
    paused: started.promise,
  };
}

function routineIds(pending: Map<string, PendingRoutineNotification>): string[] {
  return [...pending.keys()].filter((identifier) => isRoutineNotificationId(identifier)).sort();
}

function expectedIds(input: RoutineReminderSource): string[] {
  return reminderOccurrences({
    blocks: input.blocks,
    overridesByDate: input.overridesByDate,
    now: input.now,
    routineEnabled: input.routineEnabled,
  })
    .map((item) => routineNotificationId(item.blockId, item.dateKey))
    .sort();
}

function assertForeignUntouched(box: Harness): void {
  for (const identifier of FOREIGN) assert.equal(box.pending.has(identifier), true);
  assert.ok(box.cancelled.every((identifier) => isRoutineNotificationId(identifier)));
}

function assertNoInexact(report: { message: string | null }): void {
  assert.equal('inexact' in report, false);
  assert.equal(/inexact/i.test(JSON.stringify(report)), false);
}

test('candidate filtering schedules seven Manila days and a second pass changes nothing', async () => {
  const blocks = remindedTemplate();
  const now = at(MONDAY, 21 * 60);
  const input = source({ blocks, now });
  const box = harness();
  const first = await box.reconcile(input);
  const ids = expectedIds(input);
  assert.deepEqual(routineIds(box.pending), ids);
  assert.equal(ids.some((identifier) => identifier.endsWith(':2026-11-16')), false);
  assert.equal(ids.some((identifier) => identifier.includes('mon-meeting')), false);
  assert.equal(ids.some((identifier) => identifier.includes('mon-wed-first-hour')), false);
  assert.equal(ids.some((identifier) => identifier.includes('mon-wed-class-morning') && identifier.includes(MONDAY)), false);
  assert.ok(ids.some((identifier) => identifier === routineNotificationId('mon-wed-prepare', MONDAY)));
  assert.equal(first.scheduledCount, ids.length);
  assert.equal(first.pendingCount, ids.length + FOREIGN.length);
  assert.equal(first.horizonEnd, routineHorizonEnd(now));
  assert.equal(first.horizonEnd, addDateDays(MONDAY, 6));
  assert.equal(first.message, null);
  assert.ok(box.ensureChannelCalls >= 1);
  assert.ok(box.scheduled.every((request) => request.url === ROUTINE_REMINDER_URL));
  assertNoInexact(first);
  const scheduledBefore = box.scheduled.length;
  const second = await box.reconcile(input);
  assert.equal(box.scheduled.length, scheduledBefore);
  assert.deepEqual(routineIds(box.pending), ids);
  assert.equal(second.message, null);
  assert.equal(second.scheduledCount, ids.length);
  assertForeignUntouched(box);

  const closed = source({ blocks, now, overridesByDate: { [WEDNESDAY]: overrides({ noClasses: true }) } });
  const withoutClass = harness();
  await withoutClass.reconcile(closed);
  assert.deepEqual(routineIds(withoutClass.pending), expectedIds(closed));
  assert.equal(routineIds(withoutClass.pending).some((identifier) => identifier.includes('mon-wed-class-morning')), false);

  const arrived = source({
    blocks,
    now: at(MONDAY, 17 * 60),
    overridesByDate: { [MONDAY]: overrides({ homeAtMinute: 18 * 60 + 30 }) },
  });
  const home = harness();
  await home.reconcile(arrived);
  assert.deepEqual(routineIds(home.pending), expectedIds(arrived));
  assert.equal(routineIds(home.pending).includes(routineNotificationId('mon-wed-first-hour', MONDAY)), true);
  assert.equal(routineIds(home.pending).includes(routineNotificationId('mon-wed-first-hour', WEDNESDAY)), false);

  const disabled = blocks.map((item) => (item.id === 'mon-wed-prepare' ? { ...item, enabled: false } : item));
  const withoutPrepare = harness();
  await withoutPrepare.reconcile(source({ blocks: disabled, now }));
  assert.deepEqual(routineIds(withoutPrepare.pending), expectedIds(source({ blocks: disabled, now })));
  assert.equal(routineIds(withoutPrepare.pending).some((identifier) => identifier.includes('mon-wed-prepare')), false);

  const defaults = harness();
  const untouched = ROUTINE_TEMPLATE.map((item) => ({ ...item }));
  await defaults.reconcile(source({ blocks: untouched, now }));
  assert.deepEqual(routineIds(defaults.pending), []);
  assert.equal(defaults.scheduled.length, 0);

  const off = harness();
  await off.reconcile(source({ blocks, now, routineEnabled: false }));
  assert.deepEqual(routineIds(off.pending), []);
  assert.equal(off.scheduled.length, 0);
});

test('past, disabled, unconfirmed, and unresolved blocks are not scheduled', async () => {
  const past = harness();
  const wake = view({ id: 'wake-block', weekdays: [1, 3], startMinute: 6 * 60 + 30 });
  const pastSource = source({ blocks: [wake], now: at(MONDAY, 7 * 60) });
  await past.reconcile(pastSource);
  assert.deepEqual(routineIds(past.pending), [routineNotificationId('wake-block', WEDNESDAY)]);
  assert.equal(routineIds(past.pending).some((identifier) => identifier.endsWith(`:${MONDAY}`)), false);
  assert.equal(routineIds(past.pending).some((identifier) => identifier.endsWith(':2026-11-16')), false);

  const meeting = harness();
  await meeting.reconcile(
    source({
      blocks: [view({ id: 'meet-block', role: 'unconfirmed-meeting', startMinute: 19 * 60 })],
      now: at(MONDAY, 8 * 60),
    }),
  );
  assert.deepEqual(routineIds(meeting.pending), []);

  const relative = harness();
  const home = view({
    id: 'home-block',
    role: 'first-hour-at-home',
    startMinute: null,
    endMinute: null,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    pattern: 'mon_wed',
  });
  await relative.reconcile(source({ blocks: [home], now: at(MONDAY, 17 * 60) }));
  assert.deepEqual(routineIds(relative.pending), []);
  const placed = harness();
  const placedSource = source({
    blocks: [home],
    now: at(MONDAY, 17 * 60),
    overridesByDate: { [MONDAY]: overrides({ homeAtMinute: 18 * 60 + 30 }) },
  });
  await placed.reconcile(placedSource);
  assert.deepEqual(routineIds(placed.pending), expectedIds(placedSource));

  const turnedOff = harness();
  await turnedOff.reconcile(source({ blocks: [view({ id: 'off-block', enabled: false })], now: at(MONDAY, 8 * 60) }));
  assert.deepEqual(routineIds(turnedOff.pending), []);
  assertForeignUntouched(past);
});

test('editing, disabling, and a day change cancel only obsolete routine ids', async () => {
  const box = harness();
  const now = at(MONDAY, 8 * 60);
  const block = view({ id: 'class-block', role: 'school', title: 'Morning class' });
  await box.reconcile(source({ blocks: [block], now }));
  const kept = routineNotificationId('class-block', MONDAY);
  assert.equal(box.pending.has(kept), true);
  const removed = await box.reconcile(source({ blocks: [], now }));
  assert.equal(box.pending.has(kept), false);
  assert.equal(box.owned.has(kept), false);
  assert.equal(removed.scheduledCount, 0);
  assert.equal(removed.message, null);
  assertForeignUntouched(box);

  const again = harness();
  await again.reconcile(source({ blocks: [block], now }));
  await again.reconcile(source({ blocks: [block], now, overridesByDate: { [MONDAY]: overrides({ noClasses: true }) } }));
  assert.equal(again.pending.has(kept), false);
  assert.equal(again.owned.has(kept), false);
  assertForeignUntouched(again);

  const renamed = harness();
  await renamed.reconcile(source({ blocks: [block], now }));
  const before = renamed.scheduled.length;
  const updated = await renamed.reconcile(source({ blocks: [{ ...block, title: 'Later class' }], now }));
  assert.equal(renamed.scheduled.length, before + 1);
  assert.equal(renamed.scheduled.at(-1)?.title, 'Later class');
  assert.equal(renamed.scheduled.at(-1)?.firesAt, renamed.scheduled[0]?.firesAt);
  assert.equal(renamed.scheduled.at(-1)?.identifier, kept);
  assert.equal(renamed.cancelled.includes(kept), true);
  assert.equal(renamed.pending.get(kept)?.title, 'Later class');
  assert.equal(updated.message, null);
  assertForeignUntouched(renamed);
});

test('a failed cancellation keeps the ownership record', async () => {
  const stale = routineNotificationId('stale-block', MONDAY);
  const box = harness({ failCancel: (identifier) => identifier === stale });
  box.pending.set(stale, { identifier: stale, title: 'Old', firesAt: at(MONDAY, 10 * 60).toISOString() });
  box.owned.set(stale, {
    identifier: stale,
    blockId: 'stale-block',
    dateKey: MONDAY,
    firesAt: at(MONDAY, 10 * 60).toISOString(),
    title: 'Old',
  });
  const report = await box.reconcile(source({ blocks: [], now: at(MONDAY, 8 * 60), routineEnabled: false }));
  assert.equal(box.owned.has(stale), true);
  assert.equal(box.pending.has(stale), true);
  assert.equal(box.cancelled.includes(stale), true);
  assert.equal(report.scheduledCount, 1);
  assert.equal(report.pendingCount, FOREIGN.length + 1);
  assert.match(report.message ?? '', /could not be cancelled/);
  assertNoInexact(report);
  assertForeignUntouched(box);
});

test('a later scheduling failure keeps the earlier saved reminder', async () => {
  const early = routineNotificationId('early-block', MONDAY);
  const late = routineNotificationId('late-block', MONDAY);
  let ownedWhenLateFailed: string[] = [];
  const box = harness({
    failSchedule: (identifier) => {
      if (identifier !== late) return false;
      ownedWhenLateFailed = [...box.owned.keys()];
      return true;
    },
  });
  const blocks = [
    view({ id: 'early-block', title: 'Early', startMinute: 9 * 60, sort: 1 }),
    view({ id: 'late-block', title: 'Late', startMinute: 11 * 60, sort: 2 }),
  ];
  const report = await box.reconcile(source({ blocks, now: at(MONDAY, 8 * 60) }));
  assert.deepEqual(ownedWhenLateFailed, [early]);
  assert.equal(box.owned.has(early), true);
  assert.equal(box.owned.has(late), false);
  assert.equal(box.pending.has(early), true);
  assert.equal(box.pending.has(late), false);
  assert.match(report.message ?? '', /could not be scheduled/);
  assert.equal(report.missingIds.includes(late), true);
  assert.equal(report.scheduledCount, 1);
  assertNoInexact(report);
  assertForeignUntouched(box);
});

test('a restart adopts the stable id when the first record write failed', async () => {
  const box = harness({ failSaves: 1 });
  const block = view({ id: 'adopt-block', title: 'Adopt me' });
  const input = source({ blocks: [block], now: at(MONDAY, 8 * 60) });
  const id = routineNotificationId('adopt-block', MONDAY);
  const first = await box.reconcile(input);
  assert.equal(box.pending.has(id), true);
  assert.equal(box.owned.has(id), false);
  assert.match(first.message ?? '', /record could not be saved/);
  assertNoInexact(first);
  const scheduledBefore = box.scheduled.length;
  const second = await box.reconcile(input);
  assert.equal(box.scheduled.length, scheduledBefore);
  assert.equal(box.owned.get(id)?.identifier, id);
  assert.equal(box.owned.get(id)?.title, 'Adopt me');
  assert.equal(second.message, null);
  assert.equal(second.scheduledCount, 1);
  assertForeignUntouched(box);
});

test('a resolved schedule is incomplete when the phone list omits it', async () => {
  const hidden = routineNotificationId('late-block', MONDAY);
  const box = harness({ hideId: hidden });
  const blocks = [
    view({ id: 'early-block', title: 'Early', startMinute: 9 * 60, sort: 1 }),
    view({ id: 'late-block', title: 'Late', startMinute: 11 * 60, sort: 2 }),
  ];
  const report = await box.reconcile(source({ blocks, now: at(MONDAY, 8 * 60) }));
  assert.equal(box.owned.has(hidden), true);
  assert.equal(box.pending.has(hidden), true);
  assert.equal(report.missingIds.includes(hidden), true);
  assert.equal(report.scheduledCount, 1);
  assert.equal(report.pendingCount, FOREIGN.length + 1);
  assert.match(report.message ?? '', /Scheduling is incomplete/);
  assert.match(report.message ?? '', new RegExp(`${report.pendingCount} notifications are pending`));
  assertNoInexact(report);
  assertForeignUntouched(box);
});

test('permission denial, web, and a channel that is off preserve the reminder configuration', async () => {
  const blocks = remindedTemplate().map((item) => Object.freeze({ ...item }));
  const config = Object.freeze({ enabled: true, initialized: true });
  const now = at(MONDAY, 21 * 60);
  const input = source({ blocks, now, routineEnabled: config.enabled });
  const before = JSON.stringify({ enabled: config.enabled, remind: blocks.map((item) => [item.id, item.remind]) });

  for (const access of [
    { platform: 'android' as const, canSchedule: false, channelOff: false, failed: false },
    { platform: 'web' as const, canSchedule: false, channelOff: false, failed: false },
    { platform: 'android' as const, canSchedule: true, channelOff: true, failed: false },
    { platform: 'ios' as const, canSchedule: false, channelOff: false, failed: true },
  ]) {
    const box = harness({ access });
    box.owned.set(routineNotificationId('kept-block', MONDAY), {
      identifier: routineNotificationId('kept-block', MONDAY),
      blockId: 'kept-block',
      dateKey: MONDAY,
      firesAt: at(MONDAY, 22 * 60).toISOString(),
      title: 'Kept',
    });
    const report = await box.reconcile(input);
    assert.equal(box.scheduled.length, 0);
    assert.equal(box.cancelled.length, 0);
    assert.equal(box.ensureChannelCalls, 0);
    assert.equal(box.owned.has(routineNotificationId('kept-block', MONDAY)), true);
    assert.equal(JSON.stringify({ enabled: config.enabled, remind: blocks.map((item) => [item.id, item.remind]) }), before);
    assert.equal(config.initialized, true);
    assert.equal(report.scheduledCount, null);
    assert.equal(report.pendingCount, null);
    assert.equal(report.horizonEnd, addDateDays(MONDAY, 6));
    assertNoInexact(report);
    if (access.platform === 'web') assert.match(report.message ?? '', /phone app/);
    else if (access.failed) assert.match(report.message ?? '', /could not be checked/);
    else if (access.channelOff) assert.match(report.message ?? '', /Reminders channel is off/);
    else assert.match(report.message ?? '', /blocked on this phone/);
    assert.match(report.message ?? '', /seven days/);
  }

  const brokenChannel = harness({ ensureChannelError: true });
  const prepared = await brokenChannel.reconcile(input);
  assert.equal(brokenChannel.scheduled.length, 0);
  assert.equal(brokenChannel.cancelled.length, 0);
  assert.equal(prepared.scheduledCount, null);
  assert.equal(prepared.pendingCount, null);
  assert.match(prepared.message ?? '', /channel could not be prepared/);
  assertNoInexact(prepared);
  assert.equal(JSON.stringify({ enabled: config.enabled, remind: blocks.map((item) => [item.id, item.remind]) }), before);
});

test('an older reconcile cannot cancel a newer one', async () => {
  const firstId = routineNotificationId('block-a', MONDAY);
  const secondId = routineNotificationId('block-b', MONDAY);
  const box = harness({ pauseId: firstId });
  const now = at(MONDAY, 8 * 60);
  const first = source({ blocks: [view({ id: 'block-a', title: 'A' })], now });
  const second = source({ blocks: [view({ id: 'block-b', title: 'B' })], now });
  const older = box.reconcile(first);
  await box.paused;
  const newer = box.reconcile(second);
  box.releasePaused();
  const olderReport = await older;
  const newerReport = await newer;
  assert.equal(olderReport.superseded, true);
  assert.equal(newerReport.superseded, false);
  assert.equal(box.pending.has(secondId), true);
  assert.equal(box.cancelled.includes(secondId), false);
  assert.equal(newerReport.scheduledCount, 1);
  assert.equal(newerReport.message, null);
  assertForeignUntouched(box);
});

function remindedNow(startMinute: number, title = 'Wake up') {
  const block = view({ id: 'wake-block', title, startMinute });
  const now = at(MONDAY, 8 * 60);
  const input = source({ blocks: [block], now });
  const items = reminderOccurrences({
    blocks: input.blocks,
    overridesByDate: input.overridesByDate,
    now: input.now,
    routineEnabled: input.routineEnabled,
  });
  assert.equal(items.length, 1);
  const item = items[0];
  assert.ok(item);
  return { input, item, id: routineNotificationId(item.blockId, item.dateKey) };
}

function remember(
  box: Harness,
  item: { blockId: string; dateKey: string; firesAt: string; title: string },
  firesAt: string | null,
  title = item.title,
): void {
  const identifier = routineNotificationId(item.blockId, item.dateKey);
  box.pending.set(identifier, { identifier, title, firesAt });
  box.owned.set(identifier, {
    identifier,
    blockId: item.blockId,
    dateKey: item.dateKey,
    firesAt: item.firesAt,
    title: item.title,
  });
}

test('native date triggers read Android milliseconds and leave iOS intervals unknown', () => {
  const when = at(MONDAY, 10 * 60);
  const milliseconds = when.getTime();
  const android = { type: 'date', repeats: false, value: milliseconds, channelId: 'reminders' };
  assert.equal(nativeTriggerFiresAt(android), when.toISOString());
  assert.equal(nativeTriggerFiresAt({ date: when }), when.toISOString());
  assert.equal(nativeTriggerFiresAt({ date: milliseconds }), when.toISOString());
  assert.equal(nativeTriggerFiresAt({ date: milliseconds / 1000 }), when.toISOString());
  assert.equal(nativeTriggerFiresAt({ type: 'timeInterval', seconds: 7200, repeats: false }), null);
  assert.equal(nativeTriggerFiresAt({ type: 'timeInterval', seconds: 1e15, repeats: false, date: when }), null);
  assert.equal(nativeTriggerFiresAt({ type: 'date', repeats: false }), null);
  assert.equal(nativeTriggerFiresAt({ type: 'date', value: Number.NaN, date: when }), null);
  assert.equal(nativeTriggerFiresAt({ type: 'date', value: '1700000000000' }), null);
  assert.equal(nativeTriggerFiresAt({ type: 'calendar', dateComponents: { year: 2026 } }), null);
  assert.equal(nativeTriggerFiresAt(null), null);
  assert.equal(nativeTriggerFiresAt('date'), null);
  assert.equal(nativeTriggerFiresAt({ date: new Date(Number.NaN) }), null);
});

test('an unchanged Android pending alert is not cancelled or rescheduled', async () => {
  const { input, item, id } = remindedNow(10 * 60);
  const box = harness();
  const firesAt = nativeTriggerFiresAt({
    type: 'date',
    repeats: false,
    value: Date.parse(item.firesAt),
    channelId: 'reminders',
  });
  assert.equal(firesAt, item.firesAt);
  remember(box, item, firesAt);
  await box.reconcile(input);
  await box.reconcile(input);
  assert.equal(box.scheduled.length, 0);
  assert.equal(box.cancelled.length, 0);
  assert.equal(box.pending.get(id)?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assertForeignUntouched(box);
});

test('an iOS alert with no readable time stays when the owned record matches', async () => {
  const { input, item, id } = remindedNow(10 * 60);
  const box = harness();
  const firesAt = nativeTriggerFiresAt({ type: 'timeInterval', seconds: 7200, repeats: false });
  assert.equal(firesAt, null);
  remember(box, item, firesAt);
  await box.reconcile(input);
  await box.reconcile(input);
  assert.equal(box.scheduled.length, 0);
  assert.equal(box.cancelled.length, 0);
  assert.equal(box.pending.get(id)?.firesAt, null);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.title, item.title);
  assertForeignUntouched(box);
});

test('an edited time repairs an alert whose phone time cannot be read', async () => {
  const { input, item, id } = remindedNow(11 * 60);
  const box = harness();
  const early = at(MONDAY, 10 * 60).toISOString();
  box.pending.set(id, {
    identifier: id,
    title: item.title,
    firesAt: nativeTriggerFiresAt({ type: 'timeInterval', seconds: 3600, repeats: false }),
  });
  box.owned.set(id, {
    identifier: id,
    blockId: item.blockId,
    dateKey: item.dateKey,
    firesAt: early,
    title: item.title,
  });
  await box.reconcile(input);
  assert.equal(box.cancelled.includes(id), true);
  assert.equal(box.scheduled.length, 1);
  assert.equal(box.scheduled[0]?.firesAt, item.firesAt);
  assert.equal(box.scheduled[0]?.title, item.title);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assert.notEqual(item.firesAt, early);
  assertForeignUntouched(box);
});

test('a changed title repairs an alert whose phone time cannot be read', async () => {
  const { input, item, id } = remindedNow(10 * 60, 'Later class');
  const box = harness();
  box.pending.set(id, {
    identifier: id,
    title: 'Old title',
    firesAt: nativeTriggerFiresAt({ type: 'timeInterval', seconds: 7200, repeats: false }),
  });
  box.owned.set(id, {
    identifier: id,
    blockId: item.blockId,
    dateKey: item.dateKey,
    firesAt: item.firesAt,
    title: 'Old title',
  });
  await box.reconcile(input);
  assert.equal(box.cancelled.includes(id), true);
  assert.equal(box.scheduled.length, 1);
  assert.equal(box.scheduled[0]?.title, 'Later class');
  assert.equal(box.scheduled[0]?.firesAt, item.firesAt);
  assert.equal(box.pending.get(id)?.title, 'Later class');
  assertForeignUntouched(box);
});

test('a live alert with the wrong timestamp is replaced even when the owned record matches', async () => {
  const { input, item, id } = remindedNow(10 * 60);
  const box = harness();
  const firesAt = nativeTriggerFiresAt({
    type: 'date',
    repeats: false,
    value: Date.parse(item.firesAt) + 60_000,
    channelId: 'reminders',
  });
  assert.notEqual(firesAt, item.firesAt);
  assert.notEqual(firesAt, null);
  remember(box, item, firesAt);
  await box.reconcile(input);
  assert.equal(box.cancelled.includes(id), true);
  assert.equal(box.scheduled.length, 1);
  assert.equal(box.scheduled[0]?.firesAt, item.firesAt);
  assert.equal(box.pending.get(id)?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assertForeignUntouched(box);
});

test('a missing pending id is scheduled again without cancelling it', async () => {
  const { input, item, id } = remindedNow(10 * 60);
  const box = harness();
  box.owned.set(id, {
    identifier: id,
    blockId: item.blockId,
    dateKey: item.dateKey,
    firesAt: item.firesAt,
    title: item.title,
  });
  await box.reconcile(input);
  assert.equal(box.cancelled.includes(id), false);
  assert.equal(box.scheduled.length, 1);
  assert.equal(box.scheduled[0]?.identifier, id);
  assert.equal(box.scheduled[0]?.firesAt, item.firesAt);
  assert.equal(box.pending.get(id)?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assertForeignUntouched(box);
});

test('a live alert with no readable time and no owned record is scheduled instead of adopted', async () => {
  const { input, item, id } = remindedNow(10 * 60);
  const box = harness();
  box.pending.set(id, {
    identifier: id,
    title: item.title,
    firesAt: nativeTriggerFiresAt({ type: 'timeInterval', seconds: 7200, repeats: false }),
  });
  assert.equal(box.owned.has(id), false);
  await box.reconcile(input);
  assert.equal(box.cancelled.includes(id), true);
  assert.equal(box.scheduled.length, 1);
  assert.equal(box.scheduled[0]?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.firesAt, item.firesAt);
  assert.equal(box.owned.get(id)?.title, item.title);
  assert.equal(box.pending.get(id)?.firesAt, item.firesAt);
  assertForeignUntouched(box);
});

test('denied and unread reminders leave the count unknown', async () => {
  const input = source({ blocks: remindedTemplate(), now: at(MONDAY, 21 * 60) });
  const denied = harness({ access: { platform: 'android', canSchedule: false, channelOff: false, failed: false } });
  const deniedReport = await denied.reconcile(input);
  assert.equal(deniedReport.scheduledCount, null);
  assert.equal(deniedReport.pendingCount, null);
  assert.match(deniedReport.message ?? '', /blocked on this phone/);

  const unreadOwned = harness({ failOwned: true });
  const ownedReport = await unreadOwned.reconcile(input);
  assert.equal(ownedReport.scheduledCount, null);
  assert.equal(ownedReport.pendingCount, null);
  assert.match(ownedReport.message ?? '', /could not be read/);

  const unreadPending = harness({ failPending: true });
  const pendingReport = await unreadPending.reconcile(input);
  assert.equal(pendingReport.scheduledCount, null);
  assert.equal(pendingReport.pendingCount, null);
  assert.match(pendingReport.message ?? '', /could not be read back/);
});

test('a verified list with no routine alerts counts zero and ignores unrelated alerts', async () => {
  const box = harness();
  box.pending.clear();
  const empty = await box.reconcile(source({ blocks: [], now: at(MONDAY, 21 * 60) }));
  assert.equal(empty.scheduledCount, 0);
  assert.equal(empty.pendingCount, 0);
  assert.equal(empty.message, null);

  const unrelated = harness();
  const report = await unrelated.reconcile(source({ blocks: [], now: at(MONDAY, 21 * 60) }));
  assert.equal(report.scheduledCount, 0);
  assert.equal(report.pendingCount, FOREIGN.length);
  assert.deepEqual([...unrelated.pending.keys()].sort(), [...FOREIGN].sort());
  assert.equal(unrelated.cancelled.length, 0);
});
