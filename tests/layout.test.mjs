import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser, boardRecord, task, step, settle } from './helpers.mjs';

after(closeBrowser);

const busy = () => boardRecord({
  q1: [task('a', 'Submit the quarterly tax return before Friday', { labels: ['finance'], steps: [step('s1', 'Collect receipts', true), step('s2', 'File online')] })],
  q2: [task('b', 'A very long task title that keeps going with https://example.com/a/really/long/path/that/should/wrap/without/overflowing/the/card')],
  q3: Array.from({ length: 8 }, (_, i) => task(`c${i}`, `Plan item ${i}`, { description: 'Notes', recurrence: { unit: 'days', every: 7 } })),
  q4: [task('d', 'Sort photos')],
  inbox: [task('e', 'Unsorted')],
});

for (const [width, height] of [[320, 640], [390, 844], [820, 1180], [1440, 900]]) {
  test(`no horizontal overflow at ${width}px, light and dark`, async () => {
    for (const colorScheme of ['light', 'dark']) {
      const { page, errors, close } = await openApp({ viewport: { width, height }, colorScheme, board: busy() });
      await page.click('#inbox-toggle');
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${colorScheme} overflow`);
      assert.deepEqual(errors, []);
      await close();
    }
  });
}

test('every visible control is at least 44 by 44 pixels', async () => {
  const { page, close } = await openApp({ viewport: { width: 390, height: 844 }, board: busy() });
  await settle(page);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, select, input:not([type="checkbox"]), summary')]
    .filter(el => el.offsetParent !== null && !el.closest('[hidden]'))
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && (box.width < 44 || box.height < 44))
    .map(({ el, box }) => `${el.tagName}.${el.className} ${Math.round(box.width)}x${Math.round(box.height)}`));
  assert.deepEqual(small, []);
  await close();
});

test('a 500-task board stays responsive', async () => {
  const many = Array.from({ length: 500 }, (_, i) => task(`t${i}`, `Task number ${i} with a title long enough to wrap`, { steps: [step(`s${i}`, 'step')], description: 'Notes '.repeat(40), labels: ['work'] }));
  const record = boardRecord({ q1: many.slice(0, 125), q2: many.slice(125, 250), q3: many.slice(250, 375), q4: many.slice(375) });
  const { page, close } = await openApp({ viewport: { width: 1440, height: 900 }, board: record });
  await settle(page);
  await page.click('#search-toggle');
  const started = Date.now();
  for (const character of 'number 4') { await page.keyboard.type(character); await settle(page); }
  const perKey = (Date.now() - started) / 8;
  assert.ok(perKey < 400, `search took ${Math.round(perKey)} ms per keystroke`);
  await close();
});
