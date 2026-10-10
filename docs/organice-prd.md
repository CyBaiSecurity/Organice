# Organice product requirements

Status: version 1 specification. Written 2026-10-08.

This document says what Organice does. It is the build contract. The TickTick notes in `docs/ticktick-reverse-prd.md` are background research. They are not requirements, and their prices, caps, and Premium gates are not copied here.

Organice is a personal day planner for one person, on one phone. A day planner is a tool that shows what to do today, what is on the calendar, and what the person is trying to repeat. It is not a team product and it is not a second TickTick.

## 1. Who it is for

The person using Organice keeps their own tasks, their own ideas, and their own calendar. Nobody else has an account in the app. There is no sign-in to Organice, no shared list, and no assignee.

The jobs, in the words that defined this version:

- A to-do list.
- An ideas page, where a raw thought can sit until it is compiled into tasks, or until it is exported so an assistant can critique it.
- A calendar that can show and create events on the Google calendar already installed on the phone.
- Habits, a Pomodoro timer, white noise, a kanban board, a timeline, a dashboard, and themes.

Personalized, in this document, means those jobs and no learned ranking. The app does not reorder Today because of past postponements.

## 2. Design concept

The phone has four tabs.

| Tab | What it is |
| --- | --- |
| Dashboard | Today. Tasks due today, calendar events inside working hours, today's habit checks, a seven-day habit row, and the focus timer when one is running. |
| Tasks | Lists. Each list is shown as a list, a kanban board, or a timeline. |
| Ideas | A dump of thoughts that are not tasks yet. |
| Calendar | The phone's calendars, plus the tasks that were written onto a calendar. Month grid, then a day. |

Focus is a screen opened from the dashboard, not a fifth tab. Habit editing is a screen opened from the dashboard. Themes and the other preferences live in Settings, opened from the dashboard.

The visual system is quiet. One accent color. System, light, or dark appearance. Native tab bar from the stable Expo Router tabs. The unstable native-tab import is not a dependency. See section 11.

Working hours are the personal part of the dashboard. They are a local start time and a local end time. The dashboard's main agenda stays inside that window. Events outside it collapse into one row that can be opened.

## 3. What this version refuses to be

These are out of the product, not deferred ideas hiding in a ticket.

- No team, no shared list, no comments, no assignment.
- No Organice account and no server owned by this project.
- No in-app language model, no voice capture, and no transcription. Critique happens outside the phone, through the file in section 6.
- No tags, no saved filters, no file attachments, and no task nested under another task. A checklist inside one task is allowed. A tree of tasks is not.
- No Eisenhower matrix, no countdown objects, no badges, no habit gallery, no Apple Health, no watch app, no home-screen widget, and no browser extension.
- No import from TickTick.
- No web app and no desktop app. Phone only.
- No direct call to the Google Calendar HTTP API, and no Google token stored by Organice.
- No week timeline of the whole life. The timeline in this version is one list. The calendar in this version is a month and a day.
- No yearly statistics.

## 4. Feature specification

Each feature says what the person does, what the app does, the limit, and what is absent. Limits in this section are safety caps for one phone. They are not a paid tier. There is no paid tier.

### 4.1 Lists and tasks

The person creates a list with a name and a color chosen from the six accents. One list named Inbox exists on first launch. Inbox cannot be renamed or deleted. Other lists can be renamed, reordered, and deleted. Deleting a list deletes its sections, its tasks, and those tasks' checklist lines. The app asks before that delete.

A task belongs to one list. The person can set:

| Field | Behavior |
| --- | --- |
| Title | Required. Empty titles are not saved. Maximum 500 characters. |
| Notes | Optional plain text. Maximum 20,000 characters. Not a Markdown editor in this version. |
| List | Required. Moving a task to another list clears its section, because sections belong to one list. |
| Section | Optional. Used by the kanban board. |
| Due | Optional. A date, or a date and a time. |
| Start | Optional. Used with due as the end, for a duration. |
| All day | When on, the task has a date and no clock time. Start and end clock times are cleared. |
| Priority | None, low, medium, or high. Stored as 0, 1, 2, and 3. |
| Reminder | None, or one offset before the due time. Choices: at the time, 5 minutes, 15 minutes, 1 hour, 1 day. All-day tasks use 9:00 in the device zone on that date when a reminder is set. |
| Repeat | None, daily, weekly, monthly, or a number of days after completion. Weekly stores which weekdays. The interval is 1 in this version. "Every 2 weeks" is out. |
| Calendar link | Optional. Present only when the task was written to a phone calendar. |

