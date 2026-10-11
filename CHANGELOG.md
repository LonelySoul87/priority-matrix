# Changelog

This project follows [Semantic Versioning](https://semver.org). 1.0.0 is the first public release. The earlier numbers (internal builds 1.0 to 1.11.2) were private development builds.

## 1.0.0 (2026-10-11)

First public release.

Priority Matrix was developed privately through internal builds 1.0 to 1.11.2. Before publishing, the whole app was audited for data safety, workflow, phones and touch, and accessibility, and then reviewed three more times by independent reviewers. This release is the result: the app as it was, plus due dates and faster ways to decide, move and capture tasks, much more careful handling of saved data, and the fixes the audit found. The lists below compare it with internal build 1.11.2, the last private build.

Backups from internal builds restore normally. The backup format stays at version 7. The new fields (`due`, `createdAt`, `completedAt`, `exportedAt`) are optional, so an internal build can still open data saved by 1.0.0 and simply ignores them. One caution: an internal build drops those fields when it saves, so close any tab running one before you open 1.0.0.

### What it does

- Four-quadrant board with an Inbox and Done and Discarded trays
- Ranked ordering with drag and drop, a Move menu, keyboard moves and a touch-friendly move dock
- Optional due dates, steps (up to 20), details with clickable links, and up to three labels per task
- Repeating tasks with day or month intervals
- Search, label filters and saved searches
- Paste-a-list capture and guided Inbox sorting
- Multi-select batch moves
- Undo and redo that survive a page reload
- 40 built-in themes in light and dark, plus your own themes with contrast checking
- Column and list views, comfortable and compact density, a phone layout and a print layout
- JSON backup and restore, with a reminder when a backup is due

### New since internal build 1.11.2

- **Due dates.** A task can carry a day it's due, set next to Labels and Repeat. Cards say "Overdue", "Due today", "Due tomorrow" or the date, marked by weight and an icon rather than a new colour. A not-urgent task due within two days offers "Move to Urgent". Quadrant headings count what's overdue or due today. Repeating tasks move their due date forward, and templates never keep a calendar date. Labels update after midnight without a reload.
- **Completion dates.** Done cards show when a task was finished, and the Done heading counts the last seven days.
- **A Move menu on every card.** It lists the other boxes, so moving never needs a drag (WCAG 2.5.7).
- **A visible Undo bar** after Done, Discard, Restore and moves, which take a task out of view. A newer change hides it, so it can't undo the wrong thing.
- **Quadrant actions.** Each box carries its verb (Do now, Delegate or batch, Schedule, Drop), and an empty box says what belongs there and which key adds to it.
- **Faster capture.** Enter adds the task and keeps the form open for the next one; Shift + Enter starts a new line. Enter also saves an inline edit.
- **Inbox sorting by number.** Keys 1 to 6 place the current task (four quadrants, Done, Discard). Done schedules repeats like any completion.
- **Shortcut help.** Press <kbd>?</kbd>, or use the toolbar button, for every shortcut. Single-key shortcuts can be switched off there (WCAG 2.1.4); their hints then disappear, and on touch screens the Help button appears so the setting stays reachable.
- **Backup reminder.** Once a board has five tasks and no backup, or a week has passed with changes since the last one, the save status says so and the download button shows a dot. Its label always says when the last backup was made. Downloading also asks the browser to keep this site's storage.
- **Restore asks first** over a non-empty board, with both task counts and the backup's date.
- **Phone overview.** A compact 2×2 grid above the stacked quadrants shows each box's action, task count and overdue count, and jumps to it.
- **Print layout.** The four quadrants in black on white, steps expanded, no controls.
- **Automated tests.** 121 tests that run on GitHub Actions for every change: 120 browser tests (Node's test runner and Playwright), including axe-core accessibility scans, two-tab scenarios, real touch input and a backup written by internal build 1.11.2, plus a check that no file contains an em dash or an en dash.

### Changed since internal build 1.11.2, worth a look

These change how the app looks or behaves, so they're listed on their own.

- **Berry's "Drop" colour** is now a soft sand. It used to be a pink close to "Do now", which made two opposite boxes look alike. All 880 built-in colour pairs still pass WCAG AA.
- **The add form stays open** after adding, ready for the next task. Escape closes it.
- **Enter adds or saves.** Shift + Enter starts a new line. Phone keyboards have no Shift + Enter, so on a phone a task's title is one line; Details still take as many lines as you like.
- **The toolbar** has a "Manage themes" button (it used to be the last entry in the theme list) and a shortcuts button on devices with a pointer.
- **Touch drags start from the grip** on the left of a card. A swipe anywhere else on a card now scrolls the page.
- **Done, Discard and Restore keep your place.** The tray no longer opens and the page no longer jumps; focus goes to the neighbouring card.
- **The version number** moved out of the browser tab title, next to the app's name.

### Fixed since internal build 1.11.2

Data safety:

- When saved data couldn't be read (damaged, or written by a newer version), the app warned and then saved over it with the next change. It's now copied aside and never written over. Saving pauses until you choose in a banner: download the saved data, restore a backup, or start a new board.
- Two open tabs overwrote each other. A forgotten background tab could erase a day's tasks with one click. An idle tab now picks up changes from the other. A tab with unsaved changes of its own is never replaced: it stops saving, asks you to keep either version, and warns before it closes. A board saved in a newer format by another tab is kept aside instead of being overwritten.
- On large boards, saved Undo history could take the storage space the board needed. New tasks were then lost on reload while the status still said "Saved on this device". The board now always wins: history is dropped to make room, and history that can't fit stays in memory for the session only (a warning says so).
- One overlong value in an unfinished form (for example a 21-digit repeat interval) made the app discard all saved templates and saved searches on the next load. A damaged draft now costs only that draft.
- Undo history didn't survive a reload after completing a repeating task or discarding a completed one, and resuming an edit of such a task created a duplicate. Comparisons now ignore property order.
- An automatic repeat release could erase what Redo would have brought back. Releases now wait while Redo is possible.
- "Cancel next copy" stopped a repeating task from ever repeating again. Canceling now resets it.
- A repeating copy that became due between two clock readings could disappear. The release now uses one reading.
- Removing every line from a pasted-list review left the app blocking Undo, backups and new tasks until "Clear list" was pressed. An empty review now simply ends.
- Backups larger than 5 MB, which the app itself can write, were refused on restore. The limit is now 25 MB.
- A backup from a newer version was refused with a generic "couldn't be read" error. The message now says it comes from a newer version.

Accessibility:

- Arrowing through the theme picker bounced between two themes and could open the theme dialog. The list no longer rebuilds under a focused picker (WCAG 2.1.1, 3.2.2).
- Focus fell to the top of the page after some moves and automatic releases. It now lands on a neighbouring card or on Undo (WCAG 2.4.3).
- The sticky header could cover the focused control (WCAG 2.4.11).
- Card buttons were all called "Edit", "Done", "Discard". They now name their task, and Undo/Redo say what they changed.
- Windows High Contrast lost the pressed, selected and drop-target states. They now show an outline.
- Added a skip link to the tasks, readable placeholder colours, and step grip names that include their visible number (WCAG 2.5.3).
- Selected cards in selection mode show their outline again; the colour variable it relied on was never defined.

Interaction and mobile:

- A new or edited task could vanish behind an active search or label filter. Only the filter that would hide it is cleared now, and the announcement says so.
- Releasing a dragged card in the padding of the "Move to another box" dock dropped it into whichever quadrant was hidden underneath. The dock now catches those releases and nothing moves.
- Alt + arrow and Alt + number moved tasks while another task was open for editing, resetting the editor. They now wait, like clicks and drags already did.
- Pressing 1 to 4 during Inbox sorting opened a hidden add form behind the panel, and pressing 1, 2, 3, 4 or 7 in selection mode silently cleared the selection.
- Ctrl/Cmd + Z and Ctrl + Y now work on non-Latin keyboard layouts (for example Cyrillic).
- Escape used to confirm or cancel an input-method composition (Japanese, Chinese, Korean) no longer discards the task being typed.
- iOS zoomed into every form field (form text is now 16px on touch screens). The header covered half the screen in phone landscape.
- Touch dragging now works on touchscreen laptops and 2-in-1s, not only on phones and tablets, and holding a finger near the top or bottom edge during a drag keeps scrolling. (Touchscreen laptops follow the CSS spec but haven't been tested on physical hardware.)
- Links in task details no longer swallow trailing punctuation; balanced parentheses are kept, so Wikipedia-style links work.
- The theme editor names contrast problems by the colours it shows ("Main text on Canvas is below 4.5:1").
- Deleting the active custom theme names the theme that replaces it ("Berry") instead of its internal ID ("Focused").
- Repeat dates read like the rest of the app ("Back Sat 17 Oct").

Performance:

- Card layout measured and positioned cards one at a time, forcing the browser to recalculate layout for every card. On a 500-task board, each search keystroke now takes roughly 85 to 120 ms instead of about 370 ms, and the board loads about three times faster (measured in headless Chromium). Card positions are unchanged.

Housekeeping:

- Removed about 160 lines of unused CSS left over from the starter template, with no visual change.
- Removed a per-card copy of all task text that nothing read.
- Added a page description and an inline favicon.
