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
import { PedagogicalDecision } from '../models/PedagogicalDecision';
import { ReviewItem } from '../models/ReviewItem';
import { SafetyAlert } from '../models/SafetyAlert';
import { SignInEvent } from '../models/SignInEvent';
import { Student } from '../models/Student';
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
import { logger, serializeError } from '../utils/logging';
import { type Actor, studentUserFilter } from './archive';
import { groupsOfStudent, refreshGroupCounts } from './groupCounts';
import { recordAudit } from './auditTrail';
import { deleteUpload } from './uploadStorage';

// Multi-class step 6, decision C: "Delete permanently" (data-deletion requests,
// Egypt PDPL). Removes the student from every reference and deletes their
// personal records. Billing/usage rows are kept but anonymised (no student or
// user ID), so school totals stay right. The audit trail keeps the fact of the
// deletion (IDs and counts only). Full list: docs/multi-class/ARCHIVE_NOTES.md.

// Collections whose rows are the student's personal records, keyed by studentId.
const DELETE_BY_STUDENT_ID: [string, Model<any>][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  ['class_enrollments', ClassEnrollment],
  ['parent_learner_links', ParentLearnerLink],
  ['parent_link_codes', ParentLinkCode],
  ['assessment_attempts', AssessmentAttempt],
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
  ['safety_alerts', SafetyAlert],
  ['student_credits', StudentCredit],
  ['student_misconceptions', StudentMisconception],
  ['student_objective_mastery', StudentObjectiveMastery],
  ['mastery_history', MasteryHistory],
  ['study_plans', StudyPlan],
  ['teaching_episodes', TeachingEpisode],
  ['time_to_understand', TimeToUnderstand],
  ['tutor_faces', TutorFace],
  ['student_tutor_choices', StudentTutorChoice],
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
  files: { deleted: number; failed: number };
}

export async function permanentlyDeleteStudent(s: StudentDoc, actor: Actor): Promise<ErasureResult> {
  const removed: Record<string, number> = {};
  const anonymised: Record<string, number> = {};
  const sid = s.id;
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
  removed.assignment_lists = (await Assignment.updateMany({ $or: [{ studentIds: sid }, { 'extensions.studentId': sid }] }, { $pull: { studentIds: sid, extensions: { studentId: sid } } })).modifiedCount;

  // Grading proposals hang off the student's attempts.
  const attemptIds = (await AssessmentAttempt.find({ studentId: sid }).select('id').lean()).map((a) => (a as { id: string }).id).filter(Boolean);
  removed.grading_proposals = attemptIds.length ? (await GradingProposal.deleteMany({ attemptId: { $in: attemptIds } })).deletedCount : 0;
  for (const [name, model] of DELETE_BY_STUDENT_ID) removed[name] = (await model.deleteMany({ studentId: sid })).deletedCount;

  // Login accounts and what hangs off them.
  const users = await User.find(await studentUserFilter(s)).select('_id email role').lean();
  const studentUsers = users.filter((u) => u.role === 'student');
  const userIds = studentUsers.map((u) => String(u._id));
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

  // Billing and usage: kept for the school's totals, with no link to the person.
  // usage_ledger is append-only by design (models/UsageLedger.ts) and is NOT
  // rewritten here: its rows keep the (now unresolvable) student and user IDs.
  // Counted so the owner sees it; see ARCHIVE_NOTES.md (decision needed).
  const who = { $or: [{ studentId: sid }, ...(userIds.length ? [{ userId: { $in: userIds } }] : [])] };
  const keptUsageLedgerRows = await UsageLedger.countDocuments(who);
  anonymised.ai_calls = (await AiCall.updateMany(who, { $unset: { studentId: 1, userId: 1 } })).modifiedCount;
  anonymised.usage_events = (await UsageEvent.updateMany(who, { $set: { userId: 'erased' }, $unset: { studentId: 1 } })).modifiedCount;
  anonymised.budget_reservations = userIds.length ? (await BudgetReservation.updateMany({ userId: { $in: userIds } }, { $unset: { userId: 1 } })).modifiedCount : 0;

  // Uploaded photos (best effort; a storage failure is reported, not hidden).
  const files = { deleted: 0, failed: 0 };
  for (const key of [s.photoKey, s.pendingPhotoKey].filter((k): k is string => !!k)) {
    try {
      await deleteUpload(key);
      files.deleted++;
    } catch (error) {
      files.failed++;
      logger.warn('student_erasure_file_failed', { studentId: sid, error: serializeError(error) });
    }
  }

  removed.user_accounts = userIds.length ? (await User.deleteMany({ _id: { $in: userIds } })).deletedCount : 0;
  removed.student = (await Student.deleteOne({ id: sid })).deletedCount;
  await refreshGroupCounts([s.batchId, ...groupsToRecount]);

  const kept = { usage_ledger_rows_with_ids: keptUsageLedgerRows };
  await recordAudit('student.deleted_permanently', actor, { institutionId: s.institutionId, type: 'student', id: sid }, { removed, anonymised, kept, files });
  return { studentId: sid, removed, anonymised, kept, files };
}
