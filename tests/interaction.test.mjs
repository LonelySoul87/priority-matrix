import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, status, stored, boardRecord, task, Q, KEYS, settle } from './helpers.mjs';

after(closeBrowser);
const three = () => boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Beta'), task('c', 'Gamma')], q3: [task('d', 'Delta')] });

test('keyboard moves wait while another task is being edited', async () => {
  const { page, close } = await openApp({ board: three() });
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.focus('[data-note-id="b"]');
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Beta', 'Gamma']);
  assert.match(await status(page), /Save or cancel/);
  await close();
});

test('undo and redo shortcuts work on non-Latin keyboard layouts', async () => {
  const { page, close } = await openApp({ board: three() });
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Alt+ArrowDown');
  const press = (key, code) => page.evaluate(([k, c]) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, ctrlKey: true, bubbles: true, cancelable: true })), [key, code]);
  await press('я', 'KeyZ');
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Beta', 'Gamma']);
  await press('н', 'KeyY');
  assert.deepEqual(await titles(page, Q[0]), ['Beta', 'Alpha', 'Gamma']);
  await close();
});

test('a digit key does not throw away a multi-task selection', async () => {
  const { page, close } = await openApp({ board: three() });
  await page.click('#selection-toggle');
  await page.check('[data-select-task="a"]');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('2');
  assert.equal(await page.isChecked('[data-select-task="a"]'), true);
  await close();
});

test('Escape that ends an IME composition keeps the task being typed', async () => {
  const { page, close } = await openApp();
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'こんにちは');
  await page.evaluate(() => document.getElementById('new-urgent-important').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })));
  assert.equal(await page.isVisible('#quick-add-urgent-important'), true);
  assert.equal(await page.inputValue('#new-urgent-important'), 'こんにちは');
  await close();
});

test('links in details leave out trailing punctuation but keep balanced parentheses', async () => {
  const description = 'See https://example.com/a. Also (https://en.wikipedia.org/wiki/Foo_(bar)), and "https://x.org/q?a=1"!';
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Links', { description })] }) });
  await page.click('[data-note-id="a"] .task-details > summary');
  const hrefs = await page.$$eval('[data-note-id="a"] .task-details-copy a', links => links.map(link => link.getAttribute('href')));
  assert.deepEqual(hrefs, ['https://example.com/a', 'https://en.wikipedia.org/wiki/Foo_(bar)', 'https://x.org/q?a=1']);
  assert.equal(await page.textContent('[data-note-id="a"] .task-details-copy'), description);
  await close();
});

test('removing every pasted line ends the review instead of blocking Undo', async () => {
  const { page, close } = await openApp();
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-paste"]');
  await page.fill('#bulk-input', 'one\ntwo');
  await page.click('[data-feature="bulk-preview"]');
  await page.click('#bulk-preview [data-feature="bulk-remove"]');
  await page.click('#bulk-preview [data-feature="bulk-remove"]');
  const extras = await stored(page, KEYS.extras);
  assert.equal(extras.bulkReview, null);
  assert.equal(await page.isHidden('#bulk-review'), true);
  await close();
});

test('releasing a drag inside the move dock padding moves nothing', async () => {
  const { page, close } = await openApp({ viewport: { width: 1280, height: 800 }, board: three() });
  const handle = await page.locator('[data-note-id="a"] .drag-handle').boundingBox();
  await page.mouse.move(handle.x + 30, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + 60, { steps: 5 });
  await page.waitForSelector('#move-dock:not([hidden])');
  const point = await page.evaluate(() => { const box = document.getElementById('move-dock').getBoundingClientRect(); return { x: box.x + 5, y: box.y + 30 }; });
  await page.mouse.move(point.x, point.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(await titles(page, Q[2]), ['Delta']);
  await close();
});

test('dragging a card onto another quadrant moves it there', async () => {
  const { page, close } = await openApp({ viewport: { width: 1280, height: 900 }, board: three() });
  const handle = await page.locator('[data-note-id="a"] .drag-handle').boundingBox();
  const target = await page.locator('[data-note-id="d"]').boundingBox();
  await page.mouse.move(handle.x + 30, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 50, handle.y + 50, { steps: 5 });
  // In column view the half of the card you release on decides before or after; release on the right half.
  await page.mouse.move(target.x + target.width - 30, target.y + 40, { steps: 12 });
  await page.mouse.up();
  await settle(page);
  assert.deepEqual(await titles(page, Q[2]), ['Delta', 'Alpha']);
  await close();
});
