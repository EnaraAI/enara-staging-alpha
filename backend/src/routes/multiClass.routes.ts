import { Router, type Response } from 'express';
import { authMiddleware, requireAdmin, requireStudent, type AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';
import { addMembership, multiClassOn, myClasses, removeMembership, setCurrentClass, studentMemberships } from '../services/multiClass';

// Multi-class step 6 (docs/multi-class/STEP_6_NOTES.md). Everything here is
// behind ENROLLMENT_MULTI_CLASS: with it off, /status says so and every other
// route answers 404 FEATURE_DISABLED (students: { enabled: false }).
const router = Router();

// Any signed-in user: whether multi-class is in effect (the screens show the
// "add to group/class" and class switcher only when it is).
router.get('/status', authMiddleware, (_req, res) => {
  res.json({ multiClass: multiClassOn() });
});

// Student app (Q2): my classes, the current one, and the switcher.
router.get('/me/classes', authMiddleware, requireStudent, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await myClasses(req.user!.studentId!));
}));
router.put('/me/classes/current', authMiddleware, requireStudent, asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  res.json(await setCurrentClass(req.user!.studentId!, body.classId));
}));

// School admins (their school) and Enara admins (the student's school).
router.get('/students/:id/enrollments', authMiddleware, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await studentMemberships(req as never, String(req.params.id)));
}));
router.post('/students/:id/enrollments', authMiddleware, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  res.status(201).json(await addMembership(req as never, String(req.params.id), body));
}));
router.delete('/students/:id/enrollments/:scope/:targetId', authMiddleware, requireAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await removeMembership(req as never, String(req.params.id), req.params.scope, req.params.targetId));
}));

export default router;
