import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { CourseInstance } from '../models/CourseInstance';
import { Curriculum } from '../models/Curriculum';
import { LessonProgress } from '../models/LessonProgress';
import { Student } from '../models/Student';
import { TutorSession } from '../models/TutorSession';
import { loadMessagesForSessions } from './tutorMessages';
import { UsageEvent } from '../models/UsageEvent';
import { STUDENT_VISIBLE_COURSE_FILTER } from './courseVisibility';

/**
 * Admin analytics computed from recorded activity: submitted assessment attempts,
 * completed lessons, student questions to the tutor, and settled AI usage.
 * Nothing here reads the static progress/avgScore/status fields on Student,
 * which are only set by seed data.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const sessionCreatedAt = (s: object) => {
  const created = (s as { createdAt?: Date }).createdAt;
  return created ? new Date(created) : new Date(0);
};
const MAX_STUDENTS = 1000;
export const ACTIVITY_WINDOW_DAYS = 30;
export const INACTIVE_AFTER_DAYS = 14;
export const SCORE_BANDS = { excellent: 85, good: 70, average: 50 } as const;
const LOW_SCORE = SCORE_BANDS.average;

export type RiskFlag = 'low_scores' | 'inactive' | 'overdue';
export type ActivityStatus = 'excelling' | 'on track' | 'at risk' | 'not started';

type Scope = Record<string, unknown>;

interface LeanStudent {
  id: string;
  name: string;
  email?: string;
  batchId?: string;
  institutionId?: string;
}

interface LeanCourse {
  id: string;
  courseId: string;
  courseName: string;
  batchId: string;
  curriculumId?: string;
  institutionId?: string;
  studentIds: string[];
  visibility?: string;
  isDemo?: boolean;
}

interface LeanAttempt {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  subject: string;
  studentId: string;
  score?: number;
  submittedAt?: Date;
  answers: Array<{ topic?: string; isCorrect: boolean }>;
}

interface StudentQuestion {
  studentId: string;
  sessionId: string;
  courseId?: string;
  lessonTitle?: string;
  text: string;
  timestamp: Date;
}

export interface StudentMetrics {
  id: string;
  name: string;
  email?: string;
  batchId?: string;
  avgScore: number | null;
  attemptsSubmitted: number;
  lessonsCompleted: number;
  lessonsAvailable: number;
  lessonCompletionRate: number | null;
  tutorQuestions30d: number;
  creditsUsed30d: number;
  lastActiveAt: string | null;
  overdueAssessments: number;
  status: ActivityStatus;
  riskFlags: RiskFlag[];
}

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Monday 00:00 UTC of the week containing d. */
function weekStart(d: Date): Date {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

function weekBuckets(count: number, now: Date) {
  const current = weekStart(now);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(current.getTime() - (count - 1 - i) * 7 * DAY_MS);
    return {
      start,
      key: dayKey(start),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  });
}

function scoreBand(score: number): 'excellent' | 'good' | 'average' | 'needsHelp' {
  if (score >= SCORE_BANDS.excellent) return 'excellent';
  if (score >= SCORE_BANDS.good) return 'good';
  if (score >= SCORE_BANDS.average) return 'average';
  return 'needsHelp';
}

function classify(
  avgScore: number | null,
  lastActiveAt: Date | null,
  overdue: number,
  now: Date
): { status: ActivityStatus; riskFlags: RiskFlag[] } {
  if (!lastActiveAt) {
    return { status: overdue > 0 ? 'at risk' : 'not started', riskFlags: overdue > 0 ? ['overdue'] : [] };
  }
  const riskFlags: RiskFlag[] = [];
  if (avgScore !== null && avgScore < LOW_SCORE) riskFlags.push('low_scores');
  if (now.getTime() - lastActiveAt.getTime() > INACTIVE_AFTER_DAYS * DAY_MS) riskFlags.push('inactive');
  if (overdue > 0) riskFlags.push('overdue');
  const atRisk = riskFlags.includes('low_scores') || riskFlags.includes('inactive') || overdue >= 2;
  if (atRisk) return { status: 'at risk', riskFlags };
  if (avgScore !== null && avgScore >= SCORE_BANDS.excellent) return { status: 'excelling', riskFlags };
  return { status: 'on track', riskFlags };
}

