import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openApp, closeBrowser, addTask, titles, stored, boardRecord, task, Q, KEYS, settle, fixturePath } from './helpers.mjs';

// Storage reaches another tab asynchronously in Chromium, so each check reads it from the tab that wrote it.

after(closeBrowser);
const rawBoard = page => page.evaluate(key => localStorage.getItem(key), KEYS.board);
const QUARANTINE = 'priority-matrix-unreadable-board-v1';

test('an unreadable saved board is never written over, and is kept aside', async () => {
  const broken = '{"version":7,"revision":9,"quadrants":{"urgent-important":[{"id":"x","text":"Half a';
  const { page, errors, close } = await openApp({ raw: { [KEYS.board]: broken } });
  assert.match(await page.textContent('#save-state'), /could not be read/i);
  assert.equal(await page.isVisible('#data-banner'), true);
  assert.deepEqual(await page.$$eval('#data-banner-actions button', buttons => buttons.map(b => b.textContent)), ['Download saved data', 'Restore a backup', 'Start a new board']);
  await addTask(page, Q[0], 'Typed while locked');
  await page.reload();
  assert.equal(await rawBoard(page), broken, 'the original bytes are untouched');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), QUARANTINE), broken);
  assert.deepEqual(errors, []);
  await close();
});

test('the unreadable data can be downloaded, and a new board started on purpose', async () => {
  const broken = 'not json at all';
  const { page, close } = await openApp({ raw: { [KEYS.board]: broken } });
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#data-banner-actions >> text=Download saved data')]);
  assert.match(file.suggestedFilename(), /^priority-matrix-unreadable-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(await file.path(), 'utf8')).board, broken);
  await page.click('#data-banner-actions >> text=Start a new board');
  await addTask(page, Q[0], 'Fresh start');
  assert.deepEqual((await stored(page)).quadrants[Q[0]].map(n => n.text), ['Fresh start']);
  assert.match(await page.textContent('#data-banner-text'), /kept separately/);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), QUARANTINE), broken);
  await close();
});

test('data saved by a newer version is protected and explained', async () => {
  const newer = JSON.stringify({ version: 8, revision: 4, quadrants: {} });
  const { page, close } = await openApp({ raw: { [KEYS.board]: newer } });
  assert.match(await page.textContent('#save-state'), /newer version/i);
  assert.match(await page.textContent('#data-banner-text'), /newer version/i);
  await addTask(page, Q[0], 'Should not save');
  assert.equal(await rawBoard(page), newer);
  await close();
});

test('a due repeat copy does not save over an unreadable board while loading', async () => {
  const broken = '{"version":7,"revision":3,"quadrants":';
  const due = { note: { ...task('c', 'Daily'), recurrence: { unit: 'days', every: 1 }, seriesId: 's', repeatIssued: false }, sourceId: 's', completedAt: Date.now() - 2e8, destination: Q[0], availableAt: Date.now() - 1000 };
  const extras = { version: 1, revision: 1, templates: [], expandedSteps: [], expandedDetails: [], draft: null, savedFilters: [], activeTag: '', scheduled: [due], bulkText: '', bulkReview: null };
  const { page, close } = await openApp({ raw: { [KEYS.board]: broken, [KEYS.extras]: JSON.stringify(extras) } });
  await settle(page);
  assert.equal(await rawBoard(page), broken);
  await close();
});

test('restoring a backup unlocks a protected board', async () => {
  const { page, close } = await openApp({ raw: { [KEYS.board]: 'garbage' } });
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  assert.deepEqual((await stored(page)).quadrants[Q[1]].map(n => n.text), ['Reply to the venue']);
  assert.doesNotMatch(await page.textContent('#save-state'), /could not be read/i);
  await close();
});

