import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALL_OFF, ALL_ON, api, ctx, expectConsistent, mkClass, mkGroup, mkStudent, setSwitches, startArchiveFixture, stopFixture } from './archive.helpers';

// Owner's PDPL decisions for "Delete permanently" (2026-11-17,
// docs/multi-class/ARCHIVE_NOTES.md), still behind ENROLLMENT_STUDENT_ARCHIVE:
// P1 final scores and structured results kept under a random anonymous ID,
//    every free text / recording / transcript / tutor conversation deleted;
//    anonymised rows hidden in classes under MIN_GROUP_SIZE_FOR_ROWS.
// P2 safety alerts kept (admins only) and purged after the retention period.
// P5 DATA_LOG_RETENTION_DAYS on the app's own logs.

const storage = vi.hoisted(() => ({ failKeys: new Set<string>(), deleted: [] as string[] }));
vi.mock('../../src/services/uploadStorage', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    deleteUpload: async (key: string) => {
      if (storage.failKeys.has(key)) throw new Error('storage unavailable');
      storage.deleted.push(key);
    },
  };
});

const M = () => ctx.M;
let k = 0;
const DAY = 86_400_000;

beforeAll(async () => {
  await startArchiveFixture();
  for (const n of ['GradingProposal', 'SafetyAlert', 'TutorSession', 'TutorMessage', 'LearningEvent', 'ReminderLog', 'Assignment', 'AiCall', 'StudentClassChoice', 'SignInEvent']) {
    M()[n] = (await import(`../../src/models/${n}`))[n];
  }
  M().HybridShadowResult = (await import('../../src/models/HybridShadowResult')).HybridShadowResult;
  M().LmsUser = (await import('../../src/integrations/lms/models')).LmsUser;
}, 120_000);
afterAll(stopFixture);
afterEach(() => setSwitches(ALL_ON));

type S = { id: string; email: string };
type Cohort = { g: string; c: string; live: S[]; target: S; asmt: string; asg: string };

/** A group with one class, `size` students (the last is the one deleted), a group assessment and a class assignment. */
async function cohort(size: number): Promise<Cohort> {
  setSwitches(ALL_ON);
  const g = await mkGroup();
  const c = await mkClass(g);
  const all: S[] = [];
  for (let i = 0; i < size; i++) all.push(await mkStudent({ batchId: g }));
  const asmt = `asm-${g}`;
  await M().Assessment.create({
    id: asmt, title: 'PDPL quiz', subject: 'English', status: 'active', lifecycle: 'published', dueDate: '2026-12-01', institutionId: 'A', batchId: g,
    questions: [{ id: 'q1', type: 'multiple-choice', text: 'Pick one', options: ['A', 'B'], correctAnswer: 'B' }, { id: 'q2', type: 'open-response', text: 'Write a paragraph' }],
  });
  const asg = `asg-${g}`;
  await M().Assignment.create({ id: asg, institutionId: 'A', assessmentId: asmt, assessmentVersion: 1, title: 'PDPL assignment', classId: c, opensAt: new Date(Date.now() - 7 * DAY), dueAt: new Date(Date.now() - DAY), createdBy: 'teacher', state: 'closed' });
  for (const [i, s] of all.entries()) await insertAttempt(s, asmt, asg, 40 + i * 10, `TXT-${s.id}`);
  return { g, c, live: all.slice(0, -1), target: all[all.length - 1], asmt, asg };
}