/** Normalises a question so trivially different wordings group together. */
function questionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStudentVisible(course: LeanCourse) {
  return course.visibility === STUDENT_VISIBLE_COURSE_FILTER.visibility && course.isDemo !== true;
}

/** Students a course reaches: listed explicitly or in its batch (same rule the student app uses). */
function courseStudentIds(course: LeanCourse, students: LeanStudent[]): Set<string> {
  const ids = new Set(course.studentIds || []);
  for (const s of students) if (course.batchId && s.batchId === course.batchId) ids.add(s.id);
  return ids;
}

/**
 * Loads everything the analytics need for one scope (an institution, or everything for
 * an Enara admin) in a fixed number of queries.
 */
// Demo/live separation (P1): dashboards show live data by default; seeded
// demo records (origin 'demo_seed') only when asked for. Records without an
// origin predate P1 and are live.
export type OriginView = 'live' | 'demo_seed' | 'all';
export function originFilter(view: OriginView = 'live'): Scope {
  if (view === 'all') return {};
  return view === 'demo_seed' ? { origin: 'demo_seed' } : { origin: { $ne: 'demo_seed' } };
}

async function loadScope(scope: Scope, now: Date, studentFilter: Scope = {}, origin: OriginView = 'live') {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
  const of = originFilter(origin);
  const students = (await Student.find({ ...scope, ...studentFilter, ...of })
    .select('id name email batchId institutionId')
    .limit(MAX_STUDENTS)
    .lean()) as LeanStudent[];
  const studentIds = students.map((s) => s.id);

  const [courses, attempts, lessons, sessions, usage, assessments] = await Promise.all([
    CourseInstance.find({ ...scope, ...of })
      .select('id courseId courseName batchId curriculumId institutionId studentIds visibility isDemo')
      .lean() as Promise<LeanCourse[]>,
    AssessmentAttempt.find({ ...scope, ...of, studentId: { $in: studentIds }, status: 'submitted' })
      .select('id assessmentId assessmentTitle subject studentId score submittedAt answers.topic answers.isCorrect')
      .sort({ submittedAt: 1 })
      .lean() as Promise<LeanAttempt[]>,
    LessonProgress.find({ ...scope, studentId: { $in: studentIds }, status: 'completed' })
      .select('studentId courseId lessonId completedAt')
      .lean(),
    TutorSession.find({ ...scope, ...of, studentId: { $in: studentIds } })
      .select('id studentId institutionId courseId lessonTitle messages.id messages.role messages.text messages.timestamp messages.meta.contextFound createdAt lastMessageAt')
      .lean(),
    UsageEvent.aggregate<{ _id: { studentId: string; sessionId?: string }; credits: number }>([
      { $match: { ...scope, studentId: { $in: studentIds }, status: 'settled', timestamp: { $gte: since } } },
      { $group: { _id: { studentId: '$studentId', sessionId: '$sessionId' }, credits: { $sum: '$creditsUsed' } } },
    ]),
    Assessment.find(scope).select('id title subject dueDate batchId studentId curriculumId institutionId').lean(),
  ]);

  // Messages live in tutor_messages (older ones may still be embedded): merge them in.
  const messagesBySession = await loadMessagesForSessions(sessions as never);
  for (const session of sessions as { id: string; messages?: unknown }[]) {
    session.messages = messagesBySession.get(session.id) || [];
  }

  const curriculumIds = [...new Set(courses.map((c) => c.curriculumId).filter(Boolean))] as string[];
  const curriculums = await Curriculum.find({ id: { $in: curriculumIds } }).select('id chapters.id chapters.title').lean();
  const chaptersByCurriculum = new Map(curriculums.map((c) => [c.id, c.chapters || []]));

  const questions: StudentQuestion[] = [];
  for (const session of sessions) {
    for (const m of session.messages || []) {
      if (m.role !== 'user') continue;
      questions.push({
        studentId: session.studentId,
        sessionId: session.id,
        courseId: session.courseId,
        lessonTitle: session.lessonTitle,
        text: m.text,
        timestamp: new Date(m.timestamp),
      });
    }
  }

  return { since, students, courses, attempts, lessons, sessions, usage, assessments, chaptersByCurriculum, questions };
}

