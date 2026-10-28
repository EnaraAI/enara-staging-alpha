import { Response } from 'express';
import { AttendanceSession } from '../models/AttendanceSession';
import { AttendanceRecord, ATTENDANCE_STATUSES, AttendanceStatus } from '../models/AttendanceRecord';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import {
  generateAttendanceSessionId,
  generateAttendanceRecordId,
  formatDate,
} from '../utils/idGenerator';
import { scopedFilter } from '../auth/authorization';
import {
  ensurePlainObject,
  getOptionalString,
  getRequiredId,
  rejectMongoOperators,
} from '../utils/validation';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new AppError(`${field} must be a YYYY-MM-DD date`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

async function loadOwnedCourseInstance(req: AuthRequest, courseInstanceId: string) {
  const courseInstance = await CourseInstance.findOne(scopedFilter(req, { id: courseInstanceId }));
  if (!courseInstance) throw new AppError('Class not found', 404);
  if (req.user!.role === 'teacher' && !courseInstance.instructorIds.includes(req.user!.id)) {
    throw new AppError('Class not found', 404);
  }
  return courseInstance;
}

function summarizeRecords(records: Array<{ status: AttendanceStatus }>) {
  const summary: Record<AttendanceStatus, number> & { total: number } = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    total: records.length,
  };
  for (const record of records) summary[record.status] += 1;
  return summary;
}

async function retryOnDuplicateKey<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return fn();
  }
}

export const listTeacherClasses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = scopedFilter(req, {});
  if (req.user!.role === 'teacher') filter.instructorIds = req.user!.id;

  const courseInstances = await CourseInstance.find(filter).sort({ courseName: 1 });
  const today = formatDate();

  const todaysSessions = await AttendanceSession.find({
    courseInstanceId: { $in: courseInstances.map((c) => c.id) },
    attendanceDate: today,
  });
  const sessionByCourseInstance = new Map(todaysSessions.map((s) => [s.courseInstanceId, s]));

  res.json(
    courseInstances.map((c) => {
      const session = sessionByCourseInstance.get(c.id);
      return {
        courseInstanceId: c.id,
        courseName: c.courseName,
        batchId: c.batchId,
        academicYear: c.academicYear,
        studentCount: c.studentIds.length,
        todaySession: session ? toPlainObject(session) : null,
      };
    })
  );
});

export const getRoster = asyncHandler(async (req: AuthRequest, res: Response) => {
  const courseInstanceId = req.query.courseInstanceId;
  if (typeof courseInstanceId !== 'string' || !courseInstanceId) {
    throw new AppError('courseInstanceId is required', 400, 'VALIDATION_ERROR');
  }
  const attendanceDate =
    typeof req.query.date === 'string' && req.query.date ? requireDate(req.query.date, 'date') : formatDate();

  const courseInstance = await loadOwnedCourseInstance(req, courseInstanceId);

  const students = await Student.find(
    scopedFilter(req, { id: { $in: courseInstance.studentIds } })
  ).sort({ name: 1 });

  const session = await AttendanceSession.findOne(
    scopedFilter(req, { courseInstanceId, attendanceDate })
  );
  const records = session
    ? await AttendanceRecord.find({ attendanceSessionId: session.id })
    : [];
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  res.json({
    courseInstanceId,
    courseName: courseInstance.courseName,
    attendanceDate,
    session: session ? toPlainObject(session) : null,
    roster: students.map((s) => {
      const record = recordByStudent.get(s.id);
      return {
        studentId: s.id,
        name: s.name,
        avatar: s.avatar,
        status: record?.status ?? null,
        publicNote: record?.publicNote ?? null,
      };
    }),
  });
});

