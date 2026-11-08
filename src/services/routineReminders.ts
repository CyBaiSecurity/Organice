import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';

import {
  deleteRoutineNotification,
  getRoutineConfig,
  getRoutineDay,
  listRoutineBlocks,
  listRoutineNotifications,
  saveRoutineNotification,
  toRoutineBlockView,
} from '@/db';
import { REMINDER_HORIZON_DAYS, addDateDays, manilaDateKey, type DayOverrides } from '@/domain/routine';
import {
  createRoutineReminderReconciler,
  isRoutineNotificationId,
  nativeTriggerFiresAt,
  type PendingRoutineNotification,
  type RoutineNotificationAccess,
  type RoutineReminderPorts,
  type RoutineReminderReport,
  type RoutineReminderSource,
  type RoutineScheduleRequest,
} from '@/domain/routineReminders';
import { readNotificationAccess } from '@/services/notifications';

// Task and habit reminders already use this Android channel. Routine alerts share it.
const REMINDER_CHANNEL_ID = 'reminders';

const reconciler = createRoutineReminderReconciler({
  readAccess,
  ensureChannel,
  listPending,
  schedule,
  cancel,
  listOwned: async () => {
    throw new Error('Routine reminders could not be refreshed.');
  },
  saveOwned: async () => {
    throw new Error('Routine reminders could not be refreshed.');
  },
  deleteOwned: async () => {
    throw new Error('Routine reminders could not be refreshed.');
  },
});

export async function reconcileRoutineReminders(db: SQLiteDatabase): Promise<RoutineReminderReport> {
  try {
    return await reconciler.reconcile(await loadSource(db), portsFor(db));
  } catch {
    return {
      message: 'Routine reminders could not be refreshed.',
      scheduledCount: null,
      horizonEnd: null,
      pendingCount: null,
      missingIds: [],
      superseded: false,
    };
  }
}

function portsFor(db: SQLiteDatabase): RoutineReminderPorts {
  return {
    readAccess,
    ensureChannel,
    listPending,
    schedule,
    cancel,
    listOwned: async () => {
      const rows = await listRoutineNotifications(db);
      return rows.map((row) => ({
        identifier: row.identifier,
        blockId: row.blockId,
        dateKey: row.dateKey,
        firesAt: row.firesAt,
        title: row.title,
      }));
    },
    saveOwned: (record) => saveRoutineNotification(db, record),
    deleteOwned: (identifier) => deleteRoutineNotification(db, identifier),
  };
}

async function loadSource(db: SQLiteDatabase): Promise<RoutineReminderSource> {
  const now = new Date();
  const config = await getRoutineConfig(db);
  const blocks = (await listRoutineBlocks(db)).map(toRoutineBlockView);
  const today = manilaDateKey(now);
  const overridesByDate: Record<string, DayOverrides> = {};
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const dateKey = addDateDays(today, offset);
    const day = await getRoutineDay(db, dateKey);
    overridesByDate[dateKey] = {
      noClasses: day.noClasses,
      homeAtMinute: day.homeAtMinute,
      homeLate: day.homeLate,
    };
  }
  return {
    blocks,
    overridesByDate,
    now,
    routineEnabled: config.enabled,
  };
}

async function readAccess(): Promise<RoutineNotificationAccess> {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  if (platform === 'web') return { platform, canSchedule: false, channelOff: false, failed: false };
  try {
    const access = await readNotificationAccess();
    return {
      platform,
      canSchedule: access.canSchedule,
      channelOff: access.channelOff,
      failed: false,
    };
  } catch {
    return { platform, canSchedule: false, channelOff: false, failed: true };
  }
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Reminders',
    importance: AndroidImportance.HIGH,
  });
}

async function listPending(): Promise<PendingRoutineNotification[]> {
  const requests = await getAllScheduledNotificationsAsync();
  return requests.map((request) => ({
    identifier: request.identifier,
    title: request.content.title ?? '',
    firesAt: nativeTriggerFiresAt(request.trigger),
  }));
}

async function schedule(request: RoutineScheduleRequest): Promise<string> {
  const when = new Date(request.firesAt);
  if (Number.isNaN(when.getTime())) throw new Error('The time is not valid.');
  return scheduleNotificationAsync({
    identifier: request.identifier,
    content: {
      title: request.title,
      body: request.body,
      data: { url: request.url },
      sound: 'default',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
}

async function cancel(identifier: string): Promise<void> {
  if (!isRoutineNotificationId(identifier)) {
    throw new Error('The notification id is not valid.');
  }
  await cancelScheduledNotificationAsync(identifier);
}
