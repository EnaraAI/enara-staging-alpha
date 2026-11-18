import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { Batch, type GroupArchiveRecord } from '../models/Batch';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { CourseInstance, type ClassArchiveRecord } from '../models/CourseInstance';
import { Student, type StudentArchiveRecord } from '../models/Student';
import { User } from '../models/User';
import { recordAudit } from './auditTrail';
import { endParentLinksForStudent } from '../parents/linkLifecycle';
import { syncClassMember, syncStudentGroup } from './enrollmentSync';
import { groupsOfStudent, refreshGroupCounts } from './groupCounts';

// Multi-class step 6: archiving (docs/multi-class/ARCHIVE_NOTES.md, PLAN §10).
//
// Two switches, both off by default; with both off nothing here is reachable
// and every existing endpoint behaves exactly as before:
//   ENROLLMENT_GROUP_ARCHIVE   groups and classes: refuse to delete one that
//                              still has active students, archive/restore,
//                              "students without an active group" list.
//   ENROLLMENT_STUDENT_ARCHIVE students: archive/restore, confirmed permanent
//                              delete (services/studentErasure.ts).
//
// Archiving keeps old fields and enrollments in agreement (so the step 4
// shadow and the backfill dry run stay clean): it clears the old field
// (Student.batchId / CourseInstance.studentIds) AND ends the matching active
// enrollments (status 'inactive', endedAt), recording exactly what it changed
// so a restore puts back only that. Nothing is deleted: the student, group and
// class records, enrollment rows, attempts, grades and reports all stay.

export type Actor = { id?: string; role?: string } | undefined;

export const groupArchiveOn = () => getConfig().archive.group;
export const studentArchiveOn = () => getConfig().archive.student;

/** Mongo filter: not archived (archivedAt missing or null). */
export const NOT_ARCHIVED = { archivedAt: null } as const;

const school = (institutionId?: string) => (institutionId ? { institutionId } : {});
const uniq = (xs: string[]) => [...new Set(xs)];

async function existingActiveStudentIds(ids: string[], institutionId?: string): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await Student.find({ id: { $in: uniq(ids) }, ...school(institutionId), ...NOT_ARCHIVED }).select('id').lean();
  const found = new Set(rows.map((r) => r.id));
  return uniq(ids).filter((id) => found.has(id));
}

async function endRows(ids: string[], actor: Actor, now: Date): Promise<number> {
  if (!ids.length) return 0;
  const res = await ClassEnrollment.updateMany(
    { id: { $in: ids }, status: 'active' },
    { $set: { status: 'inactive', endedAt: now, ...(actor?.id ? { endedBy: actor.id } : {}) } },
  );
  return res.modifiedCount;
}

async function reactivateRows(filter: Record<string, unknown>, now: Date): Promise<number> {
  const res = await ClassEnrollment.updateMany(
    { ...filter, status: 'inactive' },
    { $set: { status: 'active', startedAt: now }, $unset: { endedAt: 1, endedBy: 1 } },
  );
  return res.modifiedCount;
}

// ---------------------------------------------------------------------------
// Who is still active in a group / class (old fields OR active enrollments)
// ---------------------------------------------------------------------------

export async function activeGroupMembers(group: { id: string; institutionId?: string }) {
  const byField = (await Student.find({ ...school(group.institutionId), batchId: group.id, ...NOT_ARCHIVED }).select('id').lean()).map((s) => s.id);
  const rows = await ClassEnrollment.find({ ...school(group.institutionId), scope: 'group', targetId: group.id, status: 'active' }).select('studentId').lean();
  const byEnrollment = await existingActiveStudentIds(rows.map((r) => r.studentId), group.institutionId);
  return { byField, byEnrollment, all: uniq([...byField, ...byEnrollment]) };
}

