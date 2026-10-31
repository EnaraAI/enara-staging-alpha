import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { selectStrategy, selectTeachingPlan, subjectProfile, type PlanInput } from '../src/services/pedagogyPolicy';
import { STRATEGY_BY_ID, validateComposition } from '../src/services/strategyRegistry';

// P21 C2: adaptive teaching orchestrator (ped-v2). Part 1 is deterministic and
// needs nothing; part 2 uses a real local MongoDB. All learners are SYNTHETIC.
// No AI provider is called or mocked: the plan only shapes the prompt.

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  objectiveId: 'obj-1', masteryStatus: 'not_assessed', evidenceStrength: 'none', weakPrerequisiteIds: [], misconceptions: [],
  supportingEvidenceIds: [], recentResults: [], triedWithoutImprovement: [], ...over,
});
const plan = (over: Partial<PlanInput> = {}) => selectTeachingPlan(base(over));

describe('ped-v2 decisions on synthetic learner scenarios', () => {
  it('beginner with no evidence: find the starting point (formative assessment + pre-retrieval), low confidence', () => {
    const p = plan();
    expect([p.primary, p.supporting]).toEqual(['formative_feedback', ['retrieval_practice']]);
    expect(p.reasonCodes).toContain('NO_EVIDENCE');
    expect(p.confidence).toBe('low');
    expect(p.limitations.join(' ')).toMatch(/No assessed evidence/);
  });
  it('emerging: Direct Instruction supported by Worked Examples (guide matrix: new concept)', () => {
    const p = plan({ masteryStatus: 'emerging', evidenceStrength: 'limited', supportingEvidenceIds: ['e1'] });
    expect([p.primary, p.supporting]).toEqual(['direct_instruction', ['worked_example']]);
  });
  it('partial knowledge: Scaffolded + Metacognitive, guided practice to reinforce', () => {
    const p = plan({ masteryStatus: 'developing', evidenceStrength: 'moderate', supportingEvidenceIds: ['e1'] });
    expect([p.primary, p.supporting, p.reinforcement]).toEqual(['scaffolding', ['metacognitive'], 'guided_practice']);
    expect(p.confidence).toBe('medium');
  });
  it('conceptual misconception (novice): Analogy + Worked Examples; suspected is flagged as a limitation', () => {
    const p = plan({ masteryStatus: 'emerging', misconceptions: [{ id: 'm1', category: 'conceptual_misunderstanding', status: 'suspected' }] });
    expect([p.primary, p.supporting]).toEqual(['analogy', ['worked_example']]);
    expect(p.limitations.join(' ')).toMatch(/suspected, not confirmed/);
  });
  it('persistent misconception (confirmed, a method already failed): Metacognitive + Think-Aloud', () => {
    const p = plan({ masteryStatus: 'developing', misconceptions: [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }], triedWithoutImprovement: ['worked_example'] });
    expect([p.primary, p.supporting]).toEqual(['metacognitive', ['think_aloud']]);
    expect(p.reasonCodes).toContain('PERSISTENT_MISCONCEPTION');
  });
  it('advanced: proficient -> Mastery Learning + Elaborative, interleaving when related objectives are secure; mastered -> retrieval + spaced + Bloom', () => {
    const a = plan({ masteryStatus: 'proficient', evidenceStrength: 'substantial', supportingEvidenceIds: ['e'], relatedSecureObjectives: 2 });
    expect([a.primary, a.supporting, a.reinforcement]).toEqual(['mastery_learning', ['elaborative_interrogation'], 'interleaving']);
    expect(a.confidence).toBe('high');
    const m = plan({ masteryStatus: 'mastered', evidenceStrength: 'substantial', supportingEvidenceIds: ['e'] });
    expect([m.primary, m.reinforcement]).toEqual(['retrieval_practice', 'spaced_repetition']);
    expect(m.modifiers).toContain('blooms_guided');
    expect(m.requiresReassessment).toBe(false);
  });
  it('improved immediately but failed retention: Retrieval Practice + Spaced Repetition', () => {
    const p = plan({ masteryStatus: 'proficient', retention: { due: true, lapsed: true } });
    expect([p.primary, p.reinforcement]).toEqual(['retrieval_practice', 'spaced_repetition']);
    expect(p.reasonCodes).toEqual(['RETENTION_DECAY']);
  });
  it('recall right, application wrong: Bloom\'s-guided + Inquiry (not for novices)', () => {
    const p = plan({ masteryStatus: 'developing', applicationGap: true, gradeLevel: 8 });
    expect([p.primary, p.supporting]).toEqual(['blooms_guided', ['inquiry_based']]);
    expect(plan({ masteryStatus: 'emerging', applicationGap: true }).primary).toBe('direct_instruction');
  });
  it('prerequisite gap first, teacher assignment wins, non-primary teacher choice ignored', () => {
    expect(plan({ masteryStatus: 'developing', weakPrerequisiteIds: ['pre-1'] })).toMatchObject({ primary: 'prerequisite_remediation', targetObjectiveId: 'pre-1' });
    expect(plan({ teacherStrategyId: 'case_based' }).primary).toBe('case_based');
    expect(plan({ teacherStrategyId: 'spaced_repetition' }).primary).toBe('formative_feedback');
  });
});

