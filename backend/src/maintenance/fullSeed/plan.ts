// Full seed plan (lms-test only; docs/lms/FULL_SEED_PLAN.md, owner "Approved" 22 Nov 2026). Pure: given the run time it returns every
// document to write, with fixed IDs and names (a seeded random generator), and dates spread over the last 8 weeks. run.ts writes them
// and lists each one in the hidden seed_registry; remove.ts deletes exactly those. Users carry no password here: run.ts adds the bcrypt
// hash of SEED_USER_PASSWORD on the server.
import { createHash } from 'crypto';
import { CODE_ALPHABET, hashCode } from '../../parents/codes';
import { formOutcomes } from '../../parents/levels';
import { addSchoolAppSeed, schoolAppSeeded, SCHOOL_APP_SECTIONS_ON, type SeedLink } from './schoolApp';
import { EMAIL_DOMAIN, FAMILY, FEMALE, INTL, MALE, PUBLIC_FIGURES, SCHOOLS, SUBJECTS, type SchoolDef, type SubjectKey } from './content';

export const SEED_BATCH = 'full-v1';
/** run.ts replaces this with the current price catalogue version (kept out of the pure plan). */
export const PRICE_VERSION_SLOT = '__price_version__';
export type ModelName =
  | 'Institution' | 'User' | 'Student' | 'Batch' | 'Curriculum' | 'CourseInstance' | 'ClassEnrollment' | 'LearningObjective' | 'ParentProfile'
  | 'ParentLearnerLink' | 'ParentLinkCode' | 'Invitation' | 'LmsOnboarding' | 'Assessment' | 'AssessmentVersion' | 'Assignment' | 'AssessmentAttempt'
  | 'GradeLedgerEntry' | 'LessonProgress' | 'ErrorToWorkOn' | 'SessionSummary' | 'LearnerProfile' | 'StudyHabitDaily' | 'ReviewItem'
  | 'StudentObjectiveMastery' | 'TutorSession' | 'TutorMessage' | 'AvatarSession' | 'LearningEvent' | 'UsageLedger' | 'ParentEmailSend' | 'ReminderLog'
  | 'SchoolTimetableEntry' | 'SchoolDailyAttendance' | 'SchoolAnnouncement' | 'SchoolImport' | 'ParentNotification' | 'SchoolInstalment' | 'SchoolBusRoute' | 'SchoolBusAssignment' | 'SchoolBusNotice' | 'SchoolRequest' | 'SchoolConsentForm' | 'SchoolConsent' | 'BusHome' | 'BusLiveSettings';
export interface PlannedDoc { model: ModelName; key: string; doc: Record<string, unknown> }
export interface SeedUser { key: string; role: string; name: string; email: string; schoolId?: string; school?: string; state: string; userId: string }
/** A parent link code a parent can type (owner, 22 Nov 2026: "write their codes and link those codes to the students accounts"). */
export interface SeedCode { code: string; studentName: string; studentEmail: string; className: string; school: string; state: string; parents: string[] }
export interface FullSeedPlan { docs: PlannedDoc[]; users: SeedUser[]; codes: SeedCode[] }
/** A real code in the app's format (ENR-XXXX-XXXX), the same on every run: the app stores only its hash. */
export function seedCode(key: string): { display: string; normalized: string } {
  const bytes = createHash('sha256').update(`enara-parent-code:${key}`).digest();
  let raw = ''; for (let i = 0; raw.length < 8 && i < bytes.length; i++) if (bytes[i] < 248) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return { display: `ENR-${raw.slice(0, 4)}-${raw.slice(4)}`, normalized: raw };
}

/** A fixed 24-hex ObjectId from a key, so a re-run writes the same documents. */
export const oid = (key: string) => createHash('sha1').update(`enara-full-v1:${key}`).digest('hex').slice(0, 24);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** One planned family (familyPlan.ts): its parent and children, put in the first school of the run. */
export interface PlannedFamily {
  family: string;
  parent: { first: string; last: string; sex: 'm' | 'f'; email: string };
  kids: { first: string; sex: 'm' | 'f'; group: string; ability: number }[];
  /** The mark of a family child for one subject and assignment (1..5), and whether it waits for the teacher; null: not submitted. */
  mark: (first: string, subject: SubjectKey, assignment: number) => { score: number; waiting: boolean } | null;
}
export interface PlanOptions { schools?: SchoolDef[]; seed?: number; emailDomain?: string; family?: PlannedFamily }

