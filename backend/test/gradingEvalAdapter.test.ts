import { describe, expect, it } from 'vitest';
import { levelsFor, policyFor, toQuestion } from '../src/scripts/gradingEvalAdapter';
import { questionPoints } from '../src/services/assessmentVersions';

// The offline benchmark adapter turns dataset rubrics into ENARA questions;
// the grading itself is the production code (covered elsewhere).
describe('grading evaluation adapter', () => {
  it('builds half-point levels from a criterion maximum and keeps given levels', () => {
    expect(levelsFor({ id: 'c1', title: 't', max_points: 2.5 }).map((l) => l.points)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    const given = [{ id: 's0', label: '0', points: 0 }, { id: 's5', label: '5', points: 5 }];
    expect(levelsFor({ id: 'o', title: 't', max_points: 5, levels: given })).toBe(given);
  });
  it('makes an open-response question whose maximum matches the dataset rubric', () => {
    const q = toQuestion({
      sample_id: 's', language: 'ar', assessment_type: 'essay', question: 'اشرح', student_response: 'نص', reference_answer: 'مرجع',
      rubric: { source: 'dataset', criteria: [{ id: 'c1', title: 'a', max_points: 3 }, { id: 'c2', title: 'b', max_points: 2 }] },
    });
    expect(q.type).toBe('open-response');
    expect(questionPoints(q)).toBe(5);
    expect(q.modelAnswer).toBe('مرجع');
    expect(q.objectiveIds).toEqual([]);
  });
  it('turns arabicSemanticFor on for short answers only, never for essays', () => {
    const file = { version: 'eval-v3' as const, arabicSemanticFor: ['short_answer'] };
    expect(policyFor(file, 'short_answer').policy?.arabicSemantic).toBe(true);
    expect(policyFor(file, 'essay').policy?.arabicSemantic).toBe(false);
    expect(policyFor(null, 'short_answer')).toEqual({ leakCheck: 'v1' });
  });
  it('turns weakAnswerGuardFor on for the named assessment types only', () => {
    const file = { version: 'eval-v3' as const, weakAnswerGuardFor: ['short_answer'] };
    expect(policyFor(file, 'short_answer').policy?.weakAnswerGuard).toBe(true);
    expect(policyFor(file, 'essay').policy?.weakAnswerGuard).toBe(false);
  });
  it('keeps a trait rubric (LAILA: 7 criteria with described integer levels, 32 points)', () => {
    const lv = (id: string, max: number) => Array.from({ length: max + 1 }, (_, n) => ({ id: `${id}_${n}`, label: String(n), points: n, description: `وصف ${n}` }));
    const traits: [string, number][] = [['relevance', 2], ['organization', 5], ['vocabulary', 5], ['style', 5], ['development', 5], ['mechanics', 5], ['grammar', 5]];
    const q = toQuestion({
      sample_id: 'laila:1', language: 'ar', assessment_type: 'essay', question: 'اكتب مقالا', student_response: 'نص', reference_answer: null,
      rubric: { source: 'dataset', criteria: traits.map(([id, max]) => ({ id, title: id, max_points: max, levels: lv(id, max) })) },
    });
    expect(questionPoints(q)).toBe(32);
    expect(q.modelAnswer).toBeUndefined();
    const crit = (q.rubric as unknown as { criteria: { levels: { points: number; description?: string }[] }[] }).criteria;
    expect(crit[0].levels.map((l) => l.points)).toEqual([0, 1, 2]);
    expect(crit[1].levels[5].description).toBe('وصف 5');
  });
});
