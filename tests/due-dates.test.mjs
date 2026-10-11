import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, stored, boardRecord, task, Q, KEYS, settle, openTray } from './helpers.mjs';

after(closeBrowser);

const day = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); };
const dueText = (page, id) => page.textContent(`[data-note-id="${id}"] .due-line .due-text`);

test('a due date set in the add form is saved and shown on the card', async () => {
  const { page, errors, close } = await openApp();
  await page.click('[data-action="add"][data-quadrant="not-urgent-important"]');
  await page.fill('#new-not-urgent-important', 'Book flights');
  await page.fill('#quick-add-not-urgent-important .task-due', day(1));
  await page.click('#quick-add-not-urgent-important button[type="submit"]');
  const [saved] = (await stored(page)).quadrants[Q[2]];
  assert.equal(saved.due, day(1));
  assert.ok(saved.createdAt > Date.now() - 60000);
  assert.equal(await dueText(page, saved.id), 'Due tomorrow');
  assert.deepEqual(errors, []);
  await close();
});

test('cards describe overdue, today and later due dates', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Late', { due: day(-2) }), task('b', 'Now', { due: day(0) }), task('c', 'Later', { due: day(20) }), task('d', 'Undated')] }) });
  assert.match(await dueText(page, 'a'), /^Overdue · /);
  assert.equal(await dueText(page, 'b'), 'Due today');
  assert.match(await dueText(page, 'c'), /^Due /);
  assert.equal(await page.locator('[data-note-id="d"] .due-line').count(), 0);
  assert.equal(await page.getAttribute('[data-note-id="a"] .due-line', 'data-due-state'), 'overdue');
  assert.match(await page.textContent('#quadrant-urgent-important [data-count]'), /4 tasks · 1 overdue · 1 due today/);
  await close();
});

test('a not-urgent task due soon offers to move to Urgent, and Undo reverses it', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q3: [task('a', 'Report', { due: day(1) }), task('far', 'Far off', { due: day(30) })], q4: [task('b', 'Errand', { due: day(0) })], q1: [task('c', 'Already urgent', { due: day(0) })] }) });
  assert.equal(await page.locator('[data-note-id="far"] .due-promote').count(), 0);
  assert.equal(await page.locator('[data-note-id="c"] .due-promote').count(), 0);
  await page.click('[data-note-id="a"] .due-promote');
  assert.deepEqual(await titles(page, Q[0]), ['Already urgent', 'Report']);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.noteId), 'far', 'focus stays with the next card in place');
  assert.match(await page.textContent('#undo-toast'), /Moved to Urgent \+ Important: Report/);
  await page.click('[data-note-id="b"] .due-promote');
  assert.deepEqual(await titles(page, Q[1]), ['Errand']);
  await page.click('#undo-control');
  await page.click('#undo-control');
  assert.deepEqual(await titles(page, Q[2]), ['Report', 'Far off']);
  await close();
});

test('editing can change and clear a due date', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Task', { due: day(3) })] }) });
  await page.click('[data-note-id="a"] [data-action="edit"]');
  assert.equal(await page.inputValue('.inline-edit .task-due'), day(3));
  await page.fill('.inline-edit .task-due', day(5));
  await page.click('.inline-edit button[type="submit"]');
  assert.equal((await stored(page)).quadrants[Q[0]][0].due, day(5));
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.fill('.inline-edit .task-due', '');
  await page.click('.inline-edit button[type="submit"]');
  assert.equal((await stored(page)).quadrants[Q[0]][0].due, null);
  assert.equal(await page.locator('[data-note-id="a"] .due-line').count(), 0);
  await close();
});

test('completing records the date, restoring clears it, and Done counts this week', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha'), task('b', 'Beta')] }) });
  await page.click('[data-note-id="a"] [data-action="done"]');
  await page.click('[data-note-id="b"] [data-action="done"]');
  const done = (await stored(page)).completed;
  assert.ok(done.every(note => note.completedAt > Date.now() - 60000));
  assert.match(await page.textContent('#done-count'), /2 tasks · 2 in the last 7 days/);
  assert.match(await page.textContent('[data-note-id="a"] .completed-line'), /^Completed /);
  await openTray(page, 'done');
  await page.click('[data-note-id="a"] [data-action="restore"]');
  assert.equal((await stored(page)).quadrants[Q[0]].find(note => note.id === 'a').completedAt, undefined);
  await close();
});

test('a repeating task moves its due date forward on the next copy', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('w', 'Weekly report', { due: day(0), recurrence: { unit: 'days', every: 7 } })] }) });
  await page.click('[data-note-id="w"] [data-action="done"]');
  const [copy] = (await stored(page, KEYS.extras)).scheduled;
  assert.equal(copy.note.due, day(7));
  assert.equal(copy.note.createdAt, undefined);
  assert.equal(copy.note.completedAt, undefined);
  await close();
});

test('a copy completed very late is not born overdue', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('w', 'Weekly', { due: day(-20), recurrence: { unit: 'days', every: 7 } })] }) });
  await page.click('[data-note-id="w"] [data-action="done"]');
  const [copy] = (await stored(page, KEYS.extras)).scheduled;
  assert.equal(copy.note.due, day(8));
  await close();
});

test('templates never keep a calendar date', async () => {
  const { page, close } = await openApp();
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'Template task');
  await page.fill('#quick-add-urgent-important .task-due', day(4));
  await page.click('#quick-add-urgent-important details.form-options > summary');
  await page.click('#quick-add-urgent-important [data-feature="save-template"]');
  assert.equal((await stored(page, KEYS.extras)).templates[0].due, null);
  await close();
});

test('an unfinished due date is part of a recovered draft', async () => {
  const { page, close } = await openApp();
  await page.click('[data-action="add"][data-quadrant="urgent-important"]');
  await page.fill('#new-urgent-important', 'Half done');
  await page.fill('#quick-add-urgent-important .task-due', day(2));
  await page.reload();
  await page.click('[data-feature="resume-draft"]');
  assert.equal(await page.inputValue('#quick-add-urgent-important .task-due'), day(2));
  await close();
});

test('invalid stored due dates are rejected, older boards without them still load', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Bad', { due: '2026-02-30' })] }) });
  assert.match(await page.textContent('#save-state'), /could not be read/i);
  await close();
  const { page: second, errors, close: closeSecond } = await openApp({ board: boardRecord({ q1: [{ id: 'old', text: 'Old task', steps: [] }] }) });
  assert.deepEqual(await titles(second, Q[0]), ['Old task']);
  assert.deepEqual(errors, []);
  await closeSecond();
});

test('due labels refresh after midnight without a reload', async () => {
  const { page, close } = await openApp();
  await page.clock.install({ time: new Date(2027, 2, 10, 23, 58) });
  await page.reload();
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEYS.board, JSON.stringify(boardRecord({ q1: [task('a', 'Tomorrow', { due: '2027-03-11' })] }))]);
  await page.reload();
  assert.equal(await dueText(page, 'a'), 'Due tomorrow');
  await page.clock.runFor(3 * 60 * 1000);
  await settle(page);
  assert.equal(await dueText(page, 'a'), 'Due today');
  await close();
});