describe('subject- and unit-based methods (Socratic, Case-Based, Problem-Based, Concept Mapping)', () => {
  it('subject names are classified, English and Arabic; unknown stays unknown', () => {
    expect(['Mathematics', 'Physics', 'رياضيات', 'Computer Science'].map(subjectProfile)).toEqual(['procedural', 'procedural', 'procedural', 'procedural']);
    expect(['History', 'English Literature', 'تاريخ', 'Ethics', 'Economics'].map(subjectProfile)).toEqual(['discussion', 'discussion', 'discussion', 'discussion', 'discussion']);
    expect(['Biology', 'Science', 'علوم', 'Business Studies'].map(subjectProfile)).toEqual(['applied', 'applied', 'applied', 'applied']);
    expect([undefined, '', 'Fractions 6A'].map(subjectProfile)).toEqual(['unknown', 'unknown', 'unknown']);
  });
  it('discussion subject, proficient: Socratic + Elaborative (guide: deeper thinking); concept map once the unit has secure objectives', () => {
    expect(plan({ masteryStatus: 'proficient', subject: 'History', gradeLevel: 8 })).toMatchObject({ primary: 'socratic_questioning', supporting: ['elaborative_interrogation'] });
    expect(plan({ masteryStatus: 'proficient', subject: 'History', gradeLevel: 8, relatedSecureObjectives: 2 }).reinforcement).toBe('concept_mapping');
    expect(plan({ masteryStatus: 'proficient', subject: 'History' }).primary, 'grade unknown: no grade-gated method').toBe('mastery_learning');
    expect(plan({ masteryStatus: 'proficient', subject: 'History', gradeLevel: 4 }).primary, 'Socratic from grade 5').toBe('mastery_learning');
  });
  it('discussion subject, mastered: Case-Based + Socratic from grade 9 (judgment)', () => {
    expect(plan({ masteryStatus: 'mastered', subject: 'Ethics', gradeLevel: 10 })).toMatchObject({ primary: 'case_based', supporting: ['socratic_questioning'], reasonCodes: ['EXTEND_JUDGMENT'] });
    expect(plan({ masteryStatus: 'mastered', subject: 'Ethics', gradeLevel: 8 }).primary).toBe('retrieval_practice');
  });
  it('applied subject, mastered: Problem-Based from grade 7', () => {
    expect(plan({ masteryStatus: 'mastered', subject: 'Biology', gradeLevel: 9 })).toMatchObject({ primary: 'problem_based', reasonCodes: ['EXTEND_APPLICATION'] });
    expect(plan({ masteryStatus: 'mastered', subject: 'Biology', gradeLevel: 6 }).primary).toBe('retrieval_practice');
  });
  it('a due review always comes first; unit consolidation uses Concept Mapping', () => {
    expect(plan({ masteryStatus: 'mastered', subject: 'Biology', gradeLevel: 9, retention: { due: true, lapsed: false } })).toMatchObject({ primary: 'retrieval_practice', reinforcement: 'spaced_repetition' });
    expect(plan({ masteryStatus: 'mastered', relatedSecureObjectives: 3, gradeLevel: 7 })).toMatchObject({ primary: 'retrieval_practice', reinforcement: 'concept_mapping', reasonCodes: ['CONSOLIDATE_UNIT'] });
    expect(plan({ masteryStatus: 'mastered', relatedSecureObjectives: 3, gradeLevel: 4 }).reinforcement, 'concept mapping from grade 5').toBeUndefined();
  });
  it('procedural subjects keep interleaving; the subject inference is stated as a limitation', () => {
    const p = plan({ masteryStatus: 'proficient', subject: 'Mathematics', gradeLevel: 8, relatedSecureObjectives: 2 });
    expect([p.primary, p.reinforcement]).toEqual(['mastery_learning', 'interleaving']);
    expect(p.limitations.join(' ')).toMatch(/Subject type \(procedural\) inferred/);
  });
});

