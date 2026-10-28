import { recordLearningEvent } from '../services/learningEvents';
import { lessonObjectiveIds } from '../services/objectiveLinks';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { LessonProgress } from '../models/LessonProgress';
import {
  buildCourseTree,
  getEnrolledInstances,
  getStudentOrThrow,
} from '../services/studentCourseService';
import { Curriculum } from '../models/Curriculum';

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const student = await getStudentOrThrow(studentId);
  res.json({
    ...toPlainObject(student),
    user: {
      email: req.user!.email,
      role: req.user!.role,
    },
  });
});

export const listMyCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const instances = await getEnrolledInstances(studentId);

  const courses = await Promise.all(
    instances.map(async (instance) => {
      const tree = await buildCourseTree(studentId, instance.courseId);
      return {
        id: tree.id,
        instanceId: tree.instanceId,
        title: tree.title,
        subject: tree.subject,
        academicYear: tree.academicYear,
        batchId: tree.batchId,
        curriculumId: tree.curriculumId,
        progressPct: tree.progressPct,
        modulesCount: tree.modules.length,
        lessonsCount: tree.modules[0]?.lessonsCount || 0,
        completedLessons: tree.modules[0]?.completedLessons || 0,
      };
    })
  );

  res.json(courses);
});

export const getMyCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const courseId = String(req.params.courseId);
  const course = await buildCourseTree(studentId, courseId);
  res.json(course);
});

export const getMyLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const courseId = String(req.params.courseId);
  const lessonId = String(req.params.lessonId);
  const course = await buildCourseTree(studentId, courseId);
  const lesson = course.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.id === lessonId);

  if (!lesson) throw new AppError('Lesson not found', 404);

  res.json({
    courseId: course.id,
    courseTitle: course.title,
    subject: course.subject,
    curriculumId: course.curriculumId,
    curriculumSummary: course.curriculumSummary,
    lesson,
  });
});

export const completeMyLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const courseId = String(req.params.courseId);
  const lessonId = String(req.params.lessonId);

  const course = await buildCourseTree(studentId, courseId);
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  const before = await LessonProgress.findOneAndUpdate(
    { studentId, courseId: course.id, lessonId },
    {
      studentId,
      institutionId: req.user!.institutionId,
      courseId: course.id,
      lessonId,
      status: 'completed',
      completedAt: new Date(),
    },
    { upsert: true, new: false }
  );
  if (before?.status !== 'completed') {
    await recordLearningEvent({
      studentId,
      institutionId: req.user!.institutionId,
      type: 'lesson_completed',
      source: 'lesson',
      verified: true,
      objectiveIds: await lessonObjectiveIds(req.user!.institutionId, course.curriculumId, lessonId),
      idempotencyKey: `lesson:${studentId}:${course.id}:${lessonId}:completed`,
      subject: course.subject,
      topic: lesson.title,
      refs: { courseId: course.id, lessonId },
    });
  }

  const updated = await buildCourseTree(studentId, courseId);
  res.json(updated);
});

export const getMyCurriculumContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const courseId = String(req.params.courseId);
  const course = await buildCourseTree(studentId, courseId);
  if (!course.curriculumId) {
    res.json({ summary: course.curriculumSummary || '', chapters: [] });
    return;
  }

  const curriculum = await Curriculum.findOne({ id: course.curriculumId });
  res.json({
    id: curriculum?.id,
    name: curriculum?.name,
    summary: curriculum?.summary || course.curriculumSummary,
    chapters: curriculum?.chapters || [],
  });
});
