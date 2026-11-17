import { AppError } from '../middleware/errorHandler';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { AvatarSession } from '../models/AvatarSession';
import { Batch } from '../models/Batch';
import { ClassEnrollment, type EnrollmentScope } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { StudentClassChoice } from '../models/StudentClassChoice';
import { TutorSession } from '../models/TutorSession';
import { UsageEvent } from '../models/UsageEvent';
import { requestMemo } from '../utils/callContext';
import { recordAudit } from './auditTrail';
import { endEnrollment, enroll, studentIdsInClass } from './enrollment';
import { multiClassOn } from './enrollmentReads';
import { getEnrolledInstances } from './studentCourseService';

// Multi-class step 6 (docs/multi-class/STEP_6_NOTES.md), behind
// ENROLLMENT_MULTI_CLASS (see enrollmentReads.multiClassOn). Every function
// here does nothing (or returns "no change") while the switch is off.
//
// "Multi-class student": a student whose active memberships the old fields
// cannot express (two or more groups, or a class membership that lives only in
// class_enrollments, not in CourseInstance.studentIds) AND who has at least two
// memberships. Everyone else is a single-class student, exactly as today: one
// group and its classes, plus classes listed in a class's own studentIds. The
// product answers Q2-Q4, Q6 and Q9 change answers only for multi-class
// students, so single-class students see no change with the switch on.

export { multiClassOn };

type Who = { id: string; institutionId?: string | null };

/** Which of these students are multi-class (one read for all; never crosses schools). */
export async function multiClassStudentIds(students: Who[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!multiClassOn()) return out;
  const school = new Map(students.filter((s) => s.institutionId).map((s) => [s.id, s.institutionId as string]));
  if (!school.size) return out;
  const rows = await ClassEnrollment.find({ status: 'active', studentId: { $in: [...school.keys()] }, institutionId: { $in: [...new Set(school.values())] } })
    .select('studentId scope targetId institutionId')
    .lean();
  const own = rows.filter((r) => school.get(r.studentId) === r.institutionId);
  const classIds = [...new Set(own.filter((r) => r.scope === 'class').map((r) => r.targetId))];
  const listed = new Map(
    (classIds.length ? await CourseInstance.find({ id: { $in: classIds } }).select('id studentIds').lean() : []).map((c) => [c.id, new Set(c.studentIds ?? [])]),
  );
  const by = new Map<string, { groups: number; classes: number; enrollmentOnly: number }>();
  for (const r of own) {
    const x = by.get(r.studentId) ?? { groups: 0, classes: 0, enrollmentOnly: 0 };
    if (r.scope === 'group') x.groups++;
    else {
      x.classes++;
      if (!listed.get(r.targetId)?.has(r.studentId)) x.enrollmentOnly++;
    }
    by.set(r.studentId, x);
  }
  for (const [id, x] of by) if (x.groups >= 2 || (x.enrollmentOnly >= 1 && x.groups + x.classes >= 2)) out.add(id);
  return out;
}

/** Same as multiClassStudentIds for one student, once per request. */
export function isMultiClassStudent(student: Who): Promise<boolean> {
  if (!multiClassOn() || !student.institutionId) return Promise.resolve(false);
  return requestMemo(`multiClass:${student.institutionId}:${student.id}`, async () => (await multiClassStudentIds([student])).has(student.id));
}

// ---------------------------------------------------------------------------
// 1. Admin: add a student to a second (third...) group or class, and remove them.

function requireOn() {
  if (!multiClassOn()) throw new AppError('Not found', 404, 'FEATURE_DISABLED');
}

type StaffReq = { user?: { id: string; role: string; institutionId?: string } };

