import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp, closeBrowser } from './helpers.mjs';

after(closeBrowser);

const recentThemes = page => page.evaluate(() => [...document.querySelectorAll('#theme-mood optgroup[label="Recent"] option')].map(option => option.value));

test('every theme picked from the list joins Recent, newest first', async () => {
  const { page, close } = await openApp();
  await page.focus('#theme-mood');
  for (const id of ['graphite', 'stone', 'lagoon']) await page.selectOption('#theme-mood', id);
  await page.keyboard.press('Tab');
  assert.deepEqual(await recentThemes(page), ['lagoon', 'stone', 'graphite']);
  await page.reload();
  assert.deepEqual(await recentThemes(page), ['lagoon', 'stone', 'graphite'], 'kept after a reload');
  await close();
});

test('arrowing through the picker adds only the theme you leave on to Recent', async () => {
  const { page, close } = await openApp();
  await page.focus('#theme-mood');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  const landed = await page.inputValue('#theme-mood');
  await page.keyboard.press('Tab');
  assert.deepEqual(await recentThemes(page), [landed]);
  await close();
});

// The same 880 colour pairs the original audits checked: every built-in theme, light and dark.
test('every built-in theme keeps text and controls at WCAG AA contrast', async () => {
  const { page, close } = await openApp();
  const failures = await page.evaluate(() => {
    const kit = window.BoardThemes, out = [];
    // Computed styles keep oklch(), so paint each colour on a canvas to read its sRGB value.
    const context = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    const hex = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return '#' + [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(n => n.toString(16).padStart(2, '0')).join(''); };
    for (const preset of kit.presets) for (const mode of ['light', 'dark']) {
      const p = Object.fromEntries(Object.entries(kit.paletteFor(preset.id, mode)).map(([key, value]) => [key, hex(value)]));
      const pairs = [...['bg', 'surface', 'note', 'q1', 'q2', 'q3', 'q4'].map(key => ['fg', key]), ...['bg', 'surface', 'note'].map(key => ['muted', key]), ['on-accent', 'accent']];
      for (const [a, b] of pairs) { const ratio = kit.contrast(p[a], p[b]); if (ratio < 4.5) out.push(`${preset.name} ${mode}: ${a} on ${b} ${ratio.toFixed(2)}`); }
    }
    return out;
  });
  assert.deepEqual(failures, []);
  await close();
});

test('Berry keeps "Do now" and "Drop" clearly apart', async () => {
  const { page, close } = await openApp();
  const hues = await page.evaluate(() => window.BoardThemes.presets.find(p => p.id === 'focused').quadrants);
  const gap = Math.min(Math.abs(hues[0] - hues[3]), 360 - Math.abs(hues[0] - hues[3]));
  assert.ok(gap >= 60, `quadrant hues only ${gap}° apart`);
  await close();
});
