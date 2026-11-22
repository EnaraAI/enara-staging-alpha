// Parents: every subject a child studies (owner go, 22 Nov 2026; docs/parents/ALL_SUBJECTS_PLAN.md), behind PARENT_ALL_SUBJECTS_ENABLED.
// A "subject" is what a parent calls it (English, Maths, Science, Arabic ...): every course, class, test and chat of the child is
// mapped to one by its course name, so two English classes are one English. A subject is listed only when the child has activity in it
// (a lesson started or done, a tutor session, a submitted test, or a point to practise). Every rule of the portal stays: a score shows
// only once the parent may see it (resultVisibility.ts), points to practise only once their source result is released.
import { LessonProgress } from '../models/LessonProgress';
import { TutorSession } from '../models/TutorSession';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assessment } from '../models/Assessment';
import { ErrorToWorkOn } from '../models/ErrorToWorkOn';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { LearningObjective } from '../models/LearningObjective';
import { Curriculum } from '../models/Curriculum';
import { Assignment } from '../models/Assignment';
import { attemptVisible, resultsPolicyFor } from './resultVisibility';
import { cairoDay, cairoDayStart, cairoTime, weekDays } from './time';

export type Bi = { en: string; ar: string };
export type Family = 'language' | 'maths' | 'science' | 'general';

const NAMES: Record<string, { en: string; ar: string; family: Family }> = {
  english: { en: 'English', ar: 'اللغة الإنجليزية', family: 'language' },
  arabic: { en: 'Arabic', ar: 'اللغة العربية', family: 'language' },
  french: { en: 'French', ar: 'اللغة الفرنسية', family: 'language' },
  german: { en: 'German', ar: 'اللغة الألمانية', family: 'language' },
  mathematics: { en: 'Maths', ar: 'الرياضيات', family: 'maths' },
  science: { en: 'Science', ar: 'العلوم', family: 'science' },
  physics: { en: 'Physics', ar: 'الفيزياء', family: 'science' },
  chemistry: { en: 'Chemistry', ar: 'الكيمياء', family: 'science' },
  biology: { en: 'Biology', ar: 'الأحياء', family: 'science' },
  history: { en: 'History', ar: 'التاريخ', family: 'general' },
  geography: { en: 'Geography', ar: 'الجغرافيا', family: 'general' },
  'social-studies': { en: 'Social studies', ar: 'الدراسات الاجتماعية', family: 'general' },
  ict: { en: 'ICT', ar: 'الحاسب الآلي', family: 'general' },
  'computer-science': { en: 'Computer science', ar: 'علوم الحاسب', family: 'general' },
};

/** The parent-facing subject of a course or test name: "Mathematics – Grade 5A", "Maths" and "الرياضيات" are all "mathematics". */
export function subjectKeyOf(raw: string | undefined | null): string | null {
  let s = String(raw ?? '').normalize('NFKC').trim().toLowerCase();
  if (!s) return null;
  s = s.split(/\s[–—-]\s|:/)[0].replace(/\s+/g, ' ').trim();
  if (/^(maths?|mathematics)\b/.test(s) || /رياضيات/.test(s)) return 'mathematics';
  if (/^english\b|^esl\b/.test(s) || /إنجليزي|انجليزي|الإنجليزية|الانجليزية/.test(s)) return 'english';
  if (/^arabic\b/.test(s) || /عربي|العربية/.test(s)) return 'arabic';
  if (/^french\b/.test(s) || /فرنسي|الفرنسية/.test(s)) return 'french';
  if (/^german\b/.test(s) || /ألماني|الألمانية/.test(s)) return 'german';
  if (/^(general )?science\b/.test(s) || /^(ال)?علوم$/.test(s)) return 'science';
  if (/^social studies\b/.test(s)) return 'social-studies';
  if (/^computer science\b/.test(s)) return 'computer-science';
  if (/^(ict|computing)\b/.test(s)) return 'ict';
  const key = s.replace(/[^\p{L}\p{N} ]+/gu, '').trim().replace(/ /g, '-');
  return key || null;
}

export function subjectName(key: string, raw?: string): Bi {
  const n = NAMES[key];
  if (n) return { en: n.en, ar: n.ar };
  const base = String(raw ?? key).split(/\s[–—-]\s|:/)[0].trim();
  const en = base.charAt(0).toUpperCase() + base.slice(1);
  return { en, ar: en };
}
export const familyOf = (key: string): Family => NAMES[key]?.family ?? 'general';

