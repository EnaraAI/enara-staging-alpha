import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// P21 C4: teaching effectiveness engine. Every learner and result here is
// SYNTHETIC (built to exercise the measurement rules); nothing is evidence of
// real-world effectiveness. Real local MongoDB; no AI provider.

let mongo: MongoMemoryServer;
let M: Record<string, mongoose.Model<any>>;
let impact: typeof import('../src/services/teachingImpact');
const S = 'p21i';
const DAY = 86_400_000;
const T0 = new Date('2026-09-01T09:00:00Z').getTime(); // plan starts here
const at = (d: number) => new Date(T0 + d * DAY);
let seq = 0;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['Student', 'LearningEvent', 'LearningEvidence', 'PedagogicalDecision', 'TeachingEpisode']) M[n] = (await import(`../src/models/${n}`))[n];
  M.Assessment = (await import('../src/models/Assessment')).Assessment as never;
  M.AssessmentAttempt = (await import('../src/models/AssessmentAttempt')).AssessmentAttempt as never;
  impact = await import('../src/services/teachingImpact');
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
});

// One assessment per (kind, difficulty) with 6 questions; each answer is one evidence row.
async function student(id: string, origin = 'live') {
  await M.Student.create({ id, name: `Synthetic ${id}`, email: `${id}@p21i.test`, grade: 'Grade 6', institutionId: S, batchId: 'b1', origin });
}
async function answer(studentId: string, o: { day: number; score: number; q: string; kind?: string; difficulty?: number; gradedBy?: 'rule' | 'ai' | 'teacher'; type?: string; attemptScore?: number; objectiveId?: string }) {
  const n = ++seq;
  const assessmentId = `asm-${o.kind ?? 'none'}-${o.difficulty ?? 0}`;
  if (!(await M.Assessment.exists({ id: assessmentId }))) {
    await M.Assessment.create({ id: assessmentId, title: assessmentId, subject: 'Maths', institutionId: S, ...(o.kind ? { assessmentKind: o.kind } : {}), questions: ['qA', 'qB', 'qC', 'qD', 'qE', 'qF', 'qG', 'qH'].map((id) => ({ id, type: 'short-answer', text: id, correctAnswer: 'x', ...(o.difficulty ? { difficulty: o.difficulty } : {}) })) });
  }
  const attemptId = `att-${studentId}-${o.kind ?? 'none'}-${o.day}`;
  if (!(await M.AssessmentAttempt.exists({ id: attemptId }))) {
    await M.AssessmentAttempt.create({ id: attemptId, assessmentId, assessmentTitle: assessmentId, subject: 'Maths', studentId, institutionId: S, status: 'submitted', submittedAt: at(o.day), score: o.attemptScore ?? 70, answers: [] });
  }
  await M.LearningEvent.create({ id: `le-${n}`, studentId, institutionId: S, type: 'question_answered', source: 'assessment', verified: true, gradedBy: o.gradedBy ?? 'rule', objectiveIds: [o.objectiveId ?? 'obj'], refs: { assessmentId, questionId: o.q, attemptId }, at: at(o.day) });
  await M.LearningEvidence.create({ id: `ev-${n}`, institutionId: S, studentId, objectiveId: o.objectiveId ?? 'obj', sourceEventId: `le-${n}`, evidenceType: o.type ?? 'independent_assessment', result: o.score >= 1 ? 'correct' : o.score <= 0 ? 'incorrect' : 'partially_correct', normalizedScore: o.score, reliabilityWeight: 1, evidenceVersion: 'evidence-v3', itemKey: `q:${assessmentId}:${o.q}`, occurredAt: at(o.day), recordedAt: at(o.day) });
}
async function decision(studentId: string, id: string, day: number, primary = 'direct_instruction', supporting = ['worked_example'], extra: Record<string, unknown> = {}) {
  await M.PedagogicalDecision.create({ id, institutionId: S, studentId, objectiveId: 'obj', targetObjectiveId: 'obj', strategyId: primary, strategyVersion: 2, reasonCodes: ['EMERGING'], supportingEvidenceIds: [], misconceptionIds: [], requiresReassessment: true, decisionVersion: 'ped-v2', registryVersion: 'reg-v2', supportingStrategyIds: supporting, masteryAtDecision: 0.4, masteryStatusAtDecision: 'emerging', channel: 'chat', at: at(day), ...extra });
}
const episode = async (id: string) => (await M.TeachingEpisode.findOne({ id }).lean()) as any;
const NOW = at(200);

