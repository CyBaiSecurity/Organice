import type { RepeatKind } from '../domain/repeat.ts';

export type ListView = 'list' | 'board' | 'timeline';

export type ListRow = {
  id: string;
  name: string;
  accent: string;
  view: ListView;
  sort: number;
  is_inbox: number;
  created_at: string;
  updated_at: string;
};

export type SectionRow = {
  id: string;
  list_id: string;
  name: string;
  sort: number;
  created_at: string;
};

export type TaskRow = {
  id: string;
  list_id: string;
  section_id: string | null;
  title: string;
  notes: string;
  status: 'open' | 'completed';
  priority: number;
  all_day: number;
  start_at: string | null;
  due_at: string | null;
  repeat_kind: RepeatKind;
  repeat_days: string | null;
  repeat_interval_days: number | null;
  repeat_month_day: number | null;
  reminder_offset_minutes: number | null;
  notification_id: string | null;
  calendar_id: string | null;
  calendar_event_id: string | null;
  sort: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskInput = {
  list_id: string;
  title: string;
  notes?: string | null;
  section_id?: string | null;
  priority?: number;
  all_day?: number;
  start_at?: string | null;
  due_at?: string | null;
  repeat_kind?: RepeatKind | string;
  repeat_days?: string | null;
  repeat_interval_days?: number | null;
  reminder_offset_minutes?: number | null;
  notification_id?: string | null;
  calendar_id?: string | null;
  calendar_event_id?: string | null;
  sort?: number;
};

export type TaskPatch = Partial<TaskInput>;

export type TaskListFilter = {
  listId?: string;
  status?: 'open' | 'completed' | 'all';
  search?: string;
};

export type ChecklistRow = {
  id: string;
  task_id: string;
  title: string;
  done: number;
  sort: number;
};

export type IdeaRow = {
  id: string;
  title: string;
  body: string;
  status: 'raw' | 'compiled' | 'reviewed';
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IdeaDetail = IdeaRow & {
  review_text: string | null;
  reviewed_at: string | null;
};

export type HabitRow = {
  id: string;
  name: string;
  kind: 'boolean' | 'count';
  goal: number | null;
  unit: string | null;
  weekdays: string;
  reminder_minute: number | null;
  notification_id: string | null;
  archived: number;
  created_at: string;
};

export type HabitInput = {
  name: string;
  kind: 'boolean' | 'count';
  goal?: number | null;
  unit?: string | null;
  weekdays: string;
  reminder_minute?: number | null;
  notification_id?: string | null;
  archived?: number;
};

export type HabitPatch = Partial<HabitInput>;

export type CheckinRow = {
  habit_id: string;
  local_date: string;
  value: number;
};

export type FocusRow = {
  id: string;
  mode: 'countdown' | 'countup';
  phase: 'focus' | 'break';
  planned_seconds: number | null;
  actual_seconds: number | null;
  sound: 'silence' | 'rain' | 'cafe' | 'wind';
  task_id: string | null;
  habit_id: string | null;
  status: 'running' | 'completed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  endedAt: string | null;
  actualSeconds: number | null;
  startedAt: string;
  plannedSeconds: number | null;
};

export type FocusInput = {
  mode: 'countdown' | 'countup';
  phase: 'focus' | 'break';
  planned_seconds?: number | null;
  sound: string;
  task_id?: string | null;
  habit_id?: string | null;
  status?: 'running' | 'completed' | 'abandoned';
  started_at?: string;
};

export type CalendarCacheInput = {
  event_id: string;
  calendar_id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: number;
  fetched_at: string;
};

export type SettingsRow = {
  id: number;
  appearance: string;
  accent: string;
  work_start_minute: number;
  work_end_minute: number;
  default_list_id: string | null;
  default_reminder_offset: number | null;
  writable_calendar_id: string | null;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
  white_noise: string;
  focus_cycle_count: number;
  reminders_inexact: number;
  schema_note: string | null;
};

export type SettingsPatch = Partial<{
  appearance: string;
  accent: string;
  work_start_minute: number;
  work_end_minute: number;
  default_list_id: string | null;
  default_reminder_offset: number | null;
  writable_calendar_id: string | null;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
  white_noise: string;
  focus_cycle_count: number;
  reminders_inexact: number;
  schema_note: string | null;
}>;