/** Level of a non-English subject from the share of its outcomes mastered. */
export type Band = 'starting' | 'developing' | 'secure' | 'mastered';
export const BAND_LABELS: Record<Band, Bi> = {
  starting: { en: 'Starting', ar: 'بداية' },
  developing: { en: 'Developing', ar: 'في تقدم' },
  secure: { en: 'Secure', ar: 'متمكن' },
  mastered: { en: 'Mastered', ar: 'متقن' },
};
export function bandOf(mastered: number, total: number): Band | null {
  if (total <= 0) return null;
  const p = mastered / total;
  return p >= 0.9 ? 'mastered' : p >= 0.6 ? 'secure' : p >= 0.25 ? 'developing' : 'starting';
}

type ClassRow = { id: string; courseId: string; curriculumId?: string; courseName: string };
type CurRow = { id: string; courseName?: string; name?: string; chapters?: { id: string; title: string }[] };

export interface ChildData {
  studentId: string;
  institutionId?: string;
  now: Date;
  classes: ClassRow[];
  curricula: Map<string, CurRow>;
  lessons: { courseId: string; lessonId: string; status: string; completedAt?: Date }[];
  sessions: { id: string; title: string; lessonTitle?: string; courseId?: string; curriculumId?: string; classId?: string; mode: 'chat' | 'voice'; startedAt: Date; durationMin: number }[];
  attempts: { id: string; assessmentId?: string; assignmentId?: string; subject?: string; assessmentTitle?: string; score?: number; submittedAt?: Date; gradingStatus?: string }[];
  assessments: Map<string, { subject?: string; curriculumId?: string }>;
  errors: { id: string; courseId?: string; curriculumId?: string; objectiveId: string; errorLabel?: string; errorCode: string; occurrences: number; status: string; lastSeenAt: Date }[];
  waitingErrorIds: Set<string>;
  objectives: Map<string, { id: string; curriculumId: string; code?: string; title: string; status?: string }>;
  mastery: { objectiveId: string; masteryStatus: string; masteryEstimate: number | null; needsVerification?: boolean }[];
  assignments: { id: string; title: string; classId: string; dueAt: Date; studentIds?: string[] }[];
  courseToCurriculum: Map<string, string>;
  policy: Awaited<ReturnType<typeof resultsPolicyFor>>;
}