Checklist lines sit inside one task. Each line has a title and a done flag. Maximum 100 lines. The person reorders them. Checking every line does not complete the task. Completing the task does not check the lines. Those are separate acts, because a checklist is a note with boxes, and the task is the commitment.

Completing a task that does not repeat sets its status to completed and stores the completion time. It leaves the dashboard. It stays available in the list behind a completed filter that is off by default. The person can reopen it. Reopening clears the completion time.

Completing a repeating task does not close the task forever. The app writes one completion row for that occurrence, then moves the due instant to the next occurrence.

- Daily, weekly, and monthly: the next occurrence is the next scheduled slot strictly after the completion time. Missed slots are not created as extra tasks. A daily task completed two days late becomes due tomorrow, not due for each skipped day.
- Weekly: the slot is the next selected weekday.
- Monthly: the slot is the same day-of-month. If that day does not exist, the app uses the last day of that month. Example: a task due on 31 January, completed in February, next becomes 31 March, and a 31st that falls in April becomes 30 April.
- Days after completion: the next due instant is the completion time plus N days, at the same clock time. N is an integer from 1 to 365. This rule does nothing until the person completes the occurrence. There is no "skip this occurrence" control in this version.

An incomplete task whose due instant is before the start of today is overdue. The dashboard shows overdue tasks above today's agenda. The calendar day shows them only on the day they were due, and the dashboard keeps showing them until they are completed or rescheduled.

Snooze is available from a reminder and from the task. The choices are 10 minutes, 1 hour, and the start of working hours tomorrow. Snooze changes the reminder only. It does not change the due instant.

Search reads titles and notes. It is one field on the Tasks tab. It does not search ideas, habits, or calendar events. Matching uses the SQLite full-text index. The query is passed as a bound parameter, never concatenated into the SQL string.

Caps: 100 lists including Inbox, 2,000 open tasks in the whole database, 5,000 completed-task rows kept, older completion rows deleted first. Checklist cap is above.

Absent: tags, attachments, subtasks that are themselves tasks, more than one reminder, custom repeat intervals, and bulk edit beyond complete and delete of a multi-select. Multi-select on a list can complete or delete the selection. It cannot bulk-move in this version.

### 4.2 Dashboard

The dashboard is the day. It always means the device's local today.

From top to bottom:

1. The date, and a control that opens Settings.
2. The focus strip. If a session is running, it shows the mode, the remaining or elapsed time, and a tap target that opens Focus. If none is running, it shows today's completed focus minutes and a Start control.
3. Habits due today. Each row is one tap to check a yes-or-no habit, or a stepper for a count habit. The seven-day row under that shows the last seven local dates for every active habit, as filled or empty. It does not open a month.
4. Overdue tasks, if any.
5. Today's agenda, inside working hours. Timed tasks and calendar events are mixed in time order. All-day tasks and all-day events sit in a band above the timed rows.
6. A collapsed row, "Outside working hours," with a count. Opening it shows those events and tasks.

Pull to refresh re-reads SQLite and re-fetches calendar events for yesterday, today, and tomorrow.

Empty dashboard: if there is no task, no event, and no habit, the screen says that today is clear and offers two actions, New task and New idea. It does not show a chart.

### 4.3 Ideas

An idea is a title and a body. The title is required and holds at most 500 characters. The body is optional and holds at most 20,000 characters. Status is one of raw, compiled, or reviewed.

The Ideas tab is a single list, newest first. A text field at the top saves a new idea as soon as the person leaves the field with a non-empty title. The body can be edited on the idea screen.

Compile works on a selection of one or more ideas.

1. The person chooses a destination list.
2. For each selected idea, the app creates one open task in that list.
3. The task title is the idea title. The task notes are the idea body. No date is set.
4. The idea status becomes compiled. The idea stores the new task id.
5. The idea stays on the Ideas tab. Compile does not delete it.

Compiling the same idea again asks for confirmation, because a task already exists. Confirming creates a second task and replaces the stored task id. The first task is left in place.

Delete asks, then removes the idea and any review text. It does not delete the compiled task.

Cap: 1,000 ideas.

### 4.4 Calendar and Google

