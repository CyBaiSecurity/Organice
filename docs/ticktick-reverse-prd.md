# TickTick reverse-engineered PRD

Research date: 2026-10-08. Scope is the international product at ticktick.com and help.ticktick.com. The China product 滴答清单 (Dida365) is mentioned only where an English official page names it.

Source tags:

- `[OFFICIAL]` — ticktick.com marketing, pricing, download, privacy, or security pages
- `[DOCS]` — Help Center or the official Open API markdown
- `[CHANGELOG]` — Help Center "What's New"
- `[THIRD-PARTY]` — a review or another company's site
- `[COMMUNITY]` — Reddit
- `[UNVERIFIED]` — asked for, not found on a page fetched this session
- `[INFERRED]` — a relationship deduced from the docs, not a sentence TickTick wrote

A blank limit means the fetched pages do not state a number. This document does not fill those blanks.

## 1. Product overview

TickTick is a cross-platform task manager. The Beginner's Guide says it includes Tasks, Calendar, the Eisenhower Matrix, Pomodoro, and a Habit Tracker, and that people use it for work and personal life. `[DOCS]` The features page adds Countdown, lists, tags, filters, reminders, and collaboration. `[OFFICIAL]`

The download page names these clients: web app, iOS and iPadOS, Android, Windows, macOS, Linux, and a browser "Extension" with two download buttons. The page text does not name the browsers. `[OFFICIAL]` Help Center articles also document Apple Watch and Wear OS. `[DOCS]`

There is no separate public Team price. The pricing page has two columns, Free at US$0 and Premium at US$49.99 per year. `[OFFICIAL]` Shared lists are how collaboration works. Gift cards are the documented way to buy Premium for other people. `[DOCS]`

The core loop the docs describe is: capture a task quickly, put it in a list, give it a date and a reminder, look at it in a view, do it with a focus timer, and review habits, focus time, and completed tasks.

## 2. Feature inventory

### 2.1 Task management

The Help Center describes five levels: Folder, List, Section, Task, Subtask. `[DOCS]` The Open API also has a task `kind` of `TEXT`, `NOTE`, or `CHECKLIST`, and a separate `items` array of checklist items. A task can also point at a `parentId`. `[DOCS]` Checklist items and nested subtasks are both real. The API schema calls a checklist item a "subtask," while the Multilevel Tasks article uses "subtask" for a child task that can itself have children, up to five levels. `[DOCS]` Treat those as two different objects. The shared name is a docs collision, not proof that they are the same thing.

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| Task | A titled item with optional content, date, priority, tags, list, and status. Status codes in the API are Abandoned `-1`, Normal `0`, Completed `2`. The task UI can also restart an abandoned task. | Free, with caps | 99 tasks and notes per list on Free, 999 on Premium. `[OFFICIAL]` | All clients that sync an account. Exact parity is not listed. | `[OFFICIAL]` `[DOCS]` |
| Subtask | A child task under a parent. It can have its own date, duration, tags, priority, description, focus session, and assignee. Dragging an existing task can turn it into a subtask. Nesting goes to five levels. Drag-to-create is not available in Today or Next 7 Days. It works in Inbox and in lists you created. | Free (the pricing icon for "Subtask" is on for both columns) | Five levels. `[DOCS]` Not the same cap as checklist items. | Mobile and desktop described. | `[DOCS]` `[OFFICIAL]` |
| Checklist item | Checkable lines inside one task. The API models them as `items` with title, status 0 or 1, optional start date, all-day flag, time zone, and sort order. | Free, with a cap | 19 per task on Free, 199 on Premium, on the pricing page. `[OFFICIAL]` The US App Store listing and the Google Play listing both say Premium includes 199 subtasks per task. They do not say whether that number is this checklist cap or the nested-subtask object. | Not itemized per OS. | `[OFFICIAL]` `[DOCS]` |
| Note | A list can be a task list or a note list. Notes take rich text, dates, reminders, tags, and templates. A note list can use Kanban and drag-and-drop. Preset note templates exist, and users can save their own. The pricing row is "Task & Note Count," so notes share the per-list cap with tasks. | Free, inside the shared cap | 99 per list Free, 999 Premium. | Mobile and desktop described. | `[DOCS]` `[OFFICIAL]` |
| Description / body | Task body supports Markdown. As of the 15 Sep What's New entry, formatting marks can be hidden while editing, more highlight colors exist, and long content can collapse by heading. | Not stated as a separate gate | Not stated | Mobile and desktop in the What's New entry | `[CHANGELOG]` `[OFFICIAL]` |
| Attachment | Pictures and files on a task, synced across platforms after upload. | Free, tightly capped | Three official texts disagree. Pricing page: 1 per day Free, 199 per day Premium, no megabyte figure. FAQ: 1 per day Free, 99 per day Premium, 10 MB Free, 20 MB Premium, and up to 20 attachments per task. Task Details article: 1 per day and 10 MB Free; Premium 199 per day, 20 MB each, and 39 per task. US App Store listing: "Upload up to 99 attachments every day." The Play listing fetched the same day does not print an attachment number. | Synced "to various platforms." `[DOCS]` | `[DOCS]` `[OFFICIAL]` |
| Priority | Four levels: High, Medium, Low, None. API values are 5, 3, 1, and 0. There is no 2 or 4. | Free (icon on for both columns) | Four levels | Not itemized | `[DOCS]` `[OFFICIAL]` |
| Tag | A label with name, color, sort order, and an optional parent tag name, so tags can nest. API tag type is Personal `1` or Team `2`. | Free (icon on for both columns) | No count cap found. Create-tag requires a name and a label, each max 64 characters. The name is lowercased and trimmed, and the lowercased label must match the name. | Not itemized | `[DOCS]` `[OFFICIAL]` |
| List | A named container with a color, sort order, view mode `list`, `kanban`, or `timeline`, kind `TASK` or `NOTE`, and permission `read`, `write`, or `comment` when shared. Closed is a boolean. | Free, with a cap | 9 lists Free, 299 Premium. `[OFFICIAL]` The 2014 blog's "19 lists" is stale. Do not use it. | Not itemized | `[OFFICIAL]` `[DOCS]` |
| Folder | A group of lists. API name is project group. It has a name, sort order, view mode, and `showAll`. Deleting a folder in MCP "dissolves" it and ungroups the lists. | Not given its own pricing row. The old upgrade marketing text bundled folders with the higher list caps. | Project group name max 64 characters. | Not itemized | `[DOCS]` |
| Section | A column inside a list. API name is column. Kanban uses sections. Custom groups are only on regular lists, not on smart lists. | Not stated | Column name max 1000 characters. | Mobile and desktop | `[DOCS]` |
| Smart list | Built-in saved views: Today, Tomorrow, Next 7 Days, Inbox, and Assigned to Me. Today, Tomorrow, and Next 7 Days show tasks due in that window. Inbox cannot be hidden or deleted. Assigned to Me collects tasks assigned to you from shared lists. Each can be Show, Hide, or Show if not empty. | Not stated as Premium. They are presented as built-in. | Five named smart lists | Mobile and desktop settings paths differ | `[DOCS]` |
| Filter | A user-built saved query. Normal mode filters by list, tag, date, and keyword. Advanced mode combines conditions with AND and OR, including list, date, priority, and tag, and has a Preview. Filters can be shown from Smart List settings. Search can save the current search as a filter. A 2024 update added a "Next Month" option. | Premium. The pricing icon is off for Free and on for Premium. | No count cap found | Mobile and desktop | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Sort | Inside a group, sort by date, priority, created time, or modified time. Order is Newest First or Oldest First for the time sorts. | Not stated | Not stated | Documented for list and Kanban | `[DOCS]` `[CHANGELOG]` |
| Group | Group by list, time, priority, tag, assignee, or created time. Time groups are Today, Tomorrow, Next 7 days, Later, Overdue. Priority groups are High, Medium, Low, No Priority. | Not stated. Custom sections are separate from these smart groups. | Not stated | List and Kanban | `[DOCS]` |
| Drag and drop | Reorder tasks and sections. Drag a task under another to make it a subtask. On the timeline, drag to change start or duration. On the calendar, arrange tasks onto the grid. In the matrix, dragging a task to another quadrant can change its priority when the rule is priority-based. | Depends on the view. Timeline itself is Premium. | Not stated | See each view | `[DOCS]` `[OFFICIAL]` |
| Bulk actions | Assign several tasks at once. Postpone shifts the dates of a multi-selection. Complete-multiple exists in the API, up to 50 task IDs, and only the first 50 are processed. | Not stated for postpone and bulk assign | API complete batch: 50 | Mobile described for postpone and bulk assign | `[DOCS]` |
| Template | Save a task, including content and tags, and insert it later. Note templates are separate. What's New (3 Jun, year not printed on the heading) says templates can be searched, reordered, and inserted from a slash menu and from calendar views. | Free. The pricing icon is on for both columns. | Not stated | Mobile and desktop | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Pin | Pin a task to the top of a list. | Not stated | Not stated | Described on the task details page | `[DOCS]` |
| Trash | Deleted tasks can be recovered from Trash. MCP describes delete as moving a task to Trash. | Not stated | Not stated | Not itemized | `[DOCS]` |
| Share a single task | Task details say a task or note can be shared as text, image, or schedule. This is not the same as sharing a list. | Not stated | Not stated | Not itemized | `[DOCS]` |

