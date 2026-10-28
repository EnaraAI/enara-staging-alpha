import { Assessment } from '../models/Assessment';
import { getEnrolledInstances, getStudentOrThrow } from './studentCourseService';

function noCurriculumAssessmentFilter() {
  return [
    { curriculumId: { $exists: false } },
    { curriculumId: null },
    { curriculumId: '' },
  ];
}

export async function getStudentVisibleAssessments(
  studentId: string,
  options: { statuses?: string[]; limit?: number } = {}
) {
  const student = await getStudentOrThrow(studentId);
  const instances = await getEnrolledInstances(studentId);
  const visibleCurriculumIds = [
    ...new Set(instances.map((instance) => instance.curriculumId).filter(Boolean)),
  ] as string[];

  const assignmentFilters: Record<string, unknown>[] = [{ studentId }];
  if (student.batchId) assignmentFilters.push({ batchId: student.batchId });

  const curriculumFilters: Record<string, unknown>[] = noCurriculumAssessmentFilter();
  if (visibleCurriculumIds.length > 0) {
    curriculumFilters.push({ curriculumId: { $in: visibleCurriculumIds } });
  }

  const filter: Record<string, unknown> = {
    ...(student.institutionId ? { institutionId: student.institutionId } : {}),
    $and: [{ $or: assignmentFilters }, { $or: curriculumFilters }],
  };

  if (options.statuses?.length) {
    filter.status = { $in: options.statuses };
  }

  return Assessment.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(options.limit || 100, 1), 100));
}

export async function getStudentVisibleAssessmentIds(studentId: string): Promise<string[]> {
  const assessments = await getStudentVisibleAssessments(studentId);
  return assessments.map((assessment) => assessment.id);
}