Organice reads and writes the calendars the operating system already has. The module is `expo-calendar`. That module talks to the device calendar database. It does not talk to Google's servers by itself. If the person has added a Google account in the iOS or Android calendar settings, the operating system syncs those events to Google. That is the whole Google integration.

`expo-calendar` does not run inside Expo Go. The app is a development build. See section 11.

First use of the Calendar tab requests calendar permission. If the person denies it, the tab explains that events cannot be shown and offers a button that opens the system settings. Tasks still show on that tab from SQLite.

The person picks one writable calendar in Settings. The app lists calendars whose `allowsModifications` flag is true. If none exist, Settings explains that a calendar account has to be added on the phone, and it does not show a Google sign-in button.

What the month shows: a mark on a day that has a task due that day or a cached event that overlaps that day. Tapping the day opens the day agenda. The day agenda lists all-day items, then timed items. Timed tasks from SQLite and events from the calendar are visually distinct. An event Organice did not create cannot be edited inside Organice. Tapping it opens the system event screen through the calendar module's open action. A task opens the task screen.

Writing a task onto the calendar:

- The person turns on "Add to calendar" on a task that has a start and an end. All-day is allowed and is written as an all-day event.
- The app creates an event on the chosen writable calendar and stores the event id and the calendar id on the task.
- Later edits to the title, notes, start, end, or all-day flag update that event.
- Turning the switch off deletes that event and clears the stored ids.
- Deleting the task deletes the event.
- Completing the task does not delete the event and does not change the event. The time already happened or is still on the calendar. The task being done is a separate fact.
- If the event was deleted outside Organice, the next update creates a new event and stores the new id.

Events that Organice did not create are never inserted into the task table. The app keeps a cache table so the dashboard can show the last fetch when the calendar provider is slow. The cache is not the source of truth. Pull to refresh replaces the cached rows for the fetched range. Each cached row stores the provider event id, calendar id, title, start, end, all-day flag, and the time it was fetched. The day screen shows "Updated …" from that timestamp when the latest fetch failed.

Recurrence of a Google event stays inside the provider. Organice does not rewrite another calendar's repeat rule. The repeat rules in section 4.1 belong to tasks. When a repeating task is also on the calendar, the app writes a single event for the current occurrence and updates that event when the task moves to the next occurrence. It does not create a provider recurrence rule for the task. That keeps one repeat engine, the one in SQLite.

Range fetched: the visible month, plus the week that spills in from the adjacent months, and always yesterday through tomorrow for the dashboard.

Absent: choosing several Google accounts inside Organice, inviting guests, and editing events the app did not create.

### 4.5 Kanban

Kanban is a view of one list. The person switches that list among list, board, and timeline. The switch is stored on the list.

A board's columns are sections. A section has a name and an order, and it belongs to one list. The person adds, renames, reorders, and deletes sections. Deleting a section asks. Its tasks become unsectioned. They do not get deleted. Unsectioned tasks sit in a column named Unsectioned, which the person cannot delete.

Dragging a card to another column sets the task's section. Dragging within a column changes the task order inside that section. Order is an integer on the task. The app renumbers when a gap is exhausted.

The board shows open tasks only. A control reveals completed tasks in their columns, dimmed.

Cap: 30 sections per list.

Absent: columns generated from priority, assignee, or date. Columns are only the sections the person made.

### 4.6 Timeline

The timeline is the other view of the same list. It is not the Calendar tab.

Tasks that have both a start and an end draw as bars on a horizontal day scale. The scale is seven days, starting on the device's current local day. The person can move the window earlier or later by one day.

Tasks with no start, and tasks with a due date but no start, sit in an unscheduled column beside the scale. They are not given a fake duration.

Dragging a bar horizontally changes the start and the end by the same amount. Dragging the end handle changes the end only. The start cannot be dragged past the end. The minimum duration is 15 minutes.

A task created by tapping an empty slot gets a start at that time and an end 30 minutes later. That 30 minutes is stored, because the person created a timed task. It is not applied to old tasks that only have a due date.

Absent: dependencies, a critical path, and a timeline of more than one list.

### 4.7 Habits

A habit is something the person wants to record on certain days. The person creates every habit. Nothing is preinstalled.

