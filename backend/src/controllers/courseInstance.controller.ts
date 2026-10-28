import { Response } from 'express';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { generateInstanceId } from '../utils/idGenerator';
import { toPlainObject } from '../utils/serialize';
import { Batch } from '../models/Batch';
import { Curriculum } from '../models/Curriculum';
import { assertSameInstitution, resolveWriteInstitutionId, scopedFilter } from '../auth/authorization';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalBoolean,
  getOptionalId,
  getOptionalString,
  getOptionalStringArray,
  getPagination,
  getRequiredId,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';
import { normalizeCourseVisibility } from '../services/courseVisibility';

function toInstanceResponse(doc: InstanceType<typeof CourseInstance>) {
  return toPlainObject(doc);
}

export const listCourseInstances = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, year, batchId } = req.query;
  const filter: Record<string, unknown> = scopedFilter(req, {});
  const { limit, skip } = getPagination(req.query);

  if (year && year !== 'All Years') filter.academicYear = year;
  if (batchId && batchId !== 'All Batches') filter.batchId = batchId;

  if (search) {
    const s = escapeRegex(String(search).slice(0, 80));
    filter.$or = [
      { courseName: { $regex: s, $options: 'i' } },
      { courseId: { $regex: s, $options: 'i' } },
    ];
  }

  const instances = await CourseInstance.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
  res.json(instances.map(toInstanceResponse));
});

export const getCourseInstance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);
  res.json(toInstanceResponse(instance));
});

export const createCourseInstance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const courseId = getRequiredId(body, 'courseId');
  const courseName = getRequiredString(body, 'courseName', { max: 160 });
  const academicYear = getRequiredString(body, 'academicYear', { max: 32 });
  const batchId = getRequiredId(body, 'batchId');
  const curriculumId = getOptionalId(body, 'curriculumId');
  const groupId = getOptionalString(body, 'groupId', { max: 80 });
  const instructorIds = getOptionalStringArray(body, 'instructorIds', {
    maxItems: 100,
    maxLength: 128,
  }) || [];
  const visibility = normalizeCourseVisibility(body.visibility, 'internal');
  const isDemo = getOptionalBoolean(body, 'isDemo') ?? false;
  const institutionId = resolveWriteInstitutionId(
    req,
    getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')
  );

  const batch = await Batch.findOne(scopedFilter(req, { id: batchId }));
  if (!batch) throw new AppError('Batch not found', 404);
  if (curriculumId) {
    const curriculum = await Curriculum.findOne(scopedFilter(req, { id: curriculumId }));
    if (!curriculum) throw new AppError('Curriculum not found', 404);
    assertSameInstitution(req, curriculum);
  }

  const instance = await CourseInstance.create({
    id: generateInstanceId(),
    institutionId,
    courseId,
    courseName,
    visibility,
    isDemo,
    academicYear,
    batchId,
    curriculumId: curriculumId || undefined,
    groupId: groupId || undefined,
    studentIds: [],
    instructorIds,
  });

  res.status(201).json(toInstanceResponse(instance));
});

export const updateCourseInstance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  if (body.courseId !== undefined) instance.courseId = getRequiredId(body, 'courseId');
  if (body.courseName !== undefined) instance.courseName = getRequiredString(body, 'courseName', { max: 160 });
  if (body.visibility !== undefined) instance.visibility = normalizeCourseVisibility(body.visibility, instance.visibility);
  if (body.isDemo !== undefined) instance.isDemo = getOptionalBoolean(body, 'isDemo') ?? instance.isDemo;
  if (body.academicYear !== undefined) instance.academicYear = getRequiredString(body, 'academicYear', { max: 32 });
  if (body.batchId !== undefined) {
    const batchId = getRequiredId(body, 'batchId');
    const batch = await Batch.findOne(scopedFilter(req, { id: batchId }));
    if (!batch) throw new AppError('Batch not found', 404);
    instance.batchId = batchId;
  }
  if (body.curriculumId !== undefined) {
    const curriculumId = getOptionalId(body, 'curriculumId');
    if (curriculumId) {
      const curriculum = await Curriculum.findOne(scopedFilter(req, { id: curriculumId }));
      if (!curriculum) throw new AppError('Curriculum not found', 404);
    }
    instance.curriculumId = curriculumId;
  }
  if (body.groupId !== undefined) instance.groupId = getOptionalString(body, 'groupId', { max: 80 });
  if (body.instructorIds !== undefined) {
    instance.instructorIds = getOptionalStringArray(body, 'instructorIds', {
      maxItems: 100,
      maxLength: 128,
    }) || [];
  }

  await instance.save();
  res.json(toInstanceResponse(instance));
});

export const deleteCourseInstance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  await CourseInstance.deleteOne(scopedFilter(req, { id: req.params.id }));
  res.json({ message: 'Course instance deleted' });
});

export const getAvailableStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  const filter: Record<string, unknown> = scopedFilter(req, { id: { $nin: instance.studentIds } });
  if (instance.batchId) {
    filter.batchId = instance.batchId;
  }

  const students = await Student.find(filter).sort({ name: 1 }).limit(100);
  res.json(students.map((s) => toPlainObject(s)));
});

export const assignStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const studentId = getRequiredId(body, 'studentId');

  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  const student = await Student.findOne(scopedFilter(req, { id: studentId }));
  if (!student) throw new AppError('Student not found', 404);

  if (instance.studentIds.includes(studentId)) {
    throw new AppError('Student already assigned to this instance');
  }

  instance.studentIds.push(studentId);
  await instance.save();

  res.json(toInstanceResponse(instance));
});

export const removeStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  instance.studentIds = instance.studentIds.filter((id) => id !== req.params.studentId);
  await instance.save();

  res.json(toInstanceResponse(instance));
});

export const getAssignedStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const instance = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id }));
  if (!instance) throw new AppError('Course instance not found', 404);

  const students = await Student.find(scopedFilter(req, { id: { $in: instance.studentIds } }));
  res.json(students.map((s) => toPlainObject(s)));
});
