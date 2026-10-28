import { Router } from 'express';
import { confirmPasswordResetHandler, createUser, demoLogin, login, register, requestPasswordResetHandler } from '../controllers/auth.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/demo-login', demoLogin);
router.post('/password-reset/request', requestPasswordResetHandler);
router.post('/password-reset/confirm', confirmPasswordResetHandler);
router.post('/users', authMiddleware, requireRole('admin', 'enara-admin'), createUser);

export default router;
