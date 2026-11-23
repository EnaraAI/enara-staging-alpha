import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Rules-first grading in the engine (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.2-§2.3), switch rulesFirst. The model call (askForJson)
// and the proposal store are stubbed as in openGrading.test.ts; the rules themselves run for real.

const calls: { system: string; user: string }[] = [];
let replies: unknown[] = [];
vi.mock('../../src/services/aiJson', () => ({
  askForJson: vi.fn(async (p: { system: string; user: string; validate: (v: unknown) => unknown }) => {
    calls.push({ system: p.system, user: p.user });
    const raw = replies.shift();
    if (raw instanceof Error) throw raw;
    return { value: p.validate(raw), model: 'test-model' };
  }),
  isAiConfigured: () => true,
}));
vi.mock('../../src/models/GradingProposal', () => ({ GradingProposal: { create: vi.fn(async () => ({ id: 'gp-test' })) } }));

const { gradeOpenAnswer } = await import('../../src/assessment/grading-engine/open');
const { rubricFor } = await import('../../src/assessment/rubrics/templates');
const { validateGrading } = await import('../../src/services/autoGrading');

const attempt = { id: 'att-1', institutionId: 'sch-1', assignmentId: 'asg-1' };
const item = { questionId: 'q1', stem: 'A car travels 120 km in 2 hours. Calculate its average speed. Show your working.', type: 'short_answer' as const, domain: 'science' as const, language: 'en', points: ['Uses average speed = distance ÷ time', 'Average speed = 60 km/h'], units: true };
const max = Object.fromEntries(rubricFor('science', 'short_answer', 'en', { points: item.points, units: true })!.criteria.map((c) => [c.id, c.maxPoints]));
const answer = 'Speed = distance / time = 120 / 2. Average speed = 60 km/h.';
const reply = (over: Record<string, unknown> = {}) => ({
  criteria: ['point_1', 'point_2', 'reasoning', 'terminology', 'units'].map((c) => ({ criterionId: c, levelId: c === 'reasoning' ? 'p1' : c === 'units' || c === 'point_2' ? 'p0' : 'p1', evidence: ['distance / time'], rationale: 'ok' })),
  errorCodes: [], confidence: 0.9, scoreExplanation: 'Right method.', strengths: [], improvements: [], feedback: 'Good. Explain each step.', flags: [], ...over,
});
const grade = (a: unknown, modelReady = true) => gradeOpenAnswer({ attempt, item, answer: a, uiLanguage: 'en', maxByCriterion: max, modelReady, options: { store: false } });

const env = process.env.ENARA_ENGINE_V2;
beforeEach(() => { calls.length = 0; replies = []; });
afterEach(() => { process.env.ENARA_ENGINE_V2 = env; });

describe('switch off: exactly as before', () => {
  it('the model grades everything, same prompts, no scoredBy fields; "all" does not turn it on', async () => {
    process.env.ENARA_ENGINE_V2 = '';
    replies = [reply(), reply()];
    const off = await grade(answer);
    const before = calls.splice(0);
    process.env.ENARA_ENGINE_V2 = 'all,assessGrading';
    replies = [reply(), reply()];
    const all = await grade(answer);
    expect(calls).toEqual(before);
    expect(all).toEqual(off);
    expect(Object.keys(JSON.parse(before[0].user)).sort()).toEqual(['answer', 'item', 'rubric', 'uiLanguage']);
    expect(before[0].system).not.toMatch(/codeScores/);
    expect(off.criteria.every((c) => !('scoredBy' in c) && !('rule' in c))).toBe(true);
    expect(off.criteria.find((c) => c.code === 'point_2')).toEqual({ code: 'point_2', points: 0, max: 1, reasonCode: 'not_met' });
    // A punctuation-only answer still goes to the model when the switch is off.
    replies = [reply(), reply()];
    process.env.ENARA_ENGINE_V2 = '';
    calls.length = 0;
    await grade('...');
    expect(calls.length).toBe(2);
  });
});

