import { describe, expect, it } from 'vitest';
import { PRODUCTION_POLICY, PROPOSAL_VERSION, derivedLevelDescription, rubricPrompt, validateProposal } from '../src/services/gradingProposals';
import { leaksModelAnswerV2 } from '../src/services/autoGrading';

// eval-v3 and leak-v2 are opt-in (offline benchmark). These tests pin the
// production behaviour: without a policy the prompt is the eval-v2 prompt.
const question = {
  id: 'q', type: 'open-response', text: 'Why same-size parts?', explanation: '', modelAnswer: 'Parts must be equal in size before adding.',
  rubric: { criteria: [{ id: 'c', title: 'Reasoning', maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0 }, { id: 'l1', label: '1', points: 1 }, { id: 'l2', label: '2', points: 2, description: 'Clear' }] }] },
} as any;

describe('evaluation policy', () => {
  it('arabicSemantic (eval-v3) applies only to Arabic answers and leaves production and other languages unchanged', () => {
    const ar = 'الجواب الصحيح هنا';
    const prod = rubricPrompt({ question, answer: ar });
    const sem = rubricPrompt({ question, answer: ar, policy: { version: 'eval-v3', arabicSemantic: true } });
    expect(sem.system).toMatch(/This is an Arabic short answer. Grade what the answer means/);
    expect(sem.system.startsWith(prod.system)).toBe(true); // only appended
    expect(sem.user).toEqual(prod.user); // rubric, model answer and question untouched
    expect(prod.system).not.toMatch(/Arabic short answer/);
    expect(prod.system).toMatch(/in Arabic\./); // Arabic feedback for Arabic answers (existing behaviour)
    expect(rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3', arabicSemantic: true } }).system).toBe(rubricPrompt({ question, answer: 'same size' }).system);
    expect(rubricPrompt({ question, answer: ar, policy: { version: 'eval-v2', arabicSemantic: true } })).toEqual(prod);
  });
  it('weakAnswerGuard (eval-v3) only appends its guidance; production and eval-v2 are unchanged', () => {
    const prod = rubricPrompt({ question, answer: 'same size' });
    const g = rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3', weakAnswerGuard: true } });
    expect(g.system.startsWith(prod.system)).toBe(true);
    expect(g.system).toMatch(/topic words alone may not/);
    expect(g.user).toEqual(prod.user);
    expect(prod.system).not.toMatch(/required concept/);
    expect(rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v2', weakAnswerGuard: true } })).toEqual(prod);
    expect(PRODUCTION_POLICY.weakAnswerGuard).toBeUndefined();
  });
  it('relevanceCriteria (eval-v3) adds guidance to the named criterion only and requires a quote for its deductions', () => {
    const essay = {
      ...question,
      rubric: { criteria: [
        { id: 'relevance', title: 'Relevance', maxPoints: 2, levels: [{ id: 'r0', label: '0', points: 0 }, { id: 'r1', label: '1', points: 1 }, { id: 'r2', label: '2', points: 2 }] },
        { id: 'style', title: 'Style', maxPoints: 2, levels: [{ id: 's0', label: '0', points: 0 }, { id: 's1', label: '1', points: 1 }, { id: 's2', label: '2', points: 2 }] },
      ] },
    };
    const base = rubricPrompt({ question: essay, answer: 'text' });
    const rel = rubricPrompt({ question: essay, answer: 'text', policy: { version: 'eval-v3', relevanceCriteria: ['relevance'] } });
    expect(rel.user.rubric[0].description).toMatch(/Topic relevance only/);
    expect(rel.user.rubric[1]).toEqual(base.user.rubric[1]); // other criteria unchanged
    expect(rel.system).toBe(base.system);
    expect(rubricPrompt({ question: essay, answer: 'text', policy: { version: 'eval-v2', relevanceCriteria: ['relevance'] } })).toEqual(base);
    const raw = (rLevel: string, ev: string[]) => ({ criteria: [{ criterionId: 'relevance', levelId: rLevel, evidence: ev }, { criterionId: 'style', levelId: 's1', evidence: ['on topic'] }], feedback: 'f', scoreExplanation: 'e' });
    const answer = 'on topic text and an off topic aside';
    // Production rule: a deduction needs no quote.
    expect(() => validateProposal(raw('r1', []), essay.rubric.criteria, answer)).toThrow(/supports the level/); // r1 > 0 still needs a quote
    expect(validateProposal(raw('r0', []), essay.rubric.criteria, answer).criteria[0].points).toBe(0);
    // Opt-in: below-maximum relevance must quote the passage.
    expect(() => validateProposal(raw('r0', []), essay.rubric.criteria, answer, [], { deductionEvidenceFor: ['relevance'] })).toThrow(/supports the deduction/);
    expect(validateProposal(raw('r1', ['an off topic aside']), essay.rubric.criteria, answer, [], { deductionEvidenceFor: ['relevance'] }).criteria[0].points).toBe(1);
    expect(validateProposal(raw('r2', ['on topic text']), essay.rubric.criteria, answer, [], { deductionEvidenceFor: ['relevance'] }).criteria[0].points).toBe(2);
  });
  it('production default is eval-v2 with no v3 additions', () => {
    expect(PRODUCTION_POLICY).toEqual({ version: 'eval-v2' });
    expect(PROPOSAL_VERSION).toBe('eval-v2');
    const p = rubricPrompt({ question, answer: 'same size' });
    expect(p.version).toBe('eval-v2');
    expect(p.system).not.toMatch(/short-answer question|calibrationExamples/);
    expect(p.user).not.toHaveProperty('calibrationExamples');
    expect(p.user.rubric[0].levels.map((l: any) => l.description)).toEqual([undefined, undefined, 'Clear']);
    // A v2 policy passed explicitly is the same prompt.
    expect(rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v2', brevityTolerant: true, levelGuidance: true } })).toEqual(p);
  });
  it('eval-v3 adds only what is switched on, and never overwrites a teacher description', () => {
    const p = rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3', brevityTolerant: true, levelGuidance: true, anchors: [{ question: 'Other?', response: 'x', score: 4, max: 5 }] } });
    expect(p.version).toBe('eval-v3');
    expect(p.system).toMatch(/short-answer question/);
    expect(p.system).toMatch(/calibrationExamples are responses to other questions/);
    expect(p.user.calibrationExamples).toEqual([{ question: 'Other?', response: 'x', teacherScore: '4 / 5' }]);
    expect(p.user.rubric[0].levels.map((l: any) => l.description)).toEqual([derivedLevelDescription(0, 2), derivedLevelDescription(1, 2), 'Clear']);
    expect(p.system).not.toMatch(/Score each criterion only against/);
    const scoped = rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3', criterionScoped: true } });
    expect(scoped.system).toMatch(/Score each criterion only against that criterion's own requirement/);
    expect(rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v2', criterionScoped: true } }).system).not.toMatch(/Score each criterion only/);
    const alt = rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3', alternativesAccepted: true } });
    expect(alt.system).toMatch(/The model answer is one acceptable answer, not the only one/);
    expect(rubricPrompt({ question, answer: 'same size' }).system).not.toMatch(/one acceptable answer, not the only one/);
    const plain = rubricPrompt({ question, answer: 'same size', policy: { version: 'eval-v3' } });
    expect(plain.system).toBe(rubricPrompt({ question, answer: 'same size' }).system);
  });
});

describe('leak check v2', () => {
  const longModel = 'the length of the longest path from the root to any of its leaves';
  it('never flags what v1 would not (short references are never flagged)', () => {
    expect(leaksModelAnswerV2('push and pop are the operations', 'push and pop', '')).toBe(false);
  });
  it('needs the whole of an 8-15 word reference, and ignores words the student wrote', () => {
    expect(longModel.split(' ').length).toBe(14);
    expect(leaksModelAnswerV2('Good: the longest path from the root to any of its leaves matters.', longModel, '')).toBe(false);
    expect(leaksModelAnswerV2(`Remember: ${longModel}.`, longModel, '')).toBe(true);
    expect(leaksModelAnswerV2(`You wrote: ${longModel}.`, longModel, `height is ${longModel}`)).toBe(false);
  });
  it('keeps 8-word runs for long references', () => {
    const model = 'when water freezes its molecules form an open structure so ice takes up more space for the same mass';
    expect(leaksModelAnswerV2('Note that its molecules form an open structure so ice floats.', model, '')).toBe(true);
    expect(leaksModelAnswerV2('Ice is less dense than water.', model, '')).toBe(false);
  });
});