/** A final (released) attempt full of the student's free text, plus its grading proposal. */
async function insertAttempt(s: S, asmt: string, asg: string | undefined, score: number, marker: string, extra: Record<string, unknown> = {}) {
  const id = `att-${s.id}-${++k}`;
  const at = new Date(Date.now() - 2 * DAY);
  await M().AssessmentAttempt.collection.insertOne({
    id, assessmentId: asmt, assessmentTitle: 'PDPL quiz', subject: 'English', studentId: s.id, institutionId: 'A', status: 'submitted', score,
    ...(asg ? { assignmentId: asg } : {}), assessmentVersion: 1, startedAt: at, submittedAt: at, timeSpentSec: 300, gradingStatus: 'released',
    totalPoints: score / 10, maxPoints: 10, finalizedAt: at, finalizedBy: 'teacher-x', releasedAt: at, overallFeedback: `Well done ${marker}`, isLate: false,
    answers: [
      { questionId: 'q1', questionText: 'Pick one', studentAnswer: 'B', correctAnswer: 'B', isCorrect: true, explanation: `because ${marker}`, points: 5, maxPoints: 5, method: 'rule' },
      { questionId: 'q2', questionText: 'Write a paragraph', studentAnswer: `My essay ${marker}`, isCorrect: score >= 50, explanation: '', points: score / 20, maxPoints: 5, method: 'ai',
        feedback: `You wrote "${marker}"`, scoreExplanation: `quote ${marker}`, strengths: [`good ${marker}`], improvements: [`more ${marker}`], proposalId: `gp-${id}`,
        criterionScores: [{ criterionId: 'c1', levelId: 'l2', points: score / 20 }] },
    ],
    conversation: [{ questionId: 'q2', role: 'student', text: `transcript ${marker}`, at, source: 'speech', audioSeconds: 12 }],
    speaking: { mode: 'voice_only', settingsVersion: 1, consentAt: at, voiceSessionId: `vs-${marker}`, studentTurns: 2, noSpeechCount: 0, audioSeconds: 12, notAssessed: [] },
    appeals: [{ id: 'ap1', message: `appeal ${marker}`, createdAt: at, status: 'open' }],
    draftAnswers: { q2: `draft ${marker}` },
    history: [{ at, by: `user-${marker}`, action: 'submitted', reason: marker }],
    intelligenceStatus: 'pending', origin: 'live', createdAt: at, updatedAt: at, ...extra,
  });
  await M().GradingProposal.collection.insertOne({
    id: `gp-${id}`, institutionId: 'A', attemptId: id, assignmentId: asg, questionId: 'q2', kind: 'rubric', run: 1, status: 'proposed',
    criteria: [{ criterionId: 'c1', levelId: 'l2', points: score / 20, evidence: [`"${marker}"`], rationale: `the student said ${marker}` }],
    points: score / 20, maxPoints: 5, feedback: `feedback ${marker}`, scoreExplanation: `explains ${marker}`, strengths: [marker], improvements: [marker],
    confidence: 'high', flags: [], modelName: 'm', promptVersion: 'v1', createdAt: at,
  });
  return id;
}