test('a backup from a newer version is refused with a clear reason', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Mine')] }) });
  await page.setInputFiles('#restore-file', { name: 'n.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 9, quadrants: {} })) });
  await page.waitForFunction(() => /newer version/i.test(document.getElementById('backup-feedback').textContent));
  assert.deepEqual(await titles(page, Q[0]), ['Mine']);
  await close();
});

test('unreadable templates and searches are kept aside before being replaced', async () => {
  const badExtras = JSON.stringify({ version: 1, revision: 2, templates: [{ id: 't', name: 'x'.repeat(81), text: 'T', steps: [] }], savedFilters: [] });
  const { page, close } = await openApp({ raw: { [KEYS.extras]: badExtras } });
  assert.equal(await page.evaluate(() => localStorage.getItem('priority-matrix-unreadable-extras-v1')), badExtras);
  assert.match(await page.textContent('#data-banner-text'), /kept separately/);
  await close();
});

test('an idle second tab picks up changes made in the first', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Shared')] }) });
  const second = await openSecondTab();
  await addTask(first, Q[1], 'From the first tab');
  await second.waitForFunction(() => document.querySelectorAll('[data-notes="urgent-not-important"] .note-card').length === 1);
  await addTask(second, Q[2], 'From the second tab');
  await first.waitForFunction(() => document.querySelectorAll('[data-notes="not-urgent-important"] .note-card').length === 1);
  await first.reload();
  assert.deepEqual(await titles(first, Q[1]), ['From the first tab']);
  assert.deepEqual(await titles(first, Q[2]), ['From the second tab']);
  await close();
});

test('a busy tab does not overwrite newer changes from another tab', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Shared')] }) });
  const second = await openSecondTab();
  await second.click('[data-note-id="a"] [data-action="edit"]');
  await second.fill('.inline-edit textarea', 'Edited in the second tab');
  await addTask(first, Q[1], 'Added in the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.click('.inline-edit button[type="submit"]');
  assert.deepEqual((await stored(first)).quadrants[Q[1]].map(n => n.text), ['Added in the first tab'], 'the newer change survives');
  await second.click('#data-banner-actions >> text=Load the other tab\'s version');
  assert.deepEqual(await titles(second, Q[1]), ['Added in the first tab']);
  assert.equal(await second.isHidden('#data-banner'), true);
  await close();
});

test('automatic repeat releases wait while Redo is possible', async () => {
  const now = Date.now();
  const copy = { note: { ...task('c', 'Daily copy'), recurrence: { unit: 'days', every: 1 }, seriesId: 's', repeatIssued: false }, sourceId: 's', completedAt: now - 2e8, destination: Q[1], availableAt: now + 30000 };
  const source = { ...task('s', 'Daily copy', { recurrence: { unit: 'days', every: 1 } }), origin: Q[1], seriesId: 's', repeatIssued: true };
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')], done: [source], queue: [copy] }) });
  await page.clock.install({ time: now });
  await page.reload();
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Alt+3');
  await page.click('#undo-control');
  await page.clock.runFor(70000);
  assert.deepEqual(await titles(page, Q[1]), [], 'no release while Redo is possible');
  assert.equal(await page.isDisabled('#redo-control'), false);
  await page.click('#redo-control');
  assert.deepEqual(await titles(page, Q[2]), ['Alpha']);
  await page.clock.runFor(70000);
  assert.deepEqual(await titles(page, Q[1]), ['Daily copy'], 'released once Redo is used up');
  await close();
});

test('a tab with its own unsaved changes is never replaced by another tab', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')] }) });
  const second = await openSecondTab();
  await second.click(`[data-action="add"][data-quadrant="${Q[1]}"]`);
  await second.fill(`#new-${Q[1]}`, 'Typed in the second tab');
  await addTask(first, Q[0], 'From the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.press(`#new-${Q[1]}`, 'Enter');
  await second.press(`#new-${Q[1]}`, 'Escape');
  await second.click('[data-note-id="a"] [data-action="done"]');
  await first.click('[data-note-id="b"] [data-action="done"]');
  await second.waitForTimeout(3500);
  assert.deepEqual(await titles(second, Q[1]), ['Typed in the second tab'], 'the second tab keeps its own work');
  assert.match(await second.textContent('#save-state'), /Not saved/);
  assert.deepEqual(await second.$$eval('#data-banner-actions button', buttons => buttons.map(b => b.textContent)), ["Load the other tab's version", "Keep this tab's version"]);
  await second.click("#data-banner-actions >> text=Keep this tab's version");
  const saved = await stored(second);
  assert.deepEqual(saved.quadrants[Q[1]].map(n => n.text), ['Typed in the second tab']);
  assert.deepEqual(saved.completed.map(n => n.text), ['Alpha']);
  await first.waitForFunction(() => document.querySelectorAll('[data-notes="urgent-not-important"] .note-card').length === 1);
  await close();
});