### 2.2 Time and scheduling

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| Due date | Set from the task, from a right-click (Today, Tomorrow, Next Week, or custom), or by clicking a calendar grid. A click on a timeline creates the task at that time. | Free for a due date. Duration is separate. | Not stated | Mobile, desktop, calendar | `[DOCS]` |
| Start and end | Duration mode takes a start and an end. It can be a span inside one day, such as 9:00–12:00, or an all-day span across days. | Premium. Pricing icon is off on Free. The Premium card also says "Task Duration." | Not stated | Mobile and desktop | `[OFFICIAL]` `[DOCS]` |
| All-day | A boolean on the task and on a checklist item. Turning on All Day is how a duration stretches over whole days. | Not stated separately from duration | Not stated | Not itemized | `[DOCS]` |
| Reminder | One or more alerts on a task. The pop-up offers Dismiss, Start Focus, Done, or Snooze. Custom reminder times exist. API reminders are strings such as `TRIGGER:P0DT9H0M0S` and `TRIGGER:PT0S`. | Free, with a count cap | 2 on Free, 5 on Premium. `[OFFICIAL]` | Not itemized. Android may need "Alert Mode" because of OEM limits. | `[OFFICIAL]` `[DOCS]` |
| End-time reminder | After a duration is set, "At the end" reminds you when the span finishes. | Not stated. Duration itself is Premium, so this depends on duration. | Not stated | Mobile and desktop | `[DOCS]` |
| Constant reminder | Keeps alerting until you act. On iOS 26 and later, Alarm Reminder is a full-screen system alarm. It needs the Alarm permission, it rings if TickTick is closed, and it bypasses Silent, Do Not Disturb, and Sleep Focus. The power button and the volume buttons snooze that alarm for 9 minutes. Only one task can occupy the full-screen alarm. The others still land in Notification Center. If alarm permission is off, or the phone is below iOS 26, TickTick sends two notifications within one minute and repeats them. On Android the alert cycles 30 seconds on and 30 seconds off for 5 minutes. A snooze can show a Live Activity countdown on iOS 16 or later. The 3 Jun What's New entry says the switch can also be turned on for habits and anniversaries. | Premium. Pricing icon is off on Free. FAQ also calls the global switch a mobile feature. | One full-screen iOS alarm at a time. Android cycle is 5 minutes. | Mobile. The alarm path is iOS 26+. | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Checklist-item reminder | A reminder on a checklist line, separate from the parent task. | Premium | Not stated | Not itemized | `[OFFICIAL]` |
| Email reminder | The Premium card lists "Email Reminder." Help says you enable Email Notifications under Settings, Reminders & Notifications, on the web. The comparison table has no separate Email Reminder row. | Premium, according to the pricing card. The help article does not repeat the tier. | Not stated | Web settings | `[OFFICIAL]` `[DOCS]` |
| Location reminder | Remind when the device arrives at a saved place. The features page says iOS only. The reminder article says iOS and Android. The FAQ has steps for both. | Not stated | Needs location permission. Privacy policy says location is collected for this feature. | Conflict: marketing says iOS only; Help says iOS and Android. | `[OFFICIAL]` `[DOCS]` |
| Daily reminder | A once-a-day prompt to review tasks. Named on the features page. The help pages fetched here do not specify the settings. | Not stated | Not stated | Not itemized | `[OFFICIAL]` |
| Lock-screen pin | Features page says reminders can be pinned to the lock screen. | Not stated | iOS only, per that page | iOS | `[OFFICIAL]` |
| Repeat | Presets: every day, week, month, year, or custom. Custom modes are By Due Date (next occurrence follows the original schedule), By Completion Date (the next date is calculated from when you completed the previous one), and By Specific Dates (one or more chosen days). Ordinary repeats continue until you set "Repeat Ends On" a date or "Repeat Ends After" a count. API `repeatFlag` is an RRULE string, for example `RRULE:FREQ=DAILY;INTERVAL=1`. `repeatFrom` is `0` from the due date, `1` from the completion date, or `2` calendar recurrence that skips missed occurrences. If omitted, the server usually uses `2`. On the calendar you can change one occurrence and choose Only this Recurrence. In the calendar List or Month view you can swipe and choose Skip this Recurrence. A future occurrence cannot be checked off until the current one is completed or skipped. View Options can show all future cycles. The Google Play listing names "every 2 weeks from Monday to Thursday" and "every 2 months on the first Monday." Those phrases are store copy. The help article's option values for intervals live in images, so they are not copied here. | Free. Pricing icon is on for both columns. | No cap on the number of repeating tasks found | Not itemized | `[OFFICIAL]` `[DOCS]` |
| Time zone | A setting with two modes. Fixed Time Zone converts the clock time when you travel, so a 9:00 US task shows as 14:00 in London. Floating Time keeps the clock time, so a 7:00 run stays 7:00. The API stores an IANA name such as `America/Los_Angeles` on the task and on the user preference. | Not stated | Not stated | Mobile and desktop | `[DOCS]` |
| Extra calendar time zones | Calendar view can show more than one time zone column, with an icon and a label, reorderable. | Not stated | Up to five, counting the current zone plus four more | Mobile and desktop | `[DOCS]` |
| Additional calendars | Date display can add Korean Lunar, Hebrew, Hijri, Indian, Persian, or Chinese Lunar. | Not stated | Six named systems | Settings, Date & Time | `[DOCS]` |
| Holiday calendars | Subscribe to holiday calendars for countries and regions. They show in the sidebar, Today, and the calendar. | Not stated on the pricing table. "Integrations" as a row is Premium, and this is a subscription. Whether holidays are inside that row is not stated. | Not stated | Documented in the 2025 web changelog summary from search; the Help What's New page fetched here did not repeat this paragraph. Treat the detailed behavior as `[UNVERIFIED]` beyond the existence of the feature name in earlier search snippets. | `[UNVERIFIED]` for behavior |
| Calendar subscribe by URL | Paste a calendar URL. Documented examples are a Google "get shareable link" and a Todoist project calendar feed. Unsubscribe is supported. Events can also be added from TickTick into some subscribed calendars. | See Integrations row, which is Premium on the pricing table. Help does not restate the tier on every article. | Not stated | Mobile and desktop, with different unsubscribe steps for web, macOS, and Windows | `[DOCS]` `[OFFICIAL]` |
| Postpone | Select several tasks and shift their scheduled times forward together. | Not stated | Not stated | Task list and calendar | `[DOCS]` |

### 2.3 Views

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| List | Three columns on the large layout: lists, the task list, and a detail pane with notes, images, and Markdown. | Free. The Free card names "List & Kanban Views." | Not stated | Desktop description is explicit. Mobile has a list too. | `[OFFICIAL]` |
| Kanban | Columns come from custom sections or from a grouping such as time, list, assignee, or priority. Available on regular lists, and a 2023 update said smart lists, Inbox, folders, and tags can use it too. | Free, named on the Free card | Not stated | Mobile and desktop | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Timeline | Tasks drawn as bars from their duration. Drag the bar to change the start or the length. The features page calls it lighter than a Gantt chart. It does not describe dependencies or a critical path. | Premium. Pricing icon is off on Free. | Not stated | Not itemized. A 2024 note said timeline gained a priority group. | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Calendar | Named views on the features page: Yearly, Monthly, Weekly, Agenda, Multi-Day, Multi-Week. Help also documents a day-style list, week, month, year with a heatmap, and agenda. Color can follow list, priority, or tag. Subtasks and repeating tasks can be hidden. You can add a task by clicking a cell or a time on the timeline. On the mobile week timeline, a long press creates a task whose default duration is one hour. Dragging sets a different length. The week-view article says Multi-Day View and Multi-Week View are desktop only. Multi-Week shows 2 or 3 weeks. Long-press on day, 3-day, and week can offer Done, Delete, and Duplicate. | "Basic" on Free, "Unlimited" on Premium. The page does not say which of those views are the basic set. | Default new timeline block is one hour. Multi-Week is 2 or 3 weeks. | Multi-Day and Multi-Week are desktop only, per the week-view article. | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Year view | A year grid. A heatmap shows how dense each day is. The 3 Jun What's New entry says a click on a date previews that day's tasks. | Not stated. It may be part of "Unlimited" calendar. | Not stated | Not itemized | `[CHANGELOG]` |
| Eisenhower Matrix | Four quadrants. Default rule maps the four priorities to the four quadrants, and dragging a task between quadrants changes its priority. You can also write rules from list, tag, date range, priority, or a specific task. Example from the docs: urgent means Today through Tomorrow plus overdue, and not urgent means the day after tomorrow through seven days later. Mobile quadrant menu includes Edit, View Details, Show Completed, Show Check Items, Sort, Share, and Select. Desktop, in that article, only exposes Sort from the quadrant menu. | "Basic" on Free, "Unlimited" on Premium. What basic removes is not stated. | Four quadrants | Mobile and desktop, with the menu gap above | `[OFFICIAL]` `[DOCS]` |
| Search | Search tasks, lists, tags, and filters. Task results can be narrowed by list, tag, priority, and date. A saved search becomes a filter. | Search itself is not given a pricing row. Saving a filter lands in the Premium filter feature. | Not stated | The four-type chooser is "not currently supported on Mac." `[DOCS]` | `[DOCS]` |
| Suggested Tasks | A section in Today. It hides repeating tasks, tasks already scheduled today, and completed tasks. Sections described in the article: Recently Added (created just now, today, or yesterday, with no time), Postponed Tasks (over 5, over 3, or over 2 date changes), and Upcoming (due tomorrow or in two days). You can add a suggestion into Today. | Not stated | Not stated | Today list | `[DOCS]` `[CHANGELOG]` |
| Per-device list view | Android and Web can keep a different list view from the other device. | Not stated | Android and Web named. Other clients not mentioned. | `[CHANGELOG]` |

