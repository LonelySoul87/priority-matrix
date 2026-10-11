import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, status, boardRecord, task, Q, settle } from './helpers.mjs';

after(closeBrowser);
const board = () => boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')], q2: [task('c', 'Charlie needle')], inbox: [task('i', 'Inbox one'), task('j', 'Inbox two')] });
const focused = page => page.evaluate(() => document.activeElement?.closest?.('.note-card')?.dataset.noteId || document.activeElement?.id || document.activeElement?.dataset?.action || document.activeElement?.tagName);
const selecting = page => page.evaluate(() => document.querySelectorAll('[data-select-task]').length > 0);

test('number keys sort the Inbox only while the Sort panel can be seen', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  await page.click('#inbox-toggle');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('1');
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Bravo'], 'no hidden Inbox task was placed');
  assert.equal(await page.isVisible(`#quick-add-${Q[0]}`), true);
  await close();
});

test('selection mode blocks every number key, including the sort keys', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  await page.click('#selection-toggle');
  await page.keyboard.press('5');
  assert.deepEqual(await titles(page, 'done'), []);
  assert.match(await status(page), /Finish or cancel the selection/);
  await close();
});

test('Escape in the Move menu closes only the menu', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#search-toggle');
  await page.fill('#note-search', 'needle');
  await page.click('[data-note-id="c"] [data-action="move-menu"]');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.move-menu').count(), 0);
  assert.equal(await page.inputValue('#note-search'), 'needle', 'the search stays');
  assert.equal(await page.isVisible('#note-search'), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'move-menu');
  await close();
});

test('the Move menu closes from its card, and stays closed after editing', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('[data-note-id="a"] [data-action="move-menu"]');
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.move-menu').count(), 0, 'Escape on the card closes it');
  await page.click('[data-note-id="a"] [data-action="move-menu"]');
  await page.click('[data-note-id="b"] [data-action="edit"]');
  await page.keyboard.press('Escape');
  await settle(page);
  assert.equal(await page.locator('.move-menu').count(), 0, 'the menu does not come back after the edit');
  await close();
});

test('Escape closes Help before it ends selection mode', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#selection-toggle');
  await page.keyboard.press('?');
  assert.equal(await page.evaluate(() => document.getElementById('help-dialog').open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('help-dialog').open), false);
  assert.equal(await selecting(page), true, 'still selecting');
  assert.notEqual(await focused(page), 'BODY');
  await page.keyboard.press('Escape');
  assert.equal(await selecting(page), false);
  await close();
});

test('Undo from the bar after a batch move keeps focus on the page', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#selection-toggle');
  await page.check('[data-select-task="a"]');
  await page.check('[data-select-task="b"]');
  await page.click('[data-feature="batch-done"]');
  await page.click('#undo-toast-undo');
  await settle(page); await settle(page);
  assert.deepEqual(await titles(page, Q[0]), ['Alpha', 'Bravo']);
  assert.notEqual(await focused(page), 'BODY');
  await close();
});

test('actions are still announced while a search is active', async () => {
  const { page, close } = await openApp({ board: board() });
  await page.click('#search-toggle');
  await page.fill('#note-search', 'a');
  assert.match(await status(page), /matching tasks/, 'typing a search announces the count');
  await page.click('[data-note-id="a"] [data-action="done"]');
  assert.match(await status(page), /Done/i);
  assert.doesNotMatch(await status(page), /matching/);
  await page.click(`[data-action="add"][data-quadrant="${Q[2]}"]`);
  await page.fill(`#new-${Q[2]}`, 'zzz');
  await page.press(`#new-${Q[2]}`, 'Enter');
  assert.match(await status(page), /^Task added to .+ Search cleared to show it\.$/);
  await close();
});

test('Help stays reachable on a touch screen with single-key shortcuts off', async () => {
  const { page, close } = await openApp({ viewport: { width: 1024, height: 768 }, board: board(), contextOptions: { hasTouch: true, isMobile: true } });
  assert.equal(await page.isHidden('#help-toggle'), true, 'hidden while ? works');
  await page.keyboard.press('?');
  await page.uncheck('#single-key-toggle');
  await page.click('#close-help');
  assert.notEqual(await focused(page), 'BODY');
  assert.equal(await page.isVisible('#help-toggle'), true, 'shown once ? is off');
  assert.equal(await page.getAttribute(`[data-action="add"][data-quadrant="${Q[0]}"]`, 'aria-keyshortcuts'), null);
  assert.equal(await page.getAttribute('#undo-control', 'aria-keyshortcuts'), 'Control+Z Meta+Z', 'modifier shortcuts stay');
  assert.equal(await page.getAttribute('#search-toggle', 'title'), 'Search tasks', 'tooltips stop naming the key');
  await page.click('#help-toggle');
  await page.check('#single-key-toggle');
  assert.equal(await page.getAttribute(`[data-action="add"][data-quadrant="${Q[0]}"]`, 'aria-keyshortcuts'), '1');
  await close();
});

test('an old Redo stops holding repeat copies back after ten minutes', async () => {
  const now = Date.now();
  const source = { ...task('s', 'Water plants', { recurrence: { unit: 'days', every: 1 } }), origin: Q[1], seriesId: 's', repeatIssued: true };
  const copy = { note: { ...task('w', 'Water plants', { recurrence: { unit: 'days', every: 1 } }), seriesId: 's', repeatIssued: false }, sourceId: 's', completedAt: now - 2e8, destination: Q[1], availableAt: now + 60000 };
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Bravo')], done: [source], queue: [copy] }) });
  await page.clock.install({ time: now });
  await page.reload();
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Alt+ArrowDown');
  await page.click('#undo-control');
  await page.clock.runFor(4 * 60000);
  assert.deepEqual(await titles(page, Q[1]), [], 'held while the Undo is recent');
  await page.clock.runFor(8 * 60000);
  assert.deepEqual(await titles(page, Q[1]), ['Water plants']);
  await close();
});

test('the Enter that ends a Safari composition does not add the task', async () => {
  const { page, close } = await openApp();
  await page.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await page.fill(`#new-${Q[0]}`, '日本語');
  await page.evaluate(id => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => 229 });
    document.getElementById(id).dispatchEvent(event);
  }, `new-${Q[0]}`);
  assert.deepEqual(await titles(page, Q[0]), []);
  assert.equal(await page.inputValue(`#new-${Q[0]}`), '日本語');
  assert.equal(await page.getAttribute(`#new-${Q[0]}`, 'enterkeyhint'), 'done');
  await close();
});
