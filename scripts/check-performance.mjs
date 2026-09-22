import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve('dist');
const reportOnly = process.argv.includes('--report');
// Include static transitive imports, but not engines requested later with import().
function collect(file, visited) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  for (const node of source.statements) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const path = node.moduleSpecifier.text;
    if (path.startsWith('.')) collect(resolve(dirname(file), path), visited);
    else if (path.startsWith('/')) collect(resolve(root, path.slice(1)), visited);
  }
}

const budgets = {
  'index.html': 12,
  'explore/index.html': 16,
  'news/index.html': 18,
  'markets/index.html': 18,
  'launchpad/index.html': 12,
  'tools/json/index.html': 25,
  'tools/diff/index.html': 12,
  'visuals/index.html': 45,
};
for (const [route, kib] of Object.entries(budgets)) {
  const html = readFileSync(resolve(root, route), 'utf8');
  const modules = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="(\/_astro\/[^\"]+\.js)"/g)) collect(resolve(root, match[1].slice(1)), modules);
  const bytes = [...modules].reduce((sum, file) => sum + statSync(file).size, 0);
  const compressed = [...modules].reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
  if (!reportOnly) {
    assert.ok(modules.size > 0, `${route}: no entry modules found; check script discovery`);
    assert.ok(bytes <= kib * 1024, `${route}: eager JS ${(bytes / 1024).toFixed(1)} KiB exceeds ${kib} KiB budget`);
  }
  console.log(`${route}: ${(bytes / 1024).toFixed(1)} KiB eager JS / ${(compressed / 1024).toFixed(1)} KiB gzip estimate (${modules.size} modules)`);
}