describe('baseline, post-intervention, improvement, evidence quality', () => {
  it('comparable improvement (same kind, grading, difficulty; new questions): associated, strong, never causal', async () => {
    await student('s1');
    for (const [d, q, sc] of [[-20, 'qA', 0.4], [-15, 'qB', 0.3], [-10, 'qC', 0.5]] as const) await answer('s1', { day: d, q, score: sc, kind: 'unit_test', difficulty: 3 });
    await decision('s1', 'pd-1', 0);
    for (const [d, q, sc] of [[5, 'qD', 0.8], [8, 'qE', 0.9], [12, 'qF', 0.7]] as const) await answer('s1', { day: d, q, score: sc, kind: 'unit_test', difficulty: 3 });
    await impact.recomputeStudentEpisodes('s1', NOW);
    const e = await episode('ep-pd-1');
    expect(e).toMatchObject({ label: 'associated_with_intervention', evidenceQuality: 'strong', primary: 'direct_instruction', supporting: ['worked_example'] });
    expect(e.baseline).toMatchObject({ n: 3, items: 3, score: 0.4 });
    expect(e.post).toMatchObject({ n: 3, items: 3, score: 0.8 });
    expect(e.observedChange).toBeCloseTo(0.4);
    expect(e.transfer.n, 'all post questions were new to the student').toBe(3);
    expect(e.comparability).toEqual(['outside_instruction_unknown']);
    expect(e.limitations.join(' ')).toMatch(/cannot be attributed/);
  });

  it('missing baseline: insufficient evidence (historical baseline needed, not invented)', async () => {
    await student('s2');
    await decision('s2', 'pd-2', 0);
    await answer('s2', { day: 3, q: 'qA', score: 0.9, kind: 'quiz' });
    await impact.recomputeStudentEpisodes('s2', NOW);
    expect(await episode('ep-pd-2')).toMatchObject({ label: 'insufficient_evidence', evidenceQuality: 'none', observedChange: null });
  });

  it('historical exams establish the baseline even though no method was attributed then', async () => {
    await student('s3');
    for (const [d, q] of [[-80, 'qA'], [-60, 'qB']] as const) await answer('s3', { day: d, q, score: 0.2, kind: 'quiz', difficulty: 2 });
    await decision('s3', 'pd-3', 0);
    for (const [d, q] of [[4, 'qC'], [6, 'qD']] as const) await answer('s3', { day: d, q, score: 0.6, kind: 'quiz', difficulty: 2 });
    await impact.recomputeStudentEpisodes('s3', NOW);
    const e = await episode('ep-pd-3');
    expect(e.baseline.n).toBe(2);
    expect(e.comparability).toContain('long_gap'); // 60+ days between last baseline and first post
    expect(e.label).toBe('observed_change');
  });
});