| Field | Behavior |
| --- | --- |
| Name | Required. Maximum 200 characters. |
| Kind | Boolean, or count. |
| Goal and unit | Count habits only. Goal is an integer from 1 to 10,000. Unit is a short label, maximum 20 characters, for example "pages". |
| Weekdays | At least one of Monday through Sunday. |
| Reminder | Optional. One local clock time. It fires on the selected weekdays. |
| Archived | When on, the habit leaves the dashboard and keeps its check-ins. |

A check-in is one row per habit per local date. A boolean check is on or off. A count check stores an integer from 0 to the goal, and also allows a value above the goal up to 10,000 so an overshoot is visible. Tapping a boolean row again clears today's check-in.

The dashboard records today only. The habit screen shows the current month. Tapping a past day in that month sets or clears that day's check-in. Future days cannot be checked.

Delete asks. It removes the habit and its check-ins. Archive does not.

Cap: 40 habits, including archived ones.

Absent: a catalog of suggested habits, streaks as a score, sharing a habit, and any health-app import.

### 4.8 Focus and white noise

A Pomodoro, in this app, is a countdown the person can retune. It is not locked to 25 minutes. The factory defaults are:

| Setting | Default |
| --- | --- |
| Focus length | 25 minutes |
| Short break | 5 minutes |
| Long break | 15 minutes |
| Long break every | 4 completed focus sessions |
| White noise | Silence |

Each length can be set from 1 to 180 minutes. The "every" count can be set from 2 to 12.

The Focus screen has two modes. Countdown uses the lengths above. Count-up runs until the person stops it, and it has no break.

The person may attach the session to one open task or one active habit, or to neither. The link is chosen at start.

Countdown behavior:

1. The person taps Start. The app stores a session row with the start time, the planned seconds, the mode, the link, and the sound id.
2. If a sound other than silence is selected, playback starts.
3. At zero, playback stops. The app writes the end time and the actual seconds, and schedules nothing further for the sound.
4. The app then starts the break countdown on its own. A short break follows a focus session unless this session's index in the current cycle is a multiple of the long-break count, in which case the break uses the long length. The cycle count resets when the long break finishes, and it resets if the person abandons a focus session.
5. The break has no white noise.
6. When the break ends, the app notifies the person. The next focus session does not start until they tap Start.

Count-up behavior: Start writes the session. Stop writes the end and the actual seconds. There is no automatic break.

Abandon, on either mode, stops the sound and marks the session abandoned. An abandoned session still stores the actual seconds so the dashboard total is honest. The dashboard's "today's focus minutes" sums actual seconds of sessions that ended today and were not abandoned. Abandoned time is omitted from that total and remains on the session row.

One session runs at a time. Starting another one abandons the current one after a confirm.

The end of a countdown and the end of a break each fire a local notification if the app is not in the foreground. Tapping it opens Focus.

White noise is three bundled loops plus silence: rain, café, and wind. The files ship inside the app. Playback uses `expo-audio`. The player `loop` flag is true for the whole focus session. The config plugin sets `enableBackgroundPlayback` to true. At runtime the audio mode sets `playsInSilentMode` and `shouldPlayInBackground`. On Android the player also calls `setActiveForLockScreen` for the session, because the audio documentation says background playback otherwise stops after about three minutes. The lock-screen title is "Focus" and the artist is Organice. Recording is not used, and the microphone permission is not requested. The config sets `recordAudioAndroid` to false and does not ask for a microphone on iOS.

The audio documentation says playback stops if headphones or a Bluetooth audio device disconnect. Organice does not try to restart the sound when that happens. The timer keeps running. The Focus screen shows that the sound stopped.

The sound stops at the end of focus, on abandon, and when the person picks silence during a session. Changing the sound during a session switches the loop without resetting the timer.

Cap: focus sessions are kept for 365 days, then the oldest rows are deleted. The dashboard only needs today.

Absent: a sound store, a yearly focus grid, and strict mode that blocks other apps.

### 4.9 Themes

Three appearance modes: System, Light, and Dark. System follows the phone.

Six accents. These names and values are Organice's, picked for this product:

| Name | Hex |
| --- | --- |
| Ink | `#1F4E79` |
| Pine | `#1F6B4A` |
| Clay | `#A15C38` |
| Plum | `#6B3A6A` |
| Slate | `#3E4C59` |
| Amber | `#8A5A00` |

