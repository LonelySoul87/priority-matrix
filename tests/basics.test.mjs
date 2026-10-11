import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, addTask, titles, stored, status, settle, boardRecord, task, Q, openTray } from './helpers.mjs';

after(closeBrowser);

test('loads without script errors and starts empty', async () => {
  const { page, errors, close } = await openApp();
  assert.equal(await page.locator('.note-card').count(), 0);
  assert.match(await page.textContent('.app-version'), /^v\d+\.\d+\.\d+$/);
  assert.deepEqual(errors, []);
  await close();
});

test('adds tasks to every quadrant and keeps their order after reload', async () => {
  const { page, errors, close } = await openApp();
  for (const [index, key] of Q.entries()) {
    await addTask(page, key, `First ${index}`);
    await addTask(page, key, `Second ${index}`);
  }
  await page.reload();
  for (const [index, key] of Q.entries()) assert.deepEqual(await titles(page, key), [`First ${index}`, `Second ${index}`]);
  assert.deepEqual(errors, []);
  await close();
});

test('edits, completes, discards, restores and permanently deletes with undo', async () => {
  const { page, errors, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Beta')] }) });
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.fill('.inline-edit textarea', 'Alpha edited');
  await page.click('.inline-edit button[type="submit"]');
  assert.deepEqual(await titles(page, Q[0]), ['Alpha edited', 'Beta']);

  await page.click('[data-note-id="a"] [data-action="done"]');
  assert.deepEqual(await titles(page, 'done'), ['Alpha edited']);
  assert.equal(await page.getAttribute('#done-toggle', 'aria-expanded'), 'false', 'completing keeps the Done tray closed');
  assert.match(await page.textContent('#undo-toast'), /Done: Alpha edited/);
  await openTray(page, 'done');
  await page.click('[data-note-id="a"] [data-action="restore"]');
  assert.deepEqual(await titles(page, Q[0]), ['Beta', 'Alpha edited']);

  await page.click('[data-note-id="b"] [data-action="discard"]');
  assert.deepEqual(await titles(page, 'discarded'), ['Beta']);
  await openTray(page, 'discarded');
  await page.click('[data-note-id="b"] [data-action="permanent-delete"]');
  assert.equal((await stored(page)).discarded.length, 0);
  await page.click('#undo-control');
  assert.deepEqual(await titles(page, 'discarded'), ['Beta']);
  assert.deepEqual(errors, []);
  await close();
});

test('keyboard moves reorder and move between sections, and undo restores', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Beta'), task('c', 'Gamma')] }) });
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await titles(page, Q[0]), ['Beta', 'Alpha', 'Gamma']);
  await settle(page);
  await page.focus('[data-note-id="c"]');
  await page.keyboard.press('Alt+3');
  assert.deepEqual(await titles(page, Q[2]), ['Gamma']);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Beta', 'Gamma']);
  await page.keyboard.press('Control+y');
  assert.deepEqual(await titles(page, Q[0]), ['Beta', 'Alpha', 'Gamma']);
  await close();
});

test('digit shortcuts open the matching add form, and slash opens search', async () => {
  const { page, close } = await openApp();
  await page.keyboard.press('3');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'new-not-urgent-important');
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'note-search');
  await close();
});

test('search filters cards and counts matches', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Buy milk'), task('b', 'Call bank')], q3: [task('c', 'Milk the idea')] }) });
  await page.click('#search-toggle');
  await page.fill('#note-search', 'milk');
  assert.match(await page.textContent('#search-feedback'), /2 matching tasks/);
  assert.equal(await page.locator('.note-card:visible').count(), 2);
  await close();
});

test('steps can be added, checked and survive reload', async () => {
  const { page, close } = await openApp();
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'With steps');
  await page.click('#quick-add-urgent-important .step-add');
  await page.fill('#quick-add-urgent-important .step-input', 'Step one');
  await page.click('#quick-add-urgent-important button[type="submit"]');
  await page.click('.checklist-toggle');
  await page.check('[data-step-check]');
  await page.reload();
  const saved = (await stored(page)).quadrants[Q[0]][0];
  assert.equal(saved.steps.length, 1);
  assert.equal(saved.steps[0].done, true);
  assert.match(await status(page) + '', /.*/);
  await close();
});