describe('misleading apparent improvement is not reported as associated', () => {
  it('easier questions afterwards: difficulty_shift -> observed_change (weak)', async () => {
    await student('s4');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s4', { day: d, q, score: 0.3, kind: 'unit_test', difficulty: 4 });
    await decision('s4', 'pd-4', 0);
    for (const [d, q] of [[3, 'qC'], [4, 'qD']] as const) await answer('s4', { day: d, q, score: 1, kind: 'unit_test', difficulty: 1 });
    await impact.recomputeStudentEpisodes('s4', NOW);
    expect(await episode('ep-pd-4')).toMatchObject({ label: 'observed_change', evidenceQuality: 'weak' });
    expect((await episode('ep-pd-4')).comparability).toContain('difficulty_shift');
  });
  it('the same questions again: repeated_items', async () => {
    await student('s5');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s5', { day: d, q, score: 0.3, kind: 'quiz', difficulty: 2 });
    await decision('s5', 'pd-5', 0);
    for (const [d, q] of [[3, 'qA'], [4, 'qB']] as const) await answer('s5', { day: d, q, score: 1, kind: 'quiz', difficulty: 2 });
    await impact.recomputeStudentEpisodes('s5', NOW);
    const e = await episode('ep-pd-5');
    expect(e.comparability).toContain('repeated_items');
    expect(e.label).toBe('observed_change');
    expect(e.transfer.n).toBe(0);
  });
  it('grading method changed (answer key -> AI) and different assessment kinds are flagged', async () => {
    await student('s6');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s6', { day: d, q, score: 0.3, kind: 'quiz', difficulty: 2, gradedBy: 'rule' });
    await decision('s6', 'pd-6', 0);
    for (const [d, q] of [[3, 'qC'], [4, 'qD']] as const) await answer('s6', { day: d, q, score: 0.9, kind: 'final', difficulty: 2, gradedBy: 'ai' });
    await impact.recomputeStudentEpisodes('s6', NOW);
    const e = await episode('ep-pd-6');
    expect(e.comparability).toEqual(expect.arrayContaining(['grading_method_changed', 'assessment_kind_differs']));
    expect(e.label).toBe('observed_change');
  });
  it('one question on either side is too few', async () => {
    await student('s7');
    await answer('s7', { day: -3, q: 'qA', score: 0, kind: 'quiz', difficulty: 2 });
    await decision('s7', 'pd-7', 0);
    await answer('s7', { day: 3, q: 'qB', score: 1, kind: 'quiz', difficulty: 2 });
    await impact.recomputeStudentEpisodes('s7', NOW);
    expect((await episode('ep-pd-7')).comparability).toContain('few_items');
  });
});

describe('decline, retention, mastery and exams', () => {
  it('a decline is reported as a negative change, not hidden', async () => {
    await student('s8');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s8', { day: d, q, score: 0.8, kind: 'quiz', difficulty: 2 });
    await decision('s8', 'pd-8', 0);
    for (const [d, q] of [[3, 'qC'], [4, 'qD']] as const) await answer('s8', { day: d, q, score: 0.4, kind: 'quiz', difficulty: 2 });
    await impact.recomputeStudentEpisodes('s8', NOW);
    expect((await episode('ep-pd-8')).observedChange).toBeCloseTo(-0.4);
  });
  it('improves immediately but fails retention (7+ days later)', async () => {
    await student('s9');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s9', { day: d, q, score: 0.3, kind: 'quiz', difficulty: 2 });
    await decision('s9', 'pd-9', 0);
    for (const [d, q] of [[2, 'qC'], [3, 'qD']] as const) await answer('s9', { day: d, q, score: 0.9, kind: 'quiz', difficulty: 2 });
    for (const [d, q] of [[20, 'qE'], [21, 'qF']] as const) await answer('s9', { day: d, q, score: 0.2, kind: 'retention_check', difficulty: 2, type: 'retention_review' });
    await impact.recomputeStudentEpisodes('s9', NOW);
    const e = await episode('ep-pd-9');
    expect(e.observedChange).toBeCloseTo(0.6);
    expect(e.retention.n).toBe(2);
    expect(e.retention.delayDays).toBeGreaterThanOrEqual(7);
    expect(e.retentionChange).toBeCloseTo(-0.1);
  });
  it('overall exam score is kept apart from the objective-level score', async () => {
    await student('s10');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s10', { day: d, q, score: 0.5, kind: 'unit_test', difficulty: 2 });
    await decision('s10', 'pd-10', 0);
    for (const q of ['qC', 'qD'] as const) await answer('s10', { day: 5, q, score: 1, kind: 'unit_test', difficulty: 2, attemptScore: 55 });
    await impact.recomputeStudentEpisodes('s10', NOW);
    const e = await episode('ep-pd-10');
    expect(e.exams).toHaveLength(1);
    expect(e.exams[0]).toMatchObject({ assessmentKind: 'unit_test', overallScore: 0.55, objectiveScore: 1 });
  });
  it('tutor practice and assisted work never count as evidence', async () => {
    await student('s11');
    for (const [d, q] of [[-9, 'qA'], [-8, 'qB']] as const) await answer('s11', { day: d, q, score: 0.3, kind: 'quiz', difficulty: 2 });
    await decision('s11', 'pd-11', 0);
    for (const [d, q] of [[3, 'qC'], [4, 'qD']] as const) await answer('s11', { day: d, q, score: 1, kind: 'quiz', difficulty: 2, type: 'guided_practice' });
    await impact.recomputeStudentEpisodes('s11', NOW);
    expect(await episode('ep-pd-11')).toMatchObject({ label: 'insufficient_evidence', post: { n: 0 } });
  });
});

