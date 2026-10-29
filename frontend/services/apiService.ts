import type { ApiKeyValidationResponse } from '../types';
import { OriginView, withOrigin } from './roleRouting';

// Single client for the Enara backend (backend/ in this repo).
//
// In the browser every call goes to /api/railway/<path>, which server.ts
// forwards to ${BACKEND_URL}/api/<path>. Set VITE_API_URL to point the
// browser somewhere else; it must be the URL that maps to the backend's /api.

const API_BASE = (import.meta.env.VITE_API_URL || '/api/railway').replace(/\/+$/, '');

const TOKEN_KEY = 'enara_token';
const USER_KEY = 'enara_user';

export type BackendRole = 'student' | 'teacher' | 'academic_manager' | 'admin' | 'enara-admin';

export interface SessionUser {
  email: string;
  role: BackendRole;
  name?: string;
  studentId?: string;
  institutionId?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Fired when the backend rejects our token, so the app can return to login.
export const SESSION_EXPIRED_EVENT = 'enara-session-expired';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && getToken() ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Keys used by older versions of the app.
    localStorage.removeItem('enara_railway_token');
    localStorage.removeItem('enara_railway_user');
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

function toUrl(path: string): string {
  // Callers pass backend paths such as /api/students; the base already maps to /api.
  return `${API_BASE}${path.replace(/^\/api(?=\/|$)/, '')}`;
}

async function request<T = any>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(toUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const message = data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || `Request failed (${res.status})`;
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
      clearSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status, data?.error?.code);
  }
  // The server's request id (P5 usage chips); not enumerable, so it never
  // leaks into rendered or re-sent data.
  const requestId = res.headers.get('X-Request-Id');
  if (requestId && data && typeof data === 'object') Object.defineProperty(data, '__requestId', { value: requestId, enumerable: false });
  return data as T;
}

export const requestIdOf = (value: unknown): string | null => (value && typeof value === 'object' ? ((value as { __requestId?: string }).__requestId ?? null) : null);

// AUTH
export async function login(email: string, password: string): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser }>('POST', '/api/auth/login', {
    email: email.trim(),
    password,
  });
  saveSession(data.token, data.user);
  return data.user;
}

// Signs out on the server too (S-1): every token of the account stops
// working, on every device. Best effort; the local session is cleared anyway.
export function logout() {
  if (getToken()) void request('POST', '/api/auth/logout').catch(() => undefined);
  clearSession();
}

/** Admin-only: create a login account (used to give students credentials). */
export async function createUserAccount(data: {
  email: string;
  password: string;
  name?: string;
  role: BackendRole;
  institutionId?: string;
}) {
  return request('POST', '/api/auth/users', data);
}

// STUDENTS (admin)
export const fetchStudents = () => request<any[]>('GET', '/api/students');
export const getStudent = (id: string) => request('GET', `/api/students/${encodeURIComponent(id)}`);
export const createStudent = (data: {
  name: string;
  email: string;
  grade: string;
  batchId?: string;
  academicYear?: string;
  groupId?: string;
  institutionId?: string;
}) => request('POST', '/api/students', data);
export const updateStudent = (id: string, data: any) => request('PATCH', `/api/students/${encodeURIComponent(id)}`, data);
export const deleteStudent = (id: string) => request('DELETE', `/api/students/${encodeURIComponent(id)}`);

// CURRICULUMS (admin)
export const fetchCurriculums = () => request<any[]>('GET', '/api/curriculums');
export const getCurriculum = (id: string) => request('GET', `/api/curriculums/${encodeURIComponent(id)}`);
export const createCurriculum = (data: any) => request('POST', '/api/curriculums', data);
export const updateCurriculum = (id: string, data: any) => request('PATCH', `/api/curriculums/${encodeURIComponent(id)}`, data);
export const deleteCurriculum = (id: string) => request('DELETE', `/api/curriculums/${encodeURIComponent(id)}`);
export const deployCurriculum = (id: string) => request('PATCH', `/api/curriculums/${encodeURIComponent(id)}/deploy`, {});
export const assignBatchToCurriculum = (id: string, batchId: string) =>
  request('POST', `/api/curriculums/${encodeURIComponent(id)}/assign-batch`, { batchId });
export const unassignBatchFromCurriculum = (id: string, batchId: string) =>
  request('DELETE', `/api/curriculums/${encodeURIComponent(id)}/batches/${encodeURIComponent(batchId)}`);
