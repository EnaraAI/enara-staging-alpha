import { Batch } from '../models/Batch';
import { Student } from '../models/Student';
import { norm } from './importSpec';

// Who a school record is for. A student's class (group) is their ENARA group (Student.batchId -> Batch.name), matched by normalised name.
export interface Who { id: string; institutionId?: string; grade?: string; groupKey?: string }

export async function whoIs(studentId: string): Promise<Who | null> {
  const s = await Student.findOne({ id: studentId }).select('id institutionId grade batchId').lean();
  if (!s) return null;
  const g = s.batchId ? await Batch.findOne({ id: s.batchId }).select('name').lean() : null;
  return { id: s.id, institutionId: s.institutionId, grade: s.grade || undefined, groupKey: g ? norm(g.name) : undefined };
}

/** Mongo filter: announcements of the student's school meant for this student (school, their grade, their class, or them). */
export function announcementFilter(w: Who, now = new Date()) {
  const or: Record<string, unknown>[] = [{ audience: 'school' }, { audience: 'student', audienceValue: w.id }];
  if (w.grade) or.push({ audience: 'grade', audienceKey: norm(w.grade) });
  if (w.groupKey) or.push({ audience: 'group', audienceKey: w.groupKey });
  return { institutionId: w.institutionId, withdrawnAt: { $exists: false }, publishAt: { $lte: now }, $and: [{ $or: or }, { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] }] };
}

/** Pure check used by tests and notifications. */
export function announcementIsFor(a: { audience: string; audienceValue?: string; audienceKey?: string }, w: Who): boolean {
  if (a.audience === 'school') return true;
  if (a.audience === 'student') return a.audienceValue === w.id;
  if (a.audience === 'grade') return !!w.grade && a.audienceKey === norm(w.grade);
  if (a.audience === 'group') return !!w.groupKey && a.audienceKey === w.groupKey;
  return false;
}
