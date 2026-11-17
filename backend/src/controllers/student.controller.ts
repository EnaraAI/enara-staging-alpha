import { Response } from 'express';
import { syncStudentDeleted, syncStudentGroup } from '../services/enrollmentSync';
import { Student, STUDENT_UI_MODES, StudentUiMode } from '../models/Student';
import { Batch } from '../models/Batch';
import { CourseInstance } from '../models/CourseInstance';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { generateStudentId, initialsFromName } from '../utils/idGenerator';
import { resolveWriteInstitutionId, scopedFilter } from '../auth/authorization';
import { archivedListFilter } from './archive.controller';
import { studentArchiveOn } from '../services/archive';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalId,
  getOptionalString,
  getPagination,
  getRequiredString,
  normalizeEmail,
  rejectMongoOperators,
} from '../utils/validation';

export const listStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { batchId, search, grade } = req.query;
  const filter: Record<string, unknown> = scopedFilter(req, {});
  const { limit, skip } = getPagination(req.query);

  if (batchId) filter.batchId = batchId;
  if (grade && grade !== 'All Grades') filter.grade = grade;
  // Step 6: archived students are hidden unless asked for (no change while off).
  Object.assign(filter, archivedListFilter(req, studentArchiveOn));

  if (search) {
    const s = escapeRegex(String(search).slice(0, 80));
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { id: { $regex: s, $options: 'i' } },
    ];
  }

  const students = await Student.find(filter).sort({ name: 1 }).skip(skip).limit(limit);
  res.json(students.map((student) => toPlainObject(student)));
});

export const getStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await Student.findOne(scopedFilter(req, { id: req.params.id }));
  if (!student) throw new AppError('Student not found', 404);
  res.json(toPlainObject(student));
});

// uiMode: 'kids' gives the student the Enara Kids interface; 'standard' (the default) the usual one.
function readUiMode(body: Record<string, unknown>): StudentUiMode | undefined {
  if (body.uiMode === undefined) return undefined;
  if (typeof body.uiMode !== 'string' || !(STUDENT_UI_MODES as readonly string[]).includes(body.uiMode)) {
    throw new AppError(`uiMode must be one of: ${STUDENT_UI_MODES.join(', ')}`, 400, 'INVALID_UI_MODE');
  }
  return body.uiMode as StudentUiMode;
}

export const createStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const name = getRequiredString(body, 'name', { max: 120 });
  const email = normalizeEmail(body.email);
  const grade = getRequiredString(body, 'grade', { max: 80 });
  const uiMode = readUiMode(body);
  const batchId = getOptionalId(body, 'batchId');
  const academicYear = getOptionalString(body, 'academicYear', { max: 32 });
  const groupId = getOptionalString(body, 'groupId', { max: 80 });
  const institutionId = resolveWriteInstitutionId(
    req,
    getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')
  );

  const existing = await Student.findOne(scopedFilter(req, { email }));
  if (existing) throw new AppError('A student with this email already exists', 409);

  if (batchId) {
    const batch = await Batch.findOne(scopedFilter(req, { id: batchId }));
    if (!batch) throw new AppError('Batch not found', 404);
  }

  const student = await Student.create({
    id: generateStudentId(),
    institutionId,
    name,
    email,
    grade,
    avatar: initialsFromName(name),
    batchId: batchId || undefined,
    academicYear: academicYear || undefined,
    groupId: groupId || undefined,
    uiMode: uiMode || 'standard',
  });

  if (batchId) {
    await Batch.updateOne(scopedFilter(req, { id: batchId }), { $inc: { studentCount: 1 } });
    await syncStudentGroup({ institutionId: student.institutionId, studentId: student.id, toGroupId: batchId, by: req.user?.id });
  }

  res.status(201).json(toPlainObject(student));
});

export const updateStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const student = await Student.findOne(scopedFilter(req, { id: req.params.id }));
  if (!student) throw new AppError('Student not found', 404);

  const name = getOptionalString(body, 'name', { max: 120 });
  const email = body.email === undefined ? undefined : normalizeEmail(body.email);
  const grade = getOptionalString(body, 'grade', { max: 80 });
  const batchId = getOptionalId(body, 'batchId');
  const academicYear = getOptionalString(body, 'academicYear', { max: 32 });
  const groupId = getOptionalString(body, 'groupId', { max: 80 });
  const uiMode = readUiMode(body);

  if (email && email !== student.email) {
    const duplicate = await Student.findOne(scopedFilter(req, { email }));
    if (duplicate) throw new AppError('A student with this email already exists', 409);
    student.email = email;
  }

  if (name !== undefined) {
    student.name = name;
    student.avatar = initialsFromName(name);
  }
  if (grade !== undefined) student.grade = grade;
  if (uiMode !== undefined) student.uiMode = uiMode;
  if (academicYear !== undefined) student.academicYear = academicYear || undefined;
  if (groupId !== undefined) student.groupId = groupId || undefined;

  let groupMove: { fromGroupId?: string; toGroupId?: string } | undefined;
  if (batchId !== undefined && batchId !== student.batchId) {
    groupMove = { fromGroupId: student.batchId || undefined, toGroupId: batchId || undefined };
    if (batchId) {
      const batch = await Batch.findOne(scopedFilter(req, { id: batchId }));
      if (!batch) throw new AppError('Batch not found', 404);
    }
    if (student.batchId) {
      await Batch.updateOne(scopedFilter(req, { id: student.batchId }), { $inc: { studentCount: -1 } });
    }
    if (batchId) {
      await Batch.updateOne(scopedFilter(req, { id: batchId }), { $inc: { studentCount: 1 } });
    }
    student.batchId = batchId || undefined;
  }

  await student.save();
  if (groupMove) await syncStudentGroup({ institutionId: student.institutionId, studentId: student.id, ...groupMove, by: req.user?.id });
  res.json(toPlainObject(student));
});

export const deleteStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await Student.findOne(scopedFilter(req, { id: req.params.id }));
  if (!student) throw new AppError('Student not found', 404);

  if (student.batchId) {
    await Batch.updateOne(scopedFilter(req, { id: student.batchId }), { $inc: { studentCount: -1 } });
  }

  await Student.deleteOne(scopedFilter(req, { id: req.params.id }));
  // Multi-class (decision A, 2026-11-17): also remove the student from every
  // class list, so no class keeps a dangling ID (old field) while the
  // enrollments below are ended (new records). Old and new then agree.
  await CourseInstance.updateMany(
    { ...(student.institutionId ? { institutionId: student.institutionId } : {}), studentIds: student.id },
    { $pull: { studentIds: student.id } },
  );
  await syncStudentDeleted({ studentId: student.id, by: req.user?.id });
  res.json({ message: 'Student deleted' });
});