### 2.4 Productivity tools

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| Pomodoro | A countdown. The help article states the classic pattern: 25 minutes of focus, 5 minutes of break, and a longer break after 4 pomodoros. The timer article says you pick Pomo mode and a duration, and gives examples of 45 minutes and 10 minutes, so the length is not locked to 25. | Not stated as Premium. The feature can be hidden from the tab bar. | Exact duration choices are not listed as a complete set. | Mobile and desktop. Web shows elapsed focus time in the browser tab title. | `[DOCS]` `[CHANGELOG]` |
| Stopwatch | A count-up focus timer, as opposed to the countdown. API focus type is Pomodoro `0` or Timing `1`. | Not stated | Not stated | Mobile and desktop | `[DOCS]` |
| Focus linked to a task or habit | Start focus from a task, from a swipe action, or from a habit. Estimated pomo count and estimated duration can be set on a task. The API stores `estimatedPomo`, `pomoCount`, `pomoDuration`, and `stopwatchDuration`. | Estimated pomo is listed on the older upgrade marketing block, not as its own row on the current comparison table. Tier not restated on the current table. | Not stated | Mobile and desktop | `[DOCS]` `[OFFICIAL]` |
| Focus records | You can add and delete records. A 2025 What's New passage says deletion is no longer limited to 30 days, and you can edit a duration if you forgot to stop the timer. Extra time after a session can be added to the record. Start, pause, and end copy to other devices only after you turn on Sync Across Devices in Focus Settings. The article presents that as a switch you enable, not as behavior that is always on. | Statistics are "Basic" vs "Unlimited." What that removes is not stated. | Open API focus queries longer than 30 days have `from` moved to 30 days before `to`. | Mobile and desktop, plus web tab title | `[CHANGELOG]` `[DOCS]` |
| White noise | During focus, a Sound control opens white-noise choices. A 2023 update named "Wooden Fish" as one added sound. The article's rain, wind, water, birds, and café examples explain what white noise means. They are not a catalog of sound names. | Not stated | The full sound list was not extracted | Mobile and desktop. "Not yet available on the Web version." | `[DOCS]` `[CHANGELOG]` |
| Full-screen focus | Styles named in help: Simple Digital, Page Flip Clock, and Pixel Clock. Desktop has a full-screen mode. A 2023 Windows update named a mini window with Circular and Minimalist styles. | Not stated | Not stated | Mobile styles vs desktop. Mini window was described for Windows. Linux parity is a community complaint, not an official matrix. | `[DOCS]` `[CHANGELOG]` `[COMMUNITY]` |
| Habit | A habit has a name, icon, color, encouragement text, a repeat rule, reminders, a goal, a step, and a unit. The API example type is `Boolean` with goal 1 and unit `Count`. Help says you can require a habit three times a week, or set a quantity goal such as 5 words or 2 pages. Gallery has 60+ habits in life, health, exercise, and mentality. You can archive, delete, share, and start focus. Check-ins can show on Today and Next 7 Days. A date filter picks which day's habits to check. Habits can sit in sections. The all-habits statistics page shows the current week to every account. Premium members can open the whole month. That week-and-month page is mobile only. One habit's own page still has a monthly check-in table and a yearly heat map. | Free, with a cap. The month-wide all-habits view is Premium. | 5 Free, 299 Premium. `[OFFICIAL]` API habit name max 1000 characters. | Mobile and desktop. The week-versus-month all-habits view is mobile only. Apple Health import is iOS only and does not sync to other devices. | `[OFFICIAL]` `[DOCS]` |
| Countdown | A dated item with types that the management article groups as Countdown, Anniversary, Birthday, and Holiday. Fields include icon, name, date, reminder, repeat, counting mode, and a note. You can pin one. Ignore-year and show-age exist on the API object. | Free, with a cap | 5 Free, 299 Premium | Mobile and desktop | `[OFFICIAL]` `[DOCS]` |
| Statistics | Features page: track tasks, focus duration, and habit logs. Pricing row is Basic vs Unlimited. An older marketing block mentioned historical statistics as a Premium reason. The current pricing page does not define "basic." The Habit Review article does define one split: the current week of all-habits statistics is available without Premium, and the whole month is Premium, on mobile only. | Basic Free, Unlimited Premium, except the habit week-versus-month rule above, which is explicit. | Not stated for tasks and focus | Habit week and month views: mobile only | `[OFFICIAL]` `[DOCS]` |
| Achievements and badges | Scores and badges for membership months, days the app was opened, tasks completed, focus minutes, invitations, and habit check-ins. Task badge progress counts at most 50 completions a day. Habit badge progress counts at most 10 check-ins a day. Focus badges count both Pomo and stopwatch minutes. Levels can be exchanged for themes. | Not stated. VIP badges require paid months, which means they require a paid membership by definition. | Thresholds in the Badges article: VIP at 1, 12, 24, 36, 72, and 144 months; days opened at 3, 7, 21, 50, 200, 1000; tasks at 5, 10, 50, 200, 1000, 5000; focus minutes at 25, 100, 500, 2000, 10000, 50000; invites at 1, 5, 20, 100, 500, 1000; check-ins at 3, 7, 21, 100, 500, 2000. | Not itemized | `[DOCS]` |
| AI Assistant | A chat that can read tasks, habits, and focus records, then create tasks, break down a project, plan, or review postponed work. You can retry, edit a sent message, and keep multiple chats. | Premium. The "AI Features" pricing icon is off on Free. | A numeric monthly quota is described for other AI features, not given as a number for the assistant in the pages read. | Mobile. Desktop: macOS and Web. "AI Assistant is not yet supported on Windows." | `[OFFICIAL]` `[DOCS]` |
| AI Voice Add | Speak a sentence. The model fills title, date, time, list, tags, and priority, and can split one utterance into several tasks. If it fails, it falls back to the plain transcript. This is a different control from recording mode. | Premium, under AI Features | Monthly quota, number not stated. Reset the next month. Processing usually 1–2 seconds, or 3–5 for a long utterance. | Mobile | `[DOCS]` `[OFFICIAL]` |
| Voice input and recording mode | A long press on + starts voice input. The add-tasks article says iOS shows a live transcript and Android does not, for now. Dragging left or right from that press enters recording mode. Recording mode can keep going while you type, then you tap stop. | Saving the transcript is not given a tier. Saving both the audio file and the text requires what that article calls a Pro membership. The pricing page calls the paid plan Premium, not Pro. | 30 minutes, then it saves automatically. iOS 17 or later. Some Android models do not support recording mode. | Mobile | `[DOCS]` |
| Transcribe and summarize | An audio attachment can become timestamped text and a summary. | Premium, under AI Features | Monthly quota, number not stated. Under 1 minute of audio usually finishes in under 10 seconds. A 30-minute recording may take 1–3 minutes. 30+ languages, including English, Japanese, Korean, French, German, and Spanish. The page says recordings are not stored for model training. | The official social post said mobile v8.0.70+ and desktop v8.0.60+. Android MP3 timestamps can be slightly off. | `[DOCS]` `[OFFICIAL]` |

### 2.5 Collaboration

There is no Team SKU on the pricing page. A team, in the help article, means the people on a shared list. The API batch error `NO_TEAM_PERMISSION` shows that the server also has a team-permission check. What product surface that error belongs to is not explained. `[DOCS]` `[OFFICIAL]`

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| Share a list | The owner invites people by email or name, or by a link that the owner must approve. Invitees who do not have an account can join from the email link. A FAQ sentence mentions Dida365 for one unregistered path. That is a China-product name on an English page. | Free can share. Premium raises the member cap. Only the owner needs Premium to use the higher cap. Joining does not require Premium. Non-premium members do not get Premium features. | Pricing row "Member Count" is 2 Free and 29 Premium. FAQ says a free user can add one shared member, and a premium user can add up to 29. See section 3 for the conflict. | Mobile and desktop | `[OFFICIAL]` `[DOCS]` |
| Permission | Three levels in the FAQ: commentable, read-only, and editable. The API project field is `read`, `write`, or `comment`. | Not stated | Three levels | Not itemized | `[DOCS]` |
| Assign | Any member of the shared list can assign a task to a member. Bulk assign exists. The assignee gets a notification. Assigned to Me collects these tasks. | Not stated | Not stated | Mobile and desktop | `[DOCS]` |
| Comment | Comments exist on shared lists and, the task article says, can also be used as notes on a private list. API comments have text, a created time, and an optional reply-to comment. | Free. The pricing icon for "Comment" is on for both columns. | Not stated | Not itemized | `[OFFICIAL]` `[DOCS]` |
| Activity | "List/Task Activities" is a pricing row. The older marketing text said you can view previous changes on tasks and lists. | Premium. Icon is off on Free. | Not stated | Not itemized | `[OFFICIAL]` |
| Shared-list notifications | Per list, you can be notified for complete or undo, add a task or note, and delete or move a task or note. Reminder scope is All Tasks, All Tasks except those assigned to others, Tasks Assigned to Me, or No Reminders. The same four choices exist for whether those tasks appear in All, Today, Tomorrow, and Next 7 Days. | Not stated | Not stated | Mobile and desktop | `[DOCS]` |
| Privacy of a share | Only the shared list is visible to members. The rest of the account stays private. | Not a tier | Not stated | Not itemized | `[DOCS]` |