test('a tab that was only busy catches up as soon as it is idle', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  await second.click('#help-toggle');
  await addTask(first, Q[0], 'From the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.keyboard.press('Escape');
  await second.waitForSelector('#data-banner', { state: 'hidden' });
  assert.deepEqual(await titles(second, Q[0]), ['Alpha', 'From the first tab']);
  await addTask(second, Q[2], 'From the second tab');
  const saved = await stored(second);
  assert.deepEqual(saved.quadrants[Q[0]].map(n => n.text), ['Alpha', 'From the first tab']);
  assert.deepEqual(saved.quadrants[Q[2]].map(n => n.text), ['From the second tab']);
  await close();
});

test('loading the other tab\'s version asks first when this tab has changes', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }), dialogs: 'dismiss' });
  const second = await openSecondTab();
  await second.click('#help-toggle');
  await addTask(first, Q[0], 'From the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.click('#close-help');
  await second.waitForSelector('#data-banner', { state: 'hidden' });
  await second.click('[data-note-id="a"] [data-action="edit"]');
  await addTask(first, Q[1], 'Second change');
  await second.fill('.inline-edit textarea', 'Edited here');
  await second.click('.inline-edit button[type="submit"]');
  await second.click("#data-banner-actions >> text=Load the other tab's version");
  assert.deepEqual(await titles(second, Q[0]), ['Edited here', 'From the first tab'], 'declining keeps this tab as it is');
  await close();
});

test('restoring needs a safe copy of unreadable data, or nothing changes', async () => {
  const broken = '{"version":8,"revision":4,"quadrants":{}}';
  const init = () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (String(key).startsWith('priority-matrix-unreadable')) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, key, value); }; };
  const { page, close } = await openApp({ raw: { [KEYS.board]: broken }, init });
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /nothing was restored/i.test(document.getElementById('backup-feedback').textContent));
  assert.equal(await rawBoard(page), broken);
  assert.match(await page.textContent('#data-banner-text'), /newer version/);
  await close();
});

test('restoring is refused while this tab has changes it could not save', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  await second.click('[data-note-id="a"] [data-action="edit"]');
  await addTask(first, Q[0], 'Important work from the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.fill('.inline-edit textarea', 'Edited in the second tab');
  await second.click('.inline-edit button[type="submit"]');
  await second.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await second.waitForFunction(() => /Choose which version to keep/.test(document.getElementById('backup-feedback').textContent));
  assert.deepEqual(await titles(second, Q[0]), ['Edited in the second tab']);
  assert.deepEqual((await stored(first)).quadrants[Q[0]].map(n => n.text), ['Alpha', 'Important work from the first tab']);
  await close();
});

test('undoing a restore made out of a conflict returns to the saved board', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  await second.click('#selection-toggle');
  await addTask(first, Q[0], 'Important work from the first tab');
  await second.waitForSelector('#data-banner:not([hidden])');
  await second.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await second.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  await second.click('#undo-control');
  assert.deepEqual((await stored(second)).quadrants[Q[0]].map(n => n.text), ['Alpha', 'Important work from the first tab']);
  await close();
});

test('a draft typed in a busy tab does not erase a template saved in another tab', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  await second.click(`[data-action="add"][data-quadrant="${Q[1]}"]`);
  await second.locator(`#new-${Q[1]}`).pressSequentially('Draft');
  await first.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await first.fill(`#new-${Q[0]}`, 'Template task');
  await first.click(`#quick-add-${Q[0]} details.form-options > summary`);
  await first.click(`#quick-add-${Q[0]} [data-feature="save-template"]`);
  assert.equal((await stored(first, KEYS.extras)).templates.length, 1);
  // Storage reaches another tab asynchronously; a person is never this fast, so wait until the second tab can see the template.
  await second.waitForFunction(key => JSON.parse(localStorage.getItem(key)).templates.length === 1, KEYS.extras);
  await second.locator(`#new-${Q[1]}`).pressSequentially(' in the second tab');
  assert.deepEqual((await stored(second, KEYS.extras)).templates.map(t => t.text), ['Template task']);
  assert.match(await second.inputValue(`#new-${Q[1]}`), /^Draft in the second tab$/);
  await close();
});

