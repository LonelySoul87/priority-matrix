# Review notes for 1.0.0

These notes record how the first public release was audited, what was built, what was left out on purpose, and what still needs a human check on real devices. The release notes themselves are in [CHANGELOG.md](../CHANGELOG.md).

## How it was audited

We started from internal build 1.11.2, after a first round of cleanup for publishing, and looked at it four ways, each by a separate reviewer reading the code and running it in a browser: data safety, product and workflow, mobile and touch, and accessibility (WCAG 2.2 AA). A fifth pass read the whole file for anything that cut across those areas. Findings were reproduced in a browser before they were fixed, and most fixes landed with a test that fails on the old behaviour. Run against that starting file, 9 of the 10 data-safety tests fail.

The test suite went from nothing to 121 tests, 120 of them in Playwright run by Node's built-in runner. It drives a real Chromium. That covers real touch input through the DevTools protocol, two tabs sharing one storage, a frozen clock for midnight and repeat timing, and axe-core scans of the main screens in light and dark. `tests/fixtures/backup-1.11.2.json` was written by the original internal build and is restored in several tests, so older backups stay readable.

What the suite doesn't cover: Safari and Firefox, real phones, screen readers in use (axe checks markup, not the experience), and the Open Design editing workflow. Those are listed under [Checks that need a person](#checks-that-need-a-person).

## What the audit found

**Data safety was the weakest area, and the most serious.** Three paths could lose work without warning. When the saved board couldn't be parsed, the app said so and then saved over it with the next change. Two tabs each saved their own copy, so a tab left open in the background could erase a day's tasks with one click. An automatic repeat release wrote over the Redo stack. All three are fixed: unreadable data is quarantined under its own key and the board stops saving until the person decides, every write checks the stored revision first, and releases wait while Redo is possible.

**The board moved under people.** Completing a task opened the Done tray and scrolled the page to it, so working through a list meant scrolling back after every tick. Undo was a toolbar button and a screen-reader announcement; nothing on screen said what had just happened or offered to reverse it. Done, Discard, Restore and the new Move menu now leave the page where it was, move focus to the neighbouring card, and show an Undo bar.

**The matrix didn't say what to do.** The quadrant names were the axes ("Urgent + Important") rather than the decision. Each box now carries its action: Do now, Delegate or batch, Schedule, Drop. Urgency was a label you had to remember to change, and optional due dates were the smallest change that let the clock do it.

**Touch was fragile.** Any swipe that started on a card could reorder tasks, iOS zoomed into every field, and phone landscape lost half the screen to the header. Drags now start only from a visible grip.

**Accessibility was mostly good, with a few real traps.** The theme picker couldn't be browsed with arrow keys: the list rebuilt under focus and bounced between two entries, and one entry opened a dialog. Focus sometimes fell to the top of the page. Every card's buttons had the same names. Windows High Contrast hid the selected and drop-target states. Each of these is fixed, and axe now reports no WCAG A or AA violations on the screens it scans.

## The final review

Once everything was built, a separate reviewer tried to break the whole set of changes in a browser. It found twelve problems that the 89 tests at the time all missed, two of them serious:

- A tab that went into conflict while busy could later swap in the other tab's board on its own, silently dropping tasks it had added in the meantime. A tab now remembers that it has unsaved changes, never updates on its own while it does, offers "Load the other tab's version" or "Keep this tab's version", and warns before it closes.
- Restoring a backup over a locked board unlocked it even when there was no room to copy the unreadable data aside, so the original was lost. Restore now refuses in that case, just as "Start a new board" already did.

The rest were keyboard layering (Escape closing two things at once, number keys acting on a hidden panel), focus landing on the page body, announcements overwritten while a search was active, Help unreachable on a touch screen with single-key shortcuts off, a Redo that held repeat copies back indefinitely, Safari's composition Enter, and templates lost between two tabs. Every one we fixed has a test that fails on the reviewed build.

A second reviewer then checked those fixes and found four holes in them. The catch-up after a conflict ran inside the person's next click and could swallow it. Two tabs saving templates at once could still lose one. "Keep this tab's version" could write over a board saved by a newer version. A restore could discard a tab's unsaved changes. All four are fixed: the catch-up runs just after an action, never during it; templates and saved searches merge by ID; anything this version can't read is copied aside before any deliberate overwrite (a second unreadable copy no longer replaces the first); and a restore waits until you've chosen which tab's version to keep.

A third pass on those fixes found smaller things, and they're fixed too. Copies of unreadable data could fill both slots and leave no way forward; now later saves from a newer version simply replace each other, and downloading the data always counts as a safe copy. A touch drag released over nothing didn't catch up. Card actions and Inbox sorting now catch up inside their own click, act by task ID, and never place an Inbox task you haven't seen. Hitting the 100-template limit while another tab saved one is reported instead of silently dropped, and a restore treats templates the same whatever its revision number. A second damaged preferences record no longer replaces the first. Clearing storage in another tab ends a pending conflict, and catching up keeps focus where it was.

Across the three reviews the suite grew by 31 tests, each failing on the build it fixed. The two-tab tests read storage from the tab that wrote it: Chromium passes storage to other tabs asynchronously, and reading from the wrong tab made two of them flaky under load.