### 2.6 Platforms and clients

| Client | What the sources actually say | Source |
| --- | --- | --- |
| Web | Linked from the download page. Backup, email-to-task, and AI Assistant settings are documented on the web. Focus time can show in the browser tab. | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| iOS and iPadOS | Download page. Lock-screen widgets from iOS 16. Interactive widgets and StandBy were described for iOS 17. Control Center controls were described for iOS 18. The US App Store listing fetched 2026-10-08 shows version 8.2.20 dated Sep 29. Its What's New text names iOS 27, Siri AI task creation, extra-large widgets, and editing one recurring event or this event plus future events. The listing does not print the year on that date. Location reminder, Siri, Apple Health, and Live Activities are documented. The same listing sells Annual Premium at $49.99 and Monthly Premium at $4.99. | `[OFFICIAL]` `[DOCS]` `[CHANGELOG]` |
| Android | Download page. Location reminder steps exist in the FAQ. Wear OS install is "install on phone and watch from Google Play, then sign in on the phone." Custom dark accent is documented. | `[OFFICIAL]` `[DOCS]` |
| Windows | Download page. Global shortcut. Sticky notes. A 2023 update described a focus mini window and "open in a new window." AI Assistant is explicitly not supported. | `[OFFICIAL]` `[DOCS]` |
| macOS | Download page. Global shortcut. Local calendars. Desktop widgets on macOS 14. The four-way search type chooser is not supported on Mac. Command menu (⌘K / Ctrl+K) is documented with the note "Mac application does not currently support this feature." Those two Mac gaps are different features. | `[OFFICIAL]` `[DOCS]` |
| Linux | Named on the download page. Two-step verification requires Linux 6.0.20 or later. No official feature-parity table was found. | `[OFFICIAL]` `[DOCS]` |
| Apple Watch | Complications and Smart Stack widgets for tasks and habits, one-tap complete, and a double-tap action described for watchOS 11. Live Activities from iOS can show on the watch. | `[DOCS]` `[CHANGELOG]` |
| Wear OS | FAQ install steps only. No feature list comparable to the Apple Watch articles. | `[DOCS]` |
| Browser extension | Download page has an Extension section. The features page says you can add a task by right-clicking selected text. Browser names were not in the extracted text. | `[OFFICIAL]` |
| Email to task | Two addresses. `todo@mail.ticktick.com` accepts mail only from the account's own address. A personal inbound address accepts mail from any account. Subject and body become the task. | `[DOCS]` |
| Share extension / Siri | iOS can add tasks through Siri. "Auto-import from Reminders" copies the default Reminders list into TickTick and deletes the original reminder. URL scheme commands are add task, show a smart list, and search. | `[DOCS]` |
| Widgets | iOS home and lock screen, Android, macOS, Windows, and Apple Watch are documented. Named widget families include tasks, add-task, completion counts, calendar day and month, Eisenhower, habits, and focus distribution. Pricing row is Basic vs Unlimited, without a list of which widgets are basic. | `[DOCS]` `[OFFICIAL]` |
| Desktop sticky notes | Open a task as a sticky note, or create one with a shortcut you set. A 2024 Windows-only note said sticky notes could start focus. The article does not name Linux. | `[DOCS]` `[CHANGELOG]` |
| Clipboard capture | If the clipboard contains a time, opening the app can offer to add a task. Multiple lines can become a batch of tasks. | `[DOCS]` |
| Global quick add | Shift+Alt+A opens the add bar. The article names Windows and Mac. | `[DOCS]` |

Parity gaps that a fetched page states outright:

- AI Assistant: no Windows. `[DOCS]`
- White noise: no web. `[DOCS]`
- Local device calendars: Android, iOS, and Mac only. `[DOCS]`
- Apple Health data: iOS 16+ and app 7.5.20+, last six months, not synced to other devices, display format not customizable. `[DOCS]`
- Search type chooser: not on Mac. `[DOCS]`
- Command menu: the shortcuts article says the Mac app does not support it. `[DOCS]`
- Matrix quadrant menu: desktop article only lists Sort, while mobile lists more actions. `[DOCS]`
- Location reminder: features page says iOS only; help says iOS and Android. `[OFFICIAL]` `[DOCS]`
- Linux vs Windows: no official gap list. Community reports say the Linux build lags, and that quick add and the advanced focus timer (sounds and mini mode) are missing. `[COMMUNITY]`

### 2.7 Integrations and automation

The pricing table's "Integrations" icon is off for Free and on for Premium. Individual help articles usually do not repeat that gate. If you are deciding what a free account can connect, trust the pricing icon and treat the help articles as behavior, not as proof that the connection is free. `[OFFICIAL]` `[DOCS]`

| Integration | Direction and behavior | Source |
| --- | --- | --- |
| Google Calendar subscribe | Account connect. Events stay calendar events, not tasks. They show under Subscribed Calendars, and in Today, Next 7 Days, and the calendar. Add, edit, and delete in TickTick sync back to Google. The FAQ says every calendar in the Google account can be subscribed this way. | `[DOCS]` |
| Google Calendar task sync | A separate mode, "Integration with Google Calendar." Timed TickTick tasks become Google events. Google events with a time today or later become TickTick tasks. Events dated before today are not pulled in. Working Location and Out of Office events are not synced. Default tags and a default list can be set. Disconnecting does not delete items that were already copied. The help tip says this mode needs Android and iOS v7200, and Windows, Mac, and Web v5500. One FAQ answer says only one calendar can be integrated at a time. A later FAQ answer says you can connect up to 3 Google accounts, with up to 9 calendars under each account. Those two sentences are both in the same article. | `[DOCS]` |
| Outlook | Subscribe. The fetched article describes viewing events. It does not describe the two-way task sync that the Google article describes. | `[DOCS]` |
| iCloud | Subscribe with an Apple app-specific password. Adding an event in TickTick syncs to iCloud. | `[DOCS]` |
| Exchange | A help article exists. The fetched heading confirms the name. Detailed field rules were not extracted. | `[DOCS]` |
| CalDAV | Enter account, password, server address, and name. | `[DOCS]` |
| URL feed | Any calendar URL, including a public Google link or a Todoist project feed. | `[DOCS]` |
| Local calendar | On Android, iOS, and Mac. Show, show only in calendar, or hide. | `[DOCS]` |
| Subscribe TickTick outward | A help article, "Subscribing to TickTick in Third-Party Calendars," exists. The feed format was not extracted in this pass. | `[DOCS]` |
| Notion | Two-way sync with a Notion database, either a TickTick-provided template or an existing database. Mapped fields include checkbox, name, date, and description. Initial sync is the 200 most recently edited Notion items and 200 incomplete TickTick tasks. Up to 9 databases. Extra Notion properties can show on the task, at most 4, and those extras are view-only. You can connect more than one Notion workspace. | `[DOCS]` |
| Telegram | Bot `@ticktickappbot`. Text messages and forwards become tasks. Images, video, voice, stickers, and files do not. Quick Add syntax in the message can set date, priority, tag, list, and assignee. Otherwise the task uses the default list. | `[DOCS]` |
| Spark email | On iOS and macOS, export an email to TickTick as a link or as the email text, with a due date. The connection is per device. | `[DOCS]` |
| Email inbound | `todo@mail.ticktick.com` or a personal address. See platforms. | `[DOCS]` |
| Siri and URL scheme | Add task, show smart list, search. Callbacks `x-success`, `x-error`, `x-cancel`. | `[DOCS]` |
| Apple Health | Import selected health data into the iOS calendar, and optionally write focus time into Apple Health Mindfulness. | `[DOCS]` |
| Import files | Web import names Todoist, Microsoft To Do, Wunderlist, OmniFocus, Toodledo, and iCal, "and more." iOS can import Reminders, Todoist, and Microsoft To Do directly. Android can import Todoist, Microsoft To Do, and Any.do directly. The file format inside those backups is not specified beyond "upload the backup file." | `[DOCS]` |
| Weibo | Features page says you can add a task by mentioning @我的滴答清单 on Weibo. That is a China-network behavior on the English features page. | `[OFFICIAL]` |
| Zapier, IFTTT, Make, Slack, Gmail | No help article in the 96-article English index uses these names. Not documented as current product integrations. | `[UNVERIFIED]` |
| Official MCP, CLI, and Open API | Section 6. | `[DOCS]` |

### 2.8 Sync, offline, data, and security