describe('episodes, recompute and historical trend', () => {
  it('consecutive identical plans merge; a different plan starts a new episode that ends the previous', async () => {
    await student('s12');
    await decision('s12', 'pd-a', 0);
    await decision('s12', 'pd-b', 2); // same composition: merged
    await decision('s12', 'pd-c', 10, 'worked_example', ['think_aloud']);
    await impact.recomputeStudentEpisodes('s12', NOW);
    const eps: any[] = await M.TeachingEpisode.find({ studentId: 's12' }).sort({ startAt: 1 }).lean();
    expect(eps.map((e) => [e.id, e.decisionIds])).toEqual([['ep-pd-a', ['pd-a', 'pd-b']], ['ep-pd-c', ['pd-c']]]);
    expect(eps[0].endAt).toEqual(at(10));
  });
  it('recompute is idempotent and only writes derived records', async () => {
    await student('s13', 'demo_seed');
    await answer('s13', { day: -3, q: 'qA', score: 0.1 });
    await decision('s13', 'pd-13', 0);
    const evBefore = await M.LearningEvidence.countDocuments({});
    await impact.recomputeStudentEpisodes('s13', NOW);
    await impact.recomputeStudentEpisodes('s13', NOW);
    expect(await M.TeachingEpisode.countDocuments({ studentId: 's13' })).toBe(1);
    expect(await M.LearningEvidence.countDocuments({})).toBe(evBefore);
    expect(await M.PedagogicalDecision.countDocuments({ studentId: 's13' })).toBe(1);
    expect((await episode('ep-pd-13')).origin, 'demo students stay labelled demo').toBe('demo_seed');
  });
  it('historical trend without any teaching attribution is only ever "observed_change" or insufficient', async () => {
    await student('s14');
    for (const [d, q, sc] of [[-50, 'qA', 0.2], [-40, 'qB', 0.3], [-10, 'qC', 0.8], [-5, 'qD', 0.9]] as const) await answer('s14', { day: d, q, score: sc, kind: 'quiz', difficulty: 2 });
    const t = await impact.objectiveEvidenceTrend('s14', 'obj');
    expect(t).toMatchObject({ n: 4, label: 'observed_change' });
    expect(t.change).toBeCloseTo(0.6);
    expect((await impact.objectiveEvidenceTrend('s14', 'other-objective')).label).toBe('insufficient_evidence');
  });
  it('the label vocabulary has no causal claim', async () => {
    const schemaLabels = (M.TeachingEpisode.schema.path('label') as any).enumValues;
    expect(schemaLabels).toEqual(['insufficient_evidence', 'observed_change', 'associated_with_intervention']);
  });
});
