import { Router, type Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { AppError, asyncHandler } from '../../../middleware/errorHandler';
import { ensurePlainObject, getOptionalBoolean, getOptionalString, getRequiredString, rejectMongoOperators } from '../../../utils/validation';
import { LmsPlatform, type ILmsPlatform } from '../models';
import { checkConnection, importForPlatform, listQuizzes, moodleQuizOn, saveToken, setEnabled, setQuizMap, settingsView } from '../core/moodleQuiz';
import { MoodleQuizWsError } from '../core/moodleQuizWs';

// Errors to work on from Moodle's own quizzes: the school admin's settings for one LMS connection (own school only; ENARA admins any).
// Mounted on the LMS admin router after its authMiddleware + requireAdmin. Every route answers 404 while the switch is off.
// The token is write-only: accepted in a PUT body, stored encrypted, never returned.
export const moodleQuizRouter = Router();

async function own(req: AuthRequest): Promise<ILmsPlatform> {
  if (!moodleQuizOn()) throw new AppError('Not found', 404, 'NOT_FOUND');
  const id = String(req.params.id);
  const filter = req.user?.role === 'enara-admin' ? { id } : { id, institutionId: req.user!.institutionId ?? '__none__' };
  const p = await LmsPlatform.findOne(filter).lean();
  if (!p) throw new AppError('LMS connection not found', 404, 'LMS_PLATFORM_NOT_FOUND');
  return p;
}
const wsError = (error: unknown) => {
  if (error instanceof MoodleQuizWsError) throw new AppError('Moodle could not be read', 502, `MOODLE_${error.code.toUpperCase()}`.slice(0, 60));
  throw error;
};

moodleQuizRouter.get('/platforms/:id/moodle-quiz', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  res.json(await settingsView(p.id));
}));

moodleQuizRouter.put('/platforms/:id/moodle-quiz/token', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  const body = ensurePlainObject(req.body ?? {}); rejectMongoOperators(body);
  if (body.token === null) { await saveToken(p, null, req.user!.id); res.json(await settingsView(p.id)); return; }
  const token = getRequiredString(body, 'token', { max: 200 });
  if (!/^[A-Za-z0-9]{16,128}$/.test(token)) throw new AppError('This does not look like a Moodle web-service token', 400, 'VALIDATION_ERROR');
  const r = await saveToken(p, token, req.user!.id);
  res.json({ ...(await settingsView(p.id)), check: r.check });
}));

moodleQuizRouter.put('/platforms/:id/moodle-quiz', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  const body = ensurePlainObject(req.body ?? {}); rejectMongoOperators(body);
  const enabled = getOptionalBoolean(body, 'enabled');
  if (enabled === undefined) throw new AppError('enabled is required', 400, 'VALIDATION_ERROR');
  await setEnabled(p, enabled, req.user!.id);
  res.json(await settingsView(p.id));
}));

moodleQuizRouter.post('/platforms/:id/moodle-quiz/check', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  res.json({ check: await checkConnection(p, req.user!.id) });
}));

moodleQuizRouter.get('/platforms/:id/moodle-quiz/quizzes', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  try { res.json({ quizzes: await listQuizzes(p) }); } catch (error) { wsError(error); }
}));

moodleQuizRouter.put('/platforms/:id/moodle-quiz/quizzes/:quizId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  const quizId = String(req.params.quizId);
  if (!/^\d{1,12}$/.test(quizId)) throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR');
  const body = ensurePlainObject(req.body ?? {}); rejectMongoOperators(body);
  const courseExternalId = getRequiredString(body, 'courseExternalId', { max: 40 });
  const objectiveId = body.objectiveId === null ? null : getOptionalString(body, 'objectiveId', { max: 80 }) ?? null;
  const rawSlots = Array.isArray(body.slotObjectives) ? body.slotObjectives : [];
  if (rawSlots.length > 200) throw new AppError('Too many slots', 400, 'VALIDATION_ERROR');
  const slotObjectives = rawSlots.map((x, i) => {
    const o = ensurePlainObject(x, `slotObjectives[${i}]`);
    const slot = Number(o.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 1000) throw new AppError('Invalid slot', 400, 'VALIDATION_ERROR');
    return { slot, objectiveId: getRequiredString(o, 'objectiveId', { max: 80 }) };
  });
  // Every objective must be an approved objective of this school.
  const ids = [...new Set([objectiveId, ...slotObjectives.map((s) => s.objectiveId)].filter(Boolean))] as string[];
  if (ids.length) {
    const { LearningObjective } = await import('../../../models/LearningObjective');
    const found = await LearningObjective.countDocuments({ id: { $in: ids }, institutionId: p.institutionId, status: { $ne: 'archived' } });
    if (found !== ids.length) throw new AppError('Unknown objective', 400, 'VALIDATION_ERROR');
  }
  await setQuizMap(p, { quizId, courseExternalId, quizName: getOptionalString(body, 'quizName', { max: 120 }), objectiveId, slotObjectives }, req.user!.id);
  res.json({ ok: true });
}));

/** Runs the import for this connection now (the nightly job does the same for every connection that is on). */
moodleQuizRouter.post('/platforms/:id/moodle-quiz/run', asyncHandler(async (req: AuthRequest, res: Response) => {
  const p = await own(req);
  const r = await importForPlatform(p, { budgetMs: 20_000 });
  // Learner ids only for ENARA admins (the E2E check); a school admin gets the counts.
  const { students, ...counts } = r;
  res.json(req.user?.role === 'enara-admin' ? { ...counts, students } : counts);
}));
