import express, { Router, Response } from 'express';
import { isDemoRole } from '../config/demo';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { buildDemoTemplate } from '../services/demoTemplate';
import {
  demoHeartbeat,
  demoStatus,
  endDemoSessionByToken,
  startDemoSession,
  sweepDemoSessions,
  switchDemoRole,
  templateToken,
} from '../services/demoSandbox';

// Partner demo: one-click sign-in into a fresh demo school (see services/demoSandbox.ts).
const router = Router();
const role = (value: unknown) => {
  if (!isDemoRole(value)) throw new AppError('role must be student, teacher or admin', 400, 'VALIDATION_ERROR');
  return value;
};

// Public: whether the demo can be started now.
router.get('/status', asyncHandler(async (_req, res: Response) => {
  const s = await demoStatus();
  res.json({ available: s.ready && !s.full, full: s.full });
}));

// Public: one click starts a new demo school and signs in as the chosen role.
router.post('/start', asyncHandler(async (req, res: Response) => {
  const out = await startDemoSession(role((req.body as { role?: unknown })?.role), req.ip || '');
  res.status(201).json(out);
}));

router.post('/switch', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await switchDemoRole(req.user!.institutionId, role((req.body as { role?: unknown })?.role)));
}));

router.post('/heartbeat', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await demoHeartbeat(req.user!.institutionId));
}));

// Sent by the browser as it closes the demo (navigator.sendBeacon can't set
// headers, so the token comes in the body as text or JSON).
router.post('/end', express.text({ type: ['text/plain', 'application/json'], limit: '4kb' }), asyncHandler(async (req, res: Response) => {
  const header = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  let token = header;
  if (!token && typeof req.body === 'string') {
    try {
      token = String((JSON.parse(req.body) as { token?: unknown }).token || '');
    } catch {
      token = req.body.trim();
    }
  } else if (!token && req.body && typeof req.body === 'object') token = String((req.body as { token?: unknown }).token || '');
  if (token) await endDemoSessionByToken(token);
  res.status(204).end();
}));

// Enara admins: build the template, open its accounts, see usage, clean up.
router.get('/admin/status', authMiddleware, requireRole('enara-admin'), asyncHandler(async (_req, res: Response) => { res.json(await demoStatus()); }));
router.post('/admin/template', authMiddleware, requireRole('enara-admin'), asyncHandler(async (_req, res: Response) => { res.json(await buildDemoTemplate()); }));
router.post('/admin/template-token', authMiddleware, requireRole('enara-admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await templateToken(role((req.body as { role?: unknown })?.role)));
}));
router.post('/admin/sweep', authMiddleware, requireRole('enara-admin'), asyncHandler(async (_req, res: Response) => { res.json(await sweepDemoSessions()); }));

export default router;
