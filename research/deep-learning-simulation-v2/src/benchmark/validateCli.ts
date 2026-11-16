import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { validateBenchmark } from './validate';
import type { Outcome } from './schema';

// Usage: tsx validateCli.ts <file-or-dir> [--partial]
const target = process.argv[2];
const partial = process.argv.includes('--partial');
if (!target) { console.error('usage: validateCli.ts <outcomes.json | dir> [--partial]'); process.exit(2); }
const files = statSync(target).isDirectory() ? readdirSync(target).filter((f) => f.endsWith('.json')).map((f) => path.join(target, f)) : [target];
const outcomes: Outcome[] = [];
for (const f of files) { const j = JSON.parse(readFileSync(f, 'utf8')); outcomes.push(...(Array.isArray(j) ? j : j.outcomes)); }
const errors = validateBenchmark(outcomes, { partial });
console.log(`${outcomes.length} outcomes in ${files.length} file(s); ${errors.length} error(s)`);
for (const e of errors) console.log(' -', e);
process.exit(errors.length ? 1 : 0);