type ScopeData = Awaited<ReturnType<typeof loadScope>>;

function enrolledCoursesByStudent(data: ScopeData) {
  const map = new Map<string, LeanCourse[]>();
  for (const course of data.courses) {
    if (!isStudentVisible(course)) continue;
    for (const id of courseStudentIds(course, data.students)) {
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(course);
    }
  }
  return map;
}

function countOverdue(data: ScopeData, enrolled: Map<string, LeanCourse[]>, now: Date) {
  const today = dayKey(now);
  const submitted = new Set(data.attempts.map((a) => `${a.studentId}:${a.assessmentId}`));
  const overdue = new Map<string, number>();
  const pastDue = data.assessments.filter((a) => a.dueDate && a.dueDate < today);
  for (const student of data.students) {
    const curricula = new Set((enrolled.get(student.id) || []).map((c) => c.curriculumId).filter(Boolean));
    let count = 0;
    for (const a of pastDue) {
      const assigned = a.studentId === student.id || (!!student.batchId && a.batchId === student.batchId);
      const curriculumOk = !a.curriculumId || curricula.has(a.curriculumId);
      if (assigned && curriculumOk && !submitted.has(`${student.id}:${a.id}`)) count++;
    }
    overdue.set(student.id, count);
  }
  return overdue;
}

function computeStudentMetrics(data: ScopeData, now: Date): StudentMetrics[] {
  const enrolled = enrolledCoursesByStudent(data);
  const overdue = countOverdue(data, enrolled, now);
  const lastActive = new Map<string, Date>();
  const touch = (id: string, d?: Date | null) => {
    if (!d) return;
    const date = new Date(d);
    const prev = lastActive.get(id);
    if (!prev || date > prev) lastActive.set(id, date);
  };

  const scores = new Map<string, number[]>();
  for (const a of data.attempts) {
    if (typeof a.score === 'number') {
      if (!scores.has(a.studentId)) scores.set(a.studentId, []);
      scores.get(a.studentId)!.push(a.score);
    }
    touch(a.studentId, a.submittedAt);
  }
  const lessonsDone = new Map<string, number>();
  for (const l of data.lessons) {
    lessonsDone.set(l.studentId, (lessonsDone.get(l.studentId) || 0) + 1);
    touch(l.studentId, l.completedAt);
  }
  const recentQuestions = new Map<string, number>();
  for (const q of data.questions) {
    touch(q.studentId, q.timestamp);
    if (q.timestamp >= data.since) recentQuestions.set(q.studentId, (recentQuestions.get(q.studentId) || 0) + 1);
  }
  const credits = new Map<string, number>();
  for (const u of data.usage) credits.set(u._id.studentId, (credits.get(u._id.studentId) || 0) + u.credits);

  return data.students.map((s) => {
    const lessonsAvailable = (enrolled.get(s.id) || []).reduce(
      (sum, c) => sum + (c.curriculumId ? data.chaptersByCurriculum.get(c.curriculumId)?.length || 0 : 0),
      0
    );
    const completed = lessonsDone.get(s.id) || 0;
    const avg = mean(scores.get(s.id) || []);
    const avgScore = avg === null ? null : round(avg, 1);
    const last = lastActive.get(s.id) || null;
    const overdueCount = overdue.get(s.id) || 0;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      batchId: s.batchId,
      avgScore,
      attemptsSubmitted: (scores.get(s.id) || []).length,
      lessonsCompleted: completed,
      lessonsAvailable,
      lessonCompletionRate: lessonsAvailable ? round(Math.min(100, (completed / lessonsAvailable) * 100)) : null,
      tutorQuestions30d: recentQuestions.get(s.id) || 0,
      creditsUsed30d: credits.get(s.id) || 0,
      lastActiveAt: last ? last.toISOString() : null,
      overdueAssessments: overdueCount,
      ...classify(avgScore, last, overdueCount, now),
    };
  });
}

function topicAccuracy(attempts: LeanAttempt[]) {
  const topics = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    for (const ans of a.answers || []) {
      const topic = ans.topic || a.subject || 'General';
      const t = topics.get(topic) || { correct: 0, total: 0 };
      t.total++;
      if (ans.isCorrect) t.correct++;
      topics.set(topic, t);
    }
  }
  return [...topics.entries()]
    .map(([topic, t]) => ({ topic, correctRate: round((t.correct / t.total) * 100), answers: t.total }))
    .sort((a, b) => b.answers - a.answers);
}

