import { describe, expect, it } from 'vitest';
import { runTests, canonical } from '../../src/assessment/grading-engine/graders/code/sandbox';
import { gradeCode } from '../../src/assessment/grading-engine/graders/code';
import { checkEngineQuestion, forLearner, describeKey } from '../../src/assessment/questionBridge';

// The real QuickJS sandbox (no mocks): learners' code must never reach the host, never hang the server, and be graded by its tests.
const add = [
  { name: 'adds two numbers', call: 'add(2, 3)', expected: 5 },
  { name: 'adds negatives', call: 'add(-1, -1)', expected: -2 },
  { name: 'returns an array', call: 'pair(1, 2)', expected: [1, 2] },
];

describe('code sandbox', () => {
  it('runs the tests and compares JSON values (object key order ignored)', async () => {
    const r = await runTests('function add(a, b) { return a + b }\nfunction pair(a, b) { return [a, b] }', add);
    expect(r.map((x) => x.passed)).toEqual([true, true, true]);
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
  it('a wrong answer, a missing function and a syntax error fail in plain words', async () => {
    expect((await runTests('function add(a, b) { return a - b }', add)).map((x) => x.passed)).toEqual([false, false, false]);
    expect((await runTests('function add(a, b) { return a + b }', add))[2].error).toMatch(/pair/);
    expect((await runTests('function add(a, b) { return a +', add))[0].error).toMatch(/does not run/);
  });
  it('an endless loop is stopped by the time limit; deep recursion is contained; later answers still run', async () => {
    const t0 = Date.now();
    const loop = await runTests('function add() { while (true) {} }', add.slice(0, 1));
    expect(loop[0].error).toMatch(/time limit/);
    expect(Date.now() - t0).toBeLessThan(3000);
    const deep = await runTests('function add(a) { return add(a + 1) }', add.slice(0, 2));
    expect(deep.every((x) => !x.passed)).toBe(true);
    expect((await runTests('function add(a, b) { return a + b }', add.slice(0, 1)))[0].passed).toBe(true);
  });
  it('no host access: no require, process, fetch, timers or file system', async () => {
    const r = await runTests('', [{ name: 'host', call: '[typeof require, typeof process, typeof fetch, typeof setTimeout, typeof std, typeof os, typeof globalThis.module]', expected: Array(7).fill('undefined') }]);
    expect(r[0].passed).toBe(true);
    const mem = await runTests('function add() { const a = []; while (true) a.push("x".repeat(100000)) }', add.slice(0, 1));
    expect(mem[0].passed).toBe(false);
  });
  it('code over 20 000 characters is refused', async () => {
    expect((await runTests('x'.repeat(20_001), add.slice(0, 1)))[0].error).toMatch(/too long/);
  });
});

describe('code questions', () => {
  const q = { id: 'q', type: 'engine', text: 'Write add(a, b) and pair(a, b).', engine: { type: 'code', domain: 'code', language: 'en', code_language: 'javascript', starter: 'function add(a, b) {\n}', answer_key: { tests: add } } };
  it('one point per test; the learner gets the starter but never the tests', () => {
    const c = checkEngineQuestion(q as never);
    expect(c.ok && c.points).toBe(3);
    if (!c.ok) return;
    expect(c.rubric!.criteria.map((x) => x.id)).toEqual(['test_1', 'test_2', 'test_3']);
    const learner = forLearner({ ...q, rubric: c.rubric, engine: c.engine } as never);
    const json = JSON.stringify(learner);
    expect(json).not.toMatch(/add\(2, 3\)|adds two numbers|expected|tests/);
    expect(json).toContain('function add(a, b)');
    expect(json).toContain('Test 1');
    expect(describeKey({ ...q, engine: c.engine } as never)).toBe('adds two numbers · adds negatives · returns an array');
  });
  it('grades: points = passed tests; feedback names the failing tests without revealing them; Arabic feedback', async () => {
    const g = await gradeCode({ code: 'function add(a, b) { return a + b }', tests: add, uiLanguage: 'en' });
    expect(g).toMatchObject({ points: 2, maxPoints: 3, flagged: false, errorCodes: ['tests_failed'] });
    expect(g.feedback).toMatch(/2 of 3 tests pass. Check: test 3/);
    expect(g.feedback).not.toMatch(/pair\(1, 2\)|\[1,2\]/);
    expect((await gradeCode({ code: 'function add(a, b) { return a + b }\nfunction pair(a, b) { return [a, b] }', tests: add, uiLanguage: 'ar' })).feedback).toMatch(/ممتاز/);
  });
});
