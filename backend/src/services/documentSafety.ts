import path from 'path';
import { CurriculumChunk, CurriculumFileJob, type ICurriculumFileJob } from '../models/CurriculumChunk';
import { logger, serializeError } from '../utils/logging';
import { isFeatureEnabled } from './featureFlags';
import { getMalwareScanner } from './malwareScan';
import { deleteUpload, readUpload } from './uploadStorage';

// The documents safety gate (P2, revised by the approved no-scanner decision).
// For a school with documents_workspace_enabled:
//  - a rights attestation is always required;
//  - with a configured scanner, a document is processed only once scanned
//    'clean'; infected, failed and pending are never processed;
//  - with no scanner configured, an attested document is marked 'deferred'
//    (NOT scanned, by school policy) and its text may be extracted locally
//    and used, in bounded passages, by the AI workflow. It is never called
//    clean or scanned, and the raw file is never sent to an AI provider or
//    offered for download (that needs a real clean verdict).
//  - only the server sets scan states.
// Schools without the flag keep pre-P2 behaviour (scanStatus 'not_required').

export const ATTESTATION_STATEMENT_VERSION = 'rights-v1';
export const NOT_SCANNED_NOTICE =
  'This document has not been scanned for malware. ENARA validates file type and size, but this is not a malware scan. ' +
  'Eligible extracted text may be sent to the configured AI provider. Upload only educational files you are authorized to use; ' +
  'avoid confidential or personal student data.';
export const DEFERRED_DETAIL = 'Not scanned for malware: AI processing of extracted text is enabled by school policy.';
export const ATTESTATION_STATEMENT =
  'I confirm I have the right to upload this file and permit ENARA to process it, including with AI providers, for teaching at my school.';
const MAX_SCAN_ATTEMPTS = 5;

export async function isDocumentSafetyRequired(institutionId: string | undefined): Promise<boolean> {
  return isFeatureEnabled(institutionId, 'documents_workspace_enabled');
}

// Whether this document's text may be extracted locally and used (as
// bounded passages) by the AI workflow now.
export function isClearedForProcessing(job: Pick<ICurriculumFileJob, 'scanStatus' | 'rightsAttestation'>, safetyRequired: boolean): boolean {
  if (!safetyRequired) return true;
  return (job.scanStatus === 'clean' || job.scanStatus === 'deferred') && Boolean(job.rightsAttestation?.attestedAt);
}