The accent paints the selected tab, the primary button, and links. Priority does not use the accent. High is `#9B2C2C`, medium is `#8A5A00`, low is `#1F4E79`, and none is a neutral gray from the current appearance. Priority colors stay put when the accent changes, so high still means high.

List color is one of the same six accents.

No image backgrounds. No theme shop. The choice is stored in the settings row and applied on the next render.

### 4.10 Reminders

Task reminders and habit reminders are local notifications scheduled on the phone with `expo-notifications`. They are not remote push. The app does not request a push token.

A task stores the notification identifier returned by `scheduleNotificationAsync`. When the due time, the offset, or the completion state changes, the app cancels that identifier with `cancelScheduledNotificationAsync` and, if a future reminder is still required, schedules a new one. The trigger type is `DATE`. A reminder in the past is not scheduled.

A habit stores one identifier. The trigger type is `WEEKLY`, once per selected weekday, at the stored minute-of-day. Changing the weekdays or the time cancels and reschedules.

The notification title is the task title or the habit name. The body is "Due" for a task and "Check in" for a habit. The data payload carries a path the router can open: the task screen or the habit screen.

Snooze from the task reminder uses the same three choices as section 4.1. Habit reminders have no snooze. The next weekly fire is the next one.

If notification permission is denied, reminders are not scheduled, and Settings says so with a button to the system settings. Tasks and habits still save.

Android exact alarms need the exact-alarm permission on Android 12 and later. The app declares `SCHEDULE_EXACT_ALARM`. If the system rejects an exact trigger, the app schedules the same instant as an inexact trigger and Settings shows one line that the phone may deliver it late. The manufacturer battery manager is outside the app. The PRD does not promise delivery on a phone that freezes background work.

iOS permission is read from the iOS status field, not only the shared status field. The documented values are not determined, denied, authorized, provisional, and ephemeral. Anything other than authorized or provisional is treated as "do not schedule."

Cap: one scheduled notification per task and one per habit.

### 4.11 Settings and backup

Settings holds:

| Setting | Default |
| --- | --- |
| Appearance | System |
| Accent | Ink |
| Working hours | 08:00 to 22:00 local |
| Default list for new tasks | Inbox |
| Default reminder offset | 15 minutes, applied when a due time is set |
| Writable calendar | Unset until the person chooses |
| Focus lengths | The table in section 4.8 |
| White noise | Silence |

Working hours are stored as minutes from local midnight. They are clock times, not instants. A 7:00 habit stays 7:00 when the phone moves across a time zone. A timed task is an absolute instant, stored in UTC, so a 9:00 meeting shifts on the clock when the zone changes. Those two rules are different on purpose.

Export database copies the SQLite file into the app document directory using `expo-file-system`, then opens the system share sheet with `Sharing.shareAsync`. The person can save that file wherever the phone allows. Import of a full database is not in this version, because replacing the open database under a running app is a separate migration problem. The idea file in section 6 is the only import.

Export is the backup. Losing the phone without an export loses the data. The screen says that in one sentence.

## 5. Data model

The database is one SQLite file named `organice.db`, opened with `expo-sqlite`. On first open the app runs `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`. Schema changes go through `PRAGMA user_version`, starting at 1. User text in SQL is always a bound parameter. `execAsync` is reserved for migrations that contain no user text, because that call does not bind parameters.

Identifiers are UUID strings created on the device. Instants are ISO-8601 text in UTC. Local dates for habits are `YYYY-MM-DD` in the device zone at the time of the check-in.

### 5.1 Tables

**list.** `id`, `name`, `accent`, `view` (`list`, `board`, or `timeline`), `sort`, `is_inbox` (0 or 1), `created_at`, `updated_at`.

**section.** `id`, `list_id`, `name`, `sort`, `created_at`. Foreign key to list, delete cascade.

**task.** `id`, `list_id`, `section_id` nullable, `title`, `notes`, `status` (`open` or `completed`), `priority` (0 to 3), `all_day` (0 or 1), `start_at` nullable, `due_at` nullable, `repeat_kind` (`none`, `daily`, `weekly`, `monthly`, `after_complete`), `repeat_days` nullable text of weekday numbers 1 to 7, `repeat_interval_days` nullable, `reminder_offset_minutes` nullable, `notification_id` nullable, `calendar_id` nullable, `calendar_event_id` nullable, `sort`, `completed_at` nullable, `created_at`, `updated_at`.

