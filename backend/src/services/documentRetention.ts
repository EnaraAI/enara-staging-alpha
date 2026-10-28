import { CurriculumFileJob } from '../models/CurriculumChunk';
import { Institution } from '../models/Institution';
import { logger, serializeError } from '../utils/logging';
import { deleteDocument } from './documents';

// Document retention (P2). Per school: documents are deleted retentionDays
// (default 180) after pilotEndsAt. Nothing is deleted while pilotEndsAt is
// unset. Deletion removes the stored file, its extracted passages and the
// lesson link; the document record stays (status 'removed', when and why)
// for audit. Each school is handled on its own; re-running is safe.
export const DEFAULT_DOCUMENT_RETENTION_DAYS = 180;

export async function sweepDocumentRetention(opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const schools = await Institution.find({ 'documentRetention.pilotEndsAt': { $ne: null } }).select('id documentRetention').lean();
  const report: { institutionId: string; deleted: number; failed: number }[] = [];
  for (const school of schools) {
    const ends = school.documentRetention?.pilotEndsAt;
    if (!ends) continue;
    const days = school.documentRetention?.retentionDays ?? DEFAULT_DOCUMENT_RETENTION_DAYS;
    const cutoff = new Date(new Date(ends).getTime() + days * 86_400_000);
    if (now < cutoff) continue;
    const due = await CurriculumFileJob.find({ institutionId: school.id, status: { $ne: 'removed' } }).select('id institutionId curriculumId fileUrl').limit(opts.limit ?? 500).lean();
    let deleted = 0;
    let failed = 0;
    for (const job of due) {
      try {
        await deleteDocument(job, 'retention');
        deleted += 1;
      } catch (error) {
        failed += 1;
        logger.error('document_retention_failed', { institutionId: school.id, uploadId: job.id, error: serializeError(error) });
      }
    }
    if (deleted || failed) logger.info('document_retention_applied', { institutionId: school.id, deleted, failed });
    report.push({ institutionId: school.id, deleted, failed });
  }
  return report;
}
