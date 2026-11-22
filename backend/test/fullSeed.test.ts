import { readFileSync } from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { sheet } from '../src/scripts/fullSeedSheet';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPlan } from '../src/maintenance/fullSeed/plan';
import { EMAIL_DOMAIN, FORBIDDEN_WORDS, PUBLIC_FIGURES } from '../src/maintenance/fullSeed/content';
import { fullSeedStatus, preparePlan, removeFullSeed, runFullSeed, SeedRefused, seedPassword } from '../src/maintenance/fullSeed/run';

// The full seed for lms-test (docs/lms/FULL_SEED_PLAN.md). The plan is pure; the run/remove part uses an in-memory MongoDB and a
// throwaway password set only inside this test process.
const NOW = new Date('2026-11-22T12:00:00Z');
const plan = buildPlan(NOW);
const docsOf = (m: string) => plan.docs.filter((d) => d.model === m).map((d) => d.doc as Record<string, any>);

// Fields a person can see on some screen (names, titles, text, emails). IDs and hashes are not shown.
const VISIBLE = /^(name|email|title|courseName|summary|description|text|question|answer|options|lessonTitle|assessmentTitle|questionText|studentAnswer|correctAnswer|errorLabel|subject|topic|topics|grade|contactName|contactEmail|subjectLine|to|currentModule|label|acceptedAnswers)$/;
function visibleStrings(v: unknown, key = '', out: string[] = []): string[] {
  if (typeof v === 'string') { if (VISIBLE.test(key)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => visibleStrings(x, key, out));
  else if (v && typeof v === 'object' && !(v instanceof Date)) for (const [k, x] of Object.entries(v)) visibleStrings(x, k === 'subject' && key === '' ? 'subject' : k, out);
  return out;
}

describe('full seed plan', () => {
  it('is deterministic for the same run time', () => {
    const again = buildPlan(NOW);
    expect(again.docs.length).toBe(plan.docs.length);
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    const ids = plan.docs.map((d) => `${d.model}:${String(d.doc._id)}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respects every unique index of the models it writes', () => {
    const keys: [string, string[]][] = [['User', ['email']], ['Institution', ['id']], ['Student', ['id']], ['Batch', ['id']], ['Curriculum', ['id']], ['CourseInstance', ['id']], ['Assessment', ['id']], ['AssessmentAttempt', ['id']],
      ['ClassEnrollment', ['id']], ['ClassEnrollment', ['studentId', 'scope', 'targetId']], ['LessonProgress', ['studentId', 'courseId', 'lessonId']], ['ReviewItem', ['studentId', 'sourceKey']], ['ParentEmailSend', ['key']],
      ['StudentObjectiveMastery', ['studentId', 'objectiveId']], ['AssessmentVersion', ['assessmentId', 'version']], ['TutorMessage', ['sessionId', 'id']], ['ParentLearnerLink', ['parentUserId', 'studentId']], ['ParentProfile', ['userId']],
      ['SessionSummary', ['sessionId']], ['LearnerProfile', ['studentId']], ['StudyHabitDaily', ['studentId', 'day']], ['ErrorToWorkOn', ['studentId', 'objectiveId', 'errorCode']], ['LmsOnboarding', ['institutionId']],
      ['GradeLedgerEntry', ['id']], ['UsageLedger', ['operationKey']], ['LearningObjective', ['institutionId', 'curriculumId', 'code']], ['Invitation', ['tokenHash']], ['ParentLinkCode', ['codeHash']], ['LearningEvent', ['id']]];
    for (const [m, f] of keys) {
      const vals = docsOf(m).map((d) => f.map((k) => (d[k] instanceof Date ? d[k].toISOString() : String(d[k]))).join('|'));
      expect(new Set(vals).size, `${m} ${f.join('+')}`).toBe(vals.length);
    }
  });

  it('has a few thousand documents and the planned size', () => {
    expect(plan.docs.length).toBeGreaterThan(2000);
    const roles = (r: string) => plan.users.filter((u) => u.role === r).length;
    expect(roles('enara-admin')).toBe(1);
    expect(roles('student')).toBeGreaterThanOrEqual(110);
    expect(roles('parent')).toBeGreaterThanOrEqual(55);
    expect(roles('admin') + roles('academic_manager') + roles('teacher')).toBeGreaterThanOrEqual(14);
  });

  it('covers every role and state', () => {
    const inst = docsOf('Institution');
    expect(inst.map((i) => i.status)).toEqual(expect.arrayContaining(['active', 'suspended']));
    expect(inst.map((i) => i.parentPortal.access)).toEqual(expect.arrayContaining(['off', 'free']));
    expect(inst.map((i) => i.parentPortal.showResults)).toEqual(expect.arrayContaining(['immediately', 'after_release']));
    expect(docsOf('LmsOnboarding').length).toBe(1);
    const users = docsOf('User');
    expect(users.map((u) => u.role)).toEqual(expect.arrayContaining(['enara-admin', 'admin', 'academic_manager', 'teacher', 'student', 'parent']));
    expect(users.some((u) => u.role === 'teacher' && u.status === 'disabled')).toBe(true);
    const teacherStates = plan.users.filter((u) => u.role === 'teacher').map((u) => u.state).join('|');
    expect(teacherStates).toMatch(/no class yet/); expect(teacherStates).toMatch(/one class/); expect(teacherStates).toMatch(/\d classes/);
    const st = docsOf('Student');
    expect(st.map((s) => s.learnerAgeBand)).toEqual(expect.arrayContaining(['child', 'teen', 'adult']));
    expect(st.map((s) => s.status)).toEqual(expect.arrayContaining(['excelling', 'on track', 'at risk']));
    expect(st.some((s) => s.uiMode === 'kids')).toBe(true);
    expect(st.some((s) => s.archivedAt)).toBe(true);
    const enr = docsOf('ClassEnrollment');
    expect(enr.map((e) => e.status)).toEqual(expect.arrayContaining(['active', 'inactive', 'removed']));
    expect(enr.some((e) => e.scope === 'class' && e.extraVia === 'multi_class')).toBe(true);
    const prof = docsOf('ParentProfile');
    expect(prof.some((p) => p.emailVerifiedAt)).toBe(true); expect(prof.some((p) => !p.emailVerifiedAt)).toBe(true);
    expect(prof.map((p) => p.signIn)).toEqual(expect.arrayContaining(['password', 'code']));
    const links = docsOf('ParentLearnerLink');
    expect(links.map((l) => l.status)).toEqual(expect.arrayContaining(['pending', 'active', 'ended']));
    expect(links.map((l) => l.consent)).toEqual(expect.arrayContaining(['pending', 'captured']));
    const perChild = new Map<string, number>(); links.forEach((l) => perChild.set(l.studentId, (perChild.get(l.studentId) ?? 0) + 1));
    expect([...perChild.values()].some((n) => n >= 2)).toBe(true); // two guardians
    const perParent = new Map<string, number>(); links.forEach((l) => perParent.set(l.parentUserId, (perParent.get(l.parentUserId) ?? 0) + 1));
    expect([...perParent.values()].some((n) => n >= 2)).toBe(true); // several children
    const inv = plan.users.filter((u) => u.role.startsWith('invitation')).map((u) => u.state);
    expect(inv).toEqual(expect.arrayContaining(['invitation pending', 'invitation revoked', 'invitation expired (never accepted)']));
    const codes = plan.codes.map((c) => c.state);
    expect(codes).toEqual(expect.arrayContaining(['valid (30 days)', 'already used', 'cancelled by the school', 'expired']));
    const att = docsOf('AssessmentAttempt');
    expect(att.map((a) => a.gradingStatus)).toEqual(expect.arrayContaining(['released', 'needs_review', 'graded_draft']));
    expect(att.filter((a) => a.gradingStatus === 'released').every((a) => a.releasedAt instanceof Date)).toBe(true);
    expect(docsOf('Assignment').map((a) => a.state)).toEqual(expect.arrayContaining(['published', 'closed']));
    expect(docsOf('ErrorToWorkOn').map((e) => e.status)).toEqual(expect.arrayContaining(['open', 'resolved']));
    expect(new Set(docsOf('Curriculum').map((c) => c.courseName)).size).toBe(4);
    for (const m of ['GradeLedgerEntry', 'LessonProgress', 'SessionSummary', 'LearnerProfile', 'ReviewItem', 'StudentObjectiveMastery', 'StudyHabitDaily', 'TutorSession', 'TutorMessage', 'AvatarSession', 'LearningEvent', 'UsageLedger', 'ParentEmailSend', 'ReminderLog', 'Invitation', 'ParentLinkCode'])
      expect(docsOf(m).length, m).toBeGreaterThan(0);
  });

  it('spreads history over the last 8 weeks and never in the future', () => {
    const min = NOW.getTime() - 57 * 86_400_000;
    const fields: [string, string][] = [['AssessmentAttempt', 'submittedAt'], ['LearningEvent', 'at'], ['TutorSession', 'lastMessageAt'], ['TutorMessage', 'timestamp'], ['LessonProgress', 'completedAt'], ['AvatarSession', 'createdAt'], ['UsageLedger', 'createdAt'], ['ReminderLog', 'createdAt'], ['StudyHabitDaily', 'day']];
    for (const [m, f] of fields) {
      const ts = docsOf(m).map((d) => d[f]).filter(Boolean).map((d: Date) => d.getTime());
      expect(ts.length, m).toBeGreaterThan(0);
      expect(Math.min(...ts), `${m}.${f}`).toBeGreaterThanOrEqual(min);
      expect(Math.max(...ts), `${m}.${f}`).toBeLessThanOrEqual(NOW.getTime());
      expect(Math.max(...ts) - Math.min(...ts), `${m}.${f} spread`).toBeGreaterThan(20 * 86_400_000);
    }
  });

  it('shows no forbidden word in any visible string', () => {
    const strings = plan.docs.flatMap((d) => visibleStrings(d.doc)).concat(plan.users.flatMap((u) => [u.name, u.email, u.school ?? '']));
    expect(strings.length).toBeGreaterThan(1000);
    const bad = strings.filter((s) => FORBIDDEN_WORDS.test(s) || /\bseed|demo|test|sample|fake/i.test(s));
    expect(bad).toEqual([]);
  });

  it('uses our own domain, unique emails, no public figures, and no LT- ids', () => {
    const emails = docsOf('User').map((u) => u.email as string);
    expect(emails.every((e) => e.endsWith(`@${EMAIL_DOMAIN}`))).toBe(true);
    expect(new Set(emails).size).toBe(emails.length);
    expect(plan.users.filter((u) => u.email).every((u) => !/@lms-test\.example$|@demo|\.test$|\.example$/.test(u.email))).toBe(true);
    const names = plan.users.map((u) => u.name.toLowerCase());
    expect(names.filter((n) => PUBLIC_FIGURES.includes(n))).toEqual([]);
    const ids = plan.docs.flatMap((d) => Object.entries(d.doc).filter(([k, v]) => /(^id$|Id$)/.test(k) && typeof v === 'string').map(([, v]) => v as string));
    expect(ids.filter((v) => v.startsWith('LT-') || /demo|^DEMO|4level1/i.test(v))).toEqual([]);
    expect(docsOf('Institution').map((i) => i.id).filter((id) => /^LT-SCHOOL/.test(id))).toEqual([]);
  });

  it('carries no password in the plan or the users list', () => {
    expect(docsOf('User').some((u) => 'password' in u)).toBe(false);
    expect(plan.users.some((u) => 'password' in u)).toBe(false);
    expect(JSON.stringify(plan)).not.toMatch(/\$2[aby]\$/);
  });

  it('docs/lms/SEED_USERS.md matches the plan (regenerate with src/scripts/fullSeedSheet.ts)', () => {
    const file = readFileSync(path.join(__dirname, '../../docs/lms/SEED_USERS.md'), 'utf8');
    expect(file).toBe(sheet(plan.users));
    expect(file).not.toMatch(/\$2[aby]\$/);
  });

  it('refuses without SEED_USER_PASSWORD', () => {
    expect(() => seedPassword({})).toThrow(SeedRefused);
    expect(() => seedPassword({ SEED_USER_PASSWORD: '   ' })).toThrow(/not set/);
    expect(() => seedPassword({ SEED_USER_PASSWORD: 'short' })).toThrow(SeedRefused);
  });

  it('every planned document passes its model validation', () => {
    const { problems } = preparePlan(NOW, '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234');
    expect(problems).toEqual([]);
  });
});

describe('full seed run and remove (in-memory MongoDB)', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); }, 60_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  it('a missing password creates nothing', async () => {
    await expect(runFullSeed(NOW, {})).rejects.toThrow(SeedRefused);
    expect((await fullSeedStatus()).total).toBe(0);
    expect(await mongoose.connection.collection('users').countDocuments()).toBe(0);
  });

  it('runs twice without duplicates, keeps backdated dates, then removes exactly its rows', async () => {
    const other = await mongoose.connection.collection('users').insertOne({ email: 'teacher-a@lms-test.example', role: 'teacher' });
    await mongoose.connection.collection('grade_ledger').insertOne({ id: 'LT-keep', reason: 'submitted' });
    const env = { SEED_USER_PASSWORD: 'a-throwaway-value-for-this-test' };
    const first = await runFullSeed(NOW, env);
    const second = await runFullSeed(NOW, env);
    expect(second.counts).toEqual(first.counts);
    expect(JSON.stringify(first)).not.toContain(env.SEED_USER_PASSWORD);
    const status = await fullSeedStatus();
    expect(status.total).toBe(first.total);
    expect(await mongoose.connection.collection('users').countDocuments()).toBe(first.counts.users + 1);
    const att = await mongoose.connection.collection('assessmentattempts').find({}).sort({ submittedAt: 1 }).limit(1).toArray();
    expect(att[0].submittedAt.getTime()).toBeLessThan(NOW.getTime() - 30 * 86_400_000);
    expect(att[0].createdAt.getTime()).toBe(att[0].submittedAt.getTime());
    const u = await mongoose.connection.collection('users').findOne({ role: 'parent' });
    expect(u!.password).toMatch(/^\$2[aby]\$10\$/);
    const out = await removeFullSeed();
    expect(out.registryRowsDeleted).toBe(first.total);
    expect(out.deleted.grade_ledger).toBe(first.counts.grade_ledger);
    expect((await fullSeedStatus()).total).toBe(0);
    expect(await mongoose.connection.collection('users').countDocuments()).toBe(1);
    expect(await mongoose.connection.collection('users').findOne({ _id: other.insertedId })).not.toBeNull();
    expect(await mongoose.connection.collection('grade_ledger').countDocuments()).toBe(1);
  }, 120_000);
});

describe('parent link codes (owner, 22 Nov 2026)', () => {
  it('every active learner in an active school has a real, typeable code that the app accepts, the same on every run', async () => {
    const { normalizeCode, hashCode } = await import('../src/parents/codes');
    const a = buildPlan(NOW); const b = buildPlan(NOW);
    expect(a.codes.map((c) => c.code)).toEqual(b.codes.map((c) => c.code));
    const valid = a.codes.filter((c) => c.state === 'valid (30 days)');
    expect(valid.length).toBeGreaterThan(70); // the two active schools with the parent portal on
    for (const c of a.codes) {
      const n = normalizeCode(c.code)!;
      expect(n).toMatch(/^[A-Z2-9]{8}$/);
      expect(a.docs.some((d) => d.model === 'ParentLinkCode' && d.doc.codeHash === hashCode(n))).toBe(true);
    }
    expect(new Set(a.codes.map((c) => c.code)).size).toBe(a.codes.length);
    expect(valid.every((c) => c.className && c.studentEmail.endsWith('@school.enara.app'))).toBe(true);
  });
});

