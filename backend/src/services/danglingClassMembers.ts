import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';

// Multi-class (decision A, 2026-11-17): class lists (CourseInstance.studentIds)
// that still contain IDs of students who no longer exist, left by deletes made
// before the delete fix. Dry run by default: counts and IDs only (no names).
// Apply removes exactly those IDs from the class lists; nothing else changes.
// Same count as the backfill report's doesNotFit.classMemberMissing.
export async function planDanglingClassMembers(opts: { institutionId?: string } = {}) {
  const classes = await CourseInstance.find({ ...(opts.institutionId ? { institutionId: opts.institutionId } : {}), 'studentIds.0': { $exists: true } })
    .select('id institutionId studentIds')
    .lean();
  const ids = [...new Set(classes.flatMap((c) => c.studentIds ?? []))];
  const existing = new Set((await Student.find({ id: { $in: ids } }).select('id').lean()).map((s) => s.id));
  const items = classes.flatMap((c) => [...new Set(c.studentIds ?? [])].filter((id) => !existing.has(id)).map((studentId) => ({ classId: c.id, studentId })));
  return { classesChecked: classes.length, dangling: items.length, items: items.slice(0, 200) };
}

export async function cleanDanglingClassMembers(opts: { institutionId?: string } = {}) {
  const plan = await planDanglingClassMembers(opts);
  let removed = 0;
  const byClass = new Map<string, string[]>();
  // Re-plan without the 200-item cap for the actual removal.
  const classes = await CourseInstance.find({ ...(opts.institutionId ? { institutionId: opts.institutionId } : {}), 'studentIds.0': { $exists: true } }).select('id studentIds').lean();
  const ids = [...new Set(classes.flatMap((c) => c.studentIds ?? []))];
  const existing = new Set((await Student.find({ id: { $in: ids } }).select('id').lean()).map((s) => s.id));
  for (const c of classes) {
    const gone = [...new Set(c.studentIds ?? [])].filter((id) => !existing.has(id));
    if (gone.length) byClass.set(c.id, gone);
  }
  for (const [classId, gone] of byClass) {
    const res = await CourseInstance.updateOne({ id: classId }, { $pull: { studentIds: { $in: gone } } });
    if (res.modifiedCount) removed += gone.length;
  }
  return { before: plan, removed };
}
