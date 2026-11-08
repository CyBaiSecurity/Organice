# Routine guide verification

Updated: 2026-11-09. Initial feature base: `6e1b7d0`; hierarchy revision base: `debac675`. App version: `1.1.0`, Android version code: `7`.

## Automated checks

- `NODE_OPTIONS='--max-old-space-size=512' npm test`: 123 passed, zero failed.
- `NODE_OPTIONS='--max-old-space-size=512' npm run typecheck`: passed.
- `git diff --check`: passed.
- No dependency was added. The original product requirements document was preserved.

The tests cover version-1 data preservation, repeat setup and deleted blocks, the workout habit limit, Manila dates and day changes, task selection and next steps, Monday review assignment, atomic Focus transitions and recovery, reminder ownership and failure handling, and timeline grouping. New checks cover all 1,440 minute values through AM/PM display and legacy input, noon, a real arrival ending at midnight (minute 1,440), and dock clearance as text scales up.

## Independent review

Grok 4.7 high performed a fresh read-only review. Four findings were reproduced or confirmed against the connected code, corrected by Grok workers, and independently checked:

- Proposed meeting clocks no longer end flexible evening blocks before a time is confirmed.
- Home late and its undo change only the late flag. Home now records arrival independently.
- Unknown native alert counts remain unknown. Verified counts include alerts that could not be cancelled.
- Confirming a meeting saves the other fields in the same draft.

A focused follow-up found no remaining findings in those core paths. The Android notification timestamp adapter was also corrected against the installed SDK57 native shape; repeat reconciliation leaves unchanged alerts in place.

The later navigation/readability revision received a separate bounded review. Two findings were corrected: flexible items that precede a later current block move under Earlier, and actual alert failures/counts remain visible outside disclosures. Codex inspected the corrections and ran the complete 116-test suite and typecheck afterwards. The dedicated Routine tab retains the five existing destinations; `/routine` redirects to `/guide`. Full source instructions remain available through expandable rows, and setup, editing and review use grouped controls.

The second UI revision uses emphasis and subordination: a dominant current activity, quieter next activity, one main task action, an expandable full day, and smaller secondary controls. Navigation has six aligned sentence-case labels. Grok 4.7 workers implemented the UI and clock changes with separate write scopes. Codex inspected their diffs and ran the final 123 tests and typecheck independently.

The fresh review exposed a legitimate derived midnight endpoint and a To-do formatter that could still follow a 24-hour locale. Both are corrected; the midnight case has a failing-then-passing regression. Navigation no longer caps text size and shares its scaled height with page clearance. The focused review confirmed the clock and To-do corrections but raised a possible clipping concern for long navigation labels at 2x text size. That concern requires native reproduction; it is not a confirmed Android defect. The phone is currently locked, so that check remains open.

## Android delivery

The ARM64 release build uses a 5 GiB hard memory limit, no build swap, a 1 GiB Java heap, a 768 MiB Node heap, and one Gradle, Metro, and native compiler worker. Native caches were reused for the UI revision.

The signed code7 release build passed in 120 seconds, including JavaScript bundling and release lint. Its measured peak was 2.59 GiB; the lowest sampled available system memory was 5.37 GiB. No emulator or development server ran during the build.

The code7 APK's package, version, ARM64 ABI and matching installed certificate passed artifact checks. It contains no user database. `adb install -r` succeeded without clearing app data, and the activity launch command returned `Status: ok`. The phone remained locked. These results do not establish that the new UI rendered correctly. UI capture/control guards against the lock screen and other foreground apps.

Code7 APK SHA256: `4c0cffafd4730dee33c6cd983f26b61a4333a51e281fe64a4197588a4459e4d0`.

## Earlier code6 phone baseline

On the connected Android phone (360-point width, default text size), all six tabs opened. Routine instructions expanded and collapsed; setup preview expanded instructions without saving. The focused week form's time wheel changed a local draft, and the parent still scrolled to its Save button; the draft was discarded. Review showed the correct week and following Monday. Its Save button was reachable after dismissing the keyboard, but did not stay above the open keyboard. No routine, task, habit or review edits were saved during these checks.

A temporary unlinked Count up session continued from 0:00 to 0:16 across a visit to Routine. Android reported its Rain media session playing while away from Focus. The temporary session was then abandoned. The installed package reported versionCode6, and app-process fatal/React Native JS error logs contained zero errors at the end of this check.

Six code6 memory samples after visiting the screens ranged from 281.4 to 353.1 MiB PSS. Five repeated editor/review/setup-and-back cycles used the same app process; the final sample was 287.3 MiB. These are short observations, not a leak test.

The code6 checks do not validate the code7 hierarchy, AM/PM or scaled navigation. Those screen and memory checks remain pending an unlocked phone. The implementation plan is `plan/ROUTINE_HIERARCHY_12H.md`.

Static cleanup review and short runtime observations cannot establish that an app has no memory leaks. iOS device behavior and long-running notification delivery remain unverified.
