import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { Batch } from '../models/Batch';
import { Curriculum } from '../models/Curriculum';
import { CourseInstance } from '../models/CourseInstance';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { TutorSession } from '../models/TutorSession';
import { Invitation, PasswordReset } from '../models/AccountToken';
import { CurriculumFileJob } from '../models/CurriculumChunk';
import { requestPasswordReset } from '../services/accountTokens';
import { initialsFromName } from '../utils/idGenerator';

// 4Level1 pilot demo seed (P1). Synthetic, fictional data for ONE institution,
// every record labelled origin 'demo_seed' so dashboards keep it out of live
// metrics. Idempotent (fixed ids, upserts). reset4Level1 deletes only that
// institution's demo_seed rows; it never touches live or other schools' data,
// and never the append-only usage ledger (its demo rows stay, filtered).
//
// Staff accounts: Teacher (teaching AND content authoring; there is no
// separate content-creator account), Academic Manager, Workspace Admin. Their
// passwords are random and discarded; access is set up through single-use,
// expiring password-reset links, printed only with --emit-setup-links.
//
// Do not run against a shared or production database.
//   npx tsx src/scripts/seed4Level1.ts --institution 4level1-pilot [--reset] [--emit-setup-links]

export const DEMO = 'demo_seed' as const;
const pre = (inst: string) => `${inst}-demo`;

export function demoStaff(inst: string) {
  return [
    { key: 'teacher', role: 'teacher' as const, name: 'Maya Teacher (demo)', email: `teacher@${inst}.demo.enara.test` },
    { key: 'academic_manager', role: 'academic_manager' as const, name: 'Omar Academic Manager (demo)', email: `academic.manager@${inst}.demo.enara.test` },
    { key: 'workspace_admin', role: 'admin' as const, name: 'Rana Workspace Admin (demo)', email: `workspace.admin@${inst}.demo.enara.test` },
  ];
}
const STUDENT_NAMES = ['Lina Demo', 'Youssef Demo', 'Sara Demo', 'Karim Demo', 'Nour Demo', 'Adam Demo'];

const randomHash = () => bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

async function upsertUser(inst: string, u: { email: string; role: 'teacher' | 'academic_manager' | 'admin' | 'student'; name: string; studentId?: string }) {
  const existing = await User.findOne({ email: u.email }).select('institutionId origin').lean();
  // Never take over a real account or another school's user.
  if (existing && (existing.institutionId !== inst || existing.origin !== DEMO)) {
    throw new Error(`refusing to overwrite non-demo user ${u.email}`);
  }
  return User.findOneAndUpdate(
    { email: u.email },
    {
      $set: { role: u.role, name: u.name, institutionId: inst, status: 'active', origin: DEMO, ...(u.studentId ? { studentId: u.studentId } : {}) },
      $setOnInsert: { email: u.email, password: await randomHash() },
    },
    { upsert: true, new: true },
  );
}

