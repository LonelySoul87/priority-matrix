import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// House style: no em dash or en dash anywhere in the project. Use commas, colons, full stops, parentheses or "to".
test('no file in the project contains an em dash or an en dash', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const found = [];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    if (bytes.includes(0)) continue; // images and other binary files
    bytes.toString('utf8').split('\n').forEach((line, index) => {
      if (/[\u2013\u2014]/.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(found, []);
});
