import type { Model } from 'mongoose';
import { Invitation, PasswordReset } from '../models/AccountToken';
import { AiCall } from '../models/AiCall';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment } from '../models/Assignment';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { AvatarSession } from '../models/AvatarSession';
import { Batch } from '../models/Batch';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { DiagnosticSession } from '../models/DiagnosticSession';
import { GradingProposal } from '../models/GradingProposal';
import { LearnerLanguageProfile } from '../models/LearnerLanguageProfile';
import { LearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningIntervention } from '../models/LearningIntervention';
import { LessonProgress } from '../models/LessonProgress';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { BudgetReservation } from '../models/OrgBudget';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { ParentUsageEvent } from '../models/ParentUsage';
import { ParentEmailSend } from '../models/ParentEmailSend';
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { HybridAnchorSet, HybridShadowResult } from '../models/HybridShadowResult';
import { ReminderLog } from '../models/ReminderLog';
import { ReviewItem } from '../models/ReviewItem';
import { SafetyAlert } from '../models/SafetyAlert';
import { SignInEvent } from '../models/SignInEvent';
import { Student } from '../models/Student';
import { StudentClassChoice } from '../models/StudentClassChoice';
import { StudentCredit } from '../models/StudentCredit';
import { StudentMisconception } from '../models/StudentMisconception';
import { MasteryHistory, StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { StudyPlan } from '../models/StudyPlan';
import { TeachingEpisode } from '../models/TeachingEpisode';
import { TimeToUnderstand } from '../models/TimeToUnderstand';
import { StudentTutorChoice, TutorFace } from '../models/TutorFace';
import { TutorMessage } from '../models/TutorMessage';
import { TutorSession } from '../models/TutorSession';
import { UsageEvent } from '../models/UsageEvent';
import { UsageLedger } from '../models/UsageLedger';
import { User } from '../models/User';
import { GoogleConnection, LmsEnrollment, LmsGradeSyncJob, LmsUser } from '../integrations/lms/models';
import { SuppressionKeyError, suppressIdentities } from '../integrations/lms/core/suppression';
import { AppError } from '../middleware/errorHandler';
import { logger, serializeError } from '../utils/logging';
import { anonymiseGradeLedger } from './gradeLedger';
import { anonymiseAttempt, anonymiseProposal, keepsFinalResult, newAnonymousAttemptId, newAnonymousProposalId, newAnonymousStudentId } from './anonymisedResults';
import { type Actor, studentUserFilter } from './archive';
import { groupsOfStudent, refreshGroupCounts } from './groupCounts';
import { recordAudit } from './auditTrail';
import { endParentLinksForStudent } from '../parents/linkLifecycle';
import { deleteUpload } from './uploadStorage';

// Multi-class step 6, decision C: "Delete permanently" (data-deletion requests,
// Egypt PDPL). Removes the student from every reference and deletes their
// personal records. Billing/usage rows are kept but anonymised (no student or
// user ID), so school totals stay right. The audit trail keeps the fact of the
// deletion (IDs and counts only). Full list: docs/multi-class/ARCHIVE_NOTES.md.
//
// Owner's PDPL decisions (2026-11-17):
// P1  final scores and structured results are kept, anonymised: a random
//     anonymous student ID (never derived from the student ID, never returned
//     or logged), new attempt and proposal IDs, and every free-text field gone
//     (services/anonymisedResults.ts). Everything else the student wrote,
//     transcripts and tutor conversations are deleted.
// P2  safety alerts about the student are kept (subjectDeleted), visible to
//     school and ENARA admins only, purged after SAFETY_ALERT_RETENTION_DAYS.
// P3/P4 usage ledger and audit events keep bare IDs (append-only).

// Collections whose rows are the student's personal records, keyed by studentId.
const DELETE_BY_STUDENT_ID: [string, Model<any>][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  ['class_enrollments', ClassEnrollment],
  ['parent_learner_links', ParentLearnerLink],
  ['parent_link_codes', ParentLinkCode],
  ['parent_usage_events', ParentUsageEvent],
  ['parent_email_sends', ParentEmailSend],
  ['assessments_for_this_student_only', Assessment],
  ['attendance_records', AttendanceRecord],
  ['diagnostic_sessions', DiagnosticSession],
  ['learner_language_profiles', LearnerLanguageProfile],
  ['learning_events', LearningEvent],
  ['learning_evidence', LearningEvidence],
  ['learning_interventions', LearningIntervention],
  ['lesson_progress', LessonProgress],
  ['objective_retention_states', ObjectiveRetentionState],
  ['pedagogical_decisions', PedagogicalDecision],
  ['review_items', ReviewItem],
  ['student_credits', StudentCredit],
  ['student_misconceptions', StudentMisconception],
  ['student_objective_mastery', StudentObjectiveMastery],
  ['mastery_history', MasteryHistory],
  ['study_plans', StudyPlan],
  ['teaching_episodes', TeachingEpisode],
  ['time_to_understand', TimeToUnderstand],
  ['tutor_faces', TutorFace],
  ['student_tutor_choices', StudentTutorChoice],
  ['student_class_choices', StudentClassChoice],
  ['tutor_messages', TutorMessage],
  ['tutor_sessions', TutorSession],
  ['avatar_sessions', AvatarSession],
];

export const CONFIRM_PREFIX = 'DELETE ';
export const confirmationFor = (studentId: string) => `${CONFIRM_PREFIX}${studentId}`;

type StudentDoc = {
  id: string;
  email?: string;
  institutionId?: string;
  batchId?: string;
  archivedAt?: Date | null;
  photoKey?: string;
  pendingPhotoKey?: string;
};

export interface ErasureResult {
  studentId: string;
  removed: Record<string, number>;
  anonymised: Record<string, number>;
  /** Kept unchanged on purpose (append-only ledgers). */
  kept: Record<string, number>;
  /** Storage deletion is best effort: failed keys are listed so they can be retried. */
  files: { deleted: number; failed: number; failedKeys: string[] };
}

/**
 * P1: the student's final results are kept under one random anonymous ID with
 * new attempt/proposal IDs (so no other record, such as a usage-ledger row
 * naming the old attempt ID, links back to the person); free text is gone.
 * Attempts without a final score, and attempts on assessments made for this
 * student only (a group of one), are deleted with their proposals.
 */
async function anonymiseResults(sid: string, removed: Record<string, number>, anonymised: Record<string, number>, personalAssignments: Set<string> = new Set()) {
  const personal = new Set((await Assessment.find({ studentId: sid }).select('id').lean()).map((a) => a.id));
  const attempts = (await AssessmentAttempt.collection.find({ studentId: sid }).toArray()) as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const allIds = attempts.map((t) => String(t.id));
  const keep = attempts.filter((t) => keepsFinalResult(t) && !personal.has(String(t.assessmentId)) && !(t.assignmentId && personalAssignments.has(String(t.assignmentId))));
  const newAttemptId = new Map(keep.map((t) => [String(t.id), newAnonymousAttemptId()]));
  const anonymousId = keep.length ? newAnonymousStudentId() : '';

  const proposals = allIds.length ? ((await GradingProposal.collection.find({ attemptId: { $in: allIds } }).toArray()) as unknown as Record<string, any>[]) : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const keptProposals = proposals.filter((p) => newAttemptId.has(String(p.attemptId)));
  const newProposalId = new Map(keptProposals.map((p) => [String(p.id), newAnonymousProposalId()]));
  for (const p of keptProposals) {
    await GradingProposal.collection.replaceOne({ _id: p._id }, anonymiseProposal(p, newProposalId.get(String(p.id))!, newAttemptId.get(String(p.attemptId))!));
  }
  for (const t of keep) {
    await AssessmentAttempt.collection.replaceOne({ _id: t._id }, anonymiseAttempt(t, anonymousId, newAttemptId.get(String(t.id))!, newProposalId));
  }
  anonymised.assessment_attempts = keep.length;
  anonymised.grading_proposals = keptProposals.length;
  // Grade ledger and LMS sync log (P1): kept results' entries move to the same
  // anonymous ID and new attempt IDs, without free text; the rest are deleted.
  // Counted only when there are any (the answer is unchanged otherwise).
  const ledger = await anonymiseGradeLedger(sid, allIds, newAttemptId, anonymousId);
  Object.assign(anonymised, ledger.anonymised);
  Object.assign(removed, ledger.removed);
  // What is left under the old IDs is deleted.
  removed.grading_proposals = allIds.length ? (await GradingProposal.deleteMany({ attemptId: { $in: allIds } })).deletedCount : 0;
  removed.assessment_attempts = (await AssessmentAttempt.deleteMany({ studentId: sid })).deletedCount;
  // Experimental shadow-grading output (answer hashes, scores) and anchor sets that used these answers.
  removed.hybrid_shadow_results = allIds.length ? (await HybridShadowResult.deleteMany({ attemptId: { $in: allIds } })).deletedCount : 0;
  removed.hybrid_anchor_sets = allIds.length ? (await HybridAnchorSet.deleteMany({ 'anchors.attemptId': { $in: allIds } })).deletedCount : 0;
}

const escapeRegex = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * PDPL suppression list (LMS Priority 0): every LMS identity (platform + LMS
 * user id) linked to the student's accounts goes on lms_suppressed_identities
 * (a keyed hash, no name, email or raw id) BEFORE anything is removed, so a
 * roster sync or a launch never re-creates the person. If the list cannot be
 * written (LMS_KEK not set), the deletion stops here with nothing deleted.
 */
async function suppressLmsIdentities(userIds: string[], actor: Actor, student?: { id: string; institutionId?: string }): Promise<number> {
  if (!userIds.length) return 0;
  const lmsUsers = await LmsUser.find({ enaraUserId: { $in: userIds } }).select('institutionId platformId externalUserId').lean();
  try {
    return (await suppressIdentities(lmsUsers.map((u) => ({ institutionId: u.institutionId, platformId: u.platformId, externalUserId: u.externalUserId })), actor?.id)).length;
  } catch (error) {
    if (error instanceof SuppressionKeyError) {
      // Owner decision (P0 follow-up 1): the deletion stops, but a PDPL request
      // can't wait, so ENARA ops are alerted at once (critical alert + audit,
      // IDs only) and the admin is told the request is recorded. Runbook:
      // docs/lms/OPS_RUNBOOK.md, "Permanent deletion stopped: LMS_KEK missing".
      const { recordAlert, recordAudit } = await import('./auditTrail');
      await recordAlert('pdpl_erasure_blocked_lms_kek', 'critical', { scope: 'student_erasure', studentId: student?.id, lmsIdentities: lmsUsers.length }, student?.institutionId);
      await recordAudit('student_erasure_blocked', actor, { institutionId: student?.institutionId, type: 'student', id: student?.id }, { reason: 'lms_kek_missing', lmsIdentities: lmsUsers.length });
      throw new AppError(
        'This student could not be permanently deleted yet: ENARA must first record that they are never re-created from your LMS, and that safeguard is unavailable right now. Nothing was deleted. Your request is recorded and ENARA operations have been alerted to complete it urgently. Reference: LMS_SUPPRESSION_UNAVAILABLE.',
        503,
        'LMS_SUPPRESSION_UNAVAILABLE',
      );
    }
    throw error;
  }
}

export async function permanentlyDeleteStudent(s: StudentDoc, actor: Actor): Promise<ErasureResult> {
  const removed: Record<string, number> = {};
  const anonymised: Record<string, number> = {};
  const sid = s.id;
  // Login accounts (read first: the LMS suppression list is written before anything is removed).
  const users = await User.find(await studentUserFilter(s)).select('_id email role').lean();
  const studentUsers = users.filter((u) => u.role === 'student');
  const userIds = studentUsers.map((u) => String(u._id));
  const lmsSuppressed = await suppressLmsIdentities(userIds, actor, { id: sid, institutionId: (s as { institutionId?: string }).institutionId });
  if (lmsSuppressed) anonymised.lms_identities_suppressed = lmsSuppressed;
  // Multi-class S4: the groups whose live count must drop ([] while off; read before the rows go).
  const groupsToRecount = await groupsOfStudent(sid);

  // Group count: only an active (not archived) student still counts in it.
  if (s.batchId && !s.archivedAt) {
    const r = await Batch.updateOne({ id: s.batchId, ...(s.institutionId ? { institutionId: s.institutionId } : {}) }, [
      { $set: { studentCount: { $max: [0, { $subtract: [{ $ifNull: ['$studentCount', 0] }, 1] }] } } },
    ]);
    removed.group_count = r.modifiedCount;
  }
  // Every list that names the student (IDs are unique across schools, so
  // these are pulled everywhere: no list keeps a ghost).
  removed.class_lists = (await CourseInstance.updateMany({ studentIds: sid }, { $pull: { studentIds: sid } })).modifiedCount;
  removed.class_archive_records = (await CourseInstance.updateMany({ 'archive.memberIds': sid }, { $pull: { 'archive.memberIds': sid } })).modifiedCount;
  removed.group_archive_records = (await Batch.updateMany({ $or: [{ 'archive.memberIds': sid }, { 'archive.fieldMemberIds': sid }] }, { $pull: { 'archive.memberIds': sid, 'archive.fieldMemberIds': sid } })).modifiedCount;
  // Assignments meant for this student ONLY (studentIds is exactly [sid]) are a
  // group of one: deleted, with their attempts (not kept, see anonymiseResults).
  // Pulling the ID would leave studentIds empty, which the app reads as "the
  // whole class" and would hand the work to everyone (found in review).
  const personalAssignments = (await Assignment.find({ studentIds: { $size: 1, $all: [sid] } }).select('id').lean()).map((a) => String(a.id));
  removed.assignments_for_student_only = personalAssignments.length ? (await Assignment.deleteMany({ id: { $in: personalAssignments } })).deletedCount : 0;
  removed.assignment_lists = (await Assignment.updateMany({ $or: [{ studentIds: sid }, { 'extensions.studentId': sid }] }, { $pull: { studentIds: sid, extensions: { studentId: sid } } })).modifiedCount;

  // P1: final results kept anonymised, everything else about the attempts deleted
  // (before the per-student assessments go, which decide what is kept).
  await anonymiseResults(sid, removed, anonymised, new Set(personalAssignments));
  // P0 item 2: parent links end first ('deleted'; audited with IDs only), so
  // the audit trail keeps the fact; then, as before (PDPL), the link and code
  // rows are deleted with the student's other records below.
  await endParentLinksForStudent(sid, 'deleted', actor);
  for (const [name, model] of DELETE_BY_STUDENT_ID) removed[name] = (await model.deleteMany({ studentId: sid })).deletedCount;
  // P2: safety alerts are kept for safeguarding (admins only, retention purge).
  const keptAlerts = (await SafetyAlert.updateMany({ studentId: sid }, { $set: { subjectDeleted: true }, $unset: { sessionId: 1 } })).matchedCount;

  // Login accounts (read above) and what hangs off them.
  if (userIds.length) {
    removed.avatar_sessions = (removed.avatar_sessions ?? 0) + (await AvatarSession.deleteMany({ userId: { $in: userIds } })).deletedCount;
    removed.password_resets = (await PasswordReset.deleteMany({ userId: { $in: userIds } })).deletedCount;
    removed.sign_in_events = (await SignInEvent.deleteMany({ userId: { $in: userIds } })).deletedCount;
  }
  const emails = [...new Set([s.email, ...studentUsers.map((u) => u.email)].filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (emails.length) {
    removed.sign_in_events = (removed.sign_in_events ?? 0) + (await SignInEvent.deleteMany({ email: { $in: emails } })).deletedCount;
    removed.invitations = (await Invitation.deleteMany({ email: { $in: emails }, role: 'student', ...(s.institutionId ? { institutionId: s.institutionId } : {}) })).deletedCount;
  }
  // Sent-email log (addresses and subjects), keyed by address, student or account.
  removed.reminder_logs = (await ReminderLog.deleteMany({ $or: [
    ...(emails.length ? [{ to: { $in: emails } }] : []),
    { recipientKey: { $regex: `^(.*:)?${escapeRegex(sid)}$` } }, // "<studentId>" or "<assignmentId>:<studentId>"
    ...(userIds.length ? [{ recipientKey: { $in: userIds } }] : []),
  ] })).deletedCount;
  // LMS identities of the student's accounts (names and email from the LMS),
  // their LMS memberships and unsent grade copies. The LMS audit log is not
  // touched. Each identity is already on the suppression list (above).
  if (userIds.length) {
    const lmsUserIds = (await LmsUser.find({ enaraUserId: { $in: userIds } }).select('id').lean()).map((u) => u.id);
    if (lmsUserIds.length) {
      removed.lms_enrollments = (await LmsEnrollment.deleteMany({ lmsUserId: { $in: lmsUserIds } })).deletedCount;
      removed.lms_grade_sync_jobs = (await LmsGradeSyncJob.deleteMany({ lmsUserId: { $in: lmsUserIds } })).deletedCount;
      removed.lms_users = (await LmsUser.deleteMany({ id: { $in: lmsUserIds } })).deletedCount;
    }
    removed.google_connections = (await GoogleConnection.deleteMany({ enaraUserId: { $in: userIds } })).deletedCount;
  }

  // Billing and usage: kept for the school's totals, with no link to the person.
  // usage_ledger is append-only by design (models/UsageLedger.ts) and is NOT
  // rewritten here: its rows keep the (now unresolvable) student and user IDs.
  // Counted so the owner sees it; see ARCHIVE_NOTES.md (decision needed).
  const who = { $or: [{ studentId: sid }, ...(userIds.length ? [{ userId: { $in: userIds } }] : [])] };
  const keptUsageLedgerRows = await UsageLedger.countDocuments(who);
  anonymised.ai_calls = (await AiCall.updateMany(who, { $unset: { studentId: 1, userId: 1 } })).modifiedCount;
  anonymised.usage_events = (await UsageEvent.updateMany(who, { $set: { userId: 'erased' }, $unset: { studentId: 1 } })).modifiedCount;
  anonymised.budget_reservations = userIds.length ? (await BudgetReservation.updateMany({ userId: { $in: userIds } }, { $unset: { userId: 1 } })).modifiedCount : 0;

  // Stored files (best effort; a storage failure is reported with its key, not
  // hidden). The student's photos are the only stored files linked to a
  // student: speaking-exam and pronunciation audio is transcribed in memory and
  // never stored, and tutor voice is streamed (ARCHIVE_NOTES.md, PDPL P1).
  const files = { deleted: 0, failed: 0, failedKeys: [] as string[] };
  for (const key of [s.photoKey, s.pendingPhotoKey].filter((k): k is string => !!k)) {
    try {
      await deleteUpload(key);
      files.deleted++;
    } catch (error) {
      files.failed++;
      files.failedKeys.push(key);
      logger.warn('student_erasure_file_failed', { studentId: sid, key, error: serializeError(error) });
    }
  }

  removed.user_accounts = userIds.length ? (await User.deleteMany({ _id: { $in: userIds } })).deletedCount : 0;
  removed.student = (await Student.deleteOne({ id: sid })).deletedCount;
  await refreshGroupCounts([s.batchId, ...groupsToRecount]);

  const kept = { usage_ledger_rows_with_ids: keptUsageLedgerRows, safety_alerts: keptAlerts };
  await recordAudit('student.deleted_permanently', actor, { institutionId: s.institutionId, type: 'student', id: sid }, { removed, anonymised, kept, files });
  return { studentId: sid, removed, anonymised, kept, files };
}
