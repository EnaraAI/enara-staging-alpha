import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { SessionSummary } from '../models/LearnerMemory';
import { resolveStudentForRead } from '../services/learningAccess';
import {
  getProfile, habitsFor, learnerProfileOn, parseAccommodations, parseFirstLanguage, parseInterests, sessionMemoryOn, setProfileField, whatWorksFor, whatWorksOn,
} from '../services/learnerMemory';
import { ensurePlainObject } from '../utils/validation';

// Learner memory phases 2-4 (each 404 while its ENARA_ENGINE_V2 switch is off). Reads: the learner ('me'), teachers of their classes, school admins.
// Writes: first language and accommodations by school admins only; interests by school admins, the learner, or a parent (parents routes).
const off = () => new AppError('Not found', 404, 'NOT_FOUND');
const staffOnly = (req: AuthRequest) => { if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN'); };

export const listSessionSummaries = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!sessionMemoryOn()) throw off();
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const rows = await SessionSummary.find({ studentId: student.id }).sort({ endedAt: -1 }).limit(20).lean();
  res.json({ sessions: rows.map((r) => ({ sessionId: r.sessionId, startedAt: r.startedAt, endedAt: r.endedAt, objectiveId: r.objectiveId ?? null, right: r.right, wrong: r.wrong, stuckOn: r.stuckOn ?? null, stoppedWithOpenItem: r.stoppedWithOpenItem, nextStep: r.nextStep })) });
});

export const getLearnerProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!learnerProfileOn()) throw off();
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const p = await getProfile(student.id);
  res.json(req.user!.role === 'student' ? { interests: p.interests, options: { interests: p.options.interests } } : p);
});

export const updateLearnerProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!learnerProfileOn()) throw off();
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const role = req.user!.role;
  const body = ensurePlainObject(req.body);
  const actor = { id: req.user!.id, role };
  let out = await getProfile(student.id);
  if ('interests' in body) {
    if (role === 'teacher') throw new AppError('Interests are chosen by the learner, a parent or a school admin', 403, 'FORBIDDEN');
    const v = body.interests === null ? [] : parseInterests(body.interests);
    if (!v) throw new AppError('interests: up to 5 of the listed codes', 400, 'VALIDATION_ERROR');
    out = await setProfileField(student.id, student.institutionId, 'interests', v, actor);
  }
  for (const field of ['firstLanguage', 'accommodations'] as const) {
    if (!(field in body)) continue;
    if (role !== 'admin' && role !== 'enara-admin') throw new AppError('Only a school admin can set this', 403, 'FORBIDDEN');
    const v = field === 'firstLanguage' ? parseFirstLanguage(body.firstLanguage) : body.accommodations === null ? [] : parseAccommodations(body.accommodations);
    if (v === undefined) throw new AppError(`${field}: use one of the listed codes`, 400, 'VALIDATION_ERROR');
    out = await setProfileField(student.id, student.institutionId, field, v, actor);
  }
  res.json(role === 'student' ? { interests: out.interests } : out);
});

export const getStudyHabits = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!learnerProfileOn()) throw off();
  staffOnly(req);
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  res.json({ habits: await habitsFor(student.id) });
});

export const getWhatWorks = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!whatWorksOn()) throw off();
  staffOnly(req);
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  res.json(await whatWorksFor(student.id));
});
