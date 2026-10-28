import { Router } from 'express';
import multer from 'multer';
import { beginSpeaking, speakingTurn } from '../controllers/speakingExam.controller';
import { MAX_AUDIO_BYTES } from '../services/speakingExam';
import { listMyEvents, recordMyEvent } from '../controllers/learningEvents.controller';
import { answerReviewItem, getNextSteps, listReviews } from '../controllers/meProactive.controller';
import { getMyTutorFace, setMyTutorFace } from '../controllers/tutorFaces.controller';
import { authMiddleware, requireStudent } from '../middleware/auth.middleware';
import { tutorInstitutionLimiter, tutorUserLimiter } from '../middleware/aiRateLimits';
import { requireFeature } from '../services/featureFlags';
import {
  getMyAssignment,
  getMyAssignmentResult,
  appealMyResult,
  listMyAssignments,
  saveAssignmentDraft,
  startAssignmentAttempt,
  submitAssignmentAttempt,
  converseAssignmentAttempt,
} from '../controllers/meAssignments.controller';
import { getMyStudyPlan, setMyStudyItem, startTutorHandoff } from '../controllers/meStudyPlan.controller';
import {
  getMe,
  listMyCourses,
  getMyCourse,
  getMyLesson,
  completeMyLesson,
  getMyCurriculumContext,
} from '../controllers/me.controller';
import {
  listTutorSessions,
  getTutorSession,
  createTutorSession,
  deleteTutorSession,
  clearTutorSessions,
  sendTutorMessage,
} from '../controllers/tutor.controller';
import {
  streamTutorMessage,
  tutorVisualize,
  tutorTts,
} from '../controllers/tutorExtras.controller';
import {
  listMyAssessments,
  getMyAssessment,
  startAssessmentAttempt,
  submitAssessmentAttempt,
  listMyResults,
  getMyResult,
  getResultsAnalytics,
} from '../controllers/meAssessment.controller';
import {
  getDashboard,
  createStudyPlan,
  getAnalyticsOverview,
  getLearningEngine,
  getRecommendations,
  getSubjectAnalytics,
  getSubjectInsight,
  getCredits,
  getAchievements,
} from '../controllers/meDashboard.controller';

const router = Router();

router.use(authMiddleware, requireStudent);
// AI tutor: per verified user and per school (P0d).
router.use('/tutor', tutorUserLimiter(), tutorInstitutionLimiter());

// Assignments (Phase 3 teaching workflow).
const teaching = requireFeature('teaching_workflow_enabled');
router.get('/assignments', teaching, listMyAssignments);
router.get('/assignments/:id', teaching, getMyAssignment);
router.post('/assignments/:id/attempts', teaching, startAssignmentAttempt);
router.put('/assignments/:id/attempts/:attemptId/draft', teaching, saveAssignmentDraft);
router.post('/assignments/:id/attempts/:attemptId/submit', teaching, submitAssignmentAttempt);
router.post('/assignments/:id/attempts/:attemptId/conversation', teaching, converseAssignmentAttempt);
// P4 speaking exams: recorded replies go through the server (STT/TTS metered).
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5 } });
router.post('/assignments/:id/attempts/:attemptId/speaking/begin', teaching, beginSpeaking);
router.post('/assignments/:id/attempts/:attemptId/speaking/turn', teaching, tutorUserLimiter(), audioUpload.single('audio'), speakingTurn);
router.get('/assignments/:id/attempts/:attemptId/result', teaching, getMyAssignmentResult);
router.post('/assignments/:id/attempts/:attemptId/appeals', teaching, appealMyResult);
const studyPlans = requireFeature('study_plans_enabled');
router.get('/study-plan', teaching, studyPlans, getMyStudyPlan);
router.patch('/study-plan/items', teaching, studyPlans, setMyStudyItem);
router.post('/tutor/handoff', teaching, startTutorHandoff);

router.get('/', getMe);
router.get('/dashboard', getDashboard);
router.post('/study-plans', createStudyPlan);
router.get('/achievements', getAchievements);
router.get('/credits', getCredits);

router.get('/analytics/overview', getAnalyticsOverview);
router.get('/analytics/subjects', getSubjectAnalytics);
router.get('/analytics/subjects/:name', getSubjectInsight);
router.get('/analytics/assessments', getResultsAnalytics);
router.get('/learning-engine', getLearningEngine);
router.get('/recommendations', getRecommendations);

router.get('/courses', listMyCourses);
router.get('/courses/:courseId', getMyCourse);
router.get('/courses/:courseId/curriculum', getMyCurriculumContext);
router.get('/courses/:courseId/lessons/:lessonId', getMyLesson);
router.post('/courses/:courseId/lessons/:lessonId/complete', completeMyLesson);

router.get('/assessments', listMyAssessments);
router.get('/assessments/:id', getMyAssessment);
router.post('/assessments/:id/attempts', startAssessmentAttempt);
router.post('/assessments/:id/attempts/:attemptId/submit', submitAssessmentAttempt);

router.get('/results', listMyResults);
router.get('/results/analytics', getResultsAnalytics);
router.get('/results/:id', getMyResult);

router.get('/tutor/sessions', listTutorSessions);
router.post('/tutor/sessions', createTutorSession);
router.delete('/tutor/sessions', clearTutorSessions);
router.get('/tutor/sessions/:id', getTutorSession);
router.delete('/tutor/sessions/:id', deleteTutorSession);
router.post('/tutor/sessions/:id/messages', sendTutorMessage);
router.post('/tutor/sessions/:id/messages/stream', streamTutorMessage);
router.post('/tutor/visualize', tutorVisualize);
router.post('/tutor/tts', tutorTts);
router.get('/next-steps', getNextSteps);
router.get('/events', listMyEvents);
router.post('/events', recordMyEvent);
router.get('/tutor-face', getMyTutorFace);
router.put('/tutor-face', setMyTutorFace);
router.get('/reviews', listReviews);
router.post('/reviews/:id/answer', answerReviewItem);

export default router;
