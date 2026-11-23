import { describe, expect, it, vi, beforeEach } from 'vitest';

// P4 generation: the model calls (askForJson) are mocked; the bank store is mocked. These tests check the code checks, the judge's pass
// rule, the one regeneration with the reasons, and that nothing reaches the fallback provider.
const calls: { system: string; user: string; allowFallback?: boolean; feature: string }[] = [];
let replies: unknown[] = [];
vi.mock('../../src/services/aiJson', () => ({
  askForJson: vi.fn(async (p: { system: string; user: string; allowFallback?: boolean; feature: string; validate: (v: unknown) => unknown }) => {
    calls.push({ system: p.system, user: p.user, allowFallback: p.allowFallback, feature: p.feature });
    const raw = replies.shift();
    if (raw instanceof Error) throw raw;
    return { value: p.validate(raw), model: 'test-model' };
  }),
  isAiConfigured: () => true,
}));
const created: unknown[] = [];
vi.mock('../../src/models/BankItem', () => ({ BankItem: { find: () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) }), create: vi.fn(async (d: unknown) => { created.push(d); return d; }) } }));

const { checkGenerated, similarity } = await import('../../src/assessment/generate/checks');
const { judgePass } = await import('../../src/assessment/generate/judge');
const { runGeneration } = await import('../../src/assessment/generate/pipeline');
const { tidyKey } = await import('../../src/assessment/generate/generator');

const mcq = (over: Record<string, unknown> = {}) => ({
  type: 'mcq', language: 'en' as const, stem: 'Which word is a verb?', difficulty: 2, objective_code: 'EN-A2-GR-1',
  options: [{ id: 'a', text: 'table' }, { id: 'b', text: 'run' }, { id: 'c', text: 'happy' }, { id: 'd', text: 'blue' }], answer_key: { correct: ['b'], multi: false }, ...over,
});
const all5 = { clarity: 5, single_correct_answer: 5, level_fit: 5, objective_fit: 5, key_correctness: 5, language_quality: 5, safety: 5 };

beforeEach(() => { calls.length = 0; replies = []; created.length = 0; });

describe('code checks', () => {
  it('a sound item passes', () => expect(checkGenerated(mcq())).toEqual([]));
  it('refuses: two correct, 2 options, duplicate options, long stem, no objective, answer in the stem', () => {
    expect(checkGenerated(mcq({ answer_key: { correct: ['a', 'b'], multi: false } })).join()).toMatch(/exactly one correct/);
    expect(checkGenerated(mcq({ options: [{ id: 'a', text: 'run' }, { id: 'b', text: 'walk' }], answer_key: { correct: ['a'], multi: false } })).join()).toMatch(/3-5 options/);
    expect(checkGenerated(mcq({ options: [{ id: 'a', text: 'walks' }, { id: 'b', text: 'walk' }, { id: 'c', text: 'table' }] })).join()).toMatch(/nearly/);
    expect(checkGenerated(mcq({ stem: 'x'.repeat(401) })).join()).toMatch(/over 400/);
    expect(checkGenerated(mcq({ stem: 'A short stem for kids that goes on and on '.repeat(6) }), { kids: true }).join()).toMatch(/over 200/);
    expect(checkGenerated(mcq({ objective_code: '' })).join()).toMatch(/objective/);
    expect(checkGenerated(mcq({ stem: 'We like swimming. Which word is a verb?', options: [{ id: 'a', text: 'table' }, { id: 'b', text: 'swimming' }, { id: 'c', text: 'happy' }] })).join()).toMatch(/gives the answer away/);
  });
  it('refuses: personal data, unsuitable content, wrong script, a near repeat', () => {
    expect(checkGenerated(mcq({ stem: 'Email ahmed@example.com: which word is a verb?' })).join()).toMatch(/personal data/);
    expect(checkGenerated(mcq({ stem: 'Call 01012345678: which word is a verb?' })).join()).toMatch(/personal data/);
    // Long plain numbers are not personal data (maths; found by E2E 25).
    expect(checkGenerated(mcq({ stem: 'Which word is a verb? (1795391400038)' })).join()).not.toMatch(/personal data/);
    expect(checkGenerated(mcq({ stem: 'Which word about gamble is a verb?' })).join()).toMatch(/not suitable/);
    expect(checkGenerated(mcq({ language: 'ar' })).join()).toMatch(/not written in Arabic/);
    expect(checkGenerated(mcq(), { recentStems: ['Which word is a verb?'] }).join()).toMatch(/repeats/);
    expect(similarity('Which word is a verb here?', 'Which word is a verb?')).toBeGreaterThan(0.6);
  });
  it('open items: science needs content points; schema problems are reported', () => {
    expect(checkGenerated({ type: 'short_answer', domain: 'science', language: 'en', stem: 'Why do plants need light?', difficulty: 2, objective_code: 'SC-7', answer_key: { content_points: ['Light gives energy for photosynthesis'] } })).toEqual([]);
    expect(checkGenerated({ type: 'short_answer', domain: 'science', language: 'en', stem: 'Why do plants need light?', difficulty: 2, objective_code: 'SC-7', answer_key: {} }).join()).toMatch(/schema/);
  });
  it('the judge passes only when every criterion is 4+ and safety is 5', () => {
    expect(judgePass(all5)).toBe(true);
    expect(judgePass({ ...all5, clarity: 3 })).toBe(false);
    expect(judgePass({ ...all5, safety: 4 })).toBe(false);
  });
});