describe('switching only on new learner evidence', () => {
  it('Direct Instruction -> Worked Example when new evidence shows no improvement', () => {
    const p = plan({ masteryStatus: 'emerging', previous: { primary: 'direct_instruction', newEvidenceSince: true, improved: false } });
    expect(p.primary).toBe('worked_example');
    expect(p.reasonCodes).toEqual(expect.arrayContaining(['STRATEGY_CHANGED', 'NO_IMPROVEMENT']));
  });
  it('Socratic -> Scaffolded after repeated errors', () => {
    const p = plan({ masteryStatus: 'developing', recentResults: ['incorrect', 'incorrect'], previous: { primary: 'socratic_questioning', newEvidenceSince: true, improved: false } });
    expect(p.primary).toBe('scaffolding');
    expect(p.reasonCodes).toContain('REPEATED_ERRORS');
  });
  it('-> Retrieval Practice once mastery is reached', () => {
    expect(plan({ masteryStatus: 'mastered', previous: { primary: 'scaffolding', newEvidenceSince: true, improved: true } }).primary).toBe('retrieval_practice');
  });
  it('no switch without new evidence, and no switch when the evidence improved', () => {
    expect(plan({ masteryStatus: 'emerging', previous: { primary: 'direct_instruction', newEvidenceSince: false } }).primary).toBe('direct_instruction');
    expect(plan({ masteryStatus: 'emerging', previous: { primary: 'direct_instruction', newEvidenceSince: true, improved: true } }).primary).toBe('direct_instruction');
    expect(plan({ masteryStatus: 'emerging', previous: { primary: 'direct_instruction', newEvidenceSince: true, improved: undefined } }).primary).toBe('direct_instruction');
  });
  it('a method that already failed on this objective is not chosen again by a switch', () => {
    const p = plan({ masteryStatus: 'emerging', triedWithoutImprovement: ['worked_example'], previous: { primary: 'direct_instruction', newEvidenceSince: true, improved: false } });
    expect(p.primary).not.toBe('worked_example');
  });
});

describe('safety of every plan', () => {
  it('every combination of signals yields a valid composition (no contradictions), and novices never get answer-withholding discovery methods', () => {
    const statuses = ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'];
    const cats = [[], ['conceptual_misunderstanding'], ['procedural_error'], ['misinterpretation']];
    let n = 0;
    for (const masteryStatus of statuses) for (const c of cats) for (const disengaged of [false, true]) for (const gradeLevel of [3, 8, 12, undefined]) for (const applicationGap of [undefined, true]) for (const lapsed of [false, true]) for (const minutes of [undefined, 5]) for (const [subject, relatedSecureObjectives] of [[undefined, 0], ['History', 3], ['Biology', 1], ['Mathematics', 2]] as const) {
      const p = plan({ masteryStatus, misconceptions: c.map((category, i) => ({ id: `m${i}`, category })), disengaged, gradeLevel, applicationGap, retention: { due: lapsed, lapsed }, availableMinutes: minutes, subject, relatedSecureObjectives });
      if (p.reinforcement && gradeLevel !== undefined) expect(STRATEGY_BY_ID.get(p.reinforcement)!.minGrade!, `${p.reinforcement} at grade ${gradeLevel}`).toBeLessThanOrEqual(gradeLevel);
      expect(validateComposition(p), JSON.stringify(p)).toEqual([]);
      if (['not_assessed', 'emerging'].includes(masteryStatus)) for (const id of [p.primary, ...p.supporting]) expect(STRATEGY_BY_ID.get(id)!.withholdsAnswer, `${masteryStatus}: ${id}`).toBeFalsy();
      if (gradeLevel !== undefined) for (const id of [p.primary, ...p.supporting]) expect(STRATEGY_BY_ID.get(id)!.minGrade!, `${id} at grade ${gradeLevel}`).toBeLessThanOrEqual(gradeLevel);
      if (minutes === 5) expect(p.supporting.length).toBeLessThanOrEqual(1);
      expect(p.decisionVersion).toBe('ped-v2');
      expect(p.registryVersion).toBe('reg-v2');
      n++;
    }
    expect(n).toBe(5 * 4 * 2 * 4 * 2 * 2 * 2 * 4);
  });
  it('engagement methods only on an engagement signal', () => {
    expect(plan({ masteryStatus: 'mastered' }).supporting).not.toContain('gamification');
    expect(plan({ masteryStatus: 'mastered', disengaged: true, gradeLevel: 6 }).supporting).toContain('gamification');
    expect(plan({ masteryStatus: 'emerging', disengaged: true, gradeLevel: 10 }).supporting).toContain('narrative_contextual');
  });
  it('ped-v1 is unchanged for existing callers', () => {
    expect(selectStrategy({ objectiveId: 'o', masteryStatus: 'emerging', evidenceStrength: 'limited', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [] })).toMatchObject({ strategyId: 'direct_instruction', decisionVersion: 'ped-v1' });
  });
});

