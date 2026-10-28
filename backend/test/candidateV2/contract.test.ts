import { describe, expect, it, vi } from 'vitest';

// Candidate V2 synthetic contract tests (design-v1). Synthetic fixtures only; no model, network or database.
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { throw new Error('provider client must not be constructed'); } } }));
vi.stubGlobal('fetch', () => { throw new Error('network access in tests'); });

import { validateProposal } from '../../src/services/gradingProposals';
import { CANDIDATE_VERSION, validateOpenOutput, validateRubric, validateShortOutput, type Rubric, type Snapshot } from '../../src/services/candidateV2/contract';

// §2 synthetic rubric: C1 {0,2,4} max 4; C2 {0,1,3} max 3; C3 {0,1,3} max 3; total 10.
const RUBRIC: Rubric = { id: 'syn-rubric', version: 3, criteria: [
  { id: 'C1', maxPoints: 4, levels: [{ id: 'c1-0', points: 0 }, { id: 'c1-2', points: 2 }, { id: 'c1-4', points: 4 }] },
  { id: 'C2', maxPoints: 3, levels: [{ id: 'c2-0', points: 0 }, { id: 'c2-1', points: 1 }, { id: 'c2-3', points: 3 }] },
  { id: 'C3', maxPoints: 3, levels: [{ id: 'c3-0', points: 0 }, { id: 'c3-1', points: 1 }, { id: 'c3-3', points: 3 }] },
] };
const ANSWER = 'synthetic answer: alpha reason, beta example, gamma conclusion';
const snap = (rubric: Rubric = RUBRIC, maxPoints = 10, kind: Snapshot['kind'] = 'open-response'): Snapshot =>
  ({ candidateVersion: CANDIDATE_VERSION, tenantId: 't', attemptId: 'a', questionId: 'q', assessmentVersion: 1, kind, rubric, maxPoints, questionText: 'synthetic', answerSha256: 'x', hash: 'h' });
const EV: Record<string, string> = { C1: 'alpha reason', C2: 'beta example', C3: 'gamma conclusion' };
const lv = (c: string, p: number) => `${c.toLowerCase()}-${p}`;
const out = (pts: [number, number, number], over: Record<string, unknown> = {}) => ({
  rubricVersion: 3, feedback: 'synthetic feedback', totalPoints: pts[0] + pts[1] + pts[2],
  criteria: (['C1', 'C2', 'C3'] as const).map((c, i) => ({ criterionId: c, selectedLevelId: lv(c, pts[i]), points: pts[i], evidence: pts[i] > 0 ? [EV[c]] : [] })),
  ...over,
});

describe('1. rubric contracts', () => {
  it('accepts a valid rubric and a valid criterion-level output', () => {
    expect(validateRubric(RUBRIC)).toEqual({ ok: true });
    expect(validateOpenOutput(out([4, 1, 3]), snap(), ANSWER)).toMatchObject({ status: 'VALID', totalPoints: 8, scoreMax: 10, rubricVersion: 3 });
  });
  it('rejects missing and duplicate criteria', () => {
    const o = out([4, 1, 3]);
    expect(validateOpenOutput({ ...o, criteria: o.criteria.slice(0, 2), totalPoints: 5 }, snap(), ANSWER)).toMatchObject({ reasonCode: 'MISSING_CRITERION' });
    expect(validateOpenOutput({ ...o, criteria: [...o.criteria, o.criteria[0]] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'DUPLICATE_CRITERION' });
  });
  it('rejects unknown criteria and levels', () => {
    const o = out([4, 1, 3]);
    expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], criterionId: 'C9' }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'INVALID_CRITERION_ID' });
    expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], selectedLevelId: 'c1-3' }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'INVALID_LEVEL_ID' });
  });
  it('rejects points inconsistent with the selected level', () => {
    const o = out([4, 1, 3]);
    expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], points: 3 }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'CRITERION_POINTS_MISMATCH' });
  });
  it('rejects malformed rubrics', () => {
    for (const r of [null, {}, { id: 'r', version: 1, criteria: [] }, { ...RUBRIC, version: 0 },
      { ...RUBRIC, criteria: [RUBRIC.criteria[0], RUBRIC.criteria[0]] },
      { ...RUBRIC, criteria: [{ id: 'C1', maxPoints: 4, levels: [{ id: 'a', points: 2 }] }] },
      { ...RUBRIC, criteria: [{ id: 'C1', maxPoints: 4, levels: [{ id: 'a', points: 0 }, { id: 'a', points: 4 }] }] },
      { ...RUBRIC, criteria: [{ id: 'C1', maxPoints: 4, levels: [{ id: 'a', points: -1 }, { id: 'b', points: 4 }] }] }]) {
      expect(validateRubric(r).ok).toBe(false);
    }
    expect(validateOpenOutput(out([4, 1, 3]), snap({ ...RUBRIC, criteria: [] }), ANSWER)).toMatchObject({ status: 'NOT_ELIGIBLE', reasonCode: 'INVALID_RUBRIC' });
  });
  it('rejects missing or fabricated evidence and missing feedback', () => {
    const o = out([4, 1, 3]);
    expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], evidence: [] }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'MISSING_EVIDENCE' });
    expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], evidence: ['not in the answer'] }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ reasonCode: 'MISSING_EVIDENCE' });
    expect(validateOpenOutput({ ...o, feedback: '  ' }, snap(), ANSWER)).toMatchObject({ reasonCode: 'MISSING_FEEDBACK' });
  });
  it('rejects a rubric-version mismatch', () => {
    expect(validateOpenOutput(out([4, 1, 3], { rubricVersion: 2 }), snap(), ANSWER)).toMatchObject({ reasonCode: 'RUBRIC_VERSION_MISMATCH' });
  });
  it('supports fractional points declared by the rubric, without rounding', () => {
    const frac: Rubric = { id: 'f', version: 1, criteria: [{ id: 'C1', maxPoints: 2.5, levels: [{ id: 'z', points: 0 }, { id: 'h', points: 1.25 }, { id: 'f', points: 2.5 }] }] };
    const r = validateOpenOutput({ rubricVersion: 1, feedback: 'f', totalPoints: 1.25, criteria: [{ criterionId: 'C1', selectedLevelId: 'h', points: 1.25, evidence: ['alpha reason'] }] }, snap(frac, 2.5), ANSWER);
    expect(r).toMatchObject({ status: 'VALID', totalPoints: 1.25, scoreMax: 2.5 });
  });
  it('agrees with the production eval-v2 validator on level points (read-only cross-check)', () => {
    const prod = validateProposal({ criteria: out([4, 1, 3]).criteria.map((c) => ({ criterionId: c.criterionId, levelId: c.selectedLevelId, evidence: c.evidence })), feedback: 'f', scoreExplanation: 's' },
      RUBRIC.criteria.map((c) => ({ id: c.id, title: c.id, maxPoints: c.maxPoints, levels: c.levels.map((l) => ({ ...l, label: l.id })) })) as any, ANSWER);
    const v2 = validateOpenOutput(out([4, 1, 3]), snap(), ANSWER) as any;
    expect(prod.criteria.map((c: any) => c.points)).toEqual(v2.criteria.map((c: any) => c.points));
  });
});

