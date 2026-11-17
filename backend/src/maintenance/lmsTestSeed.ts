import bcrypt from 'bcryptjs';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { AttendanceSession } from '../models/AttendanceSession';
import { Batch } from '../models/Batch';
import { CourseInstance } from '../models/CourseInstance';
import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { initialsFromName } from '../utils/idGenerator';
import { ALL_FLAGS, forgetFeatureFlags } from '../services/featureFlags';

// FAKE data for the LMS test site (lms-test.enara.app) only. Every person,
// email and school here is invented. Shapes mirror real data: students in
// groups (Student.batchId), classes (CourseInstance) reached through a group
// or listed explicitly (studentIds), teachers, admins, parents, assessments
// for a group and for one student, attempts and attendance. Not every course
// is a language course (Maths and Science have no CEFR/languageSpec).
// Idempotent: fixed IDs, upserts. Called only through the maintenance route,
// which refuses any database that isn't the test cluster.

const EMAIL_DOMAIN = 'lms-test.example';
const YEAR = '2026';

const SCHOOLS = [
  { id: 'LT-SCHOOL-A', name: 'Test School A (fake)' },
  { id: 'LT-SCHOOL-B', name: 'Test School B (fake)' },
];

const GROUPS = [
  { id: 'LT-G7A', name: 'Grade 7A', school: 'LT-SCHOOL-A' },
  { id: 'LT-G7B', name: 'Grade 7B', school: 'LT-SCHOOL-A' },
  { id: 'LT-G8A', name: 'Grade 8A', school: 'LT-SCHOOL-A' },
  { id: 'LT-G9B', name: 'Grade 9', school: 'LT-SCHOOL-B' },
];

const CURRICULA = [
  {
    id: 'LT-CUR-ENG', name: 'English A1 (fake course)', type: 'Language', level: 'A1', languages: ['English'],
    summary: 'Three short fake lessons for testing.',
    chapters: [
      { title: 'Greetings', languageSpec: { objectives: ['Greet people and introduce yourself'], vocabulary: ['hello', 'goodbye', 'nice to meet you'], grammar: ["I'm / you're"], skills: ['speaking', 'writing'] } },
      { title: 'My family', languageSpec: { objectives: ['Talk about family members'], vocabulary: ['mother', 'father', 'sister', 'brother'], grammar: ['have got / has got'], skills: ['reading', 'writing'] } },
      { title: 'Daily routine', languageSpec: { objectives: ['Describe a daily routine'], vocabulary: ['get up', 'breakfast', 'school'], grammar: ['present simple'], skills: ['writing'] } },
    ],
  },
  {
    id: 'LT-CUR-MATH', name: 'Maths: fractions (fake course)', type: 'National', level: 'Grade 7', languages: ['English'],
    summary: 'Two fake maths lessons (not a language course: no CEFR).',
    chapters: [{ title: 'What is a fraction?' }, { title: 'Adding fractions' }],
  },
  {
    id: 'LT-CUR-SCI', name: 'Science: states of matter (fake course)', type: 'National', level: 'Grade 8', languages: ['English'],
    summary: 'Two fake science lessons (not a language course: no CEFR).',
    chapters: [{ title: 'Solids, liquids and gases' }, { title: 'Changing state' }],
  },
];

