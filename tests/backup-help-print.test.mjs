import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, boardRecord, task, Q, status } from './helpers.mjs';

after(closeBrowser);
const five = () => boardRecord({ q1: Array.from({ length: 5 }, (_, i) => task(`t${i}`, `Task ${i}`)) });
const DEVICE = 'priority-matrix-device-v1';

test('a board with no backup yet gets a gentle reminder that a download clears', async () => {
  const { page, close } = await openApp({ board: five() });
  assert.match(await page.textContent('#save-state'), /Saved on this device\. No backup yet/);
  assert.equal(await page.evaluate(() => document.getElementById('save-backup').classList.contains('is-due')), true);
  assert.match(await page.getAttribute('#save-backup', 'aria-label'), /Last backup: never/);
  await Promise.all([page.waitForEvent('download'), page.click('#save-backup')]);
  assert.equal(await page.textContent('#save-state'), 'Saved on this device');
  assert.equal(await page.evaluate(() => document.getElementById('save-backup').classList.contains('is-due')), false);
  assert.match(await page.getAttribute('#save-backup', 'aria-label'), /Last backup: today/);
  await close();
});

test('the reminder returns after a week with changes, and not before', async () => {
  const eightDaysAgo = Date.now() - 8 * 86400000;
  const { page, close } = await openApp({ board: five(), raw: { [DEVICE]: JSON.stringify({ version: 1, lastBackupAt: eightDaysAgo, backupRevision: 1 }) } });
  assert.equal(await page.textContent('#save-state'), 'Saved on this device', 'no changes since that backup');
  await page.focus('[data-note-id="t0"]');
  await page.keyboard.press('Alt+ArrowDown');
  assert.match(await page.textContent('#save-state'), /Last backup 8 days ago/);
  await close();
});

test('? opens the shortcuts list, and single-key shortcuts can be turned off', async () => {
  const { page, close } = await openApp();
  await page.keyboard.press('Shift+?');
  assert.equal(await page.evaluate(() => document.getElementById('help-dialog').open), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close-help');
  await page.uncheck('#single-key-toggle');
  await page.click('#close-help');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('1');
  assert.equal(await page.isHidden('#quick-add-urgent-important'), true, 'digits do nothing when switched off');
  await page.click('#help-toggle');
  await page.check('#single-key-toggle');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'help-toggle');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('1');
  assert.equal(await page.isVisible('#quick-add-urgent-important'), true);
  await close();
});

test('printing shows the tasks without controls', async () => {
  const { page, close } = await openApp({ colorScheme: 'dark', board: boardRecord({ q1: [task('a', 'Printed task')], q3: [task('b', 'Another')] }) });
  await page.emulateMedia({ media: 'print' });
  const state = await page.evaluate(() => ({
    toolbar: getComputedStyle(document.querySelector('.topnav')).display,
    actions: getComputedStyle(document.querySelector('.note-actions')).display,
    background: getComputedStyle(document.querySelector('.quadrant')).backgroundColor,
    text: getComputedStyle(document.querySelector('.note-copy')).color,
    visible: [...document.querySelectorAll('.note-copy')].map(n => n.textContent),
  }));
  assert.deepEqual(state, { toolbar: 'none', actions: 'none', background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)', visible: ['Printed task', 'Another'] });
  await close();
});