**checklist_item.** `id`, `task_id`, `title`, `done` (0 or 1), `sort`. Foreign key to task, delete cascade.

**completion.** `id`, `task_id`, `occurrence_due_at`, `completed_at`. Written when a repeating task is completed. Foreign key to task, delete cascade.

**idea.** `id`, `title`, `body`, `status` (`raw`, `compiled`, `reviewed`), `task_id` nullable, `created_at`, `updated_at`. `task_id` is a soft link. Deleting the task does not delete the idea. The idea keeps the id even if the task is gone.

**idea_review.** `idea_id` primary key, `text`, `reviewed_at`. Foreign key to idea, delete cascade. One review per idea. A newer import replaces the text.

**habit.** `id`, `name`, `kind` (`boolean` or `count`), `goal` nullable, `unit` nullable, `weekdays` text, `reminder_minute` nullable, `notification_id` nullable, `archived` (0 or 1), `created_at`.

**habit_checkin.** `habit_id`, `local_date`, `value`. Primary key is the pair of habit and date. Foreign key to habit, delete cascade.

**focus_session.** `id`, `mode` (`countdown` or `countup`), `planned_seconds` nullable, `actual_seconds` nullable, `sound` (`silence`, `rain`, `cafe`, `wind`), `task_id` nullable, `habit_id` nullable, `status` (`running`, `completed`, `abandoned`), `started_at`, `ended_at` nullable.

**calendar_cache.** `event_id`, `calendar_id`, `title`, `start_at`, `end_at`, `all_day`, `fetched_at`. Primary key is the pair of event id and calendar id. Replaced per fetched range. Not a task.

**settings.** One row, `id` = 1. Columns for every setting in section 4.11, plus `schema_note` unused. Missing row on launch inserts the defaults.

**task_fts.** Full-text index on task id, title, and notes. Maintained in the same transaction as the task write.

### 5.2 Relationships

A list has many sections and many tasks. A section has many tasks. A task has many checklist items and many completion rows. An idea has at most one review and an optional task id. A habit has many check-ins. A focus session optionally points at one task or one habit, never both. The calendar cache points at nothing inside the database.

## 6. Ideas file and the MCP contract

MCP means Model Context Protocol. It is the interface an assistant uses to call a named tool. The phone does not run that server. A desktop assistant cannot open the phone's SQLite file. The bridge is a JSON file the person carries across.

### 6.1 Export and import on the phone

Export, on one idea or on the whole list, writes a JSON file into the app document directory and opens `Sharing.shareAsync` on that file. The MIME type passed to the share sheet is `application/json`.

Import asks the person to pick a JSON file with `expo-document-picker`. The app reads the file and applies section 6.3. It then deletes nothing on its own except by the rules below.

### 6.2 File shape

```json
{
  "organice": 1,
  "exportedAt": "2026-10-08T12:00:00Z",
  "ideas": [
    {
      "id": "uuid",
      "title": "string",
      "body": "string",
      "status": "raw",
      "taskId": null,
      "updatedAt": "2026-10-08T12:00:00Z",
      "review": null
    }
  ]
}
```

`review` is either null or `{ "text": "string", "reviewedAt": "ISO-8601" }`. `status` on export is the current status. Unknown extra fields are ignored on import.

### 6.3 Import rules

The app accepts `organice` equal to 1 only. Any other value is rejected with a message, and nothing is written.

For each idea object:

- If `id` matches a local idea, and `review.text` is a non-empty string, the app replaces `idea_review` and sets the idea status to reviewed. It does not change the title, the body, or the task id. The file cannot overwrite the person's words.
- If `id` does not match, the object is skipped and counted.
- If `review` is null, the local review is left as it is.

After import, the idea screen shows the review text and the reviewed time. The person can delete the review. Deleting it sets the status back to compiled if a task id exists, otherwise to raw.

### 6.4 MCP server, specified and not built in the app

A later implementation may add a small Node process beside the repo. This document specifies it so the file format is not redesigned later. The process is not part of the phone binary.

It takes one file path as its argument. It has three tools.

| Tool | Input | Effect |
| --- | --- | --- |
| `list_ideas` | none | Returns `id`, `title`, `status`, and `updatedAt` for each idea. Does not return the body. |
| `get_idea` | `id` | Returns the title, body, status, task id, and review for that idea. Errors if the id is missing. |
| `save_review` | `id`, `text` | Writes `review.text` and `reviewedAt` set to the current UTC time. Sets `status` to `reviewed` in the file. Does not change title or body. Does not call a model. The assistant produces the critique. The tool only stores the text. |

