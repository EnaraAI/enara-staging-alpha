import { queueCurriculumProcessing } from '../services/curriculumExtraction';
import { unsignUploadPath } from '../utils/uploadSigning';
import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Curriculum } from '../models/Curriculum';
import { Batch } from '../models/Batch';
import { CourseInstance } from '../models/CourseInstance';
import { hasPermission } from '../auth/permissions';
import { isDocumentSafetyRequired } from '../services/documentSafety';
import { readAttestation, registerDocument } from '../services/documents';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getConfig } from '../config/env';
import {
  assertSameInstitution,
  resolveWriteInstitutionId,
  scopedFilter,
} from '../auth/authorization';
import {
  generateCurriculumId,
  generateChapterId,
  formatDate,
  buildDeploymentLink,
} from '../utils/idGenerator';
import { toPlainObject } from '../utils/serialize';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalId,
  getOptionalString,
  getOptionalStringArray,
  getPagination,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';
import {
  hasVideoSignature,
  MAX_VIDEO_BYTES,
  sanitizeFileName,
  validateUploadFile,
  VIDEO_TYPES,
} from '../utils/uploadSecurity';
import {
  createDirectUploadUrl,
  deleteUpload,
  inspectUpload,
  isRemoteUploadStorage,
  saveUpload,
} from '../services/uploadStorage';

function toCurriculumResponse(doc: InstanceType<typeof Curriculum>) {
  return toPlainObject(doc);
}

// Who may see or change a curriculum (P1). School content managers (admins)
// keep the full school scope. Everyone else (teachers) reads what they wrote
// or what is linked to a class they teach, and writes only what they wrote.
export async function curriculumScope(req: AuthRequest, extra: Record<string, unknown>, mode: 'read' | 'write'): Promise<Record<string, unknown>> {
  const base = scopedFilter(req, extra);
  if (hasPermission(req, 'content:manage_school')) return base;
  const userId = req.user!.id;
  if (mode === 'write') return { ...base, createdBy: userId };
  const linked = (await CourseInstance.find({ institutionId: req.user!.institutionId, instructorIds: userId }).select('curriculumId').lean())
    .map((c) => c.curriculumId)
    .filter(Boolean) as string[];
  return { ...base, $and: [{ $or: [{ createdBy: userId }, { id: { $in: linked } }] }] };
}

export const listCurriculums = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, type, status } = req.query;
  const filter: Record<string, unknown> = await curriculumScope(req, {}, 'read');
  const { limit, skip } = getPagination(req.query);

  if (type && type !== 'All Types') filter.type = type;
  if (status && status !== 'All Status') filter.status = String(status).toLowerCase();

  let query = Curriculum.find(filter).sort({ updatedAt: -1 });

  if (search) {
    const s = escapeRegex(String(search).slice(0, 80));
    query = Curriculum.find({
      ...filter,
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { id: { $regex: s, $options: 'i' } },
        { courseName: { $regex: s, $options: 'i' } },
        { type: { $regex: s, $options: 'i' } },
      ],
    }).sort({ updatedAt: -1 });
  }

  const curriculums = await query.skip(skip).limit(limit);
  res.json(curriculums.map(toCurriculumResponse));
});

export const getCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'read'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);
  res.json(toCurriculumResponse(curriculum));
});

export const createCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const {
    chapters,
    status = 'draft',
  } = body;

  const name = getRequiredString(body, 'name', { max: 160 });
  const summary = getRequiredString(body, 'summary', { max: 4000 });
  const courseName = getOptionalString(body, 'courseName', { max: 160 }) || '';
  const type = getOptionalString(body, 'type', { max: 80 }) || 'National';
  const level = getOptionalString(body, 'level', { max: 80 }) || '';
  const languages = getOptionalStringArray(body, 'languages', { maxItems: 12, maxLength: 40 }) || ['English'];
  const description = getOptionalString(body, 'description', { max: 8000 }) || '';
  const institutionId = resolveWriteInstitutionId(
    req,
    getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')
  );

  // Deploying is a school-wide action; authors create drafts.
  if (status === 'deployed' && !hasPermission(req, 'content:manage_school')) {
    throw new AppError('Deploying a curriculum school-wide needs content management rights', 403, 'FORBIDDEN');
  }
  if (status === 'deployed' && (!Array.isArray(chapters) || chapters.length === 0)) {
    throw new AppError('At least one chapter is required to deploy');
  }

  const id = generateCurriculumId();
  const normalizedChapters = Array.isArray(chapters)
    ? chapters.slice(0, 100).map((raw) => {
        const ch = ensurePlainObject(raw, 'chapter');
        return {
          id: getOptionalId(ch, 'id') || generateChapterId(),
          title: getOptionalString(ch, 'title', { max: 160 }) || '',
          uploads: getOptionalStringArray(ch, 'uploads', { maxItems: 100, maxLength: 512 }) || [],
          description: getOptionalString(ch, 'description', { max: 4000 }) || '',
          enaraSectionId: getOptionalId(ch, 'enaraSectionId'),
        };
      })
    : [];

  const curriculum = await Curriculum.create({
    id,
    institutionId,
    name,
    courseName,
    type,
    level,
    languages,
    summary,
    description,
    lastUpdated: formatDate(),
    subjectsCount: normalizedChapters.length,
    assignedBatches: [],
    chapters: normalizedChapters,
    status,
    deploymentLink: status === 'deployed' ? buildDeploymentLink(id) : undefined,
    createdBy: req.user!.id,
  });

  res.status(201).json(toCurriculumResponse(curriculum));
});

