// Shared helpers for the browser tests. Each test opens index.html straight from disk in Chromium.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// APP_FILE lets the same tests run against another build, for example an older release.
export const APP_URL = pathToFileURL(process.env.APP_FILE ? path.resolve(process.env.APP_FILE) : path.join(root, 'index.html')).href;
export const fixturePath = name => path.join(root, 'tests', 'fixtures', name);
export const readFixture = name => JSON.parse(fs.readFileSync(fixturePath(name), 'utf8'));

export const KEYS = {
  board: 'four-quadrant-task-board-v1',
  preferences: 'four-quadrant-preferences-v2',
  extras: 'priority-matrix-extras-v1',
  history: 'priority-matrix-history-v1',
};
export const Q = ['urgent-important', 'urgent-not-important', 'not-urgent-important', 'not-urgent-not-important'];

let browserPromise;
export function browser() {
  browserPromise ??= chromium.launch();
  return browserPromise;
}
export async function closeBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = undefined;
}

export const task = (id, text, extra = {}) => ({ id, text, steps: [], description: '', labels: [], recurrence: null, ...extra });
export const step = (id, text, done = false) => ({ id, text, done });

// Build a stored board record. Quadrants are given as q1..q4 arrays.
export function boardRecord({ q1 = [], q2 = [], q3 = [], q4 = [], inbox = [], done = [], discarded = [], queue = [], revision = 1 } = {}) {
  return {
    version: 7, revision, updatedAt: Date.now(),
    quadrants: { [Q[0]]: q1, [Q[1]]: q2, [Q[2]]: q3, [Q[3]]: q4 },
    inbox, completed: done, discarded, recurringQueue: queue,
  };
}

// Open the app, optionally seeding storage first. Returns the page plus a live list of page errors.
export async function openApp({ viewport = { width: 1280, height: 900 }, colorScheme = 'light', board, extras, preferences, raw = {}, contextOptions = {}, init, dialogs = 'accept' } = {}) {
  const context = await (await browser()).newContext({ viewport, colorScheme, reducedMotion: 'reduce', acceptDownloads: true, ...contextOptions });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Confirmation prompts are accepted unless a test asks to answer them itself.
  const answer = dialog => (dialogs === 'dismiss' ? dialog.dismiss() : dialog.accept());
  if (dialogs !== 'manual') page.on('dialog', answer);
  await page.goto(APP_URL);
  const seed = { ...raw };
  if (board) seed[KEYS.board] = JSON.stringify(board);
  if (extras) seed[KEYS.extras] = JSON.stringify(extras);
  if (preferences) seed[KEYS.preferences] = JSON.stringify(preferences);
  if (Object.keys(seed).length) {
    // Write the seed, reload, and confirm the reloaded page really sees it; a reload can rarely race a fresh write.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(values => { localStorage.clear(); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, seed);
      await page.waitForTimeout(50 * attempt);
      await page.reload();
      if (await page.evaluate(values => Object.entries(values).every(([key, value]) => localStorage.getItem(key) === value || key === 'priority-matrix-extras-v1'), seed)) break;
    }
  }
  // A second tab shares storage with the first but must not seed it again.
  const openSecondTab = async () => { const tab = await context.newPage(); if (dialogs !== 'manual') tab.on('dialog', answer); await tab.goto(APP_URL); return tab; };
  return { page, context, errors, openSecondTab, close: () => context.close() };
}

export async function addTask(page, quadrant, text) {
  await page.click(`[data-action="add"][data-quadrant="${quadrant}"]`);
  await page.fill(`#new-${quadrant}`, text);
  await page.click(`#quick-add-${quadrant} button[type="submit"]`);
}

// Card titles currently rendered in one section (a quadrant key, 'inbox', 'done' or 'discarded').
export function titles(page, key) {
  return page.evaluate(section => {
    const area = section === 'done' ? document.getElementById('done-notes') : section === 'discarded' ? document.getElementById('discarded-notes') : document.querySelector(`[data-notes="${section}"]`);
    return [...area.querySelectorAll(':scope > .note-card .note-copy')].map(node => node.textContent);
  }, key);
}

export function stored(page, key = KEYS.board) {
  return page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey) || 'null'), key);
}

// Done and Discarded stay collapsed after a move; tests open them explicitly.
export async function openTray(page, which) {
  const toggle = which === 'done' ? '#done-toggle' : '#discarded-toggle';
  if ((await page.getAttribute(toggle, 'aria-expanded')) !== 'true') await page.click(toggle);
}

export function status(page) {
  return page.evaluate(() => document.getElementById('action-status').textContent);
}

// Resolve after the app's queued animation-frame work (card packing, focus) has run.
export function settle(page) {
  return page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
