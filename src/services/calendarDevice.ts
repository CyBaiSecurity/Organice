import { Platform } from 'react-native';
import { PermissionStatus } from 'expo';
import {
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarEvent,
  getCalendarPermissions,
  getCalendars,
  listEvents,
  requestCalendarPermissions,
} from 'expo-calendar';

export type DeviceEvent = {
  id: string;
  calendarId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
};

type EventDetails = {
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function isUnavailableError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  const message = errorMessage(error).toLowerCase();
  return code === 'ERR_UNAVAILABLE' || message.includes('unavailable') || message.includes('not available');
}

function isMissingEvent(error: unknown): boolean {
  return /not found|no longer exists|could not be found/i.test(errorMessage(error));
}

// Android getEventById resolves null, and ExpoCalendarEvent.get then throws TypeError.
function isAbsentGet(error: unknown): boolean {
  return error instanceof TypeError || isMissingEvent(error);
}

function toCalendarError(error: unknown, fallback: string): Error {
  if (Platform.OS === 'web' || isUnavailableError(error)) {
    return new Error('Calendar is not available on this device');
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error;
  }
  return new Error(fallback);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

async function loadCalendars(): Promise<ExpoCalendar[]> {
  if (Platform.OS === 'ios') {
    return getCalendars(EntityTypes.EVENT);
  }
  return getCalendars();
}

function permissionWord(status: PermissionStatus): 'granted' | 'denied' | 'undetermined' {
  if (status === PermissionStatus.GRANTED) {
    return 'granted';
  }
  if (status === PermissionStatus.DENIED) {
    return 'denied';
  }
  return 'undetermined';
}

export async function calendarAvailability(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unavailable'
> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  try {
    const response = await getCalendarPermissions();
    return permissionWord(response.status);
  } catch (error) {
    if (isUnavailableError(error)) {
      return 'unavailable';
    }
    throw toCalendarError(error, 'Could not read calendar permission');
  }
}

export async function requestCalendarAccess(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  try {
    const response = await requestCalendarPermissions();
    return permissionWord(response.status) === 'granted' ? 'granted' : 'denied';
  } catch (error) {
    if (isUnavailableError(error)) {
      return 'unavailable';
    }
    return 'denied';
  }
}

export async function listWritableCalendars(): Promise<{ id: string; title: string }[]> {
  if (Platform.OS === 'web') {
    return [];
  }
  try {
    const calendars = await loadCalendars();
    return calendars
      .filter((calendar) => calendar.allowsModifications)
      .map((calendar) => ({ id: calendar.id, title: calendar.title }));
  } catch (error) {
    if (isUnavailableError(error)) {
      return [];
    }
    throw toCalendarError(error, 'Could not list calendars');
  }
}

export async function eventsBetween(start: Date, end: Date): Promise<DeviceEvent[]> {
  if (Platform.OS === 'web') {
    return [];
  }
  try {
    const calendars = await loadCalendars();
    if (calendars.length === 0) {
      return [];
    }
    const events = await listEvents(calendars, start, end);
    return events
      .filter((event) => typeof event.id === 'string' && event.id.length > 0)
      .map((event) => ({
        id: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startAt: toIso(event.startDate),
        endAt: toIso(event.endDate),
        allDay: event.allDay,
      }));
  } catch (error) {
    if (isUnavailableError(error)) {
      return [];
    }
    throw toCalendarError(error, 'Could not load calendar events');
  }
}

async function createTaskEvent(
  calendarId: string,
  details: EventDetails,
): Promise<{ calendarId: string; eventId: string }> {
  const calendar = await ExpoCalendar.get(calendarId);
  const created = await calendar.createEvent(details);
  if (!created?.id) {
    throw new Error('Could not save the calendar event');
  }
  return {
    calendarId: created.calendarId || calendarId,
    eventId: created.id,
  };
}

export async function saveTaskEvent(input: {
  calendarId: string;
  existingEventId: string | null;
  title: string;
  notes: string;
  start: Date;
  end: Date;
  allDay: boolean;
}): Promise<{ calendarId: string; eventId: string }> {
  if (Platform.OS === 'web') {
    throw new Error('Calendar is not available on this device');
  }
  const details: EventDetails = {
    title: input.title,
    notes: input.notes,
    startDate: input.start,
    endDate: input.end,
    allDay: input.allDay,
  };
  if (input.existingEventId) {
    try {
      const event = await ExpoCalendarEvent.get(input.existingEventId);
      await event.update(details);
      if (event.id) {
        return { calendarId: event.calendarId || input.calendarId, eventId: event.id };
      }
    } catch (error) {
      if (isUnavailableError(error)) {
        throw new Error('Calendar is not available on this device');
      }
    }
  }
  try {
    return await createTaskEvent(input.calendarId, details);
  } catch (error) {
    throw toCalendarError(error, 'Could not save the calendar event');
  }
}

export async function removeTaskEvent(eventId: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Calendar is not available on this device');
  }
  if (eventId.trim().length === 0) {
    return;
  }
  let event: ExpoCalendarEvent;
  try {
    event = await ExpoCalendarEvent.get(eventId);
  } catch (error) {
    if (isAbsentGet(error)) {
      return;
    }
    throw toCalendarError(error, 'Could not remove the calendar event');
  }
  if (!event) {
    return;
  }
  try {
    await event.delete();
  } catch (error) {
    if (isMissingEvent(error)) {
      return;
    }
    throw toCalendarError(error, 'Could not remove the calendar event');
  }
}

export async function openDeviceEvent(eventId: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Calendar is not available on this device');
  }
  let event: ExpoCalendarEvent;
  try {
    event = await ExpoCalendarEvent.get(eventId);
  } catch (error) {
    if (isAbsentGet(error)) {
      throw new Error('That calendar event is no longer on this phone');
    }
    throw toCalendarError(error, 'Could not open the calendar event');
  }
  if (!event) {
    throw new Error('That calendar event is no longer on this phone');
  }
  try {
    await event.openInCalendar();
  } catch (error) {
    if (isMissingEvent(error)) {
      throw new Error('That calendar event is no longer on this phone');
    }
    throw toCalendarError(error, 'Could not open the calendar event');
  }
}