// Scans one document with the configured scanner. Without a scanner, an
// attested document is 'deferred' (not scanned; text processing allowed by
// policy); one without an attestation stays blocked. Infected files are
// deleted from storage with their passages.
export async function scanDocument(jobId: string): Promise<ICurriculumFileJob['scanStatus']> {
  const job = await CurriculumFileJob.findOne({ id: jobId }).lean();
  if (!job || job.status === 'removed') return job?.scanStatus;
  if (!['pending', 'unavailable', 'failed'].includes(job.scanStatus ?? '')) return job.scanStatus;
  const scanner = getMalwareScanner();
  if (!scanner) {
    // A scan a real scanner could not complete stays failed (fail closed).
    if (!job.rightsAttestation?.attestedAt || job.scanStatus === 'failed') return job.scanStatus;
    await CurriculumFileJob.updateOne(
      { id: jobId, scanStatus: { $in: ['pending', 'unavailable'] } },
      { $set: { scanStatus: 'deferred', scanDetail: DEFERRED_DETAIL, status: 'pending', attempts: 0 }, $unset: { scanProvider: 1, scannedAt: 1 } },
    );
    return 'deferred';
  }
  if ((job.scanAttempts ?? 0) >= MAX_SCAN_ATTEMPTS) return job.scanStatus;
  const name = path.basename(job.fileUrl);
  try {
    const file = await readUpload(name);
    if (!file) {
      await CurriculumFileJob.updateOne({ id: jobId }, { $set: { scanStatus: 'failed', scanDetail: 'File not found in storage', status: 'blocked' }, $inc: { scanAttempts: 1 } });
      return 'failed';
    }
    const result = await scanner.scan({ body: file.body, fileName: job.fileName ?? name, contentType: job.contentType });
    const at = new Date();
    if (result.verdict === 'clean') {
      // Cleared: extraction may now run (status back to pending).
      await CurriculumFileJob.updateOne(
        { id: jobId, scanStatus: { $in: ['pending', 'unavailable', 'failed'] } },
        { $set: { scanStatus: 'clean', scanProvider: scanner.name, scannedAt: at, scanDetail: undefined, status: 'pending', attempts: 0 }, $inc: { scanAttempts: 1 } },
      );
      return 'clean';
    }
    if (result.verdict === 'infected') {
      await deleteUpload(name).catch(() => undefined);
      await CurriculumChunk.deleteMany({ institutionId: job.institutionId, uploadId: job.id });
      await CurriculumFileJob.updateOne(
        { id: jobId },
        { $set: { scanStatus: 'infected', scanProvider: scanner.name, scannedAt: at, scanDetail: 'The scanner found a threat; the file was deleted.', status: 'blocked', deletedAt: at, deletionReason: 'infected' }, $inc: { scanAttempts: 1 } },
      );
      logger.warn('document_scan_infected', { uploadId: jobId, institutionId: job.institutionId, provider: scanner.name });
      return 'infected';
    }
    await CurriculumFileJob.updateOne({ id: jobId }, { $set: { scanStatus: 'failed', scanProvider: scanner.name, scanDetail: 'The scan did not complete; it will be retried.', status: 'blocked' }, $inc: { scanAttempts: 1 } });
    return 'failed';
  } catch (error) {
    logger.warn('document_scan_failed', { uploadId: jobId, error: serializeError(error) });
    await CurriculumFileJob.updateOne({ id: jobId }, { $set: { scanStatus: 'failed', scanDetail: 'The scan did not complete; it will be retried.', status: 'blocked' }, $inc: { scanAttempts: 1 } });
    return 'failed';
  }
}

// Daily: retry scans that are pending, unavailable (a scanner may now be
// configured) or failed.
export async function sweepDocumentScans(limit = 50) {
  const due = await CurriculumFileJob.find({ scanStatus: { $in: ['pending', 'unavailable', 'failed'] }, status: { $ne: 'removed' }, scanAttempts: { $lt: MAX_SCAN_ATTEMPTS } }).select('id').limit(limit).lean();
  const results: Record<string, number> = {};
  for (const { id } of due) {
    const s = (await scanDocument(id)) ?? 'unknown';
    results[s] = (results[s] ?? 0) + 1;
  }
  return { due: due.length, results };
}

// Upload ids whose passages may be used, for a school with the gate on.
export async function clearedUploadIds(institutionId: string, curriculumId?: string): Promise<string[]> {
  const jobs = await CurriculumFileJob.find({ institutionId, ...(curriculumId ? { curriculumId } : {}), scanStatus: { $in: ['clean', 'deferred'] }, 'rightsAttestation.attestedAt': { $exists: true }, status: { $ne: 'removed' } }).select('id').lean();
  return jobs.map((j) => j.id);
}

// Lesson file URLs whose raw file may be sent to an AI provider (tutor
// materials). Only genuinely clean files: a 'deferred' (unscanned) file is
// used through its locally extracted text only, never as a raw file.
export async function filterClearedFileUrls(institutionId: string | undefined, urls: string[]): Promise<string[]> {
  if (!urls.length || !institutionId || !(await isDocumentSafetyRequired(institutionId))) return urls;
  const plain = urls.map((u) => u.split('?')[0]);
  const ok = new Set(
    (await CurriculumFileJob.find({ institutionId, fileUrl: { $in: plain }, scanStatus: 'clean', 'rightsAttestation.attestedAt': { $exists: true }, status: { $ne: 'removed' } }).select('fileUrl').lean()).map((j) => j.fileUrl),
  );
  return urls.filter((u) => ok.has(u.split('?')[0]));
}
