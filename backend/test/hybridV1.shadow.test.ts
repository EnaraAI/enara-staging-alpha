import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Shadow integration (offline): in-memory database, fake model client, network blocked.
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { throw new Error('network client must not be constructed in tests'); } } }));
vi.stubGlobal('fetch', () => { throw new Error('network access in tests'); });

import { AssessmentAttempt } from '../src/models/AssessmentAttempt';
import { AssessmentVersion } from '../src/models/Assessment';
import { GradingProposal } from '../src/models/GradingProposal';
import { HybridAnchorSet, HybridShadowResult } from '../src/models/HybridShadowResult';
import type { HybridV1Config } from '../src/services/hybridV1/config';
import { ShadowBudget, shadowGradeAttempt } from '../src/services/hybridV1/shadow';
import type { V6Client } from '../src/services/hybridV1/v6';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const CFG: HybridV1Config = { enabled: true, mode: 'shadow', institutions: new Set(['school-a']), maxCalls: 50, maxUsd: 5 };
const LEVELS = [0, 1, 2, 3, 4, 5].map((p) => ({ id: `s${p}`, label: `${p}`, points: p }));
const Q = { id: 'q1', type: 'open-response', text: 'ما الفرق بين الفيروس و برنامج الإنزال ؟', explanation: '', modelAnswer: 'الفيروس يكرر نفسه، والإنزال يراوغ برامج المكافحة.', rubric: { criteria: [{ id: 'c', title: 'holistic', maxPoints: 5, levels: LEVELS }] } };
const ANSWER = 'الفيروس ينسخ نفسه أما الإنزال فيراوغ برامج المكافحة';
const REPLY = JSON.stringify({ ideas: [{ idea: 'نسخ', status: 'COVERED', evidence: [{ text: 'ينسخ نفسه' }] }], score: 3.75 });

function fakeClient(replies: string[] = []) {
  const bodies: any[] = [];
  const client: V6Client = { create: async (body) => { bodies.push(body); return { text: replies.shift() ?? REPLY, stopReason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 300 }, model: 'claude-sonnet-5-5' }; } };
  return { client, bodies };
}

let n = 0;
async function attempt(institutionId: string, answer: string, extra: Record<string, unknown> = {}) {
  const id = `att-${++n}`;
  await AssessmentAttempt.create({ id, assessmentId: 'as1', assessmentTitle: 'T', studentId: `st-${n}`, institutionId, assessmentVersion: 1, status: 'submitted', gradingStatus: 'released',
    answers: [{ questionId: 'q1', studentAnswer: answer, ...extra }] });
  return id;
}
async function graded(institutionId = 'school-a', modelName = 'claude-opus-5-5', points = 3) {
  const pid = `gp-${++n}`;
  const id = await attempt(institutionId, ANSWER, { points, method: 'ai', proposalId: pid });
  await GradingProposal.create({ id: pid, institutionId, attemptId: id, questionId: 'q1', kind: 'rubric', run: 1, status: 'proposed', criteria: [{ criterionId: 'c', levelId: `s${points}`, points, evidence: [], rationale: 'r' }], points, maxPoints: 5, flags: [], modelName, promptVersion: 'eval-v2' });
  return id;
}

beforeEach(async () => {
  await Promise.all([AssessmentAttempt.deleteMany({}), GradingProposal.deleteMany({}), HybridShadowResult.deleteMany({}), HybridAnchorSet.deleteMany({}), AssessmentVersion.deleteMany({})]);
  await AssessmentVersion.create({ assessmentId: 'as1', version: 1, title: 'T', questions: [Q] });
  for (const [i, s] of [0, 1.5, 3.5, 5, 2, 4].entries()) await attempt('school-a', `إجابة معلم ${i}`, { points: s, method: 'teacher' });
});

