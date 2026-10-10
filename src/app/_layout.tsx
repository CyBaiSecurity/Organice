import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';

import { migrate } from '@/db/migrate';
import { getTask, updateTask } from '@/db';
import { snoozedAt, type SnoozeChoice } from '@/domain/snooze';
import { PAPER, type Paper } from '@/theme/palette';
import { OrganiceProvider, useOrganice, type SettingsRow } from '@/state/organice';
import {
  SNOOZE_10,
  SNOOZE_1H,
  SNOOZE_TOMORROW,
  pathFromNotificationData,
  prepareNotifications,
  scheduleTaskReminder,
} from '@/services/notifications';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="organice.db" onInit={migrate}>
      <OrganiceProvider>
        <ThemedShell />
      </OrganiceProvider>
    </SQLiteProvider>
  );
}

function paperFor(settings: SettingsRow, scheme: string | null | undefined): Paper {
  const mode =
    settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  return PAPER[mode];
}

function ThemedShell() {
  const scheme = useColorScheme();
  const { settings } = useOrganice();
  const paper = paperFor(settings, scheme);
  const darkPrint = paper === PAPER.dark;
  const stock = darkPrint ? DarkTheme : DefaultTheme;
  const base = {
    ...stock,
    colors: {
      ...stock.colors,
      background: paper.bg,
      card: paper.surface,
      text: paper.text,
      border: paper.line,
      primary: paper.text,
      notification: paper.text,
    },
  };

  return (
    <ThemeProvider value={base}>
      <StatusBar style={darkPrint ? 'light' : 'dark'} />
      <NotificationBridge />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: paper.bg },
          headerTintColor: paper.text,
          headerShadowVisible: false,
          headerTitleStyle: { color: paper.text, fontFamily: 'Georgia', fontSize: 20 },
          contentStyle: { backgroundColor: paper.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
        <Stack.Screen name="list/[id]" options={{ title: 'List' }} />
        <Stack.Screen name="idea/[id]" options={{ title: 'Idea' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="focus" options={{ title: 'Focus' }} />
        <Stack.Screen name="habits" options={{ title: 'Habits' }} />
        <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
        <Stack.Screen name="habit/[id]" options={{ title: 'Habit' }} />
      </Stack>
    </ThemeProvider>
  );
}

function NotificationBridge() {
  const db = useSQLiteContext();
  const { settings, refresh } = useOrganice();

  useEffect(() => {
    prepareNotifications().catch(() => undefined);
    const handle = async (response: Notifications.NotificationResponse) => {
      const action = response.actionIdentifier;
      const url = pathFromNotificationData(response.notification.request.content.data);
      const taskId = url?.startsWith('/task/') ? url.slice('/task/'.length) : null;
      const choice: SnoozeChoice | null =
        action === SNOOZE_10 ? '10m' : action === SNOOZE_1H ? '1h' : action === SNOOZE_TOMORROW ? 'tomorrow' : null;
      if (choice && taskId) {
        const task = await getTask(db, taskId);
        if (!task) return;
        const when = snoozedAt(choice, new Date(), settings.work_start_minute);
        const scheduled = await scheduleTaskReminder({
          title: String(task.title),
          when,
          taskId,
          previousId: (task.notification_id as string | null) ?? null,
        });
        await updateTask(db, taskId, { notification_id: scheduled.id });
        refresh();
        return;
      }
      if (url) router.push(url as never);
    };

    const last = Notifications.getLastNotificationResponse();
    if (last) handle(last).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handle(response).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [db, refresh, settings.work_start_minute]);

  return null;
}
