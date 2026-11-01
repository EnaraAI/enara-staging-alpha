import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { leaksModelAnswerV2, validateGrading } from '../src/services/autoGrading';

// P19.1: the grading leak guard on the exact evaluations the real AI produced in
// the P19 100-workflow run (staging, synthetic students). No provider is involved:
// validateGrading is the deterministic check that decides release vs. retry.
// Blocked: W054 and W094 (3 runs x 2 evaluations each, all rejected as feedback_leak).
// Released controls: W014, W034, W074 (same assessment, same misconception answer).

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures_p19_1_leak_cases.json'), 'utf8'));
const MODEL: string = fx.modelAnswer;
const level = (id: string, points: number) => ({ id, label: id, points });
const question: any = {
  id: 'q2', type: 'open-response', text: 'Explain why wet clothes dry faster on a warm, windy day.', modelAnswer: MODEL,
  rubric: { criteria: [
    { id: 'c2i', title: 'Scientific idea (evaporation)', maxPoints: 2, levels: [level('c2i0', 0), level('c2i1', 1), level('c2i2', 2)] },
    { id: 'c2c', title: 'Cause: energy and air movement', maxPoints: 2, levels: [level('c2c0', 0), level('c2c1', 1), level('c2c2', 2)] },
  ] },
};

function check(released: { studentAnswer: string; feedback?: string; scoreExplanation?: string; strengths?: string[]; improvements?: string[] }, leakCheck: 'v1' | 'v2') {
  const attempt: any = { id: 'att', assignmentId: 'asg', assessmentId: 'asm', assessmentVersion: 1 };
  const answer: any = {
    questionId: 'q2', studentAnswer: released.studentAnswer, points: 0, maxPoints: 4, method: 'ai',
    criterionScores: [{ criterionId: 'c2i', levelId: 'c2i0', points: 0 }, { criterionId: 'c2c', levelId: 'c2c0', points: 0 }],
    feedback: released.feedback, scoreExplanation: released.scoreExplanation, strengths: released.strengths ?? [], improvements: released.improvements ?? [],
  };
  const evaluation: any = { attemptId: 'att', questionId: 'q2', status: 'proposed', points: 0, objectiveIds: [] };
  try {
    validateGrading({ attempt, assignment: { id: 'asg' }, version: { assessmentId: 'asm', version: 1 }, questions: [question], answers: [answer], evaluations: new Map([['q2', evaluation]]), leakCheck });
    return 'passed';
  } catch (e: any) {
    return e.reason ?? 'error';
  }
}
// The 8-word runs of the model answer that a text contains (v1 tokenisation: lower case, split on spaces).
function v1Runs(text: string) {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const m = MODEL.toLowerCase().split(/\s+/);
  const runs: string[] = [];
  for (let i = 0; i + 8 <= m.length; i++) if (t.includes(` ${m.slice(i, i + 8).join(' ')} `)) runs.push(m.slice(i, i + 8).join(' '));
  return runs;
}
const releasedText = (e: any) => [e.feedback, e.scoreExplanation, ...(e.strengths || []), ...(e.improvements || [])].join(' \n ');