/** Everything else the code keeps about a student: tutor, learning, safety, logs, LMS, usage. */
async function personalData(s: S, cohortIds: Cohort) {
  const user = await M().User.findOne({ studentId: s.id }).lean();
  const uid = String(user._id);
  const mk = `TXT-${s.id}`;
  await M().TutorSession.collection.insertOne({ id: `ts-${s.id}`, studentId: s.id, institutionId: 'A', title: `chat ${mk}`, createdAt: new Date() });
  await M().TutorMessage.collection.insertOne({ id: `tm-${s.id}`, sessionId: `ts-${s.id}`, studentId: s.id, role: 'user', content: `tutor ${mk}`, timestamp: new Date() });
  await M().LearningEvent.collection.insertOne({ id: `le-${s.id}`, studentId: s.id, institutionId: 'A', type: 'question_answered', source: 'assessment', verified: true, refs: { attemptId: 'x' }, outcome: { correct: true, answer: `answer ${mk}` }, at: new Date() });
  await M().SafetyAlert.create({ id: `sa-${s.id}`, studentId: s.id, institutionId: 'A', category: 'personal_details', subtype: 'phone', actionTaken: 'blocked', excerpt: `ALERT-${s.id}`, sessionId: `ts-${s.id}`, detector: 'pattern', beta: false, reviewRequired: false });
  await M().ReminderLog.create({ kind: 'student_reminder', recipientKey: s.id, to: s.email, subject: 'Reminder' });
  await M().StudentClassChoice.create({ studentId: s.id, institutionId: 'A', classId: cohortIds.c, usedAt: new Date() });
  await M().LmsUser.create({ platformId: 'p1', institutionId: 'A', externalUserId: `ext-${s.id}`, enaraUserId: uid, email: s.email, givenName: 'Given', familyName: 'Family' });
  await M().AiCall.create({ feature: 'tutor', provider: 'anthropic', modelName: 'm', status: 'ok', institutionId: 'A', userId: uid, studentId: s.id });
  // Not final: an open attempt and one on an assessment made for this student only (group of one).
  await M().AssessmentAttempt.collection.insertOne({ id: `open-${s.id}`, assessmentId: cohortIds.asmt + '-other', assessmentTitle: 'Other', studentId: s.id, institutionId: 'A', status: 'in-progress', draftAnswers: { q: `draft ${mk}` }, answers: [], history: [] });
  await M().Assessment.create({ id: `personal-${s.id}`, title: 'Just for you', subject: 'English', status: 'active', dueDate: '2026-12-01', institutionId: 'A', studentId: s.id, questions: [] });
  await insertAttempt(s, `personal-${s.id}`, undefined, 90, mk);
  const attemptId = (await M().AssessmentAttempt.findOne({ studentId: s.id, assessmentId: cohortIds.asmt }).lean()).id;
  await M().HybridShadowResult.collection.insertOne({ key: `hk-${attemptId}`, institutionId: 'A', attemptId, questionId: 'q2', graderVersion: 'v1', status: 'done', claimedAt: new Date(), answerSha256: 'abc', correlationId: 'c' });
  await M().UsageLedger.collection.insertOne({ id: `ul-${s.id}`, operationKey: `op-${s.id}`, studentId: s.id, userId: uid, institutionId: 'A', feature: 'tutor', refs: { attemptId } });
  return { uid, attemptId, marker: mk };
}

const del = (s: S) => api('admin@a.test', 'delete', `/api/students/${s.id}`, { confirm: `DELETE ${s.id}` });
const report = (asmt: string) => api('admin@a.test', 'get', `/api/assessments/${asmt}/attempts`);
const assignment = (asg: string) => api('admin@a.test', 'get', `/api/assignments/${asg}`);
const liveRows = (r: { body: { students: { anonymised?: boolean }[] } }) => r.body.students.filter((x) => !x.anonymised);

/** Every document of every collection in the database, as text, by collection. */
async function everyCollection(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const db = mongoose.connection.db!;
  for (const { name } of await db.listCollections().toArray()) out[name] = (await db.collection(name).find({}).toArray()).map((d) => JSON.stringify(d));
  return out;
}
const where = (all: Record<string, string[]>, needle: string) => Object.entries(all).filter(([, docs]) => docs.some((d) => d.includes(needle))).map(([n]) => n).sort();