test('catching up after an edit never swallows the next click', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')] }) });
  const second = await openSecondTab();
  await first.click('[data-note-id="a"] [data-action="edit"]');
  await addTask(second, Q[1], 'From the second tab');
  await first.waitForSelector('#data-banner:not([hidden])');
  await first.click('[data-action="cancel-edit"]');
  await first.click('[data-note-id="b"] [data-action="done"]');
  assert.deepEqual(await titles(first, 'done'), ['Bravo']);
  assert.deepEqual(await titles(first, Q[1]), ['From the second tab']);
  const saved = await stored(first);
  assert.deepEqual(saved.completed.map(n => n.text), ['Bravo']);
  assert.deepEqual(saved.quadrants[Q[1]].map(n => n.text), ['From the second tab']);
  await close();
});

test('a keyboard move right after an edit ends uses the latest board', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')] }) });
  const second = await openSecondTab();
  await first.click('[data-note-id="b"] [data-action="edit"]');
  await addTask(second, Q[1], 'From the second tab');
  await first.waitForSelector('#data-banner:not([hidden])');
  await first.click('[data-action="cancel-edit"]');
  await first.waitForTimeout(100); // a person's pause; well inside the 3 s fallback check
  await first.focus('[data-note-id="a"]');
  await first.keyboard.press('Alt+ArrowDown');
  const saved = await stored(first);
  assert.deepEqual(saved.quadrants[Q[0]].map(n => n.text), ['Bravo', 'Alpha']);
  assert.deepEqual(saved.quadrants[Q[1]].map(n => n.text), ['From the second tab']);
  assert.equal(await first.isHidden('#data-banner'), true);
  await close();
});

test('templates saved in two tabs at once are both kept', async () => {
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  const saveTemplate = async (page, quadrant, text) => {
    await page.click(`[data-action="add"][data-quadrant="${quadrant}"]`);
    await page.fill(`#new-${quadrant}`, text);
    await page.click(`#quick-add-${quadrant} details.form-options > summary`);
    await page.click(`#quick-add-${quadrant} [data-feature="save-template"]`);
  };
  await first.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await first.fill(`#new-${Q[0]}`, 'From the first tab');
  await saveTemplate(second, Q[1], 'From the second tab');
  await first.waitForFunction(key => JSON.parse(localStorage.getItem(key)).templates.length === 1, KEYS.extras);
  await first.click(`#quick-add-${Q[0]} details.form-options > summary`);
  await first.click(`#quick-add-${Q[0]} [data-feature="save-template"]`);
  assert.deepEqual((await stored(first, KEYS.extras)).templates.map(t => t.text).sort(), ['From the first tab', 'From the second tab']);
  await close();
});

test('a board another tab saved in a newer format is kept aside, never overwritten', async () => {
  const kept = 'priority-matrix-unreadable-board-v1';
  const { page: first, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  const newer = JSON.stringify({ version: 8, revision: 50, quadrants: {} });
  await second.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.board, newer]);
  await first.waitForFunction(() => /newer version/.test(document.getElementById('data-banner-text').textContent));
  await addTask(first, Q[0], 'Typed in the older tab');
  assert.equal(await rawBoard(first), newer);
  assert.equal(await first.evaluate(key => localStorage.getItem(key), kept), newer);
  await first.click('#data-banner-actions >> text=Start a new board');
  assert.deepEqual((await stored(first)).quadrants[Q[0]].map(n => n.text), ['Alpha', 'Typed in the older tab']);
  assert.equal(await first.evaluate(key => localStorage.getItem(key), kept), newer, 'the newer data stays kept');
  await close();
});

test('a second unreadable copy does not replace the first one that was kept', async () => {
  const older = 'damaged board text';
  const { page: first, openSecondTab, close } = await openApp({ raw: { [KEYS.board]: older } });
  await first.click('#data-banner-actions >> text=Start a new board');
  const second = await openSecondTab();
  const newer = JSON.stringify({ version: 8, revision: 50, quadrants: {} });
  await second.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.board, newer]);
  await first.waitForFunction(() => /newer version/.test(document.getElementById('data-banner-text').textContent));
  const keptCopies = await first.evaluate(() => [localStorage.getItem('priority-matrix-unreadable-board-v1'), localStorage.getItem('priority-matrix-unreadable-board-earlier-v1')]);
  assert.deepEqual(keptCopies, [newer, older]);
  await close();
});