| Topic | What is documented | Source |
| --- | --- | --- |
| Sync | The Free card lists cross-platform sync. Attachments sync after upload. A focus session copies start, pause, and end to other devices only when Sync Across Devices is turned on in Focus Settings. A pull-to-refresh or a sync button is described by users, not by the help articles read here. | `[OFFICIAL]` `[DOCS]` `[COMMUNITY]` |
| Offline | No help article states an offline mode or an offline queue. The word "offline" in Task Details is an example sentence about an event, not a feature. | `[UNVERIFIED]` |
| Backup | Web: Settings, Account, Backup & Import. Generate a backup, import a backup, or import another app. FAQ describes merging two accounts by backup then import. Security page says AWS keeps automatic backups with point-in-time recovery, and you can also make a manual web backup. The backup file format is not named. | `[DOCS]` `[OFFICIAL]` |
| Account deletion | Avatar, Settings, Account and Security on the website. Privacy policy: personal data is deleted, but backup archives keep it for 90 days. Subscription and transaction records are kept after deletion. | `[OFFICIAL]` |
| Encryption | Security page: data is stored and encrypted at rest on AWS in the United States. Privacy policy: SSL protects data in transit. Neither page says the vendor cannot read task text. That would be end-to-end encryption, and it is not claimed. | `[OFFICIAL]` |
| Hosting and breach | AWS in the United States. TickTick says it will not share data with third parties without permission, and that hosting partners used when necessary are GDPR-compliant. Breach notice by official notification or email within 72 hours. | `[OFFICIAL]` |
| AI data | Text, audio, and transcripts are collected when you start an AI action. Third-party AI providers process them to produce the output. The privacy policy says this data is not used to train TickTick's models. Assistant chat history is kept for that conversation and can be deleted. Voice Add and transcription articles say the audio for that request is not kept for training. | `[OFFICIAL]` `[DOCS]` |
| Location | Collected only if you grant background location, and used for location reminders. | `[OFFICIAL]` |
| Cookies | Required for the website. Disabling them can break features. | `[OFFICIAL]` |
| Sign-in | Email registration with a verification link. Password reset by email link or phone verification code. Login devices can be managed on the web. Social login buttons are not listed in the sign-up article. | `[DOCS]` |
| Two-step verification | Email code or an authenticator app, plus backup codes. Required for login, linking an account, changing a linked account, and deleting the account. Minimum versions named: iOS 7.4.50, Android 7.4.5.0, Windows 6.1.30, macOS 6.1.20, Linux 6.0.20. | `[DOCS]` |
| Data rights | TickTick says you own your content and TickTick owns the software and databases. | `[OFFICIAL]` |

### 2.9 UX and customization

| Feature | What it does | Tier | Limits | Platforms | Source |
| --- | --- | --- | --- | --- | --- |
| Themes | Features page says 40+ themes. Dark mode can use a chosen accent color. Achievement levels can be redeemed for themes. List backgrounds are a separate per-list image or style, added in Version 8.0. | Themes row is Basic vs Unlimited. Which themes are basic is not stated. | "40+" is the only count | Desktop and mobile appearance settings. Community reports say theme and background choices do not sync across devices. | `[OFFICIAL]` `[CHANGELOG]` `[COMMUNITY]` |
| Font size | Smaller sizes on iOS and Android, under Settings, Appearance, Display, Font Size. | Not stated | Not stated | iOS and Android named | `[CHANGELOG]` |
| Smart recognition | A toggle. It parses a date, a time, a repeat, an early reminder, and a postponed reminder out of text typed in quick add or spoken. Ambiguous times resolve to the next valid time. Example from the article: at 16:00, "remind me at 9pm" becomes 21:00 today. You can choose whether the recognized words stay in the title. | Free card lists "NLP," which means natural language parsing. | Not stated | Mobile and desktop | `[OFFICIAL]` `[DOCS]` |
| Keyboard shortcuts | Press `?` to see the list. Some shortcuts can be edited in Settings, in the sidebar, or from the command menu. Gray shortcuts cannot be edited. The article does not print the default map. Command menu is ⌘K or Ctrl+K, and the same article says the Mac app does not support that menu. | Not stated | The default map was not published in the article | Desktop. Mac gap as noted. | `[DOCS]` |
| Languages | The website footer offers English, Simplified Chinese, Japanese, French, Korean, Russian, Traditional Chinese, and Brazilian Portuguese. That is the marketing site. The US App Store listing says English plus 40 more. It does not name them. The in-app language picker was not on a page fetched here. AI transcription names 30+ languages. | Not stated | Site footer: 8 named languages. App Store: English plus 40, unnamed. | Website and the store listing | `[OFFICIAL]` `[DOCS]` |
| Notifications | In-app pop-up, email, constant reminder, location, daily review, and per-list collaboration notices. Badge count on the dock can be limited to a chosen set of tasks. | See reminder rows | See reminder caps | Per feature | `[DOCS]` |
| Tab bar | Pomodoro, Habit, and AI can be added to or removed from the mobile tab bar or the desktop sidebar. The design article says less-used features can sit behind More. | Not stated | Not stated | Mobile and desktop | `[DOCS]` |
| Accessibility | No help article fetched here describes VoiceOver, TalkBack, keyboard-only use beyond shortcuts, or contrast. | `[UNVERIFIED]` | | | |

### 2.10 Pricing and commercial terms

Fetched HTML for both `https://ticktick.com/upgrade` and `https://ticktick.com/upgrade?language=en_us` on 2026-10-08 contains US$49.99 per year and "less than US$4.17/month." It does not contain $35.99. A web-search snippet the same day still quoted $35.99 for the `en_us` URL. That snippet does not match the HTML. `[OFFICIAL]`

Education discount: 25% off one year, stated as US$37.99 after the discount, for eligible students, faculty, and staff, after a document review. `[OFFICIAL]`

Gift cards buy a year of Premium. The FAQ says buying gift cards for a group is how you "purchase premium for the entire team." That is still individual Premium, not a team plan. `[DOCS]`

Refunds: Google Play, PayPal, and Stripe, within 14 days, requested in the product. After 14 days, no refund from TickTick. App Store refunds go through Apple. When Premium ends, data stays and Premium behavior stops. You cannot switch a live subscription from one payment platform to another. You cancel and resubscribe. `[OFFICIAL]` `[DOCS]`

Monthly billing exists in the subscription terms as a possible billing cycle. The pricing page fetched here only prints the annual price. The US App Store listing, fetched the same day, sells Monthly TickTick Premium at $4.99 and Annual TickTick Premium at $49.99. The Google Play page fetched the same day lists in-app purchases and does not print either dollar amount. `[OFFICIAL]`

## 3. Free vs Premium

Icons were read from the comparison-row markup on `https://ticktick.com/upgrade` on 2026-10-08. A checkmark path and a cross path are different SVG shapes. Both columns were hashed.

| Capability | Free | Premium | Conflict or note |
| --- | --- | --- | --- |
| Price | US$0 | US$49.99 per year on both English pricing URLs fetched, and on the US App Store annual plan | Search snippet of $35.99 does not match the HTML. US App Store also lists Monthly TickTick Premium at $4.99. The web pricing page does not print that monthly amount. Play did not print a price. |
| Lists | 9 | 299 | 2014 blog said 19. Ignore the blog. |
| Tasks and notes per list | 99 | 999 | One shared cap for tasks and notes. |
| Attachments per day | 1 | 199 on the pricing page and in the Task Details article | FAQ says Premium is 99 per day. The US App Store listing also says 99 per day. Play does not print this number. |
| Attachment size and per-task count | Not on the pricing page | Not on the pricing page | FAQ: 10 MB Free, 20 MB Premium, up to 20 attachments per task. Task Details: 10 MB Free, 20 MB Premium, and 39 attachments per task on Premium. |
| Checklist items per task | 19 | 199 | App Store and Play say "199 subtasks per task" for Premium. They do not define subtask. See section 2.1. |
| Reminders per task | 2 | 5 | |
| Members | 2 | 29 | FAQ: Free can add one other person; Premium can add up to 29. Teams article: only the owner must be Premium for the higher cap. The pricing page never says whether "2" includes the owner. |
| Habits | 5 | 299 | |
| Countdowns | 5 | 299 | |
| Priority, tags, subtasks, repeat, comments, templates | On | On | |
| Duration, constant reminder, checklist-item reminder, list/task activity, filters, AI features, timeline, integrations | Off | On | |
| Calendar, Eisenhower Matrix, widgets, themes, statistics | Basic | Unlimited | "Basic" and "Unlimited" are not defined on the page. Habit Review is the exception: the current week is available, and the whole month is Premium, on mobile. |
| List and Kanban, natural-language parsing, task reminders, cross-platform sync | Named in the Free card | Included | |
| Multiple calendar views, task duration, email reminder, themes | Not in the Free card | Named in the Premium card | Themes also appear as Basic vs Unlimited in the table. |
| Data after expiry | Stays | Premium behavior stops | `[OFFICIAL]` |
| Education price | | US$37.99 for one year after approval | `[OFFICIAL]` |

## 4. Data model

Objects below are from the Open API definitions unless marked `[INFERRED]`.

**Account.** Email, password, optional phone for reset codes, two-step method, backup codes, login devices, time zone preference, Premium state. `[DOCS]` `[INFERRED]` for "Premium state" as a field. The API exposes it only indirectly, through quota errors such as `EXCEED_QUOTA`.

**Folder (project group).** id, name (max 64 characters), sortOrder, showAll, viewMode (`list`, `kanban`, `timeline`). Contains lists. `[DOCS]`

**List (project).** id, name, color, sortOrder, closed, groupId, viewMode, kind (`TASK` or `NOTE`), permission (`read`, `write`, `comment`). Contains sections, tasks, and members. `[DOCS]`

**Section (column).** id, projectId, name (max 1000 characters), sortOrder. `[DOCS]`