describe('switch on', () => {
  beforeEach(() => { process.env.ENARA_ENGINE_V2 = 'assessGrading,rulesFirst'; });
  it('every criterion decided by code (blank, wrong script): no model call, confidence 1, grader code, even with no model', async () => {
    for (const a of ['...', '؟', 'السرعة تساوي المسافة على الزمن']) {
      const g = await grade(a, false);
      expect(g).toMatchObject({ points: 0, confidence: 1, flagged: false, grader: 'code', runs: [] });
      expect(g.criteria.every((c) => c.scoredBy === 'code' && c.points === 0 && !!c.rule && !!c.reason)).toBe(true);
      expect(g.feedback).toBeTruthy();
    }
    expect(calls.length).toBe(0);
  });
  it('partly decided: the model gets the code scores and findings, scores only the rest, and cannot change code scores', async () => {
    // The model tries to give point_2 = 0 and units = 0; code found both: code's scores stand.
    replies = [reply(), reply()];
    const g = await grade(answer);
    expect(calls.length).toBe(2);
    const user = JSON.parse(calls[0].user);
    expect(user.rubric.map((c: { criterionId: string }) => c.criterionId)).toEqual(['point_1', 'reasoning', 'terminology']);
    expect(user.codeScores).toEqual([{ criterionId: 'point_2', points: 1, reason: expect.stringContaining('Average speed = 60 km/h') }, { criterionId: 'units', points: 1, reason: 'states 60 km/h' }]);
    expect(user.codeFindings.map((f: { rule: string }) => f.rule)).toEqual(['point_phrase', 'units_stated']);
    expect(calls[0].system).toMatch(/never contradict them/);
    expect(g.criteria.map((c) => [c.code, c.points, c.scoredBy])).toEqual([['point_1', 1, 'model'], ['point_2', 1, 'code'], ['reasoning', 1, 'model'], ['terminology', 1, 'model'], ['units', 1, 'code']]);
    expect(g.criteria.find((c) => c.code === 'units')).toMatchObject({ rule: 'units_stated', reason: 'states 60 km/h' });
    expect(g.points).toBe(5);
    expect(g.grader).toBe('model:test-model');
    expect(g.confidence).toBe(0.9); // the model's share
  });
  it('a reply that is unsure is still flagged: flags apply to the model\'s share', async () => {
    replies = [reply({ confidence: 0.4 }), reply()];
    const g = await grade(answer);
    expect(g.flagged).toBe(true);
    expect(g.flagReasons).toContain('low_confidence');
    expect(g.criteria.find((c) => c.code === 'units')).toMatchObject({ points: 1, scoredBy: 'code' });
  });
  it('nothing certain: the model scores every criterion (scoredBy model) and gets the findings only', async () => {
    replies = [reply(), reply()];
    const g = await grade('Speed is distance / time, so it is sixty.');
    const user = JSON.parse(calls[0].user);
    expect(user.rubric).toHaveLength(5);
    expect(user.codeScores).toEqual([]);
    expect(g.criteria).toHaveLength(5);
    expect(g.criteria.every((c) => c.scoredBy === 'model')).toBe(true);
  });
});

describe('the release check accepts a code-only grade only when the rules give exactly that', () => {
  const rubric = rubricFor('science', 'short_answer', 'en', { points: item.points, units: true })!;
  const q: any = { id: 'q1', type: 'engine', text: item.stem, rubric, engine: { type: 'short_answer', domain: 'science', language: 'en', flags: { units: true }, answer_key: { content_points: item.points } } };
  const check = (studentAnswer: string, points = 0) => {
    const answerRow: any = { questionId: 'q1', studentAnswer, points, maxPoints: 6, method: 'rule', grader: 'code', criterionScores: rubric.criteria.map((c) => ({ criterionId: c.id, levelId: 'p0', points: 0 })) };
    try {
      validateGrading({ attempt: { id: 'att', assignmentId: 'asg', assessmentId: 'asm', assessmentVersion: 1 } as any, assignment: { id: 'asg' }, version: { assessmentId: 'asm', version: 1 }, questions: [q], answers: [answerRow], evaluations: new Map() });
      return 'passed';
    } catch (e: any) { return e.reason; }
  };
  it('punctuation only: passes; a real answer marked as code-only: refused', () => {
    expect(check('...')).toBe('passed');
    expect(check('...', 1)).toBe('rule_mismatch');
    expect(check(answer)).toBe('rule_mismatch');
  });
});
