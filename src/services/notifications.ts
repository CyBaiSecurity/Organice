import { Platform } from 'react-native';

import { notificationAccess, type NotificationAccess, type NotificationPlatform } from '@/domain/notificationAccess';
import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getNotificationChannelAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationCategoryAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  type NotificationPermissionsStatus,
} from 'expo-notifications';

export const TASK_CATEGORY = 'task-reminder';
export const SNOOZE_10 = 'snooze-10';
export const SNOOZE_1H = 'snooze-1h';
export const SNOOZE_TOMORROW = 'snooze-tomorrow';

const REMINDER_CHANNEL_ID = 'reminders';

let foregroundHandlerInstalled = false;

function installForegroundHandler(): void {
  if (foregroundHandlerInstalled) {
    return;
  }
  foregroundHandlerInstalled = true;
  try {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // The handler module is missing on some targets. Scheduling still reports that it cannot run.
  }
}

installForegroundHandler();

function notificationPlatform(): NotificationPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function accessFromStatus(status: NotificationPermissionsStatus, channelOff = false): NotificationAccess {
  return notificationAccess({
    platform: notificationPlatform(),
    status: status.status,
    iosStatus: status.ios?.status,
    canAskAgain: status.canAskAgain,
    channelOff,
  });
}

async function reminderChannelOff(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const channel = await getNotificationChannelAsync(REMINDER_CHANNEL_ID);
  return channel != null && channel.importance === AndroidImportance.NONE;
}

export async function readNotificationAccess(): Promise<NotificationAccess> {
  if (Platform.OS === 'web') {
    return { canSchedule: false, canAskAgain: false, channelOff: false };
  }
  const status = await getPermissionsAsync();
  const access = accessFromStatus(status);
  if (!access.canSchedule) return access;
  return accessFromStatus(status, await reminderChannelOff());
}

async function readCanSchedule(): Promise<boolean> {
  try {
    return (await readNotificationAccess()).canSchedule;
  } catch {
    return false;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Reminders',
    importance: AndroidImportance.HIGH,
  });
}

async function ensureTaskCategory(): Promise<void> {
  try {
    await setNotificationCategoryAsync(TASK_CATEGORY, [
      { identifier: SNOOZE_10, buttonTitle: '10 minutes' },
      { identifier: SNOOZE_1H, buttonTitle: '1 hour' },
      { identifier: SNOOZE_TOMORROW, buttonTitle: 'Tomorrow morning' },
    ]);
  } catch {
    // A missing snooze category does not block the reminder itself.
  }
}

function androidChannel(): { channelId?: string } {
  if (Platform.OS !== 'android') {
    return {};
  }
  return { channelId: REMINDER_CHANNEL_ID };
}

function isFutureInstant(when: Date): boolean {
  return when instanceof Date && !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
}

// ISO weekday is Monday 1 through Sunday 7. Expo weekday is Sunday 1 through Saturday 7.
function expoWeekday(isoWeekday: number): number | null {
  if (isoWeekday === 7) {
    return 1;
  }
  if (isoWeekday >= 1 && isoWeekday <= 6) {
    return isoWeekday + 1;
  }
  return null;
}

