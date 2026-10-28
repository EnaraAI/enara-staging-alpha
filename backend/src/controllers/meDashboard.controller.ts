import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { LessonProgress } from '../models/LessonProgress';
import { TutorSession } from '../models/TutorSession';
import {
  buildCourseTree,
  getEnrolledInstances,
  getStudentOrThrow,
} from '../services/studentCourseService';
import { ensureStudentCredits } from '../services/creditsService';
import { summarizeAssessmentForStudent } from '../services/assessmentSecurity';

export const getDashboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const student = await getStudentOrThrow(studentId);
  const instances = await getEnrolledInstances(studentId);

  const courses = await Promise.all(
    instances.map(async (instance) => buildCourseTree(studentId, instance.courseId))
  );

  const activeCourse =
    courses.find((c) => c.progressPct > 0 && c.progressPct < 100) || courses[0] || null;

  let continueLearning = null;
  if (activeCourse) {
    const lesson =
      activeCourse.modules
        .flatMap((m) => m.lessons)
        .find((l) => l.status === 'active') ||
      activeCourse.modules.flatMap((m) => m.lessons)[0];
    if (lesson) {
      continueLearning = {
        courseId: activeCourse.id,
        lessonId: lesson.id,
        title: lesson.title,
        subject: activeCourse.subject,
        progressPct: activeCourse.progressPct,
        etaMinutes: 12,
      };
    }
  }

  const learningPath =
    activeCourse?.modules.map((m) => ({
      moduleId: m.id,
      title: m.title,
      status: m.status,
      completedLessons: m.completedLessons,
      lessonsCount: m.lessonsCount,
    })) || [];

  const recentResults = await AssessmentAttempt.find({
    studentId,
    status: 'submitted',
  })
    .sort({ submittedAt: -1 })
    .limit(5);

  const recentTutor = await TutorSession.find({ studentId })
    .sort({ lastMessageAt: -1 })
    .limit(3);

  const recentActivity = [
    ...recentResults.map((r) => ({
      title: r.assessmentTitle,
      type: 'quiz' as const,
      score: r.score,
      date: r.submittedAt,
    })),
    ...recentTutor.map((t) => ({
      title: t.title,
      type: 'lesson' as const,
      score: undefined,
      date: t.lastMessageAt,
    })),
  ]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 8);

  const upcomingAssessments = await Assessment.find({
    ...(student.institutionId ? { institutionId: student.institutionId } : {}),
    $or: [{ studentId }, ...(student.batchId ? [{ batchId: student.batchId }] : [])],
    status: { $in: ['upcoming', 'active', 'pending'] },
  })
    .sort({ dueDate: 1 })
    .limit(5);

  res.json({
    student: toPlainObject(student),
    continueLearning,
    learningPath,
    recentActivity,
    upcomingAssessments: upcomingAssessments.map((a) => summarizeAssessmentForStudent(a)),
    subjects: student.subjects || [],
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      progressPct: c.progressPct,
    })),
  });
});

export const createStudyPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const student = await getStudentOrThrow(studentId);
  const { courseIds } = (req.body || {}) as { courseIds?: string[] };

  const instances = await getEnrolledInstances(studentId);
  const selected = courseIds?.length
    ? instances.filter((i) => courseIds.includes(i.courseId))
    : instances;

  const weakSubjects = (student.subjects || [])
    .filter((s) => (s.score || 0) < 80)
    .map((s) => s.name);

  const plan = {
    id: `plan-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    studentId,
    summary: `Personalized plan for ${student.name} focusing on ${
      weakSubjects.join(', ') || 'steady progress across enrolled courses'
    }.`,
    weeklyGoals: [
      {
        day: 'Monday',
        focus: weakSubjects[0] || selected[0]?.courseName || 'Core review',
        minutes: 45,
        activity: 'Concept review + tutor Q&A',
      },
      {
        day: 'Wednesday',
        focus: selected[0]?.courseName || 'Practice set',
        minutes: 40,
        activity: 'Lesson completion + quiz',
      },
      {
        day: 'Friday',
        focus: 'Assessment prep',
        minutes: 50,
        activity: 'Timed practice assessment',
      },
    ],
    recommendedCourses: selected.map((i) => ({
      courseId: i.courseId,
      courseName: i.courseName,
    })),
    nextBestActions: student.nextBestActions || [],
  };

  res.status(201).json(plan);
});

export const getAnalyticsOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const student = await getStudentOrThrow(studentId);
  const results = await AssessmentAttempt.find({ studentId, status: 'submitted' });
  const tutorSessions = await TutorSession.countDocuments({ studentId });
  const completedLessons = await LessonProgress.countDocuments({
    studentId,
    status: 'completed',
  });

  res.json({
    student: toPlainObject(student),
    metrics: {
      avgScore: student.avgScore || 0,
      streak: student.streak || 0,
      progress: student.progress || 0,
      completedLessons,
      tutorSessions,
      assessmentsTaken: results.length,
    },
    subjects: student.subjects || [],
    riskPrediction: student.riskPrediction,
    nextBestActions: student.nextBestActions || [],
  });
});

export const getLearningEngine = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getStudentOrThrow(req.user!.studentId!);
  res.json({
    learningEngineProfile: student.learningEngineProfile || null,
    adaptiveProfile: student.adaptiveProfile || null,
    affinitySubject: student.affinitySubject,
    ttu: student.ttu,
  });
});

export const getRecommendations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getStudentOrThrow(req.user!.studentId!);
  res.json({
    riskPrediction: student.riskPrediction || null,
    nextBestActions: student.nextBestActions || [],
  });
});

export const getSubjectAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getStudentOrThrow(req.user!.studentId!);
  res.json(student.subjects || []);
});

export const getSubjectInsight = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getStudentOrThrow(req.user!.studentId!);
  const name = decodeURIComponent(String(req.params.name));
  const subject = (student.subjects || []).find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
  res.json(
    subject || {
      name,
      progress: 0,
      score: 0,
      insights: 'No subject data yet.',
    }
  );
});

export const getCredits = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const credits = await ensureStudentCredits(studentId);
  res.json({
    studentId,
    limit: credits.limit,
    usage: credits.usage,
    remaining: Math.max(credits.limit - credits.usage, 0),
    period: credits.period,
    status: credits.status,
    restrictedFeatures: credits.restrictedFeatures,
  });
});

export const getAchievements = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const student = await getStudentOrThrow(studentId);
  const completedLessons = await LessonProgress.countDocuments({
    studentId,
    status: 'completed',
  });
  const submitted = await AssessmentAttempt.countDocuments({
    studentId,
    status: 'submitted',
  });
  const tutorSessions = await TutorSession.countDocuments({ studentId });

  res.json([
    {
      id: 'ach-streak',
      title: 'Consistency Streak',
      unlocked: (student.streak || 0) >= 7,
      progress: Math.min(student.streak || 0, 7),
      target: 7,
    },
    {
      id: 'ach-lessons',
      title: 'Lesson Explorer',
      unlocked: completedLessons >= 5,
      progress: Math.min(completedLessons, 5),
      target: 5,
    },
    {
      id: 'ach-assessments',
      title: 'Assessment Ace',
      unlocked: submitted >= 1,
      progress: Math.min(submitted, 1),
      target: 1,
    },
    {
      id: 'ach-tutor',
      title: 'Tutor Conversationalist',
      unlocked: tutorSessions >= 3,
      progress: Math.min(tutorSessions, 3),
      target: 3,
    },
  ]);
});