describe('PDPL P1: results kept anonymised, everything the student wrote removed', () => {
  it('keeps the structured result under a random ID, with the same aggregates, and leaves no text, transcript or tutor content anywhere', async () => {
    const co = await cohort(5);
    const { uid, attemptId, marker } = await personalData(co.target, co);
    const before = await report(co.asmt);
    const beforeAsg = await assignment(co.asg);
    expect(before.body.summary).toMatchObject({ submitted: 5, averageScore: 60 });

    const r = await del(co.target);
    expect(r.status).toBe(200);
    expect(r.body.anonymised).toMatchObject({ assessment_attempts: 1, grading_proposals: 1 });
    expect(r.body.removed).toMatchObject({ assessment_attempts: 2, grading_proposals: 1, tutor_sessions: 1, tutor_messages: 1, learning_events: 1, reminder_logs: 1, lms_users: 1, student_class_choices: 1, hybrid_shadow_results: 1, assessments_for_this_student_only: 1 });
    expect(r.body.kept).toEqual({ usage_ledger_rows_with_ids: 1, safety_alerts: 1 });

    // The kept result: anonymous student, new attempt ID, structured fields only.
    const kept = await M().AssessmentAttempt.collection.find({ anonymised: true, assessmentId: co.asmt }).toArray();
    expect(kept).toHaveLength(1);
    const t = kept[0];
    expect(t.studentId).toMatch(/^anon_[0-9a-f-]{36}$/);
    expect(t.studentId).not.toContain(co.target.id);
    expect(t.id).not.toBe(attemptId);
    expect(Object.keys(t).sort()).toEqual(['_id', 'anonymised', 'answers', 'assessmentId', 'assessmentTitle', 'assessmentVersion', 'assignmentId', 'createdAt', 'finalizedAt', 'gradingStatus', 'history', 'id', 'institutionId', 'isLate', 'maxPoints', 'origin', 'releasedAt', 'score', 'startedAt', 'status', 'studentId', 'subject', 'submittedAt', 'timeSpentSec', 'totalPoints', 'updatedAt'].sort());
    expect(t).toMatchObject({ score: 80, status: 'submitted', gradingStatus: 'released', assignmentId: co.asg, maxPoints: 10, history: [] });
    expect(t.answers).toEqual([
      { questionId: 'q1', isCorrect: true, points: 5, maxPoints: 5, method: 'rule' },
      { questionId: 'q2', isCorrect: true, points: 4, maxPoints: 5, method: 'ai', criterionScores: [{ criterionId: 'c1', levelId: 'l2', points: 4 }], proposalId: expect.stringMatching(/^gp_anon_/) },
    ]);
    const p = await M().GradingProposal.collection.findOne({ attemptId: t.id });
    expect(p).toMatchObject({ id: t.answers[1].proposalId, points: 4, maxPoints: 5, criteria: [{ criterionId: 'c1', levelId: 'l2', points: 4, evidence: [] }] });
    expect(p.feedback ?? p.scoreExplanation ?? p.strengths ?? p.criteria[0].rationale).toBeUndefined();

    // Aggregates are unchanged; the class has 5 (4 live + 1 anonymised), so the row is shown, without name.
    const after = await report(co.asmt);
    expect(after.body.summary).toMatchObject({ assigned: 5, submitted: 5, averageScore: 60, highestScore: 80, lowestScore: 40, anonymisedStudents: 1, anonymisedRowsShown: true });
    expect(after.body.questions).toEqual(before.body.questions);
    expect(liveRows(after)).toEqual(before.body.students.filter((x: { studentId: string }) => x.studentId !== co.target.id));
    const anonRow = after.body.students.find((x: { anonymised?: boolean }) => x.anonymised);
    expect(anonRow).toMatchObject({ studentId: t.studentId, name: 'Deleted student', score: 80, attemptId: t.id });
    expect(anonRow.email).toBeUndefined();
    const afterAsg = await assignment(co.asg);
    expect(afterAsg.body.roster).toEqual(beforeAsg.body.roster.filter((x: { studentId: string }) => x.studentId !== co.target.id));
    expect(afterAsg.body.anonymisedResults).toMatchObject({ students: 1, graded: 1, averageScore: 80, rowsShown: true, rows: [{ studentId: t.studentId, name: 'Deleted student', score: 80 }] });
    // Not a work item: not in the grading queue, not openable or changeable.
    const q = await api('admin@a.test', 'get', `/api/grading/queue?assignmentId=${co.asg}&status=released`);
    expect(q.body.items.map((x: { studentId: string }) => x.studentId)).not.toContain(t.studentId);
    expect(q.body.items).toHaveLength(4);
    expect((await api('admin@a.test', 'get', `/api/grading/attempts/${t.id}`)).status).toBe(404);
    expect((await api('admin@a.test', 'post', `/api/grading/attempts/${t.id}/release`)).status).toBe(404);

    // Nothing anywhere: every collection in the database is searched.
    const all = await everyCollection();
    // P3/P4 (accepted): the usage ledger and the audit trail keep bare IDs. P2: the kept safety alert.
    expect(where(all, co.target.id)).toEqual(['audit_events', 'safety_alerts', 'usage_ledger']);
    expect(where(all, uid).filter((n) => !['audit_events', 'usage_ledger'].includes(n))).toEqual([]);
    expect(where(all, co.target.email)).toEqual([]);
    expect(where(all, marker)).toEqual([]); // answers, essays, feedback quoting them, transcripts, appeals, drafts, tutor and event text
    expect(where(all, `ALERT-${co.target.id}`)).toEqual(['safety_alerts']);
    // The old attempt ID survives only in the usage ledger row (P3), and nothing links it to the new one.
    expect(where(all, attemptId)).toEqual(['usage_ledger']);
    // The anonymous ID is only on the kept results: not in the reply, the audit trail, the ledger or the alert.
    expect(where(all, t.studentId)).toEqual([M().AssessmentAttempt.collection.name]);
    expect(JSON.stringify(r.body)).not.toContain(t.studentId);
    await expectConsistent();
  });

  it('small class (under 5 with the deleted student): only aggregates, never the anonymised row', async () => {
    const co = await cohort(3);
    const before = await report(co.asmt);
    expect((await del(co.target)).status).toBe(200);
    const after = await report(co.asmt);
    expect(after.body.summary).toMatchObject({ assigned: 3, submitted: 3, averageScore: before.body.summary.averageScore, anonymisedStudents: 1, anonymisedRowsShown: false });
    expect(after.body.questions).toEqual(before.body.questions);
    expect(after.body.students).toEqual(before.body.students.filter((x: { studentId: string }) => x.studentId !== co.target.id));
    expect(after.body.students.some((x: { anonymised?: boolean }) => x.anonymised)).toBe(false);
    const a = await assignment(co.asg);
    expect(a.body.anonymisedResults).toEqual({ students: 1, graded: 1, averageScore: 60, rowsShown: false, rows: [] });
    expect(a.body.roster).toHaveLength(2);
    // Two deletions, two unrelated anonymous IDs (random, per student).
    const other = await cohort(5);
    await del(other.target);
    const ids = await M().AssessmentAttempt.distinct('studentId', { anonymised: true, assessmentId: { $in: [co.asmt, other.asmt] } });
    expect(ids).toHaveLength(2);
    // A second deletion in the small class makes it 4: still aggregates only.
    await del(co.live[0]);
    const again = await report(co.asmt);
    expect(again.body.summary).toMatchObject({ assigned: 3, anonymisedStudents: 2, anonymisedRowsShown: false });
    expect(again.body.students).toHaveLength(1);
  });

  it('a photo that storage could not delete is reported with its key (best effort)', async () => {
    const s = await mkStudent();
    await M().Student.updateOne({ id: s.id }, { $set: { photoKey: `photo-ok-${s.id}.jpg`, pendingPhotoKey: `photo-fail-${s.id}.jpg` } });
    storage.failKeys.add(`photo-fail-${s.id}.jpg`);
    const r = await del(s);
    expect(r.body.files).toEqual({ deleted: 1, failed: 1, failedKeys: [`photo-fail-${s.id}.jpg`] });
    expect(storage.deleted).toContain(`photo-ok-${s.id}.jpg`);
    const audit = await M().AuditEvent.findOne({ action: 'student.deleted_permanently', targetId: s.id }).lean();
    expect(audit.detail.files.failedKeys).toEqual([`photo-fail-${s.id}.jpg`]);
  });
});