export async function activeClassMembers(cls: { id: string; institutionId?: string; batchId?: string; studentIds?: string[] }) {
  const explicit = await existingActiveStudentIds(cls.studentIds ?? [], cls.institutionId);
  const viaGroup = cls.batchId ? (await activeGroupMembers({ id: cls.batchId, institutionId: cls.institutionId })).all : [];
  const rows = await ClassEnrollment.find({ ...school(cls.institutionId), scope: 'class', targetId: cls.id, status: 'active' }).select('studentId').lean();
  const byEnrollment = await existingActiveStudentIds(rows.map((r) => r.studentId), cls.institutionId);
  return { explicit, viaGroup, byEnrollment, all: uniq([...explicit, ...viaGroup, ...byEnrollment]) };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

type GroupLike = { id: string; institutionId?: string; studentCount?: number; archivedAt?: Date | null; archive?: GroupArchiveRecord };

export async function archiveGroup(group: GroupLike, actor: Actor) {
  if (group.archivedAt) throw new AppError('This group is already archived', 409, 'ALREADY_ARCHIVED');
  const members = await activeGroupMembers(group);
  const rows = await ClassEnrollment.find({ ...school(group.institutionId), scope: 'group', targetId: group.id, status: 'active' }).select('id').lean();
  const now = new Date();
  const record: GroupArchiveRecord = {
    memberIds: members.all,
    fieldMemberIds: members.byField,
    enrollmentIds: rows.map((r) => r.id),
    studentCount: group.studentCount ?? 0,
  };
  // The record is written first, so a restore always knows what to put back.
  const marked = await Batch.updateOne({ id: group.id, ...NOT_ARCHIVED }, { $set: { archivedAt: now, archivedBy: actor?.id, archive: record } });
  if (!marked.modifiedCount) throw new AppError('This group is already archived', 409, 'ALREADY_ARCHIVED');
  const cleared = members.byField.length
    ? (await Student.updateMany({ id: { $in: members.byField }, batchId: group.id }, { $unset: { batchId: 1 } })).modifiedCount
    : 0;
  if (cleared) await Batch.updateOne({ id: group.id }, [{ $set: { studentCount: { $max: [0, { $subtract: [{ $ifNull: ['$studentCount', 0] }, cleared] }] } } }]);
  const ended = await endRows(record.enrollmentIds, actor, now);
  await refreshGroupCounts([group.id]); // multi-class S4 (no-op while off)
  await recordAudit('group.archived', actor, { institutionId: group.institutionId, type: 'group', id: group.id }, { members: record.memberIds.length, unplaced: cleared, enrollmentsEnded: ended });
  return { id: group.id, archivedAt: now, members: record.memberIds.length, studentsUnplaced: cleared, enrollmentsEnded: ended };
}

export async function restoreGroup(group: GroupLike, actor: Actor) {
  if (!group.archivedAt) throw new AppError('This group is not archived', 409, 'NOT_ARCHIVED');
  const rec: GroupArchiveRecord = { memberIds: [], fieldMemberIds: [], enrollmentIds: [], studentCount: 0, ...(group.archive ?? {}) };
  const unmarked = await Batch.updateOne({ id: group.id, archivedAt: { $ne: null } }, { $unset: { archivedAt: 1, archivedBy: 1, archive: 1 } });
  if (!unmarked.modifiedCount) throw new AppError('This group is not archived', 409, 'NOT_ARCHIVED');
  const now = new Date();

  // Old field: only students who are still here, active and without a group come back.
  const free = (await Student.find({ id: { $in: rec.fieldMemberIds }, ...school(group.institutionId), ...NOT_ARCHIVED, batchId: { $in: [null, ''] } }).select('id').lean()).map((s) => s.id);
  if (free.length) await Student.updateMany({ id: { $in: free }, batchId: { $in: [null, ''] } }, { $set: { batchId: group.id } });
  const returned = (await Student.find({ id: { $in: free }, batchId: group.id }).select('id').lean()).map((s) => s.id);
  if (returned.length) await Batch.updateOne({ id: group.id }, { $inc: { studentCount: returned.length } });

  // Enrollments: the rows the archive ended, for students who came back (old
  // field) or who were members through an enrollment only and are still active.
  const fieldSet = new Set(rec.fieldMemberIds);
  const enrollmentOnly = await existingActiveStudentIds(rec.memberIds.filter((id) => !fieldSet.has(id)), group.institutionId);
  const back = uniq([...returned, ...enrollmentOnly]);
  const reactivated = back.length ? await reactivateRows({ id: { $in: rec.enrollmentIds }, studentId: { $in: back } }, now) : 0;
  // With the dual write on, make sure every returned student has the row (idempotent).
  for (const studentId of returned) await syncStudentGroup({ institutionId: group.institutionId, studentId, toGroupId: group.id, by: actor?.id });

  await refreshGroupCounts([group.id]); // multi-class S4 (no-op while off)
  const notReturned = await whyNotBack(rec.fieldMemberIds.filter((id) => !returned.includes(id)));
  await recordAudit('group.restored', actor, { institutionId: group.institutionId, type: 'group', id: group.id }, { returned: back.length, enrollmentsReactivated: reactivated, notReturned: notReturned.length });
  return { id: group.id, returned: back, enrollmentsReactivated: reactivated, notReturned };
}

async function whyNotBack(ids: string[]): Promise<{ studentId: string; reason: 'deleted' | 'archived' | 'moved' }[]> {
  if (!ids.length) return [];
  const rows = new Map((await Student.find({ id: { $in: ids } }).select('id archivedAt').lean()).map((s) => [s.id, s]));
  return ids.map((studentId) => {
    const s = rows.get(studentId);
    return { studentId, reason: !s ? 'deleted' : s.archivedAt ? 'archived' : 'moved' };
  });
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

type ClassLike = { id: string; institutionId?: string; studentIds?: string[]; visibility?: string; archivedAt?: Date | null; archive?: ClassArchiveRecord };

export async function archiveClass(cls: ClassLike, actor: Actor) {
  if (cls.archivedAt) throw new AppError('This class is already archived', 409, 'ALREADY_ARCHIVED');
  const rows = await ClassEnrollment.find({ ...school(cls.institutionId), scope: 'class', targetId: cls.id, status: 'active' }).select('id').lean();
  const now = new Date();
  const record: ClassArchiveRecord = {
    memberIds: uniq(cls.studentIds ?? []),
    enrollmentIds: rows.map((r) => r.id),
    visibility: (cls.visibility as ClassArchiveRecord['visibility']) ?? 'internal',
  };
  // Archived classes use the existing 'archived' visibility, so every student
  // view (which only shows 'student' classes) hides them on both read paths.
  const marked = await CourseInstance.updateOne(
    { id: cls.id, ...NOT_ARCHIVED },
    { $set: { archivedAt: now, archivedBy: actor?.id, archive: record, visibility: 'archived', studentIds: [] } },
  );
  if (!marked.modifiedCount) throw new AppError('This class is already archived', 409, 'ALREADY_ARCHIVED');
  const ended = await endRows(record.enrollmentIds, actor, now);
  await recordAudit('class.archived', actor, { institutionId: cls.institutionId, type: 'class', id: cls.id }, { explicitMembers: record.memberIds.length, enrollmentsEnded: ended });
  return { id: cls.id, archivedAt: now, explicitMembers: record.memberIds.length, enrollmentsEnded: ended };
}

export async function restoreClass(cls: ClassLike, actor: Actor) {
  if (!cls.archivedAt) throw new AppError('This class is not archived', 409, 'NOT_ARCHIVED');
  const rec: ClassArchiveRecord = { memberIds: [], enrollmentIds: [], visibility: 'internal', ...(cls.archive ?? {}) };
  const back = await existingActiveStudentIds(rec.memberIds, cls.institutionId);
  const unmarked = await CourseInstance.updateOne(
    { id: cls.id, archivedAt: { $ne: null } },
    { $set: { visibility: rec.visibility }, $unset: { archivedAt: 1, archivedBy: 1, archive: 1 }, $addToSet: { studentIds: { $each: back } } },
  );
  if (!unmarked.modifiedCount) throw new AppError('This class is not archived', 409, 'NOT_ARCHIVED');
  const now = new Date();
  const reactivated = back.length ? await reactivateRows({ id: { $in: rec.enrollmentIds }, studentId: { $in: back } }, now) : 0;
  for (const studentId of back) await syncClassMember({ institutionId: cls.institutionId, studentId, classId: cls.id, action: 'add', by: actor?.id });
  const notReturned = await whyNotBack(rec.memberIds.filter((id) => !back.includes(id)));
  await recordAudit('class.restored', actor, { institutionId: cls.institutionId, type: 'class', id: cls.id }, { returned: back.length, enrollmentsReactivated: reactivated });
  return { id: cls.id, returned: back, enrollmentsReactivated: reactivated, notReturned };
}

// ---------------------------------------------------------------------------
// Students without an active group
// ---------------------------------------------------------------------------

export type UnplacedReason = 'group_deleted' | 'group_archived' | 'group_in_other_school' | 'no_group';
export interface UnplacedStudent {
  studentId: string;
  reason: UnplacedReason;
  /** The group they point at (deleted/archived/other school), or the archived group they were in. */
  groupId?: string;
  institutionId?: string;
  name: string;
  email: string;
  grade?: string;
}

/**
 * Active (not archived) students with no active group: neither
 * Student.batchId nor an active group enrollment points at a group that
 * exists in their school and is not archived. Read-only; nothing is changed.
 */
export async function studentsWithoutActiveGroup(opts: { institutionId?: string } = {}): Promise<UnplacedStudent[]> {
  const students = await Student.find({ ...school(opts.institutionId), ...NOT_ARCHIVED })
    .select('id name email grade institutionId batchId')
    .sort({ name: 1, id: 1 })
    .lean();
  const rows = await ClassEnrollment.find({ ...school(opts.institutionId), scope: 'group', status: 'active' }).select('studentId targetId').lean();
  const groupIds = uniq([...students.map((s) => s.batchId).filter((x): x is string => !!x), ...rows.map((r) => r.targetId)]);
  const groups = new Map((await Batch.find({ id: { $in: groupIds } }).select('id institutionId archivedAt').lean()).map((b) => [b.id, b]));
  const archivedMember = new Map<string, string>();
  for (const b of await Batch.find({ ...school(opts.institutionId), archivedAt: { $ne: null } }).select('id archive.memberIds').sort({ archivedAt: 1 }).lean()) {
    for (const sid of (b.archive as GroupArchiveRecord | undefined)?.memberIds ?? []) archivedMember.set(sid, b.id);
  }
  const rowsByStudent = new Map<string, string[]>();
  for (const r of rows) rowsByStudent.set(r.studentId, [...(rowsByStudent.get(r.studentId) ?? []), r.targetId]);
  const active = (gid: string, inst?: string) => {
    const g = groups.get(gid);
    return !!g && !g.archivedAt && (g.institutionId ?? undefined) === (inst ?? undefined);
  };

  const out: UnplacedStudent[] = [];
  for (const s of students) {
    if (s.batchId && active(s.batchId, s.institutionId)) continue;
    if ((rowsByStudent.get(s.id) ?? []).some((g) => active(g, s.institutionId))) continue;
    let reason: UnplacedReason = 'no_group';
    let groupId: string | undefined;
    if (s.batchId) {
      const g = groups.get(s.batchId);
      groupId = s.batchId;
      reason = !g ? 'group_deleted' : g.archivedAt ? 'group_archived' : 'group_in_other_school';
    } else if (archivedMember.has(s.id)) {
      reason = 'group_archived';
      groupId = archivedMember.get(s.id);
    }
    out.push({ studentId: s.id, reason, ...(groupId ? { groupId } : {}), institutionId: s.institutionId, name: s.name, email: s.email, grade: s.grade });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Students (ENROLLMENT_STUDENT_ARCHIVE)
// ---------------------------------------------------------------------------

type StudentLike = { id: string; email?: string; institutionId?: string; batchId?: string; archivedAt?: Date | null; archive?: StudentArchiveRecord };

/** Login accounts of a student: linked by studentId, or (not yet linked) by email in the same school. */
export async function studentUserFilter(s: StudentLike): Promise<Record<string, unknown>> {
  const or: Record<string, unknown>[] = [{ studentId: s.id }];
  if (s.email) or.push({ email: s.email.toLowerCase(), role: 'student', studentId: { $in: [null, ''] }, ...school(s.institutionId) });
  return { $or: or };
}

export async function archiveStudent(s: StudentLike, actor: Actor) {
  if (s.archivedAt) throw new AppError('This student is already archived', 409, 'ALREADY_ARCHIVED');
  const classes = await CourseInstance.find({ ...school(s.institutionId), studentIds: s.id }).select('id').lean();
  const rows = await ClassEnrollment.find({ studentId: s.id, status: 'active' }).select('id').lean();
  const users = await User.find({ ...(await studentUserFilter(s)), role: 'student', status: 'active' }).select('_id').lean();
  const now = new Date();
  const record: StudentArchiveRecord = {
    ...(s.batchId ? { batchId: s.batchId } : {}),
    classIds: classes.map((c) => c.id),
    enrollmentIds: rows.map((r) => r.id),
    userIds: users.map((u) => String(u._id)),
  };
  const marked = await Student.updateOne(
    { id: s.id, ...NOT_ARCHIVED },
    { $set: { archivedAt: now, archivedBy: actor?.id, archive: record }, $unset: { batchId: 1 } },
  );
  if (!marked.modifiedCount) throw new AppError('This student is already archived', 409, 'ALREADY_ARCHIVED');
  if (s.batchId) await Batch.updateOne({ id: s.batchId, ...school(s.institutionId) }, [{ $set: { studentCount: { $max: [0, { $subtract: [{ $ifNull: ['$studentCount', 0] }, 1] }] } } }]);
  if (record.classIds.length) await CourseInstance.updateMany({ id: { $in: record.classIds } }, { $pull: { studentIds: s.id } });
  const ended = await endRows(record.enrollmentIds, actor, now);
  // Account closed: no sign-in, and existing sessions end (tokenVersion).
  if (record.userIds.length) await User.updateMany({ _id: { $in: record.userIds }, status: 'active' }, { $set: { status: 'disabled' }, $inc: { tokenVersion: 1 } });
  await refreshGroupCounts([s.batchId, ...(await groupsOfStudent(s.id))]); // multi-class S4 (no-op while off)
  // P0 item 2: parent access ends (links kept as 'ended', D8; unused codes
  // revoked). restoreStudent does not bring them back (D9).
  await endParentLinksForStudent(s.id, 'archived', actor, { revokeCodes: true });
  await recordAudit('student.archived', actor, { institutionId: s.institutionId, type: 'student', id: s.id }, { group: record.batchId ? 1 : 0, classes: record.classIds.length, enrollmentsEnded: ended, accountsClosed: record.userIds.length });
  return { id: s.id, archivedAt: now, group: record.batchId ?? null, classesLeft: record.classIds.length, enrollmentsEnded: ended, accountsClosed: record.userIds.length };
}

export async function restoreStudent(s: StudentLike, actor: Actor) {
  if (!s.archivedAt) throw new AppError('This student is not archived', 409, 'NOT_ARCHIVED');
  const rec: StudentArchiveRecord = { classIds: [], enrollmentIds: [], userIds: [], ...(s.archive ?? {}) };
  const skipped: { kind: 'group' | 'class'; id: string; reason: 'deleted' | 'archived' }[] = [];

  let groupBack: string | undefined;
  if (rec.batchId) {
    const g = await Batch.findOne({ id: rec.batchId, ...school(s.institutionId) }).select('id archivedAt').lean();
    if (g && !g.archivedAt) groupBack = g.id;
    else skipped.push({ kind: 'group', id: rec.batchId, reason: g ? 'archived' : 'deleted' });
  }
  const classes = new Map((await CourseInstance.find({ id: { $in: rec.classIds }, ...school(s.institutionId) }).select('id archivedAt').lean()).map((c) => [c.id, c]));
  const classesBack: string[] = [];
  for (const id of rec.classIds) {
    const c = classes.get(id);
    if (c && !c.archivedAt) classesBack.push(id);
    else skipped.push({ kind: 'class', id, reason: c ? 'archived' : 'deleted' });
  }

  const unmarked = await Student.updateOne(
    { id: s.id, archivedAt: { $ne: null } },
    { $unset: { archivedAt: 1, archivedBy: 1, archive: 1 }, ...(groupBack ? { $set: { batchId: groupBack } } : {}) },
  );
  if (!unmarked.modifiedCount) throw new AppError('This student is not archived', 409, 'NOT_ARCHIVED');
  if (groupBack) await Batch.updateOne({ id: groupBack }, { $inc: { studentCount: 1 } });
  if (classesBack.length) await CourseInstance.updateMany({ id: { $in: classesBack } }, { $addToSet: { studentIds: s.id } });

  // Enrollments the archive ended, for targets that still exist and are not archived.
  const now = new Date();
  const recorded = await ClassEnrollment.find({ id: { $in: rec.enrollmentIds }, status: 'inactive' }).select('id scope targetId').lean();
  const groupTargets = recorded.filter((r) => r.scope === 'group').map((r) => r.targetId);
  const liveGroups = new Set((await Batch.find({ id: { $in: groupTargets }, ...school(s.institutionId), ...NOT_ARCHIVED }).select('id').lean()).map((b) => b.id));
  const classBackSet = new Set(classesBack);
  const toReactivate = recorded.filter((r) => (r.scope === 'group' ? liveGroups.has(r.targetId) : classBackSet.has(r.targetId))).map((r) => r.id);
  const reactivated = toReactivate.length ? await reactivateRows({ id: { $in: toReactivate } }, now) : 0;
  // With the dual write on, make sure the restored memberships have their rows (idempotent).
  if (groupBack) await syncStudentGroup({ institutionId: s.institutionId, studentId: s.id, toGroupId: groupBack, by: actor?.id });
  for (const classId of classesBack) await syncClassMember({ institutionId: s.institutionId, studentId: s.id, classId, action: 'add', by: actor?.id });
  await refreshGroupCounts([groupBack, ...(await groupsOfStudent(s.id))]); // multi-class S4 (no-op while off)

  // Parent links stay ended (owner decision D9): the school issues new codes.
  // Reopen exactly the accounts the archive closed.
  const reopened = rec.userIds.length ? (await User.updateMany({ _id: { $in: rec.userIds }, status: 'disabled' }, { $set: { status: 'active' } })).modifiedCount : 0;
  await recordAudit('student.restored', actor, { institutionId: s.institutionId, type: 'student', id: s.id }, { group: groupBack ? 1 : 0, classes: classesBack.length, enrollmentsReactivated: reactivated, accountsReopened: reopened, skipped: skipped.length });
  return { id: s.id, group: groupBack ?? null, classes: classesBack, enrollmentsReactivated: reactivated, accountsReopened: reopened, skipped };
}

/** One seat per student (Q1): every student in the school, minus archived ones when the switch is on. */
export async function seatCount(institutionId: string) {
  const total = await Student.countDocuments({ institutionId });
  if (!studentArchiveOn()) return { seatBasis: 'students' as const, seats: total, archivedExcluded: 0 };
  const archived = await Student.countDocuments({ institutionId, archivedAt: { $ne: null } });
  return { seatBasis: 'students' as const, seats: total - archived, archivedExcluded: archived };
}
