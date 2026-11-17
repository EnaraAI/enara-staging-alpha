import { StudentClassChoice } from '../models/StudentClassChoice';
import { getEnrolledInstances } from './studentCourseService';

// Multi-class S7 (owner decision 2026-11-17, docs/multi-class/STEP_6_NOTES.md):
// a tutor session records the class (CourseInstance) it happened in, at
// creation, whether or not multi-class is on. Sessions store a course id, which
// is either a class id or a course id shared by several classes; this picks
// the class among the student's own classes in their own school:
//   1. the class whose id is the session's course id;
//   2. else the one class with that courseId;
//   3. two or more classes share the courseId: the student's current class
//      choice (the Q2 switcher) when it is one of them, else the first in the
//      student's class order (the class the old mapping picked).
// Never a class of another school (the class list is the student's school,
// and each class's school is checked against the session's school).

export async function resolveSessionClassId(p: { studentId: string; institutionId?: string | null; courseId?: string | null }): Promise<string | undefined> {
  if (!p.courseId || !p.institutionId) return undefined;
  let instances: { id: string; courseId: string; institutionId?: string }[];
  try {
    // The same per-request read the course page / course tree already made.
    instances = await getEnrolledInstances(p.studentId);
  } catch {
    return undefined; // no student profile: nothing to record
  }
  const own = instances.filter((c) => c.institutionId === p.institutionId);
  const direct = own.find((c) => c.id === p.courseId);
  if (direct) return direct.id;
  const candidates = own.filter((c) => c.courseId === p.courseId);
  if (candidates.length <= 1) return candidates[0]?.id;
  const choice = await StudentClassChoice.findOne({ studentId: p.studentId, institutionId: p.institutionId }).select('classId').lean();
  return candidates.find((c) => c.id === choice?.classId)?.id ?? candidates[0].id;
}
