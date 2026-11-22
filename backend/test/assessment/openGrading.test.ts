import { describe, expect, it, vi, beforeEach } from 'vitest';

// Assessment engine P2a: open answers graded by the domain graders (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3, §7).
// The model call (askForJson) and the proposal store are mocked: these tests check what the model is given, what is accepted back,
// and how two runs become one grade with flags.

const calls: { system: string; user: string }[] = [];
let replies: unknown[] = [];
vi.mock('../../src/services/aiJson', () => ({
  askForJson: vi.fn(async (p: { system: string; user: string; allowFallback?: boolean; validate: (v: unknown) => unknown }) => {
    calls.push({ system: p.system, user: p.user, ...('allowFallback' in p ? { allowFallback: p.allowFallback } : {}) });
    const raw = replies.shift();
    if (raw instanceof Error) throw raw;
    return { value: p.validate(raw), model: 'test-model' };
  }),
  isAiConfigured: () => true,
}));
vi.mock('../../src/models/GradingProposal', () => ({ GradingProposal: { create: vi.fn(async (d: { id: string }) => ({ ...d })) } }));

const { gradeOpenRun, checkExtras, splitMathAnswer, finalAnswerPoints, ERROR_CODES } = await import('../../src/assessment/grading-engine/graders/domains');
const { combineRuns, gradeOpenAnswer, nearPassMark } = await import('../../src/assessment/grading-engine/open');
const { rubricFor, totalPoints, modelCriteria } = await import('../../src/assessment/rubrics/templates');
const { checkEngineQuestion, isOpenEngine, describeKey, forLearner } = await import('../../src/assessment/questionBridge');

const attempt = { id: 'att-1', institutionId: 'sch-1', assignmentId: 'asg-1' };
const essayItem = { questionId: 'q1', stem: 'Write about your family.', type: 'essay' as const, domain: 'language' as const, language: 'en' };
const essayAnswer = 'I have two brothers. My mother is a teacher and we go to the park every Friday.';
const goodEssay = (over: Record<string, unknown> = {}) => ({
  criteria: ['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics'].map((c) => ({ criterionId: c, levelId: 'p2', evidence: ['My mother is a teacher'], rationale: 'ok' })),
  errorCodes: [], confidence: 0.9, scoreExplanation: 'Clear and accurate.', strengths: ['Clear'], improvements: ['Add detail'], feedback: 'Well done. Next time add one more detail.', flags: [], ...over,
});

beforeEach(() => { calls.length = 0; replies = []; });

describe('rubric templates', () => {
  it('give today\'s rubric shape in the item\'s language, with integer levels', () => {
    const en = rubricFor('language', 'essay', 'en')!;
    expect(en.criteria.map((c) => c.id)).toEqual(['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']);
    expect(en.criteria[0].levels.map((l) => l.points)).toEqual([0, 1, 2]);
    expect(rubricFor('language', 'essay', 'ar')!.criteria[0].title).toBe('إنجاز المطلوب');
    expect(totalPoints('language', 'essay')).toBe(10);
    expect(totalPoints('math', 'math_steps')).toBe(7);
    expect(modelCriteria('math', 'math_steps')).toEqual(['method_choice', 'execution', 'representation']);
    expect(rubricFor('history', 'essay')).toBeNull();
  });
});

describe('teacher checks for open engine questions', () => {
  it('accept language and maths items, attach the fixed rubric and points', () => {
    const r = checkEngineQuestion({ id: 'q1', type: 'engine', text: 'Write', engine: { type: 'essay', domain: 'language', language: 'ar' } } as never);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.points).toBe(10); expect(r.rubric?.criteria[0].title).toBe('إنجاز المطلوب'); }
    const m = checkEngineQuestion({ id: 'q2', type: 'engine', text: 'Area?', engine: { type: 'math_steps', domain: 'math', language: 'en', answer_key: { final: { value: 24, unit: 'cm^2' }, solution: '4 x 6 = 24' } } } as never);
    expect(m.ok).toBe(true);
    expect(checkEngineQuestion({ id: 'q3', type: 'engine', text: 'x', engine: { type: 'math_steps', domain: 'math', language: 'en' } } as never).ok).toBe(false);
    expect(checkEngineQuestion({ id: 'q4', type: 'engine', text: 'x', engine: { type: 'essay', domain: 'math', language: 'en' } } as never).ok).toBe(false);
    expect(isOpenEngine({ type: 'engine', engine: { type: 'essay' } })).toBe(true);
    expect(isOpenEngine({ type: 'engine', engine: { type: 'mcq' } })).toBe(false);
    expect(describeKey({ id: 'q2', type: 'engine', text: 'x', engine: { type: 'math_steps', language: 'en', answer_key: { final: { value: 24, unit: 'cm^2' } } } } as never)).toBe('24 cm^2');
  });
});