**Task.** id, projectId, parentId, title, content, desc, kind (`TEXT`, `NOTE`, `CHECKLIST`), isAllDay, startDate, dueDate, timeZone, priority (0, 1, 3, 5), status (-1, 0, 2), tags, reminders, repeatFlag, repeatFrom (`0`, `1`, `2`), sortOrder, items, assigneeUsername, completedTime, focusSummaries. `[DOCS]`

**Checklist item.** id, title, status (0 or 1), completedTime, isAllDay, startDate, timeZone, sortOrder. Belongs to one task. `[DOCS]`

**Subtask.** In the product article, a subtask is a task with a parent, up to five levels, and it has the same fields as a task. `[DOCS]` The API checklist item is a different object that the schema also calls a subtask.

**Tag.** name and label, each max 64 characters. The stored name is lowercased and trimmed, and the lowercased label must equal the name. Also color, sortOrder, parent, type (1 personal, 2 team). `[DOCS]`

**Filter.** A saved query with normal or advanced (AND/OR) conditions over list, tag, date, priority, and keyword. Not in the Open API schema that was fetched. `[DOCS]` `[INFERRED]` that it is stored server-side because it syncs as a sidebar object. That storage is not proven by a schema.

**Smart list.** Today, Tomorrow, Next 7 Days, Inbox, Assigned to Me. Inbox is addressable as the project id `inbox` in the undone-task API. The others are views, not projects. `[DOCS]`

**Comment.** id, userId, title (the text), createdTime, modifiedTime, replyCommentId, replyUserId. Belongs to a task. `[DOCS]`

**Member.** A project member with a username. The assign API takes `assigneeUsername`. `[DOCS]`

**Habit.** id, name (max 1000), icon, color, sortOrder, status, encouragement, type, goal, step, unit, repeatRule, reminders, recordEnable, sectionId, targetDays, targetStartDate, completedCycles, exDates, style, totals, archive time. `[DOCS]`

**Habit section.** id, name, sortOrder. `[DOCS]`

**Habit check-in.** Per habit, per year, with entries stamped `YYYYMMDD`, a value, a goal, and a status. `[DOCS]`

**Focus record.** id, type (0 pomo, 1 timing), task or habit or timer link, note (max 5000 on create), start, end, pause duration, duration, status. `[DOCS]`

**Countdown.** id, name, date `YYYYMMDD`, type, icon, color, reminders, repeatFlag, remark, ignoreYear, showAge, timerMode, status. The API fetched here is read-only. `[DOCS]`

**Calendar subscription and Notion link.** Documented in help, not in the Open API resource list. `[DOCS]` `[INFERRED]` as separate stored connections.

**Attachment.** Documented in the FAQ, not as an Open API schema in the file that was fetched. `[DOCS]`

## 5. Core user flows

### Capture

1. The user types a title in a list, in the global add bar (Shift+Alt+A on Windows or Mac), in a widget, by voice, from the clipboard, from a forwarded email, from Telegram, from Spark, from Siri, or from the browser right-click action.
2. If Smart Recognition is on, TickTick pulls a date, a time, a repeat, or a reminder phrase out of that text and can delete the phrase from the title.
3. If the user does not pick a list, the task goes to the default list, or to Inbox when the API omits a project.
4. AI Voice Add, on mobile, can split one spoken paragraph into several tasks and fill list, tags, and priority. AI Assistant can do the same from a typed instruction on mobile, Mac, and web.

### Organize

1. The user creates folders and lists, up to the tier cap, and can mark a list as a note list.
2. Inside a list, the user adds sections or switches to Kanban, where the columns are those sections or a grouping.
3. The user sets priority, tags, and checklist items, and nests subtasks up to five levels.
4. For a shared list, the owner invites people and sets each person to read, comment, or edit. Members assign tasks.
5. Filters, on Premium, save a query such as "tag and date and priority" so the same slice can be reopened.

### Plan

1. The user sets a due date, and on Premium a start and end.
2. The user adds up to 2 reminders on Free or 5 on Premium, plus an end reminder if the task has a duration.
3. The user picks a repeat rule and, if needed, an end date or a count.
4. The user looks at Today, the calendar, the matrix, or Suggested Tasks, and moves work onto today or postpones a selection.
5. Subscribed calendars and, on Premium, integrations such as Google two-way sync and Notion, put outside events next to tasks.

### Execute

1. The user completes a task, a checklist line, or a habit check-in.
2. Optionally they start a Pomodoro or a stopwatch, with white noise on mobile or desktop, linked to the task or habit.
3. A reminder pop-up can dismiss, snooze, complete, or start focus. Constant reminder, on Premium and on mobile, keeps going until the user handles it.
4. On a watch, a complication can complete a task or a habit without opening the phone.

### Review

1. Focus statistics and habit history show what was done. The pricing row calls statistics Basic on Free and Unlimited on Premium, and it does not define that cut. Habit Review is specific: the current week of all habits is available, and the whole month is Premium, on mobile.
2. Suggested Tasks surfaces items that were postponed or recently captured and never scheduled.
3. Search, or a Premium filter, finds an older task.
4. Badges record cumulative tasks, focus minutes, and habit check-ins, with the daily caps in section 2.4.
5. List and task activity history is Premium.

## 6. Integration and API spec

Official document fetched: `https://developer.ticktick.com/docs/openapi.md` (the docsify page `https://developer.ticktick.com/docs#/openapi`). Host for API calls in the examples: `api.ticktick.com`. `[DOCS]`

### Auth

Two ways:

1. Personal token. Web app, avatar, Settings, Account, API Token. Send `Authorization: Bearer`. The help text for MCP says the same token is under Settings, Account & Security, API Token. The Open API page says Settings, Account, API Token. Both are official. The menu label may differ by client version.
2. OAuth 2.0 authorization code, for an app registered at `https://developer.ticktick.com/manage`.
   - Authorize: `GET https://ticktick.com/oauth/authorize` with `client_id`, `scope`, `state`, `redirect_uri`, `response_type=code`.
   - Token: `POST https://ticktick.com/oauth/token`, form body, client id and secret as HTTP Basic auth. `grant_type` is only `authorization_code`.
   - Revoke: `POST https://api.ticktick.com/oauth/revoke` with the token.
   - Documented scopes: `tasks:read` and `tasks:write` only. The same token is used for habit, focus, tag, and countdown routes. The doc does not publish separate scopes for those.

No rate limit is stated anywhere in that markdown. `[DOCS]`

### Official endpoints

Base path `/open/v1` on `api.ticktick.com`.

| Method and path | Behavior and limit |
| --- | --- |
| `POST /open/v1/preference` | Returns the user IANA time zone. |
| `GET /open/v1/project/{projectId}/task/{taskId}` | One task. |
| `POST /open/v1/task` | Create a task. Body requires `title` and `projectId`. The create table says priority defaults to `0`. |
| `POST /open/v1/task/{taskId}` | Update a task. The method is POST. The body requires `id` and `projectId`. The update table says priority defaults to `normal`. Those two default sentences disagree. |
| `POST /open/v1/project/{projectId}/task/{taskId}/complete` | Complete one task. |
| `POST /open/v1/task/completeTasks` | Complete up to 50 tasks in one project. Empty project id means Inbox. Only the first 50 ids are processed. |
| `DELETE /open/v1/project/{projectId}/task/{taskId}` | Delete one task. |
| `POST /open/v1/task/move` | Move tasks between projects. |
| `POST /open/v1/task/batch` | Add up to 50 and update up to 50. Errors include `EXISTED`, `DELETED`, `NOT_EXISTED`, `PROJECT_MOVE_ERROR`, `EXCEED_QUOTA`, `UNKNOWN`, `NO_PROJECT_PERMISSION`, `NO_TEAM_PERMISSION`. |
| `POST /open/v1/task/assign` and `/unassign` | Assign by project member username. |
| `POST /open/v1/task/completed` | Completed tasks in a time range. At most 200. |
| `POST /open/v1/task/filter` | At most 200. Filters by project ids, start and end on the task start date, priority, tags (all of the listed tags), kind, and status. |
| `POST /open/v1/task/undone` | Undone tasks. Start and end are required. The range may be at most 14 days. An invalid range returns an empty array. `inbox` is allowed as a project id. |
| `POST /open/v1/task/search` | Keyword plus project, tag, status, and due range. A blank keyword returns an empty array. |
| `GET/POST/DELETE .../comments` and `.../comment` | Read, add, and delete comments. |
| `GET/POST /open/v1/project` and `GET/POST/DELETE /open/v1/project/{id}` | List, create, update, delete lists. If either `offset` or `limit` is sent, an omitted or negative offset becomes 0, and an omitted or negative limit becomes 200. |
| `GET /open/v1/project/{id}/data` | Project plus undone tasks plus columns. |
| `GET /open/v1/project/{id}/members` | Members. |
| `GET/POST /open/v1/project/group` and update/delete by id | Folders. Name max 64 characters. |
| `GET/POST /open/v1/project/{id}/column` and `POST .../column/{columnId}` | List, create, and update sections. No delete-column route in the doc. |
| `GET /open/v1/tag` and `POST /open/v1/tag` | List and create tags. No update or delete tag route in this doc. MCP documents those extra tag operations. |
| `GET/POST /open/v1/focus` and `GET/DELETE /open/v1/focus/{id}` | Read, create, and delete focus records. Create note max 5000 characters. If the query range is longer than 30 days, the server moves `from` to 30 days before `to`. No update route in this doc. |
| `GET /open/v1/countdown` | List countdowns. No create or update route. |
| `GET/POST /open/v1/habit`, `GET/POST /open/v1/habit/{id}`, check-in routes, `GET /open/v1/habit/sections` | Read, create, and update habits, read sections, write check-ins. Habit name max 1000 characters. No delete-habit route. |