export function uploadChapterFile(curriculumId: string, chapterId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/api/curriculums/${encodeURIComponent(curriculumId)}/chapters/${encodeURIComponent(chapterId)}/uploads`, form, true);
}

// Lesson videos: compressed in the browser, then PUT straight to R2 with a signed
// URL (they're too large to pass through the API), then attached to the chapter.
export async function uploadChapterVideo(
  curriculumId: string,
  chapterId: string,
  file: File,
  onStage?: (stage: 'compressing' | 'uploading', fraction: number) => void,
) {
  const { compressVideo } = await import('./videoCompression');
  const video = await compressVideo(file, (f) => onStage?.('compressing', f));
  const base = `/api/curriculums/${encodeURIComponent(curriculumId)}/chapters/${encodeURIComponent(chapterId)}/video-uploads`;
  const target = await request<{ uploadUrl: string; storedName: string; contentType: string }>('POST', base, {
    fileName: video.file.name,
    size: video.file.size,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    xhr.setRequestHeader('Content-Type', target.contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onStage?.('uploading', e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Video upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Video upload failed (network error)'));
    xhr.send(video.file);
  });

  const res = await request<any>('POST', `${base}/complete`, { storedName: target.storedName });
  return { ...res, compressed: video.compressed, originalBytes: video.originalBytes, finalBytes: video.file.size };
}

// Live avatar tutor: raw fetch (the answer endpoint streams NDJSON) with the
// signed-in user's token.
// keepalive lets a close request finish while the page unloads.
export function avatarFetch(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(toUrl(`/api/avatar${path}`), {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    keepalive: init.keepalive,
  });
}

// BATCHES (admin)
export const fetchBatches = () => request<any[]>('GET', '/api/batches');
export const createBatch = (data: { name: string; academicYear: string; groupId?: string; curriculumId?: string }) =>
  request('POST', '/api/batches', data);
export const updateBatch = (id: string, data: any) => request('PATCH', `/api/batches/${encodeURIComponent(id)}`, data);
export const deleteBatch = (id: string) => request('DELETE', `/api/batches/${encodeURIComponent(id)}`);

// COURSE INSTANCES (admin)
export const fetchCourseInstances = () => request<any[]>('GET', '/api/course-instances');
export const createCourseInstance = (data: any) => request('POST', '/api/course-instances', data);
export const updateCourseInstance = (id: string, data: any) => request('PATCH', `/api/course-instances/${encodeURIComponent(id)}`, data);
export const deleteCourseInstance = (id: string) => request('DELETE', `/api/course-instances/${encodeURIComponent(id)}`);
export const fetchCourseInstanceStudents = (id: string) => request<any[]>('GET', `/api/course-instances/${encodeURIComponent(id)}/students`);
export const assignStudentToCourseInstance = (id: string, studentId: string) =>
  request('POST', `/api/course-instances/${encodeURIComponent(id)}/students`, { studentId });
export const removeStudentFromCourseInstance = (id: string, studentId: string) =>
  request('DELETE', `/api/course-instances/${encodeURIComponent(id)}/students/${encodeURIComponent(studentId)}`);

// ASSESSMENTS (admin)
export const fetchAssessments = () => request<any[]>('GET', '/api/assessments');
export const createAssessment = (data: any) => request('POST', '/api/assessments', data);
export const updateAssessment = (id: string, data: any) => request('PATCH', `/api/assessments/${encodeURIComponent(id)}`, data);
export const deleteAssessment = (id: string) => request('DELETE', `/api/assessments/${encodeURIComponent(id)}`);

export interface AssessmentAttemptsReport {
  assessment: { id: string; title: string; subject: string; status: string; dueDate?: string; batchId?: string; studentId?: string };
  summary: {
    assigned: number;
    submitted: number;
    inProgress: number;
    notStarted: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
  };
  students: Array<{
    studentId: string;
    name: string;
    email: string;
    batchId?: string;
    status: 'submitted' | 'in-progress' | 'not-started';
    attemptId?: string;
    score: number | null;
    startedAt: string | null;
    submittedAt: string | null;
    timeSpentSec: number | null;
    attemptCount: number;
    answers: Array<{
      questionId: string;
      questionText: string;
      topic?: string;
      studentAnswer: string | number;
      correctAnswer: string | number;
      isCorrect?: boolean;
      explanation: string;
    }>;
  }>;
  questions: Array<{ questionId: string; text: string; topic?: string; answered: number; correct: number; correctRate: number | null }>;
}

/** Admin: who the assessment is assigned to, who submitted, scores and per-question correct rates. */
export const fetchAssessmentAttempts = (id: string) =>
  request<AssessmentAttemptsReport>('GET', `/api/assessments/${encodeURIComponent(id)}/attempts`);

// CREDITS (admin)
export interface CreditsReport {
  summary: {
    studentCount: number;
    totalLimit: number;
    totalUsage: number;
    totalRemaining: number;
    blocked: number;
    throttled: number;
    nearLimit: number;
    truncated: boolean;
  };
  students: Array<{
    studentId: string;
    name: string;
    email: string;
    batchId?: string;
    institutionId?: string;
    limit: number;
    usage: number;
    remaining: number;
    usagePct: number;
    period: string;
    status: 'active' | 'blocked' | 'throttled';
    restrictedFeatures: string[];
  }>;
  usageByFeature: Array<{ feature: string; credits: number; events: number }>;
  usageByDay: Array<{ date: string; credits: number; events: number }>;
  periodDays: number;
}

/** Admin: AI credit balances and recent usage. Enara admins may pass an institutionId to narrow it. */
export const fetchCreditsReport = (institutionId?: string) =>
  request<CreditsReport>('GET', `/api/credits${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`);

// UPLOADS (teacher/admin) — sends a course file to the AI engine for ingestion.
export function uploadCourseFile(courseId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/api/upload/course/${encodeURIComponent(courseId)}`, form, true);
}

// ANALYTICS (admin) — computed by the backend from recorded activity: submitted
// assessments, completed lessons, questions to the tutor and settled AI usage.
export type ActivityStatus = 'excelling' | 'on track' | 'at risk' | 'not started';
export type RiskFlag = 'low_scores' | 'inactive' | 'overdue';

export interface StudentActivityMetrics {
  id: string;
  name: string;
  email?: string;
  batchId?: string;
  avgScore: number | null;
  attemptsSubmitted: number;
  lessonsCompleted: number;
  lessonsAvailable: number;
  lessonCompletionRate: number | null;
  tutorQuestions30d: number;
  creditsUsed30d: number;
  lastActiveAt: string | null;
  overdueAssessments: number;
  status: ActivityStatus;
  riskFlags: RiskFlag[];
}

export interface TopicAccuracy { topic: string; correctRate: number; answers: number }
export interface SubjectScore { subject: string; avgScore: number | null; attempts: number; students: number; correctRate: number | null }

export interface AnalyticsOverview {
  generatedAt: string;
  windowDays: number;
  definitions: { scoreBands: { excellent: number; good: number; average: number }; inactiveAfterDays: number; atRisk: string };
  totals: {
    students: number;
    activeStudents7d: number;
    activeStudents30d: number;
    avgScore: number | null;
    avgLessonCompletion: number | null;
    lessonsCompleted: number;
    assessmentsSubmitted: number;
    tutorQuestions30d: number;
    creditsUsed30d: number;
    creditsUnattributed30d: number;
  };
  weekly: Array<{ weekStart: string; label: string; activeStudents: number; lessonsCompleted: number; assessmentsSubmitted: number; tutorQuestions: number }>;
  performance: { excellent: number; good: number; average: number; needsHelp: number; noScores: number };
  risk: { atRiskStudents: number; lowScores: number; inactive: number; overdue: number; notStarted: number };
  subjects: SubjectScore[];
  topics: TopicAccuracy[];
  courses: Array<{
    id: string;
    courseId: string;
    courseName: string;
    students: number;
    lessons: number;
    lessonCompletionRate: number | null;
    avgScore: number | null;
    tutorQuestions30d: number;
    activeStudents30d: number;
    creditsUsed30d: number;
    atRiskStudents: number;
  }>;
  batches: Array<{ batchId: string; students: number; avgScore: number | null; activeRate: number; atRiskStudents: number }>;
  students: StudentActivityMetrics[];
}

