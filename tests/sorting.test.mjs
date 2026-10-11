import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, titles, boardRecord, task, Q, settle } from './helpers.mjs';

after(closeBrowser);
const inbox = () => boardRecord({ inbox: [task('a', 'Call the bank'), task('b', 'Buy stamps'), task('c', 'Old idea'), task('d', 'Water plants')] });

test('number keys place each Inbox task, including Done and Discard', async () => {
  const { page, errors, close } = await openApp({ board: inbox() });
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  for (const key of ['1', '4', '6', '5']) await page.keyboard.press(key);
  assert.deepEqual(await titles(page, Q[0]), ['Call the bank']);
  assert.deepEqual(await titles(page, Q[3]), ['Buy stamps']);
  assert.deepEqual(await titles(page, 'discarded'), ['Old idea']);
  assert.deepEqual(await titles(page, 'done'), ['Water plants']);
  assert.equal(await page.isHidden('#quick-add-urgent-important'), true, 'no add form opened behind the panel');
  assert.equal(await page.textContent('#triage-title'), 'Inbox sorted: 4 tasks placed.');
  assert.equal(await page.isHidden('#triage-choices'), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.feature), 'close-inbox-panel');
  assert.deepEqual(errors, []);
  await close();
});

test('each sorting choice shows its box, its action and its key', async () => {
  const { page, close } = await openApp({ board: inbox() });
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  const choices = await page.$$eval('#triage-choices button', buttons => buttons.map(button => button.textContent));
  assert.deepEqual(choices, ['Urgent + ImportantDo now · 1', 'Urgent + Not ImportantDelegate or batch · 2', 'Not Urgent + ImportantSchedule · 3', 'Not Urgent + Not ImportantDrop · 4', 'DoneAlready done · 5', 'DiscardedNot needed · 6']);
  await close();
});

test('Undo puts a sorted task back into the Inbox', async () => {
  const { page, close } = await openApp({ board: inbox() });
  await page.click('#inbox-toggle');
  await page.click('[data-feature="inbox-sort"]');
  await page.click('#triage-choices [data-triage-to="not-urgent-important"]');
  await page.click('#undo-control');
  await settle(page);
  assert.deepEqual(await titles(page, 'inbox'), ['Call the bank', 'Buy stamps', 'Old idea', 'Water plants']);
  await close();
});
