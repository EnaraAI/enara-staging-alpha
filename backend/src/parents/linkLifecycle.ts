import { ClassEnrollment } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { ParentLearnerLink, type ParentLinkEndReason, type ParentLinkStatus } from '../models/ParentLearnerLink';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { Student } from '../models/Student';
import { LmsEnrollment, LmsUser } from '../integrations/lms/models';
import { recordAudit } from '../services/auditTrail';

// P0 item 2 (owner decisions D8, D9, 18 Nov 2026): parent access ends when the
// student is archived, deleted or leaves. Two layers:
//   1. A check on every read (parents/service.ts requireLearner/listLearners):
//      the student must exist, not be archived, and still be in the school the
//      link was made for. If not, the parent gets nothing, and the link is
//      ended there and then (so a missed hook still ends it).
//   2. Hooks that end the links when it happens:
//        archived              services/archive.ts archiveStudent
//        deleted               controllers/student.controller.ts deleteStudent,
//                              services/studentErasure.ts (PDPL, see below)
//        left_school           the read check (no "move school" action exists)
//        lms_left_all_classes  integrations/lms/core/roster.ts, when a roster
//                              sync leaves the student in no class at all
//        unlinked_by_school    codes.ts unlink (school admin)
//        unlinked_by_parent    codes.ts unlink (the parent)
// Ending never deletes the row: status 'ended' + endedAt/endReason/endedBy (D8).
// Restoring an archived student does NOT bring links back (D9): the school
// issues a new code, and redeeming it reactivates the same row.
// PDPL permanent deletion still deletes the rows (existing erasure rule); the
// links are ended (and audited) first, so the audit trail keeps the fact.
// Every end is audited 'parent_link_ended' with IDs only.

type Actor = { id?: string; role?: string } | undefined;

/** Actor for ends found by the read-time check. */
export const READ_CHECK_ACTOR = { id: 'system:parents_read_check', role: 'system' } as const;

const LIVE: ParentLinkStatus[] = ['active', 'pending'];

type LinkRow = { _id?: unknown; id: string; parentUserId: string; studentId: string; institutionId?: string; status: ParentLinkStatus };
type StudentRow = { id: string; institutionId?: string; archivedAt?: Date | null } | null | undefined;

/**
 * Read-time check. Null when the link may still grant access; otherwise why it
 * may not. A link without a school (none are made that way) fails the check.
 */
export function endReasonFor(link: Pick<LinkRow, 'institutionId'>, student: StudentRow): ParentLinkEndReason | null {
  if (!student) return 'deleted';
  if (student.archivedAt) return 'archived';
  if (!link.institutionId || !student.institutionId || student.institutionId !== link.institutionId) return 'left_school';
  return null;
}

/** End one link (active or pending). Idempotent: an ended link is left as it is. True when this call ended it. */
export async function endParentLink(link: LinkRow, reason: ParentLinkEndReason, actor: Actor, now = new Date()): Promise<boolean> {
  const r = await ParentLearnerLink.updateOne(
    { id: link.id, status: { $in: LIVE } },
    { $set: { status: 'ended', endedAt: now, endReason: reason, ...(actor?.id ? { endedBy: actor.id } : {}) } },
  );
  if (!r.modifiedCount) return false;
  await recordAudit('parent_link_ended', actor, { institutionId: link.institutionId, type: 'student', id: link.studentId }, { linkId: link.id, parentUserId: link.parentUserId, reason, previousStatus: link.status });
  // Parents P4: parent-link-ended for a school unlink, archive or leaving only (owner
  // decision 2); never for the parent's own unlink or a PDPL deletion. Never fails the end.
  if (link.status === 'active') await (await import('./parentEmails')).notifyLinkEnded(link, reason, now);
  return true;
}

/**
 * End every live link of a student (archive, delete, left, LMS). With
 * revokeCodes, the student's unused link codes are revoked too, so a code
 * issued before the event cannot make a new link afterwards.
 */
export async function endParentLinksForStudent(studentId: string, reason: ParentLinkEndReason, actor: Actor, opts: { revokeCodes?: boolean } = {}): Promise<{ linksEnded: number; codesRevoked: number }> {
  const now = new Date();
  const links = await ParentLearnerLink.find({ studentId, status: { $in: LIVE } }).select('id parentUserId studentId institutionId status').lean<LinkRow[]>();
  let linksEnded = 0;
  for (const link of links) if (await endParentLink(link, reason, actor, now)) linksEnded++;

  let codesRevoked = 0;
  if (opts.revokeCodes) {
    const codes = await ParentLinkCode.find({ studentId, status: 'active' }).select('id institutionId').lean();
    for (const c of codes) {
      const r = await ParentLinkCode.updateOne({ id: c.id, status: 'active' }, { $set: { status: 'revoked', revokedAt: now, ...(actor?.id ? { revokedBy: actor.id } : {}) } });
      if (!r.modifiedCount) continue;
      codesRevoked++;
      await recordAudit('parent_code_revoked', actor, { institutionId: c.institutionId, type: 'student', id: studentId }, { codeId: c.id, reason });
    }
  }
  return { linksEnded, codesRevoked };
}

/**
 * True when the student is still in any class at all: an active class
 * enrollment (any scope, any source), a legacy class list, a group, or a live
 * LMS enrollment as a learner. Used by the roster hook: links end only when
 * the student is left with none.
 */
export async function hasAnyActiveEnrollment(studentId: string, enaraUserId?: string): Promise<boolean> {
  if (await ClassEnrollment.exists({ studentId, status: 'active' })) return true;
  if (await CourseInstance.exists({ studentIds: studentId })) return true;
  const s = await Student.findOne({ id: studentId }).select('batchId').lean();
  if (s?.batchId) return true;
  if (enaraUserId) {
    const lmsUserIds = (await LmsUser.find({ enaraUserId }).select('id').lean()).map((u) => u.id);
    if (lmsUserIds.length && (await LmsEnrollment.exists({ lmsUserId: { $in: lmsUserIds }, enaraRole: 'student', status: { $in: ['active', 'invited'] } }))) return true;
  }
  return false;
}
