import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ErrorToWorkOn } from '../models/ErrorToWorkOn';
import { resolveStudentForRead } from '../services/learningAccess';
import { dismissError, listForStudent, workOnOn } from '../services/errorsToWorkOn';
import { ensurePlainObject, getOptionalString } from '../utils/validation';

// Learner memory phase 1 (behind ENARA_ENGINE_V2 workOn): a learner's "errors to work on".
// GET   /api/learning/students/:studentId/errors-to-work-on  teacher (own classes), admin (own school), the learner ('me')
// PATCH /api/learning/errors-to-work-on/:id                  staff only: { status: 'dismissed', note? }
const off = () => new AppError('Not found', 404, 'NOT_FOUND');

export const listErrorsToWorkOn = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!workOnOn()) throw off();
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const items = await listForStudent(student.id, student.institutionId);
  const isStudent = req.user!.role === 'student';
  res.json({ errors: isStudent ? items.filter((i) => i.status !== 'dismissed').map(({ sources, ...rest }) => rest) : items });
});

export const updateErrorToWorkOn = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!workOnOn()) throw off();
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const body = ensurePlainObject(req.body);
  if (body.status !== 'dismissed') throw new AppError('status must be dismissed', 400, 'VALIDATION_ERROR');
  const note = getOptionalString(body, 'note', { max: 120 });
  const row = await ErrorToWorkOn.findOne({ id: String(req.params.id) }).lean();
  if (!row) throw new AppError('Not found', 404, 'NOT_FOUND');
  await resolveStudentForRead(req, row.studentId); // same school / own class, as for misconceptions
  const done = await dismissError(row.id, req.user!.id, row.institutionId, note);
  res.json({ id: done?.id, status: done?.status });
});