export async function seed4Level1(inst: string, opts: { emitSetupLinks?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const p = pre(inst);
  await Institution.updateOne({ id: inst }, { $setOnInsert: { id: inst, name: '4Level1 Pilot' } }, { upsert: true });

  const staff: Record<string, Awaited<ReturnType<typeof upsertUser>>> = {};
  for (const s of demoStaff(inst)) staff[s.key] = await upsertUser(inst, s);
  const teacherId = staff.teacher!._id.toString();

  const students = STUDENT_NAMES.map((name, i) => ({ id: `${p}-stu-${i + 1}`, name, email: `student${i + 1}@${inst}.demo.enara.test` }));
  for (const s of students) {
    await Student.updateOne(
      { id: s.id },
      { $set: { name: s.name, email: s.email, grade: 'Grade 8', avatar: initialsFromName(s.name), institutionId: inst, batchId: `${p}-batch`, origin: DEMO } },
      { upsert: true },
    );
    await upsertUser(inst, { email: s.email, role: 'student', name: s.name, studentId: s.id });
  }

  await Batch.updateOne({ id: `${p}-batch` }, { $set: { name: 'Grade 8 English (demo)', institutionId: inst, academicYear: '2026', studentCount: students.length, origin: DEMO } }, { upsert: true });
  await Curriculum.updateOne(
    { id: `${p}-curriculum` },
    {
      $set: {
        name: 'English Reading Skills (demo)', institutionId: inst, courseName: 'English 8', summary: 'Synthetic demo curriculum for the 4Level1 pilot.',
        lastUpdated: now.toISOString().slice(0, 10), subjectsCount: 2, status: 'draft', createdBy: teacherId, origin: DEMO,
        chapters: [{ id: `${p}-ch-1`, title: 'Finding the main idea', uploads: [], description: '' }, { id: `${p}-ch-2`, title: 'Using evidence', uploads: [], description: '' }],
      },
    },
    { upsert: true },
  );
  await CourseInstance.updateOne(
    { id: `${p}-class` },
    {
      $set: {
        courseId: `${p}-course`, courseName: 'English 8A (demo)', institutionId: inst, academicYear: '2026', batchId: `${p}-batch`, curriculumId: `${p}-curriculum`,
        instructorIds: [teacherId], studentIds: students.map((s) => s.id), visibility: 'student', origin: DEMO,
      },
    },
    { upsert: true },
  );
  await Assessment.updateOne(
    { id: `${p}-quiz` },
    {
      $set: {
        title: 'Main idea check (demo)', subject: 'English', institutionId: inst, curriculumId: `${p}-curriculum`, origin: DEMO,
        questions: [{ id: 'q1', type: 'multiple-choice', text: 'What is the main idea of a paragraph?', options: ['Its central point', 'Its first word'], correctAnswer: 'Its central point', points: 1 }],
      },
    },
    { upsert: true },
  );
  for (const [i, s] of students.entries()) {
    const correct = i % 3 !== 0;
    const at = new Date(now.getTime() - (i + 1) * 86400_000);
    await AssessmentAttempt.updateOne(
      { id: `${p}-attempt-${i + 1}` },
      {
        $set: {
          assessmentId: `${p}-quiz`, assessmentTitle: 'Main idea check (demo)', subject: 'English', studentId: s.id, institutionId: inst, status: 'submitted',
          score: correct ? 100 : 0, submittedAt: at, startedAt: at, origin: DEMO,
          answers: [{ questionId: 'q1', answer: correct ? 'Its central point' : 'Its first word', isCorrect: correct, topic: 'Main idea' }],
        },
      },
      { upsert: true },
    );
    await LearningEvent.updateOne(
      { id: `${p}-event-${i + 1}` },
      { $set: { institutionId: inst, studentId: s.id, type: 'assessment_submitted', source: 'assessment', verified: true, at, origin: DEMO } },
      { upsert: true },
    );
    await TutorSession.updateOne(
      { id: `${p}-tutor-${i + 1}` },
      { $set: { studentId: s.id, institutionId: inst, title: 'Main idea practice (demo)', courseId: `${p}-course`, mode: 'chat', messageCount: 0, lastMessageAt: at, origin: DEMO } },
      { upsert: true },
    );
  }

  // A demo document record (P2): labelled demo, and honestly not processed:
  // there is no stored file and no scanner, so it is never shown as scanned.
  await CurriculumFileJob.updateOne(
    { id: `${p}-doc-1` },
    {
      $set: {
        institutionId: inst, curriculumId: `${p}-curriculum`, lessonId: `${p}-ch-1`, fileUrl: `/uploads/${p}-reading-guide.pdf`, fileName: 'reading-guide.pdf',
        contentType: 'application/pdf', uploadedBy: teacherId, status: 'blocked', scanStatus: 'unavailable',
        scanDetail: 'Demo record: no file is stored and no malware scanner is configured.', attempts: 0, origin: DEMO,
      },
    },
    { upsert: true },
  );

  const setupLinks: Record<string, string> = {};
  if (opts.emitSetupLinks) {
    for (const s of demoStaff(inst)) {
      const token = await requestPasswordReset(s.email, { sendMail: false });
      if (token) setupLinks[s.key] = token;
    }
  }
  return { institutionId: inst, staff: demoStaff(inst).map(({ key, role, email }) => ({ key, role, email })), students: students.length, setupLinks };
}

// Deletes this institution's demo_seed rows only.
export async function reset4Level1(inst: string) {
  const scope = { institutionId: inst, origin: DEMO };
  const demoUsers = await User.find({ ...scope, role: { $ne: 'enara-admin' } }).select('_id').lean();
  const counts: Record<string, number> = {};
  const del = async (name: string, model: { deleteMany: (f: object) => Promise<{ deletedCount?: number }> }, filter: object = scope) => {
    counts[name] = (await model.deleteMany(filter)).deletedCount ?? 0;
  };
  await del('passwordResets', PasswordReset as never, { userId: { $in: demoUsers.map((u) => u._id.toString()) } });
  await del('users', User as never, { ...scope, role: { $ne: 'enara-admin' } });
  for (const [name, model] of Object.entries({ students: Student, batches: Batch, curricula: Curriculum, classes: CourseInstance, assessments: Assessment, attempts: AssessmentAttempt, learningEvents: LearningEvent, learningEvidence: LearningEvidence, tutorSessions: TutorSession, invitations: Invitation, documents: CurriculumFileJob })) {
    await del(name, model as never);
  }
  return counts;
}

if (require.main === module) {
  (async () => {
    const arg = (n: string) => {
      const i = process.argv.indexOf(n);
      return i > 0 ? process.argv[i + 1] : undefined;
    };
    const inst = arg('--institution');
    if (!inst || !/^[a-z0-9-]{3,60}$/.test(inst)) throw new Error('--institution <id> is required (lowercase letters, digits, dashes)');
    if (process.env.NODE_ENV === 'production') throw new Error('refusing to run with NODE_ENV=production');
    const dotenv = await import('dotenv');
    dotenv.config();
    const { connectDB } = await import('../config/db');
    await connectDB();
    if (process.argv.includes('--reset')) {
      console.log(JSON.stringify({ reset: await reset4Level1(inst) }));
    } else {
      const out = await seed4Level1(inst, { emitSetupLinks: process.argv.includes('--emit-setup-links') });
      // Setup tokens are single use and expire in 30 minutes; shown only when asked for.
      console.log(JSON.stringify({ ...out, setupLinks: Object.keys(out.setupLinks).length ? out.setupLinks : undefined }));
    }
    process.exit(0);
  })().catch((err) => {
    console.error(`4Level1 seed failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exit(1);
  });
}
