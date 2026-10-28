import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORIGIN_LABELS, originOptionsFor, withOrigin } from '../../frontend/services/roleRouting';

// P1 final gaps: the dashboard demo/live selector (frontend helpers + the API
// it drives, using the real 4Level1 seed), and honest provenance in
// /api/teaching/ops. Offline.
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

describe('selector helpers (frontend services/roleRouting.ts)', () => {
  it('teachers choose live or demo; admins may also see all; students get no selector', () => {
    expect(originOptionsFor('teacher')).toEqual(['live', 'demo_seed']);
    expect(originOptionsFor('admin')).toEqual(['live', 'demo_seed', 'all']);
    expect(originOptionsFor('enara-admin')).toEqual(['live', 'demo_seed', 'all']);
    expect(originOptionsFor('student')).toEqual([]);
    expect(originOptionsFor('academic_manager')).toEqual([]);
    expect(originOptionsFor(undefined)).toEqual([]);
    expect(ORIGIN_LABELS).toEqual({ live: 'Live data', demo_seed: 'Demo data', all: 'All data (live + demo)' });
  });

  it('every dashboard request states its view, live by default', () => {
    expect(withOrigin('/api/teaching/overview')).toBe('/api/teaching/overview?origin=live');
    expect(withOrigin('/api/teaching/classes/c1/roster', 'demo_seed')).toBe('/api/teaching/classes/c1/roster?origin=demo_seed');
    expect(withOrigin('/api/learning/analytics/ttu?courseId=c1', 'all')).toBe('/api/learning/analytics/ttu?courseId=c1&origin=all');
  });
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;
let seed: typeof import('../src/scripts/seed4Level1');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', BCRYPT_ROUNDS: '10',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  seed = await import('../src/scripts/seed4Level1');
  M = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'AssessmentAttempt', 'GradingProposal', 'AiCall', 'ReminderLog', 'Batch', 'Curriculum', 'LearningEvent', 'TutorSession']) M[n] = (await import(`../src/models/${n}`))[n];
  M.Assessment = (await import('../src/models/Assessment')).Assessment;
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
});

