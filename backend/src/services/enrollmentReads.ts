import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { Student } from '../models/Student';
import { requestMemo } from '../utils/callContext';
import { activeTargets, studentIdsInClass, studentIdsInGroup } from './enrollment';

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

// Multi-class step 6 (docs/multi-class/STEP_6_NOTES.md): ENROLLMENT_MULTI_CLASS
// turns on multi-class. It only takes effect when dual write is on and all
// seven step 5 features read from enrollments (extra memberships live only in
// class_enrollments, so every read must come from there); otherwise it is
// treated as off and a warning is logged once.
let multiClassWarned = false;

export function multiClassOn(): boolean {
  const cfg = getConfig().enrollment;
  if (!cfg.multiClass) return false;
  const missing = READ_FEATURES.filter((f) => !cfg.readFrom.includes(f));
  if (missing.length || !cfg.dualWrite) {
    if (!multiClassWarned) {
      multiClassWarned = true;
      logger.warn('enrollment_multi_class_ignored', { missingReadFrom: missing, dualWrite: cfg.dualWrite });
    }
    return false;
  }
  return true;
}

/** Tests only: lets the "warned once" check run again. */
export function resetMultiClassWarningForTests(): void {
  multiClassWarned = false;
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
  // Enrollments always belong to a school: a student without one has none.
  if (!student.institutionId) return [];
  return [...(await studentTargets(student.id, student.institutionId)).groupIds].sort();
}

/**
 * A student's active groups and classes in their school, read once per request
 * (a student page asks for both the classes and the groups). These are read
 * paths only; nothing that changes enrollments runs in the same request.
 */
export function studentTargets(studentId: string, institutionId: string): Promise<{ groupIds: string[]; classIds: string[] }> {
  return requestMemo(`enrollmentTargets:${institutionId}:${studentId}`, () => activeTargets(studentId, institutionId));
}

/**
 * CourseInstance filter for "the classes this student is in" (same shape as
 * enrollment.enrolledClassFilter), from the per-request read above. Null when
 * they are in none.
 */
