import { Router } from 'express';
import { getAgeBands, setClassAgeBand, setStudentAgeBand } from '../controllers/learnerAgeBand.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

// Trusted learner age band (Option B). Workspace Admin writes; Academic
// Manager reads; no other role (teachers, students, ENARA staff accounts
// without a school) has a route here.
const router = Router();
router.use(authMiddleware);
router.get('/', requireRole('admin', 'academic_manager'), getAgeBands);
router.put('/students/:id', requireRole('admin'), setStudentAgeBand);
router.put('/classes/:id', requireRole('admin'), setClassAgeBand);
export default router;
