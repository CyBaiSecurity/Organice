# Routine navigation and readability revision

The user requested this revision during physical-phone review on 2026-11-08: put the guide/routine on its own new navigation icon and page, and clean up the text-heavy interface so it is easier to read and follow. This supersedes the initial plan's dashboard placement. Continue implementation, verification, memory-limited Android delivery and GitHub prerelease publication already authorized in the session.

## Result

- Add a **Routine** bottom tab with a distinct route/map icon. Keep the five existing destinations. Use the existing SDK57 JavaScript tab navigator.
- Remove the full guide from Dashboard. Give Routine its own daily overview, selected task, current/next information, compact schedule and day adjustments.
- Keep the existing ink-and-paper visual identity. Establish clear section titles, smaller secondary copy, consistent spacing and restrained surfaces. No new styling library, font package, image assets or unrelated screen overhaul.
- Show full instructions on demand instead of repeating every paragraph in the default view. Keep important current/next guidance and unconfirmed-meeting status visible.
- Group occasional controls and alert explanations. Keep main actions easy to find, with accessible touch targets and visible error, loading and empty states.
- Make setup a concise day preview with expandable details. Keep the optional workout choice and explicit confirmation before saving.
- Make the weekly editor easy to scan and open the selected block's form beside/over the list instead of placing a long form after every block. Preserve all existing validation, meeting confirmation, reorder, deletion and shared-weekday behavior.
- Structure the review around its three prompts and a compact Monday-task choice. Keep explicit task-choice semantics and historical review editing.

## Compatibility and verification

- Keep `/routine` working for existing notifications and links by routing to the new Routine tab at `/guide`. Keep setup, editor and review stack screens reachable from it.
- Preserve all data/domain/reminder/Focus behavior already accepted. No migrations or dependency changes are needed for this UI revision.
- Preserve paged lightweight task choices, nullable native alert counts, default-off reminders, daily undo, and complete meeting-draft saves.
- Verify six navigation destinations fit a small Android screen, safe areas and keyboard insets work, controls remain reachable after wheel interaction, details expand/collapse, and back paths work.
- Run the complete tests and typecheck, inspect the actual diff and obtain a bounded read-only Grok review. Build/update the Android APK with the same memory/worker limits, verify its certificate/version/ABI, and test the updated screens on the connected phone before publishing the prerelease. The previously built code5 APK has not been published and does not contain this revision.