export function buildPlan(now: Date, opts: PlanOptions = {}): FullSeedPlan {
  const R = rng(opts.seed ?? 20261122);
  const SCHOOL_LIST = opts.schools ?? SCHOOLS;
  const FAM = opts.family;
  const famKid = (s: { first: string; family: string }) => (FAM && s.family === FAM.family ? FAM.kids.find((k) => k.first === s.first) : undefined);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(R() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));
  const DAY = 86_400_000;
  const ago = (days: number, hour = 10, min = 0) => { const d = new Date(now.getTime() - days * DAY); d.setUTCHours(hour, min, 0, 0); return d; };
  /** Like ago(), for things that already happened: never later than 20 minutes before the run. */
  const past = (days: number, hour = 10, min = 0) => { const d = ago(days, hour, min); const cap = now.getTime() - 20 * 60_000; return d.getTime() > cap ? new Date(cap) : d; };
  const docs: PlannedDoc[] = []; const users: SeedUser[] = []; const codes: SeedCode[] = []; const parentsOf = new Map<string, string[]>(); const activeLinks: SeedLink[] = [];
  const add = (model: ModelName, key: string, doc: Record<string, unknown>) => { docs.push({ model, key, doc: { _id: oid(`${model}:${key}`), ...doc } }); };
  const usedEmails = new Set<string>(); const usedNames = new Set<string>();
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, '');
  const emailFor = (first: string, last: string) => {
    const domain = opts.emailDomain ?? EMAIL_DOMAIN;
    const base = `${slug(first)}.${slug(last)}`; let e = `${base}@${domain}`; let n = 2;
    while (usedEmails.has(e)) e = `${base}${n++}@${domain}`;
    usedEmails.add(e); return e;
  };
  const person = (sex?: 'm' | 'f', family?: string, intlChance = 0.12): { first: string; last: string; sex: 'm' | 'f' } => {
    for (;;) {
      let first: string; let last: string; let s: 'm' | 'f';
      if (!family && R() < intlChance) { const p = pick(INTL); [first, last, s] = [p[0], p[1], p[2]]; if (sex && s !== sex) continue; }
      else { s = sex ?? (R() < 0.5 ? 'm' : 'f'); first = pick(s === 'm' ? MALE : FEMALE); last = family ?? pick(FAMILY); }
      const full = `${first} ${last}`.toLowerCase();
      if (PUBLIC_FIGURES.includes(full) || usedNames.has(full)) { if (family && R() < 0.02) family = undefined; continue; }
      usedNames.add(full); return { first, last, sex: s };
    }
  };
  const uid = (key: string) => oid(`User:${key}`);
  const user = (key: string, p: { first: string; last: string }, role: string, state: string, school?: SchoolDef, extra: Record<string, unknown> = {}, createdAt = ago(60)) => {
    const name = `${p.first} ${p.last}`; const email = emailFor(p.first, p.last);
    add('User', key, { email, role, name, status: 'active', origin: 'live', tokenVersion: 0, ...(school ? { institutionId: school.id } : {}), createdAt, updatedAt: createdAt, ...extra });
    users.push({ key, role, name, email, schoolId: school?.id, school: school?.name, state, userId: uid(key) });
    return { id: uid(key), email, name };
  };

  // ---------------------------------------------------------------- platform
  if (!FAM) user('platform.admin', { first: 'Mariam', last: 'Shawky' }, 'enara-admin', 'active platform admin', undefined, {}, ago(90));
  usedNames.add('mariam shawky');
  if (FAM) { usedNames.add(`${FAM.parent.first} ${FAM.parent.last}`.toLowerCase()); for (const k of FAM.kids) usedNames.add(`${k.first} ${FAM.family}`.toLowerCase()); }

  interface StudentRec { key: string; id: string; userId: string; name: string; first: string; family: string; school: SchoolDef; group: string; age: number; ability: number; classes: string[]; archived: boolean; state: string; kids: boolean }
  const allStudents: StudentRec[] = [];

  for (const [si, school] of SCHOOL_LIST.entries()) {
    const S = school.id.replace('SCH-', '');
    const created = ago(school.createdDaysAgo, 9);
    // ---------------------------------------------------------------- staff
    const admin = user(`${S}.admin`, person(), 'admin', school.status === 'suspended' ? 'school admin, school suspended' : 'school admin', school, {}, created);
    const manager = si < 2 ? user(`${S}.manager`, person(), 'academic_manager', 'academic manager (school insights)', school, {}, ago(school.createdDaysAgo - 2)) : null;
    const nTeachers = [4, 3, 1, 1][si];
    const teachers = Array.from({ length: nTeachers }, (_, i) => ({ key: `${S}.teacher${i + 1}`, p: person() }));
    add('Institution', school.id, {
      id: school.id, name: school.name, status: school.status, createdBy: uid('platform.admin'), contactName: admin.name, contactEmail: admin.email,
      timeZone: 'Africa/Cairo', country: 'EG', emailLanguage: school.emailLanguage, ...(school.lmsSystem ? { lmsSystem: school.lmsSystem } : {}),
      parentPortal: { access: school.portal, showResults: school.results, codeTtlDays: 14, teachersMayIssueCodes: true, updatedAt: created, updatedBy: admin.email, emails: { linkConfirmed: true, weeklySummary: true, newResults: true, linkEnded: true } },
      learningSettings: { pathwayMode: school.pathwayMode, ...(school.adultLearners ? { adultLearners: true } : {}) },
      ...(schoolAppSeeded(school) ? { schoolApp: { sections: SCHOOL_APP_SECTIONS_ON, updatedAt: created, updatedBy: admin.email } } : {}),
      createdAt: created, updatedAt: created,
    });

    // ---------------------------------------------------------------- content: curricula, lessons, objectives, assessments
    const subjects = [...new Set(school.groups.flatMap((g) => g.subjects))] as SubjectKey[];
    const curId = (k: SubjectKey) => `CUR-${S}-${k}`;
    for (const k of subjects) {
      const sub = SUBJECTS[k];
      const level = k === 'ENG' ? (school.adultLearners ? 'B1' : 'A2') : school.groups[0].name.replace(/[A-Z]$|\s\w+$/, '').trim();
      add('Curriculum', curId(k), {
        id: curId(k), name: sub.courseName, institutionId: school.id, courseName: sub.courseName, type: sub.type, level, languages: sub.languages,
        summary: k === 'ARB' ? 'قواعد اللغة العربية للمرحلة' : `${sub.courseName} for ${school.name}`, description: k === 'ARB' ? 'دروس النحو الأساسية' : `${sub.courseName} course`, lastUpdated: ago(school.createdDaysAgo - 3).toISOString().slice(0, 10),
        subjectsCount: sub.lessons.length, status: 'deployed', origin: 'live', createdBy: uid(teachers[0].key),
        chapters: sub.lessons.map((l, i) => ({ id: `${curId(k)}-L${i + 1}`, title: l.title, description: l.title, uploads: [], ...(l.spec ? { languageSpec: l.spec } : {}) })),
        createdAt: ago(school.createdDaysAgo - 3), updatedAt: ago(school.createdDaysAgo - 3),
      });
      sub.objectives.forEach((o, i) => add('LearningObjective', `${curId(k)}-O${i + 1}`, {
        id: `${curId(k)}-O${i + 1}`, institutionId: school.id, curriculumId: curId(k), courseId: k, lessonIds: [`${curId(k)}-L${i * 2 + 1}`], code: o.code, title: o.title,
        description: o.title, language: sub.rtl ? 'ar' : 'en', difficultyLevel: 2 + (i % 3), status: 'approved', version: 1, origin: 'teacher', approvedBy: manager?.id ?? admin.id,
        approvedAt: ago(school.createdDaysAgo - 4), createdBy: uid(teachers[0].key), createdAt: ago(school.createdDaysAgo - 4), updatedAt: ago(school.createdDaysAgo - 4),
      }));
      sub.quizzes.forEach((q, i) => {
        const id = `AS-${S}-${k}-${i + 1}`; const questions = q.questions.map((x) => ({ id: x.id, type: x.type, text: x.text, ...(x.options ? { options: x.options } : {}), correctAnswer: x.correctAnswer, ...(x.type === 'short-answer' ? { acceptedAnswers: [x.correctAnswer] } : {}), points: 1, source: 'manual', objectiveIds: [`${curId(k)}-O${(i % 3) + 1}`] }));
        const at = ago(school.createdDaysAgo - 5 - i);
        add('Assessment', id, { id, title: q.title, subject: sub.subject, institutionId: school.id, curriculumId: curId(k), duration: 15, status: 'active', difficulty: 'Medium', assessmentKind: i === 2 ? 'practice' : 'quiz',
          lifecycle: 'published', publishedVersion: 1, hasUnpublishedChanges: false, maxAttempts: i === 2 ? 3 : 1, answerReveal: 'after-submit', questions, createdBy: uid(teachers[0].key), language: sub.rtl ? 'ar' : 'en', origin: 'live', createdAt: at, updatedAt: at });
        add('AssessmentVersion', id, { assessmentId: id, institutionId: school.id, version: 1, title: q.title, subject: sub.subject, duration: 15, questions, totalPoints: questions.length, publishedBy: uid(teachers[0].key), publishedAt: at });
      });
    }

    // ---------------------------------------------------------------- groups and classes
    const classes: { id: string; group: string; subject: SubjectKey; teacher: string; name: string; extra: string[] }[] = [];
    // The last teacher of a bigger school has no class yet; in the first school the third teacher has exactly one class.
    let t = 0; const active = teachers.length > 1 ? teachers.slice(0, -1) : teachers;
    const oneClass = si === 0 ? teachers[2] : null; let oneGiven = false;
    const rotate = active.filter((x) => x !== oneClass);
    for (const g of school.groups) {
      for (const k of g.subjects) {
        let teacher: typeof teachers[number];
        if (si === 0 && k === 'ENG') teacher = teachers[0];
        else if (oneClass && !oneGiven && k === 'SCI') { teacher = oneClass; oneGiven = true; }
        else teacher = rotate[t++ % rotate.length];
        classes.push({ id: `CLS-${S}-${g.key}-${k}`, group: `GRP-${S}-${g.key}`, subject: k, teacher: teacher.key, name: `${SUBJECTS[k].courseName} – ${g.name}`, extra: [] });
      }
    }
    const staffMade: { key: string; id: string; email: string; name: string; at: Date }[] = [];
    teachers.forEach((tc, i) => {
      const n = classes.filter((c) => c.teacher === tc.key).length;
      const disabled = si === 1 && i === nTeachers - 1;
      const made = user(tc.key, tc.p, 'teacher', disabled ? 'teacher, account disabled' : n === 0 ? 'teacher, no class yet (new)' : n === 1 ? 'teacher, one class' : `teacher, ${n} classes`, school, disabled ? { status: 'disabled' } : {}, ago(school.createdDaysAgo - (n === 0 ? school.createdDaysAgo - 6 : 1)));
      if (i === 0) staffMade.push({ key: tc.key, ...made, at: ago(school.createdDaysAgo - 1) });
    });

    // ---------------------------------------------------------------- students (families first, so siblings share a family name)
    const seats = new Map(school.groups.map((g) => [g.key, g.size]));
    const families: { family: string; kids: { group: string; age: number; p: { first: string; last: string; sex: 'm' | 'f' } }[]; intl: boolean }[] = [];
    // The planned family comes first, in the first school of the run.
    if (FAM && si === 0) {
      families.push({ family: FAM.family, intl: false, kids: FAM.kids.map((k) => {
        const g = school.groups.find((x) => x.key === k.group)!; seats.set(g.key, seats.get(g.key)! - 1);
        return { group: g.key, age: g.age, p: { first: k.first, last: FAM.family, sex: k.sex } };
      }) });
    }
    while ([...seats.values()].some((n) => n > 0)) {
      const intl = R() < 0.12; const base = intl ? pick(INTL) : null; const family = base ? base[1] : pick(FAMILY);
      const want = school.adultLearners ? 1 : R() < 0.55 ? 1 : R() < 0.75 ? 2 : 3;
      const kids: typeof families[number]['kids'] = [];
      for (let i = 0; i < want; i++) {
        const open = school.groups.filter((g) => (seats.get(g.key) ?? 0) > 0 && !kids.some((k) => k.group === g.key));
        if (!open.length) break;
        const g = pick(open); seats.set(g.key, seats.get(g.key)! - 1);
        const age = school.adultLearners ? int(19, 48) : g.age + (R() < 0.4 ? 1 : 0);
        kids.push({ group: g.key, age, p: person(undefined, family, 0) });
      }
      if (kids.length) families.push({ family, kids, intl });
    }
    let n = 0; const schoolStudents: StudentRec[] = [];
    for (const f of families) for (const k of f.kids) {
      n += 1; const id = `STU-${S}-${String(n).padStart(3, '0')}`; const key = `${S}.s${n}`;
      const drawn = Math.min(0.97, Math.max(0.25, 0.45 + R() * 0.55 - (R() < 0.18 ? 0.25 : 0)));
      const ability = (FAM && f.family === FAM.family ? FAM.kids.find((x) => x.first === k.p.first)?.ability : undefined) ?? drawn;
      const status = ability > 0.82 ? 'excelling' : ability < 0.5 ? 'at risk' : 'on track';
      const band = k.age < 13 ? 'child' : k.age < 18 ? 'teen' : 'adult'; const kidsMode = k.age < 9;
      const birth = new Date(Date.UTC(now.getUTCFullYear() - k.age, int(0, 11), int(1, 28)));
      const groupId = `GRP-${S}-${k.group}`; const archived = (si === 0 && n === 44) || (si === 1 && n === 35);
      const rec: StudentRec = { key, id, userId: uid(key), name: `${k.p.first} ${k.p.last}`, first: k.p.first, family: f.family, school, group: groupId, age: k.age, ability, classes: classes.filter((c) => c.group === groupId).map((c) => c.id), archived, state: '', kids: kidsMode };
      const states = [band, kidsMode ? 'kids mode' : '', status, archived ? 'archived (left school)' : 'active'];
      const goal = school.adultLearners ? pick(['work', 'exam', 'daily'] as const) : 'school';
      const created = ago(school.createdDaysAgo - 6 - int(0, 4), 8);
      add('Student', id, {
        id, name: rec.name, email: '', grade: school.groups.find((g) => g.key === k.group)!.name, uiMode: kidsMode ? 'kids' : 'standard', avatar: `${k.p.first[0]}${k.p.last[0]}`,
        institutionId: school.id, batchId: groupId, academicYear: '2026-2027', learnerAgeBand: band, birthDate: birth, learningGoal: goal, learningGoalSetAt: created, learningGoalSetBy: school.adultLearners ? 'student' : 'school',
        progress: Math.round(ability * 80), avgScore: Math.round(ability * 100), studyTime: `${Math.round(1 + ability * 4)}h/week`, streak: status === 'at risk' ? 0 : int(1, 9), status,
        currentModule: SUBJECTS[school.groups.find((g) => g.key === k.group)!.subjects[0]].lessons[Math.min(4, Math.floor(ability * 5))].title, origin: 'live',
        ...(archived ? { archivedAt: ago(9), archivedBy: admin.id, archive: { reason: 'left_school' } } : {}), createdAt: created, updatedAt: created,
      });
      const u = user(key, k.p, 'student', '', school, { studentId: id, ...(archived ? { status: 'disabled' } : {}) }, created);
      // The Student keeps the login email (as the app does).
      const sdoc = docs.find((d) => d.model === 'Student' && d.key === id)!; sdoc.doc.email = u.email;
      rec.state = states.filter(Boolean).join(', ');
      users[users.length - 1].state = rec.state;
      schoolStudents.push(rec);
    }
    // Several classes: a few strong students also join the next group's Maths / English class.
    for (const s of schoolStudents.filter((x) => x.ability > 0.85 && !x.archived).slice(0, si === 0 ? 5 : si === 1 ? 3 : 0)) {
      const gi = school.groups.findIndex((g) => `GRP-${S}-${g.key}` === s.group); const next = school.groups[gi + 1]; if (!next) continue;
      const cls = classes.find((c) => c.group === `GRP-${S}-${next.key}` && (c.subject === 'MATH' || c.subject === 'ENG')); if (!cls) continue;
      cls.extra.push(s.id); s.classes.push(cls.id); s.state += ', in 2 groups\' classes';
      users.find((u) => u.key === s.key)!.state = s.state;
    }
    // Enrollments: everyone in their group; extra classes; a moved student (old group removed) and a paused one (inactive).
    for (const s of schoolStudents) {
      add('ClassEnrollment', `${s.id}:${s.group}`, { id: `enr-${s.id.toLowerCase()}-${s.group.toLowerCase()}`, institutionId: school.id, studentId: s.id, scope: 'group', targetId: s.group, role: 'learner',
        status: s.archived ? 'removed' : 'active', source: school.lmsSystem ? 'lms' : 'manual', startedAt: ago(school.createdDaysAgo - 6), ...(s.archived ? { endedAt: ago(9), endedBy: admin.id } : {}), createdBy: admin.id, createdAt: ago(school.createdDaysAgo - 6), updatedAt: ago(school.createdDaysAgo - 6) });
      for (const c of s.classes.filter((c) => classes.find((x) => x.id === c)!.group !== s.group)) {
        add('ClassEnrollment', `${s.id}:${c}`, { id: `enr-${s.id.toLowerCase()}-${c.toLowerCase()}`, institutionId: school.id, studentId: s.id, scope: 'class', targetId: c, role: 'learner', status: 'active', source: 'manual', extraVia: 'multi_class', startedAt: ago(30), createdBy: admin.id, createdAt: ago(30), updatedAt: ago(30) });
      }
    }
    if (school.groups.length > 1) {
      const moved = schoolStudents.find((s) => !s.archived && s.group === `GRP-${S}-${school.groups[1].key}`)!;
      add('ClassEnrollment', `${moved.id}:moved-from`, { id: `enr-${moved.id.toLowerCase()}-previous`, institutionId: school.id, studentId: moved.id, scope: 'group', targetId: `GRP-${S}-${school.groups[0].key}`, role: 'learner', status: 'removed', source: 'manual', startedAt: ago(school.createdDaysAgo - 6), endedAt: ago(35), endedBy: admin.id, createdBy: admin.id, createdAt: ago(school.createdDaysAgo - 6), updatedAt: ago(35) });
      moved.state += ', moved group (old enrollment removed)'; users.find((u) => u.key === moved.key)!.state = moved.state;
      const paused = schoolStudents.filter((s) => !s.archived && s.id !== moved.id).slice(-1)[0];
      const pe = docs.find((d) => d.model === 'ClassEnrollment' && d.key === `${paused.id}:${paused.group}`)!; pe.doc.status = 'inactive';
      paused.state += ', enrollment paused (inactive)'; users.find((u) => u.key === paused.key)!.state = paused.state;
    }
    for (const g of school.groups) {
      const gid = `GRP-${S}-${g.key}`;
      add('Batch', gid, { id: gid, name: g.name, institutionId: school.id, academicYear: '2026-2027', studentCount: schoolStudents.filter((s) => s.group === gid && !s.archived).length, origin: 'live', learnerAgeBand: g.age < 13 ? 'child' : g.age < 18 ? 'teen' : 'adult', createdAt: ago(school.createdDaysAgo - 5), updatedAt: ago(school.createdDaysAgo - 5) });
    }
    for (const c of classes) {
      add('CourseInstance', c.id, { id: c.id, courseId: c.subject, courseName: c.name, institutionId: school.id, visibility: 'student', isDemo: false, academicYear: '2026-2027', batchId: c.group, curriculumId: curId(c.subject),
        studentIds: c.extra, instructorIds: [uid(c.teacher)], origin: 'live', createdAt: ago(school.createdDaysAgo - 5), updatedAt: ago(school.createdDaysAgo - 5) });
    }

    // ---------------------------------------------------------------- invitations
    const inv = (k: string, role: string, status: string, expiresAt: Date, extra: Record<string, unknown> = {}) => {
      const p = person(); const email = emailFor(p.first, p.last);
      add('Invitation', `${S}.${k}`, { id: `inv-${S.toLowerCase()}-${k}`, tokenHash: sha(`inv:${S}:${k}`), institutionId: school.id, email, role, permissions: [], invitedBy: admin.id, status, expiresAt, origin: 'live', createdAt: new Date(expiresAt.getTime() - 7 * DAY), ...extra });
      users.push({ key: `${S}.${k}`, role: `invitation (${role})`, name: `${p.first} ${p.last}`, email, schoolId: school.id, school: school.name, state: status === 'pending' && expiresAt < now ? 'invitation expired (never accepted)' : `invitation ${status}`, userId: '' });
    };
    // Accepted: the first teacher joined through an invitation (same email, linked user).
    for (const st of staffMade) {
      add('Invitation', `${S}.inv-accepted`, { id: `inv-${S.toLowerCase()}-accepted`, tokenHash: sha(`inv:${S}:accepted`), institutionId: school.id, email: st.email, role: 'teacher', permissions: [], invitedBy: admin.id, status: 'accepted',
        expiresAt: new Date(st.at.getTime() + 7 * DAY), acceptedAt: st.at, acceptedUserId: st.id, origin: 'live', createdAt: new Date(st.at.getTime() - DAY) });
      users.push({ key: `${S}.inv-accepted`, role: 'invitation (teacher)', name: st.name, email: st.email, schoolId: school.id, school: school.name, state: 'invitation accepted (now a teacher)', userId: '' });
    }
    if (si === 0) { inv('inv-teacher', 'teacher', 'pending', ago(-5)); inv('inv-expired', 'teacher', 'pending', ago(3)); inv('inv-revoked', 'academic_manager', 'revoked', ago(10)); }
    if (si === 1) { inv('inv-student', 'student', 'pending', ago(-6)); inv('inv-old', 'teacher', 'pending', ago(20)); }
    if (si === 2) {
      inv('inv-admin2', 'admin', 'pending', ago(-4));
      add('LmsOnboarding', school.id, { id: `lmso-${S.toLowerCase()}`, institutionId: school.id, createdBy: uid('platform.admin'), inviteSentAt: ago(3, 11), inviteSentVia: 'email', inviteSentBy: uid('platform.admin'), lastEmailAt: ago(3, 11), emailCount: 1, createdAt: ago(school.createdDaysAgo), updatedAt: ago(3, 11) });
    }

    // ---------------------------------------------------------------- parents (portal on only)
    if (school.portal === 'free') {
      let fi = 0;
      for (const f of families) {
        fi += 1;
        const kids = schoolStudents.filter((s) => s.family === f.family && f.kids.some((k) => `${k.p.first} ${k.p.last}` === s.name));
        const planned = !!FAM && f.family === FAM.family;
        const roll = R(); const nParents = planned ? 1 : roll < 0.15 ? 0 : roll < 0.78 ? 1 : 2;
        for (let pi = 0; pi < nParents; pi++) {
          const key = `${S}.p${fi}${pi ? 'b' : ''}`; const p = planned ? { first: FAM!.parent.first, last: FAM!.parent.last, sex: FAM!.parent.sex } : person(pi === 0 ? (R() < 0.6 ? 'f' : 'm') : 'm', f.family, 0);
          const verified = planned || R() < 0.8; const signIn = planned ? 'password' : verified && R() < 0.7 ? 'password' : 'code';
          const linkedAt = ago(int(14, 50), 18);
          const u = user(key, p, 'parent', '', undefined, {}, linkedAt);
          if (planned) { // the family's parent signs in with this email
            const ud = docs.find((d) => d.model === 'User' && d.key === key)!; ud.doc.email = FAM!.parent.email; u.email = FAM!.parent.email; users[users.length - 1].email = FAM!.parent.email;
          }
          add('ParentProfile', key, { userId: u.id, language: school.emailLanguage, alertChannels: ['email'], failedRedeems: 0, signIn, ...(verified ? { emailVerifiedAt: linkedAt } : {}), emailPrefs: { weeklySummary: true, newResults: true }, createdAt: linkedAt, updatedAt: linkedAt });
          const linkStates: string[] = [];
          for (const [ci, s] of kids.entries()) {
            const r2 = R(); const status = planned ? 'active' : s.archived ? 'ended' : r2 < 0.06 ? 'pending' : r2 < 0.09 ? 'ended' : 'active';
            const consent = status === 'pending' ? 'pending' : s.age < 13 ? 'captured' : 'not_required';
            add('ParentLearnerLink', `${key}:${s.id}`, { id: `pl-${key.toLowerCase().replace(/\./g, '-')}-${s.id.toLowerCase()}`, parentUserId: u.id, studentId: s.id, institutionId: school.id, role: pi === 0 ? (ci === 0 && R() < 0.05 && !planned ? 'view' : 'owner') : 'full', status, consent,
              ...(status === 'ended' ? { endedAt: ago(9), endReason: s.archived ? 'left_school' : 'unlinked_by_parent', endedBy: s.archived ? admin.id : u.id } : {}), learnerNotifiedAt: linkedAt, createdAt: linkedAt, updatedAt: status === 'ended' ? ago(9) : linkedAt });
            if (status === 'active') activeLinks.push({ parentUserId: u.id, studentId: s.id, institutionId: school.id });
            if (status !== 'ended') parentsOf.set(s.id, [...(parentsOf.get(s.id) ?? []), `${u.email}${status === 'pending' ? ' (pending)' : ''}`]);
            linkStates.push(`${s.first} (${status}${consent === 'pending' ? ', consent pending' : consent === 'captured' ? ', consent given' : ''})`);
          }
          users[users.length - 1].state = [`${kids.length} ${kids.length === 1 ? 'child' : 'children'}: ${linkStates.join('; ')}`, verified ? 'email verified' : 'email not verified', `signs in by ${signIn}`, nParents === 2 ? (pi === 0 ? 'first of two guardians' : 'second guardian') : ''].filter(Boolean).join(', ');
          Object.assign(users[users.length - 1], { school: school.name, schoolId: school.id }); // for the sheet; parents have no school on their account
          // Weekly summaries (8 weeks) for verified parents with an active link.
          if (verified && kids.some((s) => !s.archived)) {
            for (let w = 1; w <= 8; w++) {
              const at = ago(w * 7 - 1, 7); if (at < linkedAt) continue;
              add('ParentEmailSend', `${key}:w${w}`, { key: `weekly:${u.id}:${at.toISOString().slice(0, 10)}`, template: 'enara-weekly-progress', parentUserId: u.id, studentId: kids[0].id, institutionId: school.id, status: 'sent', attempts: 1, at });
              add('ReminderLog', `${key}:w${w}`, { kind: 'weekly_summary', recipientKey: u.id, to: u.email, subject: school.emailLanguage === 'ar' ? `ملخص الأسبوع: ${kids[0].first}` : `This week: ${kids[0].first}`, sent: true, createdAt: at, updatedAt: at });
            }
          }
        }
      }
      // Parent link codes (real, typeable): every active learner gets one valid for 30 days; plus a redeemed, a revoked and an expired example.
      const studentEmail = (s: StudentRec) => users.find((x) => x.key === s.key)?.email ?? '';
      const className = (s: StudentRec) => [...new Set(classes.filter((x) => x.group === s.group).map((x) => x.name.split(' – ').pop()!))].join(', '); // the group, e.g. "Grade 3A"
      const addCode = (s: StudentRec, n: number, status: string, expiresAt: Date, extra: Record<string, unknown>, label: string) => {
        const c = seedCode(`${S}:${s.id}:${n}`); const cls = classes.find((x) => x.group === s.group)!;
        add('ParentLinkCode', `${S}.code.${s.id}.${n}`, { id: `plc-${s.id.toLowerCase()}-${n}`, codeHash: hashCode(c.normalized), hint: c.normalized.slice(-2), studentId: s.id, institutionId: school.id, createdBy: uid(cls.teacher), status, expiresAt, classId: cls.id, batchId: s.group, createdAt: new Date(Math.min(now.getTime() - 3 * DAY, expiresAt.getTime() - 14 * DAY)), ...extra });
        codes.push({ code: c.display, studentName: s.name, studentEmail: studentEmail(s), className: className(s), school: school.name, state: label, parents: parentsOf.get(s.id) ?? [] });
      };
      const live = school.status === 'active' ? schoolStudents.filter((s) => !s.archived) : [];
      for (const s of live) addCode(s, 0, 'active', new Date(now.getTime() + 30 * DAY), {}, 'valid (30 days)');
      const ex = schoolStudents.filter((s) => !s.archived).slice(0, 3);
      if (ex[0]) addCode(ex[0], 1, 'redeemed', ago(2), { redeemedAt: ago(12) }, 'already used');
      if (ex[1]) addCode(ex[1], 1, 'revoked', ago(-8), { revokedAt: ago(4), revokedBy: admin.id }, 'cancelled by the school');
      if (ex[2]) addCode(ex[2], 1, 'active', ago(5), {}, 'expired');
    }

    // ---------------------------------------------------------------- history (8 weeks)
    for (const s of schoolStudents) {
      const until = s.archived ? 10 : 0; // archived learners stop 10 days ago
      const lessonsDone = Math.max(1, Math.round(s.ability * 4.6));
      const topics: string[] = [];
      for (const cid of s.classes) {
        const cls = classes.find((c) => c.id === cid)!; const sub = SUBJECTS[cls.subject]; const k = cls.subject;
        // Lessons and mastery belong to the subject, not the class: count them once when a learner has two classes in one subject.
        const firstTime = !topics.includes(sub.subject);
        for (let li = 0; firstTime && li < sub.lessons.length; li++) {
          const lessonId = `${curId(k)}-L${li + 1}`;
          if (li < lessonsDone) {
            const at = ago(Math.max(until + 1, 52 - li * 10 - int(0, 4)), int(15, 20), int(0, 59));
            add('LessonProgress', `${s.id}:${lessonId}`, { studentId: s.id, institutionId: school.id, courseId: k, lessonId, status: 'completed', completedAt: at, createdAt: at, updatedAt: at });
            add('LearningEvent', `${s.id}:lesson:${lessonId}`, { id: `lev-${oid(`lev:${s.id}:${lessonId}`)}`, institutionId: school.id, studentId: s.id, actorId: s.userId, type: 'lesson_completed', source: 'lesson', verified: true, conceptIds: [], subject: sub.subject, topic: sub.lessons[li].title, refs: { courseId: k, lessonId }, durationMs: int(8, 25) * 60_000, at, recordedAt: at, objectiveIds: [], schemaVersion: 1 });
          } else if (li === lessonsDone && !s.archived) {
            add('LessonProgress', `${s.id}:${lessonId}`, { studentId: s.id, institutionId: school.id, courseId: k, lessonId, status: 'active', createdAt: ago(5), updatedAt: ago(5) });
          }
        }
        // Assignments: two closed (weeks 6 and 3), one open now.
        // The family's school: five assignments a subject (four marked, one open), so a parent sees a trend.
        const plans: [number, number, number, 'closed' | 'published'][] = FAM && si === 0
          ? [[1, 52, 46, 'closed'], [2, 40, 34, 'closed'], [3, 28, 22, 'closed'], [4, 16, 10, 'closed'], [5, 4, -4, 'published']]
          : [[1, 44, 37, 'closed'], [2, 23, 16, 'closed'], [3, 4, -4, 'published']];
        for (const [qi, openAgo, dueAgo, state] of plans) {
          const asg = `ASG-${cid}-${qi}`; const base0 = sub.quizzes[(qi - 1) % sub.quizzes.length];
          const quiz = qi <= sub.quizzes.length ? base0 : { ...base0, title: `${base0.title}: unit ${qi}` };
          const asId = `AS-${S}-${k}-${((qi - 1) % sub.quizzes.length) + 1}`;
          if (s === schoolStudents.find((x) => x.classes.includes(cid))) {
            add('Assignment', asg, { id: asg, institutionId: school.id, assessmentId: asId, assessmentVersion: 1, title: quiz.title, classId: cid, state, opensAt: ago(openAgo, 8), dueAt: ago(dueAgo, 21), timeZone: 'Africa/Cairo', latePolicy: 'not_accepted',
              maxAttempts: qi === plans.length ? 2 : 1, releasePolicy: school.releasePolicy, answerReveal: 'after-close', tutorPolicy: 'hints_only', assessmentKind: qi === plans.length ? 'practice' : 'quiz', format: 'written', extensions: [], createdBy: uid(cls.teacher),
              history: [{ at: ago(openAgo + 1, 9), by: uid(cls.teacher), action: 'published' }, ...(state === 'closed' ? [{ at: ago(dueAgo, 21), by: 'system', action: 'closed' }] : [])], origin: 'live', createdAt: ago(openAgo + 1, 9), updatedAt: ago(Math.max(dueAgo, 0), 21) });
          }
          if (s.archived && dueAgo < 10) continue;
          const fk = famKid(s); const planned = fk ? FAM!.mark(s.first, k, qi) : undefined;
          const submits = state === 'closed' ? R() < (0.75 + s.ability * 0.22) : R() < 0.6;
          if (fk ? !planned : !submits) continue;
          const sub0 = past(Math.max(dueAgo + int(0, 3), 0), int(16, 21), int(0, 59));
          let answers = quiz.questions.map((q) => { const right = R() < s.ability; return { questionId: q.id, questionText: q.text, studentAnswer: right ? q.correctAnswer : q.wrong, correctAnswer: q.correctAnswer, isCorrect: right, points: right ? 1 : 0, maxPoints: 1, method: 'rule' }; });
          if (planned) { // the planned mark: whole questions right, the rest as part marks, so points and percent agree
            let left = (planned.score / 100) * answers.length;
            answers = answers.map((a, ai) => { const q = quiz.questions[ai]; const got = Math.round(Math.min(1, Math.max(0, left)) * 100) / 100; left -= got; const right = got >= 1; return { ...a, studentAnswer: right ? q.correctAnswer : q.wrong, isCorrect: right, points: got }; });
          }
          const pts = Math.round(answers.reduce((n, a) => n + a.points, 0) * 100) / 100; const score = planned ? planned.score : Math.round((pts / answers.length) * 100);
          // Waiting for review: the open assignment in schools that release by hand, and some of the second one there.
          const waiting = planned ? planned.waiting : school.releasePolicy === 'manual' && (qi === plans.length || (qi === 2 && R() < 0.25));
          const gradingStatus = waiting ? (planned ? 'needs_review' : qi === plans.length && R() < 0.5 ? 'needs_review' : 'graded_draft') : 'released';
          const attId = `ATT-${cid}-${qi}-${s.id}`;
          add('AssessmentAttempt', attId, { id: attId, assessmentId: asId, assessmentTitle: quiz.title, subject: sub.subject, studentId: s.id, institutionId: school.id, status: 'submitted', answers, score, startedAt: new Date(sub0.getTime() - int(6, 14) * 60_000), submittedAt: sub0,
            timeSpentSec: int(360, 840), assignmentId: `ASG-${cid}-${qi}`, assessmentVersion: 1, gradingStatus, totalPoints: pts, maxPoints: answers.length, ...(gradingStatus === 'released' ? { finalizedAt: sub0, releasedAt: school.releasePolicy === 'manual' ? ago(Math.max(dueAgo - 2, 0), 12) : sub0 } : {}),
            history: [{ at: sub0, by: s.userId, action: 'submitted' }], origin: 'live', createdAt: sub0, updatedAt: sub0 });
          add('GradeLedgerEntry', `${attId}:submitted`, { id: `gl-${oid(`gl:${attId}:s`)}`, institutionId: school.id, assignmentId: `ASG-${cid}-${qi}`, attemptId: attId, attemptNumber: 1, studentId: s.id, reason: 'submitted', actor: 'student', from: null, to: { points: pts, maxPoints: answers.length, percent: score, status: 'submitted' }, at: sub0, createdAt: sub0 });
          if (gradingStatus === 'released') {
            const rel = school.releasePolicy === 'manual' ? ago(Math.max(dueAgo - 2, 0), 12) : sub0;
            add('GradeLedgerEntry', `${attId}:released`, { id: `gl-${oid(`gl:${attId}:r`)}`, institutionId: school.id, assignmentId: `ASG-${cid}-${qi}`, attemptId: attId, attemptNumber: 1, studentId: s.id, reason: 'released', actor: school.releasePolicy === 'manual' ? uid(cls.teacher) : 'system', from: { points: pts, maxPoints: answers.length, percent: score, status: 'finalized' }, to: { points: pts, maxPoints: answers.length, percent: score, status: 'released' }, at: rel, createdAt: rel });
          }
          add('LearningEvent', `${attId}:ev`, { id: `lev-${oid(`lev:${attId}`)}`, institutionId: school.id, studentId: s.id, actorId: s.userId, type: 'assessment_submitted', source: 'assessment', verified: true, gradedBy: 'rule', conceptIds: [], subject: sub.subject, topic: quiz.title, refs: { courseId: k, assessmentId: asId, attemptId: attId, assignmentId: `ASG-${cid}-${qi}` }, outcome: { score }, at: sub0, recordedAt: sub0, objectiveIds: [], schemaVersion: 1 });
          // Errors to work on from wrong answers in released results.
          if (gradingStatus === 'released' && pts < answers.length && R() < 0.8) {
            const e = sub.errors[(qi - 1) % sub.errors.length]; const eid = `ERR-${s.id}-${k}-${e.code}`;
            if (!docs.some((d) => d.model === 'ErrorToWorkOn' && d.key === eid)) {
              const resolved = s.ability > 0.7 && dueAgo > 20;
              add('ErrorToWorkOn', eid, { id: eid, institutionId: school.id, studentId: s.id, courseId: k, curriculumId: curId(k), objectiveId: `${curId(k)}-O${((qi - 1) % 3) + 1}`, errorCode: e.code, errorLabel: e.label,
                sources: [{ kind: 'assignment_attempt', assessmentId: asId, attemptId: attId, questionId: answers.find((a) => !a.isCorrect)!.questionId, at: sub0 }], occurrences: int(1, 3), firstSeenAt: sub0, lastSeenAt: sub0, status: resolved ? 'resolved' : 'open', rightStreak: resolved ? 2 : 0, countedKeys: [],
                ...(resolved ? { resolvedAt: ago(dueAgo - 8, 17) } : { nextReviewAt: ago(-int(0, 4), 9), reviewStep: 1, lastWrongAt: sub0 }), statusHistory: [{ at: sub0, to: 'open' }, ...(resolved ? [{ at: ago(dueAgo - 8, 17), from: 'open', to: 'resolved', reason: 'right_twice' }] : [])], createdAt: sub0, updatedAt: resolved ? ago(dueAgo - 8, 17) : sub0 });
            }
          }
        }
        // Mastery per objective
        if (firstTime) sub.objectives.forEach((_, oi) => {
          const m = Math.min(1, Math.max(0, s.ability + (R() - 0.5) * 0.3)); const status = m > 0.88 ? 'mastered' : m > 0.74 ? 'proficient' : m > 0.58 ? 'developing' : m > 0.4 ? 'emerging' : 'not_assessed';
          const at = ago(Math.max(until + 1, int(1, 20)), 18);
          add('StudentObjectiveMastery', `${s.id}:${curId(k)}-O${oi + 1}`, { institutionId: school.id, studentId: s.id, objectiveId: `${curId(k)}-O${oi + 1}`, masteryEstimate: status === 'not_assessed' ? null : Math.round(m * 100) / 100, evidenceStrength: status === 'not_assessed' ? 'none' : m > 0.7 ? 'moderate' : 'limited',
            masteryStatus: status, evidenceCount: status === 'not_assessed' ? 0 : int(2, 9), independentEvidenceCount: status === 'not_assessed' ? 0 : int(1, 5), distinctIndependentItems: status === 'not_assessed' ? 0 : int(1, 4), needsVerification: false, lastEvidenceAt: at, lastMasteryUpdateAt: at, modelVersion: 'mastery-v1', createdAt: at, updatedAt: at });
        });
        // English also has progress on the shared English outcomes (data/outcomes), so a parent sees the real CEFR level (no placeholder).
        if (firstTime && k === 'ENG') {
          const outs = [...formOutcomes('A1'), ...formOutcomes('A2')];
          const masteredN = Math.round(Math.min(1, Math.max(0, s.ability)) * outs.length * 0.8);
          outs.slice(0, masteredN + 3).forEach((o, oi) => {
            const at = ago(Math.max(until + 1, 3 + ((oi * 7) % 27)), 17); // fixed (no random draw: the rest of the plan stays the same)
            const status = oi < masteredN ? 'mastered' : 'developing';
            add('StudentObjectiveMastery', `${s.id}:${o.id}`, { institutionId: school.id, studentId: s.id, objectiveId: o.id, masteryEstimate: status === 'mastered' ? 0.9 : 0.55, evidenceStrength: status === 'mastered' ? 'moderate' : 'limited',
              masteryStatus: status, evidenceCount: 2 + (oi % 4), independentEvidenceCount: 1 + (oi % 2), distinctIndependentItems: 1 + (oi % 3), needsVerification: false, lastEvidenceAt: at, lastMasteryUpdateAt: at, modelVersion: 'mastery-v1', createdAt: at, updatedAt: at });
          });
        }
        topics.push(sub.subject);
      }
      if (s.archived) continue;
      // Tutor chats (1-3), each with a session summary, usage and events.
      const nChats = 1 + Math.floor(s.ability * 2.5);
      for (let c = 0; c < nChats; c++) {
        const cid = pick(s.classes); const cls = classes.find((x) => x.id === cid)!; const sub = SUBJECTS[cls.subject]; const chat = sub.chats[c % sub.chats.length];
        const start = ago(int(1, 54), int(15, 21), int(0, 59)); const sid = `TS-${s.id}-${c + 1}`;
        const msgs: Record<string, unknown>[] = []; let t0 = start.getTime();
        chat.turns.forEach(([q, a], ti) => { t0 += int(30, 120) * 1000; msgs.push({ role: 'user', text: q, timestamp: new Date(t0) }); t0 += int(4, 9) * 1000; msgs.push({ role: 'ai', text: a, timestamp: new Date(t0), meta: { intent: 'direct_model', version: 'deepseek', teachingMethod: 'socratic' } }); void ti; });
        const last = msgs[msgs.length - 1].timestamp as Date;
        add('TutorSession', sid, { id: sid, studentId: s.id, institutionId: school.id, title: chat.title, courseId: cls.subject, classId: cid, curriculumId: curId(cls.subject), teachingMethod: 'socratic', messageCount: msgs.length, mode: 'chat', lastMessageAt: last, origin: 'live', createdAt: start, updatedAt: last });
        msgs.forEach((m, mi) => add('TutorMessage', `${sid}:${mi}`, { id: `m-${oid(`${sid}:${mi}`).slice(0, 12)}`, sessionId: sid, studentId: s.id, institutionId: school.id, ...m, createdAt: m.timestamp, updatedAt: m.timestamp }));
        const right = Math.round(s.ability * 2);
        add('SessionSummary', sid, { sessionId: sid, studentId: s.id, institutionId: school.id, courseId: cls.subject, startedAt: start, endedAt: last, learnerTurns: chat.turns.length, right, wrong: chat.turns.length - Math.min(right, chat.turns.length), answeredItemIds: [], stoppedWithOpenItem: false, nextStep: right >= 2 ? 'next_point' : 'reteach', topics: [chat.title], version: 'memory-v1', createdAt: last, updatedAt: last });
        add('LearningEvent', `${sid}:q`, { id: `lev-${oid(`lev:${sid}`)}`, institutionId: school.id, studentId: s.id, actorId: s.userId, type: 'tutor_question', source: 'tutor_chat', verified: false, conceptIds: [], subject: sub.subject, topic: chat.title, refs: { courseId: cls.subject, sessionId: sid }, at: start, recordedAt: start, objectiveIds: [], schemaVersion: 1 });
        add('UsageLedger', `${sid}:llm`, { id: `ul-${oid(`ul:${sid}`)}`, operationKey: `op-${oid(`op:${sid}`)}`, institutionId: school.id, userId: s.userId, studentId: s.id, role: 'student', feature: 'tutor_chat', refs: { sessionId: sid }, provider: 'anthropic', modelName: 'claude-haiku-5-5',
          units: { inputTokens: int(2400, 3400) * chat.turns.length, outputTokens: int(90, 180) * chat.turns.length }, attempt: 1, status: 'ok', priceCatalogVersion: PRICE_VERSION_SLOT, currency: 'USD', costInternal: Math.round(chat.turns.length * 0.0037 * 10_000) / 10_000, costStatus: 'estimated', origin: 'live', createdAt: last });
      }
      // Avatar sessions for about a third of learners.
      if (R() < 0.33) {
        const cid = s.classes[0]; const cls = classes.find((x) => x.id === cid)!; const sub = SUBJECTS[cls.subject]; const at = ago(int(1, 40), int(16, 20), int(0, 59)); const secs = int(70, 170);
        const avId = `av-${oid(`av:${s.id}`)}`;
        add('AvatarSession', avId, { id: avId, userId: s.userId, studentId: s.id, courseId: cls.subject, lessonTitle: pick(sub.avatarLessons), subject: sub.subject, language: sub.rtl ? 'arabic' : 'english', visualsShown: int(0, 2), turnCount: int(3, 7), speech: 'avatar', openingUsed: true, freeNudgesLeft: 0, spokenChars: int(600, 1500),
          endedAt: new Date(at.getTime() + secs * 1000), institutionId: school.id, role: 'student', lastActivityAt: new Date(at.getTime() + secs * 1000), usageEndAt: new Date(at.getTime() + secs * 1000), usageEndBasis: 'explicit_end', usageFinalizedAt: new Date(at.getTime() + secs * 1000 + 60_000), latencyMs: [int(1000, 1400), int(1000, 1400), int(1000, 1500)], createdAt: at, updatedAt: new Date(at.getTime() + secs * 1000) });
        add('UsageLedger', `${avId}:anam`, { id: `ul-${oid(`ul:${avId}`)}`, operationKey: `op-${oid(`op:${avId}`)}`, institutionId: school.id, userId: s.userId, studentId: s.id, role: 'student', feature: 'avatar_session', refs: { sessionId: avId }, provider: 'anam', modelName: 'anam-default', units: { avatarSeconds: secs }, attempt: 1, status: 'ok', priceCatalogVersion: PRICE_VERSION_SLOT, currency: 'USD', costInternal: null, costStatus: 'unpriced', unitsBasis: 'server_measured', origin: 'live', createdAt: new Date(at.getTime() + secs * 1000) });
      }
      // Reviews: one due now, one later. Study habits on study days. Profile.
      const sub0 = SUBJECTS[classes.find((x) => x.id === s.classes[0])!.subject];
      sub0.reviews.slice(0, 2).forEach((r, ri) => add('ReviewItem', `${s.id}:r${ri}`, { id: `rev-${s.id.toLowerCase()}-${ri + 1}`, studentId: s.id, institutionId: school.id, sourceKey: `${sub0.key}:${ri}`, topic: sub0.subject, question: r.question, ...(r.options ? { options: r.options } : {}), answer: r.answer, intervalDays: ri ? 3 : 1, streak: ri, dueAt: ri ? ago(-int(1, 5), 8) : ago(int(0, 2), 8), ...(ri ? { lastReviewedAt: ago(2, 18) } : {}), createdAt: ago(20), updatedAt: ago(2) }));
      const days = new Set<number>(); const nDays = 4 + Math.round(s.ability * 10);
      while (days.size < nDays) days.add(int(0, 55));
      for (const d of days) { const day = new Date(now.getTime() - d * DAY); day.setUTCHours(0, 0, 0, 0); add('StudyHabitDaily', `${s.id}:${d}`, { studentId: s.id, institutionId: school.id, day, sessions: int(1, 3), minutes: int(10, 55), firstHourUtc: int(13, 16), lastHourUtc: int(16, 19), createdAt: day, updatedAt: day }); }
      add('LearnerProfile', s.id, { studentId: s.id, institutionId: school.id, firstLanguage: school.id === 'SCH-RLC' && R() < 0.2 ? pick(['fr', 'tr', 'ur'] as const) : 'ar', interests: [pick(['football', 'music', 'art', 'games', 'space', 'animals', 'reading', 'travel'] as const), pick(['films', 'cooking', 'technology', 'nature', 'science'] as const)], accommodations: s.kids ? ['read_aloud'] : [], history: [], createdAt: ago(40), updatedAt: ago(40) });
      void topics;
    }
    allStudents.push(...schoolStudents);
  }
  // Parents school app (a5): timetables, attendance, announcements, notifications (own random stream; appended last).
  addSchoolAppSeed({
    now, add: (m, k, d) => add(m, k, d), schools: SCHOOL_LIST, students: allStudents.map((s) => ({ id: s.id, name: s.name, first: s.first, school: s.school, group: s.group, archived: s.archived })), links: activeLinks,
    groupName: (gid) => { for (const sc of SCHOOL_LIST) { const g = sc.groups.find((x) => `GRP-${sc.id.replace('SCH-', '')}-${x.key}` === gid); if (g) return g.name; } return gid; },
    adminOf: (schoolId) => uid(`${schoolId.replace('SCH-', '')}.admin`),
  });
  return { docs, users, codes };
}
