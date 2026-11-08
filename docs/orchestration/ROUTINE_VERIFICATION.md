# Routine guide verification

Updated: 2026-11-09. Initial feature base: `6e1b7d0`; hierarchy revision base: `debac675`. App version: `1.1.0`, Android version code: `8`.

## Automated checks

- `NODE_OPTIONS='--max-old-space-size=512' npm test`: 122 passed, zero failed.
- `NODE_OPTIONS='--max-old-space-size=512' npm run typecheck`: passed.
- `git diff --check`: passed.
- No dependency was added. The original product requirements document was preserved.

The tests cover version-1 data preservation, repeat setup and deleted blocks, the workout habit limit, Manila dates and day changes, task selection and next steps, Monday review assignment, atomic Focus transitions and recovery, reminder ownership and failure handling, and timeline grouping. New checks cover all 1,440 minute values through AM/PM display and legacy input, noon, and a real arrival ending at midnight (minute 1,440).

## Independent review

Grok 4.7 high performed a fresh read-only review. Four findings were reproduced or confirmed against the connected code, corrected by Grok workers, and independently checked:

- Proposed meeting clocks no longer end flexible evening blocks before a time is confirmed.
- Home late and its undo change only the late flag. Home now records arrival independently.
- Unknown native alert counts remain unknown. Verified counts include alerts that could not be cancelled.
- Confirming a meeting saves the other fields in the same draft.

A focused follow-up found no remaining findings in those core paths. The Android notification timestamp adapter was also corrected against the installed SDK57 native shape; repeat reconciliation leaves unchanged alerts in place.

The later navigation/readability revision received a separate bounded review. Two findings were corrected: flexible items that precede a later current block move under Earlier, and actual alert failures/counts remain visible outside disclosures. Codex inspected the corrections and ran the complete 116-test suite and typecheck afterwards. The dedicated Routine tab retains the five existing destinations; `/routine` redirects to `/guide`. Full source instructions remain available through expandable rows, and setup, editing and review use grouped controls.

The second UI revision uses emphasis and subordination: a dominant current activity, quieter next activity, one main task action, an expandable full day, and smaller secondary controls. Grok 4.7 workers implemented the UI and clock changes with separate write scopes. The user then explicitly rejected the navigation redesign. Code8 restores the original floating pill, raised icon, labels and clearance exactly to `debac675`, while retaining all six destinations. The preservation rule is recorded in `AGENTS.md`. Codex independently ran all122 tests and typecheck after restoration.

The fresh review exposed a legitimate derived midnight endpoint and a To-do formatter that could still follow a 24-hour locale. Both are corrected; the midnight case has a failing-then-passing regression. The focused review confirmed those corrections. Its scaling concern concerned the rejected navigation redesign; that design and its new test were removed. The original navigation must not be redesigned to address that discarded proposal.

## Android delivery

The ARM64 release build uses a 5 GiB hard memory limit, no build swap, a 1 GiB Java heap, a 768 MiB Node heap, and one Gradle, Metro, and native compiler worker. Native caches were reused for the UI revision.

The signed code8 release build passed in 120 seconds, including JavaScript bundling and release lint. Its measured peak was 2.32 GiB; the lowest sampled available system memory was 5.32 GiB. No emulator or development server ran during the build.

The code8 APK's package, version, ARM64 ABI and matching installed certificate passed artifact checks. It contains no user database. `adb install -r` succeeded without clearing app data, and the activity launch command returned `Status: ok`. Installed version code 8 was confirmed again before the checks below. UI capture and control stop when the phone is locked or another app is in front.

Code8 APK SHA256: `da466ddf44ed39a32b8b6f3156b713a7930c00701968b66c0ecd16344548f16b`.

On the unlocked phone, at the default text size, the original navigation, Routine hierarchy, chosen-task preservation, Full day disclosure, expanded instructions, AM/PM starts and ranges, editor time wheel and parent scrolling were checked. Review showed November 9–15 and Monday, November 16. No routine, task, habit, settings or review changes were saved by the agent.

A temporary unlinked Count up/Rain session advanced from 0:01 to 0:02 across navigation. Android reported the audio playing while Focus was not on screen. On the user's handoff request, only this test session was abandoned. The idle screen and stopped media were verified, then Guide was left open. Fatal lines and React Native JavaScript error lines for the app process were 0.

A later pass, still on version code 8, checked the two screens that the first pass had missed. An open To-do row showed its deadline as `Nov 9, 11:59 PM`. Settings showed working hours start `8:00 AM` and end `11:59 PM`. The task was not completed, and the settings save control was not used.

Three route cycles then opened Dashboard, Tasks, Ideas, Calendar and To-do, and each cycle returned to Routine. The phone was left on Routine, still scrolled to the lower actions. Proportional set size (PSS) is the memory Android attributes to one app, with shared memory split across the processes that use it. Five samples from the same process, id 30835, were 272.5, 303.5, 327.2, 327.6 and 315.0 MiB. The last sample was taken after the return to Routine. The process was not restarted. These samples do not show that the app has no memory leak. The corrected draft on GitHub still has to be replaced and published. iOS and long-running notification delivery remain unverified.

## Earlier code6 phone baseline

On the connected Android phone (360-point width, default text size), all six tabs opened. Routine instructions expanded and collapsed; setup preview expanded instructions without saving. The focused week form's time wheel changed a local draft, and the parent still scrolled to its Save button; the draft was discarded. Review showed the correct week and following Monday. Its Save button was reachable after dismissing the keyboard, but did not stay above the open keyboard. No routine, task, habit or review edits were saved during these checks.

A temporary unlinked Count up session continued from 0:00 to 0:16 across a visit to Routine. Android reported its Rain media session playing while away from Focus. The temporary session was then abandoned. The installed package reported versionCode6, and app-process fatal/React Native JS error logs contained zero errors at the end of this check.

Six code6 memory samples after visiting the screens ranged from 281.4 to 353.1 MiB PSS. Five repeated editor/review/setup-and-back cycles used the same app process; the final sample was 287.3 MiB. These are short observations, not a leak test.

These earlier code6 memory observations do not validate code8. The code8 samples are recorded above. The implementation plan is `plan/ROUTINE_HIERARCHY_12H.md`.

Static cleanup review and short runtime observations cannot establish that an app has no memory leaks. iOS device behavior and long-running notification delivery remain unverified.
