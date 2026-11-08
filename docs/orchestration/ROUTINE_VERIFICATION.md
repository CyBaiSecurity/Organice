# Routine guide verification

Date: 2026-11-08. Base revision: `6e1b7d0`. App version: `1.1.0`, Android version code: `6`.

## Automated checks

- `NODE_OPTIONS='--max-old-space-size=512' npm test -- --test-concurrency=1`: 116 passed, zero failed.
- `NODE_OPTIONS='--max-old-space-size=512' npm run typecheck`: passed.
- `git diff --check`: passed.
- No dependency was added. The original product requirements document was preserved.

The tests cover version-1 data preservation, repeat setup and deleted blocks, the workout habit limit, Manila dates and day changes, task selection and next steps, Monday review assignment, atomic Focus transitions and recovery, reminder ownership and failure handling, and timeline grouping of flexible, confirmed and unconfirmed items.

## Independent review

Grok 4.7 high performed a fresh read-only review. Four findings were reproduced or confirmed against the connected code, corrected by Grok workers, and independently checked:

- Proposed meeting clocks no longer end flexible evening blocks before a time is confirmed.
- Home late and its undo change only the late flag. Home now records arrival independently.
- Unknown native alert counts remain unknown. Verified counts include alerts that could not be cancelled.
- Confirming a meeting saves the other fields in the same draft.

A focused follow-up found no remaining findings in those core paths. The Android notification timestamp adapter was also corrected against the installed SDK57 native shape; repeat reconciliation leaves unchanged alerts in place.

The later navigation/readability revision received a separate bounded review. Two findings were corrected: flexible items that precede a later current block move under Earlier, and actual alert failures/counts remain visible outside disclosures. Codex inspected the corrections and ran the complete 116-test suite and typecheck afterwards. The dedicated Routine tab retains the five existing destinations; `/routine` redirects to `/guide`. Full source instructions remain available through expandable rows, and setup, editing and review use grouped controls.

## Android delivery

The ARM64 release build uses a 5 GiB hard memory limit, no build swap, a 1 GiB Java heap, a 768 MiB Node heap, and one Gradle, Metro, and native compiler worker. Native caches were reused for the UI revision.

The final signed code6 release build passed in 115 seconds, including JavaScript bundling and release lint. Its measured peak was 2.37 GiB; the lowest sampled available system memory was 6.36 GiB. No emulator or development server ran during the build.

The final APK's package, version, ARM64 ABI and matching installed certificate passed artifact checks. It contains no user database. The initial code5 version had installed over1.0.3 and launched with existing habits preserved. The final code6 installation and screen checks await USB reconnection; the attempted installation stopped before transfer when ADB could not see the phone. UI controls guard against other foreground apps.

APK SHA256: `9d12bb27ec9d61ae04e63a65850bfe6d2b4ad45dd5158b88df65adbdef21d7ea`.

Static cleanup review and short runtime observations cannot establish that an app has no memory leaks. iOS device behavior and long-running notification delivery remain unverified.