`text` maximum is 20,000 characters. The server pretty-prints the same JSON shape and keeps `organice` at 1.

The person exports from the phone, runs the review on the computer, then imports the file on the phone. That manual step is the version 1 design. A live channel from the phone to the server is out of this version.

## 7. User flows

### 7.1 Capture a task

1. The person taps New task on the dashboard or on a list.
2. The app opens a task with the default list and an empty title.
3. The person types a title and, if they want, a due time.
4. If a due time is set, the app applies the default reminder offset and schedules the notification when permission allows.
5. The task appears on its list and, when due today, on the dashboard.

### 7.2 Dump an idea and compile it

1. The person opens Ideas and types a title.
2. The app saves an idea with status raw.
3. Later, the person selects that idea, taps Compile, and picks a list.
4. The app creates the task and marks the idea compiled.

### 7.3 Plan the day

1. The person opens the dashboard.
2. The app loads overdue tasks, today's tasks, today's habit rows, and cached events inside working hours.
3. The person checks a habit, completes a task, or opens a timed row.

### 7.4 Put a task on the calendar

1. The person sets a start and an end on a task and turns on Add to calendar.
2. If no writable calendar is chosen, the app opens the picker before saving the link.
3. The app creates the device event and stores the ids.
4. The operating system syncs that event to Google when the chosen calendar is a Google calendar. Organice does not perform that sync itself.

### 7.5 Move work on a board or a timeline

1. The person opens a list and switches the view to board or timeline.
2. On the board, they drag a card to another section. The app writes the new section and the new order.
3. On the timeline, they drag a bar. The app writes the new start and end, and updates the linked calendar event if one exists.

### 7.6 Focus with sound

1. The person taps Start on the dashboard.
2. The app opens Focus. The person picks a length already stored in settings, a sound, and an optional task.
3. The app starts the countdown and, unless the sound is silence, loops the bundled file.
4. At zero, the sound stops and the break starts.
5. At the end of the break, a notification fires if the app is backgrounded. The next focus wait for a tap.

### 7.7 Ask for a critique

1. The person exports one idea.
2. The share sheet gives the JSON file to the computer.
3. An assistant calls `get_idea`, writes a critique, and calls `save_review`.
4. The person imports that file on the phone.
5. The idea shows the review and the status reviewed.

## 8. Build order

The specification above is the whole version. The implementation order below is how to land it so a slice runs before the last screen exists. Later slices are not optional scope cuts. They are the sequence.

1. SQLite, migrations, lists, tasks, checklist lines, one reminder, Settings with the defaults, and the dashboard agenda of tasks.
2. Ideas, compile, export, and import of the review file. The Node MCP process can follow the file format as soon as export exists.
3. Calendar permission, the writable calendar, the month and the day, and Add to calendar.
4. Sections, the board, and the timeline.
5. Habits, habit reminders, and the dashboard habit block.
6. Focus, focus records, and the three loops.
7. Appearance and accents. This slice is only settings and colors, so it may land with slice 1 if that is cheaper. The behavior in section 4.9 does not change either way.

## 9. Acceptance checks

A build matches this document when each of these is true.

- Inbox exists, cannot be deleted, and a second list can hold a task with a title, notes, priority, one checklist line, and one reminder.
- Completing a daily task writes a completion row and moves the due instant to the next slot after the completion time, without creating a task per missed day.
- The dashboard shows overdue tasks, today's tasks, and events inside working hours, and it hides the rest behind the outside-hours row.
- Compile creates one task per selected idea and leaves the idea in place with status compiled.
- Import of a version-1 file updates review text and does not change the idea title.
- With a writable device calendar, Add to calendar creates an event, edit updates it, and completing the task leaves the event.
- Denying calendar permission leaves tasks usable and blocks event fetch.
- A list can switch among list, board, and timeline. A board drag changes the section. A timeline drag changes start and end. A task with only a due date does not grow a bar.
- A boolean habit can be checked and unchecked today. A future date cannot be checked.
- A countdown with rain playing reaches zero, the sound stops, and a break starts without another tap. The next focus does not start without a tap.
- System, light, dark, and each accent can be selected and survive a restart.
- Export of the database file opens the share sheet.
- No screen offers sign-in, sharing a list, tags, or a model chat.

