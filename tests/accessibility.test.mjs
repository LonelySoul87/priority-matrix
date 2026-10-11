import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openApp, closeBrowser, addTask, boardRecord, task, step, Q, status, settle } from './helpers.mjs';

after(closeBrowser);
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const focused = page => page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, card: document.activeElement?.closest?.('.note-card')?.dataset.noteId }));
const rich = () => boardRecord({
  q1: [task('a', 'File the tax return', { labels: ['finance'], due: '2030-01-01', steps: [step('s1', 'Collect receipts', true), step('s2', 'Submit')], description: 'See https://example.com' })],
  q2: [task('b', 'Reply to Sam')], q3: [task('c', 'Plan the year', { recurrence: { unit: 'days', every: 7 } })], q4: [task('d', 'Sort photos')],
  inbox: [task('e', 'Unsorted idea')],
});

async function axe(page) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`));
  return result;
}

for (const colorScheme of ['light', 'dark']) {
  test(`axe finds no WCAG A/AA violations in the main states (${colorScheme})`, async () => {
    const { page, close } = await openApp({ colorScheme, board: rich() });
    await page.click('#inbox-toggle');
    assert.deepEqual(await axe(page), [], 'populated board with Inbox');
    await page.click('[data-note-id="a"] [data-action="edit"]');
    assert.deepEqual(await axe(page), [], 'inline editor');
    await page.click('.inline-edit [data-action="cancel-edit"]');
    await page.click('[data-note-id="b"] [data-action="move-menu"]');
    assert.deepEqual(await axe(page), [], 'move menu');
    await page.keyboard.press('Escape');
    await page.click('#search-toggle');
    await page.fill('#note-search', 'a');
    assert.deepEqual(await axe(page), [], 'search');
    await page.click('#manage-themes');
    assert.deepEqual(await axe(page), [], 'theme dialog');
    await close();
  });
}

test('arrow keys on the theme picker reach every theme without opening a dialog', async () => {
  const { page, close } = await openApp();
  await page.focus('#theme-mood');
  const seen = new Set();
  for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowDown'); seen.add(await page.inputValue('#theme-mood')); }
  assert.ok(seen.size >= 10, `visited ${seen.size} themes`);
  assert.equal(await page.evaluate(() => document.getElementById('custom-dialog').open), false);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#theme-mood optgroup')].some(g => g.label === 'Recent')), true);
  await close();
});

test('Manage themes has its own button and returns focus when canceled', async () => {
  const { page, close } = await openApp();
  await page.click('#manage-themes');
  assert.equal(await page.evaluate(() => document.getElementById('custom-dialog').open), true);
  await page.click('#cancel-custom');
  assert.equal((await focused(page)).id, 'manage-themes');
  await close();
});

test('focus never falls to the page after Undo removes the focused task', async () => {
  const { page, close } = await openApp();
  await addTask(page, Q[0], 'New task');
  assert.equal((await focused(page)).id, 'new-urgent-important', 'the form stays open for the next task');
  await page.keyboard.press('Escape');
  await settle(page);
  await page.keyboard.press('Control+z');
  await settle(page); await settle(page);
  assert.notEqual((await focused(page)).tag, 'BODY');
  assert.match(await status(page), /Undid: Added 1 task: New task/);
  await close();
});

test('cards are named by their task, and buttons say which task they act on', async () => {
  const { page, close } = await openApp({ board: rich() });
  const names = await page.evaluate(() => {
    const card = document.querySelector('[data-note-id="b"]');
    return { labelledby: document.getElementById(card.getAttribute('aria-labelledby'))?.textContent, edit: card.querySelector('[data-action="edit"]').getAttribute('aria-label'), done: card.querySelector('[data-action="done"]').getAttribute('aria-label') };
  });
  assert.deepEqual(names, { labelledby: 'Reply to Sam', edit: 'Edit: Reply to Sam', done: 'Mark done: Reply to Sam' });
  await close();
});

test('edge moves are announced', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Only')] }) });
  await page.focus('[data-note-id="a"]');
  await page.keyboard.press('Alt+ArrowUp');
  assert.match(await status(page), /Already first in Urgent \+ Important/);
  await page.keyboard.press('Alt+1');
  assert.match(await status(page), /Already in Urgent \+ Important/);
  await close();
});

test('a skip link jumps to the tasks', async () => {
  const { page, close } = await openApp();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'content');
  await close();
});

test('placeholders use the readable secondary text colour', async () => {
  const { page, close } = await openApp();
  const [placeholder, muted] = await page.evaluate(() => {
    const probe = document.createElement('span'); probe.style.color = 'var(--muted)'; document.body.append(probe);
    return [getComputedStyle(document.getElementById('note-search'), '::placeholder').color, getComputedStyle(probe).color];
  });
  assert.equal(placeholder, muted);
  await close();
});

test('focused controls stay clear of the sticky header', async () => {
  const { page, close } = await openApp({ viewport: { width: 1280, height: 720 }, board: rich() });
  const padding = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
  const header = await page.evaluate(() => document.querySelector('.topnav').getBoundingClientRect().height);
  assert.ok(padding >= header, `scroll padding ${padding} vs header ${header}`);
  await close();
});
