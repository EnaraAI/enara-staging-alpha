import { Response } from 'express';
import { Student } from '../models/Student';
import { Batch } from '../models/Batch';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { generateStudentId, initialsFromName } from '../utils/idGenerator';
import { resolveWriteInstitutionId, scopedFilter } from '../auth/authorization';
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

export const createStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const name = getRequiredString(body, 'name', { max: 120 });
  const email = normalizeEmail(body.email);
  const grade = getRequiredString(body, 'grade', { max: 80 });
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
  });

  if (batchId) {
    await Batch.updateOne(scopedFilter(req, { id: batchId }), { $inc: { studentCount: 1 } });
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
  if (academicYear !== undefined) student.academicYear = academicYear || undefined;
  if (groupId !== undefined) student.groupId = groupId || undefined;

  if (batchId !== undefined && batchId !== student.batchId) {
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
  res.json(toPlainObject(student));
});

export const deleteStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await Student.findOne(scopedFilter(req, { id: req.params.id }));
  if (!student) throw new AppError('Student not found', 404);

  if (student.batchId) {
    await Batch.updateOne(scopedFilter(req, { id: student.batchId }), { $inc: { studentCount: -1 } });
  }

  await Student.deleteOne(scopedFilter(req, { id: req.params.id }));
  res.json({ message: 'Student deleted' });
});
