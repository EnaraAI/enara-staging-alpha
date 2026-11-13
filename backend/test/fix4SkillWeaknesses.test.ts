import { describe, expect, it } from 'vitest';
import * as LS from '../src/services/languageLearningState';
import * as LTC from '../src/services/languageTeachingContext';
import type { LessonItem } from '../src/services/languageLearningState';

// Fix 4 (multi-skill run 1): Arabic replies too long (S5 13%), "why?" after a partial
// answer answered with the corrected form (S6 11%), skill-blind early hints (S4 37%).
const H = LS.hintInstruction as unknown as (l: number, o?: { kind?: string }) => string;
const kindOf = (LTC as unknown as { itemKind?: (i: LessonItem | undefined, vocab?: string[]) => string }).itemKind;
describe('fix 4: skill weaknesses', () => {
  it('Arabic support is a short gloss, never an Arabic explanation', () => {
    const t = (LTC as unknown as { MOVE_TEXT?: Record<string, string> }).MOVE_TEXT ?? {};
    const l1 = t.l1_support ?? LTC.moveText({ id: 'l1_support', reasons: [], decisionRefs: [] } as never);
    expect(l1).toMatch(/one to three words/i);
    expect(l1).toMatch(/never .*explanation in Arabic|no explanation in Arabic/i);
    expect(l1).toMatch(/English/);
  });
  it('item kinds: reading, word, open, form', () => {
    expect(kindOf).toBeTypeOf('function');
    expect(kindOf!({ id: 'r', prompt: 'Read: "Sara goes by bus." Question: How?', acceptedAnswers: ['by bus'] } as LessonItem)).toBe('reading');
    expect(kindOf!({ id: 'v', prompt: 'Write the word: you drink it. ___', acceptedAnswers: ['milk'], targetForms: ['milk'] } as LessonItem, ['milk'])).toBe('word');
    expect(kindOf!({ id: 'w', prompt: 'Write two sentences about you.' } as LessonItem)).toBe('open');
    expect(kindOf!({ id: 'g', prompt: 'Correct: "She can swims."', acceptedAnswers: ['She can swim.'], targetForms: ['swim'] } as LessonItem)).toBe('form');
  });
  it('skill-aware early hints', () => {
    expect(H(2, { kind: 'reading' })).toMatch(/don't quote or point to the sentence/i);
    expect(H(2, { kind: 'word' })).toMatch(/never give letters/i);
    expect(H(2, { kind: 'open' })).toMatch(/sentence starter/i);
    expect(H(6, { kind: 'word' })).not.toMatch(/never give letters/i);
  });
  it('a "why?" after an attempt is answered with the reason, not the corrected answer', () => {
    expect(LTC.WHY_AFTER_ATTEMPT).toMatch(/reason/i);
    expect(LTC.WHY_AFTER_ATTEMPT).toMatch(/without writing the corrected answer/i);
  });

  it('after an unsuccessful try, the open item stays guarded until the answer level', () => {
    const G = (LTC as unknown as { guardedItems: (c: unknown) => LessonItem[] }).guardedItems;
    const item = { id: 'g1', prompt: 'Correct: "She can swims."', acceptedAnswers: ['She can swim.'], targetForms: ['swim'] } as LessonItem;
    const base = { lesson: { spec: { items: [item] } }, moves: [] as { id: string }[] };
    const sig = (o: object) => ({ ...base, signals: { activeLessonItem: item, answeringCheck: true, learning: { attemptsOnItem: 1, satisfiedLessonItems: [] }, hintLevel: 2, ...o } });
    expect(G(sig({ keyVerdict: 'INCORRECT' })).map((i) => i.id)).toEqual(['g1']);
    expect(G(sig({ keyVerdict: 'CORRECT' }))).toEqual([]);
    expect(G({ ...sig({ keyVerdict: 'INCORRECT' }), moves: [{ id: 'answer_with_reasoning' }] })).toEqual([]);
    expect(G(sig({ keyVerdict: 'INCORRECT', hintLevel: 6 }))).toEqual([]);
  });
});