const FLAGS = { teaching_workflow_enabled: true, learning_intelligence_enabled: true, teacher_learning_insights_enabled: true };
const as = (user: { _id: { toString(): string }; email: string; role: string; institutionId?: string }) => {
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email: user.email, role: user.role as never, institutionId: user.institutionId })}`;
  return (u: string) => request(app).get(u).set('Authorization', auth);
};
async function newUser(role: string, institutionId?: string) {
  const email = `${role}-${Math.random().toString(36).slice(2)}@t.test`;
  return as(await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId }));
}

describe('the seeded demo class through the selector', () => {
  it('a 4Level1 teacher sees nothing seeded by default and the demo class when choosing demo data', async () => {
    await seed.seed4Level1('inst4l1');
    await M.Institution.updateOne({ id: 'inst4l1' }, { features: FLAGS });
    const teacher = as((await M.User.findOne({ institutionId: 'inst4l1', role: 'teacher' }).lean())!);
    const live = await teacher('/api/teaching/overview?origin=live');
    expect(live.status).toBe(200);
    expect(live.body.origin).toBe('live');
    expect(live.body.classes).toEqual([]);
    const demo = await teacher('/api/teaching/overview?origin=demo_seed');
    expect(demo.body.origin).toBe('demo_seed');
    expect(demo.body.classes.map((c: { id: string; students: number }) => [c.id, c.students])).toEqual([['inst4l1-demo-class', 6]]);
    const roster = await teacher('/api/teaching/classes/inst4l1-demo-class/roster?origin=demo_seed');
    expect(roster.status).toBe(200);
    expect(roster.body.students).toHaveLength(6);
    expect((await teacher('/api/teaching/classes/inst4l1-demo-class/roster?origin=live')).body.students).toEqual([]);
    const profile = await teacher('/api/teaching/students/inst4l1-demo-stu-1/profile?origin=demo_seed');
    expect(profile.status).toBe(200);
    expect(profile.body.origin).toBe('demo_seed');
    expect((await teacher('/api/teaching/students/inst4l1-demo-stu-1/profile?origin=live')).status).toBe(404);
    const classes = await teacher('/api/learning/classes?origin=demo_seed');
    expect(classes.body.classes.map((c: { id: string }) => c.id)).toEqual(['inst4l1-demo-class']);
    expect((await teacher('/api/learning/classes/inst4l1-demo-class/insights?origin=demo_seed')).body.heatmap).toHaveLength(6);
  });

  it('choosing demo data never reaches another school\'s demo class or another teacher\'s class', async () => {
    await seed.seed4Level1('inst4l1');
    await seed.seed4Level1('other-school');
    await M.Institution.updateMany({}, { features: FLAGS });
    const teacher = as((await M.User.findOne({ institutionId: 'inst4l1', role: 'teacher' }).lean())!);
    for (const v of ['demo_seed', 'all']) {
      expect([403, 404]).toContain((await teacher(`/api/teaching/classes/other-school-demo-class/roster?origin=${v}`)).status);
      expect([403, 404]).toContain((await teacher(`/api/teaching/students/other-school-demo-stu-1/profile?origin=${v}`)).status);
      expect([403, 404]).toContain((await teacher(`/api/learning/classes/other-school-demo-class/insights?origin=${v}`)).status);
    }
    const otherTeacher = await newUser('teacher', 'inst4l1');
    expect((await otherTeacher('/api/teaching/overview?origin=demo_seed')).body.classes).toEqual([]);
    expect([403, 404]).toContain((await otherTeacher('/api/teaching/classes/inst4l1-demo-class/roster?origin=demo_seed')).status);
  });
});

describe('GET /api/teaching/ops provenance', () => {
  const T0 = Date.now();
  async function fixture() {
    await M.Institution.create([{ id: 'instA', name: 'A', features: FLAGS }, { id: 'instB', name: 'B', features: FLAGS }]);
    const attempt = (id: string, extra: object = {}) => ({ id, assessmentId: 'a', assessmentTitle: 'A', studentId: 's', institutionId: 'instA', assignmentId: 'asg', status: 'submitted', submittedAt: new Date(T0 - 3600_000), gradingStatus: 'needs_review', ...extra });
    await M.AssessmentAttempt.create([attempt('tLive'), attempt('tDemo', { origin: 'demo_seed' })]);
    await M.AssessmentAttempt.collection.insertOne(attempt('tLegacy')); // no origin field: live
    const proposal = (id: string, attemptId: string, institutionId = 'instA') => ({ id, institutionId, attemptId, assignmentId: 'asg', questionId: 'q', kind: 'rubric', run: 1, maxPoints: 1, status: 'proposed', promptVersion: 'v' });
    await M.GradingProposal.create([proposal('pLive', 'tLive'), proposal('pDemo', 'tDemo'), proposal('pLegacy', 'tLegacy'), proposal('pOrphan', 'missing-attempt'), proposal('pOther', 'tLive', 'instB')]);
    await M.AiCall.create([
      { feature: 'ai_grading', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', costUsd: 0.25, institutionId: 'instA' },
      { feature: 'ai_grading', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', costUsd: 0.25, institutionId: 'instB' },
    ]);
    await M.ReminderLog.create({ kind: 'results_released', recipientKey: 'k', to: 'x@y.test', subject: 's', sent: true });
  }

  it('attempt-based counts and proposals follow the view; legacy records count as live', async () => {
    await fixture();
    const admin = await newUser('admin', 'instA');
    const live = (await admin('/api/teaching/ops')).body;
    expect(live.origin).toBe('live');
    expect(live.gradingQueue).toEqual([expect.objectContaining({ status: 'needs_review', count: 2 })]);
    expect(live.proposals).toEqual({ proposed: 2 }); // pLive + pLegacy
    const demo = (await admin('/api/teaching/ops?origin=demo_seed')).body;
    expect(demo.gradingQueue).toEqual([expect.objectContaining({ count: 1 })]);
    expect(demo.proposals).toEqual({ proposed: 1 });
    const all = (await admin('/api/teaching/ops?origin=all')).body;
    expect(all.gradingQueue).toEqual([expect.objectContaining({ count: 3 })]);
    expect(all.proposals).toEqual({ proposed: 4 }); // incl. the orphan; never instB's
  });

  it('origin-unaware sections are labelled, never presented as live or demo totals', async () => {
    await fixture();
    const admin = await newUser('admin', 'instA');
    for (const v of ['live', 'demo_seed', 'all']) {
      const body = (await admin(`/api/teaching/ops?origin=${v}`)).body;
      expect(body.originCoverage).toEqual({
        gradingQueue: v, proposals: v, autoGrading: v, reviewActions: v, submissions: v,
        aiCalls: 'all_origin_aggregate', notifications: 'not_available_for_one_school',
      });
      // The same all-origin AI call count in every view: it is not split.
      expect(body.aiCalls).toEqual([expect.objectContaining({ feature: 'ai_grading', count: 1 })]);
      // Notification logs carry no school, so a school sees none of them.
      expect(body.notifications).toBeNull();
      expect(JSON.stringify(body)).not.toMatch(/costUsd|unpricedCalls/);
    }
  });

  it('ENARA admins see platform notifications labelled all-origin, and internal cost', async () => {
    await fixture();
    const enara = await newUser('enara-admin');
    const platform = (await enara('/api/teaching/ops')).body;
    expect(platform.originCoverage.notifications).toBe('all_origin_aggregate');
    expect(platform.notifications).toEqual([{ kind: 'results_released', sent: true, count: 1 }]);
    expect(platform.aiCalls[0].costUsd).toBe(0.5);
    const oneSchool = (await enara('/api/teaching/ops?institutionId=instA')).body;
    expect(oneSchool.notifications).toBeNull();
    expect(oneSchool.proposals).toEqual({ proposed: 2 });
  });

  it('stays closed to teachers, academic managers and students', async () => {
    await fixture();
    for (const role of ['teacher', 'academic_manager', 'student']) expect((await (await newUser(role, 'instA'))('/api/teaching/ops?origin=all')).status).toBe(403);
  });
});