describe('PDPL P2: safety alerts kept for admins, purged after the retention period', () => {
  it('are visible to school and ENARA admins only, and purged after SAFETY_ALERT_RETENTION_DAYS (dry run first)', async () => {
    const co = await cohort(2);
    await personalData(co.target, co);
    await del(co.target);
    const a = await M().SafetyAlert.findOne({ id: `sa-${co.target.id}` }).lean();
    expect(a).toMatchObject({ subjectDeleted: true, excerpt: `ALERT-${co.target.id}` });
    expect(a.sessionId).toBeUndefined();

    const list = await api('admin@a.test', 'get', '/api/students/deleted-safety-alerts');
    expect(list.status).toBe(200);
    expect(list.body.retentionDays).toBe(730);
    expect(list.body.alerts.map((x: { id: string }) => x.id)).toContain(a.id);
    expect((await api('enara@x.test', 'get', '/api/students/deleted-safety-alerts')).body.alerts.map((x: { id: string }) => x.id)).toContain(a.id);
    expect((await api('admin@b.test', 'get', '/api/students/deleted-safety-alerts')).body.alerts).toEqual([]);
    expect((await api('teacher@a.test', 'get', '/api/students/deleted-safety-alerts')).status).toBe(403);
    expect((await api(co.live[0].email, 'get', '/api/students/deleted-safety-alerts')).status).toBe(403);

    // Retention purge: only kept alerts of deleted students, older than the period.
    await M().SafetyAlert.updateOne({ id: a.id }, { $set: { createdAt: new Date(Date.now() - 800 * DAY) } });
    await M().SafetyAlert.create({ id: `recent-${co.target.id}`, studentId: co.target.id, institutionId: 'A', category: 'distress', actionTaken: 'flagged', detector: 'classifier', beta: true, reviewRequired: true, subjectDeleted: true, createdAt: new Date(Date.now() - 10 * DAY) });
    await M().SafetyAlert.create({ id: `live-${co.live[0].id}`, studentId: co.live[0].id, institutionId: 'A', category: 'distress', actionTaken: 'flagged', detector: 'classifier', beta: true, reviewRequired: true, createdAt: new Date(Date.now() - 900 * DAY) });
    const { purgeDeletedStudentAlerts } = await import('../../src/services/pdplRetention');
    const dry = await purgeDeletedStudentAlerts();
    expect(dry).toMatchObject({ dryRun: true, retentionDays: 730, due: 1, deleted: 0 });
    expect(await M().SafetyAlert.countDocuments({ id: a.id })).toBe(1);
    expect(await purgeDeletedStudentAlerts({ apply: true })).toMatchObject({ dryRun: false, due: 1, deleted: 1 });
    expect(await M().SafetyAlert.countDocuments({ id: a.id })).toBe(0);
    expect(await M().SafetyAlert.countDocuments({ id: { $in: [`recent-${co.target.id}`, `live-${co.live[0].id}`] } })).toBe(2);
    // The period is a setting.
    process.env.SAFETY_ALERT_RETENTION_DAYS = '5';
    try {
      expect(await purgeDeletedStudentAlerts({ apply: true })).toMatchObject({ retentionDays: 5, deleted: 1 });
    } finally {
      delete process.env.SAFETY_ALERT_RETENTION_DAYS;
    }
    expect(await M().SafetyAlert.countDocuments({ id: `live-${co.live[0].id}` })).toBe(1); // a live student's alert is never purged here
  });
});

