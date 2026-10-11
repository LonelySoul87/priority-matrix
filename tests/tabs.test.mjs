import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openApp, closeBrowser, addTask, titles, stored, boardRecord, task, Q, KEYS, fixturePath, readFixture } from './helpers.mjs';

after(closeBrowser);
// Storage reaches another tab asynchronously in Chromium, so each check reads it from the tab that wrote it.
const KEPT = 'priority-matrix-unreadable-board-v1', KEPT_EARLIER = 'priority-matrix-unreadable-board-earlier-v1';
const read = (page, ...keys) => page.evaluate(names => names.map(name => localStorage.getItem(name)), keys);
const template = (id, text) => ({ id, name: text, text, steps: [], description: '', labels: [], recurrence: null, due: null });
const extrasWith = (templates, revision = 3) => ({ version: 1, revision, templates, savedFilters: [], expandedSteps: [], expandedDetails: [], draft: null, activeTag: '', scheduled: [], bulkText: '', bulkReview: null });
async function saveTemplate(page, quadrant, text) {
  await page.click(`[data-action="add"][data-quadrant="${quadrant}"]`);
  await page.fill(`#new-${quadrant}`, text);
  await page.click(`#quick-add-${quadrant} details.form-options > summary`);
  await page.click(`#quick-add-${quadrant} [data-feature="save-template"]`);
}

test('repeated saves from a newer version keep only the latest copy, and nothing gets stuck', async () => {
  const { page, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const newer = await openSecondTab();
  let last = '';
  for (let save = 1; save <= 3; save++) {
    last = JSON.stringify({ version: 8, revision: 50 + save, quadrants: {}, note: `save ${save}` });
    await newer.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.board, last]);
    await page.waitForFunction(([key, value]) => localStorage.getItem(key) === value, [KEPT, last]);
  }
  assert.deepEqual(await read(page, KEPT, KEPT_EARLIER), [last, null]);
  await page.click('#data-banner-actions >> text=Start a new board');
  assert.deepEqual((await stored(page)).quadrants[Q[0]].map(n => n.text), ['Alpha']);
  await close();
});

test('when the device has no room for another copy, downloading it is the way out', async () => {
  const { page, close } = await openApp({ raw: { [KEYS.board]: 'third damaged copy', [KEPT]: 'second damaged copy', [KEPT_EARLIER]: 'first damaged copy' } });
  await page.click('#data-banner-actions >> text=Start a new board');
  assert.match(await page.textContent('#action-status'), /Download the saved data first/);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEYS.board), 'third damaged copy');
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#data-banner-actions >> text=Download saved data')]);
  const body = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  assert.deepEqual([body.board, body.boardEarlier, body.boardLatest], ['second damaged copy', 'first damaged copy', 'third damaged copy']);
  await page.click('#data-banner-actions >> text=Start a new board');
  assert.equal((await stored(page)).version, 7);
  assert.deepEqual(await read(page, KEPT, KEPT_EARLIER), ['second damaged copy', 'first damaged copy'], 'the kept copies stay');
  await close();
});

test('a touch drag released over nothing catches up, so the next tap merges cleanly', async () => {
  const { page, openSecondTab, close } = await openApp({ viewport: { width: 390, height: 844 }, board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')] }), contextOptions: { hasTouch: true, isMobile: true } });
  const second = await openSecondTab();
  const cdp = await page.context().newCDPSession(page);
  const grip = await page.locator('[data-note-id="a"] .drag-grip').boundingBox();
  const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 4, y: y + i * 10 }] });
  await addTask(second, Q[1], 'From the second tab');
  await page.waitForSelector('#data-banner:not([hidden])');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 10, y: 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await page.tap('[data-note-id="b"] [data-action="done"]');
  const saved = await stored(page);
  assert.deepEqual(saved.completed.map(n => n.text), ['Bravo']);
  assert.deepEqual(saved.quadrants[Q[1]].map(n => n.text), ['From the second tab']);
  assert.equal(await page.isHidden('#data-banner'), true);
  await close();
});