/** Everything the subject views need for one child, read once. */
export async function loadChild(student: { id: string; institutionId?: string }, sessions: ChildData['sessions'], opts: { now?: Date; institutionId?: string } = {}): Promise<ChildData> {
  const now = opts.now ?? new Date();
  const studentId = student.id;
  const { getEnrolledInstances } = await import('../services/studentCourseService');
  const classes: ClassRow[] = await getEnrolledInstances(studentId).then((xs) => xs.map((c) => ({ id: c.id, courseId: c.courseId, curriculumId: c.curriculumId, courseName: c.courseName })), () => []);
  const [lessons, attempts, errors, mastery, sessionsAll] = await Promise.all([
    LessonProgress.find({ studentId }).select('courseId lessonId status completedAt').limit(2000).lean(),
    AssessmentAttempt.find({ studentId, status: 'submitted' }).sort({ submittedAt: -1 }).select('id assessmentId assignmentId subject assessmentTitle score submittedAt gradingStatus').limit(500).lean(),
    ErrorToWorkOn.find({ studentId, status: { $ne: 'dismissed' } }).select('id courseId curriculumId objectiveId errorLabel errorCode occurrences status lastSeenAt').limit(300).lean(),
    StudentObjectiveMastery.find({ studentId }).select('objectiveId masteryStatus masteryEstimate needsVerification').limit(2000).lean(),
    // Sessions older than the recent window still count as activity in a subject.
    TutorSession.find({ studentId }).select('courseId curriculumId classId').limit(1000).lean(),
  ]);
  const assessmentIds = [...new Set(attempts.map((a) => a.assessmentId).filter(Boolean))] as string[];
  const assessments = new Map((assessmentIds.length ? await Assessment.find({ id: { $in: assessmentIds } }).select('id subject curriculumId').lean() : []).map((a) => [a.id, { subject: a.subject, curriculumId: a.curriculumId }]));
  const objectiveIds = [...new Set([...mastery.map((m) => m.objectiveId), ...errors.map((e) => e.objectiveId)])];
  const courseIds = [...new Set([...lessons.map((l) => l.courseId), ...errors.map((e) => e.courseId), ...sessionsAll.map((s) => s.courseId)].filter(Boolean))] as string[];
  const [objRows, objByCourse] = await Promise.all([
    objectiveIds.length ? LearningObjective.find({ id: { $in: objectiveIds } }).select('id curriculumId code title status').lean() : [],
    courseIds.length ? LearningObjective.find({ courseId: { $in: courseIds } }).select('courseId curriculumId').limit(500).lean() : [],
  ]);
  const courseToCurriculum = new Map<string, string>();
  for (const c of classes) if (c.curriculumId) { courseToCurriculum.set(c.courseId, c.curriculumId); courseToCurriculum.set(c.id, c.curriculumId); }
  for (const o of objByCourse as { courseId?: string; curriculumId: string }[]) if (o.courseId && !courseToCurriculum.has(o.courseId)) courseToCurriculum.set(o.courseId, o.curriculumId);
  const curIds = new Set<string>([...classes.map((c) => c.curriculumId), ...[...assessments.values()].map((a) => a.curriculumId), ...errors.map((e) => e.curriculumId), ...sessionsAll.map((s) => (s as { curriculumId?: string }).curriculumId), ...objRows.map((o) => o.curriculumId), ...courseToCurriculum.values(), ...courseIds].filter(Boolean) as string[]);
  const curRows = curIds.size ? await Curriculum.find({ id: { $in: [...curIds] } }).select('id courseName name chapters.id chapters.title').lean() : [];
  const curricula = new Map(curRows.map((c) => [c.id, c as unknown as CurRow]));
  for (const id of courseIds) if (curricula.has(id) && !courseToCurriculum.has(id)) courseToCurriculum.set(id, id);
  // All approved outcomes of the child's curricula (for "x of y outcomes"), plus the ones the mastery and error rows name.
  const allObj = curricula.size ? await LearningObjective.find({ curriculumId: { $in: [...curricula.keys()] }, status: 'approved' }).select('id curriculumId code title status').limit(2000).lean() : [];
  const objectives = new Map([...objRows, ...allObj].map((o) => [o.id, { id: o.id, curriculumId: o.curriculumId, code: o.code, title: o.title, status: o.status }]));
  const classIds = classes.map((c) => c.id);
  const assignments = classIds.length
    ? (await Assignment.find({ classId: { $in: classIds }, state: 'published', dueAt: { $gt: now } }).sort({ dueAt: 1 }).select('id title classId dueAt studentIds').limit(50).lean())
        .filter((a) => !a.studentIds?.length || a.studentIds.includes(studentId))
        .filter((a) => !attempts.some((t) => t.assignmentId === a.id))
    : [];
  let waitingErrorIds = new Set<string>();
  if (errors.length) {
    const { eligibleErrors } = await import('../services/errorsToWorkOn');
    const eligible = new Set((await eligibleErrors(studentId, { institutionId: opts.institutionId ?? student.institutionId, ignoreDue: true })).map((r) => r.id));
    waitingErrorIds = new Set(errors.filter((e) => e.status === 'open' && !eligible.has(e.id)).map((e) => e.id));
  }
  // Sessions from the recent window carry minutes; older ones only mark the subject as active.
  const extra = sessionsAll.filter((s) => !sessions.some((r) => r.id === (s as { id?: string }).id)).map((s) => ({ id: `old:${String((s as { _id?: unknown })._id)}`, title: '', courseId: s.courseId, curriculumId: (s as { curriculumId?: string }).curriculumId, classId: (s as { classId?: string }).classId, mode: 'chat' as const, startedAt: new Date(0), durationMin: 0 }));
  return {
    studentId, institutionId: opts.institutionId ?? student.institutionId, now, classes, curricula,
    lessons: lessons as ChildData['lessons'], sessions: [...sessions, ...extra], attempts: attempts as ChildData['attempts'], assessments,
    errors: errors as ChildData['errors'], waitingErrorIds, objectives, mastery: mastery as ChildData['mastery'], assignments: assignments as ChildData['assignments'],
    courseToCurriculum, policy: await resultsPolicyFor(opts.institutionId ?? student.institutionId),
  };
}