export const updateCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const allowed = [
    'name',
    'courseName',
    'type',
    'level',
    'languages',
    'summary',
    'description',
    'chapters',
  ] as const;

  for (const key of allowed) {
    if (body[key] !== undefined) {
      (curriculum as unknown as Record<string, unknown>)[key] = body[key];
    }
  }

  if (body.chapters && Array.isArray(body.chapters)) {
    curriculum.subjectsCount = body.chapters.length;
  }

  curriculum.lastUpdated = formatDate();
  await curriculum.save();
  void queueCurriculumProcessing(curriculum);
  res.json(toCurriculumResponse(curriculum));
});

export const deployCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: req.params.id }));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  if (!curriculum.name || !curriculum.summary) {
    throw new AppError('Name and summary are required to deploy');
  }
  if (curriculum.chapters.length === 0) {
    throw new AppError('At least one chapter is required to deploy');
  }

  curriculum.status = 'deployed';
  curriculum.deploymentLink = buildDeploymentLink(curriculum.id);
  curriculum.lastUpdated = formatDate();
  await curriculum.save();

  res.json(toCurriculumResponse(curriculum));
});

export const deleteCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: req.params.id }));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  await Batch.updateMany(scopedFilter(req, { curriculumId: curriculum.id }), { $unset: { curriculumId: 1 } });
  await Curriculum.deleteOne(scopedFilter(req, { id: req.params.id }));
  res.json({ message: 'Curriculum deleted' });
});

export const assignBatchToCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const batchId = getRequiredString(body, 'batchId', { max: 128 });

  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: req.params.id }));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const batch = await Batch.findOne(scopedFilter(req, { id: batchId }));
  if (!batch) throw new AppError('Batch not found', 404);
  assertSameInstitution(req, batch);

  batch.curriculumId = curriculum.id;
  await batch.save();

  if (!curriculum.assignedBatches.includes(batch.name)) {
    curriculum.assignedBatches.push(batch.name);
    curriculum.lastUpdated = formatDate();
    await curriculum.save();
  }

  res.json({
    curriculum: toCurriculumResponse(curriculum),
    batch: batch.toObject(),
  });
});

export const unassignBatchFromCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: req.params.id }));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const batch = await Batch.findOne(scopedFilter(req, { id: req.params.batchId }));
  if (!batch) throw new AppError('Batch not found', 404);

  batch.curriculumId = undefined;
  await batch.save();

  curriculum.assignedBatches = curriculum.assignedBatches.filter((n) => n !== batch.name);
  curriculum.lastUpdated = formatDate();
  await curriculum.save();

  res.json({
    curriculum: toCurriculumResponse(curriculum),
    batch: batch.toObject(),
  });
});

export const uploadChapterFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const chapterId = req.params.chapterId;
  const chapter = curriculum.chapters.find((ch) => ch.id === chapterId);
  if (!chapter) throw new AppError('Chapter not found', 404);

  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError('No file uploaded', 400, 'UPLOAD_REQUIRED');
  // Documents safety gate (P2): attested, scanned uploads only.
  if (await isDocumentSafetyRequired(curriculum.institutionId)) {
    const job = await registerDocument({ curriculum, chapterId: String(chapterId), file, uploadedBy: req.user!.id, attested: readAttestation((req.body as Record<string, unknown>)?.rightsAttested) });
    res.json({ upload: job.fileUrl, uploadId: job.id, curriculum: toCurriculumResponse(curriculum) });
    return;
  }
  const uploadInfo = validateUploadFile(file);

  const storedName = `${randomUUID()}-${uploadInfo.safeFileName}`;
  await saveUpload(storedName, file.buffer, file.mimetype);

  const fileUrl = `/uploads/${storedName}`;
  chapter.uploads.push(fileUrl);
  curriculum.lastUpdated = formatDate();
  await curriculum.save();

  void queueCurriculumProcessing(curriculum);
  res.json({ upload: fileUrl, curriculum: toCurriculumResponse(curriculum) });
});

