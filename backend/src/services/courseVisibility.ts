import { AppError } from '../middleware/errorHandler';

export const COURSE_VISIBILITIES = ['student', 'internal', 'archived'] as const;
export type CourseVisibility = (typeof COURSE_VISIBILITIES)[number];

export const STUDENT_VISIBLE_COURSE_FILTER = {
  visibility: 'student',
  isDemo: { $ne: true },
} as const;

export function isCourseVisibleToStudents(course: {
  visibility?: string;
  isDemo?: boolean;
}): boolean {
  return course.visibility === 'student' && course.isDemo !== true;
}

export function normalizeCourseVisibility(
  value: unknown,
  fallback: CourseVisibility
): CourseVisibility {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !COURSE_VISIBILITIES.includes(value as CourseVisibility)) {
    throw new AppError('visibility is invalid', 400, 'VALIDATION_ERROR');
  }
  return value as CourseVisibility;
}
