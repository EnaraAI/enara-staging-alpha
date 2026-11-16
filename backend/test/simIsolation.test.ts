import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Ground rule (ESL5): the tutor may use only what a real tutor sees (learner messages, lesson data, ENARA's own stored learner record).
// No backend source file may import simulator/research code or reference the simulator's modules or its belief ids as keys.
const SRC = join(__dirname, '..', 'src');
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|js|mjs|cjs|json)$/.test(f) ? [p] : []; });
const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
const SIM_MODULES = /\b(learnerSim|eslFixtures|LEARNING_RULES)\b/;
const BELIEF_KEY = /['"](W1|W2|C1|C2)['"]\s*:|\[\s*['"](W1|W2|C1|C2)['"]\s*\]|\.\s*(W1|W2)\b/;

describe('simulator isolation', () => {
  const all = files(SRC);
  it('scans the backend sources', () => { expect(all.length).toBeGreaterThan(20); });
  it('no backend source imports from research/ or a simulator module', () => {
    const bad: string[] = [];
    for (const f of all) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(IMPORT)) if (/(^|\/)research(\/|$)|simulat|learnerSim|eslFixtures/i.test(m[1])) bad.push(`${relative(SRC, f)}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it('no backend source references learnerSim, eslFixtures, LEARNING_RULES or simulator belief ids as keys', () => {
    const bad: string[] = [];
    for (const f of all) {
      const t = readFileSync(f, 'utf8');
      if (SIM_MODULES.test(t)) bad.push(`${relative(SRC, f)}: simulator module name`);
      if (BELIEF_KEY.test(t)) bad.push(`${relative(SRC, f)}: simulator belief id used as a key`);
    }
    expect(bad).toEqual([]);
  });
  it('the checks catch what they are meant to catch', () => {
    expect([...`import { x } from '../../research/deep-learning-simulation-v2/sim';`.matchAll(IMPORT)][0][1]).toMatch(/research/);
    expect(SIM_MODULES.test('const r = LEARNING_RULES.R1;')).toBe(true);
    expect(BELIEF_KEY.test("const b = { 'W1': 3 };")).toBe(true);
    expect(BELIEF_KEY.test("state['C2']")).toBe(true);
    // CEFR levels written as words or in a regex are not belief ids
    expect(BELIEF_KEY.test("const L = ['A1', 'B2', 'C1', 'C2'];")).toBe(false);
    expect(BELIEF_KEY.test("const CEFR = /\\b(a1|b2|c1|c2)\\b/i; level: 'C1 advanced'")).toBe(false);
  });
});
