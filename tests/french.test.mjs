import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openApp, closeBrowser, addTask, boardRecord, task, step, stored, Q, KEYS, APP_URL } from './helpers.mjs';
import { scriptKeys, markupKeys, frenchTable } from './i18n-source.mjs';

after(closeBrowser);
const French = frenchTable();
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const french = { contextOptions: { locale: 'fr-FR' } };
const rich = () => boardRecord({
  q1: [task('a', 'Déclarer les impôts', { labels: ['papiers'], due: '2030-01-01', steps: [step('s1', 'Réunir les reçus', true), step('s2', 'Envoyer')], description: 'Voir https://example.com' })],
  q2: [task('b', 'Répondre à Sam')], q3: [task('c', 'Planifier l\'année', { recurrence: { unit: 'days', every: 7 } })], q4: [task('d', 'Trier les photos')],
  inbox: [task('e', 'Idée à trier')], done: [{ ...task('f', 'Payer le loyer'), origin: Q[0], completedAt: Date.now() }],
});
// English text that has a different French version must never show on a French page.
const english = Object.entries(French).filter(([key, value]) => !key.includes('{') && key.replace(/^[a-z]+\|/, '') !== value).map(([key]) => key.replace(/^[a-z]+\|/, ''));
const englishOnScreen = page => page.evaluate(list => {
  const keys = new Set(list), found = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('script,style,[lang]:not(html),.note-copy,.task-step,.task-details-copy,.triage-title')) continue;
    if (keys.has(node.nodeValue.trim())) found.add(node.nodeValue.trim());
  }
  for (const element of document.querySelectorAll('[aria-label],[title],[placeholder],optgroup[label],[aria-description]')) {
    if (element.closest('[lang]:not(html)')) continue;
    for (const name of ['aria-label', 'title', 'placeholder', 'label', 'aria-description']) if (keys.has(element.getAttribute(name))) found.add(element.getAttribute(name));
  }
  return [...found];
}, english);
async function openFrench(options = {}) {
  const app = await openApp({ ...french, ...options });
  const warnings = [];
  app.page.on('console', message => { if (message.type() === 'warning' && message.text().startsWith('No French text')) warnings.push(message.text()); });
  return { ...app, warnings };
}

test('every English text in the script and the page has a French version', () => {
  const missing = [...scriptKeys(), ...markupKeys()].filter(key => !Object.hasOwn(French, key));
  assert.deepEqual(missing, []);
});

test('every French entry is used, and keeps the same placeholders', () => {
  const source = fs.readFileSync(fileURLToPath(APP_URL), 'utf8');
  const start = source.indexOf('window.PriorityMatrixFrench = '), end = source.indexOf('</script>', start);
  const code = source.slice(0, start) + source.slice(end);
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = key => code.includes(`'${key.replace(/'/g, '\\\'')}'`) || code.includes(`"${key}"`) || new RegExp(`>\\s*${escape(key)}\\s*<`).test(code);
  assert.deepEqual(Object.keys(French).filter(key => !quoted(key)), [], 'unused entries');
  const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');
  assert.deepEqual(Object.entries(French).filter(([key, value]) => names(key) !== names(value)).map(([key]) => key), [], 'placeholders differ');
});