// Step 1 of a lesson video upload: a signed URL the browser PUTs the (already
// compressed) video to. Step 2, completeChapterVideoUpload, checks it and attaches it.
export const requestChapterVideoUpload = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isRemoteUploadStorage()) {
    throw new AppError('Video storage is not configured', 503, 'UPLOAD_STORAGE_UNAVAILABLE');
  }
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);
  if (!curriculum.chapters.some((ch) => ch.id === req.params.chapterId)) {
    throw new AppError('Chapter not found', 404);
  }

  const { fileName, size } = req.body as { fileName?: string; size?: number };
  const safeFileName = sanitizeFileName(String(fileName || 'video.mp4'));
  const contentType = VIDEO_TYPES[path.extname(safeFileName).toLowerCase()];
  if (!contentType) throw new AppError('Only MP4 or WebM videos are allowed', 415, 'UPLOAD_TYPE_NOT_ALLOWED');
  if (!Number.isFinite(size) || Number(size) <= 0 || Number(size) > MAX_VIDEO_BYTES) {
    throw new AppError('Video must be 1 GB or smaller', 413, 'UPLOAD_SIZE_NOT_ALLOWED');
  }

  const storedName = `${randomUUID()}-${safeFileName}`;
  const uploadUrl = await createDirectUploadUrl(storedName, contentType);
  res.json({ uploadUrl, storedName, contentType });
});

export const completeChapterVideoUpload = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);
  const chapter = curriculum.chapters.find((ch) => ch.id === req.params.chapterId);
  if (!chapter) throw new AppError('Chapter not found', 404);

  const storedName = path.basename(String((req.body as { storedName?: string }).storedName || ''));
  const extension = path.extname(storedName).toLowerCase();
  if (!VIDEO_TYPES[extension]) throw new AppError('Unknown video upload', 400, 'VALIDATION_ERROR');

  const stored = await inspectUpload(storedName);
  if (!stored) throw new AppError('Video was not uploaded', 400, 'UPLOAD_REQUIRED');
  if (stored.size > MAX_VIDEO_BYTES || !hasVideoSignature(extension, stored.head)) {
    await deleteUpload(storedName);
    throw new AppError('File is not a valid video', 415, 'UPLOAD_SIGNATURE_MISMATCH');
  }

  const fileUrl = `/uploads/${storedName}`;
  if (!chapter.uploads.includes(fileUrl)) chapter.uploads.push(fileUrl);
  curriculum.lastUpdated = formatDate();
  await curriculum.save();

  void queueCurriculumProcessing(curriculum);
  res.json({ upload: fileUrl, size: stored.size, curriculum: toCurriculumResponse(curriculum) });
});

export const removeChapterUpload = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const chapter = curriculum.chapters.find((ch) => ch.id === req.params.chapterId);
  if (!chapter) throw new AppError('Chapter not found', 404);

  const uploadPath = typeof req.query.uploadPath === 'string' ? unsignUploadPath(req.query.uploadPath) : '';
  if (!uploadPath || !uploadPath.startsWith('/uploads/')) {
    throw new AppError('uploadPath query parameter is required', 400, 'VALIDATION_ERROR');
  }
  chapter.uploads = chapter.uploads.filter((u) => u !== uploadPath);

  await deleteUpload(path.basename(uploadPath));

  curriculum.lastUpdated = formatDate();
  await curriculum.save();
  void queueCurriculumProcessing(curriculum);

  res.json(toCurriculumResponse(curriculum));
});

export const getBatchesForAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: req.params.id }));
  if (!curriculum) throw new AppError('Curriculum not found', 404);

  const batches = await Batch.find(scopedFilter(req, {})).sort({ name: 1 }).limit(100);
  const result = batches.map((b) => ({
    id: b.id,
    name: b.name,
    studentCount: b.studentCount,
    academicYear: b.academicYear,
    groupId: b.groupId,
    curriculumId: b.curriculumId,
    isAssigned: b.curriculumId === curriculum.id,
  }));

  res.json(result);
});

// Links a curriculum to a class (P1, content:publish + class:teach). Teachers
// may publish only their own curriculum, only to a class they teach; school
// content managers may publish any school curriculum to any school class.
// This is class-level publishing, not school-wide deployment.
export const publishCurriculumToClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const classId = getRequiredString(body, 'classId', { max: 120 });
  const curriculum = await Curriculum.findOne(await curriculumScope(req, { id: req.params.id }, 'write'));
  if (!curriculum) throw new AppError('Curriculum not found', 404);
  const manager = hasPermission(req, 'content:manage_school');
  const course = await CourseInstance.findOne({
    ...scopedFilter(req, { id: classId }),
    institutionId: curriculum.institutionId,
    ...(manager ? {} : { instructorIds: req.user!.id }),
  });
  if (!course) throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
  course.curriculumId = curriculum.id;
  await course.save();
  res.json({ classId: course.id, curriculumId: curriculum.id });
});
