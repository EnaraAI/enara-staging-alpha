import { AppError } from '../middleware/errorHandler';
import { Batch } from '../models/Batch';
import {
  ClassEnrollment,
  type EnrollmentExtraVia,
  type EnrollmentMigratedFrom,
  type EnrollmentScope,
  type EnrollmentSource,
  type IClassEnrollment,
} from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';

// The one place that answers "which groups/classes is this student in" and
// "who is in this class" from class_enrollments (docs/multi-class/PLAN.md).
//
// Step 1: nothing in the app calls this yet. Student.batchId and
// CourseInstance.studentIds remain the source of truth until reads are
// switched feature by feature (step 5), each behind its own switch.
//
// Rule (same as today): S is in class C when S has an active 'class'
// enrollment in C, or an active 'group' enrollment in C's group (C.batchId).

export interface EnrollInput {
  institutionId: string;
  studentId: string;
  scope: EnrollmentScope;
  targetId: string;
  source: EnrollmentSource;
  createdBy?: string;
  lmsContextId?: string;
  migratedFrom?: EnrollmentMigratedFrom;
  /** Multi-class step 6: marks an extra membership added by the multi-class service. */
  extraVia?: EnrollmentExtraVia;
  startedAt?: Date;
}

// Tenant guard: the student and the group/class must both exist in the same
// school. An enrollment can never point across schools.
async function assertSameSchool(input: Pick<EnrollInput, 'institutionId' | 'studentId' | 'scope' | 'targetId'>): Promise<void> {
  if (!input.institutionId) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  const student = await Student.exists({ id: input.studentId, institutionId: input.institutionId });
  if (!student) throw new AppError('Student not found in this school', 404, 'STUDENT_NOT_FOUND');
  const target =
    input.scope === 'group'
      ? await Batch.exists({ id: input.targetId, institutionId: input.institutionId })
      : await CourseInstance.exists({ id: input.targetId, institutionId: input.institutionId });
  if (!target) throw new AppError(input.scope === 'group' ? 'Group not found in this school' : 'Class not found in this school', 404, 'ENROLLMENT_TARGET_NOT_FOUND');
}

/**
 * Makes the student an active member of the group or class. Idempotent: an
 * active row is returned unchanged; an inactive or removed row is reactivated
 * (new startedAt, endedAt cleared). source, migratedFrom and createdBy are
 * set only when the row is first created. extraVia follows the writer that
 * (re)activates the row: set by the multi-class service, cleared by any other
 * writer; an already active row is returned unchanged.
 */
export async function enroll(input: EnrollInput): Promise<IClassEnrollment> {
  await assertSameSchool(input);
  const key = { studentId: input.studentId, scope: input.scope, targetId: input.targetId };
  const existing = await ClassEnrollment.findOne(key).lean();
  if (existing) {
    if (existing.institutionId !== input.institutionId) throw new AppError('Enrollment belongs to another school', 409, 'ENROLLMENT_CONFLICT');
    if (existing.status === 'active') return existing;
    const reactivated = await ClassEnrollment.findOneAndUpdate(
      { ...key, status: { $ne: 'active' } },
      {
        $set: { status: 'active', startedAt: input.startedAt ?? new Date(), ...(input.extraVia ? { extraVia: input.extraVia } : {}) },
        $unset: { endedAt: 1, endedBy: 1, ...(input.extraVia ? {} : { extraVia: 1 }) },
      },
      { new: true },
    ).lean();
    return reactivated ?? (await ClassEnrollment.findOne(key).lean())!;
  }
  try {
    const created = await ClassEnrollment.create({
      ...key,
      institutionId: input.institutionId,
      source: input.source,
      createdBy: input.createdBy,
      lmsContextId: input.lmsContextId,
      migratedFrom: input.migratedFrom,
      ...(input.extraVia ? { extraVia: input.extraVia } : {}),
      startedAt: input.startedAt ?? new Date(),
    });
    return created.toObject();
  } catch (error) {
    // Two writers at once: the unique index lets one win; return its row.
    if ((error as { code?: number }).code === 11000) return enroll(input);
    throw error;
  }
}

/** Ends an active membership. Returns false when there was none. */
export async function endEnrollment(input: {
  studentId: string;
  scope: EnrollmentScope;
  targetId: string;
  status: 'inactive' | 'removed';
  endedBy?: string;
}): Promise<boolean> {
  const res = await ClassEnrollment.updateOne(
    { studentId: input.studentId, scope: input.scope, targetId: input.targetId, status: 'active' },
    { $set: { status: input.status, endedAt: new Date(), ...(input.endedBy ? { endedBy: input.endedBy } : {}) } },
  );
  return res.modifiedCount === 1;
}

/** A student's active groups and explicit classes. */
export async function activeTargets(studentId: string, institutionId?: string): Promise<{ groupIds: string[]; classIds: string[] }> {
  const rows = await ClassEnrollment.find({ studentId, status: 'active', ...(institutionId ? { institutionId } : {}) })
    .select('scope targetId')
    .lean();
  return {
    groupIds: rows.filter((r) => r.scope === 'group').map((r) => r.targetId),
    classIds: rows.filter((r) => r.scope === 'class').map((r) => r.targetId),
  };
}

/**
 * CourseInstance filter for "the classes this student is in": explicit
 * classes or any class of their groups. Same shape as the legacy
 * `{ $or: [{ studentIds }, { batchId }] }`. Returns null when they are in none.
 */
export async function enrolledClassFilter(studentId: string, institutionId?: string): Promise<Record<string, unknown> | null> {
  const { groupIds, classIds } = await activeTargets(studentId, institutionId);
  const or: Record<string, unknown>[] = [];
  if (classIds.length) or.push({ id: { $in: classIds } });
  if (groupIds.length) or.push({ batchId: { $in: groupIds } });
  return or.length ? { $or: or } : null;
}

/** Students in a class: explicit class members plus members of its group. */
export async function studentIdsInClass(cls: { id: string; batchId?: string; institutionId?: string }): Promise<string[]> {
  const or: Record<string, unknown>[] = [{ scope: 'class', targetId: cls.id }];
  if (cls.batchId) or.push({ scope: 'group', targetId: cls.batchId });
  const rows = await ClassEnrollment.find({ status: 'active', $or: or, ...(cls.institutionId ? { institutionId: cls.institutionId } : {}) })
    .select('studentId')
    .lean();
  return [...new Set(rows.map((r) => r.studentId))];
}

/** Students in a group. */
export async function studentIdsInGroup(groupId: string, institutionId?: string): Promise<string[]> {
  const rows = await ClassEnrollment.find({ scope: 'group', targetId: groupId, status: 'active', ...(institutionId ? { institutionId } : {}) })
    .select('studentId')
    .lean();
  return rows.map((r) => r.studentId);
}
