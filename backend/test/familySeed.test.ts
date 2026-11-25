import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFamilyPlan, FAMILY_BATCH, FAMILY_PARENT_EMAIL } from '../src/maintenance/fullSeed/familyPlan';
import { FORBIDDEN_WORDS } from '../src/maintenance/fullSeed/content';
import { fullSeedStatus, preparePlan, removeFullSeed, runFamilySeed, SeedRefused } from '../src/maintenance/fullSeed/run';
import { trendOf } from '../src/schoolApp/chatAnalytics';

// The family account (owner "go" 25 Nov 2026): Mona Hassan and her three children at Al Nour International School, 5 subjects each.
const NOW = new Date('2026-11-25T12:00:00Z');
const plan = buildFamilyPlan(NOW);
const docsOf = (m: string) => plan.docs.filter((d) => d.model === m).map((d) => d.doc as Record<string, any>);
const kids = docsOf('Student').filter((s) => / Hassan$/.test(s.name) && ['Youssef', 'Laila', 'Omar'].includes(s.name.split(' ')[0]));
const VISIBLE = /^(name|email|title|courseName|summary|description|text|question|answer|options|lessonTitle|assessmentTitle|questionText|studentAnswer|correctAnswer|errorLabel|subject|topic|topics|grade|contactName|details|reply|body|note|routeName|stopName|planName|message)$/;
function visibleStrings(v: unknown, key = '', out: string[] = []): string[] {
  if (typeof v === 'string') { if (VISIBLE.test(key)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => visibleStrings(x, key, out));
  else if (v && typeof v === 'object' && !(v instanceof Date)) for (const [k, x] of Object.entries(v)) visibleStrings(x, k, out);
  return out;
}

describe('the family plan', () => {
  it('one parent with an email sign-in and three active children at the new school', () => {
    const parent = docsOf('User').find((u) => u.email === FAMILY_PARENT_EMAIL)!;
    expect(parent).toMatchObject({ role: 'parent', name: 'Mona Hassan' });
    expect(kids.map((k) => [k.name, k.grade])).toEqual([['Youssef Hassan', 'Grade 3'], ['Laila Hassan', 'Grade 6'], ['Omar Hassan', 'Grade 9']]);
    const links = docsOf('ParentLearnerLink').filter((l) => l.parentUserId === String(parent._id));
    expect(links.map((l) => [l.studentId, l.status, l.role]).sort()).toEqual(kids.map((k) => [k.id, 'active', 'owner']).sort());
    expect(docsOf('ParentProfile').find((p) => p.userId === String(parent._id))).toMatchObject({ signIn: 'password' });
    expect(docsOf('Institution')).toEqual([expect.objectContaining({ name: 'Al Nour International School', parentPortal: expect.objectContaining({ access: 'free' }) })]);
  });

  it('every child takes 5 subjects (a class each), with lessons, marks and practice in each', () => {
    for (const k of kids) {
      const classes = docsOf('CourseInstance').filter((c) => c.batchId === k.batchId).map((c) => c.courseId).sort();
      expect(classes, k.name).toEqual(['ARB', 'ENG', 'MATH', 'SCI', 'SOC']);
      const released = docsOf('AssessmentAttempt').filter((a) => a.studentId === k.id && a.gradingStatus === 'released');
      expect(new Set(released.map((a) => a.subject)).size, k.name).toBe(5);
      expect(released.length).toBe(20); // 4 marks x 5 subjects
      expect(docsOf('AssessmentAttempt').filter((a) => a.studentId === k.id && a.gradingStatus !== 'released')).toHaveLength(1); // one waits for the teacher
      expect(docsOf('TutorSession').filter((s) => s.studentId === k.id).length).toBeGreaterThan(8);
      expect(docsOf('SchoolDailyAttendance').filter((a) => a.studentId === k.id).length).toBeGreaterThan(30);
      expect(docsOf('BusHome').find((h) => h.studentId === k.id)).toMatchObject({ confirmedAt: expect.any(Date) });
    }
  });

  it('each child has one subject improving, one steady and one going down (what the assistant analyses)', () => {
    for (const k of kids) {
      const bySubject = new Map<string, number[]>();
      for (const a of docsOf('AssessmentAttempt').filter((x) => x.studentId === k.id && x.gradingStatus === 'released').sort((x, y) => x.submittedAt - y.submittedAt)) bySubject.set(a.subject, [...(bySubject.get(a.subject) ?? []), a.score]);
      const trends = [...bySubject.values()].map((m) => trendOf(m).trend);
      expect(trends, k.name).toEqual(expect.arrayContaining(['up', 'steady', 'down']));
    }
    // Points and percent agree on every planned mark.
    for (const a of docsOf('AssessmentAttempt').filter((x) => kids.some((k) => k.id === x.studentId))) expect(Math.abs((a.totalPoints / a.maxPoints) * 100 - a.score)).toBeLessThanOrEqual(1);
  });

  it('Omar misses or is late on Sundays; fees in three states; an open request and a consent to answer', () => {
    const omar = kids.find((k) => k.name.startsWith('Omar'))!;
    const sundays = docsOf('SchoolDailyAttendance').filter((a) => a.studentId === omar.id && new Date(`${a.date}T12:00:00Z`).getUTCDay() === 0 && a.status !== 'present');
    expect(sundays.length).toBeGreaterThanOrEqual(4);
    const second = (first: string) => docsOf('SchoolInstalment').find((i) => i.studentId === kids.find((k) => k.name.startsWith(first))!.id && i.number === 2 && /Tuition/.test(i.planName))!;
    expect(second('Laila').status).toBe('paid');
    expect(second('Omar')).toMatchObject({ status: 'due' });
    expect(second('Omar').dueDate < '2026-11-25').toBe(true);
    expect(second('Youssef').dueDate > '2026-11-25').toBe(true);
    const parentId = String(docsOf('User').find((u) => u.email === FAMILY_PARENT_EMAIL)!._id);
    expect(docsOf('SchoolRequest').filter((r) => r.parentUserId === parentId)).toEqual([expect.objectContaining({ status: 'in_progress', type: 'teacher_meeting' })]);
    expect(docsOf('SchoolConsent').filter((c) => c.parentUserId === parentId)).toEqual([]);
    expect(docsOf('SchoolConsentForm')).toHaveLength(1);
  });

  it('nothing a person can see says it was made up; every document is valid; no password in the plan', () => {
    const strings = plan.docs.flatMap((d) => visibleStrings(d.doc)).concat(plan.users.flatMap((u) => [u.name, u.email, u.school ?? '']));
    expect(strings.filter((s) => FORBIDDEN_WORDS.test(s) || /\bseed|demo|test|sample|fake/i.test(s))).toEqual([]);
    const { problems } = preparePlan(NOW, '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234', undefined, plan);
    expect(problems).toEqual([]);
    expect(JSON.stringify(plan)).not.toMatch(/\$2[aby]\$/);
    const ids = plan.docs.map((d) => `${d.model}:${String(d.doc._id)}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respects the unique indexes (one parent with this email; no other family called Hassan)', () => {
    const emails = docsOf('User').map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(docsOf('User').filter((u) => u.role === 'parent' && / Hassan$/.test(u.name))).toHaveLength(1);
    expect(docsOf('Student').filter((s) => / Hassan$/.test(s.name))).toHaveLength(3);
    for (const [m, f] of [['Student', 'id'], ['CourseInstance', 'id'], ['AssessmentAttempt', 'id'], ['TutorSession', 'id'], ['SchoolDailyAttendance', 'id'], ['ParentNotification', 'id']] as const) {
      const vals = docsOf(m).map((d) => d[f]);
      expect(new Set(vals).size, m).toBe(vals.length);
    }
  });
});

describe('family run and remove (in-memory MongoDB)', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); }, 60_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  it('refuses a short password; runs twice without duplicates; removes exactly its own rows', async () => {
    await expect(runFamilySeed('short', NOW)).rejects.toThrow(SeedRefused);
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true }); // as on lms-test (the E2E caught a duplicate)
    const keep = await mongoose.connection.collection('users').insertOne({ email: 'someone@lms-test.example', role: 'teacher' });
    const pw = 'a-throwaway-value-for-this-test';
    const first = await runFamilySeed(pw, NOW);
    const second = await runFamilySeed(pw, NOW);
    expect(second.counts).toEqual(first.counts);
    expect(JSON.stringify(first)).not.toContain(pw);
    expect(first.children).toEqual(['Youssef Hassan (Grade 3)', 'Laila Hassan (Grade 6)', 'Omar Hassan (Grade 9)']);
    const parent = await mongoose.connection.collection('users').findOne({ email: FAMILY_PARENT_EMAIL });
    expect(parent!.password).toMatch(/^\$2[aby]\$10\$/);
    expect((await fullSeedStatus(FAMILY_BATCH)).total).toBe(first.total);
    expect((await fullSeedStatus()).total).toBe(0); // the full seed's batch is untouched
    const out = await removeFullSeed(FAMILY_BATCH);
    expect(out.registryRowsDeleted).toBe(first.total);
    expect(await mongoose.connection.collection('users').countDocuments()).toBe(1);
    expect(await mongoose.connection.collection('users').findOne({ _id: keep.insertedId })).not.toBeNull();
  }, 120_000);
});
