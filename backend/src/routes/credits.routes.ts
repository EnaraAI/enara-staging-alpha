import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
import { getCreditsReport } from '../controllers/credits.controller';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', getCreditsReport);

export default router;
