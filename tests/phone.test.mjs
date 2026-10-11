import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, boardRecord, task, Q, settle } from './helpers.mjs';

after(closeBrowser);
const phone = { viewport: { width: 390, height: 844 }, contextOptions: { hasTouch: true, isMobile: true } };
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); })();

test('phones get a 2x2 overview with counts that jumps to each quadrant', async () => {
  const { page, close } = await openApp({ ...phone, board: boardRecord({ q1: [task('a', 'A', { due: yesterday }), task('b', 'B')], q3: Array.from({ length: 6 }, (_, i) => task(`s${i}`, `Plan ${i}`)), q4: [task('c', 'C')] }) });
  assert.equal(await page.isVisible('#matrix-overview'), true);
  const cells = await page.$$eval('[data-overview]', links => links.map(link => link.getAttribute('aria-label')));
  assert.deepEqual(cells, ['Do now: Urgent + Important, 2 tasks, 1 overdue', 'Delegate or batch: Urgent + Not Important, 0 tasks', 'Schedule: Not Urgent + Important, 6 tasks', 'Drop: Not Urgent + Not Important, 1 task']);
  await page.tap('[data-overview="not-urgent-important"]');
  await settle(page);
  const top = await page.evaluate(() => document.getElementById('quadrant-not-urgent-important').getBoundingClientRect().top);
  assert.ok(Math.abs(top) < 40, `quadrant top at ${top}`);
  await close();
});

test('the overview stays out of the way on wide screens', async () => {
  const { page, close } = await openApp();
  assert.equal(await page.isHidden('#matrix-overview'), true);
  await close();
});

test('holding a dragged card near the bottom edge keeps scrolling the page', async () => {
  const many = boardRecord({ q1: Array.from({ length: 12 }, (_, i) => task(`t${i}`, `Task ${i}`)), q4: [task('z', 'Last box')] });
  const { page, close } = await openApp({ ...phone, board: many });
  const cdp = await page.context().newCDPSession(page);
  const grip = await page.locator('[data-note-id="t0"] .drag-grip').boundingBox();
  const start = { x: grip.x + 22, y: grip.y + 22 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y + i * 3 }] });
  // The bottom edge zone ends at the dock when the dock sits at the bottom, otherwise at the screen edge.
  const edge = await page.evaluate(() => { const dock = document.getElementById('move-dock'); return dock.dataset.position === 'top' ? innerHeight : dock.getBoundingClientRect().top; });
  const hold = { x: start.x, y: edge - 20 };
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hold.x, y: start.y + (hold.y - start.y) * i / 10 }] });
  const before = await page.evaluate(() => scrollY);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => scrollY);
  const dock = await page.evaluate(() => { const box = document.getElementById('move-dock').getBoundingClientRect(); return { x: box.x + 6, y: box.y + 20 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [dock] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(after - before > 150, `scrolled only ${after - before}px while holding`);
  await close();
});
