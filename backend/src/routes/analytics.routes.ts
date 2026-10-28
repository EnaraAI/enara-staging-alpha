import { Router } from 'express';
import { listSchoolEvents } from '../controllers/learningEvents.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../auth/permissions';
import { askAssistant, getAiUsage, getCourseAnalytics, getOverview, getStudentAnalytics, getWeeklySummary, previewReminders } from '../controllers/analytics.controller';

const router = Router();

// School-wide analytics (P1): insights:read_school (admins, academic managers).
// Internal provider costs need cost:internal on top (ai-usage strips them).
router.use(authMiddleware, requirePermission('insights:read_school'));

router.get('/overview', getOverview);
router.get('/ai-usage', getAiUsage);
router.get('/events', listSchoolEvents);
router.post('/assistant', askAssistant);
router.get('/weekly-summary', getWeeklySummary);
router.get('/reminders/preview', previewReminders);
router.get('/courses/:id', getCourseAnalytics);
router.get('/students/:id', getStudentAnalytics);

export default router;
