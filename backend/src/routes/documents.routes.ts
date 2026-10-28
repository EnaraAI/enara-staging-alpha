import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { hasPermission, requirePermission } from '../auth/permissions';
import { scopedFilter } from '../auth/authorization';
import { requireFeature } from '../services/featureFlags';
import { Curriculum } from '../models/Curriculum';
import { CurriculumChunk, CurriculumFileJob, type ICurriculumFileJob } from '../models/CurriculumChunk';
import { curriculumScope } from '../controllers/curriculum.controller';
import { DOCUMENT_EXTENSIONS, deleteDocument, documentState, malwareScanOf, processDocuments, readAttestation, registerDocument } from '../services/documents';
import { ATTESTATION_STATEMENT, NOT_SCANNED_NOTICE, isClearedForProcessing, isDocumentSafetyRequired, scanDocument } from '../services/documentSafety';
import { originFilter, parseOriginView } from '../services/originScope';
import { MAX_UPLOAD_BYTES } from '../utils/uploadSecurity';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';

// Documents workspace (P2): teachers' teaching materials. content:author
// (teachers, school admins); never academic managers or students. Teachers
// see documents in curricula they wrote or that are linked to a class they
// teach, and change only those they wrote. Every lookup is institution-scoped.
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

router.use(authMiddleware, requirePermission('content:author'), requireFeature('documents_workspace_enabled'));

async function readableCurricula(req: AuthRequest, extra: Record<string, unknown> = {}) {
  return Curriculum.find(await curriculumScope(req, extra, 'read')).select('id name institutionId createdBy chapters.id chapters.title').lean();
}

// One document the caller may see (404 otherwise, including other schools').
async function findDocument(req: AuthRequest, mode: 'read' | 'write') {
  const job = await CurriculumFileJob.findOne(scopedFilter(req, { id: String(req.params.uploadId), status: { $ne: 'removed' } })).lean();
  if (!job) throw new AppError('Document not found', 404, 'NOT_FOUND');
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: job.curriculumId, institutionId: job.institutionId }, mode)).select('id name chapters.id chapters.title').lean();
  if (!curriculum) throw new AppError('Document not found', 404, 'NOT_FOUND');
  return { job, curriculum };
}

function toDocument(job: ICurriculumFileJob, curriculum: { id: string; name: string; chapters?: { id: string; title?: string }[] } | undefined, canChange: boolean) {
  // Unscanned ('deferred') files are not offered for download: only text is used.
  const viewable = job.scanStatus === 'clean' || job.scanStatus === 'not_required';
  return {
    uploadId: job.id,
    fileName: job.fileName ?? path.basename(job.fileUrl).replace(/^[0-9a-f-]{36}-/i, ''),
    contentType: job.contentType ?? null,
    sizeBytes: job.sizeBytes ?? null,
    uploadedAt: (job as unknown as { createdAt?: Date }).createdAt ?? null,
    curriculumId: job.curriculumId,
    curriculumName: curriculum?.name ?? null,
    lessonId: job.lessonId,
    lessonTitle: curriculum?.chapters?.find((c) => c.id === job.lessonId)?.title ?? null,
    state: documentState(job),
    scanStatus: job.scanStatus ?? null,
    // Malware scan, separate from extraction: never "clean" unless a scanner said so.
    malwareScan: malwareScanOf(job.scanStatus),
    extractionStatus: job.status,
    detail: job.scanDetail ?? job.detail ?? null,
    pages: job.pages ?? null,
    chunkCount: job.chunkCount ?? null,
    rightsAttested: Boolean(job.rightsAttestation?.attestedAt),
    origin: job.origin ?? 'live',
    canChange,
    // Download only for files that are cleared or were never gated (signed by the API).
    fileUrl: viewable ? job.fileUrl : null,
  };
}

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const view = parseOriginView(req.query.origin);
  const curricula = await readableCurricula(req, typeof req.query.curriculumId === 'string' ? { id: req.query.curriculumId } : {});
  const byId = new Map(curricula.map((c) => [c.id, c]));
  const jobs = await CurriculumFileJob.find({
    ...scopedFilter(req, {}),
    curriculumId: { $in: [...byId.keys()] },
    status: { $ne: 'removed' },
    ...originFilter(view),
  }).sort({ createdAt: -1 }).limit(500).lean();
  const manager = hasPermission(req, 'content:manage_school');
  res.json({
    origin: view,
    attestationStatement: ATTESTATION_STATEMENT,
    notScannedNotice: NOT_SCANNED_NOTICE,
    documents: jobs.map((j) => toDocument(j as never, byId.get(j.curriculumId) as never, manager || byId.get(j.curriculumId)?.createdBy === req.user!.id)),
  });
}));

