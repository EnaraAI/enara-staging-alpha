#!/usr/bin/env node
// Copies the lms-test kids app (frontend/kids/*) and every file it imports, transitively, into
// design-app/src/lms/ with the same relative layout, so the copied imports work unchanged.
// Also copies frontend/public/kids -> design-app/public/kids (the word pictures).
//
//   node scripts/sync-lms-kids.mjs          copy (and delete copied files that are no longer imported)
//   node scripts/sync-lms-kids.mjs --check  exit 1 if any copied file differs from its source
//
// The copies must stay byte-identical to frontend/, which must match lms-test-live: when the git ref origin/lms-test-live
// is present (git fetch origin lms-test-live), --check also fails if a source file in frontend/ differs from it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const SRC = resolve(APP, '..', 'frontend');
const DEST = join(APP, 'src', 'lms');
const PUB_SRC = join(SRC, 'public', 'kids');
const PUB_DEST = join(APP, 'public', 'kids');
const check = process.argv.includes('--check');

// Entry points: the kids app itself, plus the error boundary and toast host the old index.tsx mounts around every app.
const ROOTS = [...readdirSync(join(SRC, 'kids')).map((f) => join('kids', f)), 'components/ErrorBoundary.tsx', 'components/ToastContainer.tsx'];

const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
const CODE = /\.(m?[jt]sx?)$/;
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;

function resolveImport(fromRel, spec) {
  const base = join(dirname(fromRel), spec.replace(/\?.*$/, ''));
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(join(SRC, p)) && statSync(join(SRC, p)).isFile()) return p;
  }
  return null;
}

// Transitive closure of relative imports (type-only imports included; a .js with a sibling .d.ts brings both).
const files = new Set();
const queue = [...ROOTS];
const missing = [];
while (queue.length) {
  const rel = queue.shift();
  if (files.has(rel)) continue;
  files.add(rel);
  const dts = rel.replace(/\.m?jsx?$/, '.d.ts');
  if (dts !== rel && existsSync(join(SRC, dts))) queue.push(dts);
  if (!CODE.test(rel)) continue;
  const text = readFileSync(join(SRC, rel), 'utf8');
  for (const m of text.matchAll(SPEC)) {
    const hit = resolveImport(rel, m[2]);
    if (hit) queue.push(hit);
    else missing.push(`${rel}: ${m[2]}`);
  }
}
if (missing.length) { console.error('Unresolved relative imports:\n  ' + missing.join('\n  ')); process.exit(2); }

const expected = (rel) => readFileSync(join(SRC, rel));

function walk(dir, out = [], root = dir) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, root); else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

const pairs = [...files].sort().map((rel) => ({ src: expected(rel), dest: join(DEST, rel), rel: `src/lms/${rel}` }));
for (const rel of walk(PUB_SRC)) pairs.push({ src: readFileSync(join(PUB_SRC, rel)), dest: join(PUB_DEST, rel), rel: `public/kids/${rel}` });
const keep = new Set(pairs.map((p) => resolve(p.dest)));
const extra = [...walk(DEST).map((r) => join(DEST, r)), ...walk(PUB_DEST).map((r) => join(PUB_DEST, r))].filter((p) => !keep.has(resolve(p)));

const sha = (b) => createHash('sha256').update(b).digest('hex');
let drift = 0;
for (const p of pairs) {
  const same = existsSync(p.dest) && sha(readFileSync(p.dest)) === sha(p.src);
  if (same) continue;
  if (check) { drift++; console.error(`differs: ${p.rel}`); continue; }
  mkdirSync(dirname(p.dest), { recursive: true });
  writeFileSync(p.dest, p.src);
}
for (const p of extra) {
  if (check) { drift++; console.error(`not in source: ${relative(APP, p)}`); continue; }
  rmSync(p);
}

// frontend/ against lms-test-live (skipped when the ref is not fetched, e.g. a shallow CI checkout).
const LIVE = 'origin/lms-test-live';
const git = (...a) => execFileSync('git', a, { cwd: SRC, stdio: ['ignore', 'pipe', 'ignore'] });
let live = 'not checked (no ' + LIVE + ')';
try {
  git('rev-parse', '--verify', '-q', LIVE);
  const paths = [...[...files].map((f) => `frontend/${f}`), 'frontend/public/kids'];
  const out = git('diff', '--name-only', LIVE, '--', ...paths).toString().trim();
  live = out ? `${out.split('\n').length} differ from ${LIVE}` : `same as ${LIVE}`;
  if (out) { console.error(`frontend/ differs from ${LIVE} (copy them from there first):\n  ` + out.split('\n').join('\n  ')); if (check) drift++; }
} catch { /* ref not available */ }

const code = pairs.filter((p) => p.rel.startsWith('src/'));
const lines = code.reduce((n, p) => n + p.src.toString('utf8').split('\n').length - 1, 0);
console.log(`${check ? 'checked' : 'synced'}: ${code.length} source files (${lines} lines), ${pairs.length - code.length} public/kids files${check ? `, ${drift} differences` : ''}; sources ${live}`);
process.exit(check && drift ? 1 : 0);
