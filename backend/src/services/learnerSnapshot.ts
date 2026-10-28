import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { AvatarSession } from '../models/AvatarSession';
import { LessonProgress } from '../models/LessonProgress';
import { ReviewItem } from '../models/ReviewItem';
import { TutorSession } from '../models/TutorSession';
import { buildCourseTree, getEnrolledInstances, getStudentOrThrow } from './studentCourseService';

// One picture of where a student stands, shared by the proactive tutor: the
// call opening, next-step suggestions, review offers, reminders and the
// teachers' weekly summary all read from it.

export interface WeakTopic {
  topic: string;
  correct: number;
  total: number;
  quiz: string;
}

export interface LearnerSnapshot {
  studentId: string;
  name: string;
  firstName: string;
  courses: {
    id: string;
    title: string;
    subject: string;
    progressPct: number;
    completedLessons: number;
    totalLessons: number;
    nextLesson?: { id: string; title: string };
  }[];
  weakTopics: WeakTopic[];
  recentQuizzes: { title: string; score: number; date: string }[];
  reviewsDue: number;
  recentTutorTopics: string[];
  lastActiveAt?: Date;
  daysInactive?: number;
}

const DAY = 24 * 60 * 60 * 1000;

export async function buildLearnerSnapshot(studentId: string): Promise<LearnerSnapshot> {
  const student = await getStudentOrThrow(studentId);
  const instances = await getEnrolledInstances(studentId);

  const [courses, attempts, reviewsDue, tutorSessions, lastLesson, lastCall] = await Promise.all([
    Promise.all(
      instances.map(async (instance) => {
        try {
          const tree = await buildCourseTree(studentId, instance.courseId);
          const lessons = tree.modules.flatMap((m) => m.lessons);
          const next = lessons.find((l) => l.status === 'active') || lessons.find((l) => l.status !== 'completed');
          return {
            id: tree.id,
            title: tree.title,
            subject: tree.subject,
            progressPct: tree.progressPct,
            completedLessons: lessons.filter((l) => l.status === 'completed').length,
            totalLessons: lessons.length,
            nextLesson: next ? { id: next.id, title: next.title } : undefined,
          };
        } catch {
          return null;
        }
      }),
    ),
    AssessmentAttempt.find({ studentId, status: 'submitted' }).sort({ submittedAt: -1 }).limit(5).lean(),
    ReviewItem.countDocuments({ studentId, retiredAt: null, dueAt: { $lte: new Date() } }),
    TutorSession.find({ studentId }).sort({ lastMessageAt: -1 }).limit(3).select('title lastMessageAt').lean(),
    LessonProgress.findOne({ studentId, completedAt: { $ne: null } }).sort({ completedAt: -1 }).select('completedAt').lean(),
    AvatarSession.findOne({ studentId }).sort({ createdAt: -1 }).select('createdAt').lean(),
  ]);

  // Topics answered wrong at least as often as right in recent quizzes.
  const byTopic = new Map<string, WeakTopic>();
  for (const attempt of attempts) {
    for (const a of attempt.answers || []) {
      const topic = (a.topic || attempt.subject || attempt.assessmentTitle || '').trim();
      if (!topic) continue;
      const entry = byTopic.get(topic) || { topic, correct: 0, total: 0, quiz: attempt.assessmentTitle };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      byTopic.set(topic, entry);
    }
  }
  const weakTopics = [...byTopic.values()]
    .filter((t) => t.correct / t.total < 0.7)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 3);

  const activity = [
    attempts[0]?.submittedAt,
    tutorSessions[0]?.lastMessageAt,
    lastLesson?.completedAt,
    lastCall?.createdAt,
  ].filter((d): d is Date => Boolean(d));
  const lastActiveAt = activity.length ? new Date(Math.max(...activity.map((d) => new Date(d).getTime()))) : undefined;

  return {
    studentId,
    name: student.name,
    firstName: student.name.split(/\s+/)[0] || student.name,
    courses: courses.filter((c): c is NonNullable<typeof c> => c !== null),
    weakTopics,
    recentQuizzes: attempts.slice(0, 3).map((a) => ({
      title: a.assessmentTitle,
      score: a.score ?? 0,
      date: (a.submittedAt || a.startedAt).toISOString().slice(0, 10),
    })),
    reviewsDue,
    recentTutorTopics: tutorSessions.map((s) => s.title).filter((t) => t && t !== 'New chat' && t !== 'AI Tutor chat'),
    lastActiveAt,
    daysInactive: lastActiveAt ? Math.floor((Date.now() - lastActiveAt.getTime()) / DAY) : undefined,
  };
}

// Compact text for prompts.
export function describeSnapshot(s: LearnerSnapshot): string {
  const lines = [`Student: ${s.firstName}`];
  for (const c of s.courses) {
    lines.push(
      `Course "${c.title}": ${c.completedLessons}/${c.totalLessons} lessons done` +
        (c.nextLesson ? `, next lesson "${c.nextLesson.title}"` : ', finished'),
    );
  }
  if (s.recentQuizzes.length) {
    lines.push('Recent quizzes: ' + s.recentQuizzes.map((q) => `${q.title} ${q.score}% (${q.date})`).join('; '));
  }
  if (s.weakTopics.length) {
    lines.push('Weak topics: ' + s.weakTopics.map((t) => `${t.topic} (${t.correct}/${t.total} right in ${t.quiz})`).join('; '));
  }
  if (s.reviewsDue) lines.push(`Review questions due today: ${s.reviewsDue}`);
  if (s.recentTutorTopics.length) lines.push('Recent tutor chats: ' + s.recentTutorTopics.join('; '));
  if (s.daysInactive !== undefined) lines.push(`Last active: ${s.daysInactive === 0 ? 'today' : `${s.daysInactive} days ago`}`);
  return lines.join('\n');
}

// The snapshot changes slowly; reuse it for a few minutes on a warm instance.
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const snapshotCache = new Map<string, { snapshot: LearnerSnapshot; at: number }>();

export async function getLearnerSnapshot(studentId: string): Promise<LearnerSnapshot | undefined> {
  const cached = snapshotCache.get(studentId);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.snapshot;
  try {
    const snapshot = await buildLearnerSnapshot(studentId);
    if (snapshotCache.size > 500) snapshotCache.delete(snapshotCache.keys().next().value!);
    snapshotCache.set(studentId, { snapshot, at: Date.now() });
    return snapshot;
  } catch {
    return undefined;
  }
}

export function forgetLearnerSnapshot(studentId: string): void {
  snapshotCache.delete(studentId);
}