export interface CourseAnalytics {
  generatedAt: string;
  windowDays: number;
  course: { id: string; courseId: string; courseName: string; curriculumId?: string; students: number; lessons: number; assessments: number };
  stats: {
    sessions30d: number;
    questions30d: number;
    avgQuestionsPerSession: number | null;
    avgSessionMinutes: number | null;
    /** Share of tutor replies that found matching course material. */
    groundedReplyRate: number | null;
    /** Share of questions asked more than once (same wording). */
    repeatQuestionRate: number | null;
  };
  engagementByWeekday: Array<{ day: string; sessions: number; questions: number; avgDepth: number; avgMinutes: number }>;
  mostAsked: Array<{ text: string; count: number; lessonTitle?: string }>;
  preExam: null | { assessmentTitle: string; dueDate: string; buckets: Array<{ label: string; questions: number; topQuestion: string | null }> };
  weeklyScores: Array<{ weekStart: string; label: string; avgScore: number | null; attempts: number }>;
  chapters: Array<{ chapterId: string; title: string; completedStudents: number; completionRate: number }>;
  topics: TopicAccuracy[];
  students: Array<{
    id: string;
    name: string;
    lessonCompletionRate: number | null;
    courseAvgScore: number | null;
    tutorQuestions30d: number;
    lastActiveAt: string | null;
    status: ActivityStatus;
    riskFlags: RiskFlag[];
  }>;
  insights: Array<{ type: 'positive' | 'warning' | 'action'; text: string }>;
}

export interface StudentAnalytics {
  generatedAt: string;
  windowDays: number;
  summary: StudentActivityMetrics;
  scoreHistory: Array<{ date: string | null; title: string; subject: string; score: number | null }>;
  subjects: SubjectScore[];
  topics: TopicAccuracy[];
  tutorUsage: Array<{ label: string; questions: number }>;
  activity: Array<{ date: string; label: string; lessons: number; assessments: number; questions: number }>;
}

const institutionQuery = (institutionId?: string) => (institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '');
export const fetchAnalyticsOverview = (institutionId?: string) =>
  request<AnalyticsOverview>('GET', `/api/analytics/overview${institutionQuery(institutionId)}`);
export const fetchCourseAnalytics = (courseInstanceId: string) =>
  request<CourseAnalytics>('GET', `/api/analytics/courses/${encodeURIComponent(courseInstanceId)}`);
export const fetchStudentAnalytics = (studentId: string) =>
  request<StudentAnalytics>('GET', `/api/analytics/students/${encodeURIComponent(studentId)}`);

// PARTNER INTEGRATIONS (Enara admin)
export interface PartnerInstitution {
  id: string;
  name: string;
  lmsSystem?: string;
  contactName?: string;
  contactEmail?: string;
  status: 'active' | 'suspended';
  activeApiKeys: number;
  createdAt?: string;
}