function clockFromMinuteOfDay(minuteOfDay: number): { hour: number; minute: number } | null {
  if (!Number.isFinite(minuteOfDay)) {
    return null;
  }
  const total = Math.trunc(minuteOfDay);
  if (total < 0 || total >= 24 * 60) {
    return null;
  }
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

function expoWeekdays(isoWeekdays: number[]): number[] {
  const seen = new Set<number>();
  const weekdays: number[] = [];
  for (const isoWeekday of isoWeekdays) {
    const weekday = expoWeekday(isoWeekday);
    if (weekday === null || seen.has(weekday)) {
      continue;
    }
    seen.add(weekday);
    weekdays.push(weekday);
  }
  return weekdays;
}

let testReminderId: string | null = null;

export async function prepareNotifications(): Promise<NotificationAccess> {
  installForegroundHandler();
  if (Platform.OS === 'web') {
    return { canSchedule: false, canAskAgain: false, channelOff: false };
  }
  // Android 13 does not show the permission prompt until a channel exists.
  await ensureAndroidChannel();
  await ensureTaskCategory();
  let status = await getPermissionsAsync();
  if (!accessFromStatus(status).canSchedule) {
    status = await requestPermissionsAsync();
  }
  return accessFromStatus(status, await reminderChannelOff());
}

export async function sendTestReminder(): Promise<void> {
  installForegroundHandler();
  const access = await readNotificationAccess();
  if (!access.canSchedule) {
    throw new Error('Notifications are blocked on this phone.');
  }
  if (access.channelOff) {
    throw new Error('The Reminders channel is off.');
  }
  await ensureAndroidChannel();
  if (testReminderId) {
    await cancelNotification(testReminderId);
    testReminderId = null;
  }
  testReminderId = await scheduleNotificationAsync({
    content: {
      title: 'Organice',
      body: 'Reminders can reach this phone.',
      sound: 'default',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      ...androidChannel(),
    },
  });
}

export async function scheduleTaskReminder(input: {
  title: string;
  when: Date;
  taskId: string;
  previousId: string | null;
}): Promise<{ id: string | null; inexact: boolean }> {
  installForegroundHandler();
  if (Platform.OS === 'web' || !isFutureInstant(input.when)) {
    await cancelNotification(input.previousId);
    return { id: null, inexact: false };
  }
  if (!(await readCanSchedule())) {
    await cancelNotification(input.previousId);
    return { id: null, inexact: false };
  }

  await cancelNotification(input.previousId);
  try {
    await ensureAndroidChannel();
    await ensureTaskCategory();
    const id = await scheduleNotificationAsync({
      content: {
        title: input.title,
        body: 'Due',
        data: { url: `/task/${input.taskId}` },
        categoryIdentifier: TASK_CATEGORY,
        sound: 'default',
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: input.when,
        ...androidChannel(),
      },
    });
    return { id, inexact: false };
  } catch {
    // DateTriggerInput in expo-notifications/build/Notifications.types.d.ts has no inexact field.
    return { id: null, inexact: true };
  }
}

export async function cancelNotification(id: string | null): Promise<void> {
  if (id == null || id.length === 0) {
    return;
  }
  for (const raw of id.split(',')) {
    const notificationId = raw.trim();
    if (notificationId.length === 0) {
      continue;
    }
    try {
      await cancelScheduledNotificationAsync(notificationId);
    } catch {
      // An unknown id is already gone.
    }
  }
}

export async function scheduleHabitReminders(input: {
  name: string;
  habitId: string;
  minuteOfDay: number;
  isoWeekdays: number[];
  previousIds: string | null;
}): Promise<{ ids: string | null; inexact: boolean }> {
  installForegroundHandler();
  const clock = clockFromMinuteOfDay(input.minuteOfDay);
  const weekdays = expoWeekdays(input.isoWeekdays);
  if (Platform.OS === 'web' || clock === null || weekdays.length === 0) {
    await cancelNotification(input.previousIds);
    return { ids: null, inexact: false };
  }
  if (!(await readCanSchedule())) {
    await cancelNotification(input.previousIds);
    return { ids: null, inexact: false };
  }

  await cancelNotification(input.previousIds);
  const ids: string[] = [];
  try {
    await ensureAndroidChannel();
    for (const weekday of weekdays) {
      const id = await scheduleNotificationAsync({
        content: {
          title: input.name,
          body: 'Check in',
          data: { url: `/habit/${input.habitId}` },
          sound: 'default',
        },
        trigger: {
          type: SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: clock.hour,
          minute: clock.minute,
          ...androidChannel(),
        },
      });
      ids.push(id);
    }
    return { ids: ids.length === 0 ? null : ids.join(','), inexact: false };
  } catch {
    // WeeklyTriggerInput in expo-notifications/build/Notifications.types.d.ts has no inexact field.
    await cancelNotification(ids.join(','));
    return { ids: null, inexact: true };
  }
}

export function pathFromNotificationData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('url' in data)) {
    return null;
  }
  const url = data.url;
  return typeof url === 'string' ? url : null;
}
