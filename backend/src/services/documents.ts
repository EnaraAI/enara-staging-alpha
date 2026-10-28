import { randomUUID } from 'crypto';
import path from 'path';
import { AppError } from '../middleware/errorHandler';
import { CurriculumChunk, CurriculumFileJob, type ICurriculumFileJob } from '../models/CurriculumChunk';
import { Curriculum, type ICurriculum } from '../models/Curriculum';
import { logger } from '../utils/logging';
import { validateUploadFile } from '../utils/uploadSecurity';
import { deleteUpload, saveUpload } from './uploadStorage';
import { ATTESTATION_STATEMENT_VERSION, isDocumentSafetyRequired, scanDocument } from './documentSafety';
import { processCurriculumFiles } from './curriculumExtraction';
import { formatDate } from '../utils/idGenerator';

// Documents (P2): one uploaded file in a curriculum lesson. The document
// record is its CurriculumFileJob (id = uploadId). Registration stores the
// file, records the uploader's rights attestation and, in a school with the
// safety gate, scans it before any extraction.

export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt'];

// True only for an explicit yes: a checkbox the client must send.
export function readAttestation(value: unknown): boolean {
  return value === true || value === 'true';
}

export async function registerDocument(params: {
  curriculum: InstanceType<typeof Curriculum>;
  chapterId: string;
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  uploadedBy: string;
  attested: boolean;
  origin?: 'live' | 'demo_seed';
}): Promise<ICurriculumFileJob> {
  const { curriculum } = params;
  const chapter = curriculum.chapters.find((ch) => ch.id === params.chapterId);
  if (!chapter) throw new AppError('Lesson not found', 404, 'NOT_FOUND');
  const gated = await isDocumentSafetyRequired(curriculum.institutionId);
  if (gated && !params.attested) {
    throw new AppError('Confirm you have the right to upload this file for processing', 400, 'RIGHTS_ATTESTATION_REQUIRED');
  }
  const info = validateUploadFile(params.file);
  const storedName = `${randomUUID()}-${info.safeFileName}`;
  await saveUpload(storedName, params.file.buffer, info.contentType);
  const fileUrl = `/uploads/${storedName}`;
  const now = new Date();
  const job = await CurriculumFileJob.create({
    id: `cfj-${randomUUID()}`,
    institutionId: curriculum.institutionId,
    curriculumId: curriculum.id,
    lessonId: chapter.id,
    fileUrl,
    fileName: info.safeFileName,
    contentType: info.contentType,
    sizeBytes: params.file.size,
    uploadedBy: params.uploadedBy,
    ...(params.attested ? { rightsAttestation: { attestedBy: params.uploadedBy, attestedAt: now, statementVersion: ATTESTATION_STATEMENT_VERSION } } : {}),
    // Gated: held until scanned clean. Not gated: pre-P2 behaviour.
    status: gated ? 'blocked' : 'pending',
    scanStatus: gated ? 'pending' : 'not_required',
    attempts: 0,
    origin: params.origin ?? 'live',
  });
  chapter.uploads.push(fileUrl);
  curriculum.lastUpdated = formatDate();
  await curriculum.save();
  logger.info('document_registered', { uploadId: job.id, institutionId: curriculum.institutionId, gated, sizeBytes: params.file.size });
  if (gated) await scanDocument(job.id);
  return (await CurriculumFileJob.findOne({ id: job.id }))!;
}

// Extraction for a school's curriculum, when it may run (the safety gate is
// checked again inside extraction).
export async function processDocuments(curriculumId: string) {
  return processCurriculumFiles({ curriculumId, limit: 2 });
}

// Deletes a document's file, passages and lesson link, keeping the record
// (status 'removed', who/when/why) for audit. Idempotent.
export async function deleteDocument(job: Pick<ICurriculumFileJob, 'id' | 'institutionId' | 'curriculumId' | 'fileUrl'>, reason: 'user' | 'retention'): Promise<void> {
  await deleteUpload(path.basename(job.fileUrl)).catch(() => undefined);
  await CurriculumChunk.deleteMany({ institutionId: job.institutionId, curriculumId: job.curriculumId, $or: [{ uploadId: job.id }, { fileUrl: job.fileUrl }] });
  await Curriculum.updateOne({ id: job.curriculumId, institutionId: job.institutionId }, { $pull: { 'chapters.$[].uploads': job.fileUrl } });
  await CurriculumFileJob.updateOne(
    { id: job.id, institutionId: job.institutionId },
    { $set: { status: 'removed', deletedAt: new Date(), deletionReason: reason, detail: reason === 'retention' ? 'Deleted at the end of the retention period' : 'Deleted by a teacher' } },
  );
}

// The state a person sees, without implying a file is safe or processed when
// it is not.
// The malware-scan fact alone (P2 revised): 'clean' only from a real scanner;
// 'not_scanned_by_policy' for deferred documents.
export function malwareScanOf(scan: string | undefined) {
  return scan === 'clean' ? 'clean' : scan === 'deferred' ? 'not_scanned_by_policy' : scan === 'not_required' ? 'not_applicable' : scan === 'infected' ? 'threat_found' : 'not_scanned';
}

export function documentState(job: Pick<ICurriculumFileJob, 'status' | 'scanStatus' | 'rightsAttestation'>): string {
  if (job.status === 'removed') return 'deleted';
  const scan = job.scanStatus;
  if (scan === 'infected') return 'rejected';
  if (scan === 'pending') return job.rightsAttestation ? 'awaiting_scan' : 'needs_attestation';
  // 'deferred' (not scanned, by policy) follows extraction: queued, extracting, ready, no_text, failed.
  if (scan === 'unavailable') return 'scan_unavailable';
  if (scan === 'failed') return 'scan_failed';
  if (job.status === 'processing') return 'extracting';
  if (job.status === 'pending') return 'queued';
  if (job.status === 'done') return 'ready';
  return job.status; // no_text, failed, unsupported, blocked
}