export async function studentClassFilter(studentId: string, institutionId: string): Promise<Record<string, unknown> | null> {
  const { groupIds, classIds } = await studentTargets(studentId, institutionId);
  const or: Record<string, unknown>[] = [];
  if (classIds.length) or.push({ id: { $in: classIds } });
  if (groupIds.length) or.push({ batchId: { $in: groupIds } });
  return or.length ? { $or: or } : null;
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

/** Same as studentGroupIds for many students in one read. Never crosses schools. */
export async function groupIdsByStudent(
  students: { id: string; batchId?: string | null; institutionId?: string | null }[],
  feature: ReadFeature,
): Promise<Map<string, string[]>> {
  if (!readsFromEnrollments(feature)) return new Map(students.map((s) => [s.id, s.batchId ? [s.batchId] : []]));
  const out = new Map<string, string[]>(students.map((s) => [s.id, []]));
  const school = new Map(students.map((s) => [s.id, s.institutionId]));
  const schools = [...new Set(students.map((s) => s.institutionId).filter(Boolean))] as string[];
  if (!schools.length) return out;
  const rows = await ClassEnrollment.find({ scope: 'group', status: 'active', studentId: { $in: [...school.keys()] }, institutionId: { $in: schools } })
    .select('studentId targetId institutionId')
    .lean();
  // A row counts only in the student's own school (tenant isolation).
  for (const r of rows) if (school.get(r.studentId) === r.institutionId) out.get(r.studentId)!.push(r.targetId);
  for (const ids of out.values()) ids.sort();
  return out;
}

/** A group's active members in one school (the school is required: reads never cross schools). */
export function groupMemberIds(groupId: string, institutionId: string): Promise<string[]> {
  return studentIdsInGroup(groupId, institutionId);
}

type RosterClass = { id?: string; studentIds?: string[]; batchId?: string; institutionId?: string };

// Old rosters list the class's own studentIds first (in that order), then the
// group's members. The new rosters keep that order: members that are in the
// class's studentIds come first in that order, then the rest. Only the ORDER
// reads studentIds; who is a member comes from class_enrollments.
function explicitFirst(members: Set<string>, explicitOrder: string[] | undefined): string[] {
  const out: string[] = [];
  for (const id of explicitOrder ?? []) if (members.has(id) && !out.includes(id)) out.push(id);
  return out;
}

/**
 * Students in a class from class_enrollments (teacher_rosters), in the same
 * order as the old classStudentIds: the class's own list first, then group
 * members in Student insertion order (_id; the old read returned them in
 * index/natural order, which is insertion order). Scoped to the class's school.
 */
export async function classRosterFromEnrollments(cls: RosterClass): Promise<string[]> {
  if (!cls.id || !cls.institutionId) return [];
  const members = new Set(await studentIdsInClass({ id: cls.id, batchId: cls.batchId, institutionId: cls.institutionId }));
  const first = explicitFirst(members, cls.studentIds);
  const rest = [...members].filter((id) => !first.includes(id));
  if (!rest.length) return first;
  const ordered = await Student.find({ id: { $in: rest }, institutionId: cls.institutionId }).select('id').sort({ _id: 1 }).lean();
  return [...first, ...ordered.map((s) => s.id)];
}

/**
 * Analytics (feature `analytics`): every course's members and every loaded
 * student's groups from class_enrollments, in one read. Same rule as the old
 * courseStudentIds: explicit members (any), plus group members among the
 * loaded students; same order (explicit list order, then loaded-student order).
 * Rows count only in the class's or student's own school.
 */
export async function analyticsMembership(
  courses: { id: string; batchId?: string; studentIds?: string[]; institutionId?: string }[],
  students: { id: string; institutionId?: string }[],
): Promise<{ rosters: Map<string, string[]>; groupsByStudent: Map<string, string[]> }> {
  const schools = [...new Set([...courses, ...students].map((x) => x.institutionId).filter(Boolean))] as string[];
  const studentSchool = new Map(students.map((s) => [s.id, s.institutionId]));
  const courseSchool = new Map(courses.map((c) => [c.id, c.institutionId]));
  const rows = schools.length
    ? await ClassEnrollment.find({
        status: 'active',
        institutionId: { $in: schools },
        $or: [{ scope: 'class', targetId: { $in: courses.map((c) => c.id) } }, { scope: 'group', studentId: { $in: students.map((s) => s.id) } }],
      })
        .select('scope targetId studentId institutionId')
        .lean()
    : [];
  const byClass = new Map<string, Set<string>>();
  const groupsByStudent = new Map<string, string[]>(students.map((s) => [s.id, []]));
  for (const r of rows) {
    if (r.scope === 'class') {
      if (courseSchool.get(r.targetId) !== r.institutionId) continue;
      byClass.set(r.targetId, (byClass.get(r.targetId) ?? new Set()).add(r.studentId));
    } else if (studentSchool.get(r.studentId) === r.institutionId) {
      groupsByStudent.get(r.studentId)!.push(r.targetId);
    }
  }
  for (const ids of groupsByStudent.values()) ids.sort();
  const rosters = new Map<string, string[]>();
  for (const c of courses) {
    const explicit = byClass.get(c.id) ?? new Set<string>();
    const inGroup = c.batchId ? students.filter((s) => s.institutionId === c.institutionId && groupsByStudent.get(s.id)!.includes(c.batchId!)).map((s) => s.id) : [];
    const members = new Set([...explicit, ...inGroup]);
    const first = explicitFirst(members, c.studentIds);
    const done = new Set(first);
    const ordered = [...first, ...inGroup.filter((id) => !done.has(id))];
    for (const id of ordered) done.add(id);
    rosters.set(c.id, [...ordered, ...[...explicit].filter((id) => !done.has(id)).sort()]);
  }
  return { rosters, groupsByStudent };
}

/**
 * Multi-class S5: students in each class through a class enrollment only (not
 * on the class's own studentIds): the step 6 extra class members. These are
 * the class rows the teacher_rosters roster reads (studentIdsInClass), batched
 * for a list. Rows count only in the class's school, for students that exist
 * there and are not archived. Order: enrollment start, then student id.
 */
export async function enrollmentOnlyClassMembers(classes: { id: string; institutionId?: string | null; studentIds?: string[] }[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(classes.map((c) => [c.id, []]));
  const scoped = classes.filter((c) => c.institutionId);
  if (!scoped.length) return out;
  const school = new Map(scoped.map((c) => [c.id, c.institutionId as string]));
  const rows = await ClassEnrollment.find({ scope: 'class', status: 'active', targetId: { $in: scoped.map((c) => c.id) }, institutionId: { $in: [...new Set(school.values())] } })
    .select('studentId targetId institutionId startedAt')
    .sort({ startedAt: 1, studentId: 1 })
    .lean();
  const listed = new Map(scoped.map((c) => [c.id, new Set(c.studentIds ?? [])]));
  const candidates = rows.filter((r) => school.get(r.targetId) === r.institutionId && !listed.get(r.targetId)!.has(r.studentId));
  if (!candidates.length) return out;
  const live = new Set(
    (await Student.find({ id: { $in: [...new Set(candidates.map((r) => r.studentId))] }, archivedAt: null }).select('id institutionId').lean()).map((s) => `${s.institutionId}|${s.id}`),
  );
  for (const r of candidates) if (live.has(`${r.institutionId}|${r.studentId}`) && !out.get(r.targetId)!.includes(r.studentId)) out.get(r.targetId)!.push(r.studentId);
  return out;
}

/**
 * Attendance roster (feature `attendance`). Today the roster is the class's own
 * studentIds only (the Q7 gap). From enrollments: the class's explicit members;
 * with ENROLLMENT_ATTENDANCE_FIX also its group's members (Q7). Order does not
 * matter here: the roster is sorted by name. Scoped to the class's school.
 */
export async function attendanceRosterFromEnrollments(cls: { id: string; batchId?: string; institutionId?: string }): Promise<string[]> {
  if (!cls.institutionId) return [];
  if (getConfig().enrollment.attendanceFix) return studentIdsInClass(cls);
  const rows = await ClassEnrollment.find({ institutionId: cls.institutionId, scope: 'class', targetId: cls.id, status: 'active' }).select('studentId').lean();
  return rows.map((r) => r.studentId);
}

/** Attendance class list: roster size per class, counted as attendanceRosterFromEnrollments does, in one read. */
export async function attendanceRosterCounts(classes: { id: string; batchId?: string; institutionId?: string }[]): Promise<Map<string, number>> {
  const fix = getConfig().enrollment.attendanceFix;
  const scoped = classes.filter((c) => c.institutionId);
  const schools = [...new Set(scoped.map((c) => c.institutionId!))];
  const batchIds = fix ? ([...new Set(scoped.map((c) => c.batchId).filter(Boolean))] as string[]) : [];
  const or: Record<string, unknown>[] = [{ scope: 'class', targetId: { $in: scoped.map((c) => c.id) } }];
  if (batchIds.length) or.push({ scope: 'group', targetId: { $in: batchIds } });
  const rows = schools.length
    ? await ClassEnrollment.find({ status: 'active', institutionId: { $in: schools }, $or: or }).select('scope targetId studentId institutionId').lean()
    : [];
  const out = new Map<string, number>(classes.map((c) => [c.id, 0]));
  for (const c of scoped) {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.institutionId !== c.institutionId) continue;
      if ((r.scope === 'class' && r.targetId === c.id) || (fix && r.scope === 'group' && !!c.batchId && r.targetId === c.batchId)) ids.add(r.studentId);
    }
    out.set(c.id, ids.size);
  }
  return out;
}