// Class = course taught to a group. explicit = extra students listed on the class itself.
const CLASSES = [
  { id: 'LT-C-ENG-7A', courseId: 'ENG', name: 'English 7A', school: 'LT-SCHOOL-A', group: 'LT-G7A', curriculum: 'LT-CUR-ENG', teacher: 'teacher.a1', explicit: [] as string[] },
  { id: 'LT-C-ENG-7B', courseId: 'ENG', name: 'English 7B', school: 'LT-SCHOOL-A', group: 'LT-G7B', curriculum: 'LT-CUR-ENG', teacher: 'teacher.a1', explicit: [] },
  { id: 'LT-C-MATH-7A', courseId: 'MATH', name: 'Maths 7A', school: 'LT-SCHOOL-A', group: 'LT-G7A', curriculum: 'LT-CUR-MATH', teacher: 'teacher.a2', explicit: ['LT-S-A08', 'LT-S-A09'] },
  { id: 'LT-C-SCI-8A', courseId: 'SCI', name: 'Science 8A', school: 'LT-SCHOOL-A', group: 'LT-G8A', curriculum: 'LT-CUR-SCI', teacher: 'teacher.a2', explicit: ['LT-S-A18'] },
  { id: 'LT-C-ENG-9', courseId: 'ENG', name: 'English 9', school: 'LT-SCHOOL-B', group: 'LT-G9B', curriculum: 'LT-CUR-ENG', teacher: 'teacher.b1', explicit: [] },
];

const FIRST = ['Amir', 'Bana', 'Celine', 'Dalia', 'Ehab', 'Farah', 'Ghada', 'Hadi', 'Iman', 'Jad', 'Karim', 'Layan', 'Malak', 'Nader', 'Ola', 'Rami', 'Salma', 'Tamer', 'Yara', 'Ziad', 'Hala', 'Basel'];
const kidBirth = (age: number) => new Date(Date.UTC(2026 - age, 2, 15));

// 18 fake students in school A, 4 in school B. Ages mix kids (<13) and teens.
const STUDENTS = [
  ...Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const group = n <= 7 ? 'LT-G7A' : n <= 14 ? 'LT-G7B' : n <= 17 ? 'LT-G8A' : undefined; // A18 has no group (explicit in Science 8A)
    return { id: `LT-S-A${String(n).padStart(2, '0')}`, school: 'LT-SCHOOL-A', group, name: `${FIRST[i]} Test`, age: n % 3 === 0 ? 14 : 11 };
  }),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `LT-S-B${String(i + 1).padStart(2, '0')}`, school: 'LT-SCHOOL-B', group: 'LT-G9B', name: `${FIRST[18 + i]} Sample`, age: 15 })),
];

const STAFF = [
  { key: 'admin.a', role: 'admin', name: 'Admin A (fake)', school: 'LT-SCHOOL-A' },
  { key: 'manager.a', role: 'academic_manager', name: 'Manager A (fake)', school: 'LT-SCHOOL-A' },
  { key: 'teacher.a1', role: 'teacher', name: 'Teacher A1 (fake)', school: 'LT-SCHOOL-A' },
  { key: 'teacher.a2', role: 'teacher', name: 'Teacher A2 (fake)', school: 'LT-SCHOOL-A' },
  { key: 'admin.b', role: 'admin', name: 'Admin B (fake)', school: 'LT-SCHOOL-B' },
  { key: 'teacher.b1', role: 'teacher', name: 'Teacher B1 (fake)', school: 'LT-SCHOOL-B' },
  { key: 'enara.admin', role: 'enara-admin', name: 'ENARA admin (fake)', school: undefined as string | undefined },
];

// parent key -> children (one parent has two children; one teen).
const PARENTS = [
  { key: 'parent.1', name: 'Parent One (fake)', children: ['LT-S-A01', 'LT-S-A08'] },
  { key: 'parent.2', name: 'Parent Two (fake)', children: ['LT-S-A03'] },
  { key: 'parent.3', name: 'Parent Three (fake)', children: ['LT-S-A12'] },
];

export const LMS_TEST_EMAIL_DOMAIN = EMAIL_DOMAIN;
const email = (key: string) => `${key}@${EMAIL_DOMAIN}`;

export interface SeedResult {
  schools: number; groups: number; curricula: number; classes: number; students: number;
  staff: number; parents: number; parentLinks: number; assessments: number; attempts: number; attendanceRecords: number;
}