test('a French browser opens the app in French, with nothing left in English', async () => {
  const { page, warnings, close } = await openFrench({ board: rich() });
  assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  assert.equal(await page.textContent('#heading-urgent-not-important'), 'Urgent + Pas important');
  assert.equal(await page.textContent('#done-toggle'), 'Afficher les terminées');
  assert.equal(await page.getAttribute('#language-toggle', 'aria-label'), 'EN English');
  assert.equal(await page.textContent('#language-toggle'), 'EN');
  assert.equal(await page.textContent(`#quadrant-${Q[0]} [data-count]`), '1 tâche');
  assert.match(await page.textContent('[data-note-id="a"] .due-text'), /^Pour le /);
  // Walk through the main screens so every message they build is checked.
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  await page.click('[data-feature="inbox-paste"]');
  await page.fill('#bulk-input', 'Un\nDeux');
  await page.click('[data-feature="bulk-preview"]');
  assert.match(await page.textContent('#bulk-feedback'), /^2 tâches prêtes à relire/);
  await page.click('[data-feature="bulk-clear"]');
  await page.click('[data-note-id="a"] [data-action="edit"]');
  await page.click('.inline-edit details.form-options > summary');
  assert.deepEqual(await englishOnScreen(page), [], 'inline editor');
  await page.click('.inline-edit [data-action="cancel-edit"]');
  await page.click('[data-note-id="b"] [data-action="move-menu"]');
  assert.deepEqual(await englishOnScreen(page), [], 'move menu');
  await page.keyboard.press('Escape');
  await page.click('#search-toggle');
  await page.fill('#note-search', 'a');
  await page.click('#done-toggle');
  await page.click('#discarded-toggle');
  assert.deepEqual(await englishOnScreen(page), [], 'search and trays');
  await page.click('#selection-toggle');
  assert.match(await page.textContent('#selection-count'), /^0 sélectionnée$/);
  assert.deepEqual(await englishOnScreen(page), [], 'selection');
  await page.click('[data-feature="exit-selection"]');
  await page.click('#library-toggle');
  await page.click('#manage-themes');
  assert.deepEqual(await englishOnScreen(page), [], 'theme dialog');
  assert.equal(await page.textContent('#custom-preview-mode'), 'Apparence claire');
  await page.click('#cancel-custom');
  await page.click('#help-toggle');
  assert.equal(await page.textContent('#help-title'), 'Raccourcis clavier');
  assert.deepEqual(await englishOnScreen(page), [], 'help');
  assert.deepEqual(warnings, []);
  await close();
});

test('French messages follow French grammar for counts and dates', async () => {
  const { page, warnings, close } = await openFrench();
  await addTask(page, Q[0], 'Première');
  assert.equal(await page.textContent(`#quadrant-${Q[0]} [data-count]`), '1 tâche');
  assert.match(await page.textContent('#action-status'), /^Tâche ajoutée à Urgent \+ Important, position 1\.$/);
  await addTask(page, Q[0], 'Deuxième');
  assert.equal(await page.textContent(`#quadrant-${Q[0]} [data-count]`), '2 tâches');
  const titles = await page.$$eval('#theme-mood option', options => options.map(option => option.textContent));
  assert.ok(titles.includes('Baie') && titles.includes('Néon prisme'), 'built-in themes have French names');
  assert.deepEqual(warnings, []);
  await close();
});

test('the language button switches to English and back, and the choice is kept', async () => {
  const { page, close } = await openApp({ board: boardRecord({ q1: [task('a', 'Alpha')] }) });
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.getAttribute('#language-toggle', 'lang'), 'fr');
  await Promise.all([page.waitForEvent('load'), page.click('#language-toggle')]);
  assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  assert.equal(await page.textContent('#heading-not-urgent-not-important'), 'Pas urgent + Pas important');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'language-toggle', 'focus comes back to the button');
  assert.equal(await page.textContent('#action-status'), 'Langue : français');
  assert.equal((await stored(page, KEYS.preferences)).language, 'fr');
  assert.deepEqual((await stored(page)).quadrants[Q[0]].map(note => note.text), ['Alpha'], 'the board is untouched');
  await page.reload();
  assert.equal(await page.getAttribute('html', 'lang'), 'fr', 'kept after a reload');
  await Promise.all([page.waitForEvent('load'), page.click('#language-toggle')]);
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.textContent('#action-status'), 'Language: English');
  await close();
});

test('a saved choice wins over the browser language', async () => {
  const { page, close } = await openApp({ ...french, preferences: { version: 2, revision: 1, mood: 'focused', appearance: 'light', density: 'comfortable', customThemes: [], favorites: [], recent: [], language: 'en' } });
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.textContent('#done-toggle'), 'Show completed');
  await close();
});

test('the language does not change while something is half-done', async () => {
  const { page, close } = await openApp();
  await page.click(`[data-action="add"][data-quadrant="${Q[0]}"]`);
  await page.fill(`#new-${Q[0]}`, 'Not finished');
  await page.click('#language-toggle');
  assert.match(await page.textContent('#action-status'), /^Finish or cancel what you are doing, then change the language\.$/);
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal(await page.inputValue(`#new-${Q[0]}`), 'Not finished');
  await close();
});

test('axe finds no WCAG A/AA violations on the French page', async () => {
  const { page, close } = await openFrench({ board: rich() });
  await page.click('#inbox-toggle');
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`));
  assert.deepEqual(violations, []);
  await close();
});
