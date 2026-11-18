import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { classStudentIds } from '../services/learningAccess';
import { gradeHistory, gradeLedgerOn } from '../services/gradeLedger';
import { ensurePlainObject, getRequiredString, rejectMongoOperators } from '../utils/validation';
import { loadAssignmentForStaff } from './assignments.controller';

// Grade ledger (docs/lms/GRADE_LEDGER_NOTES.md), teacher side:
//   GET  /api/assignments/:id/students/:studentId/grade-history
//   POST /api/assignments/:id/students/:studentId/lms-decision { resourceLinkId, keep: 'lms' | 'enara' }
// The teacher of the class, a school admin (own school) or an ENARA admin
// (loadAssignmentForStaff: another school's or another class's assignment is
// a 404). Read-only history: there is no route that changes or deletes a
// ledger or sync log entry. Both routes are the normal 404 while
// GRADE_LEDGER_ENABLED is off.

export function requireGradeLedger(_req: Request, _res: Response, next: NextFunction) {
  if (gradeLedgerOn()) next();
  else next('route');
}

async function loadStudentOnAssignment(req: AuthRequest) {
  const assignment = await loadAssignmentForStaff(req, String(req.params.id));
  const studentId = String(req.params.studentId);
  const cls = await CourseInstance.findOne({ id: assignment.classId }).lean();
  const members = assignment.studentIds?.length ? assignment.studentIds : cls ? await classStudentIds(cls) : [];
  const hasAttempts = await AssessmentAttempt.exists({ assignmentId: assignment.id, studentId, institutionId: assignment.institutionId });
  if (!members.includes(studentId) && !hasAttempts) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  const student = await Student.findOne({ id: studentId, institutionId: assignment.institutionId }).select('id name').lean();
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  return { assignment, student };
}

export const getGradeHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { assignment, student } = await loadStudentOnAssignment(req);
  const history = await gradeHistory({ id: assignment.id, institutionId: assignment.institutionId }, student.id);
  const { passbackOn } = await import('../integrations/lms/core/outbox');
  // Who: staff names for the user IDs in the history ('system' and 'student' need none).
  const ids = [...new Set([...history.entries.map((e) => e.actor), ...history.lms.map((s) => s.resolvedBy ?? '')])].filter((id) => Types.ObjectId.isValid(id) && id.length === 24);
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name role').lean() : [];
  res.json({
    actors: Object.fromEntries(users.map((u) => [u._id.toString(), { name: u.name, role: u.role }])),
    assignment: { id: assignment.id, title: assignment.title, classId: assignment.classId },
    student: { id: student.id, name: student.name },
    ...history,
    lmsDecisions: passbackOn(),
  });
});

export const decideLmsValue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { assignment, student } = await loadStudentOnAssignment(req);
  const resourceLinkId = getRequiredString(body, 'resourceLinkId', { max: 80 });
  const keep = body.keep;
  if (keep !== 'lms' && keep !== 'enara') throw new AppError('keep must be lms or enara', 400, 'VALIDATION_ERROR');
  const { decideLmsSlot, SlotDecisionError } = await import('../integrations/lms/core/lmsResults');
  try {
    const out = await decideLmsSlot({ institutionId: assignment.institutionId, assignmentId: assignment.id, studentId: student.id, resourceLinkId }, keep, req.user!.id);
    res.json({ resolution: out.resolution, queued: out.jobIds.length });
  } catch (error) {
    if (error instanceof SlotDecisionError) {
      if (error.code === 'not_differing') throw new AppError('This grade no longer waits for a decision', 409, 'NOT_DIFFERING');
      throw new AppError('Not found', 404, 'NOT_FOUND');
    }
    throw error;
  }
});