describe('PDPL P5: data log retention (DATA_LOG_RETENTION_DAYS)', () => {
  it('the migration moves the sign-in and sent-email TTL indexes to the setting; AI call records lose their person links (dry run first)', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((m) => m.id === '2026-11-17-pdpl-data-log-retention')!;
    const ttl = async (model: { collection: { indexes(): Promise<{ key: Record<string, unknown>; expireAfterSeconds?: number }[]> } }, field: string) =>
      (await model.collection.indexes()).find((i) => i.key[field] === 1 && i.expireAfterSeconds !== undefined)?.expireAfterSeconds;
    await M().ReminderLog.init();
    await M().SignInEvent.init();
    await M().ReminderLog.collection.dropIndexes();
    await M().ReminderLog.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }); // as on the real site today
    await mig.up();
    expect([await ttl(M().ReminderLog, 'createdAt'), await ttl(M().SignInEvent, 'at')]).toEqual([30 * 86400, 30 * 86400]);
    await mig.up(); // idempotent
    process.env.DATA_LOG_RETENTION_DAYS = '10';
    try {
      await mig.up();
      expect([await ttl(M().ReminderLog, 'createdAt'), await ttl(M().SignInEvent, 'at')]).toEqual([10 * 86400, 10 * 86400]);
      process.env.DATA_LOG_RETENTION_DAYS = '30';
      await mig.up();
    } finally {
      delete process.env.DATA_LOG_RETENTION_DAYS;
    }
    expect((await M().SignInEvent.collection.indexes()).find((i: { key: Record<string, unknown> }) => i.key.at === 1).name).toBe('retention_30d');

    await M().AiCall.deleteMany({});
    await M().AiCall.create({ feature: 'f', provider: 'anthropic', modelName: 'm', status: 'ok', userId: 'u-old', studentId: 's-old', requestId: 'r-old', costUsd: 1, createdAt: new Date(Date.now() - 40 * DAY) });
    await M().AiCall.create({ feature: 'f', provider: 'anthropic', modelName: 'm', status: 'ok', userId: 'u-new', studentId: 's-new', requestId: 'r-new', costUsd: 2, createdAt: new Date(Date.now() - 5 * DAY) });
    const { anonymiseOldAiCalls } = await import('../../src/services/pdplRetention');
    expect(await anonymiseOldAiCalls()).toMatchObject({ dryRun: true, retentionDays: 30, due: 1, anonymised: 0 });
    expect(await M().AiCall.countDocuments({ userId: 'u-old' })).toBe(1);
    expect(await anonymiseOldAiCalls({ apply: true })).toMatchObject({ due: 1, anonymised: 1 });
    const rows = await M().AiCall.find({}).sort({ createdAt: 1 }).lean();
    expect(rows.map((x: { userId?: string; studentId?: string; requestId?: string; costUsd: number }) => [x.userId, x.studentId, x.requestId, x.costUsd])).toEqual([[undefined, undefined, undefined, 1], ['u-new', 's-new', 'r-new', 2]]);
  });
});