describe('2. score aggregation (synthetic rubric, max 10)', () => {
  it.each([[[4, 1, 3], 8], [[0, 0, 0], 0], [[4, 3, 3], 10]] as const)('%j sums to %i', (pts, total) => {
    expect(validateOpenOutput(out(pts as any), snap(), ANSWER)).toMatchObject({ status: 'VALID', totalPoints: total });
  });
  it('rejects a total inconsistent with criterion scores', () => {
    expect(validateOpenOutput(out([4, 1, 3], { totalPoints: 7 }), snap(), ANSWER)).toMatchObject({ reasonCode: 'TOTAL_POINTS_MISMATCH' });
  });
  it.each([[-1], [11], [NaN], [Infinity], [-Infinity], ['8']])('rejects total %s', (t) => {
    expect(validateOpenOutput(out([4, 1, 3], { totalPoints: t }), snap(), ANSWER)).toMatchObject({ status: 'INVALID_OUTPUT' });
  });
  it('rejects non-finite criterion points', () => {
    const o = out([4, 1, 3]);
    for (const p of [NaN, Infinity]) expect(validateOpenOutput({ ...o, criteria: [{ ...o.criteria[0], points: p }, ...o.criteria.slice(1)] }, snap(), ANSWER)).toMatchObject({ status: 'INVALID_OUTPUT' });
  });
  it('orders criteria by the rubric regardless of output order (deterministic)', () => {
    const o = out([4, 1, 3]);
    const r = validateOpenOutput({ ...o, criteria: [...o.criteria].reverse() }, snap(), ANSWER) as any;
    expect(r.criteria.map((c: any) => c.criterionId)).toEqual(['C1', 'C2', 'C3']);
    expect(validateOpenOutput(o, snap(), ANSWER)).toEqual(validateOpenOutput(structuredClone(o), snap(), ANSWER));
  });
  it('short answers are 0 or max, never partial', () => {
    const s = snap(undefined as any, 2, 'short-answer');
    expect(validateShortOutput({ isCorrect: true, feedback: 'f' }, s)).toMatchObject({ status: 'VALID', points: 2 });
    expect(validateShortOutput({ isCorrect: false, feedback: 'f' }, s)).toMatchObject({ status: 'VALID', points: 0 });
    expect(validateShortOutput({ isCorrect: true, points: 1, feedback: 'f' }, s)).toMatchObject({ reasonCode: 'SHORT_ANSWER_SCORE_NOT_BINARY' });
    expect(validateShortOutput({ isCorrect: false, points: 2, feedback: 'f' }, s)).toMatchObject({ reasonCode: 'SHORT_ANSWER_SCORE_NOT_BINARY' });
    expect(validateShortOutput({ isCorrect: true, points: NaN, feedback: 'f' }, s)).toMatchObject({ status: 'INVALID_OUTPUT' });
    expect(validateShortOutput({ isCorrect: 'yes', feedback: 'f' }, s)).toMatchObject({ reasonCode: 'MALFORMED_OUTPUT' });
  });
});

describe('3. invalid outputs (pure)', () => {
  it.each([[null, 'EMPTY_OUTPUT'], ['', 'EMPTY_OUTPUT'], ['{not json', 'MALFORMED_OUTPUT'], [[], 'MALFORMED_OUTPUT'], [{}, 'RUBRIC_VERSION_MISMATCH'],
    [{ rubricVersion: 3 }, 'MALFORMED_OUTPUT'], [{ rubricVersion: 3, criteria: [{ criterionId: 1 }] }, 'MALFORMED_OUTPUT']])('%j -> %s', (raw, code) => {
    const r = validateOpenOutput(raw, snap(), ANSWER) as any;
    expect(r.status).not.toBe('VALID');
    expect(r.reasonCode).toBe(code);
    expect(r).not.toHaveProperty('totalPoints');
  });
  it('an ungradable answer is UNGRADABLE, not a zero', () => {
    expect(validateOpenOutput({ ungradable: true }, snap(), ANSWER)).toEqual({ status: 'UNGRADABLE', reasonCode: 'UNGRADABLE_ANSWER', detail: undefined });
    expect(validateShortOutput({ ungradable: true }, snap(undefined as any, 1, 'short-answer'))).toMatchObject({ status: 'UNGRADABLE' });
  });
});