describe('what the model receives', () => {
  it('only the item, the rubric, the answer and the screen language: no learner id, name, class or history', async () => {
    replies = [goodEssay()];
    const r = await gradeOpenRun({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', run: 1 });
    expect(r.status).toBe('proposed');
    const user = JSON.parse(calls[0].user);
    expect(Object.keys(user).sort()).toEqual(['answer', 'item', 'rubric', 'uiLanguage']);
    expect(calls[0].user).not.toMatch(/att-1|sch-1|asg-1|studentId|name/);
    expect(r.points).toBe(10);
    expect(r.confidence).toBe(0.9);
  });
  it('bench runs: never retried on the fallback provider, nothing stored as a proposal; learner runs keep both', async () => {
    const { GradingProposal } = await import('../../src/models/GradingProposal');
    const create = GradingProposal.create as unknown as ReturnType<typeof vi.fn>;
    replies = [goodEssay()];
    create.mockClear();
    const r = await gradeOpenRun({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', run: 1, options: { store: false, allowFallback: false } });
    expect(r.status).toBe('proposed');
    expect((calls[calls.length - 1] as unknown as { allowFallback?: boolean }).allowFallback).toBe(false);
    expect(create).not.toHaveBeenCalled();
    replies = [goodEssay()];
    await gradeOpenRun({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', run: 1 });
    expect((calls[calls.length - 1] as unknown as { allowFallback?: boolean }).allowFallback).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('maths: the final answer is scored by code and the model is told; method points without a right final answer', async () => {
    const item = { questionId: 'q2', stem: 'A rectangle is 4 cm by 6 cm. Area?', type: 'math_steps' as const, domain: 'math' as const, language: 'en', final: { value: 24, unit: 'cm^2' }, solution: '4 x 6 = 24' };
    replies = [{ criteria: [{ criterionId: 'method_choice', levelId: 'p2', evidence: ['4 x 6'], rationale: '' }, { criterionId: 'execution', levelId: 'p1', evidence: ['4 x 6'], rationale: '' }, { criterionId: 'representation', levelId: 'p1', evidence: ['4 x 6'], rationale: '' }], errorCodes: ['arithmetic'], confidence: 0.8, scoreExplanation: 'Right method, slip.', strengths: [], improvements: [], feedback: 'Check your multiplication.', flags: [] }];
    const r = await gradeOpenRun({ attempt, item, answer: JSON.stringify({ steps: 'area = 4 x 6 = 26', final: '26 cm^2' }), uiLanguage: 'en', run: 1 });
    expect(JSON.parse(calls[0].user).finalAnswerCorrect).toBe(false);
    expect(JSON.parse(calls[0].user).item.workedSolutionForGraderOnly).toBe('4 x 6 = 24');
    expect(r.criterionScores.find((c) => c.criterionId === 'final_answer')).toMatchObject({ points: 0 });
    expect(r.points).toBe(4);
  });
});

describe('model replies are checked', () => {
  it('refuses unknown error codes, a non-number confidence, and feedback in the wrong language', () => {
    expect(() => checkExtras({ confidence: 0.8, errorCodes: ['made_up'], feedback: 'ok' }, 'language', 'en')).toThrow(/unknown error codes/);
    expect(() => checkExtras({ confidence: 'high', feedback: 'ok' }, 'language', 'en')).toThrow(/confidence/);
    expect(() => checkExtras({ confidence: 0.8, feedback: 'Good work' }, 'language', 'ar')).toThrow(/Arabic/);
    expect(() => checkExtras({ confidence: 0.8, feedback: 'أحسنت' }, 'language', 'en')).toThrow(/English/);
    expect(checkExtras({ confidence: 0.8, errorCodes: ['gender_agreement', 'gender_agreement'], feedback: 'أحسنت' }, 'language', 'ar')).toEqual({ confidence: 0.8, errorCodes: ['gender_agreement'] });
    expect(ERROR_CODES.language).toContain('case_ending');
  });
  it('points must rest on quotes from the answer (the existing rubric rule): an invented quote is a failed run, never a grade', async () => {
    replies = [goodEssay({ criteria: goodEssay().criteria.map((c) => ({ ...c, evidence: ['words the learner never wrote'] })) })];
    const r = await gradeOpenRun({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', run: 1 });
    expect(r.status).not.toBe('proposed');
    expect(r.points).toBe(0);
  });
});

describe('two runs become one grade, with flags', () => {
  const max = { task_completion: 2, grammar_accuracy: 2, vocabulary_range: 2, organisation: 2, mechanics: 2 };
  const run = (points: number[], confidence = 0.9, flags: string[] = []) => ({ proposalId: 'p', status: 'proposed' as const, criterionScores: Object.keys(max).map((c, i) => ({ criterionId: c, levelId: `p${points[i]}`, points: points[i] })), points: points.reduce((a, b) => a + b, 0), confidence, errorCodes: ['article'], feedback: 'f', scoreExplanation: 's', strengths: [], improvements: [], flags, modelName: 'm' });
  it('agreeing, confident runs: not flagged; criteria with reason codes', () => {
    const g = combineRuns([run([2, 1, 2, 2, 1]), run([2, 2, 2, 1, 1])], max);
    expect(g).toMatchObject({ points: 8, maxPoints: 10, flagged: false, grader: 'model:m', errorCodes: ['article'] });
    expect(g.criteria.map((c) => c.reasonCode)).toEqual(['met', 'partly_met', 'met', 'met', 'partly_met']);
  });
  it('flags low confidence, runs more than 1 point apart on a criterion, and integrity', () => {
    expect(combineRuns([run([2, 2, 2, 2, 2], 0.6), run([2, 2, 2, 2, 2])], max).flagReasons).toEqual(['low_confidence']);
    expect(combineRuns([run([2, 2, 2, 2, 2]), run([0, 2, 2, 2, 2])], max).flagReasons).toEqual(['runs_disagree']);
    expect(combineRuns([run([2, 2, 2, 2, 2], 0.9, ['possible_integrity_issue']), run([2, 2, 2, 2, 2])], max).flagReasons).toEqual(['integrity']);
  });
  it('no usable run: a flagged blank grade for the teacher (no score invented)', async () => {
    const g = await gradeOpenAnswer({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', maxByCriterion: max, modelReady: false });
    expect(g).toMatchObject({ points: 0, flagged: true, flagReasons: ['model_unavailable'], grader: 'none' });
    expect(calls).toHaveLength(0);
    replies = [new Error('boom'), new Error('boom')];
    const h = await gradeOpenAnswer({ attempt, item: essayItem, answer: essayAnswer, uiLanguage: 'en', maxByCriterion: max, modelReady: true });
    expect(h).toMatchObject({ flagged: true, flagReasons: ['model_error'], grader: 'none' });
  });
  it('one failed run of two: the other is used, flagged for the teacher', () => {
    const g = combineRuns([{ ...run([2, 2, 2, 2, 2]), status: 'failed' as const }, run([2, 2, 1, 2, 2])], max);
    expect(g).toMatchObject({ points: 9, flagged: true, flagReasons: ['model_error'] });
  });
  it('near the pass mark (within 1 point)', () => {
    expect(nearPassMark(6, 10, 60)).toBe(true);
    expect(nearPassMark(7, 10, 60)).toBe(true);
    expect(nearPassMark(8, 10, 60)).toBe(false);
    expect(nearPassMark(5, 10, undefined)).toBe(false);
  });
});

describe('maths answers', () => {
  it('splits steps and final answer; the final is checked by code with units and Arabic digits', () => {
    expect(splitMathAnswer('{"steps":"a","final":"b"}')).toEqual({ steps: 'a', final: 'b' });
    expect(splitMathAnswer('just text')).toEqual({ steps: 'just text', final: '' });
    const item = { questionId: 'q', stem: 's', type: 'math_steps' as const, domain: 'math' as const, language: 'ar', final: { value: 120, unit: 'سم' } };
    expect(finalAnswerPoints(item, '١٢٠ سم')).toEqual({ points: 2, correct: true, unitIssue: false });
    expect(finalAnswerPoints(item, '120')).toEqual({ points: 1, correct: false, unitIssue: true });
    expect(finalAnswerPoints(item, '100 سم')).toEqual({ points: 0, correct: false, unitIssue: false });
    expect(finalAnswerPoints(item, '')).toEqual({ points: 0, correct: false, unitIssue: false });
  });
});

describe('P3a: science and humanities (checklist rubrics built per item)', () => {
  const sciPoints = ['Plants make glucose by photosynthesis', 'Light energy is needed'];
  it('science: one 0-1 criterion per content point, then reasoning and terms; units only when the item asks', () => {
    const r = rubricFor('science', 'short_answer', 'en', { points: sciPoints })!;
    expect(r.criteria.map((c) => c.id)).toEqual(['point_1', 'point_2', 'reasoning', 'terminology']);
    expect(r.criteria[0]).toMatchObject({ title: sciPoints[0], maxPoints: 1 });
    expect(totalPoints('science', 'short_answer', { points: sciPoints })).toBe(5);
    expect(totalPoints('science', 'essay', { points: sciPoints, units: true })).toBe(6);
    expect(rubricFor('science', 'essay', 'ar', { points: sciPoints, units: true })!.criteria.map((c) => c.id)).toContain('units');
  });
  it('humanities: required points, accuracy against the source, structure (0-1 short, 0-2 essay)', () => {
    expect(rubricFor('humanities', 'essay', 'en', { points: ['a1', 'b2', 'c3'] })!.criteria.map((c) => `${c.id}:${c.maxPoints}`)).toEqual(['point_1:1', 'point_2:1', 'point_3:1', 'accuracy_vs_source:2', 'structure:2']);
    expect(totalPoints('humanities', 'short_answer', { points: ['a1', 'b2'] })).toBe(5);
  });
  it('a teacher\'s question: science needs content points, humanities needs a source; the rubric and points come from the item', () => {
    const sci = checkEngineQuestion({ id: 'q', type: 'engine', text: 'Why do plants need light?', engine: { type: 'short_answer', domain: 'science', language: 'en', answer_key: { content_points: sciPoints } } as never });
    expect(sci.ok && sci.points).toBe(5);
    const noPoints = checkEngineQuestion({ id: 'q', type: 'engine', text: 'Why?', engine: { type: 'short_answer', domain: 'science', language: 'en', answer_key: {} } as never });
    expect(noPoints.ok).toBe(false);
    const noSource = checkEngineQuestion({ id: 'q', type: 'engine', text: 'Why?', engine: { type: 'essay', domain: 'humanities', language: 'ar', answer_key: { required_points: ['نقطة أولى'] } } as never });
    expect(noSource.ok).toBe(false);
    const hum = checkEngineQuestion({ id: 'q', type: 'engine', text: 'Why was the canal built?', engine: { type: 'essay', domain: 'humanities', language: 'en', source: 'The canal was opened in 1869 to join the Mediterranean and the Red Sea, shortening the trip to Asia.', answer_key: { required_points: ['opened in 1869', 'joins two seas', 'shorter trip to Asia'] } } as never });
    expect(hum.ok && hum.points).toBe(7);
    expect(describeKey({ id: 'q', type: 'engine', text: 't', engine: { type: 'short_answer', domain: 'science', language: 'en', answer_key: { content_points: sciPoints } } as never })).toBe(sciPoints.join(' · '));
  });
  it('humanities: the model gets the source and is told to judge only against it; science error codes are accepted', async () => {
    replies = [{ criteria: [{ criterionId: 'point_1', levelId: 'p1', evidence: ['in 1869'], rationale: 'ok' }, { criterionId: 'accuracy_vs_source', levelId: 'p2', evidence: ['in 1869'], rationale: 'ok' }, { criterionId: 'structure', levelId: 'p1', evidence: ['It opened in 1869'], rationale: 'ok' }], errorCodes: ['unsupported_claim'], confidence: 0.8, scoreExplanation: 'Good.', strengths: [], improvements: [], feedback: 'Good use of the source.', flags: [] }];
    const item = { questionId: 'q', stem: 'When did the canal open?', type: 'short_answer' as const, domain: 'humanities' as const, language: 'en', points: ['opened in 1869'], source: 'The canal was opened in 1869 to join the Mediterranean and the Red Sea.' };
    const r = await gradeOpenRun({ attempt, item, answer: 'It opened in 1869.', uiLanguage: 'en', run: 1 });
    expect(r.status).toBe('proposed');
    expect(r.points).toBe(4);
    expect(calls[0].system).toMatch(/ONLY against the source/);
    expect(JSON.parse(calls[0].user).item.source).toContain('opened in 1869');
    expect(checkExtras({ confidence: 0.8, errorCodes: ['misconception'], feedback: 'ok' }, 'science', 'en').errorCodes).toEqual(['misconception']);
    expect(() => checkExtras({ confidence: 0.8, errorCodes: ['arithmetic'], feedback: 'ok' }, 'science', 'en')).toThrow(/unknown error codes/);
  });
});

describe('P3b: listening (a recording; answers judged against its transcript)', () => {
  const audio = { url: 'https://media.example.org/a.mp3', transcript: 'Attention please. The school trip leaves at half past eight from the main gate.' };
  it('a listening question needs a recording with a transcript; points from the key; the learner gets the address only', () => {
    const ok = checkEngineQuestion({ id: 'q', type: 'engine', text: 'When and where does the trip leave?', engine: { type: 'short_answer', domain: 'listening', language: 'en', audio, answer_key: { required_points: ['half past eight', 'main gate'] } } as never });
    expect(ok.ok && ok.points).toBe(5);
    if (!ok.ok) return;
    expect(ok.rubric!.criteria.map((c) => c.id)).toEqual(['point_1', 'point_2', 'accuracy_vs_source', 'structure']);
    const learner = forLearner({ id: 'q', type: 'engine', text: 't', engine: ok.engine } as never) as { engine: Record<string, unknown> };
    expect(learner.engine.audio).toEqual({ url: audio.url });
    expect(JSON.stringify(learner)).not.toMatch(/half past eight|main gate|required_points/);
    const bad = checkEngineQuestion({ id: 'q', type: 'engine', text: 't', engine: { type: 'short_answer', domain: 'listening', language: 'en', audio: { url: 'http://insecure/a.mp3', transcript: audio.transcript }, answer_key: { required_points: ['x1'] } } as never });
    expect(bad.ok).toBe(false);
  });
  it('a closed item may carry a recording too (checked; transcript hidden from the learner)', () => {
    const c = checkEngineQuestion({ id: 'q', type: 'engine', text: 'The trip leaves at 8:30.', points: 1, engine: { type: 'true_false', language: 'en', answer_key: { value: true }, audio } as never });
    expect(c.ok && (c.engine as { audio?: unknown }).audio).toEqual(audio);
    const l = forLearner({ id: 'q', type: 'engine', text: 't', engine: (c as { engine: unknown }).engine } as never) as { engine: { audio?: unknown } };
    expect(l.engine.audio).toEqual({ url: audio.url });
  });
  it('the model gets the transcript as the source and is told not to mark spelling', async () => {
    replies = [{ criteria: [{ criterionId: 'point_1', levelId: 'p1', evidence: ['half past eight'], rationale: 'ok' }, { criterionId: 'accuracy_vs_source', levelId: 'p2', evidence: ['half past eight'], rationale: 'ok' }, { criterionId: 'structure', levelId: 'p1', evidence: ['half past eight'], rationale: 'ok' }], errorCodes: [], confidence: 0.9, scoreExplanation: 'ok', strengths: [], improvements: [], feedback: 'Well heard.', flags: [] }];
    const r = await gradeOpenRun({ attempt, item: { questionId: 'q', stem: 'When?', type: 'short_answer', domain: 'listening', language: 'en', points: ['half past eight'], source: audio.transcript }, answer: 'It leevs at half past eight.', uiLanguage: 'en', run: 1 });
    expect(r.points).toBe(4);
    expect(calls[0].system).toMatch(/not mark spelling or grammar|Do NOT mark spelling/);
    expect(JSON.parse(calls[0].user).item.source).toContain('main gate');
  });
});