describe('switches off: nothing changes', () => {
  it('the old delete keeps attempts, alerts and text as before; reports and the new route are as before', async () => {
    const co = await cohort(5);
    await personalData(co.target, co);
    const reports = async () => [await report(co.asmt), await assignment(co.asg), await api('admin@a.test', 'get', `/api/grading/queue?assignmentId=${co.asg}`)];
    const on = await reports();
    setSwitches(ALL_OFF);
    expect(await reports()).toEqual(on); // nothing anonymised exists: reports identical
    const attemptsBefore = await M().AssessmentAttempt.collection.find({ studentId: co.target.id }).toArray();
    const alertBefore = await M().SafetyAlert.collection.findOne({ studentId: co.target.id });
    const r = await api('admin@a.test', 'delete', `/api/students/${co.target.id}`);
    expect([r.status, r.body.message]).toEqual([200, 'Student deleted']);
    expect(await M().AssessmentAttempt.collection.find({ studentId: co.target.id }).toArray()).toEqual(attemptsBefore);
    expect(await M().SafetyAlert.collection.findOne({ studentId: co.target.id })).toEqual(alertBefore);
    expect(await M().AssessmentAttempt.countDocuments({ anonymised: true, assessmentId: co.asmt })).toBe(0);
    const after = await report(co.asmt);
    expect(after.body.summary.anonymisedStudents).toBeUndefined();
    expect((await assignment(co.asg)).body.anonymisedResults).toBeUndefined();
    const strip = (x: { status: number; body: any }) => ({ status: x.status, body: { ...x.body, error: x.body.error && { ...x.body.error, requestId: undefined } } }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(strip(await api('admin@a.test', 'get', '/api/students/deleted-safety-alerts'))).toEqual(strip(await api('admin@a.test', 'get', '/api/students/no-such-student')));
  });
});