function subjectScores(attempts: LeanAttempt[]) {
  const subjects = new Map<string, { scores: number[]; students: Set<string>; correct: number; total: number }>();
  for (const a of attempts) {
    const key = a.subject || 'General';
    const s = subjects.get(key) || { scores: [], students: new Set<string>(), correct: 0, total: 0 };
    if (typeof a.score === 'number') s.scores.push(a.score);
    s.students.add(a.studentId);
    for (const ans of a.answers || []) {
      s.total++;
      if (ans.isCorrect) s.correct++;
    }
    subjects.set(key, s);
  }
  return [...subjects.entries()]
    .map(([subject, s]) => ({
      subject,
      avgScore: s.scores.length ? round(mean(s.scores)!, 1) : null,
      attempts: s.scores.length,
      students: s.students.size,
      correctRate: s.total ? round((s.correct / s.total) * 100) : null,
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** The course an assessment belongs to: same curriculum, or same batch when it has no curriculum. */
function assessmentCourseId(
  assessment: { curriculumId?: string; batchId?: string } | undefined,
  courses: LeanCourse[]
): string | undefined {
  if (!assessment) return undefined;
  const matches = courses.filter((c) =>
    assessment.curriculumId ? c.curriculumId === assessment.curriculumId : !!assessment.batchId && c.batchId === assessment.batchId
  );
  // Ambiguous when a batch-only assessment matches several courses.
  return matches.length === 1 ? matches[0].courseId : undefined;
}

/**
 * Maps settled usage to courses through what recorded it: a tutor session (its course),
 * an assessment attempt (its assessment's course), or a course id used directly.
 */
function creditsByCourse(data: ScopeData) {
  const sessionCourse = new Map(data.sessions.map((s) => [s.id, s.courseId]));
  const assessmentsById = new Map(data.assessments.map((a) => [a.id, a]));
  const attemptCourse = new Map(
    data.attempts.map((a) => [a.id, assessmentCourseId(assessmentsById.get(a.assessmentId), data.courses)])
  );
  const courseIds = new Set(data.courses.map((c) => c.courseId));
  const totals = new Map<string, number>();
  let unattributed = 0;
  for (const u of data.usage) {
    const sid = u._id.sessionId;
    const courseId = sid
      ? sessionCourse.get(sid) || attemptCourse.get(sid) || (courseIds.has(sid) ? sid : undefined)
      : undefined;
    if (courseId) totals.set(courseId, (totals.get(courseId) || 0) + u.credits);
    else unattributed += u.credits;
  }
  return { totals, unattributed };
}

export async function buildOverview(scope: Scope, now = new Date(), origin: OriginView = 'live') {
  const data = await loadScope(scope, now, {}, origin);
  const students = computeStudentMetrics(data, now);
  const weeks = weekBuckets(8, now);
  const weekIndex = (d?: Date | null) => {
    if (!d) return -1;
    const key = dayKey(weekStart(new Date(d)));
    return weeks.findIndex((w) => w.key === key);
  };

  const weekly = weeks.map((w) => ({
    weekStart: w.key,
    label: w.label,
    activeStudents: new Set<string>(),
    lessonsCompleted: 0,
    assessmentsSubmitted: 0,
    tutorQuestions: 0,
  }));
  for (const l of data.lessons) {
    const i = weekIndex(l.completedAt);
    if (i >= 0) {
      weekly[i].lessonsCompleted++;
      weekly[i].activeStudents.add(l.studentId);
    }
  }
  for (const a of data.attempts) {
    const i = weekIndex(a.submittedAt);
    if (i >= 0) {
      weekly[i].assessmentsSubmitted++;
      weekly[i].activeStudents.add(a.studentId);
    }
  }
  for (const q of data.questions) {
    const i = weekIndex(q.timestamp);
    if (i >= 0) {
      weekly[i].tutorQuestions++;
      weekly[i].activeStudents.add(q.studentId);
    }
  }

  const performance = { excellent: 0, good: 0, average: 0, needsHelp: 0, noScores: 0 };
  for (const s of students) {
    if (s.avgScore === null) performance.noScores++;
    else performance[scoreBand(s.avgScore)]++;
  }

  const risk = {
    atRiskStudents: students.filter((s) => s.status === 'at risk').length,
    lowScores: students.filter((s) => s.riskFlags.includes('low_scores')).length,
    inactive: students.filter((s) => s.riskFlags.includes('inactive')).length,
    overdue: students.filter((s) => s.riskFlags.includes('overdue')).length,
    notStarted: students.filter((s) => s.status === 'not started').length,
  };

  const { totals: courseCredits, unattributed } = creditsByCourse(data);
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const courses = data.courses.map((course) => {
    const ids = courseStudentIds(course, data.students);
    const members = [...ids].map((id) => byStudent.get(id)).filter(Boolean) as StudentMetrics[];
    const chapters = course.curriculumId ? data.chaptersByCurriculum.get(course.curriculumId) || [] : [];
    const completed = data.lessons.filter((l) => l.courseId === course.courseId && ids.has(l.studentId)).length;
    const possible = chapters.length * ids.size;
    const courseQuestions = data.questions.filter((q) => q.courseId === course.courseId && q.timestamp >= data.since);
    const avg = mean(members.map((m) => m.avgScore).filter((v): v is number => v !== null));
    return {
      id: course.id,
      courseId: course.courseId,
      courseName: course.courseName,
      students: ids.size,
      lessons: chapters.length,
      lessonCompletionRate: possible ? round((completed / possible) * 100) : null,
      avgScore: avg === null ? null : round(avg, 1),
      tutorQuestions30d: courseQuestions.length,
      activeStudents30d: new Set(courseQuestions.map((q) => q.studentId)).size,
      creditsUsed30d: courseCredits.get(course.courseId) || 0,
      atRiskStudents: members.filter((m) => m.status === 'at risk').length,
    };
  });

  const batchIds = [...new Set(students.map((s) => s.batchId).filter(Boolean))] as string[];
  const since30 = data.since.getTime();
  const batches = batchIds.map((batchId) => {
    const members = students.filter((s) => s.batchId === batchId);
    const avg = mean(members.map((m) => m.avgScore).filter((v): v is number => v !== null));
    const active = members.filter((m) => m.lastActiveAt && new Date(m.lastActiveAt).getTime() >= since30).length;
    return {
      batchId,
      students: members.length,
      avgScore: avg === null ? null : round(avg, 1),
      activeRate: members.length ? round((active / members.length) * 100) : 0,
      atRiskStudents: members.filter((m) => m.status === 'at risk').length,
    };
  });

  const allScores = students.map((s) => s.avgScore).filter((v): v is number => v !== null);
  const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
  return {
    generatedAt: now.toISOString(),
    windowDays: ACTIVITY_WINDOW_DAYS,
    definitions: {
      scoreBands: SCORE_BANDS,
      inactiveAfterDays: INACTIVE_AFTER_DAYS,
      atRisk: `average score under ${LOW_SCORE}%, no activity for ${INACTIVE_AFTER_DAYS} days, or 2+ overdue assessments`,
    },
    totals: {
      students: students.length,
      activeStudents7d: students.filter((s) => s.lastActiveAt && new Date(s.lastActiveAt).getTime() >= sevenDaysAgo).length,
      activeStudents30d: students.filter((s) => s.lastActiveAt && new Date(s.lastActiveAt).getTime() >= since30).length,
      avgScore: allScores.length ? round(mean(allScores)!, 1) : null,
      avgLessonCompletion: (() => {
        const rates = students.map((s) => s.lessonCompletionRate).filter((v): v is number => v !== null);
        return rates.length ? round(mean(rates)!) : null;
      })(),
      lessonsCompleted: data.lessons.length,
      assessmentsSubmitted: data.attempts.length,
      tutorQuestions30d: students.reduce((sum, s) => sum + s.tutorQuestions30d, 0),
      creditsUsed30d: students.reduce((sum, s) => sum + s.creditsUsed30d, 0),
      creditsUnattributed30d: unattributed,
    },
    weekly: weekly.map((w) => ({ ...w, activeStudents: w.activeStudents.size })),
    performance,
    risk,
    subjects: subjectScores(data.attempts),
    topics: topicAccuracy(data.attempts),
    courses,
    batches,
    students,
  };
}

export async function buildCourseAnalytics(scope: Scope, courseKey: string, now = new Date(), origin: OriginView = 'live') {
  const course = (await CourseInstance.findOne({ ...scope, $or: [{ id: courseKey }, { courseId: courseKey }] })
    .select('id courseId courseName batchId curriculumId institutionId studentIds visibility isDemo')
    .lean()) as LeanCourse | null;
  if (!course) return null;

  const institutionScope = course.institutionId ? { institutionId: course.institutionId } : scope;
  const data = await loadScope(institutionScope, now, {}, origin);
  const ids = courseStudentIds(course, data.students);
  const metrics = computeStudentMetrics(data, now).filter((m) => ids.has(m.id));
  const chapters = course.curriculumId ? data.chaptersByCurriculum.get(course.curriculumId) || [] : [];

  // Assessments that belong to this course: its curriculum, or its batch when they have no curriculum.
  const courseAssessments = data.assessments.filter(
    (a) =>
      (course.curriculumId && a.curriculumId === course.curriculumId) ||
      (!a.curriculumId && course.batchId && a.batchId === course.batchId)
  );
  const assessmentIds = new Set(courseAssessments.map((a) => a.id));
  const attempts = data.attempts.filter((a) => assessmentIds.has(a.assessmentId) && ids.has(a.studentId));

  const sessions = data.sessions.filter((s) => s.courseId === course.courseId && ids.has(s.studentId));
  const recentSessions = sessions.filter((s) => (s.lastMessageAt ? new Date(s.lastMessageAt) : sessionCreatedAt(s)) >= data.since);
  const questions = data.questions.filter((q) => q.courseId === course.courseId && ids.has(q.studentId));
  const recentQuestions = questions.filter((q) => q.timestamp >= data.since);

  // Session depth = student questions per session; duration = first to last message.
  const sessionStats = recentSessions
    .map((s) => {
      const msgs = s.messages || [];
      const asked = msgs.filter((m) => m.role === 'user').length;
      const times = msgs.map((m) => new Date(m.timestamp).getTime());
      const minutes = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
      const replies = msgs.filter((m) => m.role === 'ai');
      const grounded = replies.filter((m) => (m.meta?.contextFound ?? 0) > 0).length;
      const start = times.length ? new Date(Math.min(...times)) : sessionCreatedAt(s);
      return { asked, minutes, replies: replies.length, grounded, start };
    })
    .filter((s) => s.asked > 0);

  const counts = new Map<string, { text: string; count: number; lessonTitle?: string }>();
  for (const q of recentQuestions) {
    const key = questionKey(q.text);
    if (!key) continue;
    const entry = counts.get(key) || { text: q.text.trim().slice(0, 200), count: 0, lessonTitle: q.lessonTitle };
    entry.count++;
    counts.set(key, entry);
  }
  const repeated = [...counts.values()].filter((c) => c.count > 1).reduce((sum, c) => sum + c.count, 0);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const engagementByWeekday = days.map((day, i) => {
    const onDay = sessionStats.filter((s) => (s.start.getUTCDay() + 6) % 7 === i);
    return {
      day,
      sessions: onDay.length,
      questions: onDay.reduce((sum, s) => sum + s.asked, 0),
      avgDepth: onDay.length ? round(mean(onDay.map((s) => s.asked))!, 1) : 0,
      avgMinutes: onDay.length ? round(mean(onDay.map((s) => s.minutes))!, 1) : 0,
    };
  });

  const totalReplies = sessionStats.reduce((sum, s) => sum + s.replies, 0);
  const stats = {
    sessions30d: sessionStats.length,
    questions30d: recentQuestions.length,
    avgQuestionsPerSession: sessionStats.length ? round(mean(sessionStats.map((s) => s.asked))!, 1) : null,
    avgSessionMinutes: sessionStats.length ? round(mean(sessionStats.map((s) => s.minutes))!, 1) : null,
    groundedReplyRate: totalReplies
      ? round((sessionStats.reduce((sum, s) => sum + s.grounded, 0) / totalReplies) * 100)
      : null,
    repeatQuestionRate: recentQuestions.length ? round((repeated / recentQuestions.length) * 100) : null,
  };

  // Tutor questions in the 48 hours before the most recent past due date of a course assessment.
  const today = dayKey(now);
  const lastDue = courseAssessments
    .filter((a) => a.dueDate && a.dueDate <= today)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))[0];
  let preExam: null | {
    assessmentTitle: string;
    dueDate: string;
    buckets: Array<{ label: string; questions: number; topQuestion: string | null }>;
  } = null;
  if (lastDue) {
    const due = new Date(`${lastDue.dueDate}T23:59:59Z`).getTime();
    const ranges: Array<[string, number, number]> = [
      ['48–36h', 48, 36],
      ['36–24h', 36, 24],
      ['24–12h', 24, 12],
      ['12–0h', 12, 0],
    ];
    preExam = {
      assessmentTitle: lastDue.title,
      dueDate: lastDue.dueDate,
      buckets: ranges.map(([label, from, to]) => {
        const inRange = questions.filter((q) => {
          const t = q.timestamp.getTime();
          return t >= due - from * 3600000 && t < due - to * 3600000;
        });
        const top = new Map<string, number>();
        for (const q of inRange) top.set(q.text.trim().slice(0, 80), (top.get(q.text.trim().slice(0, 80)) || 0) + 1);
        const best = [...top.entries()].sort((a, b) => b[1] - a[1])[0];
        return { label, questions: inRange.length, topQuestion: best ? best[0] : null };
      }),
    };
  }

  const weeks = weekBuckets(6, now);
  const weeklyScores = weeks.map((w) => {
    const end = w.start.getTime() + 7 * DAY_MS;
    const inWeek = attempts.filter(
      (a) => a.submittedAt && new Date(a.submittedAt).getTime() >= w.start.getTime() && new Date(a.submittedAt).getTime() < end
    );
    const scores = inWeek.map((a) => a.score).filter((s): s is number => typeof s === 'number');
    return { weekStart: w.key, label: w.label, avgScore: scores.length ? round(mean(scores)!, 1) : null, attempts: inWeek.length };
  });

  const completedBy = new Map<string, Set<string>>();
  for (const l of data.lessons) {
    if (l.courseId !== course.courseId || !ids.has(l.studentId)) continue;
    if (!completedBy.has(l.lessonId)) completedBy.set(l.lessonId, new Set());
    completedBy.get(l.lessonId)!.add(l.studentId);
  }
  const chapterProgress = chapters.map((ch) => {
    const done = completedBy.get(ch.id)?.size || 0;
    return {
      chapterId: ch.id,
      title: ch.title,
      completedStudents: done,
      completionRate: ids.size ? round((done / ids.size) * 100) : 0,
    };
  });

  const courseQuestionsByStudent = new Map<string, number>();
  for (const q of recentQuestions) courseQuestionsByStudent.set(q.studentId, (courseQuestionsByStudent.get(q.studentId) || 0) + 1);
  const courseScoresByStudent = new Map<string, number[]>();
  for (const a of attempts) {
    if (typeof a.score !== 'number') continue;
    if (!courseScoresByStudent.has(a.studentId)) courseScoresByStudent.set(a.studentId, []);
    courseScoresByStudent.get(a.studentId)!.push(a.score);
  }
  const studentRows = metrics.map((m) => {
    const done = data.lessons.filter((l) => l.courseId === course.courseId && l.studentId === m.id).length;
    const courseAvg = mean(courseScoresByStudent.get(m.id) || []);
    return {
      id: m.id,
      name: m.name,
      lessonCompletionRate: chapters.length ? round(Math.min(100, (done / chapters.length) * 100)) : null,
      courseAvgScore: courseAvg === null ? null : round(courseAvg, 1),
      tutorQuestions30d: courseQuestionsByStudent.get(m.id) || 0,
      lastActiveAt: m.lastActiveAt,
      status: m.status,
      riskFlags: m.riskFlags,
    };
  });

  const topics = topicAccuracy(attempts);
  const mostAsked = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const insights: Array<{ type: 'positive' | 'warning' | 'action'; text: string }> = [];
  const weakest = topics.filter((t) => t.answers >= 3).sort((a, b) => a.correctRate - b.correctRate)[0];
  const strongest = topics.filter((t) => t.answers >= 3).sort((a, b) => b.correctRate - a.correctRate)[0];
  if (strongest && strongest.correctRate >= 75) {
    insights.push({ type: 'positive', text: `Students answer ${strongest.correctRate}% of "${strongest.topic}" questions correctly.` });
  }
  if (weakest && weakest.correctRate < 60) {
    insights.push({ type: 'warning', text: `Only ${weakest.correctRate}% of answers on "${weakest.topic}" are correct (${weakest.answers} answers).` });
  }
  if (mostAsked[0] && mostAsked[0].count > 1) {
    insights.push({ type: 'warning', text: `"${mostAsked[0].text.slice(0, 90)}" was asked ${mostAsked[0].count} times in the last ${ACTIVITY_WINDOW_DAYS} days.` });
  }
  const atRisk = studentRows.filter((s) => s.status === 'at risk');
  if (atRisk.length) {
    insights.push({
      type: 'action',
      text: `${atRisk.length} student${atRisk.length === 1 ? ' is' : 's are'} at risk in this course: ${atRisk.slice(0, 3).map((s) => s.name).join(', ')}${atRisk.length > 3 ? '…' : ''}.`,
    });
  }
  const notStarted = studentRows.filter((s) => s.status === 'not started').length;
  if (notStarted) {
    insights.push({ type: 'action', text: `${notStarted} enrolled student${notStarted === 1 ? ' has' : 's have'} no recorded activity yet.` });
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: ACTIVITY_WINDOW_DAYS,
    course: {
      id: course.id,
      courseId: course.courseId,
      courseName: course.courseName,
      curriculumId: course.curriculumId,
      students: ids.size,
      lessons: chapters.length,
      assessments: courseAssessments.length,
    },
    stats,
    engagementByWeekday,
    mostAsked,
    preExam,
    weeklyScores,
    chapters: chapterProgress,
    topics,
    students: studentRows,
    insights,
  };
}

export async function buildStudentAnalytics(scope: Scope, studentId: string, now = new Date()) {
  const student = await Student.findOne({ ...scope, id: studentId }).select('id institutionId').lean();
  if (!student) return null;
  const institutionScope = student.institutionId ? { institutionId: student.institutionId } : scope;
  // One named student: shown whatever their origin.
  const data = await loadScope(institutionScope, now, { id: studentId }, 'all');
  const metrics = computeStudentMetrics(data, now)[0];

  const days = 14;
  const activity = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() - (days - 1 - i) * DAY_MS);
    return { date: dayKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), lessons: 0, assessments: 0, questions: 0 };
  });
  const dayIndex = new Map(activity.map((a, i) => [a.date, i]));
  const bump = (d: Date | undefined | null, field: 'lessons' | 'assessments' | 'questions') => {
    if (!d) return;
    const i = dayIndex.get(dayKey(new Date(d)));
    if (i !== undefined) activity[i][field]++;
  };
  data.lessons.forEach((l) => bump(l.completedAt, 'lessons'));
  data.attempts.forEach((a) => bump(a.submittedAt, 'assessments'));
  data.questions.forEach((q) => bump(q.timestamp, 'questions'));

  const courseNames = new Map(data.courses.map((c) => [c.courseId, c.courseName]));
  const usageByCourse = new Map<string, number>();
  for (const q of data.questions) {
    const label = (q.courseId && courseNames.get(q.courseId)) || q.lessonTitle || 'General tutor';
    usageByCourse.set(label, (usageByCourse.get(label) || 0) + 1);
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: ACTIVITY_WINDOW_DAYS,
    summary: metrics,
    scoreHistory: data.attempts.slice(-20).map((a) => ({
      date: a.submittedAt ? new Date(a.submittedAt).toISOString() : null,
      title: a.assessmentTitle,
      subject: a.subject,
      score: typeof a.score === 'number' ? a.score : null,
    })),
    subjects: subjectScores(data.attempts),
    topics: topicAccuracy(data.attempts),
    tutorUsage: [...usageByCourse.entries()]
      .map(([label, questions]) => ({ label, questions }))
      .sort((a, b) => b.questions - a.questions),
    activity,
  };
}