### What this API does not do

Stated by absence from the official endpoint list, or stated in the MCP and CLI articles:

- No published rate limit.
- No attachment upload or download.
- No smart-filter object, no theme, no widget, no calendar-subscription, and no Notion or Google connection endpoints.
- No webhook or push subscription.
- No countdown create, update, or delete.
- No habit delete, no section delete, no tag update or delete on the Open API itself.
- No focus update on the Open API itself. MCP's `update_focus` says the duration cannot be changed.
- MCP and the CLI both say they cover basic tasks, lists, habits, focus records, and countdowns, and that other advanced features are not supported. MCP complete-batch is 20 tasks, which is stricter than the Open API's 50. Habit check-ins through MCP are limited to the past 90 days. Focus queries through MCP cover at most one month per call. `[DOCS]`
- Scopes in the OAuth section are only `tasks:read` and `tasks:write`, even though the routes go beyond tasks.

The private session API that the web app uses is not a supported API. It is not specified here.

### MCP and CLI

MCP URL: `https://mcp.ticktick.com`. Transport is Streamable HTTP. SSE is not supported. Auth is OAuth or a bearer token. Documented clients include Claude, ChatGPT, Gemini (beta), Grok, Perplexity, Claude Code, Cursor, VS Code, Codex CLI, TRAE, and Antigravity. OAuth refresh means you do not sign in on every restart unless the token was revoked or expired. `[DOCS]`

CLI: `npm install -g @ticktick/ticktick-cli`. `ticktick auth login` uses browser OAuth. `ticktick auth token` sets a token. Commands shown in the help article: `ticktick project list`, `ticktick task create`, `ticktick task complete`, `ticktick task delete`. The article points to the npm page for the full command list. `[DOCS]`

## 7. Known limitations and complaints

Documented limits, not opinions:

- Free accounts run into 9 lists, 99 items per list, 19 checklist lines, 2 reminders, 1 attachment upload a day, 5 habits, and 5 countdowns. `[OFFICIAL]`
- Premium attachment numbers disagree across official pages. The pricing page and the Task Details article say 199 uploads a day. The FAQ and the US App Store listing say 99 a day. Per-task caps are 20 in the FAQ and 39 in Task Details. File size is 10 MB Free and 20 MB Premium in both help texts, and is absent from the pricing page. The Play listing fetched the same day does not print an attachment number. `[OFFICIAL]` `[DOCS]`
- Google two-way sync skips Working Location, Out of Office, and events before today. It needs Android and iOS v7200, and Windows, Mac, and Web v5500. The same article says both "only one calendar can be integrated at a time" and "up to 3 accounts, with up to 9 calendars under each." `[DOCS]`
- Notion's first sync is 200 items each way, at most 9 databases, and at most 4 extra properties shown, view-only. `[DOCS]`
- Telegram accepts text only. `[DOCS]`
- White noise is absent on the web. AI Assistant is absent on Windows. Local calendars are absent on Windows, Linux, and the web. `[DOCS]`
- Apple Health does not leave the iPhone. `[DOCS]`
- Constant reminder depends on OS permission. On Android, OEM battery limits are called out as a reason reminders fail. `[DOCS]`
- After Premium expires, data remains and Premium behavior stops. The docs do not say what happens to the 10th list or the 6th habit if you are over the free cap. `[OFFICIAL]` `[UNVERIFIED]` for the over-cap case.

Community reports, which are not product rules:

- Sync between Android and desktop sometimes needs a manual refresh, and new lists or habits can show an unsynced warning. Threads from 2025. `[COMMUNITY]`
- Reminders on Android can arrive only when the phone is unlocked. `[COMMUNITY]`
- A reminder acknowledged on one device can still fire on another. `[COMMUNITY]`
- Themes and list backgrounds do not follow the account to a new device. `[COMMUNITY]`
- Linux builds are described by users as behind Windows, without sticky notes, without the same quick-add shortcut, and without focus sounds and mini mode. `[COMMUNITY]`
- Linux Google sign-in has frozen for some Snap and Fedora installs. `[COMMUNITY]`
- Renewal notices and support-message sounds are hard to mute. `[COMMUNITY]`

## 8. Competitive context

Compared only on facts fetched on 2026-10-08. Where a price did not survive text extraction, it is omitted.

| Topic | TickTick | Todoist | Things | Notion | Microsoft To Do |
| --- | --- | --- | --- | --- | --- |
| Price fetched | US$0 and US$49.99 per year on the web. Education US$37.99 per year. US App Store also lists $4.99 per month. | Beginner is free. Pro and Business prices did not appear in the extracted text of the pricing page, so they are not quoted. | The homepage links to a pricing page and sells Mac, iPhone and Watch, iPad, and Vision Pro separately. Dollar amounts were not on the page that was fetched. | Free $0. Plus $10 per member per month. Business $20. Enterprise custom. | The official Microsoft page did not load in this session. No comparison is made. |
| Lists or projects | 9 vs 299 lists | Beginner 5 personal projects. Pro 300. | Not extracted | Pages and databases, not a list cap of this kind | Not fetched |
| Calendar inside the app | Many views, duration on Premium, subscribe and two-way Google | Pro adds a calendar layout and task duration. Beginner does not list those. | Not extracted | Notion Calendar is included on Free | Not fetched |
| Habits, Pomodoro, Eisenhower | All three are first-class, with caps | The pricing page does not list a habit tracker, a Pomodoro timer, or an Eisenhower matrix | The homepage does not list them | Not a habit or Pomodoro product. Databases can model either. | Not fetched |
| Sharing | 2 vs 29 members on the pricing row. No team plan. | Beginner and Pro show a small collaborator count in a broken extract. Business adds a shared workspace, up to 500 team projects, and 1,000 members and guests. | Not extracted. Things is sold as a personal manager. | Guests: 10 on Free, unlimited on paid plans. Real-time documents. | Not fetched |
| Files | 10 MB vs 20 MB in the FAQ, plus a daily upload cap | Beginner 5 MB, Pro and Business 100 MB, from the comparison table | Not extracted | Free 5 MB per file. Paid plans say unlimited uploads with about a 5 GB per-file max. | Not fetched |
| API | Official OAuth API for tasks, lists, tags, habits, focus, and read-only countdowns. No published rate limit. No webhooks. | Not extracted from the pricing page | Not extracted | Public API and webhooks are on the paid feature table. Automations differ by plan. | Not fetched |
| Offline | Not documented for TickTick | Not extracted | Not extracted | Free: choose pages to download. Paid: recents and favorites auto-download. | Not fetched |
| Platforms | Web, iOS, Android, Windows, Mac, Linux, watches, extension | Not extracted from the pricing page | Mac, iPhone, Watch, iPad, Vision Pro on the homepage. No Android, Windows, or web named there. | Web and apps. Offline called out for desktop and mobile. | Not fetched |

TickTick's difference, on these pages, is that habits, a focus timer, a matrix, and a deep calendar sit in the same account as tasks, at a single annual price, with hard object caps. Todoist's fetched page is organized around projects, filters, reminders, and a separate Business workspace. Notion's fetched page is a document and database product with a public API and webhooks. Things, on the page fetched, is a personal Apple suite sold per device.

## 9. Open questions

- Which calendar views, matrix options, widgets, themes, and statistics are the "basic" free set?
- Does "Member Count" of 2 include the owner? The FAQ's "add one shared member" suggests yes, but the pricing page does not say so.
- Which attachment rule wins? Pricing page and Task Details say 199 uploads a day. FAQ and the US App Store say 99 a day. Per task, FAQ says 20 and Task Details says 39.
- What happens to objects above the free cap after Premium expires?
- Does the $4.99 monthly App Store price exist on the web and on Google Play? The web pricing HTML does not print it. The Play page fetched here does not print a dollar amount.
- Does "Pro membership" in the recording-mode article mean Premium? The pricing page never uses the word Pro.
- Which browsers does the extension support?
- What is the in-app language list?
- Is there an offline mode?
- Which sign-in providers exist besides email and a phone reset code?
- Does the official API have a rate limit that is enforced but not documented?
- Are holiday calendars included in the Premium "Integrations" row?
- Is end-to-end encryption offered? The security page does not say yes.
- What is the backup file format?
- Does a Team object exist beyond shared lists? The API has `NO_TEAM_PERMISSION` and a team tag type, and the help article uses "team" for people on a list.
- Wear OS: which screens exist?
- Linux: which desktop features are actually missing? Only community reports say.
- The default keyboard shortcut map. The help article tells you to press `?` and does not list the keys.
- The complete white-noise catalog.
- Whether location reminder is iOS-only or also Android. The two official pages disagree.
- Zapier, IFTTT, Make, Slack, and Gmail. No current English help article.

## 10. Source list

Accessed 2026-10-08 unless noted.

Official product pages:

