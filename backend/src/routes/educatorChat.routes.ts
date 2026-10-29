import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../auth/permissions';
import { requireInstitutionId } from '../auth/authorization';
import { isFeatureEnabled, requireFeature } from '../services/featureFlags';
import { EducatorConversation } from '../models/EducatorConversation';
import { askEducatorChat, documentsForChat, MAX_QUESTION_CHARS } from '../services/educatorChat';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';

// Grounded educator chat (P3): content:author (teachers, school admins) in a
// school with educator_chat_enabled. Never academic managers or students.
// Conversations belong to one user in one school and are only ever looked up
// by both.
const router = Router();
router.use(authMiddleware, requirePermission('content:author'), requireFeature('educator_chat_enabled'));

const own = (req: AuthRequest) => ({ institutionId: requireInstitutionId(req), userId: req.user!.id });

// Documents the caller may choose, with whether each is eligible and why not.
router.get('/documents', asyncHandler(async (req: AuthRequest, res: Response) => {
  requireInstitutionId(req);
  const docs = await documentsForChat(req);
  const analyticsEnabled = (req.user!.role === 'teacher' || req.user!.role === 'admin') && (await isFeatureEnabled(req.user!.institutionId, 'educator_analytics_enabled'));
  res.json({ documents: docs.map(({ institutionId: _i, ...d }) => d), maxQuestionChars: MAX_QUESTION_CHARS, analyticsEnabled });
}));

router.get('/conversations', asyncHandler(async (req: AuthRequest, res: Response) => {
  const list = await EducatorConversation.find(own(req)).select('id title updatedAt').sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ conversations: list.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })) });
}));

router.get('/conversations/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const c = await EducatorConversation.findOne({ ...own(req), id: String(req.params.id) }).lean();
  if (!c) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  res.json({ conversation: { id: c.id, title: c.title, messages: c.messages, updatedAt: c.updatedAt } });
}));

router.delete('/conversations/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const r = await EducatorConversation.deleteOne({ ...own(req), id: String(req.params.id) });
  if (!r.deletedCount) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  res.status(204).end();
}));

router.post('/ask', asyncHandler(async (req: AuthRequest, res: Response) => {
  requireInstitutionId(req);
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;
  res.json(await askEducatorChat(req, { conversationId, uploadIds: body.uploadIds, question: body.question, classId: body.classId, studentId: body.studentId }));
}));

export default router;