describe('Hybrid V1 shadow', () => {
  it('stores the frozen Hybrid score separately and leaves the official grade untouched', async () => {
    const id = await graded();
    const before = await AssessmentAttempt.findOne({ id }).lean();
    const f = fakeClient();
    const out = await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(out.results).toEqual([{ questionId: 'q1', status: 'done', label: 'HYBRID' }]);
    const r = await HybridShadowResult.findOne({ attemptId: id }).lean();
    expect(r).toMatchObject({ status: 'done', graderVersion: 'ENARA-HYBRID-experimental@v1', evalv2: { score: 3, modelName: 'claude-opus-5-5' }, v6: { score: 3.75, status: 'SCORED', calls: 1 }, hybrid: { score: 3.375, label: 'HYBRID' }, disagreement: 0.75 });
    expect(JSON.stringify(r)).not.toContain(ANSWER); // no answer text stored
    const after = await AssessmentAttempt.findOne({ id }).lean();
    expect(after).toEqual(before);
    const prompt = f.bodies[0].messages[0].content as string;
    expect((prompt.match(/human_score/g) || []).length).toBe(4);
    expect(prompt).not.toContain('"human_score": 3.0'); // the graded answer's own official score is never an anchor
  });

  it('is idempotent: a second run makes no call and writes nothing new', async () => {
    const id = await graded();
    await shadowGradeAttempt(id, { client: fakeClient().client, budget: new ShadowBudget(CFG), config: CFG });
    const f = fakeClient();
    const out = await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(out.results[0].status).toBe('skipped_duplicate');
    expect(f.bodies).toHaveLength(0);
    expect(await HybridShadowResult.countDocuments({})).toBe(1);
  });

  it('freezes one anchor set per question and reuses it', async () => {
    const a = await graded();
    const b = await graded();
    const f = fakeClient();
    await shadowGradeAttempt(a, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    await shadowGradeAttempt(b, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(await HybridAnchorSet.countDocuments({})).toBe(1);
    expect(f.bodies[0].messages[0].content.split('"student_answer"')[0]).toBe(f.bodies[1].messages[0].content.split('"student_answer"')[0]);
  });

  it('falls back to eval-v2 (labelled) without enough anchors, and never uses another school\'s answers', async () => {
    const id = await graded('school-b');
    const cfg = { ...CFG, institutions: new Set(['school-b']) };
    const f = fakeClient();
    await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(cfg), config: cfg });
    const r = await HybridShadowResult.findOne({ attemptId: id }).lean();
    expect(r).toMatchObject({ v6: { status: 'NON_SCORED', reasonCode: 'INSUFFICIENT_ANCHORS', calls: 0 }, hybrid: { score: 3, label: 'HYBRID_FALLBACK_EVALV2' } });
    expect(f.bodies).toHaveLength(0);
  });

  it('never grades an answer that is one of its own question\'s anchors', async () => {
    const first = await graded();
    await shadowGradeAttempt(first, { client: fakeClient().client, budget: new ShadowBudget(CFG), config: CFG });
    const set = await HybridAnchorSet.findOne({}).lean();
    const anchorAttempt = set!.anchors[1].attemptId; // a teacher-scored answer that also has an eval-v2 proposal
    const pid = 'gp-anchor';
    await AssessmentAttempt.updateOne({ id: anchorAttempt }, { $set: { 'answers.0.proposalId': pid } });
    await GradingProposal.create({ id: pid, institutionId: 'school-a', attemptId: anchorAttempt, questionId: 'q1', kind: 'rubric', run: 1, status: 'proposed', criteria: [], points: 2, maxPoints: 5, flags: [], modelName: 'claude-opus-5-5', promptVersion: 'eval-v2' });
    const f = fakeClient();
    await shadowGradeAttempt(anchorAttempt, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(await HybridShadowResult.findOne({ attemptId: anchorAttempt }).lean()).toMatchObject({ v6: { reasonCode: 'ANSWER_IS_ANCHOR', calls: 0 }, hybrid: { label: 'HYBRID_FALLBACK_EVALV2' } });
    expect(f.bodies).toHaveLength(0);
  });

  it('treats eval-v2 from a non-frozen model as outside the validated envelope', async () => {
    const id = await graded('school-a', 'claude-haiku-5-5');
    const f = fakeClient();
    await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(await HybridShadowResult.findOne({ attemptId: id }).lean()).toMatchObject({ status: 'not_eligible', eligibility: 'EVALV2_MODEL_NOT_FROZEN' });
    expect(f.bodies).toHaveLength(0);
  });

  it('records a missing eval-v2 result as a structured non-score and calls nothing', async () => {
    const id = await attempt('school-a', ANSWER, { method: 'ai', proposalId: 'gp-missing' });
    const f = fakeClient();
    await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG), config: CFG });
    expect(await HybridShadowResult.findOne({ attemptId: id }).lean()).toMatchObject({ hybrid: { score: null, label: 'HYBRID_NO_EVALV2' }, v6: { status: 'NOT_RUN' } });
    expect(f.bodies).toHaveLength(0);
  });

  it('stops at the call cap before exceeding it', async () => {
    const id = await graded();
    const cfg = { ...CFG, maxCalls: 1 };
    const budget = new ShadowBudget(cfg);
    const f = fakeClient([JSON.stringify({ ideas: [], score: 3.3 })]); // needs a repair -> second call refused
    const out = await shadowGradeAttempt(id, { client: f.client, budget, config: cfg });
    expect(out.skipped).toBe('budget_exceeded');
    expect(f.bodies).toHaveLength(1);
    expect(budget.calls).toBe(1);
    expect(await HybridShadowResult.findOne({ attemptId: id }).lean()).toMatchObject({ status: 'error', v6: { reasonCode: 'BUDGET_EXCEEDED' } });
  });

  it('does nothing when disabled or not allowlisted (kill switch)', async () => {
    const id = await graded();
    const f = fakeClient();
    const prev = process.env.ENARA_HYBRID_V1_ENABLED;
    process.env.ENARA_HYBRID_V1_ENABLED = 'false';
    try {
      expect(await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG) })).toMatchObject({ skipped: 'disabled' });
    } finally {
      process.env.ENARA_HYBRID_V1_ENABLED = prev;
    }
    expect(await shadowGradeAttempt(id, { client: f.client, budget: new ShadowBudget(CFG), config: { ...CFG, institutions: new Set(['other']) } })).toMatchObject({ skipped: 'institution_not_allowlisted' });
    expect(f.bodies).toHaveLength(0);
    expect(await HybridShadowResult.countDocuments({})).toBe(0);
  });

  it('logs no answer text', async () => {
    const id = await graded();
    const spy = vi.spyOn(console, 'log');
    await shadowGradeAttempt(id, { client: fakeClient().client, budget: new ShadowBudget(CFG), config: CFG });
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    spy.mockRestore();
    expect(logged).toContain('hybrid_v1_shadow');
    expect(logged).not.toContain(ANSWER);
  });
});
