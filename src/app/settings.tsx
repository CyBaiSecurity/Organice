import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';

import { Button, Chip, Field, InkFooter, Muted } from '@/components/ui';
import { getLists, updateSettings, type SettingsPatch } from '@/db';
import { LIMITS } from '@/domain/limits';
import { clockLabel, parseClock } from '@/state/clock';
import { useOrganice } from '@/state/organice';
import { PAPER } from '@/theme/palette';
import { type NotificationAccess } from '@/domain/notificationAccess';
import { listWritableCalendars } from '@/services/calendarDevice';
import { prepareNotifications, readNotificationAccess, sendTestReminder } from '@/services/notifications';
import { shareFileAt } from '@/services/shareFile';

const APPEARANCE = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const WHITE_NOISE = [
  { value: 'silence', label: 'Silence' },
  { value: 'rain', label: 'Rain' },
  { value: 'cafe', label: 'Café' },
  { value: 'wind', label: 'Wind' },
] as const;

const REMINDER_OFFSETS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At the deadline' },
  { value: 5, label: '5 min before' },
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

function alertSettings(error: unknown) {
  Alert.alert('Settings', error instanceof Error ? error.message : 'Could not save that setting.');
}

function reminderSentence(access: NotificationAccess, sent: boolean): string {
  if (!access.canSchedule) {
    return access.canAskAgain
      ? 'Notifications are blocked on this phone.'
      : 'Notifications are blocked, and this phone will not ask again.';
  }
  if (access.channelOff) return 'Notifications are allowed, but the Reminders channel is off.';
  if (sent) return 'Notifications are allowed. A test reminder was sent.';
  return 'Notifications are allowed on this phone.';
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const { settings, refresh, reloadSettings } = useOrganice();
  const mode = settings.appearance === 'dark' ? 'dark' : settings.appearance === 'light' ? 'light' : scheme === 'dark' ? 'dark' : 'light';
  const paper = PAPER[mode];
  const [start, setStart] = useState(clockLabel(settings.work_start_minute));
  const [end, setEnd] = useState(clockLabel(settings.work_end_minute));
  const [focus, setFocus] = useState(String(settings.focus_minutes));
  const [shortBreak, setShortBreak] = useState(String(settings.short_break_minutes));
  const [longBreak, setLongBreak] = useState(String(settings.long_break_minutes));
  const [every, setEvery] = useState(String(settings.long_break_every));
  const [calendars, setCalendars] = useState<{ id: string; title: string }[] | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [access, setAccess] = useState<NotificationAccess | null>(null);
  const [reminderNote, setReminderNote] = useState('Reading notification permission.');
  const noticeGeneration = useRef(0);

  useFocusEffect(useCallback(() => {
    const generation = ++noticeGeneration.current;
    reloadSettings().catch(() => undefined);
    readNotificationAccess()
      .then((next) => {
        if (generation !== noticeGeneration.current) return;
        setAccess(next);
        setReminderNote(reminderSentence(next, false));
      })
      .catch(() => {
        if (generation !== noticeGeneration.current) return;
        setAccess(null);
        setReminderNote('Could not read notification permission.');
      });
  }, [reloadSettings]));

  async function checkNotifications() {
    const generation = ++noticeGeneration.current;
    try {
      const next = await prepareNotifications();
      if (generation !== noticeGeneration.current) return;
      setAccess(next);
      if (!next.canSchedule || next.channelOff) {
        const sentence = reminderSentence(next, false);
        setReminderNote(sentence);
        Alert.alert('Reminders', sentence);
        return;
      }
      await sendTestReminder();
      if (generation !== noticeGeneration.current) return;
      setReminderNote(reminderSentence(next, true));
      Alert.alert('Reminders', 'Notifications are allowed. A test reminder should appear within a few seconds.');
    } catch (error) {
      if (generation !== noticeGeneration.current) return;
      const message = error instanceof Error ? error.message : 'Could not check notifications.';
      setReminderNote(message);
      Alert.alert('Reminders', message);
    }
  }

  function saveSetting(patch: SettingsPatch) {
    return updateSettings(db, patch).then(() => reloadSettings()).then(() => refresh());
  }

  async function saveHours() {
    const workStart = parseClock(start);
    const workEnd = parseClock(end);
    if (workStart == null || workEnd == null || workEnd <= workStart) {
      Alert.alert('Working hours', 'Use 24-hour times, and make the end later than the start.');
      return;
    }
    const focusMinutes = clamp(Number(focus), LIMITS.lengthMin, LIMITS.lengthMax, 25);
    const shortMinutes = clamp(Number(shortBreak), LIMITS.lengthMin, LIMITS.lengthMax, 5);
    const longMinutes = clamp(Number(longBreak), LIMITS.lengthMin, LIMITS.lengthMax, 15);
    const longEvery = clamp(Number(every), LIMITS.longBreakEveryMin, LIMITS.longBreakEveryMax, 4);
    await saveSetting({
      work_start_minute: workStart,
      work_end_minute: workEnd,
      focus_minutes: focusMinutes,
      short_break_minutes: shortMinutes,
      long_break_minutes: longMinutes,
      long_break_every: longEvery,
    });
  }

  return (
    <ScrollView style={{ backgroundColor: paper.bg }} contentContainerStyle={styles.page} overScrollMode="never">
      <Text style={{ color: paper.text, fontSize: 18 }}>Appearance</Text>
      <View style={styles.wrap}>
        {APPEARANCE.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            selected={settings.appearance === item.value}
            accent={paper.text}
            paper={paper}
            onPress={() => saveSetting({ appearance: item.value }).catch(alertSettings)}
          />
        ))}
      </View>
      <Field label="Working hours start" value={start} onChangeText={setStart} paper={paper} placeholder="08:00" />
      <Field label="Working hours end" value={end} onChangeText={setEnd} paper={paper} placeholder="22:00" />
      <Field label="Focus minutes" value={focus} onChangeText={setFocus} paper={paper} />
      <Field label="Short break (minutes)" value={shortBreak} onChangeText={setShortBreak} paper={paper} />
      <Field label="Long break (minutes)" value={longBreak} onChangeText={setLongBreak} paper={paper} />
      <Field label="Focus sessions before a long break" value={every} onChangeText={setEvery} paper={paper} />
      <Button label="Save hours and focus lengths" color={paper.text} textColor={paper.bg} onPress={() => saveHours().catch(alertSettings)} />
      <Text style={{ color: paper.text, fontSize: 18 }}>Default list</Text>
      <Button label="Show lists" color={paper.text} textColor={paper.text} outline onPress={() => getLists(db).then((rows) => setLists(rows as { id: string; name: string }[]))} />
      <View style={styles.wrap}>
        {lists.map((list) => (
          <Chip
            key={list.id}
            label={list.name}
            selected={settings.default_list_id === list.id}
            accent={paper.text}
            paper={paper}
            onPress={() => saveSetting({ default_list_id: list.id }).catch(alertSettings)}
          />
        ))}
      </View>
      <Text style={{ color: paper.text, fontSize: 18 }}>Writable calendar</Text>
      <Muted color={paper.muted}>Uses a calendar already on this phone.</Muted>
      <Button
        label="Show calendars on this phone"
        color={paper.text}
        textColor={paper.text}
        outline
        onPress={() =>
          listWritableCalendars()
            .then((rows) => setCalendars(rows))
            .catch((error) => Alert.alert('Calendar', error instanceof Error ? error.message : 'Could not read calendars.'))
        }
      />
      {calendars && calendars.length === 0 ? <Muted color={paper.muted}>No writable calendar is on this phone.</Muted> : null}
      <View style={styles.wrap}>
        {(calendars ?? []).map((calendar) => (
          <Chip
            key={calendar.id}
            label={calendar.title}
            selected={settings.writable_calendar_id === calendar.id}
            accent={paper.text}
            paper={paper}
            onPress={() => saveSetting({ writable_calendar_id: calendar.id }).catch(alertSettings)}
          />
        ))}
      </View>
      <Text style={{ color: paper.text, fontSize: 18 }}>White noise</Text>
      <View style={styles.wrap}>
        {WHITE_NOISE.map((sound) => (
          <Chip
            key={sound.value}
            label={sound.label}
            selected={settings.white_noise === sound.value}
            accent={paper.text}
            paper={paper}
            onPress={() => saveSetting({ white_noise: sound.value }).catch(alertSettings)}
          />
        ))}
      </View>
      <Text style={{ color: paper.text, fontSize: 18 }}>Reminders</Text>
      <Text style={{ color: paper.muted }}>Default reminder for a new task</Text>
      <View style={styles.wrap}>
        {REMINDER_OFFSETS.map((item) => (
          <Chip
            key={item.label}
            label={item.label}
            selected={settings.default_reminder_offset === item.value}
            accent={paper.text}
            paper={paper}
            onPress={() => saveSetting({ default_reminder_offset: item.value }).catch(alertSettings)}
          />
        ))}
      </View>
      <Button label="Check notification permission" color={paper.text} textColor={paper.text} outline onPress={() => { checkNotifications().catch(() => undefined); }} />
      <Muted color={paper.muted}>{reminderNote}</Muted>
      {access && (!access.canSchedule || access.channelOff) ? (
        <Button label="Open system settings" color={paper.text} textColor={paper.bg} onPress={() => Linking.openSettings()} />
      ) : null}
      {settings.reminders_inexact ? <Muted color={paper.muted}>This phone may deliver reminders late.</Muted> : null}
      <Text style={{ color: paper.text, fontSize: 18 }}>Backup</Text>
      <Muted color={paper.muted}>The export file is not encrypted.</Muted>
      <Button
        label="Export database"
        color={paper.text}
        textColor={paper.bg}
        onPress={() => {
          const destination = new File(Paths.document, 'organice-backup.db');
          db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')
            .then(() => new File(db.databasePath).copy(destination, { overwrite: true }))
            .then(() => shareFileAt(destination.uri, 'application/octet-stream'))
            .catch((error) => {
              Alert.alert('Export', error instanceof Error ? error.message : 'Could not export the database.');
            });
        }}
      />
      <View style={styles.waveBreak}>
        <InkFooter color={paper.text} />
      </View>
    </ScrollView>
  );
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

const styles = StyleSheet.create({
  page: { paddingTop: 4, paddingBottom: 0, paddingHorizontal: 16, gap: 12 },
  waveBreak: { marginHorizontal: -16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