router.post('/', upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body ?? {});
  rejectMongoOperators(body);
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError('No file uploaded', 400, 'UPLOAD_REQUIRED');
  if (!DOCUMENT_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())) {
    throw new AppError(`Upload a ${DOCUMENT_EXTENSIONS.join(', ')} file`, 415, 'UPLOAD_TYPE_NOT_ALLOWED');
  }
  // The attestation is required here whatever the school setting.
  if (!readAttestation(body.rightsAttested)) throw new AppError('Confirm you have the right to upload this file for processing', 400, 'RIGHTS_ATTESTATION_REQUIRED');
  const curriculumId = typeof body.curriculumId === 'string' ? body.curriculumId : '';
  const lessonId = typeof body.lessonId === 'string' ? body.lessonId : '';
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: curriculumId }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404, 'NOT_FOUND');
  const job = await registerDocument({ curriculum, chapterId: lessonId, file, uploadedBy: req.user!.id, attested: true });
  if (isClearedForProcessing(job, await isDocumentSafetyRequired(curriculum.institutionId))) await processDocuments(curriculum.id);
  const fresh = await CurriculumFileJob.findOne({ id: job.id }).lean();
  res.status(201).json({ document: toDocument(fresh as never, curriculum.toObject() as never, true) });
}));

router.get('/:uploadId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { job, curriculum } = await findDocument(req, 'read');
  res.json({ document: toDocument(job as never, curriculum as never, false) });
}));

// Cited passages of a processed document: file name and page or section.
router.get('/:uploadId/sources', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { job } = await findDocument(req, 'read');
  if (!isClearedForProcessing(job, await isDocumentSafetyRequired(job.institutionId))) {
    res.json({ uploadId: job.id, sources: [], state: documentState(job) });
    return;
  }
  const chunks = await CurriculumChunk.find({ institutionId: job.institutionId, curriculumId: job.curriculumId, uploadId: job.id }).select('id fileName page sectionLabel chunkIndex text').sort({ chunkIndex: 1 }).limit(1000).lean();
  res.json({
    uploadId: job.id,
    state: documentState(job),
    sources: chunks.map((c) => ({ chunkId: c.id, fileName: c.fileName, page: c.page ?? null, section: c.sectionLabel ?? null, ref: c.page ? `p. ${c.page}` : c.sectionLabel ?? `passage ${c.chunkIndex + 1}`, preview: c.text.slice(0, 240) })),
  });
}));

// Retries a scan that is pending, unavailable or failed, or an extraction that
// failed. Never marks anything clean itself.
router.post('/:uploadId/retry', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { job } = await findDocument(req, 'write');
  if (['pending', 'unavailable', 'failed'].includes(job.scanStatus ?? '')) await scanDocument(job.id);
  const now = await CurriculumFileJob.findOne({ id: job.id }).lean();
  if (now && now.status === 'failed' && isClearedForProcessing(now, await isDocumentSafetyRequired(now.institutionId))) {
    await CurriculumFileJob.updateOne({ id: now.id, status: 'failed' }, { $set: { status: 'pending', attempts: 0 } });
  }
  const after = await CurriculumFileJob.findOne({ id: job.id }).lean();
  if (after && after.status === 'pending' && isClearedForProcessing(after, await isDocumentSafetyRequired(after.institutionId))) await processDocuments(after.curriculumId);
  const final = await CurriculumFileJob.findOne({ id: job.id }).lean();
  res.json({ document: toDocument(final as never, undefined, true) });
}));

router.delete('/:uploadId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { job } = await findDocument(req, 'write');
  await deleteDocument(job, 'user');
  res.status(204).end();
}));

export default router;
