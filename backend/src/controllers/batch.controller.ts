import { Response } from 'express';
import { Batch } from '../models/Batch';
import { Curriculum } from '../models/Curriculum';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { generateBatchId, formatDate } from '../utils/idGenerator';
import { toPlainObject } from '../utils/serialize';
import { resolveWriteInstitutionId, scopedFilter } from '../auth/authorization';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalId,
  getOptionalNumber,
  getOptionalString,
  getPagination,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';

function toBatchResponse(doc: InstanceType<typeof Batch>) {
  return toPlainObject(doc);
}

export const listBatches = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, filter } = req.query;
  const query: Record<string, unknown> = scopedFilter(req, {});
  const { limit, skip } = getPagination(req.query);

  if (filter === 'assigned') query.curriculumId = { $exists: true, $ne: null };
  if (filter === 'unassigned') query.$or = [{ curriculumId: { $exists: false } }, { curriculumId: null }];

  if (search) {
    query.name = { $regex: escapeRegex(String(search).slice(0, 80)), $options: 'i' };
  }

  const batches = await Batch.find(query).sort({ name: 1 }).skip(skip).limit(limit);
  res.json(batches.map(toBatchResponse));
});

export const getBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const batch = await Batch.findOne(scopedFilter(req, { id: req.params.id }));
  if (!batch) throw new AppError('Batch not found', 404);
  res.json(toBatchResponse(batch));
});

export const createBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const name = getRequiredString(body, 'name', { max: 120 });
  const studentCount = getOptionalNumber(body, 'studentCount', { min: 0, max: 100_000 }) ?? 0;
  const academicYear = getRequiredString(body, 'academicYear', { max: 32 });
  const groupId = getOptionalString(body, 'groupId', { max: 80 });
  const institutionId = resolveWriteInstitutionId(
    req,
    getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')
  );

  const batch = await Batch.create({
    id: generateBatchId(),
    institutionId,
    name,
    studentCount,
    academicYear,
    groupId: groupId || undefined,
  });

  res.status(201).json(toBatchResponse(batch));
});

export const updateBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const batch = await Batch.findOne(scopedFilter(req, { id: req.params.id }));
  if (!batch) throw new AppError('Batch not found', 404);

  const oldName = batch.name;
  const name = getOptionalString(body, 'name', { max: 120 });
  const studentCount = getOptionalNumber(body, 'studentCount', { min: 0, max: 100_000 });
  const academicYear = getOptionalString(body, 'academicYear', { max: 32 });
  const groupId = getOptionalString(body, 'groupId', { max: 80 });
  const curriculumId = getOptionalId(body, 'curriculumId');

  if (name !== undefined) batch.name = name;
  if (studentCount !== undefined) batch.studentCount = studentCount;
  if (academicYear !== undefined) batch.academicYear = academicYear;
  if (groupId !== undefined) batch.groupId = groupId || undefined;
  if (curriculumId !== undefined) batch.curriculumId = curriculumId || undefined;

  await batch.save();

  if (name && name !== oldName && batch.curriculumId) {
    const curriculum = await Curriculum.findOne(scopedFilter(req, { id: batch.curriculumId }));
    if (curriculum) {
      curriculum.assignedBatches = curriculum.assignedBatches.map((n) =>
        n === oldName ? name : n
      );
      curriculum.lastUpdated = formatDate();
      await curriculum.save();
    }
  }

  res.json(toBatchResponse(batch));
});

export const deleteBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const batch = await Batch.findOne(scopedFilter(req, { id: req.params.id }));
  if (!batch) throw new AppError('Batch not found', 404);

  if (batch.curriculumId) {
    const curriculum = await Curriculum.findOne(scopedFilter(req, { id: batch.curriculumId }));
    if (curriculum) {
      curriculum.assignedBatches = curriculum.assignedBatches.filter((n) => n !== batch.name);
      curriculum.lastUpdated = formatDate();
      await curriculum.save();
    }
  }

  await Batch.deleteOne(scopedFilter(req, { id: req.params.id }));
  res.json({ message: 'Batch deleted' });
});
