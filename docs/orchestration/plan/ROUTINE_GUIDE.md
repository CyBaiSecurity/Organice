# Approved routine guide implementation

Approved in conversation on 2026-11-08. Product source: `/home/missu/Documents/firstmate/projects/routine/docs/orchestration/DAILY_WEEKLY_ROUTINE.md`. Target is this existing Organice checkout; the Firstmate project is read-only source material.

The user's later phone review requested a dedicated Routine navigation tab and cleaner screens. [Routine UI revision](./ROUTINE_UI_REVISION.md) supersedes the dashboard placement below; accepted domain and data behavior remains in scope. The user also authorized capped APK builds, phone installation/testing and GitHub prerelease delivery in the conversation.

## Outcome

An editable daily guide inside Organice, connected to existing tasks, habits, and Focus. Blocks guide the day; they are not tasks, checkboxes, or overdue obligations. Use Asia/Manila dates and times. No phone-calendar publishing, backend, account, live Markdown sync, new dependency, or rewrite of `docs/organice-prd.md`.

## MVP

- Setup previews the source routine, then enables its five day patterns (Monday/Wednesday, Tuesday/Thursday, Friday, Saturday, Sunday). Preserve exact stated times and flexible instructions. Meetings stay unconfirmed until explicitly assigned a time. Setup is idempotent and preserves all existing data.
- Dashboard shows current block, next block, selected work task and its next-step note, outside the working-hours filter. View today and edit the week use Expo Router stack screens, not a new tab.
- Each date can select an existing open task; suggest the last unfinished selection, but never select it without confirmation. Tasks gain a separate `next_action` field, without overwriting notes. Focus can start linked to the selected task. Completed/deleted selections are handled visibly.
- Quick actions affect today only and can be undone: Free period opens selected task and Focus; No classes today suppresses remaining school/commute and suggests one short session without filling the day; Home now starts the first-hour-at-home block from actual arrival; Home late prioritizes essentials and wind-down. They expire at the next Manila day boundary.
- The editor can change block title, weekdays, times, instructions, enabled state and opt-in reminder preference. Relative blocks remain flexible. Setup offers either an existing workout habit or creation of a Monday/Wednesday/Friday habit. Saturday makeup is advisory, without invented habit completion.
- Sunday at 17:00 offers a saved review: finished, needs attention, crowded; choose Monday's first task. Reviews use Monday-Sunday periods ending on the selected Sunday.
- All reminders start off. Enabled fixed-time blocks schedule seven days ahead, replenished on app open/foreground, setup, edits, and relevant daily changes. Cancel obsolete identifiers; store successful identifiers before subsequent operations can fail. No reminders for unresolved relative or unconfirmed blocks. Open the guide when tapped. Surface denied permission and scheduling failure accurately; do not claim failure means inexact delivery. If unopened beyond seven days, routine reminders stop until refreshed.

## Architecture and implementation order

1. Grok Focus worker: lift runtime/audio out of screen lifetime, use stored timestamps, reconcile on resume/restart, deterministic scheduled deadline notifications and guarded transitions. Keep only screen controls in the screen. No claims about JavaScript running while the operating system suspends it.
2. Grok data worker in parallel: schema version 2 with incremental migration, domain-only routine derivation and source templates, repository operations, next_action task persistence, meaningful tests. Publish the actual API contract for the next workers.
3. After both complete, Grok UI worker owns routes, dashboard, task next-step editor and setup/review/editor flows. Grok reminders worker in parallel owns native scheduling and its root-mounted bridge. UI worker integrates the bridge into root layout after its module exists.
4. Codex independently inspects diffs, tests and failure paths; a fresh Grok verifier reviews the integrated change read-only. Fix findings through bounded Grok follow-ups. No commits/pushes without instruction.

## Verification

Use tests first for new domain/data behavior. Run `npm test` and `npm run typecheck`. Cover source fidelity for seven weekdays; version-1 data preservation; repeat setup; invalid and injection-like text; day boundary/clock changes; daily adjustment precedence and undo; task deletion/completion; next-step preservation; review dates; notification scheduling/cancellation failures and restart recovery; Focus navigation and overdue recovery. Validate rendered interfaces in a browser when feasible and native behavior on a development build when hardware is available. Report native checks not actually run. Keep unrelated calendar-link fixes separate.

## Worker rules

Use Grok 4.7 high; xhigh only for difficult debugging. At most two editing workers, with disjoint owned paths. Briefs pin target, interfaces, allowed writes, acceptance commands and report format. Workers do not spawn editing helpers, commit, modify Brain, install dependencies, change unrelated files or treat their own reports as acceptance proof.