Some findings stay as known limits. A tab still running an internal build drops the new fields (due dates, completion dates) if it saves while 1.0.0 is open; bumping the format version would be worse, because internal builds overwrite data they can't read. The changelog asks people to close such tabs first. Phone keyboards have no Shift + Enter, so task titles are one line on a phone; Details still take several lines. Two tabs saving within the same few milliseconds can both claim the same revision number, and the later write wins without a banner; scripted clicks triggered it, a person switching between windows can't. And a Redo left unused for ten minutes can be cleared by a repeating task coming back, so that copies are never held back for good.

## Ideas we built, and why

We kept to the app's existing philosophy: one file, private, offline, no accounts, calm visuals, and every feature optional so the empty board stays simple. Anything that needed a server, a new dependency or a new visual language was out.

| Idea | Why it earned its place |
| --- | --- |
| Due dates | Urgency is about time; without dates the "urgent" axis drifts out of date. Optional, one field. |
| Move menu | Dragging was the only way to move a task with a pointer (WCAG 2.5.7), and it's awkward on phones. |
| Undo bar | Undo was in the toolbar, far from the task that just disappeared. |
| Quadrant verbs | Turns the matrix from a sorting exercise into advice. Costs one line of text per box. |
| Enter-to-add, form stays open | Capturing five tasks used to take five round trips. |
| Inbox sorting by number | The sorting panel already existed; keys made it fast and fixed a hidden-form bug. |
| Backup reminder | The only copy of the data lives in one browser. A gentle nudge is the cheapest insurance. |
| Restore confirmation | Picking a file replaced the whole board without a question (it could be undone, if you knew to). |
| Shortcut help | Shortcuts were only in tooltips and the README; WCAG 2.1.4 also needs a way to turn single-key ones off. |
| Phone overview | Stacked on a phone, the matrix stopped looking like a matrix. |
| Print layout | Printing gave buttons and trays. A one-page matrix is useful on a fridge or a desk. |

## Ideas we left out

**Sync, accounts or sharing.** They'd need a server and would end "private by design". A backup file already moves a board between devices.

**Reminders and notifications.** The Notification API only fires while the page is open, which makes reminders unreliable in exactly the case they matter. Due dates on the board are honest about what the app can do.

**AI prioritisation.** It would need a network call and would second-guess the one decision the matrix asks the person to make.

**A Content Security Policy.** The single-file design runs inline scripts, so a useful CSP would have to list their hashes and be regenerated after every edit, which fights the edit-and-reload workflow. We also couldn't test whether it would break the Open Design inspection tooling. The file loads nothing external, so the gain is small for now.

**A global "More" menu to tidy the toolbar.** It would hide features people already use. We made the toolbar fit one row from 1366px instead.

**Lenient import** (restoring the good tasks from a partly damaged backup). Valuable, but it needs its own review screen to avoid silently dropping data. Deferred.

**Changing Escape to keep a draft.** Escape discards an unsaved add form, and the recovery banner covers accidents. Changing it would surprise people used to the internal builds.

**A live region on the Undo bar.** Every action that shows the bar already announces itself through the page's status region. A second live region would read each one twice.

**A new backup format number.** The new fields are optional, so format 7 still describes the data. Format 8 would make internal builds treat 1.0.0 data as unreadable, and they save over data they can't read.

**Changing card order in column view.** In multi-column boxes, each card goes into whichever column is shortest, so rank order runs across the columns and can skip one. Strict row order would leave gaps under short cards; the number on each card already says its rank. Left as is.

## Checks that need a person

These need a person and a device, not a test runner. Youssef approved the visible changes (item 7) on 11 October 2026; items 1 to 6 are still open.

1. **Safari, on a Mac and an iPhone.** Date input, the 16px form text (no zoom), touch drags from the grip, the Undo bar position above the home indicator, and that `oklch()` colours render.
2. **Firefox.** Drag and drop between quadrants, the Move menu, and printing.
3. **A real Android phone.** Touch drags with edge scrolling, the 2×2 overview, and landscape.
4. **Open Design.** Open the file in your Open Design workflow and check that the `data-od-id` hooks still find the parts you edit. New elements carry their own IDs.
5. **Your own board.** Download a backup from your internal build, open 1.0.0 in the same browser and check everything is there. Then open the internal build again and check it still reads the board 1.0.0 saved.
6. **Two tabs, by hand.** Open the board twice, change both, and check that the banner's two choices do what they say. The tests cover this in Chromium only.
7. **The visible changes** listed under "Changed, worth a look" in the changelog. Each can be reverted on its own if you'd rather keep the internal build's behaviour.

## Release

Youssef tried the preview on 11 October 2026, approved the visible changes, and 1.0.0 was published the same day as the first public release. Before publishing, every em dash and en dash was removed from the project, and a test now fails if one comes back. The repository history starts at 1.0.0; the development history before it is kept privately.

To update from an internal build, download a backup first, then replace your `index.html` with the new one. Opened from the same place, 1.0.0 reads and saves the same board.