export interface PartnerApiKey {
  id: string;
  keyPrefix: string;
  institutionId: string;
  adminEmail: string;
  lmsSystemId?: string;
  permissions: string[];
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface PartnerOnboardingResult {
  success: boolean;
  message: string;
  institutionId: string;
  institution: { id: string; name: string; lmsSystem?: string; status: string };
  /** Shown once; the backend keeps only a hash of the password and the key. */
  credentials: { username: string; password: string };
  apiKey: string;
  apiKeyInfo: PartnerApiKey;
}

export const fetchPartnerInstitutions = () =>
  request<{ data: PartnerInstitution[] }>('GET', '/api/integrations/institutions').then(r => r.data);
export const createPartnerInstitution = (data: {
  institutionName: string;
  lmsSystem?: string;
  adminName: string;
  adminEmail: string;
  adminPhone?: string;
}) => request<PartnerOnboardingResult>('POST', '/api/integrations/institutions', data);
export const fetchPartnerApiKeys = (institutionId?: string) =>
  request<{ data: PartnerApiKey[] }>(
    'GET',
    `/api/integrations/api-keys${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
  ).then(r => r.data);
export const issuePartnerApiKey = (institutionId: string, adminEmail?: string) =>
  request<{ apiKey: string; apiKeyInfo: PartnerApiKey }>(
    'POST',
    `/api/integrations/institutions/${encodeURIComponent(institutionId)}/api-keys`,
    adminEmail ? { adminEmail } : {}
  );
export const revokePartnerApiKey = (id: string) =>
  request<{ data: PartnerApiKey }>('POST', `/api/integrations/api-keys/${encodeURIComponent(id)}/revoke`, {});
export const validatePartnerApiKey = (data: {
  apiKey: string;
  adminIdentifier: string;
  institutionIdentifier: string;
  lmsSystemId?: string;
}) => request<ApiKeyValidationResponse>('POST', '/api/integrations/api-keys/validate', data);

/** Absolute backend API base, as a partner system would call it. */
export function publicApiBase(): string {
  return /^https?:\/\//.test(API_BASE) ? API_BASE : `${window.location.origin}${API_BASE}`;
}

export interface RawApiResponse {
  status: number;
  ok: boolean;
  latencyMs: number;
  data: any;
}

/**
 * Calls the backend with a partner API key, or with the current session when no key is given.
 * Returns the raw status and body so the integration tester can show them; a rejected key
 * never ends the admin's own session.
 */
export async function requestAsPartner(
  method: string,
  path: string,
  apiKey?: string,
  body?: FormData
): Promise<RawApiResponse> {
  const token = apiKey?.trim() || getToken();
  const started = performance.now();
  const res = await fetch(toUrl(path), {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  return { status: res.status, ok: res.ok, latencyMs: Math.round(performance.now() - started), data };
}

// STUDENT SELF-SERVICE (/api/me, student role only)
export const fetchMe = () => request('GET', '/api/me');
export const fetchMyDashboard = () => request('GET', '/api/me/dashboard');
export const fetchMyCourses = () => request<any[]>('GET', '/api/me/courses');
export const fetchMyCourse = (courseId: string) => request('GET', `/api/me/courses/${encodeURIComponent(courseId)}`);
export const fetchMyLesson = (courseId: string, lessonId: string) =>
  request('GET', `/api/me/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`);
export const completeMyLesson = (courseId: string, lessonId: string) =>
  request('POST', `/api/me/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/complete`, {});
export const fetchMyAssessments = () => request<any[]>('GET', '/api/me/assessments');
export const fetchMyAssessment = (id: string) => request('GET', `/api/me/assessments/${encodeURIComponent(id)}`);
export const startAssessmentAttempt = (id: string) => request('POST', `/api/me/assessments/${encodeURIComponent(id)}/attempts`, {});
export const submitAssessmentAttempt = (id: string, attemptId: string, answers: Record<string, string | number>) =>
  request('POST', `/api/me/assessments/${encodeURIComponent(id)}/attempts/${encodeURIComponent(attemptId)}/submit`, { answers });
export const fetchMyResults = () => request<any[]>('GET', '/api/me/results');
export const fetchMyResult = (id: string) => request('GET', `/api/me/results/${encodeURIComponent(id)}`);
export const fetchMyCredits = () => request('GET', '/api/me/credits');
export const fetchMyAchievements = () => request('GET', '/api/me/achievements');
export const fetchMyRecommendations = () => request('GET', '/api/me/recommendations');

// Proactive tutor: what to do next, and spaced review of missed questions.
export type NextStep =
  | { kind: 'review'; title: string; detail: string; count: number }
  | { kind: 'tutor'; title: string; detail: string; prompt: string }
  | { kind: 'lesson'; title: string; detail: string; courseId: string; lessonId: string };
export const fetchNextSteps = () => request<{ note: string; steps: NextStep[] }>('GET', '/api/me/next-steps');
export interface ReviewQuestion { id: string; topic: string; question: string; options?: string[] }
export const fetchDueReviews = () => request<{ items: ReviewQuestion[] }>('GET', '/api/me/reviews');
export const answerReview = (id: string, answer: string | number) =>
  request<{ correct: boolean; answer: string; explanation: string; nextInDays: number | null }>(
    'POST',
    `/api/me/reviews/${encodeURIComponent(id)}/answer`,
    { answer },
  );
// The live tutor's face, chosen by school admins.
export interface TutorFaceChoice { id: string; name: string; variant?: string; imageUrl?: string; gender?: 'woman' | 'man'; description?: string }
export interface TutorFace { avatarId: string; name: string; imageUrl?: string; gender?: 'woman' | 'man' }
export const fetchTutorFaces = (institutionId?: string) =>
  request<{
    institutionId: string;
    institutions?: { id: string; name: string }[];
    avatars: TutorFaceChoice[];
    studentOptions: string[];
    default: TutorFace | null;
    courses: { courseId: string; courseName: string; face: TutorFace | null }[];
  }>('GET', `/api/tutor-faces${institutionQuery(institutionId)}`);
export const setTutorFace = (avatarId: string | null, courseId?: string, institutionId?: string) =>
  request<{ ok: boolean; face: TutorFace | null }>('PUT', `/api/tutor-faces${institutionQuery(institutionId)}`, { avatarId, courseId });

export const setStudentFaceOptions = (avatarIds: string[], institutionId?: string) =>
  request<{ ok: boolean; studentOptions: string[] }>('PUT', `/api/tutor-faces/student-options${institutionQuery(institutionId)}`, { avatarIds });
// The student's own tutor pick.
export const fetchMyTutorFace = () =>
  request<{ current: TutorFace | null; chosen: boolean; options: TutorFaceChoice[] }>('GET', '/api/me/tutor-face');
export const setMyTutorFace = (avatarId: string | null) => request<{ ok: boolean }>('PUT', '/api/me/tutor-face', { avatarId });

// "This week in your school" for admins and teachers.
export interface WeeklySummary {
  generatedAt: string;
  summary: string;
  stuckStudents: { id: string; name: string; reasons: string[]; avgScore: number | null }[];
  reteachTopics: { topic: string; accuracy: number; answers: number }[];
  questionThemes: string[];
  totals: { students: number; activeStudents7d: number; tutorQuestions7d: number };
}
export const fetchWeeklySummary = () => request<WeeklySummary>('GET', '/api/analytics/weekly-summary');

export const fetchMyAnalyticsOverview = () => request('GET', '/api/me/analytics/overview');

// TUTOR (student)
export const listTutorSessions = () => request<any[]>('GET', '/api/me/tutor/sessions');
export const getTutorSession = (id: string) => request('GET', `/api/me/tutor/sessions/${encodeURIComponent(id)}`);
export const createTutorSession = (courseId?: string, lessonId?: string, title?: string) =>
  request('POST', '/api/me/tutor/sessions', { courseId, lessonId, title });
export const sendTutorMessage = (sessionId: string, text: string, context?: any) =>
  request('POST', `/api/me/tutor/sessions/${encodeURIComponent(sessionId)}/messages`, { text, context });
export const deleteTutorSession = (id: string) => request('DELETE', `/api/me/tutor/sessions/${encodeURIComponent(id)}`);

// Staff data assistant: answers from the caller's own school data, server-side.
export const askDataAssistant = (message: string, history: { role: 'user' | 'assistant'; content: string }[] = []) =>
  request<{ answer: string; aiGenerated: true }>('POST', '/api/analytics/assistant', { message, history });

// Learning events (evidence log).
export interface LearningEventRecord {
  id: string;
  studentId: string;
  institutionId?: string;
  type: string;
  source: string;
  verified: boolean;
  gradedBy?: 'rule' | 'ai' | 'teacher';
  topic?: string;
  subject?: string;
  refs: Record<string, string | undefined>;
  outcome?: { correct?: boolean; score?: number; hintsUsed?: number };
  durationMs?: number;
  at: string;
}

export const reportLessonViewed = (courseId: string, lessonId: string, durationMs: number) =>
  request('POST', '/api/me/events', { type: 'lesson_viewed', courseId, lessonId, durationMs: Math.min(Math.round(durationMs), 4 * 60 * 60 * 1000) });

export const fetchSchoolEvents = (params: Record<string, string | undefined> = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return request<{ events: LearningEventRecord[]; nextBefore: string | null; counts: Record<string, { total: number; verified: number }> }>(
    'GET',
    `/api/analytics/events${query ? `?${query}` : ''}`,
  );
};

// ---------------------------------------------------------------------------
// Learning Intelligence (ELIE). All behind per-school flags; a disabled school
// gets ApiError code FEATURE_DISABLED.
export type MasteryStatus = 'not_assessed' | 'emerging' | 'developing' | 'proficient' | 'mastered';
export type EvidenceStrength = 'none' | 'limited' | 'moderate' | 'substantial';

export interface LearningObjectiveRecord {
  id: string;
  institutionId: string;
  curriculumId: string;
  code: string;
  title: string;
  description: string;
  language: 'en' | 'ar';
  translations?: { en?: { title?: string; description?: string }; ar?: { title?: string; description?: string } };
  lessonIds: string[];
  prerequisiteObjectiveIds: string[];
  difficultyLevel?: number;
  estimatedLearningMinutes?: number;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  origin: 'teacher' | 'ai';
  updatedAt: string;
}

export interface KnowledgeMapObjective {
  id: string;
  code: string;
  title: string;
  translations?: LearningObjectiveRecord['translations'];
  curriculumId: string;
  courseId: string | null;
  lessonIds: string[];
  prerequisiteObjectiveIds: string[];
  masteryEstimate: number | null;
  evidenceStrength: EvidenceStrength;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  independentEvidenceCount: number;
  needsVerification: boolean;
  lastEvidenceAt: string | null;
  readyToLearn: boolean;
  isGap: boolean;
  weakPrerequisites: { id: string; code: string; depth: number }[];
}

export const isFeatureDisabled = (err: unknown) => err instanceof ApiError && err.code === 'FEATURE_DISABLED';

export const fetchObjectives = (curriculumId?: string, status?: string) =>
  request<{ objectives: LearningObjectiveRecord[] }>(
    'GET',
    `/api/learning/objectives?${new URLSearchParams(Object.entries({ curriculumId, status }).filter(([, v]) => v) as [string, string][])}`,
  );
export const createObjective = (data: Partial<LearningObjectiveRecord> & { curriculumId: string }) =>
  request<LearningObjectiveRecord>('POST', '/api/learning/objectives', data);
export const updateObjective = (id: string, data: Partial<LearningObjectiveRecord>) =>
  request<LearningObjectiveRecord>('PATCH', `/api/learning/objectives/${encodeURIComponent(id)}`, data);
export const approveObjective = (id: string) =>
  request<LearningObjectiveRecord>('POST', `/api/learning/objectives/${encodeURIComponent(id)}/approve`);
export const extractObjectives = (curriculumId: string, language: 'en' | 'ar') =>
  request<{ created: LearningObjectiveRecord[]; skippedExistingCodes: string[]; droppedCyclicLinks: number }>(
    'POST',
    '/api/learning/objectives/extract',
    { curriculumId, language },
  );
export const fetchObjectiveQuestions = (id: string) =>
  request<{ assessments: { id: string; title: string; subject: string; questions: { id: string; text: string; topic?: string; linked: boolean }[] }[] }>(
    'GET',
    `/api/learning/objectives/${encodeURIComponent(id)}/questions`,
  );
export const setObjectiveQuestions = (id: string, links: { assessmentId: string; questionId: string }[]) =>
  request<{ linked: number; unlinked: number; pastAnswersLinked: number; evidenceInvalidated: number }>(
    'PUT',
    `/api/learning/objectives/${encodeURIComponent(id)}/questions`,
    { links },
  );
export const fetchKnowledgeMap = (studentId = 'me') =>
  request<{ studentId: string; modelVersion: string; objectives: KnowledgeMapObjective[] }>(
    'GET',
    `/api/learning/students/${encodeURIComponent(studentId)}/knowledge-map`,
  );
export const fetchObjectiveMastery = (objectiveId: string, studentId = 'me') =>
  request<any>('GET', `/api/learning/students/${encodeURIComponent(studentId)}/mastery/${encodeURIComponent(objectiveId)}`);

export interface DiagnosticView {
  id: string;
  status: 'in_progress' | 'completed' | 'expired' | 'cancelled';
  courseId: string;
  objectiveIds: string[];
  questionsAnswered: number;
  maxQuestions: number;
  maxMinutes: number;
  startedAt: string;
  endsAt: string;
  stopReason: string | null;
  currentQuestion: { assessmentId: string; questionId: string; type: string; text: string; options: string[] } | null;
  resumed?: boolean;
  duplicate?: boolean;
}

export const startDiagnostic = (courseId: string, objectiveIds?: string[]) =>
  request<DiagnosticView>('POST', '/api/learning/diagnostics', { courseId, ...(objectiveIds?.length ? { objectiveIds } : {}) });
export const answerDiagnostic = (id: string, assessmentId: string, questionId: string, answer: string) =>
  request<DiagnosticView>('POST', `/api/learning/diagnostics/${encodeURIComponent(id)}/answer`, { assessmentId, questionId, answer });
export const completeDiagnostic = (id: string) => request<DiagnosticView>('POST', `/api/learning/diagnostics/${encodeURIComponent(id)}/complete`);
export const fetchDiagnosticReport = (id: string) => request<any>('GET', `/api/learning/diagnostics/${encodeURIComponent(id)}/report`);
export const fetchMisconceptions = (studentId = 'me') =>
  request<{ misconceptions: any[] }>('GET', `/api/learning/students/${encodeURIComponent(studentId)}/misconceptions`);

export const createIntervention = (objectiveId: string) => request<any>('POST', '/api/learning/interventions', { objectiveId });
export const startIntervention = (id: string) =>
  request<{ intervention: any; tutorSessionId: string | null; strategy: { id: string; reasonCodes: string[] } | null }>(
    'POST',
    `/api/learning/interventions/${encodeURIComponent(id)}/start`,
  );
export const completeIntervention = (id: string) => request<any>('POST', `/api/learning/interventions/${encodeURIComponent(id)}/complete`);
export const reassessIntervention = (id: string) =>
  request<{ diagnosticId: string }>('POST', `/api/learning/interventions/${encodeURIComponent(id)}/reassess`);
export const fetchMyInterventions = () => request<{ interventions: any[] }>('GET', '/api/learning/students/me/interventions');

export const fetchRecommendations = (studentId = 'me') =>
  request<{ mode: string; recommendations: any[] }>('GET', `/api/learning/students/${encodeURIComponent(studentId)}/recommendations`);
export const fetchClasses = (origin: OriginView = 'live') => request<{ classes: { id: string; courseName: string; curriculumId?: string }[] }>('GET', withOrigin('/api/learning/classes', origin));
export const fetchClassInsights = (classId: string, origin: OriginView = 'live') => request<any>('GET', withOrigin(`/api/learning/classes/${encodeURIComponent(classId)}/insights`, origin));
export const fetchTtu = (courseId?: string, origin: OriginView = 'live') => request<any>('GET', withOrigin(`/api/learning/analytics/ttu${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`, origin));
export const fetchStrategies = () => request<{ strategies: { id: string; description: string }[] }>('GET', '/api/learning/strategies');
export const assignIntervention = (studentId: string, objectiveId: string, strategyId?: string, note?: string) =>
  request<any>('POST', '/api/learning/interventions', { studentId, objectiveId, interventionType: 'teacher_assigned', ...(strategyId ? { strategyId } : {}), ...(note ? { note } : {}) });
export const reviewMisconception = (id: string, status: 'confirmed' | 'dismissed' | 'resolved', note?: string) =>
  request<any>('PATCH', `/api/learning/misconceptions/${encodeURIComponent(id)}`, { status, ...(note ? { note } : {}) });
export const fetchSchoolAnalytics = (institutionId?: string) =>
  request<any>('GET', `/api/learning/analytics/school${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`);
export const fetchCurriculumProcessing = (curriculumId: string) =>
  request<{ files: any[] }>('GET', `/api/learning/curricula/${encodeURIComponent(curriculumId)}/processing`);
export const processCurriculumFiles = (curriculumId: string, retryFailed = false) =>
  request<{ processed: number; files: any[] }>('POST', `/api/learning/curricula/${encodeURIComponent(curriculumId)}/process`, { retryFailed });
export const fetchShadowComparison = (institutionId?: string) =>
  request<any>('GET', `/api/learning/analytics/shadow-comparison${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`);

// TEACHING WORKFLOW (Phase 3)
const enc = encodeURIComponent;
export const fetchAuthoringAssessments = (lifecycle?: string) => request<any[]>('GET', `/api/assessments${lifecycle ? `?lifecycle=${enc(lifecycle)}` : ''}`);
export const fetchAssessmentDetail = (id: string) => request<any>('GET', `/api/assessments/${enc(id)}`);
export const validateAssessmentDraft = (id: string) => request<{ valid: boolean; problems: string[]; totalPoints: number }>('POST', `/api/assessments/${enc(id)}/validate`);
export const publishAssessmentVersion = (id: string, acknowledgeUnsourced = false) =>
  request<any>('POST', `/api/assessments/${enc(id)}/publish`, acknowledgeUnsourced ? { acknowledgeUnsourced: true } : undefined);
export const archiveAssessmentById = (id: string) => request<any>('POST', `/api/assessments/${enc(id)}/archive`);
export const duplicateAssessmentById = (id: string) => request<any>('POST', `/api/assessments/${enc(id)}/duplicate`);
export const fetchAssessmentVersions = (id: string) => request<{ versions: any[] }>('GET', `/api/assessments/${enc(id)}/versions`);

export const fetchClassAssignments = (classId?: string) => request<{ assignments: any[] }>('GET', `/api/assignments${classId ? `?classId=${enc(classId)}` : ''}`);
export const createClassAssignment = (data: any) => request<any>('POST', '/api/assignments', data);
export const fetchClassAssignment = (id: string) => request<any>('GET', `/api/assignments/${enc(id)}`);
export const updateClassAssignment = (id: string, data: any) => request<any>('PATCH', `/api/assignments/${enc(id)}`, data);
export const assignmentAction = (id: string, action: 'publish' | 'close' | 'reopen' | 'archive') => request<any>('POST', `/api/assignments/${enc(id)}/${action}`);
export const grantAssignmentExtension = (id: string, studentId: string, dueAt: string, reason: string) =>
  request<any>('POST', `/api/assignments/${enc(id)}/extensions`, { studentId, dueAt, reason });

export const fetchReviewQueue = (params: { assignmentId?: string; status?: string } = {}) =>
  request<{ items: any[]; counts: Record<string, number> }>('GET', `/api/grading/queue?${new URLSearchParams(params as Record<string, string>).toString()}`);
export const fetchSubmissionForReview = (attemptId: string) => request<any>('GET', `/api/grading/attempts/${enc(attemptId)}`);
export const scoreSubmissionAnswer = (attemptId: string, questionId: string, body: any) => request<any>('PUT', `/api/grading/attempts/${enc(attemptId)}/answers/${enc(questionId)}`, body);
export const setSubmissionFeedback = (attemptId: string, overallFeedback: string) => request<any>('PUT', `/api/grading/attempts/${enc(attemptId)}/feedback`, { overallFeedback });
export const finalizeSubmission = (attemptId: string) => request<any>('POST', `/api/grading/attempts/${enc(attemptId)}/finalize`);
export const releaseSubmission = (attemptId: string) => request<any>('POST', `/api/grading/attempts/${enc(attemptId)}/release`);
export const releaseAllResults = (assignmentId: string) => request<any>('POST', `/api/grading/assignments/${enc(assignmentId)}/release`);
export const regradeSubmission = (attemptId: string, reason?: string) => request<any>('POST', `/api/grading/attempts/${enc(attemptId)}/regrade`, { reason });
export const resolveAppeal = (attemptId: string, appealId: string, decision: 'upheld' | 'rejected', response: string) =>
  request<any>('PUT', `/api/grading/attempts/${enc(attemptId)}/appeals/${enc(appealId)}`, { decision, response });
export const correctSubmissionGrade = (attemptId: string, body: any) => request<any>('POST', `/api/grading/attempts/${enc(attemptId)}/correct`, body);

export const fetchMyAssignments = () => request<{ assignments: any[] }>('GET', '/api/me/assignments');
export const fetchMyAssignment = (id: string) => request<any>('GET', `/api/me/assignments/${enc(id)}`);
export const startMyAssignment = (id: string) => request<any>('POST', `/api/me/assignments/${enc(id)}/attempts`);
export const saveMyAssignmentDraft = (id: string, attemptId: string, answers: Record<string, string>) =>
  request<{ savedAt: string }>('PUT', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/draft`, { answers });
export const submitMyAssignment = (id: string, attemptId: string, answers: Record<string, string>) =>
  request<any>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/submit`, { answers });
// Conversation exams: without a message the examiner opens; returns the new turns.
export const converseMyAssignment = (id: string, attemptId: string, message?: string) =>
  request<{ turns: any[]; state: { index: number; probed: boolean; done: boolean }; questionCount: number }>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/conversation`, message === undefined ? {} : { message });
// P4 speaking exams (voice only; typed only as a teacher-arranged accommodation).
export type SpeakingAudio = { format: 'pcm_16000'; base64: string } | null;
export const beginSpeakingExam = (id: string, attemptId: string, mode: string, consent: boolean) =>
  request<{ resumed: boolean; mode: string; fallback: any; turns: any[]; state: any; expiresAt: string | null; audio: SpeakingAudio; settings: any }>(
    'POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/speaking/begin`, { mode, consent });
export const sendSpeakingAudio = (id: string, attemptId: string, audio: Blob, turnCount: number) => {
  const form = new FormData();
  form.append('turnCount', String(turnCount));
  form.append('audio', audio, 'reply.webm');
  return request<{ transcript: string; turns: any[]; state: any; audio: SpeakingAudio; turnsLeft: number }>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/speaking/turn`, form, true);
};
export const sendSpeakingText = (id: string, attemptId: string, text: string, turnCount: number) =>
  request<{ transcript: string; turns: any[]; state: any; audio: SpeakingAudio; turnsLeft: number }>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/speaking/turn`, { text, turnCount });
export const previewSpeakingExam = (data: { assessmentId: string; speaking: any; history?: any[]; message?: string }) =>
  request<{ preview: true; turns: any[]; state: any; transcript?: string }>('POST', '/api/speaking/preview', data);
export const fetchSpeakingAttempts = (assignmentId: string) => request<{ settings: any; attempts: any[] }>('GET', `/api/assignments/${enc(assignmentId)}/speaking-attempts`);
export const removeSpeakingTranscript = (assignmentId: string, attemptId: string) =>
  request<{ removed: boolean }>('POST', `/api/assignments/${enc(assignmentId)}/attempts/${enc(attemptId)}/speaking/remove-transcript`);
// P4 outcomes (observed; "gap closed" only when independently verified) and audit timeline.
export const fetchOutcomes = (params: { classId?: string; origin?: OriginView; from?: string; to?: string; page?: number } = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  return request<any>('GET', `/api/learning/analytics/outcomes${q.toString() ? `?${q}` : ''}`);
};
export const fetchStudentTimeline = (studentId: string) => request<{ studentId: string; events: { at: string; type: string; ref: string; detail?: any }[] }>('GET', `/api/learning/students/${enc(studentId)}/timeline`);
export const fetchMyAssignmentResult = (id: string, attemptId: string) => request<any>('GET', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/result`);
export const appealMyResult = (id: string, attemptId: string, message: string, questionId?: string) =>
  request<any>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/appeals`, { message, questionId });
export const fetchTeachingClasses = () => request<{ classes: { id: string; courseName: string; curriculumId: string | null; curriculumName: string | null }[] }>('GET', '/api/assignments/classes');
export const fetchTeachingOverview = (origin: OriginView = 'live') => request<any>('GET', withOrigin('/api/teaching/overview', origin));
export const fetchClassRoster = (classId: string, origin: OriginView = 'live') => request<any>('GET', withOrigin(`/api/teaching/classes/${enc(classId)}/roster`, origin));
export const fetchClassObjectives = (classId: string) => request<{ objectives: { id: string; code: string; title: string }[] }>('GET', `/api/teaching/classes/${enc(classId)}/objectives`);
export const fetchLearnerProfile = (studentId: string, origin: OriginView = 'live') => request<any>('GET', withOrigin(`/api/teaching/students/${enc(studentId)}/profile`, origin));
export const createEducatorIntervention = (data: any) => request<any>('POST', '/api/teaching/interventions', data);
export const updateEducatorIntervention = (id: string, data: any) => request<any>('PATCH', `/api/teaching/interventions/${enc(id)}`, data);
export const generateAssessmentDraft = (data: any) => request<{ assessment: any; sources: any[]; note: string }>('POST', '/api/assessments/generate', data);
export const regenerateAssessmentQuestion = (assessmentId: string, questionId: string, question: any, instruction?: string) =>
  request<{ question: any }>('POST', `/api/assessments/${enc(assessmentId)}/questions/${enc(questionId)}/regenerate`, { question, instruction });
export const fetchLessonPlans = () => request<{ plans: any[] }>('GET', '/api/lesson-plans');
export const fetchLessonPlan = (id: string) => request<any>('GET', `/api/lesson-plans/${enc(id)}`);
export const generateLessonPlanDraft = (data: any) => request<{ plan: any; sources: any[]; note: string }>('POST', '/api/lesson-plans/generate', data);
export const updateLessonPlan = (id: string, data: any) => request<any>('PUT', `/api/lesson-plans/${enc(id)}`, data);
export const regenerateLessonPlanSection = (id: string, sectionId: string, sections: any[], instruction?: string) =>
  request<{ section: any }>('POST', `/api/lesson-plans/${enc(id)}/sections/${enc(sectionId)}/regenerate`, { sections, instruction });
export const saveLessonPlanVersion = (id: string) => request<any>('POST', `/api/lesson-plans/${enc(id)}/save`);
export const archiveLessonPlan = (id: string) => request<any>('POST', `/api/lesson-plans/${enc(id)}/archive`);
export const fetchMyStudyPlan = () => request<any>('GET', '/api/me/study-plan');
export const setMyStudyItem = (key: string, status: 'todo' | 'done' | 'dismissed') => request<any>('PATCH', '/api/me/study-plan/items', { key, status });
export const startTutorHandoff = (kind: 'assignment' | 'result' | 'plan_item', refId: string) =>
  request<{ sessionId: string; title: string }>('POST', '/api/me/tutor/handoff', { kind, refId });

// DOCUMENTS (P2): teaching materials, with their scan and extraction state.
export type DocumentState = 'needs_attestation' | 'awaiting_scan' | 'scan_unavailable' | 'scan_failed' | 'rejected' | 'queued' | 'extracting' | 'ready' | 'no_text' | 'failed' | 'unsupported' | 'blocked' | 'deleted';
export interface WorkspaceDocument {
  uploadId: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  curriculumId: string;
  curriculumName: string | null;
  lessonId: string;
  lessonTitle: string | null;
  state: DocumentState;
  scanStatus: string | null;
  // 'clean' only from a real scanner; 'not_scanned_by_policy' when processed without one.
  malwareScan: 'clean' | 'not_scanned_by_policy' | 'not_applicable' | 'threat_found' | 'not_scanned';
  extractionStatus: string;
  detail: string | null;
  pages: number | null;
  chunkCount: number | null;
  rightsAttested: boolean;
  origin: 'live' | 'demo_seed';
  canChange: boolean;
  fileUrl: string | null;
  downloadWarning?: string | null;
}
export const fetchDocuments = (origin: OriginView = 'live') =>
  request<{ origin: OriginView; attestationStatement: string; notScannedNotice?: string; documents: WorkspaceDocument[] }>('GET', withOrigin('/api/documents', origin));

// Shown on upload and document details when files are processed without a malware scanner.
export const NOT_SCANNED_NOTICE =
  'This document has not been scanned for malware. ENARA validates file type and size, but this is not a malware scan. Eligible extracted text may be sent to the configured AI provider. Upload only educational files you are authorized to use; avoid confidential or personal student data.';
export const NOT_SCANNED_LABEL = 'Not scanned — AI processing enabled by institution policy';
export function uploadDocument(params: { file: File; curriculumId: string; lessonId: string; rightsAttested: boolean }) {
  const form = new FormData();
  form.append('curriculumId', params.curriculumId);
  form.append('lessonId', params.lessonId);
  form.append('rightsAttested', params.rightsAttested ? 'true' : 'false');
  form.append('file', params.file);
  return request<{ document: WorkspaceDocument }>('POST', '/api/documents', form, true);
}
export const fetchDocumentSources = (uploadId: string) =>
  request<{ uploadId: string; state: DocumentState; sources: { chunkId: string; fileName: string; page: number | null; section: string | null; ref: string; preview: string }[] }>('GET', `/api/documents/${encodeURIComponent(uploadId)}/sources`);
export const retryDocument = (uploadId: string) => request<{ document: WorkspaceDocument }>('POST', `/api/documents/${encodeURIComponent(uploadId)}/retry`, {});
export const deleteDocument = (uploadId: string) => request('DELETE', `/api/documents/${encodeURIComponent(uploadId)}`);

// EDUCATOR AI CHAT (P3): answers only from approved documents, with server-validated citations.
export interface ChatCitation { n: number; uploadId?: string; chunkId: string; fileName: string; page: number | null; section?: string }
export interface ChatDocument { uploadId: string; fileName: string; curriculumId: string; curriculumName: string | null; state: DocumentState; eligible: boolean; malwareScan?: WorkspaceDocument['malwareScan'] }
export interface ChatAnswer {
  conversationId: string;
  status: 'answered' | 'no_sources' | 'unsupported' | 'refused' | 'needs_clarification';
  answer: string;
  // Class analytics report (no documents selected; educator_analytics_enabled).
  analytics?: import('../components/AnalyticsReport').AnalyticsReportData;
  citations: ChatCitation[];
  usedUploadIds: string[];
  ineligible: { uploadId: string; fileName: string; state: string }[];
}
export const fetchChatDocuments = () => request<{ documents: ChatDocument[]; maxQuestionChars: number; analyticsEnabled?: boolean }>('GET', '/api/educator-chat/documents');
export const askEducatorChat = (params: { question: string; uploadIds: string[]; conversationId?: string; studentId?: string }) => request<ChatAnswer>('POST', '/api/educator-chat/ask', params);
export const fetchChatConversations = () => request<{ conversations: { id: string; title: string; updatedAt: string }[] }>('GET', '/api/educator-chat/conversations');
export const fetchChatConversation = (id: string) =>
  request<{ conversation: { id: string; title: string; messages: { role: 'user' | 'assistant'; text: string; status?: ChatAnswer['status']; citations?: ChatCitation[]; analytics?: ChatAnswer['analytics']; at: string }[] } }>('GET', `/api/educator-chat/conversations/${encodeURIComponent(id)}`);
export const deleteChatConversation = (id: string) => request('DELETE', `/api/educator-chat/conversations/${encodeURIComponent(id)}`);

// P5 usage (customer-facing; never ENARA's internal provider cost).
export type UsageCredits = { status: 'measured' | 'partial' | 'not_configured'; value: number | null; unknownOperations?: number };
export interface UsageGroup {
  key: string; label: string; operations: number; succeeded: number; failed: number; refused: number; cancelled: number; unpriced: number; usageUnknown: number;
  units: { inputTokens: number; outputTokens: number; characters: number; audioMinutes: number; avatarMinutes: number }; credits: UsageCredits;
}
export const fetchRequestUsage = (requestId: string) => request<{ state: 'measured' | 'none'; operations?: number; succeeded?: number; failed?: number; unpriced?: number; usageUnknown?: number; credits?: UsageCredits; features?: string[] }>('GET', `/api/usage/me/requests/${enc(requestId)}`);
export const fetchTodayUsage = (features: string[]) => request<{ operations: number; succeeded: number; unpriced: number; usageUnknown: number; credits: UsageCredits }>('GET', `/api/usage/me/today?features=${enc(features.join(','))}`);
export const fetchUsageReport = (params: { from?: string; to?: string; groupBy?: string; origin?: OriginView; page?: number }) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  return request<any>('GET', `/api/usage/report?${q}`);
};
export const fetchUsagePlan = () => request<any>('GET', '/api/usage/plan');
export const fetchUsageBudget = () => request<any>('GET', '/api/usage/budget');
export const saveCreditLimits = (limits: { dailyCredits?: number; monthlyCredits?: number; perUserDailyCredits?: number }) => request<any>('PUT', '/api/usage/budget/limits', limits);
export const fetchCurrentTools = () => request<{ items: any[] }>('GET', '/api/usage/current-tools');
export const addCurrentTool = (data: any) => request<{ item: any }>('POST', '/api/usage/current-tools', data);
export const updateCurrentTool = (id: string, data: any) => request<{ item: any }>('PUT', `/api/usage/current-tools/${enc(id)}`, data);
export const removeCurrentTool = (id: string) => request<void>('DELETE', `/api/usage/current-tools/${enc(id)}`);
export const fetchSavings = () => request<any>('GET', '/api/usage/savings');
export const simulateUsage = (data: { students?: number; staff?: number; quantities: Record<string, number> }) => request<any>('POST', '/api/usage/simulate', data);
