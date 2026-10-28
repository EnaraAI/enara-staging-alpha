import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, scopedFilter } from '../auth/authorization';
import { CourseInstance } from '../models/CourseInstance';
import { Curriculum } from '../models/Curriculum';
import { LearningObjective } from '../models/LearningObjective';

// Who may see and change learning-intelligence configuration:
// - school admins: their own school; Enara admins: any school;
// - teachers: curricula used by a class they instruct (CourseInstance.instructorIds);
// - students: never (they read their own results through /me-style routes).

export async function teacherCurriculumIds(req: AuthRequest): Promise<string[]> {
  const classes = await CourseInstance.find({
    institutionId: req.user!.institutionId,
    instructorIds: req.user!.id,
  })
    .select('curriculumId')
    .lean();
  return [...new Set(classes.map((c) => c.curriculumId).filter(Boolean))] as string[];
}

export async function loadCurriculumForStaff(req: AuthRequest, curriculumId: string) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'enara-admin' && role !== 'teacher') {
    throw new AppError('Staff access required', 403, 'FORBIDDEN');
  }
  const curriculum = await Curriculum.findOne(scopedFilter(req, { id: curriculumId }));
  if (!curriculum) throw new AppError('Curriculum not found', 404, 'CURRICULUM_NOT_FOUND');
  if (role === 'teacher' && !(await teacherCurriculumIds(req)).includes(curriculum.id)) {
    throw new AppError('You do not teach a class using this curriculum', 403, 'FORBIDDEN');
  }
  if (!curriculum.institutionId && !isGlobalAdmin(req)) {
    throw new AppError('Curriculum not found', 404, 'CURRICULUM_NOT_FOUND');
  }
  return curriculum;
}

export async function loadObjectiveForStaff(req: AuthRequest, objectiveId: string) {
  const objective = await LearningObjective.findOne(scopedFilter(req, { id: objectiveId }));
  if (!objective) throw new AppError('Objective not found', 404, 'OBJECTIVE_NOT_FOUND');
  const curriculum = await loadCurriculumForStaff(req, objective.curriculumId);
  return { objective, curriculum };
}

// Questions may only be tagged with live objectives of the same school.
export async function assertObjectivesUsable(objectiveIds: string[], institutionId: string | undefined) {
  if (!objectiveIds.length) return;
  const found = await LearningObjective.countDocuments({
    id: { $in: objectiveIds },
    institutionId,
    status: { $ne: 'archived' },
  });
  if (found !== new Set(objectiveIds).size) {
    throw new AppError('Unknown or archived learning objective', 400, 'VALIDATION_ERROR');
  }
}

// Which student a /students/:studentId route may read, or 403/404.
// - student: only themselves ('me' or their own id);
// - teacher: students in a class they instruct;
// - admin: students of their school; enara-admin: any.
export async function resolveStudentForRead(req: AuthRequest, studentIdParam: string) {
  const { Student } = await import('../models/Student');
  const { getEnrolledInstances } = await import('./studentCourseService');
  const user = req.user!;
  const studentId = studentIdParam === 'me' ? user.studentId : studentIdParam;
  if (!studentId) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  if (user.role === 'student') {
    if (studentId !== user.studentId) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  }
  const student = await Student.findOne(user.role === 'enara-admin' ? { id: studentId } : { id: studentId, institutionId: user.institutionId })
    .select('id name institutionId batchId')
    .lean();
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  if (user.role === 'teacher') {
    const classes = await getEnrolledInstances(studentId);
    if (!classes.some((c) => (c.instructorIds || []).includes(user.id))) {
      throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
    }
  }
  return student;
}

// The class (course instance) a staff member may look at: teachers only their
// own, admins their school's, Enara admins any.
export async function loadClassForStaff(req: AuthRequest, classId: string) {
  const user = req.user!;
  if (!['teacher', 'admin', 'enara-admin'].includes(user.role)) throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const cls = await CourseInstance.findOne(user.role === 'enara-admin' ? { id: classId } : { id: classId, institutionId: user.institutionId }).lean();
  if (!cls || (user.role === 'teacher' && !(cls.instructorIds || []).includes(user.id))) {
    throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
  }
  return cls;
}

// Students in a class: listed explicitly or through its batch.
export async function classStudentIds(cls: { studentIds?: string[]; batchId?: string; institutionId?: string }) {
  const { Student } = await import('../models/Student');
  const inBatch = cls.batchId
    ? await Student.find({ batchId: cls.batchId, ...(cls.institutionId ? { institutionId: cls.institutionId } : {}) }).select('id').lean()
    : [];
  return [...new Set([...(cls.studentIds || []), ...inBatch.map((s) => s.id)])];
}