## 10. Risks

Phone-calendar sync is not a private Google integration. If the Google account is missing from the phone's calendar settings, Organice cannot see it and cannot add it. The app must say that, and it must not grow a Google login to paper over it.

The critique bridge is a file the person moves. Until that file is imported, the phone does not contain the review. There is no background sync of ideas.

Android may deliver a reminder late when exact alarms are denied or when the manufacturer stops background work. The app records the fall back to an inexact trigger. It does not claim a bypass of silent mode or Do Not Disturb.

The database file is not encrypted. `expo-sqlite` can use SQLCipher, and that option stays off in this version. Anyone who can read the app's documents, or anyone who receives the export, can read the tasks and the ideas. The export screen says that.

White noise stops if the audio device disconnects, and on Android it will not survive the background unless lock-screen controls are set. Those are library constraints from the `expo-audio` page fetched on 2026-10-08, not polish items.

Kanban and timeline dragging is specified as behavior. This document does not pick a third-party board package. The gestures use the gesture handler and the animated library that ship with the Expo SDK.

## 11. Stack

Pinned from Expo's own pages, fetched 2026-10-08. The SDK reference in force that day is Expo SDK 57.0.0.

| Piece | Choice | Why it is this one |
| --- | --- | --- |
| SDK | Expo SDK 57 | Current documented SDK. React Native 0.86, React 19.2.3, minimum Node.js 22.13. |
| Phones | iOS 16.4 or newer, Android 7 or newer | The SDK 57 support table. Android `compileSdkVersion` and `targetSdkVersion` are 36. Xcode 26.4 or newer for iOS builds. |
| Create | `create-expo-app` | The getting-started page recommends this as the default project. |
| Language | TypeScript | The default template is TypeScript. |
| Navigation | Expo Router, stable tabs | File-based routes. `expo-router/unstable-native-tabs` exists and is marked unstable. This version does not depend on it. |
| Database | `expo-sqlite` | On-device SQLite, included in Expo Go, with prepared statements and WAL. Full-text search is on by default in the config plugin (`enableFTS` defaults to true). SQLCipher stays off. |
| Calendar | `expo-calendar` | Device calendars, events, and the system event screen. Android and iOS, device only. Unsupported in Expo Go, so the project uses a development build from the first day. |
| Notifications | `expo-notifications` | Local scheduling. `DATE` and `WEEKLY` triggers exist. `cancelScheduledNotificationAsync` exists. Remote push is not used. Local notifications remain available in Expo Go. The calendar module is what forces the development build. |
| Audio | `expo-audio` | Playback, the `loop` flag, and background playback. Microphone recording is turned off in config. |
| Export | `expo-file-system` and `expo-sharing` | Write the file, then `Sharing.shareAsync`. |
| Import of the idea file | `expo-document-picker` | The person picks a JSON file. The package is in the SDK 57 module list. |

Install the SDK packages with `npx expo install` so the versions match SDK 57. Do not pin them by guessing a number from outside that command.

The app config plugin list for this version is `expo-sqlite`, `expo-calendar` with a calendar permission string that says Organice reads and writes the phone calendar so tasks can sit next to Google events, `expo-notifications`, and `expo-audio` with background playback on, Android recording off, and no microphone string. `expo-router` is already on the default template.

Development runs through a development build, `npx expo run:ios` or `npx expo run:android`, because `expo-calendar` will not load in Expo Go. Store submission is not part of this document.

## 12. Source notes for the stack

Fetched 2026-10-08:

- https://github.com/expo/expo
- https://docs.expo.dev/get-started/create-a-project/
- https://docs.expo.dev/versions/latest/ (SDK 57.0.0 table)
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/calendar/
- https://docs.expo.dev/versions/latest/sdk/notifications/
- https://docs.expo.dev/versions/latest/sdk/audio/
- https://docs.expo.dev/versions/latest/sdk/sharing/
- https://docs.expo.dev/versions/latest/sdk/router/native-tabs/ (read in order to reject the unstable import)
- https://docs.expo.dev/versions/latest/sdk/document-picker/ is the module index entry used to name `expo-document-picker`. The function-level page was not re-read line by line. The requirement is "the person picks a JSON file," not a specific function name.
