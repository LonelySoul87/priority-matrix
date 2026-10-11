// Reads the English keys and the French table straight from index.html, so the tests check the file people download.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { APP_URL } from './helpers.mjs';

const source = () => fs.readFileSync(fileURLToPath(APP_URL), 'utf8');
const unquote = literal => vm.runInNewContext(literal.startsWith('`') ? literal : `(${literal})`);
const literals = text => [...text.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`/g)].map(match => unquote(match[0]));

// The text of one call argument list, up to the bracket that closes it.
function callArguments(text, open) {
  let depth = 0, quote = '';
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    else if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') { depth--; if (depth === 0) return text.slice(open + 1, index); }
  }
  return '';
}
// Split an argument list at its top-level commas.
function splitArguments(text) {
  const parts = []; let depth = 0, quote = '', start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '\'' || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

// Every English key the script passes to t() or tn() as written text, including both sides of a ternary.
export function scriptKeys() {
  const text = source();
  const keys = new Set();
  for (const match of text.matchAll(/(?<![\w$.])(t|tn)\(/g)) {
    const parts = splitArguments(callArguments(text, match.index + match[0].length - 1));
    const used = match[1] === 't' ? parts.slice(0, 1) : parts.slice(1, 3);
    // Literals that are compared or passed to a selector method are not text on screen.
    for (const part of used) for (const literal of literals(part.replace(/(?:[!=]==?\s*|\.matches\()(?:'[^']*'|"[^"]*")/g, ''))) if (/[A-Za-z]/.test(literal)) keys.add(literal);
  }
  return keys;
}

// Fixed text in the page markup that the French page swaps at load.
export function markupKeys() {
  const text = source();
  const body = text.slice(text.indexOf('<body>'), text.indexOf('<script>', text.indexOf('<body>')));
  const markup = body.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<button[^>]*id="language-toggle"[\s\S]*?<\/button>/, '');
  const keys = new Set();
  for (const match of markup.matchAll(/>([^<>]+)</g)) { const value = match[1].trim(); if (/[A-Za-z]{2}/.test(value)) keys.add(value); }
  for (const match of markup.matchAll(/\s(?:aria-label|title|placeholder|label)="([^"]+)"/g)) if (/[A-Za-z]{2}/.test(match[1])) keys.add(match[1]);
  return keys;
}

export function frenchTable() {
  const text = source();
  const start = text.indexOf('window.PriorityMatrixFrench = ');
  const end = text.indexOf('</script>', start);
  const sandbox = { window: {} };
  vm.runInNewContext(text.slice(start, end), sandbox);
  return sandbox.window.PriorityMatrixFrench;
}