describe('generation bench findings (23 Nov 2026)', () => {
  it('open keys are tidied to what the subject allows', () => {
    expect(tidyKey('language', 'essay', { model_answer: 'x', content_points: ['a'], rubric: {} })).toEqual({ model_answer: 'x' });
    expect(tidyKey('science', 'short_answer', { required_points: ['a', 'b'] })).toEqual({ content_points: ['a', 'b'] });
    expect(tidyKey('humanities', 'essay', { points: ['a'], model_answer: 'm' })).toEqual({ required_points: ['a'], model_answer: 'm' });
    expect(tidyKey('language', 'mcq', { correct: ['a'], multi: false })).toEqual({ correct: ['a'], multi: false });
  });
  it('language choice items may have options one letter apart (go / goes); other subjects may not', () => {
    const verbs = { options: [{ id: 'a', text: 'walks' }, { id: 'b', text: 'walk' }, { id: 'c', text: 'walked' }], answer_key: { correct: ['c'], multi: false } };
    expect(checkGenerated(mcq({ ...verbs, subject: 'language' })).join()).not.toMatch(/nearly/);
    expect(checkGenerated(mcq({ ...verbs, subject: 'science' })).join()).toMatch(/nearly/);
    expect(checkGenerated(mcq({ options: [{ id: 'a', text: 'walk' }, { id: 'b', text: 'Walk' }, { id: 'c', text: 'run' }], subject: 'language' })).join()).toMatch(/same/);
  });
});

describe('pipeline', () => {
  const req = { domain: 'language' as const, language: 'en' as const, level: 'A2', objective_code: 'EN-A2-GR-1', types: ['mcq'], count: 2, difficulty: [2, 3] as [number, number] };
  it('generate → checks → judge; a refused item is regenerated once with the reasons; passing items go to the bank as judged', async () => {
    replies = [
      { items: [{ ...mcq(), difficulty: 2 }, { ...mcq({ stem: 'Which word is a noun?', answer_key: { correct: ['a', 'b'], multi: false } }), difficulty: 2 }] },
      { scores: all5, feedback: '' }, // judge, first item (the second fails the code checks before the judge)
      { items: [{ ...mcq({ stem: 'Which word is a noun?', answer_key: { correct: ['a'], multi: false } }), difficulty: 2 }] }, // regeneration
      { scores: all5, feedback: '' },
    ];
    const out = await runGeneration(req, { teacherId: 't1', schoolId: 'sch-1' });
    expect(out.map((o) => o.problems)).toEqual([[], []]);
    expect(out[1].regenerated).toBe(true);
    expect(calls[2].system).toMatch(/rejected an earlier version.*exactly one correct/);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ review_status: 'judged', source: 'generated', school_id: 'sch-1', version: 1 });
    expect(calls.every((c) => c.allowFallback === false && c.feature === 'item_generation')).toBe(true);
  });
  it('a judge below the bar after the regeneration: refused, not stored', async () => {
    replies = [{ items: [mcq()] }, { scores: { ...all5, key_correctness: 2 }, feedback: 'The key is wrong.' }, { items: [mcq()] }, { scores: { ...all5, key_correctness: 2 }, feedback: 'Still wrong.' }];
    const out = await runGeneration({ ...req, count: 1 }, { teacherId: 't1', schoolId: 'sch-1' });
    expect(out[0].problems.join()).toMatch(/judge: Still wrong/);
    expect(created).toHaveLength(0);
  });
});