/** The subject of one record, from its curriculum, class, course or test subject name; null when it cannot be told. */
export function subjectOf(d: ChildData, r: { curriculumId?: string; classId?: string; courseId?: string; assessmentId?: string; subject?: string }): string | null {
  const cls = r.classId ? d.classes.find((c) => c.id === r.classId) : r.courseId ? d.classes.find((c) => c.id === r.courseId || c.courseId === r.courseId) : undefined;
  const a = r.assessmentId ? d.assessments.get(r.assessmentId) : undefined;
  const cur = r.curriculumId ?? a?.curriculumId ?? cls?.curriculumId ?? (r.courseId ? d.courseToCurriculum.get(r.courseId) : undefined);
  const c = cur ? d.curricula.get(cur) : undefined;
  return subjectKeyOf(c?.courseName || c?.name) ?? subjectKeyOf(cls?.courseName) ?? subjectKeyOf(a?.subject ?? r.subject) ?? null;
}

const rawNameOf = (d: ChildData, key: string): string | undefined => {
  for (const c of d.curricula.values()) if (subjectKeyOf(c.courseName || c.name) === key) return c.courseName || c.name;
  for (const c of d.classes) if (subjectKeyOf(c.courseName) === key) return c.courseName;
  return undefined;
};

export interface SubjectSummary { key: string; name: Bi; english: boolean; activity: number; lastActive: string | null }

/** The subjects the child has activity in, most active first; a subject with no activity is not listed. */
export function subjectsWithActivity(d: ChildData): SubjectSummary[] {
  const count = new Map<string, number>();
  const last = new Map<string, number>();
  const hit = (key: string | null, at?: Date) => {
    if (!key) return;
    count.set(key, (count.get(key) ?? 0) + 1);
    const t = at ? new Date(at).getTime() : 0;
    if (t > (last.get(key) ?? 0)) last.set(key, t);
  };
  for (const l of d.lessons) hit(subjectOf(d, { courseId: l.courseId }), l.completedAt);
  for (const s of d.sessions) hit(subjectOf(d, s), s.startedAt);
  for (const a of d.attempts) hit(subjectOf(d, a), a.submittedAt);
  for (const e of d.errors) if (e.status === 'open') hit(subjectOf(d, { curriculumId: e.curriculumId ?? d.objectives.get(e.objectiveId)?.curriculumId, courseId: e.courseId }), e.lastSeenAt);
  return [...count.entries()]
    .map(([key, n]) => ({ key, name: subjectName(key, rawNameOf(d, key)), english: key === 'english', activity: n, lastActive: last.get(key) ? new Date(last.get(key)!).toISOString() : null }))
    .sort((a, b) => b.activity - a.activity || a.name.en.localeCompare(b.name.en));
}

export interface SubjectDetail {
  key: string;
  name: Bi;
  english: boolean;
  family: Family;
  lessons: { done: number; total: number; thisWeek: number };
  outcomes: { mastered: number; inProgress: number; total: number; band: Band | null; bandLabel: Bi | null; items: { id: string; title: string; state: 'achieved' | 'in_progress' | 'not_started' }[] };
  results: { id: string; title: string; score: number | null; submittedAt: string | null; passed: boolean | null; waiting?: true }[];
  latestResult: { title: string; score: number; submittedAt: string | null } | null;
  points: { id: string; objective: string; error: string; occurrences: number; since: string }[];
  sessions: { id: string; title: string; day: string; startTime: string; durationMin: number; mode: 'chat' | 'voice' }[];
  minutesThisWeek: number;
  activeBefore: boolean;
  next: { lesson: string | null; due: { title: string; dueAt: string } | null };
  weakest: { title: string; estimate: number | null } | null;
}

