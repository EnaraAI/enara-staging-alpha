import { getConfig } from '../config/env';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { logger, serializeError } from '../utils/logging';
import { endEnrollment, enroll } from './enrollment';

// Multi-class step 2: "write both". Every place that changes Student.batchId
// or CourseInstance.studentIds also calls one of these, AFTER the old write
// has succeeded. Old fields stay the source of truth; these calls:
//   - do nothing unless ENROLLMENT_DUAL_WRITE is on;
//   - never throw: a failure is logged (IDs and a code only) and the request
//     carries on exactly as before.

type Op = 'student_group' | 'class_member_add' | 'class_member_remove' | 'student_deleted' | 'class_deleted';

function on(): boolean {
  return getConfig().enrollment.dualWrite;
}

async function safely(op: Op, ids: Record<string, string | undefined>, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const e = serializeError(error) as { code?: string; message?: string };
    logger.warn('enrollment_dual_write_failed', { op, ...ids, code: e.code ?? 'error', message: e.message });
  }
}

/** A student's group changed (create, update or set by a template). */
export async function syncStudentGroup(p: { institutionId?: string; studentId: string; fromGroupId?: string; toGroupId?: string; by?: string }): Promise<void> {
  if (!on() || p.fromGroupId === p.toGroupId) return;
  if (!p.institutionId) {
    logger.warn('enrollment_dual_write_skipped', { op: 'student_group', studentId: p.studentId, code: 'no_school' });
    return;
  }
  await safely('student_group', { studentId: p.studentId, fromGroupId: p.fromGroupId, toGroupId: p.toGroupId }, async () => {
    if (p.fromGroupId) await endEnrollment({ studentId: p.studentId, scope: 'group', targetId: p.fromGroupId, status: 'removed', endedBy: p.by });
    if (p.toGroupId) await enroll({ institutionId: p.institutionId!, studentId: p.studentId, scope: 'group', targetId: p.toGroupId, source: 'manual', createdBy: p.by });
  });
}

/** A student was added to or removed from a class's explicit list. */
export async function syncClassMember(p: { institutionId?: string; studentId: string; classId: string; action: 'add' | 'remove'; by?: string }): Promise<void> {
  if (!on()) return;
  if (p.action === 'add' && !p.institutionId) {
    logger.warn('enrollment_dual_write_skipped', { op: 'class_member_add', studentId: p.studentId, classId: p.classId, code: 'no_school' });
    return;
  }
  await safely(p.action === 'add' ? 'class_member_add' : 'class_member_remove', { studentId: p.studentId, classId: p.classId }, async () => {
    if (p.action === 'add') await enroll({ institutionId: p.institutionId!, studentId: p.studentId, scope: 'class', targetId: p.classId, source: 'manual', createdBy: p.by });
    else await endEnrollment({ studentId: p.studentId, scope: 'class', targetId: p.classId, status: 'removed', endedBy: p.by });
  });
}

/** A student was deleted: every active membership ends (rows kept as history). */
export async function syncStudentDeleted(p: { studentId: string; by?: string }): Promise<void> {
  if (!on()) return;
  await safely('student_deleted', { studentId: p.studentId }, () =>
    ClassEnrollment.updateMany({ studentId: p.studentId, status: 'active' }, { $set: { status: 'removed', endedAt: new Date(), ...(p.by ? { endedBy: p.by } : {}) } }),
  );
}

/** A class was deleted: its explicit memberships end. Group memberships are untouched. */
export async function syncClassDeleted(p: { classId: string; by?: string }): Promise<void> {
  if (!on()) return;
  await safely('class_deleted', { classId: p.classId }, () =>
    ClassEnrollment.updateMany({ scope: 'class', targetId: p.classId, status: 'active' }, { $set: { status: 'removed', endedAt: new Date(), ...(p.by ? { endedBy: p.by } : {}) } }),
  );
}
