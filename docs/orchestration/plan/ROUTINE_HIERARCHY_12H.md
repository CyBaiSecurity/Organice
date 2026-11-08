# Routine emphasis, clock format and navigation

Requested during Android review on 2026-11-08. This extends the approved routine work and supersedes the first readability revision where it conflicts. The installed code6 prerelease remains a verified baseline, not acceptance of this new request.

## Design decision

The default Routine view must answer “What should I do now?” first. The current activity owns the largest type and its essential instructions. The next activity is a quiet row. Task selection and Focus form one compact section with one primary action. The full daily plan stays available on demand rather than repeating the current activity immediately below it. Date controls, daily adjustments, week editing, review and alerts have successively lower visual weight. Active changes and real errors remain visible. Keep the existing ink-and-paper identity without new assets, dependencies or animation.

Navigation keeps all six destinations and the distinct Routine icon. Align every icon and label on the same baseline; use readable sentence-case labels instead of small bold uppercase text and the raised selected circle. The Dashboard can display the shorter label Home while retaining its route and accessible destination name.

All app-generated clock times use explicit 12-hour AM/PM. Stored minutes, timestamps, timer durations and source/user instruction text keep their existing meaning. Legacy 24-hour input remains readable so existing drafts and wheel values do not break.

## Task 1: Routine hierarchy and dock

Own: `src/components/routinePage.tsx`, `src/components/routineTimeline.tsx`, `src/components/routineGuide.tsx`, `src/app/(tabs)/guide.tsx`, `src/app/(tabs)/_layout.tsx`, `src/theme/dock.ts`.

- [ ] Give Routine a clear left-aligned page title and smaller date navigation. Use 26–30 point current activity, 16 point body, 13–14 point metadata, and consistent spacing. Avoid centered text fragments and repeated large pill buttons.
- [ ] Keep current and next guidance visible, then show a compact task section. Use local sentence-case actions. Free period and task clearing remain available as secondary actions. Preserve explicit carryover, missing/completed selections, task next steps and Focus preselection without auto-start.
- [ ] Make the full day a clearly labelled disclosure. Every instruction and unconfirmed meeting remains available. Keep today/history/future context accurate and reset disclosures on a date change.
- [ ] Place adjustments and week management below the main guidance. Retain Sunday-after-5-PM review emphasis, individual/combined undo, actual alert counts and visible failures, guide-off and first-setup states.
- [ ] Align six navigation slots with 44-point touch areas, readable sentence-case labels, a restrained selected state, safe-area clearance and no moving label baseline. Do not change route names or other tab content.
- [ ] Run typecheck. Visual-only edits need actual rendered QA, not source-string tests.

## Task 2: 12-hour display and compatibility

Own: `src/state/clock.ts`, `src/state/routine.tsx` display helpers only, `src/app/routine-edit.tsx` time labels only, `src/components/routineForms.tsx` time validation copy only, `src/components/timeline.tsx` clock formatting only, `src/app/settings.tsx` time fields only, `src/app/habit/[id].tsx` time fields only, and `test/domain/clockParts.test.ts` or a focused clock test.

- [ ] Add failing behavioral checks for midnight, noon, morning, evening and formatting/parsing round trips. Preserve canonical wheel output and acceptance of legacy `HH:mm`.
- [ ] Make `clockLabel(minutes)` return e.g. `6:30 AM` and `10:30 PM`. Make `formatTime(date)` explicitly use a 12-hour AM/PM clock regardless of device preference. `parseClock` accepts strict valid AM/PM input and legacy 24-hour values; invalid clocks still return null. `partsToClock` retains its canonical 24-hour wheel transport value independently of the display formatter.
- [ ] Update visible time-field examples and error copy. Reuse the shared formatter for task timeline deadline labels. Do not reinterpret durations as wall-clock times or alter stored data.
- [ ] Run focused tests, the full test suite and typecheck with a 512 MiB Node heap.

## Acceptance owned by Codex

- [ ] Inspect both diffs and obtain one bounded independent Grok 4.7 review. Verify midnight/noon, AM/PM wheel round trips and old inputs.
- [ ] Run `npm test`, `npm run typecheck` and `git diff --check` independently.
- [ ] Build one signed incremental ARM64 APK as versionCode7 under the existing 5 GiB hard memory limit, no build swap, one worker. Preserve the published rc.1 tag; publish the new binary as rc.2 after native acceptance.
- [ ] Install over the existing app with data preserved; inspect actual Routine hierarchy, full-day disclosure, all six labels, time editing and AM/PM, Focus continuity, keyboard/back paths and a bounded memory sample. Check a small width and larger text where available. Leave Organice open.
- [ ] Record native results and limits, update GitHub prerelease/Brain, then close the root task. A short run cannot prove the absence of all memory leaks.

## Review focus

Midnight/noon must not shift by 12 hours. Existing stored times must not shift. Long titles and AM/PM ranges must fit a 360-point screen. Secondary actions and failures must remain reachable after disclosure changes. Current guidance must stay distinct from historical/future plans. The larger-text check must preserve readable navigation and touch targets.