/** One subject's view for the parent. Results not yet visible to the parent are listed as waiting, with no score. */
export function subjectDetail(d: ChildData, key: string): SubjectDetail {
  const inSub = (r: Parameters<typeof subjectOf>[1]) => subjectOf(d, r) === key;
  const curIds = [...d.curricula.keys()].filter((id) => subjectKeyOf(d.curricula.get(id)!.courseName || d.curricula.get(id)!.name) === key);
  const lessonsIn = d.lessons.filter((l) => inSub({ courseId: l.courseId }));
  const doneIds = new Set(lessonsIn.filter((l) => l.status === 'completed').map((l) => l.lessonId));
  const chapters = curIds.flatMap((id) => d.curricula.get(id)!.chapters ?? []);
  const nextLesson = chapters.find((c) => !doneIds.has(c.id))?.title ?? null;

  const objs = [...d.objectives.values()].filter((o) => curIds.includes(o.curriculumId) && (o.status === undefined || o.status === 'approved'));
  const m = new Map(d.mastery.map((x) => [x.objectiveId, x]));
  const items = objs.map((o) => {
    const r = m.get(o.id);
    const state = r?.masteryStatus === 'mastered' && !r.needsVerification ? 'achieved' as const : r && r.masteryStatus !== 'not_assessed' ? 'in_progress' as const : 'not_started' as const;
    return { id: o.id, title: o.title, state, estimate: r?.masteryEstimate ?? null };
  });
  const mastered = items.filter((i) => i.state === 'achieved').length;
  const inProgress = items.filter((i) => i.state === 'in_progress').length;
  const band = mastered + inProgress > 0 ? bandOf(mastered, items.length) : null;
  const weakest = items.filter((i) => i.state === 'in_progress').sort((a, b) => (a.estimate ?? 1) - (b.estimate ?? 1))[0];

  const attempts = d.attempts.filter((a) => inSub(a));
  const results = attempts.slice(0, 10).map((a) => {
    const visible = attemptVisible(d.policy, a);
    const score = visible && typeof a.score === 'number' ? a.score : null;
    return { id: a.id, title: a.assessmentTitle ?? '', score, submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : null, passed: score !== null ? score >= 60 : null, ...(visible ? {} : { waiting: true as const }) };
  });
  const latestVisible = attempts.find((a) => attemptVisible(d.policy, a) && typeof a.score === 'number');

  const points = d.errors
    .filter((e) => e.status === 'open' && !d.waitingErrorIds.has(e.id) && inSub({ curriculumId: e.curriculumId ?? d.objectives.get(e.objectiveId)?.curriculumId, courseId: e.courseId }))
    .sort((a, b) => b.occurrences - a.occurrences || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .map((e) => ({ id: e.id, objective: d.objectives.get(e.objectiveId)?.title ?? '', error: e.errorLabel ?? e.errorCode.replace(/_/g, ' '), occurrences: e.occurrences, since: new Date(e.lastSeenAt).toISOString() }));

  const weekStart = cairoDayStart(weekDays(d.now)[0]);
  const sess = d.sessions.filter((s) => s.durationMin > 0 && inSub(s)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const minutesThisWeek = sess.filter((s) => s.startedAt >= weekStart).reduce((n, s) => n + s.durationMin, 0);
  const activeBefore = d.sessions.some((s) => inSub(s) && s.startedAt < weekStart) || lessonsIn.some((l) => l.completedAt && new Date(l.completedAt) < weekStart);
  const classIds = new Set(d.classes.filter((c) => subjectOf(d, { classId: c.id }) === key).map((c) => c.id));
  const due = d.assignments.find((a) => classIds.has(a.classId));
  return {
    key, name: subjectName(key, rawNameOf(d, key)), english: key === 'english', family: familyOf(key),
    lessons: { done: doneIds.size, total: Math.max(chapters.length, doneIds.size), thisWeek: lessonsIn.filter((l) => l.status === 'completed' && l.completedAt && new Date(l.completedAt) >= weekStart).length },
    outcomes: { mastered, inProgress, total: items.length, band, bandLabel: band ? BAND_LABELS[band] : null, items: items.map(({ estimate: _e, ...i }) => i) },
    results,
    latestResult: latestVisible ? { title: latestVisible.assessmentTitle ?? '', score: latestVisible.score as number, submittedAt: latestVisible.submittedAt ? new Date(latestVisible.submittedAt).toISOString() : null } : null,
    points,
    sessions: sess.slice(0, 5).map((s) => ({ id: s.id, title: s.lessonTitle || s.title, day: cairoDay(s.startedAt), startTime: cairoTime(s.startedAt), durationMin: s.durationMin, mode: s.mode })),
    minutesThisWeek,
    activeBefore,
    next: { lesson: nextLesson, due: due ? { title: due.title, dueAt: new Date(due.dueAt).toISOString() } : null },
    weakest: weakest ? { title: weakest.title, estimate: weakest.estimate } : null,
  };
}
