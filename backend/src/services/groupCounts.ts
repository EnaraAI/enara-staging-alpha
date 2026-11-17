import { Batch } from '../models/Batch';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { Student } from '../models/Student';
import { multiClassOn } from './enrollmentReads';

// Multi-class S4 (owner decision 2026-11-17, docs/multi-class/STEP_6_NOTES.md):
// while multi-class is in effect, a group's student count is every ACTIVE
// member, each student once: students whose main group (Student.batchId) it
// is, plus students with an active group enrollment in it (extra groups).
// Archived students and students of another school never count. With the
// switch off nothing here reads or writes (the old $inc bookkeeping on
// Batch.studentCount stays as it was).

type GroupRef = { id: string; institutionId?: string | null };

/** Live member counts per group (0 for a group with nobody, or without a school). One round per school. */
export async function groupMemberCounts(groups: GroupRef[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(groups.map((g) => [g.id, 0]));
  const bySchool = new Map<string, string[]>();
  for (const g of groups) if (g.institutionId) bySchool.set(g.institutionId, [...(bySchool.get(g.institutionId) ?? []), g.id]);
  for (const [school, ids] of bySchool) {
    const [byField, rows] = await Promise.all([
      Student.find({ institutionId: school, batchId: { $in: ids }, archivedAt: null }).select('id batchId').lean(),
      ClassEnrollment.find({ institutionId: school, scope: 'group', targetId: { $in: ids }, status: 'active' }).select('studentId targetId').lean(),
    ]);
    const known = new Set(byField.map((s) => s.id));
    const unknown = [...new Set(rows.map((r) => r.studentId))].filter((id) => !known.has(id));
    const live = new Set([
      ...known,
      ...(unknown.length ? await Student.find({ id: { $in: unknown }, institutionId: school, archivedAt: null }).select('id').lean() : []).map((s) => s.id),
    ]);
    const members = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    for (const s of byField) members.get(s.batchId!)?.add(s.id);
    for (const r of rows) if (live.has(r.studentId)) members.get(r.targetId)?.add(r.studentId);
    for (const [id, set] of members) out.set(id, set.size);
  }
  return out;
}

/**
 * Stores the live count in Batch.studentCount for these groups. Runs only
 * while multi-class is in effect, or with force (the multi-class undo, which
 * runs after the switch is turned off and brings the counts back to main-group
 * members).
 */
export async function refreshGroupCounts(groupIds: (string | null | undefined)[], opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && !multiClassOn()) return;
  const ids = [...new Set(groupIds.filter((id): id is string => !!id))];
  if (!ids.length) return;
  const groups = await Batch.find({ id: { $in: ids } }).select('id institutionId').lean();
  if (!groups.length) return;
  const counts = await groupMemberCounts(groups);
  await Batch.bulkWrite(groups.map((g) => ({ updateOne: { filter: { id: g.id }, update: { $set: { studentCount: counts.get(g.id) ?? 0 } } } })));
}

/** Every group the student has a row in (any status), so their counts can be refreshed after a change. [] while off. */
export async function groupsOfStudent(studentId: string): Promise<string[]> {
  if (!multiClassOn()) return [];
  return ClassEnrollment.distinct('targetId', { studentId, scope: 'group' }) as Promise<string[]>;
}

/** Group rows for a reply: studentCount is the live count while multi-class is on; unchanged (no read) while off. */
export async function withLiveGroupCounts<T extends Record<string, unknown>>(rows: T[]): Promise<T[]> {
  if (!multiClassOn() || !rows.length) return rows;
  const counts = await groupMemberCounts(rows.map((r) => ({ id: String(r.id), institutionId: r.institutionId as string | undefined })));
  return rows.map((r) => ({ ...r, studentCount: counts.get(String(r.id)) ?? 0 }));
}