export const saveAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);

  const courseInstanceId = getRequiredId(body, 'courseInstanceId');
  const attendanceDate = requireDate(body.attendanceDate, 'attendanceDate');
  const rawRecords = body.records;
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    throw new AppError('records must be a non-empty array', 400, 'VALIDATION_ERROR');
  }
  if (rawRecords.length > 500) {
    throw new AppError('records contains too many entries', 400, 'VALIDATION_ERROR');
  }

  const courseInstance = await loadOwnedCourseInstance(req, courseInstanceId);
  const rosterIds = new Set(courseInstance.studentIds);

  const parsedRecords = rawRecords.map((raw, index) => {
    const entry = ensurePlainObject(raw, `records[${index}]`);
    rejectMongoOperators(entry, `records[${index}]`);
    const studentId = getRequiredId(entry, 'studentId');
    if (!rosterIds.has(studentId)) {
      throw new AppError(`Student ${studentId} is not enrolled in this class`, 400, 'VALIDATION_ERROR');
    }
    if (!isAttendanceStatus(entry.status)) {
      throw new AppError(`records[${index}].status is invalid`, 400, 'VALIDATION_ERROR');
    }
    const publicNote = getOptionalString(entry, 'publicNote', { max: 500 });
    const teacherInternalNote = getOptionalString(entry, 'teacherInternalNote', { max: 500 });
    return { studentId, status: entry.status, publicNote, teacherInternalNote };
  });

  const institutionId = courseInstance.institutionId;

  // Two identical saves can race on the upsert: one inserts, the other hits the
  // unique index (E11000). Retrying once finds the inserted document and updates it.
  const session = await retryOnDuplicateKey(() => AttendanceSession.findOneAndUpdate(
    { institutionId, courseInstanceId, attendanceDate },
    {
      $setOnInsert: {
        id: generateAttendanceSessionId(),
        institutionId,
        courseInstanceId,
        batchId: courseInstance.batchId,
        teacherId: req.user!.id,
        attendanceDate,
        status: 'draft',
      },
    },
    { upsert: true, new: true }
  ));
  if (!session) throw new AppError('Failed to create attendance session', 500, 'INTERNAL_ERROR');
  // Submitted attendance is final for teachers; school admins can still correct it.
  if (session.status === 'submitted' && !['admin', 'enara-admin'].includes(req.user!.role)) {
    throw new AppError('Attendance for this day was already submitted', 409, 'ATTENDANCE_SUBMITTED');
  }

  const now = new Date();
  await retryOnDuplicateKey(() => AttendanceRecord.bulkWrite(
    parsedRecords.map((record) => {
      const setFields: Record<string, unknown> = {
        status: record.status,
        markedBy: req.user!.id,
        markedAt: now,
      };
      const unsetFields: Record<string, ''> = {};
      if (record.publicNote !== undefined) setFields.publicNote = record.publicNote;
      else unsetFields.publicNote = '';
      if (record.teacherInternalNote !== undefined) setFields.teacherInternalNote = record.teacherInternalNote;
      else unsetFields.teacherInternalNote = '';

      return {
        updateOne: {
          filter: { attendanceSessionId: session.id, studentId: record.studentId },
          update: {
            $set: setFields,
            $setOnInsert: {
              id: generateAttendanceRecordId(),
              attendanceSessionId: session.id,
              studentId: record.studentId,
            },
            ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
          },
          upsert: true,
        },
      };
    })
  ));

  const records = await AttendanceRecord.find({ attendanceSessionId: session.id });
  res.json({
    session: toPlainObject(session),
    records: records.map((r) => toPlainObject(r)),
    summary: summarizeRecords(records),
  });
});

export const submitAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await AttendanceSession.findOne(scopedFilter(req, { id: req.params.sessionId }));
  if (!session) throw new AppError('Attendance session not found', 404);
  if (req.user!.role === 'teacher') {
    await loadOwnedCourseInstance(req, session.courseInstanceId);
  }

  session.status = 'submitted';
  session.submittedAt = new Date();
  await session.save();

  const records = await AttendanceRecord.find({ attendanceSessionId: session.id });
  res.json({
    session: toPlainObject(session),
    records: records.map((r) => toPlainObject(r)),
    summary: summarizeRecords(records),
  });
});

export const listAttendanceHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = scopedFilter(req, {});
  if (req.user!.role === 'teacher') filter.teacherId = req.user!.id;

  const courseInstanceId = req.query.courseInstanceId;
  if (typeof courseInstanceId === 'string' && courseInstanceId) {
    filter.courseInstanceId = courseInstanceId;
  }
  const from = req.query.from;
  const to = req.query.to;
  if ((typeof from === 'string' && from) || (typeof to === 'string' && to)) {
    const range: Record<string, string> = {};
    if (typeof from === 'string' && from) range.$gte = requireDate(from, 'from');
    if (typeof to === 'string' && to) range.$lte = requireDate(to, 'to');
    filter.attendanceDate = range;
  }

  const sessions = await AttendanceSession.find(filter).sort({ attendanceDate: -1 }).limit(200);
  const allRecords = await AttendanceRecord.find({
    attendanceSessionId: { $in: sessions.map((s) => s.id) },
  });
  const recordsBySession = new Map<string, typeof allRecords>();
  for (const record of allRecords) {
    const list = recordsBySession.get(record.attendanceSessionId) || [];
    list.push(record);
    recordsBySession.set(record.attendanceSessionId, list);
  }

  const courseInstances = await CourseInstance.find({
    id: { $in: sessions.map((s) => s.courseInstanceId) },
  });
  const courseNameById = new Map(courseInstances.map((c) => [c.id, c.courseName]));

  res.json(
    sessions.map((session) => {
      const records = recordsBySession.get(session.id) || [];
      return {
        ...toPlainObject(session),
        courseName: courseNameById.get(session.courseInstanceId) || null,
        summary: summarizeRecords(records),
      };
    })
  );
});

export const getAttendanceSessionDetail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await AttendanceSession.findOne(scopedFilter(req, { id: req.params.sessionId }));
  if (!session) throw new AppError('Attendance session not found', 404);
  if (req.user!.role === 'teacher') {
    await loadOwnedCourseInstance(req, session.courseInstanceId);
  }

  const records = await AttendanceRecord.find({ attendanceSessionId: session.id });
  const students = await Student.find({ id: { $in: records.map((r) => r.studentId) } });
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseInstance = await CourseInstance.findOne({ id: session.courseInstanceId });

  res.json({
    session: toPlainObject(session),
    courseName: courseInstance?.courseName || null,
    summary: summarizeRecords(records),
    records: records.map((r) => ({
      ...toPlainObject(r),
      studentName: studentById.get(r.studentId)?.name || r.studentId,
    })),
  });
});