describe('P19.1 leak guard on the real P19 evaluations', () => {
  const blocked = Object.entries(fx.blocked) as [string, any][];

  it('the released ("chosen") evaluation of every grading run of W054 and W094 is a genuine model-answer echo, rejected by v1 (production) and v2', () => {
    // evaluateOpen releases runs[0] (the "run 1" evaluation) when both agree; "run 2" only confirms the score.
    const rows: string[] = [];
    for (const [sk, b] of blocked) {
      const chosen = b.evaluations.filter((e: any) => e.run === 1);
      const partners = b.evaluations.filter((e: any) => e.run === 2);
      expect(chosen.length, `${sk}: one chosen evaluation per grading run`).toBe(3);
      for (const e of chosen) {
        const runs = v1Runs(releasedText(e));
        rows.push(`${sk} chosen ${e.id}: v1=${check({ ...e, studentAnswer: b.studentAnswer }, 'v1')} v2=${check({ ...e, studentAnswer: b.studentAnswer }, 'v2')} runs=${JSON.stringify(runs)}`);
        expect(check({ ...e, studentAnswer: b.studentAnswer }, 'v1'), `${sk} ${e.id} v1`).toBe('feedback_leak');
        expect(check({ ...e, studentAnswer: b.studentAnswer }, 'v2'), `${sk} ${e.id} v2`).toBe('feedback_leak');
        expect(runs.length).toBeGreaterThan(0);
      }
      for (const e of partners) rows.push(`${sk} partner ${e.id} (same score ${e.points}): v1=${check({ ...e, studentAnswer: b.studentAnswer }, 'v1')} v2=${check({ ...e, studentAnswer: b.studentAnswer }, 'v2')}`);
    }
    console.log(`P19_1_BLOCKED\n${rows.join('\n')}`);
  });

  it('association: every rejected evaluation belongs to its own attempt, assignment, question and school', () => {
    for (const [sk, b] of blocked) {
      for (const e of b.evaluations) {
        expect(e.attemptId, sk).toBe(b.attemptId);
        expect(e.questionId).toBe('q2');
        expect(e.institutionId).toBe('enara-staging-school');
        expect(e.assignmentId).toBe('asg-291e92e4-872d-484f-8273-6a5cb8767d80');
        expect(e.status).toBe('proposed'); // never accepted, so never released
      }
      expect(new Set(b.evaluations.map((e: any) => e.id)).size, `${sk}: no duplicate evaluations`).toBe(6);
      expect(b.evaluations.map((e: any) => e.run).sort(), `${sk}: two evaluations per grading run`).toEqual([1, 1, 1, 2, 2, 2]);
    }
  });

  it('released controls (same assessment, same misconception answer): W014 and W074 pass; W034 (comma-split echo) is now blocked by v1 too (F-2 fix)', () => {
    const rows: string[] = [];
    const v1: Record<string, string> = {}; const v2: Record<string, string> = {};
    for (const [sk, r] of Object.entries(fx.released) as [string, any][]) {
      v1[sk] = check(r, 'v1'); v2[sk] = check(r, 'v2');
      rows.push(`${sk}: v1=${v1[sk]} v2=${v2[sk]} v1Runs=${JSON.stringify(v1Runs(releasedText(r)))} v2Leak=${leaksModelAnswerV2(releasedText(r), MODEL, r.studentAnswer)}`);
    }
    console.log(`P19_1_RELEASED\n${rows.join('\n')}`);
    expect(v1).toEqual({ W014: 'passed', W034: 'feedback_leak', W074: 'passed' });
    expect(v2.W074, 'genuinely safe feedback passes v2 too').toBe('passed');
    expect(v2.W014).toBe('passed');
    // W034 restates 8 model-answer words split by a comma ("more energy, so more of them").
    // Before the F-2 fix v1 released it; v1 and v2 now both block it.
    expect(v2.W034).toBe('feedback_leak');
  });

  it('negative control: a verbatim copy of the model answer is always blocked; positive control: feedback in the grader\'s own words passes', () => {
    const base = { studentAnswer: 'The wind pushes the water out.', scoreExplanation: 'The answer does not mention evaporation.', strengths: [], improvements: [] };
    expect(check({ ...base, feedback: `Correct answer: ${MODEL}` }, 'v1')).toBe('feedback_leak');
    expect(check({ ...base, feedback: `Correct answer: ${MODEL}` }, 'v2')).toBe('feedback_leak');
    expect(check({ ...base, feedback: 'Good that you noticed wind. Next step: explain what happens to the water you can no longer see, and why warm days speed that up.' }, 'v1')).toBe('passed');
    expect(check({ ...base, feedback: 'Good that you noticed wind. Next step: explain what happens to the water you can no longer see, and why warm days speed that up.' }, 'v2')).toBe('passed');
  });

  it('punctuation can no longer hide a copied run (F-2): commas, full stops and dashes inside an 8-word run are blocked', () => {
    const base = { studentAnswer: 'The wind pushes the water out.', scoreExplanation: 'No evaporation.', strengths: [], improvements: [] };
    for (const variant of [
      'Warmth gives the water particles more energy, so more of them escape as vapour.',
      'Warmth gives the water particles more energy. So more of them escape as vapour.',
      'Warmth gives the water particles more energy - so more of them escape!',
      'WARMTH GIVES THE WATER PARTICLES MORE ENERGY; SO MORE OF THEM ESCAPE',
    ]) expect(check({ ...base, feedback: variant }, 'v1'), variant).toBe('feedback_leak');
  });

  it('the student-wording exemption is not a loophole: runs beyond what the student wrote are still blocked', () => {
    const student = 'Warmth gives the water particles more energy.';
    const base = { studentAnswer: student, scoreExplanation: 'Partly right.', strengths: [], improvements: [] };
    // Quoting the student's own sentence back: allowed (it reveals nothing hidden).
    expect(check({ ...base, feedback: 'You wrote: warmth gives the water particles more energy. Good start.' }, 'v1')).toBe('passed');
    // Continuing into the hidden part of the model answer: blocked.
    expect(check({ ...base, feedback: 'Yes, warmth gives the water particles more energy, so more of them escape as vapour.' }, 'v1')).toBe('feedback_leak');
    // A student who wrote nothing gets no exemption at all.
    expect(check({ ...base, studentAnswer: 'No idea.', feedback: 'Warmth gives the water particles more energy so more of them escape.' }, 'v1')).toBe('feedback_leak');
  });
});

