import { describe, expect, it } from 'vitest';
import { groupOf, score } from '../src/scripts/subjectEval';

// Subject test set (ARCH_ADOPTION_PLAN F): grouping and scoring of the retrieval results.
describe('subject test set scoring', () => {
  it('groups: same language, cross language, not covered', () => {
    const s = { subject: 'science', materialLanguage: 'en', passages: [], questions: [] };
    expect(groupOf(s as never, { id: 'a', lang: 'en', q: '', expect: ['s1'], kind: 'covered' })).toBe('same_language');
    expect(groupOf(s as never, { id: 'b', lang: 'ar', q: '', expect: ['s1'], kind: 'covered' })).toBe('cross_language');
    expect(groupOf(s as never, { id: 'c', lang: 'en', q: '', expect: [], kind: 'not_covered' })).toBe('not_covered');
  });
  it('rates per subject and group, one decimal', () => {
    const r = score([
      { subject: 'maths', group: 'same_language', ok: true, rewritten: false },
      { subject: 'maths', group: 'same_language', ok: false, rewritten: false },
      { subject: 'maths', group: 'same_language', ok: true, rewritten: false },
      { subject: 'maths', group: 'cross_language', ok: false, rewritten: false },
    ]);
    expect(r.maths.same_language).toEqual({ n: 3, ok: 2, rate: 66.7 });
    expect(r.maths.cross_language).toEqual({ n: 1, ok: 0, rate: 0 });
  });
});
