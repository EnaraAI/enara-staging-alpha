import { Curriculum } from '../models/Curriculum';
import { CourseInstance } from '../models/CourseInstance';
import { LessonProgress } from '../models/LessonProgress';
import { Student } from '../models/Student';
import { AppError } from '../middleware/errorHandler';
import { STUDENT_VISIBLE_COURSE_FILTER } from './courseVisibility';

export async function getStudentOrThrow(studentId: string) {
  const student = await Student.findOne({ id: studentId });
  if (!student) throw new AppError('Student profile not found', 404);
  return student;
}

export async function getEnrolledInstances(studentId: string) {
  const student = await getStudentOrThrow(studentId);
  const filter: Record<string, unknown>[] = [{ studentIds: studentId }];
  if (student.batchId) {
    filter.push({ batchId: student.batchId });
  }
  const institutionFilter = student.institutionId ? { institutionId: student.institutionId } : {};
  return CourseInstance.find({
    ...institutionFilter,
    ...STUDENT_VISIBLE_COURSE_FILTER,
    $or: filter,
  })
    .sort({ createdAt: -1 })
    .limit(100);
}

export async function getVisibleCurriculumIdsForStudent(studentId: string): Promise<string[]> {
  const instances = await getEnrolledInstances(studentId);
  return [...new Set(instances.map((instance) => instance.curriculumId).filter(Boolean))] as string[];
}

function guessSubject(title: string, courseName?: string): string {
  const source = `${title} ${courseName || ''}`.toLowerCase();
  if (source.includes('math') || source.includes('algebra')) return 'Mathematics';
  if (source.includes('physic') || source.includes('mechanic')) return 'Physics';
  if (source.includes('chem') || source.includes('bio') || source.includes('science')) return 'Science';
  if (source.includes('english')) return 'English';
  return 'General';
}

export async function buildCourseTree(studentId: string, courseId: string) {
  const instances = await getEnrolledInstances(studentId);
  const instance = instances.find((i) => i.courseId === courseId || i.id === courseId);
  if (!instance) throw new AppError('Course not found or not enrolled', 404);

  const curriculum = instance.curriculumId
    ? await Curriculum.findOne({
        id: instance.curriculumId,
        ...(instance.institutionId ? { institutionId: instance.institutionId } : {}),
      })
    : null;

  const progress = await LessonProgress.find({
    studentId,
    ...(instance.institutionId ? { institutionId: instance.institutionId } : {}),
    courseId: instance.courseId,
  });
  const completedIds = new Set(
    progress.filter((p) => p.status === 'completed').map((p) => p.lessonId)
  );

  const chapters = curriculum?.chapters || [];
  const lessons = chapters.map((chapter, idx) => {
    const isCompleted = completedIds.has(chapter.id);
    const prevCompleted = idx === 0 || completedIds.has(chapters[idx - 1].id);
    let status: 'completed' | 'active' | 'locked' = 'locked';
    if (isCompleted) status = 'completed';
    else if (prevCompleted) status = 'active';

    return {
      id: chapter.id,
      title: chapter.title,
      duration: 'Varies',
      status,
      order: idx + 1,
      content: chapter.description || '',
      materials: chapter.uploads || [],
      description: chapter.description || '',
      enaraSectionId: chapter.enaraSectionId,
    };
  });

  if (lessons.length > 0 && !lessons.some((l) => l.status === 'active')) {
    const firstIncomplete = lessons.find((l) => l.status !== 'completed');
    if (firstIncomplete) firstIncomplete.status = 'active';
  }

  const completedLessons = lessons.filter((l) => l.status === 'completed').length;
  const moduleStatus =
    completedLessons === lessons.length && lessons.length > 0
      ? 'completed'
      : completedLessons > 0
        ? 'active'
        : 'active';

  return {
    id: instance.courseId,
    instanceId: instance.id,
    subject: guessSubject(instance.courseName, curriculum?.courseName),
    title: instance.courseName,
    academicYear: instance.academicYear,
    batchId: instance.batchId,
    curriculumId: instance.curriculumId,
    curriculumSummary: curriculum?.summary,
    enaraCourseId: curriculum?.enaraCourseId,
    progressPct:
      lessons.length === 0 ? 0 : Math.round((completedLessons / lessons.length) * 100),
    modules: [
      {
        id: `${instance.courseId}_module`,
        title: curriculum?.name || 'Course Lessons',
        status: moduleStatus,
        lessonsCount: lessons.length,
        completedLessons,
        lessons,
        materials: chapters.flatMap((c) => c.uploads || []),
        explanation:
          curriculum?.summary ||
          `Welcome to ${instance.courseName}. Your AI tutor is ready to help.`,
      },
    ],
  };
}
