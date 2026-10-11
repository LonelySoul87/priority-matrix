import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, boardRecord, task, Q, status } from './helpers.mjs';

after(closeBrowser);

test('Enter adds a task and keeps the form open for the next one', async () => {
  const { page, close } = await openApp();
  await page.keyboard.press('1');
  for (const text of ['One', 'Two', 'Three']) { await page.keyboard.type(text); await page.keyboard.press('Enter'); }
  assert.deepEqual(await titles(page, Q[0]), ['One', 'Two', 'Three']);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'new-urgent-important');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('line two');
  assert.equal(await page.inputValue('#new-urgent-important'), '\nline two');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#quick-add-urgent-important'), true);
  await close();
});

test('Enter saves an inline edit; Details keeps Enter for new lines', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Old')] }) });
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.click('.inline-edit details.form-options > summary');
  await page.fill('.inline-edit .task-description', 'first');
  await page.press('.inline-edit .task-description', 'Enter');
  await page.type('.inline-edit .task-description', 'second');
  await page.fill('.inline-edit textarea:not(.task-description)', 'New');
  await page.press('.inline-edit textarea:not(.task-description)', 'Enter');
  assert.deepEqual(await titles(page, Q[0]), ['New']);
  assert.equal(await page.locator('.inline-edit').count(), 0);
  await close();
});

test('each quadrant says what to do and how to add to it', async () => {
  const { page, close } = await openApp();
  const verbs = await page.$$eval('.quadrant-verb', spans => spans.map(span => span.textContent));
  assert.deepEqual(verbs, ['Do now', 'Delegate or batch', 'Schedule', 'Drop']);
  assert.match(await page.textContent('[data-od-id="empty-not-urgent-important"]'), /Goals and plans go here\. .*Press 3 to add one\./);
  await close();
});

test('a new task hidden by a label filter clears the filter and says so', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Tagged', { labels: ['work'] })] }) });
  await page.click('[data-note-id="a"] .task-labels .label-chip');
  await page.click('[data-action="add"][data-quadrant="urgent-not-important"]');
  await page.fill('#new-urgent-not-important', 'Untagged');
  await page.press('#new-urgent-not-important', 'Enter');
  assert.equal(await page.isVisible('text=Untagged'), true);
  assert.match(await status(page), /Label filter cleared to show it/);
  await close();
});

test('editing keeps the search when the task still matches', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Milk run'), task('b', 'Bank')] }) });
  await page.click('#search-toggle');
  await page.fill('#note-search', 'milk');
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.fill('.inline-edit textarea:not(.task-description)', 'Milk and bread');
  await page.press('.inline-edit textarea:not(.task-description)', 'Enter');
  assert.equal(await page.inputValue('#note-search'), 'milk');
  await close();
});

test('the theme editor explains contrast problems with the names it shows', async () => {
  const { page, close } = await openApp();
  await page.click('#manage-themes');
  await page.$eval('[data-color-key="fg"]', input => { input.value = '#f0f0f0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.match(await page.textContent('#contrast-message'), /^Light colors: Main text on Canvas is below 4\.5:1\./);
  await close();
});