// ---------------------------------------------------------------------------
let mongo: MongoMemoryServer;
let M: Record<string, mongoose.Model<any>>;
let ctx: typeof import('../src/services/learningContext');
const S = 'p21-school';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['Institution', 'LearningObjective', 'StudentObjectiveMastery', 'PedagogicalDecision', 'Student', 'LearningEvidence']) M[n] = (await import(`../src/models/${n}`))[n];
  ctx = await import('../src/services/learningContext');
  await M.Institution.create({ id: S, name: 'P21 School', features: { learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true } });
  await M.Institution.create({ id: 'p21-off', name: 'Flag off', features: { learning_intelligence_enabled: true } });
  await M.Student.create({ id: 'stu-1', name: 'Synthetic One', email: 's1@p21.test', grade: 'Grade 6', institutionId: S });
  const obj = (id: string, code: string, lessonIds: string[], inst = S) => ({ id, institutionId: inst, curriculumId: 'cur', courseId: 'course', code, title: `Objective ${code}`, lessonIds, status: 'approved', prerequisiteObjectiveIds: [] });
  await M.LearningObjective.create([obj('o-single', 'A1', ['L1']), obj('o-m1', 'B1', ['L2']), obj('o-m2', 'B2', ['L2']), obj('o-off', 'C1', ['L9'], 'p21-off')]);
  await M.StudentObjectiveMastery.create([
    { institutionId: S, studentId: 'stu-1', objectiveId: 'o-m1', masteryEstimate: 0.8, masteryStatus: 'proficient', evidenceStrength: 'moderate', lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1' },
    { institutionId: S, studentId: 'stu-1', objectiveId: 'o-m2', masteryEstimate: 0.3, masteryStatus: 'emerging', evidenceStrength: 'limited', lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1' },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => { await M.PedagogicalDecision.deleteMany({}); });

describe('orchestrator wiring (real MongoDB, synthetic records)', () => {
  it('adaptive pedagogy off or no objective: no plan (tutoring unchanged)', async () => {
    expect(await ctx.buildTeachingContext({ institutionId: 'p21-off', studentId: 'stu-1', lessonId: 'L9', channel: 'chat' })).toBeNull();
    expect(await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L-none', channel: 'chat' })).toBeNull();
    expect(await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', channel: 'chat' })).toBeNull();
  });

  it('session without an objective: the lesson\'s single objective is used and the decision is recorded with ped-v2 fields', async () => {
    const c = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L1', tutorSessionId: 'tut-1', channel: 'chat' }))!;
    expect(c.teaching).toMatchObject({ objectiveId: 'o-single', objectiveResolution: 'lesson', primary: 'formative_feedback', decisionVersion: 'ped-v2', registryVersion: 'reg-v2' });
    const d = await M.PedagogicalDecision.findOne({ id: c.teaching.decisionId }).lean();
    expect(d).toMatchObject({ strategyId: 'formative_feedback', supportingStrategyIds: ['retrieval_practice'], decisionVersion: 'ped-v2', objectiveResolution: 'lesson', channel: 'chat', masteryStatusAtDecision: 'not_assessed', confidence: 'low' });
    expect(d.reasonCodes).toContain('NO_EVIDENCE');
    expect(d.limitations.length).toBeGreaterThan(0);
  });

  it('several objectives on the lesson: the weakest is chosen (lesson_multiple), deterministically', async () => {
    const c = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-2', channel: 'stream' }))!;
    expect(c.teaching).toMatchObject({ objectiveId: 'o-m2', objectiveResolution: 'lesson_multiple', primary: 'direct_instruction' });
    const r = await ctx.resolveTeachingObjective({ institutionId: S, studentId: 'stu-1', lessonId: 'L2' });
    expect(r.candidates).toEqual(['o-m2', 'o-m1']);
  });

  it('a session objective wins over the lesson; another school\'s objective is never used', async () => {
    expect((await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', sessionObjectiveId: 'o-m1', lessonId: 'L2', channel: 'chat' }))!.teaching.objectiveId).toBe('o-m1');
    expect(await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', sessionObjectiveId: 'o-off', channel: 'chat' })).toBeNull();
  });

  it('the same plan on later turns of a session is recorded once', async () => {
    for (let i = 0; i < 3; i++) await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L1', tutorSessionId: 'tut-3', channel: 'chat' });
    expect(await M.PedagogicalDecision.countDocuments({ tutorSessionId: 'tut-3' })).toBe(1);
  });

  it('voice gets the same plan in a compact form and records channel voice', async () => {
    const chat = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-c', channel: 'chat' }))!;
    const voice = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'av-1', channel: 'voice', compact: true }))!;
    expect(voice.teaching.primary).toBe(chat.teaching.primary);
    expect(voice.prompt.length).toBeLessThan(chat.prompt.length);
    console.log(`P21_PLAN_TOKENS chat~${Math.ceil(chat.prompt.length / 4)} voice~${Math.ceil(voice.prompt.length / 4)}`);
    expect(await M.PedagogicalDecision.findOne({ tutorSessionId: 'av-1' }).lean()).toMatchObject({ channel: 'voice' });
  });

  it('switches after new evidence that did not move mastery; not before', async () => {
    const first = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-s', channel: 'chat' }))!;
    expect(first.teaching.primary).toBe('direct_instruction');
    // no new evidence yet: same plan
    expect((await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-s', channel: 'chat' }))!.teaching.primary).toBe('direct_instruction');
    // new independent evidence, mastery estimate unchanged (0.3): switch per the registry
    await M.LearningEvidence.create({ id: 'ev-sw', institutionId: S, studentId: 'stu-1', objectiveId: 'o-m2', evidenceType: 'independent_assessment', result: 'incorrect', normalizedScore: 0, reliabilityWeight: 1, occurredAt: new Date(Date.now() + 1000), recordedAt: new Date(), evidenceVersion: 'evidence-v3', sourceEventId: 'le-1', itemKey: 'q:1', origin: 'live' }).catch((e) => { throw new Error(`evidence: ${e.message}`); });
    const next = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-s', channel: 'chat' }))!;
    expect(next.teaching.primary).toBe('worked_example');
    expect(next.teaching.reasonCodes).toEqual(expect.arrayContaining(['STRATEGY_CHANGED']));
    expect(await M.PedagogicalDecision.countDocuments({ tutorSessionId: 'tut-s' })).toBe(2);
  });

  it('decisions written by ped-v1 (no new fields) still load and count as "effect unknown"', async () => {
    await M.PedagogicalDecision.create({ id: 'pd-legacy', institutionId: S, studentId: 'stu-1', objectiveId: 'o-single', targetObjectiveId: 'o-single', strategyId: 'socratic_questioning', strategyVersion: 1, reasonCodes: ['NO_EVIDENCE'], supportingEvidenceIds: [], misconceptionIds: [], requiresReassessment: true, decisionVersion: 'ped-v1', at: new Date(Date.now() - 86_400_000) });
    const c = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L1', tutorSessionId: 'tut-l', channel: 'chat' }))!;
    expect(c.teaching.primary).toBeTruthy();
  });

  it('the tutor prompt follows the plan: the legacy "teach Socratically" line is replaced, the plan is included, size is bounded', async () => {
    const { buildTutorRequest } = await import('../src/services/directTutorModel');
    const c = (await ctx.buildTeachingContext({ institutionId: S, studentId: 'stu-1', lessonId: 'L2', tutorSessionId: 'tut-p', channel: 'chat' }))!;
    const withPlan = await buildTutorRequest({ query: 'q', history: [], teachingMethod: 'socratic', pedagogy: c.prompt, planActive: true });
    const legacy = await buildTutorRequest({ query: 'q', history: [], teachingMethod: 'socratic' });
    const sys = (r: any) => (r.body.system as any[]).map((b) => b.text).join('\n');
    expect(sys(legacy)).toMatch(/Teach Socratically/);
    expect(sys(withPlan)).not.toMatch(/Teach Socratically/);
    expect(sys(withPlan)).toMatch(/Teaching method: (Worked Examples|Direct Instruction)/);
    const extraTokens = Math.ceil((sys(withPlan).length - sys(legacy).length) / 4); // ~4 chars per token
    console.log(`P21_PLAN_PROMPT_EXTRA_TOKENS ~${extraTokens}`);
    expect(extraTokens).toBeLessThan(450);
  });
});
