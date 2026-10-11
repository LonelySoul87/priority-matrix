import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openApp, closeBrowser, titles, stored, boardRecord, task, Q, KEYS, fixturePath, readFixture } from './helpers.mjs';

after(closeBrowser);

async function download(page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#save-backup')]);
  return { name: file.suggestedFilename(), json: JSON.parse(fs.readFileSync(await file.path(), 'utf8')) };
}

test('a backup from internal build 1.11.2 restores every feature', async () => {
  const { page, errors, close } = await openApp();
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  const board = await stored(page);
  assert.deepEqual(board.quadrants[Q[0]].map(n => n.text), ['File the tax return']);
  assert.equal(board.quadrants[Q[0]][0].steps.length, 2);
  assert.deepEqual(board.quadrants[Q[0]][0].labels, ['finance']);
  assert.match(board.quadrants[Q[3]][0].text, /写真/);
  assert.deepEqual(board.inbox.map(n => n.text), ['Look into a standing desk']);
  assert.equal(board.completed[0].origin, Q[0]);
  assert.equal(board.discarded[0].discardedFrom, Q[3]);
  const extras = await stored(page, KEYS.extras);
  assert.equal(extras.templates.length, 1);
  assert.equal(extras.savedFilters.length, 1);
  assert.equal(extras.scheduled.length, 1);
  const prefs = await stored(page, KEYS.preferences);
  assert.equal(prefs.mood, 'custom-fixture');
  assert.equal(prefs.density, 'compact');
  assert.deepEqual(errors, []);
  await close();
});

test('restoring is undoable and a broken file changes nothing', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('mine', 'My task')] }) });
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  await page.click('#undo-control');
  assert.deepEqual(await titles(page, Q[0]), ['My task']);
  await page.setInputFiles('#restore-file', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":7,"quadrants":') });
  await page.waitForFunction(() => /board is unchanged/i.test(document.getElementById("backup-feedback").textContent));
  assert.deepEqual(await titles(page, Q[0]), ['My task']);
  await close();
});

test('restoring over a board asks first, and canceling changes nothing', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('mine', 'My task')] }), dialogs: 'manual' });
  let question = '';
  page.once('dialog', dialog => { question = dialog.message(); dialog.dismiss(); });
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /Restore canceled/.test(document.getElementById('backup-feedback').textContent));
  assert.match(question, /^Replace your board \(1 task\) with this backup \(7 tasks\)\? You can undo this\.$/);
  assert.deepEqual(await titles(page, Q[0]), ['My task']);
  await close();
});

test('download and restore round-trip keeps the board identical', async () => {
  const { page, close } = await openApp();
  await page.setInputFiles('#restore-file', fixturePath('backup-1.11.2.json'));
  await page.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  const first = await download(page);
  assert.match(first.name, /^priority-matrix-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(first.json.version, 7);
  const { page: second, close: closeSecond } = await openApp();
  await second.setInputFiles('#restore-file', { name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(first.json)) });
  await second.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
  const again = await download(second);
  for (const key of ['quadrants', 'inbox', 'completed', 'discarded', 'preferences']) assert.deepEqual(again.json[key], first.json[key], key);
  assert.deepEqual(again.json.extras.templates, first.json.extras.templates);
  await closeSecond();
  await close();
});

test('a board that nearly fills storage keeps new tasks after reload', async () => {
  const big = Array.from({ length: 170 }, (_, i) => task(`n${i}`, `Task ${i}`, { description: 'x'.repeat(9990) }));
  const { page, close } = await openApp({ board: boardRecord({ q1: big }) });
  await page.click(`[data-note-id="n0"] [data-action="done"]`);
  for (let i = 0; i < 20; i++) {
    await page.click('[data-action="add"][data-quadrant="not-urgent-important"]');
    await page.fill('#new-not-urgent-important', `Big ${i}`);
    await page.evaluate(() => { document.querySelector('#quick-add-not-urgent-important .task-description').value = 'y'.repeat(9990); });
    await page.click('#quick-add-not-urgent-important button[type="submit"]');
  }
  await page.reload();
  assert.equal((await titles(page, Q[2])).length, 20);
  await close();
});

test('an overlong draft field does not wipe templates or saved searches', async () => {
  const extras = { version: 1, revision: 5, templates: [{ id: 't1', name: 'Template', text: 'Template text', steps: [], description: '', labels: [], recurrence: null }], expandedSteps: [], expandedDetails: [], draft: null, savedFilters: [{ id: 'f1', name: 'Saved', tag: '', query: 'abc' }], activeTag: '', scheduled: [], bulkText: '', bulkReview: null };
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('x', 'Task')] }), extras });
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'Water plants');
  await page.evaluate(() => { document.querySelector('#quick-add-urgent-important details.form-options').open = true; });
  await page.selectOption('#quick-add-urgent-important .task-repeat', 'custom');
  await page.fill('#quick-add-urgent-important .repeat-every', '1'.repeat(21));
  await page.reload();
  // The loss used to show only in memory first, then reach storage on the next write.
  assert.equal(await page.locator('#template-list li').count(), 1);
  await page.click('[data-feature="discard-draft"]');
  const saved = await stored(page, KEYS.extras);
  assert.equal(saved.templates.length, 1);
  assert.equal(saved.savedFilters.length, 1);
  await close();
});

test('undo history survives a reload after completing a repeating task', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('w', 'Weekly', { recurrence: { unit: 'days', every: 7 } })] }) });
  await page.click('[data-note-id="w"] [data-action="done"]');
  await page.reload();
  assert.equal(await page.isDisabled('#undo-control'), false);
  await page.click('#undo-control');
  assert.deepEqual(await titles(page, Q[0]), ['Weekly']);
  await close();
});

test('storage that refuses every write is reported honestly', async () => {
  const { page, errors, close } = await openApp({ init: () => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'QuotaExceededError'); }; } });
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'Unsaved');
  await page.click('#quick-add-urgent-important button[type="submit"]');
  assert.match(await page.textContent('#save-state'), /may disappear|this tab only/i);
  assert.deepEqual(errors, []);
  await close();
});