test('undoing a restore brings back a template another tab saved, whatever the backup\'s revision', async () => {
  const fixture = readFixture('backup-1.11.2.json');
  for (const backup of [{ name: 'fixture.json', json: fixture }, { name: 'high.json', json: { ...fixture, extras: { ...fixture.extras, revision: 999 } } }]) {
    const { page, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }), extras: extrasWith([template('t1', 'Original')]) });
    const second = await openSecondTab();
    await page.click('#selection-toggle');
    await saveTemplate(second, Q[1], 'Saved in the second tab');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).templates.length === 2, KEYS.extras);
    await page.setInputFiles('#restore-file', { name: backup.name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup.json)) });
    await page.waitForFunction(() => /restored/i.test(document.getElementById('backup-feedback').textContent));
    assert.deepEqual((await stored(page, KEYS.extras)).templates.map(t => t.text), fixture.extras.templates.map(t => t.text), `${backup.name}: the backup's templates replace the list`);
    await page.click('#undo-control');
    assert.deepEqual((await stored(page, KEYS.extras)).templates.map(t => t.text).sort(), ['Original', 'Saved in the second tab'], backup.name);
    await close();
  }
});

test('saving a template when another tab just took the last place says so', async () => {
  const many = Array.from({ length: 99 }, (_, i) => template(`t${i}`, `Template ${i}`));
  const { page, openSecondTab, close } = await openApp({ extras: extrasWith(many) });
  const second = await openSecondTab();
  await page.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await page.fill(`#new-${Q[0]}`, 'From the first tab');
  await saveTemplate(second, Q[1], 'From the second tab');
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).templates.length === 100, KEYS.extras);
  await page.click(`#quick-add-${Q[0]} details.form-options > summary`);
  await page.click(`#quick-add-${Q[0]} [data-feature="save-template"]`);
  assert.match(await page.textContent(`#quick-add-${Q[0]}`), /another tab just used the last place/);
  const saved = (await stored(page, KEYS.extras)).templates;
  assert.equal(saved.length, 100);
  assert.ok(saved.some(t => t.text === 'From the second tab'));
  await close();
});

test('a second damaged preferences or extras record does not replace the first kept copy', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }), raw: { [KEYS.preferences]: 'damaged preferences one' } });
  await page.evaluate(key => localStorage.setItem(key, 'damaged preferences two'), KEYS.preferences);
  await page.reload();
  assert.deepEqual(await read(page, 'priority-matrix-unreadable-preferences-v1', 'priority-matrix-unreadable-preferences-earlier-v1'), ['damaged preferences two', 'damaged preferences one']);
  for (const value of ['damaged extras one', 'damaged extras two']) { await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [KEYS.extras, value]); await page.reload(); }
  assert.deepEqual(await read(page, 'priority-matrix-unreadable-extras-v1', 'priority-matrix-unreadable-extras-earlier-v1'), ['damaged extras two', 'damaged extras one']);
  await close();
});

test('templates saved by a newer version in another tab are kept aside before this tab writes', async () => {
  const { page, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  const newer = JSON.stringify({ version: 2, revision: 40, templates: [{ id: 'n1', name: 'Newer-format template' }] });
  await second.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.extras, newer]);
  await page.waitForFunction(key => localStorage.getItem(key)?.includes('Newer-format'), KEYS.extras);
  await page.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await page.keyboard.type('x');
  assert.equal(await page.evaluate(() => localStorage.getItem('priority-matrix-unreadable-extras-v1')), newer);
  await close();
});

test('clearing storage in another tab ends a pending conflict', async () => {
  const { page, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  const second = await openSecondTab();
  await page.click('#help-toggle');
  await addTask(second, Q[1], 'From the second tab');
  await page.waitForSelector('#data-banner:not([hidden])');
  await second.evaluate(() => localStorage.clear());
  await page.click('#close-help');
  await page.waitForSelector('#data-banner', { state: 'hidden' });
  await addTask(page, Q[2], 'From the first tab');
  assert.deepEqual((await stored(page)).quadrants[Q[2]].map(n => n.text), ['From the first tab']);
  assert.equal(await page.isHidden('#data-banner'), true);
  await close();
});

test('catching up after a keyboard Cancel keeps focus where it was', async () => {
  const { page, openSecondTab, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')] }) });
  const second = await openSecondTab();
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await addTask(second, Q[1], 'From the second tab');
  await page.waitForSelector('#data-banner:not([hidden])');
  await page.focus('[data-action="cancel-edit"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#data-banner', { state: 'hidden' });
  // Focus lands on the next frame after a render.
  await page.waitForFunction(() => document.activeElement.dataset.action === 'edit' && document.activeElement.closest('.note-card')?.dataset.noteId === 'a', null, { timeout: 2000 });
  await page.keyboard.press('Enter');
  assert.equal(await page.isVisible('.inline-edit textarea'), true, 'the next Enter opens the editor');
  await close();
});