async function loadStudentForAdmin(req: StaffReq, studentId: string) {
  const user = req.user!;
  if (!['admin', 'enara-admin'].includes(user.role)) throw new AppError('Admin access required', 403, 'ADMIN_REQUIRED');
  const student = await Student.findOne(user.role === 'enara-admin' ? { id: studentId } : { id: studentId, institutionId: user.institutionId })
    .select('id name institutionId batchId archivedAt')
    .lean();
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  // Every enrollment belongs to the student's school (Enara admins included).
  if (!student.institutionId) throw new AppError('This student has no school', 409, 'NO_SCHOOL');
  return student as { id: string; name: string; institutionId: string; batchId?: string; archivedAt?: Date | null };
}

/** Every group and class the student is in, for the admin student page. */
export async function studentMemberships(req: StaffReq, studentId: string) {
  requireOn();
  const student = await loadStudentForAdmin(req, studentId);
  const rows = await ClassEnrollment.find({ studentId: student.id, institutionId: student.institutionId, status: 'active' })
    .select('scope targetId source startedAt')
    .sort({ startedAt: 1, targetId: 1 })
    .lean();
  const groupRows = rows.filter((r) => r.scope === 'group');
  const classRows = rows.filter((r) => r.scope === 'class');
  const groupIds = groupRows.map((r) => r.targetId);
  const [groups, classes] = await Promise.all([
    groupIds.length ? Batch.find({ id: { $in: groupIds }, institutionId: student.institutionId }).select('id name').lean() : [],
    CourseInstance.find({
      institutionId: student.institutionId,
      $or: [{ id: { $in: classRows.map((r) => r.targetId) } }, ...(groupIds.length ? [{ batchId: { $in: groupIds } }] : [])],
    })
      .select('id courseName batchId studentIds createdAt')
      .sort({ createdAt: 1, id: 1 })
      .lean(),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const explicit = new Map(classRows.map((r) => [r.targetId, r]));
  return {
    studentId: student.id,
    primaryGroupId: student.batchId ?? null,
    multiClass: await isMultiClassStudent(student),
    groups: groupRows.map((r) => ({
      id: r.targetId,
      name: groupName.get(r.targetId) ?? null,
      primary: r.targetId === student.batchId,
      source: r.source,
      startedAt: r.startedAt,
      // The main group is changed on the student's record, not here.
      removable: r.targetId !== student.batchId,
    })),
    classes: classes.map((c) => {
      const row = explicit.get(c.id);
      const viaGroup = !!c.batchId && groupIds.includes(c.batchId);
      const onRoster = (c.studentIds ?? []).includes(student.id);
      return {
        id: c.id,
        courseName: c.courseName,
        groupId: c.batchId ?? null,
        groupName: c.batchId ? groupName.get(c.batchId) ?? null : null,
        via: [...(viaGroup ? ['group'] : []), ...(row ? ['class'] : [])],
        source: row?.source ?? null,
        // Only a class added here can be removed here: a class reached through a
        // group goes with the group, and a class's own roster is edited on the class.
        removable: !!row && !onRoster,
      };
    }),
  };
}

function parseScope(raw: unknown): EnrollmentScope {
  if (raw === 'group' || raw === 'class') return raw;
  throw new AppError("scope must be 'group' or 'class'", 400, 'VALIDATION_ERROR');
}

function parseTarget(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(raw)) throw new AppError('targetId is required', 400, 'VALIDATION_ERROR');
  return raw;
}

/** Adds the student to another group or class (source 'manual'). Idempotent. */
export async function addMembership(req: StaffReq, studentId: string, body: Record<string, unknown>) {
  requireOn();
  const student = await loadStudentForAdmin(req, studentId);
  const scope = parseScope(body.scope);
  const targetId = parseTarget(body.targetId);
  // A second group needs a main group first: Student.batchId stays the main
  // group (still written for the main group only); extra groups live in
  // class_enrollments only.
  // Never make an extra the consistency check would call invalid: no extras
  // for an archived student, or in an archived group or class.
  if (student.archivedAt) throw new AppError('This student is archived; restore them first', 409, 'STUDENT_ARCHIVED');
  if (scope === 'group' && !student.batchId) throw new AppError('Give the student a main group first (edit the student)', 409, 'NO_PRIMARY_GROUP');
  const target =
    scope === 'group'
      ? await Batch.findOne({ id: targetId, institutionId: student.institutionId }).select('archivedAt').lean()
      : await CourseInstance.findOne({ id: targetId, institutionId: student.institutionId }).select('archivedAt visibility').lean();
  if (target && (target.archivedAt || (target as { visibility?: string }).visibility === 'archived')) {
    throw new AppError(scope === 'group' ? 'This group is archived' : 'This class is archived', 409, scope === 'group' ? 'GROUP_ARCHIVED' : 'CLASS_ARCHIVED');
  }
  // enroll() checks that the student and the group/class are in this school (404 otherwise).
  // extraVia marks the row as an extra membership (not drift) for the consistency check.
  const row = await enroll({ institutionId: student.institutionId, studentId: student.id, scope, targetId, source: 'manual', createdBy: req.user!.id, extraVia: 'multi_class' });
  await recordAudit('student_membership_added', req.user, { institutionId: student.institutionId, type: 'student', id: student.id }, { scope, targetId });
  return { enrollmentId: row.id, scope, targetId, status: row.status };
}

/** Ends an extra membership (status 'removed'; the row is kept as history). */
export async function removeMembership(req: StaffReq, studentId: string, scopeRaw: unknown, targetRaw: unknown) {
  requireOn();
  const student = await loadStudentForAdmin(req, studentId);
  const scope = parseScope(scopeRaw);
  const targetId = parseTarget(targetRaw);
  if (scope === 'group' && targetId === student.batchId) {
    throw new AppError("This is the student's main group; change it on the student's record", 409, 'PRIMARY_GROUP');
  }
  const exists = await ClassEnrollment.exists({ studentId: student.id, institutionId: student.institutionId, scope, targetId, status: 'active' });
  if (!exists) throw new AppError('The student is not in this group or class', 404, 'ENROLLMENT_NOT_FOUND');
  if (scope === 'class' && (await CourseInstance.exists({ id: targetId, institutionId: student.institutionId, studentIds: student.id }))) {
    throw new AppError("The student is on this class's own list; remove them on the class", 409, 'CLASS_ROSTER');
  }
  await endEnrollment({ studentId: student.id, scope, targetId, status: 'removed', endedBy: req.user!.id });
  await recordAudit('student_membership_removed', req.user, { institutionId: student.institutionId, type: 'student', id: student.id }, { scope, targetId });
  return { scope, targetId, status: 'removed' as const };
}

// ---------------------------------------------------------------------------
// Q2. Student app: open the last class used; a switcher only with 2+ classes.

export const ALL_CLASSES = 'all';

async function studentRecord(studentId: string) {
  return Student.findOne({ id: studentId }).select('id institutionId').lean() as Promise<{ id: string; institutionId?: string } | null>;
}

/** The class whose enrollment started most recently (a class row, or the group row that brings it). */
async function mostRecentClass(student: { id: string; institutionId: string }, classes: { id: string; batchId?: string }[]): Promise<string | null> {
  if (!classes.length) return null;
  const rows = await ClassEnrollment.find({ studentId: student.id, institutionId: student.institutionId, status: 'active' }).select('scope targetId startedAt').lean();
  const started = (c: { id: string; batchId?: string }) =>
    Math.max(
      ...rows.filter((r) => (r.scope === 'class' && r.targetId === c.id) || (r.scope === 'group' && r.targetId === c.batchId)).map((r) => new Date(r.startedAt).getTime()),
      0,
    );
  // Ties keep the classes' own order (newest class first).
  let best = classes[0];
  for (const c of classes) if (started(c) > started(best)) best = c;
  return best.id;
}

/** GET: the student's classes, the current one and whether to show the switcher. */
export async function myClasses(studentId: string) {
  if (!multiClassOn()) return { enabled: false as const };
  const student = await studentRecord(studentId);
  if (!student?.institutionId) return { enabled: true as const, showSwitcher: false, current: null, classes: [] };
  const instances = await getEnrolledInstances(studentId);
  const multi = await isMultiClassStudent(student);
  const groupIds = [...new Set(instances.map((c) => c.batchId).filter(Boolean))];
  const groups = new Map((groupIds.length ? await Batch.find({ id: { $in: groupIds }, institutionId: student.institutionId }).select('id name').lean() : []).map((g) => [g.id, g.name]));
  const classes = instances.map((c) => ({ id: c.id, courseId: c.courseId, name: c.courseName, groupId: c.batchId ?? null, groupName: c.batchId ? groups.get(c.batchId) ?? null : null }));
  // Single-class students: nothing to choose, nothing changes.
  if (!multi || classes.length < 2) return { enabled: true as const, showSwitcher: false, current: null, classes };
  const choice = await StudentClassChoice.findOne({ studentId }).lean();
  let current: string | null = null;
  if (choice && (choice.classId === ALL_CLASSES || classes.some((c) => c.id === choice.classId))) current = choice.classId;
  else current = await mostRecentClass(student as { id: string; institutionId: string }, instances.map((c) => ({ id: c.id, batchId: c.batchId })));
  return { enabled: true as const, showSwitcher: true, current, currentSource: choice && current === choice.classId ? 'last_used' : 'most_recent_enrollment', classes };
}

async function saveChoice(student: { id: string; institutionId: string }, classId: string) {
  await StudentClassChoice.updateOne({ studentId: student.id }, { $set: { institutionId: student.institutionId, classId, usedAt: new Date() } }, { upsert: true });
}

/** PUT: the student picked a class (or "All my classes"). */
export async function setCurrentClass(studentId: string, classIdRaw: unknown) {
  requireOn();
  const student = await studentRecord(studentId);
  if (!student?.institutionId) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  if (!(await isMultiClassStudent(student))) throw new AppError('Only students in several classes choose a class', 409, 'SINGLE_CLASS');
  const classId = typeof classIdRaw === 'string' ? classIdRaw : '';
  if (classId !== ALL_CLASSES && !(await getEnrolledInstances(studentId)).some((c) => c.id === classId)) {
    throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
  }
  await saveChoice(student as { id: string; institutionId: string }, classId);
  return myClasses(studentId);
}

/** Opening a course records it as the last class used (multi-class students only). */
export async function rememberClassUse(studentId: string, classId: string | undefined): Promise<void> {
  if (!multiClassOn() || !classId) return;
  const student = await studentRecord(studentId);
  if (!student?.institutionId || !(await isMultiClassStudent(student))) return;
  await saveChoice(student as { id: string; institutionId: string }, classId);
}

// ---------------------------------------------------------------------------
// Q4. Teachers see only their own class's work for a multi-class student, plus
// the shared learner profile (mastery, CEFR, skills, misconceptions, pathway).
// School admins and Enara admins keep full visibility. Single-class students:
// no change.

export interface TeacherScope {
  classIds: Set<string>;
  courseIds: Set<string>;
  batchIds: Set<string>;
  /** Assessments given in the teacher's classes: a result for one counts in every class that set it (Q6). */
  assessmentIds: Set<string>;
  teacherId: string;
}

export async function teacherClassScope(user: { id: string; role: string }, student: Who): Promise<TeacherScope | null> {
  if (user.role !== 'teacher' || !(await isMultiClassStudent(student))) return null;
  const classes = (await getEnrolledInstances(student.id, 'teacher_rosters')).filter((c) => (c.instructorIds || []).includes(user.id));
  const classIds = new Set(classes.map((c) => c.id));
  const assessmentIds = classIds.size ? await Assignment.distinct('assessmentId', { classId: { $in: [...classIds] } }) : [];
  return {
    classIds,
    courseIds: new Set(classes.map((c) => c.courseId)),
    batchIds: new Set(classes.map((c) => c.batchId).filter(Boolean)),
    assessmentIds: new Set(assessmentIds as string[]),
    teacherId: user.id,
  };
}

/** Attempts that are the teacher's class work (an assignment of their class, or an assessment for their class's group). */
export async function attemptsInScope<T extends { assignmentId?: string | null; assessmentId: string }>(scope: TeacherScope, attempts: T[]): Promise<T[]> {
  const assignmentIds = [...new Set(attempts.map((t) => t.assignmentId).filter(Boolean))] as string[];
  const loose = [...new Set(attempts.filter((t) => !t.assignmentId).map((t) => t.assessmentId))];
  const [assignments, assessments] = await Promise.all([
    assignmentIds.length ? Assignment.find({ id: { $in: assignmentIds } }).select('id classId assessmentId').lean() : [],
    loose.length ? Assessment.find({ id: { $in: loose } }).select('id batchId').lean() : [],
  ]);
  const asg = new Map(assignments.map((a) => [a.id, a]));
  const asm = new Map(assessments.map((a) => [a.id, a]));
  return attempts.filter((t) => {
    if (t.assignmentId) {
      const a = asg.get(t.assignmentId);
      return !!a && (scope.classIds.has(a.classId) || scope.assessmentIds.has(a.assessmentId));
    }
    const batchId = asm.get(t.assessmentId)?.batchId;
    return (!!batchId && scope.batchIds.has(batchId)) || scope.assessmentIds.has(t.assessmentId);
  });
}

/** An intervention the teacher may see: not another person's, and not tied to another class. */
export function interventionInScope(scope: TeacherScope, i: { assignedBy?: string; assignedByUserId?: string; ownerId?: string; courseId?: string }): boolean {
  // Another staff member's action (and its note) stays with them.
  if (i.assignedBy === 'teacher' && i.assignedByUserId !== scope.teacherId && i.ownerId !== scope.teacherId) return false;
  if (i.courseId && !scope.courseIds.has(i.courseId) && !scope.classIds.has(i.courseId)) return false;
  return true;
}

/** Study plan items the teacher may see: their classes' assignments and results, their own and automatic actions, shared practice. */
export async function studyItemsInScope<T extends { assignmentId?: string; interventionId?: string; courseId?: string }>(scope: TeacherScope, items: T[]): Promise<T[]> {
  const assignmentIds = [...new Set(items.map((i) => i.assignmentId).filter(Boolean))] as string[];
  const interventionIds = [...new Set(items.map((i) => i.interventionId).filter(Boolean))] as string[];
  const { LearningIntervention } = await import('../models/LearningIntervention');
  const [assignments, interventions] = await Promise.all([
    assignmentIds.length ? Assignment.find({ id: { $in: assignmentIds } }).select('id classId assessmentId').lean() : [],
    interventionIds.length ? LearningIntervention.find({ id: { $in: interventionIds } }).select('id assignedBy assignedByUserId ownerId courseId').lean() : [],
  ]);
  const asg = new Map(assignments.map((a) => [a.id, a]));
  const int = new Map(interventions.map((i) => [i.id, i]));
  return items.filter((item) => {
    if (item.assignmentId) {
      const a = asg.get(item.assignmentId);
      return !!a && (scope.classIds.has(a.classId) || scope.assessmentIds.has(a.assessmentId));
    }
    if (item.interventionId) {
      const i = int.get(item.interventionId);
      return !!i && interventionInScope(scope, i);
    }
    return !item.courseId || scope.classIds.has(item.courseId) || scope.courseIds.has(item.courseId);
  });
}

/** Mongo clause: learning events of the teacher's classes, or not tied to a class. */
export function eventsInScope(scope: TeacherScope): Record<string, unknown> {
  return { $or: [{ 'refs.courseId': { $exists: false } }, { 'refs.courseId': null }, { 'refs.courseId': { $in: [...scope.courseIds, ...scope.classIds] } }] };
}

// ---------------------------------------------------------------------------
// Q6. The same assessment given to two of a multi-class student's classes is
// shown once, and one result counts for both. No duplicate attempts.

type AssignmentLike = { id: string; assessmentId: string; classId: string; dueAt?: Date | string; institutionId?: string };

/**
 * The student's assignments with duplicates folded: one per assessment. The
 * one kept is the one the student already worked on, else the earliest due.
 * `also` maps a kept assignment to the other classes that set it. Single-class
 * students (or the switch off): the list unchanged.
 */
export async function foldForStudent<T extends AssignmentLike>(studentId: string, items: T[]): Promise<{ items: T[]; also: Map<string, string[]>; alias: Map<string, string> }> {
  const none = { items, also: new Map<string, string[]>(), alias: new Map<string, string>() };
  if (!multiClassOn() || items.length < 2) return none;
  const byAssessment = new Map<string, T[]>();
  for (const a of items) byAssessment.set(a.assessmentId, [...(byAssessment.get(a.assessmentId) ?? []), a]);
  const dupes = [...byAssessment.values()].filter((g) => g.length > 1 && new Set(g.map((a) => a.classId)).size > 1);
  if (!dupes.length) return none;
  const student = await studentRecord(studentId);
  if (!student || !(await isMultiClassStudent(student))) return none;
  const worked = new Map<string, number>();
  for (const t of await AssessmentAttempt.find({ studentId, assignmentId: { $in: dupes.flat().map((a) => a.id) } }).select('assignmentId startedAt').lean()) {
    worked.set(t.assignmentId!, Math.max(worked.get(t.assignmentId!) ?? 0, new Date(t.startedAt).getTime()));
  }
  const drop = new Set<string>();
  const also = new Map<string, string[]>();
  const alias = new Map<string, string>();
  for (const group of dupes) {
    const keep = [...group].sort((x, y) => (worked.get(y.id) ?? 0) - (worked.get(x.id) ?? 0) || new Date(x.dueAt ?? 0).getTime() - new Date(y.dueAt ?? 0).getTime() || x.id.localeCompare(y.id))[0];
    also.set(keep.id, [...new Set(group.filter((a) => a.id !== keep.id).map((a) => a.classId))]);
    for (const a of group) if (a.id !== keep.id) { drop.add(a.id); alias.set(a.id, keep.id); }
  }
  return { items: items.filter((a) => !drop.has(a.id)), also, alias };
}

/**
 * Staff views: attempts a multi-class student made on the same assessment in
 * another of their classes, keyed `${assignmentId}|${studentId}` for the
 * assignments given. Only students currently in both classes. Empty when the
 * switch is off.
 */
export async function sharedAttempts<T extends { assignmentId?: string; studentId: string }>(
  assignments: AssignmentLike[],
  select: string,
  extra: Record<string, unknown> = {},
): Promise<Map<string, T[]>> {
  const out = new Map<string, T[]>();
  if (!multiClassOn() || !assignments.length) return out;
  const schools = [...new Set(assignments.map((a) => a.institutionId).filter(Boolean))] as string[];
  const siblings = await Assignment.find({
    assessmentId: { $in: [...new Set(assignments.map((a) => a.assessmentId))] },
    id: { $nin: assignments.map((a) => a.id) },
    state: { $in: ['published', 'closed'] },
    // Never across schools.
    ...(schools.length ? { institutionId: { $in: schools } } : {}),
  })
    .select('id assessmentId classId institutionId')
    .lean();
  if (!siblings.length) return out;
  const attempts = (await AssessmentAttempt.find({ assignmentId: { $in: siblings.map((s) => s.id) }, ...extra })
    .select(`${select} assignmentId studentId`)
    .lean()) as unknown as T[];
  if (!attempts.length) return out;
  const students = await Student.find({ id: { $in: [...new Set(attempts.map((t) => t.studentId))] } }).select('id institutionId').lean();
  const multi = await multiClassStudentIds(students as Who[]);
  const sib = new Map(siblings.map((s) => [s.id, s]));
  const classes = new Map((await CourseInstance.find({ id: { $in: [...new Set(siblings.map((s) => s.classId))] } }).select('id batchId institutionId').lean()).map((c) => [c.id, c]));
  const rosters = new Map<string, Set<string>>();
  const roster = async (classId: string) => {
    if (!rosters.has(classId)) {
      const c = classes.get(classId);
      rosters.set(classId, new Set(c?.institutionId ? await studentIdsInClass({ id: c.id, batchId: c.batchId, institutionId: c.institutionId }) : []));
    }
    return rosters.get(classId)!;
  };
  for (const t of attempts) {
    if (!multi.has(t.studentId)) continue;
    const s = sib.get(t.assignmentId!)!;
    if (!(await roster(s.classId)).has(t.studentId)) continue;
    for (const a of assignments) {
      if (a.assessmentId !== s.assessmentId || a.classId === s.classId || (a.institutionId && s.institutionId && a.institutionId !== s.institutionId)) continue;
      const key = `${a.id}|${t.studentId}`;
      out.set(key, [...(out.get(key) ?? []), t]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Q3 / Q9: label activity by the class it happened in.

export type ClassLabel = { id: string; name: string };

/** The student's classes (multi-class students only; null otherwise). */
export async function classesForLabels(student: Who): Promise<{ id: string; courseId: string; name: string; batchId?: string; curriculumId?: string }[] | null> {
  if (!(await isMultiClassStudent(student))) return null;
  const instances = await getEnrolledInstances(student.id);
  if (instances.length < 2) return null;
  return instances.map((c) => ({ id: c.id, courseId: c.courseId, name: c.courseName, batchId: c.batchId, curriculumId: c.curriculumId }));
}

/** The class a session's course belongs to (sessions store the course id; a class id is accepted too). */
export function classOfCourse(classes: { id: string; courseId: string; name: string }[], courseId?: string | null): ClassLabel | null {
  if (!courseId) return null;
  const c = classes.find((x) => x.id === courseId) ?? classes.find((x) => x.courseId === courseId);
  return c ? { id: c.id, name: c.name } : null;
}

/** The class of each attempt: its assignment's class, else a class of the assessment's group (same curriculum first). */
export async function classOfAttempts(
  classes: { id: string; courseId: string; name: string; batchId?: string; curriculumId?: string }[],
  attempts: { id: string; assignmentId?: string | null; assessmentId?: string }[],
): Promise<Map<string, ClassLabel | null>> {
  const assignmentIds = [...new Set(attempts.map((t) => t.assignmentId).filter(Boolean))] as string[];
  const assessmentIds = [...new Set(attempts.filter((t) => !t.assignmentId && t.assessmentId).map((t) => t.assessmentId!))];
  const [assignments, assessments] = await Promise.all([
    assignmentIds.length ? Assignment.find({ id: { $in: assignmentIds } }).select('id classId').lean() : [],
    assessmentIds.length ? Assessment.find({ id: { $in: assessmentIds } }).select('id batchId curriculumId').lean() : [],
  ]);
  const asg = new Map(assignments.map((a) => [a.id, a.classId]));
  const asm = new Map(assessments.map((a) => [a.id, a]));
  const label = (c?: { id: string; name: string }) => (c ? { id: c.id, name: c.name } : null);
  const out = new Map<string, ClassLabel | null>();
  for (const t of attempts) {
    if (t.assignmentId) {
      out.set(t.id, label(classes.find((c) => c.id === asg.get(t.assignmentId!))));
      continue;
    }
    const a = t.assessmentId ? asm.get(t.assessmentId) : undefined;
    const inGroup = a?.batchId ? classes.filter((c) => c.batchId === a.batchId) : [];
    out.set(t.id, label(inGroup.find((c) => a?.curriculumId && c.curriculumId === a.curriculumId) ?? inGroup[0]));
  }
  return out;
}

export const NO_CLASS = 'No class';

/**
 * Q9: AI credits of multi-class students by class over a period, from each
 * use's session (its course). Uses without a known class go to "No class".
 */
export async function creditsByClass(students: Who[], since: Date): Promise<Map<string, { classId: string | null; className: string; credits: number; events: number }[]>> {
  const out = new Map<string, { classId: string | null; className: string; credits: number; events: number }[]>();
  const multi = await multiClassStudentIds(students);
  if (!multi.size) return out;
  const events = await UsageEvent.find({ studentId: { $in: [...multi] }, status: 'settled', timestamp: { $gte: since } }).select('studentId sessionId creditsUsed').lean();
  const sessionIds = [...new Set(events.map((e) => e.sessionId).filter(Boolean))] as string[];
  const [tutor, avatar] = sessionIds.length
    ? await Promise.all([
        TutorSession.find({ id: { $in: sessionIds } }).select('id courseId').lean(),
        AvatarSession.find({ id: { $in: sessionIds } }).select('id courseId').lean(),
      ])
    : [[], []];
  const courseOfSession = new Map<string, string | undefined>([...tutor, ...avatar].map((s) => [s.id, s.courseId]));
  for (const id of multi) {
    const classes = (await getEnrolledInstances(id)).map((c) => ({ id: c.id, courseId: c.courseId, name: c.courseName }));
    const rows = new Map<string, { classId: string | null; className: string; credits: number; events: number }>();
    for (const c of classes) rows.set(c.id, { classId: c.id, className: c.name, credits: 0, events: 0 });
    const noClass = { classId: null, className: NO_CLASS, credits: 0, events: 0 };
    for (const e of events.filter((x) => x.studentId === id)) {
      // A session id names a tutor or avatar session; a few uses store the course id directly.
      const course = e.sessionId ? (courseOfSession.has(e.sessionId) ? courseOfSession.get(e.sessionId) : e.sessionId) : undefined;
      const c = classOfCourse(classes, course);
      const row = c ? rows.get(c.id)! : noClass;
      row.credits += e.creditsUsed ?? 0;
      row.events += 1;
    }
    out.set(id, [...rows.values(), noClass]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Undo (PLAN §4 step 6): with ENROLLMENT_MULTI_CLASS turned off, existing second
// memberships go inactive. Extra = an active group row that is not the
// student's Student.batchId, or an active 'manual' class row the class's own
// list does not hold. Rows are kept (history); counts only.

export async function endExtraMemberships(opts: { institutionId?: string; apply: boolean; by?: string }): Promise<{ apply: boolean; groups: number; classes: number; students: number; ended: number }> {
  const scope = opts.institutionId ? { institutionId: opts.institutionId } : {};
  const rows = await ClassEnrollment.find({ ...scope, status: 'active' }).select('id studentId scope targetId source').lean();
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const main = new Map((await Student.find({ id: { $in: studentIds } }).select('id batchId').lean()).map((s) => [s.id, s.batchId]));
  const classIds = [...new Set(rows.filter((r) => r.scope === 'class').map((r) => r.targetId))];
  const lists = new Map((await CourseInstance.find({ id: { $in: classIds } }).select('id studentIds').lean()).map((c) => [c.id, new Set(c.studentIds ?? [])]));
  const extra = rows.filter((r) =>
    r.scope === 'group' ? main.get(r.studentId) !== r.targetId : r.source === 'manual' && !lists.get(r.targetId)?.has(r.studentId),
  );
  let ended = 0;
  if (opts.apply && extra.length) {
    const res = await ClassEnrollment.updateMany(
      { id: { $in: extra.map((r) => r.id) }, status: 'active' },
      { $set: { status: 'inactive', endedAt: new Date(), ...(opts.by ? { endedBy: opts.by } : {}) } },
    );
    ended = res.modifiedCount;
  }
  return {
    apply: opts.apply,
    groups: extra.filter((r) => r.scope === 'group').length,
    classes: extra.filter((r) => r.scope === 'class').length,
    students: new Set(extra.map((r) => r.studentId)).size,
    ended,
  };
}
