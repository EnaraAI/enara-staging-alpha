import { describe, expect, it } from 'vitest';
import * as LS from '../src/services/languageLearningState';
import * as LTC from '../src/services/languageTeachingContext';

// Fix 3: level fit fell 90% -> 81% as instructions grew. The grader's evidence was
// overload at pre-A1/A1: several tasks per reply, extra words beyond the lesson list,
// side grammar, abstract "why" questions in English.
describe('fix 3: beginner load budget', () => {
  it('A1 instructions set one task, a short lead-in, no extra words, no side grammar, no English "why" questions', () => {
    const load = (LTC as unknown as { LOAD_BUDGET?: Record<string, string> }).LOAD_BUDGET;
    expect(load).toBeTruthy();
    const a1 = load!.a1;
    expect(a1).toMatch(/one task/i);
    expect(a1).toMatch(/word list|lesson's words/i);
    expect(a1).toMatch(/synonym/i);
    expect(a1).toMatch(/no .*grammar beyond|only today's grammar point/i);
    expect(a1).toMatch(/why/i);
    expect(load!.prea1).toBe(a1);
    expect(load!.b1 ?? '').not.toMatch(/why/i);
  });
  it('two-option hints at beginner level ask a one-word question, not "explain why"', () => {
    const h = LS.hintInstruction as unknown as (l: number, o?: { binary?: boolean; beginner?: boolean }) => string;
    const t = h(2, { binary: true, beginner: true });
    expect(t).not.toMatch(/explain/i);
    expect(t).toMatch(/one word/i);
    expect(h(2, { binary: true })).toMatch(/explain/i);
  });
  it('load telemetry flags a beginner reply that sets two tasks or runs past the word limit', () => {
    const f = (LS as unknown as { loadOverBudget?: (r: string, maxWords: number) => string[] }).loadOverBudget;
    expect(typeof f).toBe('function');
    expect(f!('Good try! Write one sentence about your sister. Then answer: who is your uncle? Why?', 80)).toContain('multiple_tasks');
    expect(f!('Nice! Now write one sentence about your sister.', 80)).toEqual([]);
    expect(f!(Array(90).fill('word').join(' ') + '.', 80)).toContain('over_length');
  });
});
