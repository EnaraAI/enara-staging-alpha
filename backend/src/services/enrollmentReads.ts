import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { activeTargets } from './enrollment';

// Multi-class step 5 (docs/multi-class/STEP_5_PLAN.md): features switch their
// membership reads from the old fields (Student.batchId,
// CourseInstance.studentIds) to class_enrollments one at a time, listed in
// ENROLLMENT_READ_FROM. Removing a feature from the list switches it back. For
// a student in at most one group every answer is identical (same-answer tests
// in test/multiClass/step5.*.test.ts).
export const READ_FEATURES = ['student_app', 'teacher_rosters', 'assessments', 'analytics', 'profile_context', 'credits', 'attendance'] as const;
export type ReadFeature = (typeof READ_FEATURES)[number];

const warned = new Set<string>();

export function readsFromEnrollments(feature: ReadFeature): boolean {
  const list = getConfig().enrollment.readFrom;
  for (const name of list) {
    if (!(READ_FEATURES as readonly string[]).includes(name) && !warned.has(name)) {
      warned.add(name);
      logger.warn('enrollment_read_from_unknown_feature', { name });
    }
  }
  return list.includes(feature);
}

/**
 * The student's groups, from the old field or from class_enrollments.
 * Old: [batchId] or []. New: the active group enrollments, sorted.
 */
export async function studentGroupIds(
  student: { id: string; batchId?: string | null; institutionId?: string | null },
  feature: ReadFeature,
): Promise<string[]> {
  if (!readsFromEnrollments(feature)) return student.batchId ? [student.batchId] : [];
  return (await activeTargets(student.id, student.institutionId ?? undefined)).groupIds.sort();
}

/**
 * A Mongo clause for "documents given to the student's group(s)" on a field
 * that holds one group id (e.g. Assessment.batchId). Same shape as the old
 * `{ batchId }` for one group; `$in` only when there are several.
 */
export function groupClause(groupIds: string[], field = 'batchId'): Record<string, unknown>[] {
  if (!groupIds.length) return [];
  return [{ [field]: groupIds.length === 1 ? groupIds[0] : { $in: groupIds } }];
}
