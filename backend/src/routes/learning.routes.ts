import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MongoRateLimitStore } from '../services/mongoRateLimitStore';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { getFlags, getLearningSettings, setFlags, setLearningSettings } from '../controllers/learningFlags.controller';
import {
  answerDiagnostic,
  completeDiagnostic,
  getDiagnostic,
  getDiagnosticReport,
  listStudentDiagnostics,
  startDiagnostic,
} from '../controllers/learningDiagnostics.controller';
import { listStudentMisconceptions, updateMisconception } from '../controllers/learningMisconceptions.controller';
import {
  cancelIntervention,
  completeIntervention,
  createIntervention,
  getInterventionOutcomes,
  listStudentInterventions,
  reassessIntervention,
  startIntervention,
} from '../controllers/learningInterventions.controller';
import { getTtuAnalytics, listStrategies } from '../controllers/learningPedagogy.controller';
import { getClassInsights, getPathway, getRecommendations, getRetention, listClasses } from '../controllers/learningInsights.controller';
import {
  approveObjective,
  createObjective,
  extractObjectives,
  getObjective,
  getObjectivePrerequisites,
  listObjectives,
  listObjectiveQuestions,
  setObjectiveQuestions,
  updateObjective,
} from '../controllers/learningObjectives.controller';
import { getCurriculumProcessing, getSchoolAnalytics, getShadowComparison, processCurriculum } from '../controllers/learningAnalytics.controller';
import { blockStudentsInShadowMode, requireFeature } from '../services/featureFlags';
import { getOutcomes, getStudentTimeline } from '../controllers/outcomes.controller';
import {
  getKnowledgeMap,
  getStudentMastery,
  getStudentObjectiveMastery,
  invalidateEvidenceRecord,
  recomputeStudentMastery,
} from '../controllers/learningMastery.controller';

// Enara Learning Intelligence Engine (Phase 2). Everything except the flag
// endpoints needs the school's learning_intelligence_enabled flag.
const router = Router();

router.use(authMiddleware);
// Per signed-in user (after authentication, so tokens can't be varied to
// dodge it). 240 requests a minute is far above a diagnostic's pace.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    store: new MongoRateLimitStore('learning-user'),
    passOnStoreError: true,
    keyGenerator: (req) => `user:${(req as AuthRequest).user!.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' }, message: 'Too many requests' },
  }),
);
router.use(blockStudentsInShadowMode);

// P4.3 outcomes and audit timeline (connected_workflow_enabled; roles checked inside).
router.get('/analytics/outcomes', getOutcomes);
router.get('/students/:studentId/timeline', getStudentTimeline);

router.get('/flags', requireRole('admin', 'enara-admin'), getFlags);
router.put('/flags', requireRole('enara-admin'), setFlags);
router.get('/settings', requireRole('admin', 'enara-admin'), getLearningSettings);
router.put('/settings', requireRole('admin', 'enara-admin'), setLearningSettings);

const staff = [requireRole('teacher', 'admin', 'enara-admin'), requireFeature('learning_intelligence_enabled')];
router.get('/objectives', ...staff, listObjectives);
router.post('/objectives', ...staff, createObjective);
router.post('/objectives/extract', ...staff, extractObjectives);
router.get('/objectives/:id', ...staff, getObjective);
router.patch('/objectives/:id', ...staff, updateObjective);
router.post('/objectives/:id/approve', ...staff, approveObjective);
router.get('/objectives/:id/prerequisites', ...staff, getObjectivePrerequisites);
router.get('/objectives/:id/questions', ...staff, listObjectiveQuestions);
router.put('/objectives/:id/questions', ...staff, setObjectiveQuestions);

const mastery = [
  requireRole('student', 'teacher', 'admin', 'enara-admin'),
  requireFeature('learning_intelligence_enabled'),
  requireFeature('mastery_tracking_enabled'),
];
router.get('/students/:studentId/mastery', ...mastery, getStudentMastery);
router.get('/students/:studentId/mastery/:objectiveId', ...mastery, getStudentObjectiveMastery);
router.get('/students/:studentId/knowledge-map', ...mastery, getKnowledgeMap);
router.post('/students/:studentId/mastery/recompute', ...mastery, recomputeStudentMastery);
router.post('/evidence/:id/invalidate', ...mastery, invalidateEvidenceRecord);

const anyRole = requireRole('student', 'teacher', 'admin', 'enara-admin');
const diagnostics = [requireFeature('learning_intelligence_enabled'), requireFeature('diagnostics_enabled')];
router.post('/diagnostics', requireRole('student'), ...diagnostics, startDiagnostic);
router.get('/diagnostics/:id', anyRole, ...diagnostics, getDiagnostic);
router.post('/diagnostics/:id/answer', requireRole('student'), ...diagnostics, answerDiagnostic);
router.post('/diagnostics/:id/complete', requireRole('student'), ...diagnostics, completeDiagnostic);
router.get('/diagnostics/:id/report', anyRole, ...diagnostics, getDiagnosticReport);
router.get('/students/:studentId/diagnostics', anyRole, ...diagnostics, listStudentDiagnostics);

const misconceptions = [anyRole, requireFeature('learning_intelligence_enabled'), requireFeature('misconception_detection_enabled')];
router.get('/students/:studentId/misconceptions', ...misconceptions, listStudentMisconceptions);
router.patch('/misconceptions/:id', ...misconceptions, updateMisconception);

const pedagogy = [anyRole, requireFeature('learning_intelligence_enabled'), requireFeature('adaptive_pedagogy_enabled')];
router.get('/strategies', requireRole('teacher', 'admin', 'enara-admin'), requireFeature('learning_intelligence_enabled'), listStrategies);
router.post('/interventions', ...pedagogy, createIntervention);
router.post('/interventions/:id/start', ...pedagogy, startIntervention);
router.post('/interventions/:id/complete', ...pedagogy, completeIntervention);
router.post('/interventions/:id/cancel', ...pedagogy, cancelIntervention);
router.post('/interventions/:id/reassess', ...pedagogy, requireFeature('diagnostics_enabled'), reassessIntervention);
router.get('/interventions/:id/outcomes', ...pedagogy, getInterventionOutcomes);
router.get('/students/:studentId/interventions', ...pedagogy, listStudentInterventions);
router.get('/analytics/ttu', requireRole('teacher', 'admin', 'enara-admin'), requireFeature('learning_intelligence_enabled'), getTtuAnalytics);

const pathways = [anyRole, requireFeature('learning_intelligence_enabled'), requireFeature('learning_pathways_enabled')];
router.get('/students/:studentId/pathway', ...pathways, getPathway);
router.get('/students/:studentId/recommendations', ...pathways, getRecommendations);
router.get('/students/:studentId/retention', anyRole, requireFeature('learning_intelligence_enabled'), requireFeature('retention_intelligence_enabled'), getRetention);

const insights = [requireRole('teacher', 'admin', 'enara-admin'), requireFeature('learning_intelligence_enabled'), requireFeature('teacher_learning_insights_enabled')];
router.get('/classes', ...insights, listClasses);
router.get('/classes/:classId/insights', ...insights, getClassInsights);

router.get('/curricula/:id/processing', ...staff, getCurriculumProcessing);
router.post('/curricula/:id/process', ...staff, processCurriculum);
router.get('/analytics/shadow-comparison', requireRole('admin', 'enara-admin'), requireFeature('learning_intelligence_enabled'), getShadowComparison);
router.get('/analytics/school', requireRole('admin', 'enara-admin'), requireFeature('learning_intelligence_enabled'), getSchoolAnalytics);

export default router;
