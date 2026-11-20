import { Router, Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ensurePlainObject } from '../utils/validation';
import { missingForSchool, onboardingFor, parseBirthDate, parseGoal, requestsFor, setBirthDate, setGoal, skipGoal } from '../services/learnerSignals';

// planner2 learner signals (goal, birth date). Students: their own goal only (teen/adult), never their age.
// School: Workspace Admin writes, Academic Manager reads. Parents: see /api/parents/learners/:id/signals.
const router = Router();
router.use(authMiddleware);
const h = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncHandler(fn as never);
const tenantOf = (req: AuthRequest): string => {
  const id = req.user?.institutionId;
  if (!id) throw new AppError('This account is not attached to a school', 403, 'NO_INSTITUTION');
  return id;
};
const me = (req: AuthRequest) => {
  const id = req.user?.studentId;
  if (!id) throw new AppError('Student access required', 403, 'STUDENT_REQUIRED');
  return id;
};

router.get('/me', requireRole('student'), h(async (req, res) => { res.json(await onboardingFor(me(req))); }));
router.put('/me/goal', requireRole('student'), h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  res.json(await setGoal(me(req), parseGoal(body.goal), 'student', req.user!));
}));
router.post('/me/goal/skip', requireRole('student'), h(async (req, res) => { res.json(await skipGoal(me(req))); }));

router.get('/missing', requireRole('admin', 'academic_manager'), h(async (req, res) => { res.json(await missingForSchool(tenantOf(req))); }));
router.get('/students/:id', requireRole('admin', 'academic_manager'), h(async (req, res) => { res.json(await requestsFor(String(req.params.id), tenantOf(req))); }));
router.put('/students/:id/goal', requireRole('admin'), h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  res.json(await setGoal(String(req.params.id), body.goal === null ? null : parseGoal(body.goal), 'school', req.user!, tenantOf(req)));
}));
router.put('/students/:id/birth-date', requireRole('admin'), h(async (req, res) => {
  const body = ensurePlainObject(req.body);
  res.json(await setBirthDate(String(req.params.id), body.birthDate === null ? null : parseBirthDate(body.birthDate), 'school', req.user!, tenantOf(req)));
}));
export default router;