export async function seedLmsTest(password: string): Promise<SeedResult> {
  if (typeof password !== 'string' || password.length < 12) throw new Error('A test password of at least 12 characters is required');
  const hash = await bcrypt.hash(password, 10);

  // Every feature on, like the demo school, so all screens can be tested.
  // AI stays off for the whole test site (AI_PAUSED, no provider keys).
  const features = Object.fromEntries(ALL_FLAGS.map((f) => [f, true]));
  for (const s of SCHOOLS) {
    await Institution.updateOne({ id: s.id }, { $set: { name: s.name, features } }, { upsert: true });
    forgetFeatureFlags(s.id);
  }
  for (const g of GROUPS) {
    const members = STUDENTS.filter((s) => s.group === g.id).length;
    await Batch.updateOne({ id: g.id }, { $set: { name: g.name, institutionId: g.school, academicYear: YEAR, studentCount: members, origin: 'live' } }, { upsert: true });
  }

  const userIds: Record<string, string> = {};
  const upsertUser = async (key: string, role: string, name: string, institutionId?: string, studentId?: string) => {
    const doc = await User.findOneAndUpdate(
      { email: email(key) },
      { $set: { role, name, status: 'active', origin: 'live', password: hash, ...(institutionId ? { institutionId } : {}), ...(studentId ? { studentId } : {}) } },
      { upsert: true, new: true },
    );
    userIds[key] = doc!._id.toString();
  };
  for (const s of STAFF) await upsertUser(s.key, s.role, s.name, s.school);

  for (const st of STUDENTS) {
    await Student.updateOne(
      { id: st.id },
      {
        $set: {
          name: st.name, email: email(st.id.toLowerCase()), institutionId: st.school, grade: st.age < 13 ? 'Grade 7' : 'Grade 9',
          avatar: initialsFromName(st.name), birthDate: kidBirth(st.age), origin: 'live',
          ...(st.group ? { batchId: st.group } : {}),
        },
        ...(st.group ? {} : { $unset: { batchId: 1 } }),
      },
      { upsert: true },
    );
    await upsertUser(st.id.toLowerCase(), 'student', st.name, st.school, st.id);
  }

  for (const school of SCHOOLS) {
    for (const c of CURRICULA) {
      const id = `${c.id}-${school.id.slice(-1)}`;
      await Curriculum.updateOne(
        { id },
        {
          $set: {
            name: c.name, institutionId: school.id, courseName: c.name, type: c.type, level: c.level, languages: c.languages,
            summary: c.summary, description: c.summary, lastUpdated: '2026-11-17', subjectsCount: c.chapters.length, status: 'deployed', origin: 'live',
            createdBy: userIds[school.id === 'LT-SCHOOL-A' ? 'teacher.a1' : 'teacher.b1'],
            chapters: c.chapters.map((ch, i) => ({ id: `${id}-L${i + 1}`, title: ch.title, description: `Fake lesson: ${ch.title}.`, uploads: [], ...('languageSpec' in ch ? { languageSpec: ch.languageSpec } : {}) })),
          },
        },
        { upsert: true },
      );
    }
  }

  for (const c of CLASSES) {
    await CourseInstance.updateOne(
      { id: c.id },
      {
        $set: {
          courseId: c.courseId, courseName: c.name, institutionId: c.school, academicYear: YEAR, batchId: c.group,
          curriculumId: `${c.curriculum}-${c.school.slice(-1)}`, instructorIds: [userIds[c.teacher]], studentIds: c.explicit,
          visibility: 'student', isDemo: false, origin: 'live',
        },
      },
      { upsert: true },
    );
  }

  let parentLinks = 0;
  for (const p of PARENTS) {
    await upsertUser(p.key, 'parent', p.name);
    await ParentProfile.updateOne({ userId: userIds[p.key] }, { $setOnInsert: { userId: userIds[p.key], language: 'en' } }, { upsert: true });
    for (const child of p.children) {
      await ParentLearnerLink.updateOne(
        { id: `LT-PL-${p.key}-${child}` },
        { $set: { parentUserId: userIds[p.key], studentId: child, institutionId: 'LT-SCHOOL-A', role: 'owner', status: 'active', consent: 'not_required' } },
        { upsert: true },
      );
      parentLinks += 1;
    }
  }

  const questions = [
    { id: 'q1', type: 'multiple-choice', text: 'Which word is a greeting?', options: ['hello', 'table', 'blue'], correctAnswer: 'hello', points: 1 },
    { id: 'q2', type: 'short-answer', text: 'Complete: "Nice to ___ you."', correctAnswer: 'meet', acceptedAnswers: ['meet'], points: 1 },
  ];
  const ASSESS = [
    { id: 'LT-AS-GROUP-7A', title: 'Greetings quiz (group 7A)', subject: 'English', school: 'LT-SCHOOL-A', batchId: 'LT-G7A', curriculumId: 'LT-CUR-ENG-A' },
    { id: 'LT-AS-ONE-A09', title: 'Fractions check (one student)', subject: 'Mathematics', school: 'LT-SCHOOL-A', studentId: 'LT-S-A09', curriculumId: 'LT-CUR-MATH-A' },
    { id: 'LT-AS-GROUP-9', title: 'Greetings quiz (group 9)', subject: 'English', school: 'LT-SCHOOL-B', batchId: 'LT-G9B', curriculumId: 'LT-CUR-ENG-B' },
  ];
  for (const a of ASSESS) {
    await Assessment.updateOne(
      { id: a.id },
      {
        $set: {
          title: a.title, subject: a.subject, institutionId: a.school, curriculumId: a.curriculumId, duration: 10, status: 'active', lifecycle: 'published',
          questions: a.subject === 'English' ? questions : [{ id: 'q1', type: 'short-answer', text: 'What is 1/4 + 1/4?', correctAnswer: '1/2', acceptedAnswers: ['1/2', '2/4'], points: 1 }],
          origin: 'live', ...(a.batchId ? { batchId: a.batchId } : {}), ...(a.studentId ? { studentId: a.studentId } : {}),
        },
      },
      { upsert: true },
    );
  }
  let attempts = 0;
  for (const [i, sid] of ['LT-S-A01', 'LT-S-A02', 'LT-S-A03'].entries()) {
    const score = [100, 50, 0][i];
    await AssessmentAttempt.updateOne(
      { id: `LT-AT-${sid}` },
      { $set: { assessmentId: 'LT-AS-GROUP-7A', assessmentTitle: 'Greetings quiz (group 7A)', studentId: sid, institutionId: 'LT-SCHOOL-A', status: 'submitted', score, totalPoints: 2, submittedAt: new Date('2026-11-10T09:00:00Z'), origin: 'live' } },
      { upsert: true },
    );
    attempts += 1;
  }

  await AttendanceSession.updateOne(
    { id: 'LT-ATT-ENG-7A-1' },
    { $set: { courseInstanceId: 'LT-C-ENG-7A', batchId: 'LT-G7A', teacherId: userIds['teacher.a1'], attendanceDate: new Date('2026-11-12T08:00:00Z'), institutionId: 'LT-SCHOOL-A', status: 'submitted' } },
    { upsert: true },
  );
  const g7a = STUDENTS.filter((s) => s.group === 'LT-G7A');
  for (const [i, s] of g7a.entries()) {
    await AttendanceRecord.updateOne(
      { id: `LT-ATR-${s.id}` },
      { $set: { attendanceSessionId: 'LT-ATT-ENG-7A-1', studentId: s.id, status: i === 0 ? 'absent' : 'present', markedBy: userIds['teacher.a1'], markedAt: new Date('2026-11-12T08:05:00Z') } },
      { upsert: true },
    );
  }

  return {
    schools: SCHOOLS.length, groups: GROUPS.length, curricula: CURRICULA.length * SCHOOLS.length, classes: CLASSES.length, students: STUDENTS.length,
    staff: STAFF.length, parents: PARENTS.length, parentLinks, assessments: ASSESS.length, attempts, attendanceRecords: g7a.length,
  };
}
