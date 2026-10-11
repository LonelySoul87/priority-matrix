import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, stored, boardRecord, task, Q, KEYS, openTray } from './helpers.mjs';

after(closeBrowser);
const weekly = { unit: 'days', every: 7 };

test('completing a repeating task prepares one waiting copy', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q3: [task('r', 'Weekly review', { recurrence: weekly })] }) });
  await page.click('[data-note-id="r"] [data-action="done"]');
  const extras = await stored(page, KEYS.extras);
  assert.equal(extras.scheduled.length, 1);
  assert.equal(extras.scheduled[0].destination, Q[2]);
  await close();
});

test('canceling the next copy lets the task repeat again later', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('r', 'Weekly review', { recurrence: weekly })] }) });
  await page.click('[data-note-id="r"] [data-action="done"]');
  await openTray(page, 'done');
  await page.click('[data-feature="cancel-repeat"]');
  await page.click('[data-note-id="r"] [data-action="restore"]');
  await page.click('[data-note-id="r"] [data-action="done"]');
  assert.equal((await stored(page, KEYS.extras)).scheduled.length, 1);
  await close();
});

test('a due waiting copy is released into its original box', async () => {
  const past = Date.now() - 1000;
  const source = { ...task('s', 'Daily', { recurrence: { unit: 'days', every: 1 } }), origin: Q[1], seriesId: 's', repeatIssued: true };
  const copy = { note: { ...task('c', 'Daily', { recurrence: { unit: 'days', every: 1 } }), seriesId: 's', repeatIssued: false }, sourceId: 's', completedAt: past - 86400000, destination: Q[1], availableAt: past };
  const { page, close } = await openApp({ board: boardRecord({ done: [source], queue: [copy] }) });
  assert.deepEqual(await titles(page, Q[1]), ['Daily']);
  assert.equal((await stored(page, KEYS.extras)).scheduled.length, 0);
  await close();
});

test('monthly repeats clamp to the end of shorter months', async () => {
  const { page, close } = await openApp();
  // Completing on 31 January must schedule the copy for the last day of February.
  await page.clock?.install?.({ time: new Date(2027, 0, 31, 10, 0) });
  await page.reload();
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.board, JSON.stringify(boardRecord({ q1: [task('m', 'Rent', { recurrence: { unit: 'months', every: 1 } })] }))]);
  await page.reload();
  await page.click('[data-note-id="m"] [data-action="done"]');
  const [item] = (await stored(page, KEYS.extras)).scheduled;
  const date = new Date(item.availableAt);
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2027, 1, 28]);
  await close();
});
