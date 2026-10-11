import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, boardRecord, task, Q, settle } from './helpers.mjs';

after(closeBrowser);
const board = () => boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Beta'), task('c', 'Gamma')], q3: [task('d', 'Delta')] });
const focusedId = page => page.evaluate(() => document.activeElement?.closest?.('.note-card')?.dataset.noteId || document.activeElement?.id || document.activeElement?.tagName);

test('the Move menu lists the other boxes and moves without dragging', async () => {
  const { page, errors, close } = await openApp({ board: board() });
  await page.click('[data-note-id="b"] [data-action="move-menu"]');
  const options = await page.$$eval('[data-note-id="b"] .move-menu [data-move-to]', buttons => buttons.map(button => button.dataset.moveTo));
  assert.deepEqual(options, [Q[1], Q[2], Q[3], 'inbox']);
  assert.equal(await page.getAttribute('[data-note-id="b"] [data-action="move-menu"]', 'aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.moveTo), Q[1]);
  await page.click(`[data-note-id="b"] .move-menu [data-move-to="${Q[2]}"]`);
  assert.deepEqual(await titles(page, Q[2]), ['Delta', 'Beta']);
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Gamma']);
  assert.equal(await focusedId(page), 'c', 'focus moves to the card that took its place');
  assert.match(await page.textContent('#undo-toast'), /Moved to Not Urgent \+ Important: Beta/);
  assert.deepEqual(errors, []);
  await close();
});

test('Escape closes the Move menu and returns focus to its button', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('[data-note-id="a"] [data-action="move-menu"]');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.move-menu').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'move-menu');
  await close();
});

test('the Undo bar reverses the move and refocuses the task', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('[data-note-id="a"] [data-action="done"]');
  assert.equal(await page.isVisible('#undo-toast'), true);
  await page.click('#undo-toast-undo');
  await settle(page); await settle(page);
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Beta', 'Gamma']);
  assert.equal(await page.isHidden('#undo-toast'), true);
  assert.equal(await focusedId(page), 'a');
  await close();
});

test('a newer change hides the Undo bar so it never undoes the wrong thing', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('[data-note-id="a"] [data-action="discard"]');
  assert.equal(await page.isVisible('#undo-toast'), true);
  await page.focus('[data-note-id="b"]');
  await page.keyboard.press('Alt+ArrowDown');
  assert.equal(await page.isHidden('#undo-toast'), true);
  await close();
});

test('completing a task on a phone keeps the scroll position', async () => {
  const many = boardRecord({ q1: Array.from({ length: 8 }, (_, i) => task(`t${i}`, `Task ${i}`)) });
  const { page, close } = await openApp({ viewport: { width: 390, height: 844 }, board: many, contextOptions: { hasTouch: true, isMobile: true } });
  await page.locator('[data-note-id="t3"]').scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await page.tap('[data-note-id="t3"] [data-action="done"]');
  await settle(page);
  const after = await page.evaluate(() => scrollY);
  assert.ok(Math.abs(after - before) < 200, `scrolled from ${before} to ${after}`);
  await close();
});

async function touchPath(page, points) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  for (const point of rest) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
}
const line = (from, to, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }));

test('a swipe that starts on a card strip scrolls instead of moving the task', async () => {
  const many = boardRecord({ q1: Array.from({ length: 10 }, (_, i) => task(`t${i}`, `Task ${i}`)) });
  const { page, close } = await openApp({ viewport: { width: 390, height: 844 }, board: many, contextOptions: { hasTouch: true, isMobile: true } });
  await page.evaluate(() => scrollTo(0, 400));
  const strip = await page.locator('[data-note-id="t2"] .priority-number').boundingBox();
  const start = { x: strip.x + 20, y: strip.y + 10 };
  await touchPath(page, line(start, { x: start.x, y: start.y - 300 }));
  await page.waitForTimeout(400);
  assert.deepEqual(await titles(page, Q[0]), many.quadrants[Q[0]].map(n => n.text));
  assert.ok(await page.evaluate(() => scrollY) > 450, 'the page scrolled');
  await close();
});

test('dragging from the grip moves the task on a touch screen', async () => {
  const { page, close } = await openApp({ viewport: { width: 1024, height: 900 }, board: board(), contextOptions: { hasTouch: true } });
  const grip = await page.locator('[data-note-id="a"] .drag-grip').boundingBox();
  const target = await page.locator(`[data-notes="${Q[1]}"]`).boundingBox();
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await touchPath(page, line(start, { x: target.x + 80, y: target.y + 60 }, 20));
  assert.deepEqual(await titles(page, Q[1]), ['Alpha']);
  assert.deepEqual(await titles(page, Q[0]), ['Beta', 'Gamma']);
  await close();
});
