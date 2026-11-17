import { dataLogRetentionDays, safetyAlertRetentionDays } from '../config/retention';
import { AiCall } from '../models/AiCall';
import { SafetyAlert } from '../models/SafetyAlert';
import { logger } from '../utils/logging';

// PDPL retention jobs (owner decisions 2026-11-17, docs/multi-class/ARCHIVE_NOTES.md).
// Both are dry runs unless `apply` is true, idempotent, and safe to run on a
// schedule or by hand (src/scripts/pdplRetention.ts).

const DAY_MS = 86_400_000;

/** P2: kept safety alerts of permanently deleted students, for school and ENARA admins. */
export async function listDeletedStudentAlerts(institutionId?: string, now = new Date()) {
  const days = safetyAlertRetentionDays();
  const rows = await SafetyAlert.find({ subjectDeleted: true, ...(institutionId ? { institutionId } : {}) })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return {
    retentionDays: days,
    alerts: rows.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      institutionId: a.institutionId,
      category: a.category,
      subtype: a.subtype,
      actionTaken: a.actionTaken,
      excerpt: a.excerpt,
      detector: a.detector,
      beta: a.beta,
      reviewRequired: a.reviewRequired,
      reviewedAt: a.reviewedAt,
      createdAt: a.createdAt,
      purgeAfter: new Date(new Date(a.createdAt).getTime() + days * DAY_MS),
      overdue: new Date(a.createdAt).getTime() + days * DAY_MS < now.getTime(),
    })),
  };
}

/**
 * P2: deletes kept alerts of deleted students older than
 * SAFETY_ALERT_RETENTION_DAYS (counted from the alert's createdAt). Alerts of
 * live students are never touched.
 */
export async function purgeDeletedStudentAlerts(opts: { apply?: boolean; now?: Date; retentionDays?: number } = {}) {
  const retentionDays = opts.retentionDays ?? safetyAlertRetentionDays();
  const cutoff = new Date((opts.now ?? new Date()).getTime() - retentionDays * DAY_MS);
  const filter = { subjectDeleted: true, createdAt: { $lt: cutoff } };
  const due = await SafetyAlert.countDocuments(filter);
  const deleted = opts.apply && due ? (await SafetyAlert.deleteMany(filter)).deletedCount : 0;
  const out = { job: 'safety_alerts_of_deleted_students', dryRun: !opts.apply, retentionDays, cutoff, due, deleted };
  logger.info('pdpl_retention', out);
  return out;
}

/**
 * P5: AI call records (cost telemetry, kept 180 days by their own TTL for the
 * school's cost totals) lose their link to a person after
 * DATA_LOG_RETENTION_DAYS: user, student and request IDs are removed.
 */
export async function anonymiseOldAiCalls(opts: { apply?: boolean; now?: Date; retentionDays?: number } = {}) {
  const retentionDays = opts.retentionDays ?? dataLogRetentionDays();
  const cutoff = new Date((opts.now ?? new Date()).getTime() - retentionDays * DAY_MS);
  const filter = { createdAt: { $lt: cutoff }, $or: [{ userId: { $exists: true } }, { studentId: { $exists: true } }, { requestId: { $exists: true } }] };
  const due = await AiCall.countDocuments(filter);
  const anonymised = opts.apply && due ? (await AiCall.updateMany(filter, { $unset: { userId: 1, studentId: 1, requestId: 1 } })).modifiedCount : 0;
  const out = { job: 'ai_calls_person_links', dryRun: !opts.apply, retentionDays, cutoff, due, anonymised };
  logger.info('pdpl_retention', out);
  return out;
}

export async function runPdplRetention(opts: { apply?: boolean; now?: Date } = {}) {
  return { alerts: await purgeDeletedStudentAlerts(opts), aiCalls: await anonymiseOldAiCalls(opts) };
}