- https://ticktick.com/features
- https://ticktick.com/download
- https://ticktick.com/upgrade
- https://ticktick.com/upgrade?language=en_us
- https://apps.apple.com/us/app/ticktick-to-do-list-calendar/id626144601 (US store; annual $49.99, monthly $4.99, version 8.2.20 dated Sep 29)
- https://play.google.com/store/apps/details?id=com.ticktick.task&hl=en_US (updated 24 Sep 2026; no dollar price in the fetched text)
- https://ticktick.com/education
- https://ticktick.com/about/privacy (last revised 9 Jul 2026, as printed on the page)
- https://ticktick.com/about/security
- https://ticktick.com/integrations (the text extract did not list products)
- https://ticktick.com/public/changelog/en.html (the HTML shell had no release entries; do not treat it as read)
- https://developer.ticktick.com/docs/openapi.md
- https://developer.ticktick.com/manage (linked as the app-registration page; the form itself was not submitted)

Help Center articles used, all under `https://help.ticktick.com/articles/` unless noted. The body text came from the article JSON embedded in the Help Center page:

- Beginner's Guide, FAQ, Add Tasks, Task Details, Effective Reminder Feature, Constant Reminder, Suggested Tasks, Time Zone, Set Up Recurring Tasks
- Week, Month, Year, Agenda, and Calendar View Options, FAQ - Calendar, Google Calendar, Outlook, iCloud, Exchange, CalDAV, URL subscription, Local Calendar
- Eisenhower Matrix, How to Use, How to Edit the Rules
- How to Start Focus, How to Maintain Focus, Timer, Focus Statistics
- Start a New Habit, Habit Tracker, Countdown articles, Badges, Achievements and Statistics
- How to Share a List, How Teams Can Collaborate
- Manage Tasks with Lists, Folders, Tags, Group & Sort, Filters, Multilevel Tasks, Kanban, Timeline, Notes and Summary, Search
- Widgets, Desktop Sticky Notes, Desktop Shortcuts, Smart Recognition, Cross-Platform Support
- Data Backup and Import, Import from Other Apps, Integrate Notion, Integrate Spark, Integrate Telegram, Import Apple Health, Use Siri & URL Scheme
- Sign Up and Log In, Two-Step Verification, Account and Security, Payment and Upgrades, Delete Account
- AI Assistant, AI Voice Add, Transcribe & Summarize Recordings, TickTick MCP, TickTick CLI, API Support
- What's New (headings dated 15 Sep, 3 Jun, 29 Apr, 9 Mar, and 8 Jan, with the year printed only by context of Version 8.0)

Changelog articles also seen in search, and used only where the snippet was quoted above: Updates in 2023 and Updates in 2024 on help.ticktick.com.

Community, used only in section 7:

- https://www.reddit.com/r/ticktick/comments/1ll96gg/linux_version_far_behind_windows (26 Jun 2025)
- https://www.reddit.com/r/ticktick/comments/1i4p1ol/help_me_justify_the_cost_of_ticktick_premium/ (19 Jan 2025, update 13 Feb 2026)
- https://www.reddit.com/r/ticktick/comments/1jhgb1w/ticktick_sync_issues/ (22 Mar 2025)
- https://www.reddit.com/r/ticktick/comments/1jsq6o2/has_anyone_else_had_issues_with_notifications (6 Apr 2025)
- https://www.reddit.com/r/ticktick/comments/1od22ah/rant_tickticks_toxic_traits_should_i_give_it_a (22 Oct 2025)
- https://www.reddit.com/r/ticktick/comments/1mlnekf/think_im_leaving_ticktick_for_the_dumbest_reasons/ (9 Aug 2025)
- https://www.reddit.com/r/ticktick/comments/1irtjk1/need_help_regarding_unsynced_lists_and_habits/ (17 Feb 2025)
- https://www.reddit.com/r/ticktick/comments/1m1qwqy/linux_installation_question/ (16 Jul 2025)
- https://www.reddit.com/r/ticktick/comments/1q96467/disable_ticktick_notification_for_upcoming_billing/ (10 Jan 2026)

Competitors:

- https://www.todoist.com/pricing
- https://culturedcode.com/things/
- https://www.notion.com/pricing
- Microsoft To Do official URL failed to load

Stale source, not used for current numbers: https://blog.ticktick.com/2014/09/01/making-full-use-of-ticktick-within-free-account/ (lists 19, share 1, price $19.99).

## 11. Build implications

This section is analysis for someone building a similar app. It is not a TickTick fact.

**Core, if the product is "TickTick for one person."** Fast capture with date parsing, lists, priorities, tags, due dates, a few reminders, repeat rules that can be "every week" or "again N days after I finish," a Today view, and reliable sync. Those are the objects every later feature hangs on. The free tier already includes them, with small caps. A new app that misses capture speed or repeat rules will feel unfinished even if it has a calendar.

**Core, if the product is "why people pay."** From the pricing table, the paid reasons are more room, duration, calendar depth, timeline, filters, constant and per-checklist reminders, activity history, integrations, and AI. Duration plus a real calendar is the one that changes planning. Filters are the one that changes retrieval once someone has more than a few lists. The caps (9 lists, 99 items) are a business lever, not a technical necessity.

**Nice to have for a first release.** Habits, countdowns, the Eisenhower matrix, white noise, badges, themes, sticky notes, watch complications, Notion two-way sync, and the in-app AI chat. They are why TickTick feels larger than a to-do list. They are not required to capture and finish a task. Ship them after the task model is solid, because each one is another object with its own reminders.

**Hard to replicate.**

- Sync. Several devices edit the same task while offline or on a bad network. TickTick's users still report missed syncs, which is evidence that this stays hard after years. You need a change log per object, conflict rules, and a way for the user to see that a list did not sync.
- Recurrence. "Every Friday," "two days after I complete it," "skip the ones I missed," and "stop after 10 times" are different algorithms. The API's `repeatFrom` values 0, 1, and 2 are the three you have to implement and test around time zones and all-day tasks.
- Natural language. "Remind me at 9" means today or tomorrow depending on the clock. You need a timezone and a set of accepted phrases per language, and a way to undo a wrong parse.
- Notifications. A reminder that fires while the app is killed, on Android OEM builds, and a constant reminder that bypasses silent mode, both depend on the operating system. The help articles spend real space on Android alert mode and iOS alarm permission because the app cannot guarantee delivery by itself.
- Two-way calendar sync. Google's special event types and "do not import the past" are the edge cases that make a simple iCal feed insufficient.

**A practical MVP.** One account. Inbox plus user lists. Tasks with title, notes, priority, tags, due date, all-day flag, and one reminder. Repeats for daily, weekly, and monthly, plus "from the completion date." Today, a seven-day list, and a month calendar. Complete, snooze, and search. Sync between web and one phone. Export a backup the user can download.

Leave out of that MVP: habits, Pomodoro, matrix, timeline, Notion, AI, watch apps, white noise, and shared lists. Add sharing only when the permission model (read, comment, write) and the member cap are designed. Add duration and week view next, because that is the step from a list to a schedule.

## 12. Confidence

| Section | Level | Why |
| --- | --- | --- |
| 1. Overview | High | Download page, features page, beginner's guide, and pricing page were all fetched. |
| 2.1 Tasks | High | Help articles plus the Open API schema agree on fields. The checklist-versus-subtask naming collision is called out rather than smoothed over. |
| 2.2 Time | High / Medium | High for repeat modes, reminders, constant-reminder timings, and time zones. Medium for holiday calendars, which were not re-read in full. |
| 2.3 Views | Medium | View names are documented. Which of them are "basic" versus "unlimited" is not. |
| 2.4 Productivity | High / Medium | High for habits, the habit week-versus-month gate, focus modes, the sync switch, badge thresholds, countdowns, and AI platform gaps. Medium for the exact Pomodoro duration list and the white-noise catalog. |
| 2.5 Collaboration | High | Share, assign, permissions, and the owner-pays rule are in the FAQ and the teams article. The 2-versus-29 wording is quoted from both official places. |
| 2.6 Platforms | Medium | Clients are named. A full parity matrix does not exist, so gaps are only the ones a page stated. |
| 2.7 Integrations | High / Medium | High for Google, Notion, Telegram, email, and the negative result on Zapier. Medium for Exchange and outbound calendar feeds, which were not read line by line. |
| 2.8 Security | High / Low | High for what the privacy and security pages claim. Low for anything they omit, especially offline and end-to-end encryption. |
| 2.9 UX | Medium | Themes, natural language parsing, and shortcuts are documented. The shortcut table, the theme split, and the app language list are not. |
| 3. Pricing matrix | High | Every number and icon in the matrix comes from the live upgrade HTML, or from the App Store prices fetched the same day. The attachment, per-task file, member, and Pro-versus-Premium conflicts are written down on purpose. |
| 4. Data model | High / Medium | High for API fields. Medium where a UI object has no schema. |
| 5. Flows | Medium | The steps are assembled from help articles. They were not executed inside a logged-in TickTick account. |
| 6. API | High | The official `openapi.md` was downloaded and its endpoint list and definitions were read. Rate limits are "not stated," which is a finding, not a gap in reading. |
| 7. Limitations | High / Low | High for documented caps. Low for community bugs, because they are anecdotes. |
| 8. Competitors | Medium / Low | Medium for Todoist and Notion limits that the fetch actually contained. Low for Things prices and for Microsoft To Do, which was not fetched. |
| 11. Build implications | Judgment | It is not a fact section. It follows from the pricing table and the help articles. |