describe('P19.2 regression: the live unsafe release and the live safe releases', () => {
  const live = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures_p19_2_released.json'), 'utf8'));
  const q4: any = { ...question, modelAnswer: live.modelAnswers['4'], rubric: { criteria: [
    { id: 'c4p', title: 'Place value', maxPoints: 2, levels: [level('c4p0', 0), level('c4p1', 1), level('c4p2', 2)] },
    { id: 'c4r', title: 'Result', maxPoints: 2, levels: [level('c4r0', 0), level('c4r1', 1), level('c4r2', 2)] },
  ] } };
  function checkLive(cid: string) {
    const r = live.released[cid];
    const q = r.class === '4' ? q4 : question;
    const crit = q.rubric.criteria.map((c: any) => ({ criterionId: c.id, levelId: `${c.id}0`, points: 0 }));
    const answer: any = { questionId: 'q2', studentAnswer: r.studentAnswer, points: 0, maxPoints: 4, method: 'ai', criterionScores: crit, feedback: r.releasedText, scoreExplanation: 'x', strengths: [], improvements: [] };
    try {
      validateGrading({ attempt: { id: 'att', assignmentId: 'asg', assessmentId: 'asm', assessmentVersion: 1 } as any, assignment: { id: 'asg' }, version: { assessmentId: 'asm', version: 1 }, questions: [q], answers: [answer], evaluations: new Map([['q2', { attemptId: 'att', questionId: 'q2', status: 'proposed', points: 0, objectiveIds: [] } as any]]) });
      return 'passed';
    } catch (e: any) { return e.reason; }
  }

  it('C2-10 (released live by the old check, punctuation-split echo) is now blocked by the production check', () => {
    expect(live.released['C2-10'].unsafeByIndependentCondition).toBe(true);
    expect(checkLive('C2-10')).toBe('feedback_leak');
  });

  it('every live release that met the independent condition still passes (no new false positives on this sample)', () => {
    const safe = Object.keys(live.released).filter((c) => !live.released[c].unsafeByIndependentCondition);
    expect(safe.length).toBe(7);
    const outcome = Object.fromEntries(safe.map((c) => [c, checkLive(c)]));
    console.log(`P19_2_SAFE_CONTROLS ${JSON.stringify(outcome)}`);
    expect(Object.values(outcome).every((o) => o === 'passed'), JSON.stringify(outcome)).toBe(true);
  });
});
