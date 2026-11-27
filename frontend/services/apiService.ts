import type { ApiKeyValidationResponse } from '../types';
import { OriginView, withOrigin } from './roleRouting';
import { retryDelayMs } from './retryPolicy';
import { createInflight } from './inflight';
import { createSseParser } from './sse';

// Single client for the Enara backend (backend/ in this repo).
//
// In the browser every call goes to /api/railway/<path>, which server.ts
// forwards to ${BACKEND_URL}/api/<path>. Set VITE_API_URL to point the
// browser somewhere else; it must be the URL that maps to the backend's /api.

const API_BASE = (import.meta.env.VITE_API_URL || '/api/railway').replace(/\/+$/, '');

const TOKEN_KEY = 'enara_token';
const USER_KEY = 'enara_user';

export type BackendRole = 'student' | 'teacher' | 'academic_manager' | 'admin' | 'enara-admin' | 'parent';

export interface SessionUser {
  email: string;
  role: BackendRole;
  name?: string;
  studentId?: string;
  institutionId?: string;
  // New accounts get the product tour once, until they finish or skip it.
  tourPending?: boolean;
  // 'kids' only for a student the school moved to the Enara Kids interface.
  uiMode?: 'standard' | 'kids';
  // P0 item 6: a student account that came from an LMS (while LMS launches are on).
  lmsAccount?: boolean;
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

// Demo sessions live in sessionStorage: closing the browser forgets them.
const DEMO_KEY = 'enara_demo';
export function isDemoSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1' && !!sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw && getToken() ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function saveSession(token: string, user: SessionUser, demo = false) {
  const store = demo ? sessionStorage : localStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
  if (demo) sessionStorage.setItem(DEMO_KEY, '1');
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(DEMO_KEY);
    sessionStorage.removeItem('enara_lms');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Keys used by older versions of the app.
    localStorage.removeItem('enara_railway_token');
    localStorage.removeItem('enara_railway_user');
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

// Re-reads the signed-in account (GET /api/auth/session) so changes made by
// staff, such as moving a student to Enara Kids, apply without signing in again.
export async function refreshSession(): Promise<SessionUser | null> {
  const token = getToken();
  if (!token) return null;
  const res = await request<{ user: SessionUser }>('GET', '/api/auth/session');
  if (res?.user) saveSession(token, res.user);
  return res?.user ?? null;
}

/** Full URL for a backend path (also used by the bus supervisor page, which signs its own requests). */
export function apiUrl(path: string): string { return toUrl(path); }

function toUrl(path: string): string {
  // Callers pass backend paths such as /api/students; the base already maps to /api.
  return `${API_BASE}${path.replace(/^\/api(?=\/|$)/, '')}`;
}

// One network exchange: the fetch, its retries (429/503 per retryDelayMs) and the body text.
type RawResponse = { ok: boolean; status: number; text: string; requestId: string | null };
async function send(method: string, path: string, headers: Record<string, string>, body: unknown, isForm: boolean): Promise<RawResponse> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(toUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    const wait = retryDelayMs(method, res.status, res.headers.get('Retry-After'), attempt);
    if (wait === null) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return { ok: res.ok, status: res.status, text: await res.text(), requestId: res.headers.get('X-Request-Id') };
}

// Speed (lms-speed-2): identical GETs already in flight share one network call (services/inflight.ts).
// Only the transport is shared: every caller parses its own copy of the body, so no caller sees
// another's changes, and errors are handled per caller as before.
const shareGet = createInflight<RawResponse>();
function sendShared(method: string, path: string, headers: Record<string, string>, body: unknown, isForm: boolean): Promise<RawResponse> {
  if (method !== 'GET' || body !== undefined) return send(method, path, headers, body, isForm);
  return shareGet(`${headers.Authorization ?? ''} ${path}`, () => send(method, path, headers, body, isForm));
}

async function request<T = any>(method: string, path: string, body?: unknown, isForm = false, retried = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const res = await sendShared(method, path, headers, body, isForm);
  const text = res.text;
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
    // Parents P1: a remembered parent device gets a fresh session token and the request is tried once more.
    if (res.status === 401 && token && !retried && !path.startsWith('/api/auth/') && !path.startsWith('/api/parents/device/') && getParentDeviceToken()) {
      if (await resumeParentDevice().catch(() => null)) return request<T>(method, path, body, isForm, true);
    }
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) {
      clearSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status, data?.error?.code);
  }
  // The server's request id (P5 usage chips); not enumerable, so it never
  // leaks into rendered or re-sent data.
  const requestId = res.requestId;
  if (requestId && data && typeof data === 'object') Object.defineProperty(data, '__requestId', { value: requestId, enumerable: false });
  return data as T;
}

export const requestIdOf = (value: unknown): string | null => (value && typeof value === 'object' ? ((value as { __requestId?: string }).__requestId ?? null) : null);

// AUTH
// Partner demo: one click opens a fresh demo school as this role.
export const DEMO_CHANGED_EVENT = 'enara-demo-changed';
export type DemoRole = 'student' | 'teacher' | 'admin';
export async function fetchDemoStatus(): Promise<{ available: boolean; full: boolean }> {
  return request('GET', '/api/demo/status');
}
export async function startDemo(role: DemoRole): Promise<SessionUser> {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
  const data = await request<{ token: string; user: SessionUser }>('POST', '/api/demo/start', { role });
  saveSession(data.token, data.user, true);
  window.dispatchEvent(new Event(DEMO_CHANGED_EVENT));
  return data.user;
}
export async function switchDemoRole(role: DemoRole): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser }>('POST', '/api/demo/switch', { role });
  saveSession(data.token, data.user, true);
  return data.user;
}
export async function demoHeartbeat(): Promise<void> {
  await request('POST', '/api/demo/heartbeat');
}
export async function endDemo(): Promise<void> {
  await request('POST', '/api/demo/end').catch(() => undefined);
  clearSession();
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser }>('POST', '/api/auth/login', {
    email: email.trim(),
    password,
  });
  saveSession(data.token, data.user);
  return data.user;
}

// Parents Portal sign-up: the server always creates a 'parent' account.
export async function registerParent(name: string, email: string, password: string, language: 'en' | 'ar'): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser }>('POST', '/api/parents/register', { name: name.trim(), email: email.trim(), password, language });
  saveSession(data.token, data.user);
  return data.user;
}

// Parents Portal: which sign-in methods to offer. The Google client ID is public.
export async function fetchParentAuthConfig(): Promise<{ google: boolean; clientId?: string; codeSignup?: boolean; emailSignin?: boolean }> {
  return request('GET', '/api/parents/auth-config');
}

// Parents Portal "Continue with Google": the Google ID token (GIS credential) is
// verified on the server, which signs in or creates a 'parent' account only.
export async function googleParentSignIn(credential: string, language: 'en' | 'ar'): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser; created: boolean }>('POST', '/api/parents/google', { credential, language });
  saveSession(data.token, data.user);
  return data.user;
}

// ---------------------------------------------------------------------------
// Parents P1 (PARENT_CODE_SIGNUP_ENABLED): code-first entry and the remembered
// device. The device token lives in this browser only (localStorage) and is
// exchanged for a short session token; the link code is only ever sent in a
// request body, never put in a URL.
const PARENT_DEVICE_KEY = 'enara_parent_device';
export function getParentDeviceToken(): string | null {
  try { return localStorage.getItem(PARENT_DEVICE_KEY); } catch { return null; }
}
export function setParentDeviceToken(token: string | null): void {
  try { if (token) localStorage.setItem(PARENT_DEVICE_KEY, token); else localStorage.removeItem(PARENT_DEVICE_KEY); } catch { /* storage unavailable */ }
}
export async function previewStartCode(code: string): Promise<{ learner: string; school: string | null }> {
  return request('POST', '/api/parents/start/preview', { code });
}
export async function startWithCode(code: string, language: 'en' | 'ar'): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser; deviceToken: string }>('POST', '/api/parents/start', { code, language });
  saveSession(data.token, data.user);
  setParentDeviceToken(data.deviceToken);
  return data.user;
}
// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED): passwordless sign-in with a 6-digit code by email.
export async function parentEmailSignInStart(email: string, language: 'en' | 'ar'): Promise<{ sent: boolean }> {
  return request('POST', '/api/parents/email/sign-in/start', { email: email.trim(), language });
}
export async function parentEmailSignInVerify(email: string, code: string): Promise<SessionUser> {
  const data = await request<{ token: string; user: SessionUser; deviceToken: string }>('POST', '/api/parents/email/sign-in/verify', { email: email.trim(), code });
  saveSession(data.token, data.user);
  setParentDeviceToken(data.deviceToken);
  return data.user;
}
/** After a merge the device continues as the account that has the email. */
export function adoptParentSession(data: { token: string; user: SessionUser; deviceToken: string }): void {
  saveSession(data.token, data.user);
  setParentDeviceToken(data.deviceToken);
}
let resuming: Promise<SessionUser | null> | null = null;
/** A fresh session for a remembered parent device; null (and the device forgotten) when it no longer works. */
export function resumeParentDevice(): Promise<SessionUser | null> {
  const deviceToken = getParentDeviceToken();
  if (!deviceToken) return Promise.resolve(null);
  resuming ??= (async () => {
    try {
      const res = await fetch(toUrl('/api/parents/device/session'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceToken }) });
      if (res.status === 401) { setParentDeviceToken(null); return null; }
      if (!res.ok) return null;
      const data = (await res.json()) as { token: string; user: SessionUser };
      saveSession(data.token, data.user);
      try { localStorage.setItem('enara_ui_role', 'parent'); } catch { /* storage unavailable */ }
      return data.user;
    } finally {
      resuming = null;
    }
  })();
  return resuming;
}

// Parents P1 (PARENT_SETTINGS_ENABLED; the API answers 404 when off): parent access per school and usage.
export type ParentAccess = 'off' | 'free';
export interface ParentsSchoolRow {
  id: string; name: string; status: string; access: ParentAccess; accessUpdatedAt: string | null;
  usage: { linkedParents: number; active7: number; active30: number; logins30: number; topScreens: { screen: string; views: number }[] };
}
export interface ParentsAdminStatus { enabled: boolean; usage: boolean; canChangeAccess: boolean; codeTools: boolean; settings?: { codeTtlDays: number; teachersMayIssueCodes: boolean; showResults?: 'immediately' | 'after_release'; emails?: { linkConfirmed: boolean; weeklySummary: boolean; newResults: boolean; linkEnded: boolean }; csvInvites?: boolean }; canChangeSettings?: boolean; settingsAvailable?: { codes: boolean; results: boolean; emails?: boolean; csv?: boolean }; csvInvites?: boolean }
export const fetchParentsAdminStatus = () => request<ParentsAdminStatus>('GET', '/api/parents-admin/status');
// Parents P2 (PARENT_CODE_TOOLS_ENABLED): school code settings and class code sheets. A sheet's codes are
// in the response body only and shown once (never in a URL).
export interface ParentCodeSheet { class: { id: string; name: string }; school: string | null; batchId: string; expiresAt: string; revoked: number; rows: { studentId: string; studentName: string; code: string; codeId: string }[] }
export const saveSchoolParentSettings = (institutionId: string, body: { codeTtlDays?: number; teachersMayIssueCodes?: boolean; showResults?: 'immediately' | 'after_release'; emails?: Record<string, boolean>; csvInvites?: boolean }) =>
  request<{ institutionId: string; codeTtlDays: number; teachersMayIssueCodes: boolean; showResults: 'immediately' | 'after_release' }>('PUT', `/api/parents-admin/schools/${encodeURIComponent(institutionId)}/settings`, body);
export const fetchCodeClasses = () => request<{ classes: { id: string; name: string; students: number; activeCodes: number }[] }>('GET', '/api/parents-admin/classes');
export const printClassCodes = (classId: string) => request<ParentCodeSheet>('POST', `/api/parents-admin/classes/${encodeURIComponent(classId)}/code-sheet`);
// Parents P5 (PARENT_CSV_INVITES_ENABLED): CSV invitations. The CSV text goes in the request body (never stored);
// addresses come back masked; codes are only ever in the parents' emails.
export type CsvRowStatus = 'ok' | 'bad_email' | 'unknown_student' | 'archived' | 'duplicate' | 'missing';
export interface CsvRow { row: number; studentRef: string; status: CsvRowStatus; studentName?: string; email?: string }
export const previewCsvInvites = (csv: string) => request<{ rows: CsvRow[]; counts: Record<CsvRowStatus, number>; emails: number }>('POST', '/api/parents-admin/csv-invites/preview', { csv });
export const sendCsvInvites = (csv: string) => request<{ batchId: string; invited: number; emails: number; rows: CsvRow[] }>('POST', '/api/parents-admin/csv-invites', { csv });
export const fetchCsvInvites = () => request<{ invites: { id: string; studentName: string | null; email: string; status: 'sent' | 'redeemed' | 'expired' | 'revoked'; createdAt: string; resentAt: string | null }[] }>('GET', '/api/parents-admin/csv-invites');
export const resendCsvInvite = (id: string) => request<{ ok: boolean; emailStatus: string }>('POST', `/api/parents-admin/csv-invites/${encodeURIComponent(id)}/resend`);
export const revokeCsvInvite = (id: string) => request<{ ok: boolean }>('POST', `/api/parents-admin/csv-invites/${encodeURIComponent(id)}/revoke`);
export const revokeClassCodes = (classId: string) => request<{ revoked: number }>('POST', `/api/parents-admin/classes/${encodeURIComponent(classId)}/codes/revoke`);
export const fetchParentsAdminSchools = () => request<{ generatedAt: string; canChangeAccess: boolean; schools: ParentsSchoolRow[] }>('GET', '/api/parents-admin/schools');
export const setSchoolParentAccess = (institutionId: string, access: ParentAccess) =>
  request<{ institutionId: string; access: ParentAccess }>('PUT', `/api/parents-admin/schools/${encodeURIComponent(institutionId)}/access`, { access });

// Shared client for the Parents Portal (frontend/parents) and its admin panel.
export function apiRequest<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body);
}

// School admin: parent link codes for a learner (Parents Portal).
export interface ParentCodeList {
  /** lms-test: "Send code by email" is blocked until a later step (backend parents/emailBlock.ts). */
  parentEmail?: { blocked: boolean; code?: string; message?: { en: string; ar: string } };
  codes: { id: string; display: string; hint: string; expiresAt: string; createdAt: string }[];
  // status 'ended' (kept for history): endedAt and endReason are set.
  links: { linkId: string; parentName: string; parentEmail: string | null; role: 'owner' | 'full' | 'view'; status: string; consent: string; createdAt: string; endedAt?: string | null; endReason?: string | null }[];
}
export const fetchParentCodes = (studentId: string) => request<ParentCodeList>('GET', `/api/students/${encodeURIComponent(studentId)}/parent-codes`);
export const createParentCode = (studentId: string, sendToEmail?: string) =>
  request<{ id: string; code: string; expiresAt: string; emailed?: { ok: boolean; reason?: string } }>('POST', `/api/students/${encodeURIComponent(studentId)}/parent-codes`, sendToEmail ? { sendToEmail } : {});
export const revokeParentCode = (studentId: string, codeId: string) => request('DELETE', `/api/students/${encodeURIComponent(studentId)}/parent-codes/${encodeURIComponent(codeId)}`);
export const removeParentLink = (studentId: string, linkId: string) => request('DELETE', `/api/students/${encodeURIComponent(studentId)}/parent-links/${encodeURIComponent(linkId)}`);

// The product tour was finished or skipped: remembered on the account (so it
// doesn't come back on another device) and in the stored session.
export async function completeTour(): Promise<void> {
  try {
    for (const store of [sessionStorage, localStorage]) {
      const raw = store.getItem(USER_KEY);
      if (raw) store.setItem(USER_KEY, JSON.stringify({ ...JSON.parse(raw), tourPending: false }));
    }
  } catch { /* storage unavailable: the server copy still counts */ }
  await request('POST', '/api/auth/tour/complete').catch(() => undefined);
}

// Signs out on the server too (S-1): every token of the account stops
// working, on every device. Best effort; the local session is cleared anyway.
export function logout() {
  // Signing out of a demo ends it (its school is wiped).
  if (isDemoSession()) {
    void endDemo();
    return;
  }
  if (getToken()) void request('POST', '/api/auth/logout').catch(() => undefined);
  clearSession();
  // Signing out forgets this parent device too (the server logout also ends every device session).
  setParentDeviceToken(null);
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
  // 'kids' gives the student the Enara Kids interface.
  uiMode?: 'standard' | 'kids';
}) => request('POST', '/api/students', data);
export const updateStudent = (id: string, data: any) => request('PATCH', `/api/students/${encodeURIComponent(id)}`, data);
export const deleteStudent = (id: string) => request('DELETE', `/api/students/${encodeURIComponent(id)}`);

// STUDENT PHOTOS — admins set a photo at once; a student's own upload waits for a school admin.
export interface PendingPhoto { id: string; name: string; avatar: string; photoUrl: string | null; pendingPhotoUrl: string | null; pendingPhotoAt: string | null }
const photoForm = (file: File) => { const form = new FormData(); form.append('photo', file); return form; };
export const setStudentPhoto = (id: string, file: File) =>
  request<PendingPhoto>('PUT', `/api/students/${encodeURIComponent(id)}/photo`, photoForm(file), true);
export const fetchPendingPhotos = () => request<PendingPhoto[]>('GET', '/api/students/photos/pending');
export const approveStudentPhoto = (id: string) => request<PendingPhoto>('POST', `/api/students/${encodeURIComponent(id)}/photo/approve`);
export const rejectStudentPhoto = (id: string) => request<PendingPhoto>('POST', `/api/students/${encodeURIComponent(id)}/photo/reject`);
export const uploadMyPhoto = (file: File) =>
  request<{ photoUrl: string | null; photoPending: boolean }>('POST', '/api/me/photo', photoForm(file), true);

// CURRICULUMS (admin)
export const fetchCurriculums = () => request<any[]>('GET', '/api/curriculums');
export const getCurriculum = (id: string) => request('GET', `/api/curriculums/${encodeURIComponent(id)}`);
export const createCurriculum = (data: any) => request('POST', '/api/curriculums', data);
export const updateCurriculum = (id: string, data: any) => request('PATCH', `/api/curriculums/${encodeURIComponent(id)}`, data);
export const deleteCurriculum = (id: string) => request('DELETE', `/api/curriculums/${encodeURIComponent(id)}`);
export const deployCurriculum = (id: string) => request('PATCH', `/api/curriculums/${encodeURIComponent(id)}/deploy`, {});
export const assignBatchToCurriculum = (id: string, batchId: string) =>
  request('POST', `/api/curriculums/${encodeURIComponent(id)}/assign-batch`, { batchId });
// Teachers publish their own curriculum to a class they teach (P1 route).
export const publishCurriculumToClass = (id: string, classId: string) =>
  request<{ classId: string; curriculumId: string }>('POST', `/api/curriculums/${encodeURIComponent(id)}/publish-to-class`, { classId });
export const unassignBatchFromCurriculum = (id: string, batchId: string) =>
  request('DELETE', `/api/curriculums/${encodeURIComponent(id)}/batches/${encodeURIComponent(batchId)}`);
// Files go straight to storage with a signed URL: the hosting platform refuses
// API request bodies over 4.5 MB. Without remote storage (local development)
// the server answers 503 and the file is sent through the API as before.
function putToStorage(url: string, contentType: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status)));
    xhr.onerror = () => reject(new ApiError('Upload failed (network error)', 0));
    xhr.send(file);
  });
}

async function directUpload<T>(start: string, startBody: Record<string, unknown>, complete: string, completeBody: Record<string, unknown>, file: File, fallback: () => Promise<T>): Promise<T> {
  let target: { uploadUrl: string; storedName: string; contentType: string };
  try {
    target = await request('POST', start, { ...startBody, fileName: file.name, size: file.size });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UPLOAD_STORAGE_UNAVAILABLE') return fallback();
    throw error;
  }
  await putToStorage(target.uploadUrl, target.contentType, file);
  return request<T>('POST', complete, { ...completeBody, storedName: target.storedName, fileName: file.name });
}

export const fetchTutorVisual = (params: { lessonTitle?: string; lessonText?: string; courseId?: string; prompt?: string }) =>
  request<{ html: string }>('POST', '/api/me/tutor/visualize', params);

export function uploadChapterFile(curriculumId: string, chapterId: string, file: File) {
  const base = `/api/curriculums/${encodeURIComponent(curriculumId)}/chapters/${encodeURIComponent(chapterId)}`;
  return directUpload<any>(`${base}/file-uploads`, {}, `${base}/file-uploads/complete`, {}, file, () => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', `${base}/uploads`, form, true);
  });
}

// Lesson videos: compressed in the browser, then PUT straight to R2 with a signed
// URL (they're too large to pass through the API), then attached to the chapter.
// A lesson's practice quiz (the knowledge check students see after the lesson).
// correctAnswer is the index of the right option; an empty list removes the quiz.
export type ChapterQuizQuestion = { id?: string; text: string; options: string[]; correctAnswer: number; explanation?: string };
export const setChapterQuiz = (curriculumId: string, chapterId: string, questions: ChapterQuizQuestion[]) =>
  request('PUT', `/api/curriculums/${encodeURIComponent(curriculumId)}/chapters/${encodeURIComponent(chapterId)}/quiz`, { questions });
// An AI draft of the quiz from the saved chapter (description and documents); not saved until setChapterQuiz.
export const generateChapterQuiz = (curriculumId: string, chapterId: string, count = 5) =>
  request<{ questions: ChapterQuizQuestion[] }>('POST', `/api/curriculums/${encodeURIComponent(curriculumId)}/chapters/${encodeURIComponent(chapterId)}/quiz/generate`, { count });

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

/** Downloads a file from an authenticated API route (for example a school fee receipt) and saves it on the device. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(toUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw Object.assign(new Error(`Download failed (${res.status})`), { status: res.status });
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    /** Multi-class (Q9): only for a student in several classes. */
    groupIds?: string[];
    /** Multi-class (Q9): last 30 days' AI use by the class it happened in; classId null = "No class". */
    usageByClass?: Array<{ classId: string | null; className: string; credits: number; events: number }>;
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
// Assessment engine P1b: the learner's screen language (ar | en), saved on the account.
export const saveMyUiLanguage = (language: 'ar' | 'en') => request<{ uiLanguage: 'ar' | 'en' }>('PUT', '/api/me/ui-language', { language });
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
/** kidsSpeaking (environment switch): may the kids app show the chat microphone and the live call. */
export const getTutorSpeaking = () => request<{ microphone: boolean; liveCall: boolean }>('GET', '/api/me/tutor/speaking');
// liveTimeUsed: live tutor calls used and left today, minutes used today and the longest a call may run (null: no limit).
export interface LiveUsage { callsUsedToday: number; callsLeftToday: number; dailyLimit: number; secondsUsedToday: number; minutesUsedToday: number; maxCallSeconds: number | null }
// null when the switch is off (404) or the account isn't a learner: the screens then look as before.
export const fetchMyLiveUsage = (): Promise<LiveUsage | null> =>
  request<LiveUsage>('GET', '/api/me/tutor/live-usage').catch(() => null);
export const listTutorSessions = () => request<any[]>('GET', '/api/me/tutor/sessions');
export const getTutorSession = (id: string) => request('GET', `/api/me/tutor/sessions/${encodeURIComponent(id)}`);
export const createTutorSession = (courseId?: string, lessonId?: string, title?: string) =>
  request('POST', '/api/me/tutor/sessions', { courseId, lessonId, title });
export const sendTutorMessage = (sessionId: string, text: string, context?: any) =>
  request('POST', `/api/me/tutor/sessions/${encodeURIComponent(sessionId)}/messages`, { text, context });
export const deleteTutorSession = (id: string) => request('DELETE', `/api/me/tutor/sessions/${encodeURIComponent(id)}`);

// The tutor reply streamed as it is written (P20). onText gets the reply so far
// on every update; resolves with the saved assistant message. Errors before
// the stream starts are ApiErrors like any request; never re-sent.
export async function streamTutorMessage(sessionId: string, text: string, context: any, onText: (soFar: string) => void): Promise<any> {
  const token = getToken();
  const res = await fetch(toUrl(`/api/me/tutor/sessions/${encodeURIComponent(sessionId)}/messages/stream`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text, context }),
  });
  if (!res.ok || !res.body) {
    let data: any = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(data?.error?.message || data?.message || `Request failed (${res.status})`, res.status, data?.error?.code);
  }
  let soFar = '';
  let done: any = null;
  let failure: { code?: string; message?: string } | null = null;
  const feed = createSseParser((e) => {
    if (e.type === 'token') { soFar += e.delta ?? ''; onText(soFar); }
    else if (e.type === 'replace') { soFar = e.text ?? ''; onText(soFar); }
    else if (e.type === 'done') done = e;
    else if (e.type === 'error') failure = e;
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    feed(decoder.decode(value, { stream: true }));
  }
  feed(decoder.decode());
  if (failure) throw new ApiError((failure as { message?: string }).message || 'The tutor could not finish this reply.', 503, (failure as { code?: string }).code);
  if (!done) throw new ApiError('The connection to the tutor was interrupted.', 503, 'TUTOR_STREAM_INTERRUPTED');
  return done;
}

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
// Learner memory phase 1 (ENARA_ENGINE_V2 workOn): a learner's errors to work on (404 when the switch is off).
export interface ErrorToWorkOnView {
  id: string; objective: { id: string; code: string | null; title: string | null }; error: string; errorCode: string; occurrences: number;
  firstSeenAt: string; lastSeenAt: string; status: 'open' | 'resolved' | 'dismissed'; rightStreak: number; waitingForRelease: boolean;
}
export const fetchErrorsToWorkOn = (studentId = 'me') =>
  request<{ errors: ErrorToWorkOnView[] }>('GET', `/api/learning/students/${encodeURIComponent(studentId)}/errors-to-work-on`);
export const dismissErrorToWorkOn = (id: string, note?: string) =>
  request<{ id: string; status: string }>('PATCH', `/api/learning/errors-to-work-on/${encodeURIComponent(id)}`, { status: 'dismissed', ...(note ? { note } : {}) });
// Learner memory phases 2-4 (sessionMemory / learnerProfile / whatWorks; each 404 when off).
export interface SessionSummaryView { sessionId: string; startedAt: string; endedAt: string; objectiveId: string | null; right: number; wrong: number; stuckOn: string | null; stoppedWithOpenItem: boolean; nextStep: 'reteach' | 'finish_item' | 'next_point' }
export interface LearnerProfileView { studentId: string; firstLanguage: string | null; interests: string[]; accommodations: string[]; options: { firstLanguages: string[]; interests: string[]; accommodations: string[] } }
export interface StudyHabitsView { activeDays: number; sessions: number; avgMinutesPerActiveDay: number; usualTime: string | null; daysSinceLast: number | null; longestGapDays: number; returnedAfterGap: boolean }
export interface WhatWorksView { methods: { method: string; sessions: number; withIndependentSuccess: number; rate: number }[]; explanationStylesBeforeSuccess: { style: string; count: number }[]; note: string }
const LS = (id: string) => `/api/learning/students/${encodeURIComponent(id)}`;
export const fetchSessionSummaries = (studentId: string) => request<{ sessions: SessionSummaryView[] }>('GET', `${LS(studentId)}/session-summaries`);
export const fetchMemoryProfile = (studentId: string) => request<LearnerProfileView>('GET', `${LS(studentId)}/profile`);
export const updateMemoryProfile = (studentId: string, patch: Partial<Pick<LearnerProfileView, 'firstLanguage' | 'interests' | 'accommodations'>>) => request<LearnerProfileView>('PUT', `${LS(studentId)}/profile`, patch);
export const fetchStudyHabits = (studentId: string) => request<{ habits: StudyHabitsView | null }>('GET', `${LS(studentId)}/study-habits`);
export interface MemoryReportView {
  period: { days: number; from: string; to: string };
  errorsToWorkOn: { recorded: number; open: number; resolved: number; reopened: number; dismissed: number; learnersWithOpen: number; fromPractice: number; practiceItemsSetByTutor: number };
  sessions: { summarised: number; right: number; wrong: number; stoppedWithOpenItem: number; nextStep: Record<string, number> };
  profiles: { withFirstLanguage: number; withInterests: number; withAccommodations: number };
  habits: { activeLearners: number; minutes: number };
  tutorReplies: { total: number; guardRemovals: Record<string, number> };
}
export const fetchMemoryReport = (days = 7) => request<MemoryReportView>('GET', `/api/learning/memory-report?days=${days}`);
export const fetchWhatWorks = (studentId: string) => request<WhatWorksView>('GET', `${LS(studentId)}/what-works`);
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

/** LMS Phase 3 follow-up: the LMS activity an assignment belongs to (only when LMS launches are on). */
export interface LinkedLmsActivity {
  resourceLinkId: string; platformName: string; activityTitle: string | null; courseTitle: string | null; courseUrl: string | null;
  mayBeDeleted: boolean; reason: 'lineitem_gone' | 'stale' | null; lineItemGoneAt: string | null; lastLaunchAt: string | null; lastResultAt: string | null;
}
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
// Grade ledger (GRADE_LEDGER_ENABLED): one student's grade history on one assignment, and the
// teacher's choice for a grade changed in the LMS.
export const fetchGradeHistory = (assignmentId: string, studentId: string) =>
  request<any>('GET', `/api/assignments/${enc(assignmentId)}/students/${enc(studentId)}/grade-history`);
export const decideLmsGrade = (assignmentId: string, studentId: string, resourceLinkId: string, keep: 'lms' | 'enara') =>
  request<{ resolution: string; queued: number }>('POST', `/api/assignments/${enc(assignmentId)}/students/${enc(studentId)}/lms-decision`, { resourceLinkId, keep });

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
// P21 teaching effectiveness (descriptive, never a ranking or a causal claim; no costs).
export const fetchTeachingEffectiveness = (params: { classId?: string; origin?: OriginView; dimension?: string; composition?: boolean } = {}) => {
  const q = new URLSearchParams();
  if (params.classId) q.set('classId', params.classId);
  if (params.origin) q.set('origin', params.origin);
  if (params.dimension) q.set('dimension', params.dimension);
  if (params.composition) q.set('composition', '1');
  return request<any>('GET', `/api/learning/analytics/teaching-effectiveness${q.toString() ? `?${q}` : ''}`);
};
export const fetchStudentTeachingImpact = (studentId = 'me') => request<any>('GET', `/api/learning/students/${enc(studentId)}/teaching-impact`);
export const fetchStudentTimeline = (studentId: string) => request<{ studentId: string; events: { at: string; type: string; ref: string; detail?: any }[] }>('GET', `/api/learning/students/${enc(studentId)}/timeline`);
export const fetchMyAssignmentResult = (id: string, attemptId: string) => request<any>('GET', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/result`);
export const appealMyResult = (id: string, attemptId: string, message: string, questionId?: string) =>
  request<any>('POST', `/api/me/assignments/${enc(id)}/attempts/${enc(attemptId)}/appeals`, { message, questionId });
export const fetchTeachingClasses = () => request<{ classes: { id: string; courseName: string; curriculumId: string | null; curriculumName: string | null }[] }>('GET', '/api/assignments/classes');
// Which AI tools the caller's school has on (yes/no only), so pages can hide
// a button rather than fail after it is pressed.
export type TeachingFeatures = { aiAssessmentDrafts: boolean; aiLessonPlans: boolean; documents: boolean };
export const fetchTeachingFeatures = () => request<TeachingFeatures>('GET', '/api/teaching/features');
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
  const ids = { curriculumId: params.curriculumId, lessonId: params.lessonId };
  return directUpload<{ document: WorkspaceDocument }>('/api/documents/direct-upload', ids, '/api/documents/direct-upload/complete', { ...ids, rightsAttested: params.rightsAttested }, params.file, () => uploadDocumentThroughApi(params));
}
function uploadDocumentThroughApi(params: { file: File; curriculumId: string; lessonId: string; rightsAttested: boolean }) {
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

// Accounts (P22): invitation links, password reset, and the school's people.
export const acceptInvitation = (token: string, password: string, name?: string) =>
  request<{ user: { email: string; role: string; name?: string } }>('POST', '/api/workspace/invitations/accept', { token, password, ...(name ? { name } : {}) });
export const requestPasswordReset = (email: string) => request<unknown>('POST', '/api/auth/password-reset/request', { email });
export const confirmPasswordReset = (token: string, password: string) => request<{ ok: boolean }>('POST', '/api/auth/password-reset/confirm', { token, password });
export interface WorkspaceUser { id: string; email: string; name?: string; role: string; status: 'active' | 'disabled'; origin?: string }
export interface WorkspaceInvitation { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string; expired?: boolean }
export const fetchWorkspaceUsers = () => request<{ users: WorkspaceUser[] }>('GET', '/api/workspace/users');
export const setWorkspaceUserStatus = (id: string, status: 'active' | 'disabled') => request<{ id: string; status: string }>('PUT', `/api/workspace/users/${encodeURIComponent(id)}/status`, { status });
export const fetchWorkspaceInvitations = () => request<{ invitations: WorkspaceInvitation[] }>('GET', '/api/workspace/invitations');
export const createWorkspaceInvitation = (email: string, role: string) => request<{ inviteLink: string; invitation: WorkspaceInvitation }>('POST', '/api/workspace/invitations', { email, role });
export const revokeWorkspaceInvitation = (id: string) => request<void>('DELETE', `/api/workspace/invitations/${encodeURIComponent(id)}`);

// Trusted learner age band (Option B). Workspace Admin edits; Academic Manager views.
export type LearnerAgeBandValue = 'child' | 'teen' | 'adult';
export interface AgeBandOverview {
  values: LearnerAgeBandValue[];
  adultSchool: boolean;
  canEdit: boolean;
  classes: { id: string; name: string; ageBand: LearnerAgeBandValue | null }[];
  students: {
    id: string;
    name: string;
    classId: string | null;
    ageBand: LearnerAgeBandValue | null;
    classAgeBand: LearnerAgeBandValue | null;
    effective: { ageBand: LearnerAgeBandValue | 'unknown'; source: string; status: string };
  }[];
}
export const fetchAgeBands = () => request<AgeBandOverview>('GET', '/api/age-bands');
export const setStudentAgeBand = (id: string, ageBand: LearnerAgeBandValue | null) =>
  request<{ id: string; ageBand: LearnerAgeBandValue | null }>('PUT', `/api/age-bands/students/${encodeURIComponent(id)}`, { ageBand });
export const setClassAgeBand = (id: string, ageBand: LearnerAgeBandValue | null) =>
  request<{ id: string; ageBand: LearnerAgeBandValue | null }>('PUT', `/api/age-bands/classes/${encodeURIComponent(id)}`, { ageBand });

// LMS (docs/lms/PHASE_1A_NOTES.md). A launch from an LMS arrives at
// /lms/launch#lt=<one-time token>; the token is exchanged once for a normal
// session, kept in sessionStorage (per tab, and it works inside the LMS
// iframe without third-party cookies).
export interface LmsLaunchInfo {
  purpose: 'launch' | 'handoff';
  role: 'student' | 'teacher' | 'admin';
  classId: string | null;
  /** The LMS activity (ENARA's own id for it); "Open in new tab" carries it so the new tab opens the same activity. */
  resourceLinkId?: string | null;
  presentation: 'iframe' | 'window';
  cookieless: boolean;
  /** Student preview by a staff account: read-only, nothing is saved. */
  preview?: boolean;
  /** Phase 3: the ENARA work the LMS activity is bound to; the app opens it. A new tab may reopen a page instead. */
  target?: { kind: 'assignment'; assignmentId: string } | { kind: 'page'; page: string } | null;
}
const LMS_KEY = 'enara_lms';
const LMS_TARGET_KEY = 'enara_lms_target';
type LmsExchange = { token: string; user: SessionUser; launch: LmsLaunchInfo };
function storeLmsSession(data: LmsExchange): boolean {
  try {
    const target = data.launch.target ?? null;
    const assignmentId = target?.kind === 'assignment' ? target.assignmentId : null;
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(LMS_KEY, JSON.stringify({
      classId: data.launch.classId,
      presentation: data.launch.presentation,
      ...(data.launch.preview ? { preview: true } : {}),
      ...(assignmentId ? { assignmentId } : {}),
      ...(data.launch.resourceLinkId ? { resourceLinkId: data.launch.resourceLinkId } : {}),
    }));
    if (target) sessionStorage.setItem(LMS_TARGET_KEY, JSON.stringify({ ...(assignmentId ? { assignmentId } : { page: (target as { page: string }).page }), classId: data.launch.classId }));
    else sessionStorage.removeItem(LMS_TARGET_KEY);
    return true;
  } catch {
    return false; // storage blocked in this frame: the page offers "Open in new tab"
  }
}
export async function exchangeLmsLaunch(token: string): Promise<LmsExchange & { stored: boolean }> {
  const data = await request<LmsExchange>('POST', '/api/lms/launch/exchange', { token });
  return { ...data, stored: storeLmsSession(data) };
}
/** The new tab's side of "Open in new tab": trades the one-time code (#hc=...) once for its own session. */
export async function exchangeLmsHandoff(code: string): Promise<LmsExchange & { stored: boolean }> {
  const data = await request<LmsExchange>('POST', '/api/lms/launch/handoff/exchange', { code });
  return { ...data, stored: storeLmsSession(data) };
}
export function isLmsSession(): boolean {
  try {
    return !!sessionStorage.getItem(LMS_KEY) && !!sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}
/** A staff account previewing the student view from the LMS (the server refuses every write). */
export function isLmsPreview(): boolean {
  try {
    return isLmsSession() && JSON.parse(sessionStorage.getItem(LMS_KEY) || '{}').preview === true;
  } catch {
    return false;
  }
}
export type LmsLandingTarget = { assignmentId?: string; page?: string; classId: string | null };
/** The ENARA work (or page) the LMS launch asked to open (once: reading it clears it). */
export function takeLmsTarget(): LmsLandingTarget | null {
  try {
    const raw = sessionStorage.getItem(LMS_TARGET_KEY);
    sessionStorage.removeItem(LMS_TARGET_KEY);
    const t = raw ? JSON.parse(raw) : null;
    const classId = t && typeof t.classId === 'string' ? t.classId : null;
    if (t && typeof t.assignmentId === 'string') return { assignmentId: t.assignmentId, classId };
    if (t && typeof t.page === 'string') return { page: t.page, classId };
    return null;
  } catch {
    return null;
  }
}
/** The ENARA class of this LMS session (the course's class), if any. */
export function lmsSessionClassId(): string | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(LMS_KEY) || '{}').classId;
    return typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}
/** LMS Phase 8: tutor, live avatar and diagnostic activities (no grade). */
export type LmsActivityKind = 'tutor' | 'avatar' | 'diagnostic';
export interface LmsActivityStatus {
  kind: LmsActivityKind;
  ready: boolean;
  /** Why it cannot start (activity_provider_not_configured, activity_ai_paused, ...). */
  code: string | null;
  graded: false;
  needsMicrophone: boolean;
  classId: string | null;
  /** Staff with a class: what the class did with this activity in the last days. */
  overview: { classId: string; className: string | null; students: number; days: number; studentsStarted: number; sessions: number; completed?: number } | null;
}
export const fetchLmsActivity = (kind: LmsActivityKind, classId?: string | null) =>
  request<LmsActivityStatus>('GET', `/api/lms/activities/${kind}${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`);
/** Where "Open in new tab" should land: an assignment, or a page of the app. */
export interface LmsNewTabTarget {
  classId?: string | null;
  assignmentId?: string | null;
  resourceLinkId?: string | null;
  page?: string | null;
}
/**
 * The new-tab target for this LMS session: the activity it was launched for,
 * or the given assignment or page. The LMS activity is carried only when it
 * opens that same assignment (the server refuses a mismatch).
 */
export function lmsNewTabTarget(want: { assignmentId?: string | null; page?: string | null } = {}): LmsNewTabTarget {
  let info: { classId?: string | null; assignmentId?: string | null; resourceLinkId?: string | null } = {};
  try {
    info = JSON.parse(sessionStorage.getItem(LMS_KEY) || '{}');
  } catch { /* none */ }
  const assignmentId = want.assignmentId ?? (want.page ? null : info.assignmentId ?? null);
  const sameActivity = !!assignmentId && assignmentId === info.assignmentId;
  return {
    classId: info.classId ?? null,
    assignmentId,
    resourceLinkId: sameActivity || (!assignmentId && !want.page) ? info.resourceLinkId ?? null : null,
    page: assignmentId ? null : want.page ?? null,
  };
}
/** "Open in new tab": a fresh one-time link (60 seconds, used once) for this LMS account, landing on the same step. */
export async function lmsNewTabUrl(target: LmsNewTabTarget = {}, bearer?: string): Promise<string> {
  const body: Record<string, string> = {};
  if (target.classId) body.classId = target.classId;
  if (target.assignmentId) body.assignmentId = target.assignmentId;
  if (target.resourceLinkId) body.resourceLinkId = target.resourceLinkId;
  if (target.page) body.page = target.page;
  const res = await fetch(toUrl('/api/lms/launch/handoff'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer ?? getToken() ?? ''}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.message || 'Could not open a new tab', res.status, data?.error?.code);
  return data.url as string;
}
/**
 * Mic telemetry (IDs only): one mic check outcome or "new tab opened", counted
 * per school by the server. Fire and forget; never signs anyone out.
 */
export function reportMicTelemetry(event: { event: string; browserFamily: string; inFrame: boolean; feature?: string }, bearer?: string): void {
  const token = bearer ?? getToken();
  if (!token) return;
  try {
    void fetch(toUrl('/api/lms/telemetry/mic'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* telemetry never gets in the way */
  }
}

export interface LmsPlatformView {
  id: string; institutionId: string; vendor: string; issuer: string; clientId: string;
  authLoginUrl: string | null; authTokenUrl: string | null; keysetUrl: string | null; hasPublicKey?: boolean;
  status: 'pending' | 'active' | 'disabled' | 'rejected'; registeredVia?: 'dynamic' | 'manual' | 'google_oauth'; createdAt: string; approvedAt: string | null;
  rejectedReason?: string | null; rejectedAt?: string | null;
  launchCount: number; cookielessLaunchCount: number; storageLaunchCount?: number; lastLaunchAt: string | null;
  deployments: { id: string; deploymentId: string; status: 'pending' | 'active' | 'disabled' }[];
}
export interface LmsStatus {
  enabled: boolean; requireApproval: boolean;
  tool: { toolUrl: string; loginUrl: string; launchUrl: string; redirectUris: string[]; jwksUrl: string };
  presets: { id: string; label: string }[];
}
/** ENARA admins only: the LMS is switched on but its configuration has a problem (variable names only), so it is off. */
export interface LmsStatusProblem { enabled: false; problem: string }
export interface LmsSeats {
  institutionId: string; seatsUsed: number; lmsStudents: number; seatLimit: number | null; hardCap: boolean;
  /** Phase 4: students the LMS roster listed who have not opened ENARA yet; shown, not counted as seats. */
  notStarted?: number;
  overLimit: boolean; billingFlaggedAt: string | null; lastAlertAt: string | null;
}
// Phase 1b: the one-URL "Connect Moodle" link (LTI Dynamic Registration). The URL is returned once.
export interface LmsRegistrationLink {
  id: string; institutionId: string; createdByRole: 'enara-admin' | 'admin';
  status: 'unused' | 'used' | 'revoked' | 'expired';
  createdAt: string; expiresAt: string; usedAt: string | null; platformId: string | null;
  failedAttempts: number; lastErrorCode: string | null; lastErrorAt: string | null;
  firstOpenedAt?: string | null; onboardingId?: string | null;
}
export const createLmsRegistrationLink = (institutionId?: string) =>
  request<{ link: LmsRegistrationLink; url: string; expiresInDays: number; connectionWillBe: 'active' | 'pending' }>('POST', '/api/lms/registration-links', institutionId ? { institutionId } : {});
export const fetchLmsRegistrationLinks = () => request<{ links: LmsRegistrationLink[] }>('GET', '/api/lms/registration-links');
export const revokeLmsRegistrationLink = (id: string) => request<{ link: LmsRegistrationLink }>('POST', `/api/lms/registration-links/${encodeURIComponent(id)}/revoke`, {});
export const fetchLmsStatus = () => request<LmsStatus | LmsStatusProblem>('GET', '/api/lms/status');
export const fetchLmsPlatforms = () => request<{ platforms: LmsPlatformView[] }>('GET', '/api/lms/platforms');
export const createLmsPlatform = (body: Record<string, unknown>) => request<{ platform: LmsPlatformView }>('POST', '/api/lms/platforms', body);
export const approveLmsPlatform = (id: string) => request<{ platform: LmsPlatformView }>('POST', `/api/lms/platforms/${encodeURIComponent(id)}/approve`);
export const disableLmsPlatform = (id: string) => request<{ platform: LmsPlatformView }>('POST', `/api/lms/platforms/${encodeURIComponent(id)}/disable`);
/** ENARA admins: refuse a pending connection with a fixed reason (owner decision D6). */
export const LMS_REJECT_REASONS = [
  { code: 'values_mismatch', label: "Platform ID or Client ID doesn't match the Moodle site" },
  { code: 'already_connected', label: 'Moodle site already connected to another school' },
  { code: 'school_not_confirmed', label: "Couldn't confirm the Moodle site belongs to the school" },
] as const;
export const rejectLmsPlatform = (id: string, reason: string) => request<{ platform: LmsPlatformView }>('POST', `/api/lms/platforms/${encodeURIComponent(id)}/reject`, { reason });
/** LMS emails, owner decision D2: a teacher's answer to "Email me Enara updates at ...?" (asked once, on an LMS launch). */
export interface LmsEmailOptInState { state: 'off' | 'ask' | 'in' | 'out'; email?: string | null; prefill?: string | null }
export const fetchLmsEmailOptIn = () => request<LmsEmailOptInState>('GET', '/api/lms/email-optin');
export const saveLmsEmailOptIn = (body: { optIn: boolean; email?: string }) => request<LmsEmailOptInState>('POST', '/api/lms/email-optin', body);
export const addLmsDeployment = (id: string, deploymentId: string) => request<{ platform: LmsPlatformView }>('POST', `/api/lms/platforms/${encodeURIComponent(id)}/deployments`, { deploymentId });
export const approveLmsDeployment = (id: string) => request<{ platform: LmsPlatformView }>('POST', `/api/lms/deployments/${encodeURIComponent(id)}/approve`);
/** Grade passback (Phase 3), per platform. The API answers 404 while LMS_GRADE_PASSBACK_ENABLED is off. */
export interface LmsGradeStats {
  platformId: string; pending: number; processing: number; sent: number; dead: number;
  lastErrorCode: string | null; lastErrorAt: string | null; lastSentAt: string | null;
  recentDead: { id: string; resourceLinkId: string | null; lmsUserId: string; attemptId: string; code: string | null; tries: number; at: string }[];
  /** Phase 3 follow-up: bound activities that may have been deleted in the LMS. */
  activitiesMayBeDeleted?: { resourceLinkId: string; assignmentId: string; activityTitle: string | null; reason: 'lineitem_gone' | 'stale' | null; lastLaunchAt: string | null; lastResultAt: string | null }[];
}
export const fetchLmsGrades = () => request<{ enabled: boolean; platforms: LmsGradeStats[] }>('GET', '/api/lms/grades');
export const resyncLmsGrades = (platformId: string) => request<{ links: number; students: number; queued: number; outcomes: Record<string, number> }>('POST', `/api/lms/platforms/${encodeURIComponent(platformId)}/grades/resync`, {});
export const retryLmsDeadGrades = (platformId: string) => request<{ retried: number }>('POST', `/api/lms/platforms/${encodeURIComponent(platformId)}/grades/retry-dead`, {});
export const fetchLmsSeats = () => request<{ seats?: LmsSeats; flagged?: LmsSeats[] }>('GET', '/api/lms/seats');
export const updateLmsSeats = (body: { institutionId: string; seatLimit?: number | null; hardCap?: boolean; clearBillingFlag?: boolean }) => request<{ seats: LmsSeats }>('PUT', '/api/lms/seats', body);
/** Roster sync (Phase 4), per LMS course. The API answers 404 while LMS_ROSTER_SYNC_ENABLED is off. */
export interface LmsRosterSyncState {
  lastAttemptAt?: string; trigger?: string; outcome?: 'ok' | 'partial' | 'failed';
  members?: number; pages?: number; added?: number; reactivated?: number; removed?: number; unchanged?: number;
  conflicts?: number; ignored?: number; deferred?: number; instructorsAdded?: number; instructorsRemoved?: number; suppressed?: number;
  lastErrorCode?: string; lastErrorAt?: string;
}
export interface LmsContextView {
  id: string; platformId: string; institutionId: string; title: string | null; label: string | null; enaraClassId: string | null;
  rosterAvailable: boolean; lastRosterSyncAt: string | null; sync: LmsRosterSyncState | null;
  students: { active: number; notStarted: number; inactive: number };
}
export interface LmsNotStarted { lmsUserId: string; studentId: string | null; name: string | null; listedSince: string }
export interface LmsRosterOutcome extends LmsRosterSyncState { contextId: string; status: 'ok' | 'partial' | 'failed' | 'skipped' | 'busy'; code?: string }
export const fetchLmsContexts = () => request<{ contexts: LmsContextView[] }>('GET', '/api/lms/contexts');
export const fetchLmsContextRoster = (contextId: string) => request<{ context: LmsContextView; notStarted: LmsNotStarted[] }>('GET', `/api/lms/contexts/${encodeURIComponent(contextId)}/roster`);
export const syncLmsRoster = (contextId: string) => request<{ outcome: LmsRosterOutcome; context: LmsContextView }>('POST', `/api/lms/contexts/${encodeURIComponent(contextId)}/roster/sync`, {});

// LMS Phase 1b: the Problems view (failures and warnings by reference code, EN and AR texts; IDs only).
export interface LmsProblemText { what: string; fix: string }
export interface LmsProblemHelp { known: boolean; en: LmsProblemText; ar: LmsProblemText }
export type LmsProblemArea = 'launch' | 'sign_in' | 'grades' | 'roster' | 'registration' | 'seats' | 'other';
export interface LmsProblemGroup {
  code: string | null; event: string; area: LmsProblemArea; severity: 'fail' | 'warn';
  count: number; failCount: number; warnCount: number; firstSeen: string; lastSeen: string;
  platformIds: string[]; platformCount: number; contextIds: string[]; contextCount: number; institutionIds?: string[];
  help: LmsProblemHelp;
}
export interface LmsOpenProblem {
  code: string; count: number; lastSeen: string | null;
  platformIds: string[]; platformCount: number; contextIds: string[]; contextCount: number; institutionIds?: string[];
  help: LmsProblemHelp;
}
export interface LmsProblems {
  days: 1 | 7; since: string; institutionId: string | null;
  problems: LmsProblemGroup[];
  open: { deadGradeJobs: LmsOpenProblem[]; failedRosterSyncs: LmsOpenProblem[] };
}
export const fetchLmsProblems = (days: 1 | 7, institutionId?: string) =>
  request<LmsProblems>('GET', `/api/lms/problems?days=${days}${institutionId ? `&institutionId=${encodeURIComponent(institutionId)}` : ''}`);

// LMS step 2: self-serve school onboarding ("New school", the invite, the
// school connection status page, the automatic connection check).
export type LmsLang = 'en' | 'ar';
export interface LmsBi { en: string; ar: string }
export interface LmsInviteTexts { en: string; ar: string }
export interface LmsNewSchoolInput {
  name: string; country: string; timeZone?: string; emailLanguage?: LmsLang; seatLimit?: number;
  schoolAdminName: string; schoolAdminEmail: string; moodleAdminEmail?: string; features?: 'all' | 'none';
}
export interface LmsNewSchoolResult {
  institution: { id: string; name: string; country: string; timeZone: string; emailLanguage: LmsLang; features: 'all' | 'none' };
  onboarding: { id: string };
  invitation: { id: string; expiresAt: string; expiresInDays: number };
  /** The school admin's account invitation link: shown once. */
  inviteLink: string;
  registrationLink: LmsRegistrationLink;
  /** The Moodle link: shown once. */
  url: string;
  connectionWillBe: 'active' | 'pending';
  invite: LmsInviteTexts;
  emailAvailable: boolean;
}
export interface LmsNewLinkResult {
  link: LmsRegistrationLink; url: string; expiresInDays: number; connectionWillBe: 'active' | 'pending'; cancelledLinkIds: string[]; invite: LmsInviteTexts;
}
export type LmsCheckStatus = 'ok' | 'fail' | 'waiting';
export interface LmsCheckStep { key: 'registered' | 'reachable' | 'services' | 'activated' | 'roster' | 'grades'; status: LmsCheckStatus; code: string; at: string | null; help: { en: { what: string; fix: string }; ar: { what: string; fix: string } } }
export interface LmsChecklistItem { key: string; done: boolean; at: string | null; label: LmsBi; next: LmsBi | null; code?: string }
export interface LmsManualSetting { key: 'acceptGradesAlways' | 'activityChooser' | 'restrictToCategory' | 'activated'; checked: boolean; at: string | null; by: string | null; label: LmsBi; how: LmsBi }
export interface LmsSchoolStatus {
  institution: { id: string; name: string; timeZone: string; emailLanguage: LmsLang | null; country: string | null };
  onboarding: {
    id: string; createdAt: string; inviteSentAt: string | null; inviteSentVia: 'copy' | 'email' | null; lastEmailAt: string | null; moodleAdminEmail: string | null;
    schoolAdminInvitation: { id: string; status: string; expiresAt: string; acceptedAt?: string } | null;
  } | null;
  currentLink: LmsRegistrationLink | null;
  emailAvailable: boolean;
  checklist: LmsChecklistItem[];
  allDone: boolean;
  timer: { startedAt: string; startedFrom: 'invite_sent' | 'invite_created'; goalMs: number; elapsedMs: number; goalReachedAt: string | null; running: boolean; goalMet: boolean } | null;
  platforms: {
    id: string; issuer: string; host: string | null; status: 'pending' | 'active' | 'disabled'; registeredVia: string; createdAt: string; hasPublicKey: boolean;
    check: { checkedAt: string | null; outcome: LmsCheckStatus | null; trigger: string | null; unreachable: boolean; host: string | null; steps: LmsCheckStep[] };
    manualSettings: LmsManualSetting[];
  }[];
}
export interface LmsOnboardingRow { id: string; institutionId: string; name: string | null; createdAt: string; inviteSentAt: string | null; connections: number; lastCheckOutcome: LmsCheckStatus | null }
const onb = (institutionId: string, tail: string) => `/api/lms/onboarding/${encodeURIComponent(institutionId)}/${tail}`;
export const createLmsSchool = (body: LmsNewSchoolInput) => request<LmsNewSchoolResult>('POST', '/api/lms/onboarding/schools', body);
export const fetchLmsOnboardings = () => request<{ onboardings: LmsOnboardingRow[] }>('GET', '/api/lms/onboarding');
export const fetchLmsSchoolStatus = (institutionId: string) => request<LmsSchoolStatus>('GET', onb(institutionId, 'status'));
export const newLmsOnboardingLink = (institutionId: string) => request<LmsNewLinkResult>('POST', onb(institutionId, 'new-link'), {});
export const markLmsInviteSent = (institutionId: string) => request<{ inviteSentAt: string | null }>('POST', onb(institutionId, 'invite-sent'), {});
export const sendLmsInviteEmail = (institutionId: string) => request<{ sent: boolean; inviteSentAt: string | null }>('POST', onb(institutionId, 'send-email'), {});
export const checkLmsConnectionAgain = (institutionId: string, platformId?: string) =>
  request<{ checked: number; skippedRecent: number; status: LmsSchoolStatus }>('POST', onb(institutionId, 'check'), platformId ? { platformId } : {});
export const setLmsManualSetting = (institutionId: string, platformId: string, key: LmsManualSetting['key'], checked: boolean) =>
  request<{ setting: { key: string; checked: boolean; by: string; at: string } }>('PUT', onb(institutionId, 'manual-settings'), { platformId, key, checked });
export const setLmsPlatformPublicKey = (platformId: string, publicKey: string | null) =>
  request<{ platform: LmsPlatformView }>('POST', `/api/lms/platforms/${encodeURIComponent(platformId)}/public-key`, { publicKey });

// MULTI-CLASS STEP 6: ARCHIVING (backend switches ENROLLMENT_GROUP_ARCHIVE /
// ENROLLMENT_STUDENT_ARCHIVE). The settings route answers 404 while both are
// off, which reads as "off": the pages then look and behave exactly as before.
export interface ArchiveSettings { groupArchive: boolean; studentArchive: boolean }
export const fetchArchiveSettings = async (): Promise<ArchiveSettings> => {
  try {
    const s = await request<ArchiveSettings>('GET', '/api/students/archive-settings');
    return { groupArchive: s?.groupArchive === true, studentArchive: s?.studentArchive === true };
  } catch {
    return { groupArchive: false, studentArchive: false };
  }
};
export const archiveStudent = (id: string) => request<any>('POST', `/api/students/${enc(id)}/archive`);
export const restoreStudent = (id: string) => request<any>('POST', `/api/students/${enc(id)}/restore`);
/** Permanent delete (data-deletion requests): the typed confirmation the server requires. */
export const deleteStudentPermanently = (id: string) => request<any>('DELETE', `/api/students/${enc(id)}`, { confirm: `DELETE ${id}` });
export const fetchArchivedStudents = () => request<any[]>('GET', '/api/students?archived=only&limit=100');
/** PDPL P2: safety alerts kept about permanently deleted students (school and ENARA admins only). */
export interface DeletedStudentAlert { id: string; studentId: string; category: string; subtype?: string; actionTaken: string; excerpt?: string; reviewRequired: boolean; reviewedAt?: string; createdAt: string; purgeAfter: string; overdue: boolean }
export const fetchDeletedStudentAlerts = () => request<{ retentionDays: number; alerts: DeletedStudentAlert[] }>('GET', '/api/students/deleted-safety-alerts');
export type UnplacedReason = 'group_deleted' | 'group_archived' | 'group_in_other_school' | 'no_group';
export interface UnplacedStudent { studentId: string; reason: UnplacedReason; groupId?: string; institutionId?: string; name: string; email: string; grade?: string }
export const fetchStudentsWithoutActiveGroup = () =>
  request<{ count: number; byReason: Partial<Record<UnplacedReason, number>>; students: UnplacedStudent[] }>('GET', '/api/students/without-active-group');
export const archiveBatch = (id: string) => request<any>('POST', `/api/batches/${enc(id)}/archive`);
export const restoreBatch = (id: string) => request<any>('POST', `/api/batches/${enc(id)}/restore`);
export const fetchArchivedBatches = () => request<any[]>('GET', '/api/batches?archived=only&limit=100');
export const archiveCourseInstance = (id: string) => request<any>('POST', `/api/course-instances/${enc(id)}/archive`);
export const restoreCourseInstance = (id: string) => request<any>('POST', `/api/course-instances/${enc(id)}/restore`);
export const fetchArchivedCourseInstances = () => request<any[]>('GET', '/api/course-instances?archived=only&limit=100');
/** A delete refused because the group or class still has active students (409). */
export const isHasStudentsError = (err: unknown) =>
  err instanceof ApiError && err.status === 409 && (err.code === 'GROUP_HAS_STUDENTS' || err.code === 'CLASS_HAS_STUDENTS');

// MULTI-CLASS (step 6, behind ENROLLMENT_MULTI_CLASS on the server)
export const fetchMultiClassStatus = () => request<{ multiClass: boolean }>('GET', '/api/multi-class/status');

export interface StudentMemberships {
  studentId: string;
  primaryGroupId: string | null;
  multiClass: boolean;
  groups: Array<{ id: string; name: string | null; primary: boolean; source: string; startedAt: string; removable: boolean }>;
  classes: Array<{ id: string; courseName: string; groupId: string | null; groupName: string | null; via: Array<'group' | 'class'>; source: string | null; removable: boolean }>;
}
/** Admin: every group and class a student is in. */
export const fetchStudentMemberships = (studentId: string) =>
  request<StudentMemberships>('GET', `/api/multi-class/students/${encodeURIComponent(studentId)}/enrollments`);
/** Admin: add a student to another group or class. */
export const addStudentMembership = (studentId: string, scope: 'group' | 'class', targetId: string) =>
  request('POST', `/api/multi-class/students/${encodeURIComponent(studentId)}/enrollments`, { scope, targetId });
/** Admin: take a student out of an extra group or class. */
export const removeStudentMembership = (studentId: string, scope: 'group' | 'class', targetId: string) =>
  request('DELETE', `/api/multi-class/students/${encodeURIComponent(studentId)}/enrollments/${scope}/${encodeURIComponent(targetId)}`);

export interface MyClasses {
  enabled: boolean;
  showSwitcher?: boolean;
  /** A class id, 'all' ("All my classes"), or null when there is nothing to choose. */
  current?: string | null;
  classes?: Array<{ id: string; courseId: string; name: string; groupId: string | null; groupName: string | null }>;
}
/** Student: my classes and the one I use now (the switcher shows only with 2+ classes). */
export const fetchMyClasses = () => request<MyClasses>('GET', '/api/multi-class/me/classes');
export const setMyCurrentClass = (classId: string) => request<MyClasses>('PUT', '/api/multi-class/me/classes/current', { classId });

// LMS PHASE 2: THE ACTIVITY PICKER (LTI Deep Linking). No ENARA sign-in: the
// picker page holds the one-time picker secret from the LMS request (header
// X-Lms-Picker). The backend answers 404 unless LMS_DEEP_LINKING_ENABLED.
export interface LmsPickerItem {
  type: string; id: string; title: string; description?: string; subject?: string; kind?: string; difficulty?: string;
  language?: { level?: string; skills?: string[] }; questions?: number; points?: number;
  graded: boolean; needsMedia: boolean; meta?: string; alreadyAdded: boolean;
  /** Phase 2b: a page only teachers can open ("Teachers only" badge). */
  teacherOnly?: boolean;
  /** LMS Phase 8: a no-grade ENARA activity (tutor, avatar, diagnostic). */
  activity?: "tutor" | "avatar" | "diagnostic";
  /** Phase 2b: the Arabic title and description. */
  ar?: { title: string; description?: string };
}
export interface LmsPickerSession {
  locale: 'en' | 'ar'; courseTitle: string | null; acceptMultiple: boolean; expiresAt: string;
  /** Phase 2b: the school's time zone; picker due dates are entered in it. */
  timeZone: string;
  /** dueDate: the picker offers an optional due date for this type's items (D13). */
  types: { type: string; label: { en: string; ar: string }; dueDate?: boolean }[];
}
async function pickerCall<T>(secret: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(toUrl(`/api/lms/picker${path}`), {
    method,
    headers: { 'X-Lms-Picker': secret, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`, res.status, typeof data?.error === 'string' ? data.error : undefined);
    // Phase 2b: which picked item a refusal is about (e.g. a due date in the past).
    if (typeof data?.type === 'string' && typeof data?.id === 'string') (err as ApiError & { item?: { type: string; id: string } }).item = { type: data.type, id: data.id };
    throw err;
  }
  return data as T;
}
export const fetchLmsPickerSession = (secret: string) => pickerCall<LmsPickerSession>(secret, 'GET', '/session');
export const fetchLmsPickerItems = (secret: string) => pickerCall<{ items: LmsPickerItem[] }>(secret, 'GET', '/items');
/** due: optional local date-time "YYYY-MM-DDTHH:mm" in the school's time zone (Phase 2b). */
export const submitLmsPicker = (secret: string, items: { type: string; id: string; due?: string }[]) =>
  pickerCall<{ returnUrl: string; jwt: string }>(secret, 'POST', '/submit', { items });

// Errors to work on from Moodle's own quizzes (tutor track): the school admin's settings for one LMS connection. 404 while the switch is off.
export interface MoodleQuizSettingsView { switchOn: boolean; hasToken: boolean; enabled: boolean; lastCheck: { at: string; ok: boolean; code: string | null } | null; lastRun: { at: string; quizzes?: number; attempts?: number; wrong?: number; right?: number; skipped?: number; errors?: number } | null; check?: { ok: boolean; code: string; quizzes?: number } | null }
export interface MoodleQuizView { quizId: string; courseExternalId: string; name: string; closesAt: string | null; maxAttempts: number; reviewAfterClose: boolean | null; objectiveId: string | null; slotObjectives: { slot: number; objectiveId: string }[] }
const mq = (platformId: string) => `/api/lms/platforms/${encodeURIComponent(platformId)}/moodle-quiz`;
export const fetchMoodleQuizSettings = (platformId: string) => request<MoodleQuizSettingsView>('GET', mq(platformId));
export const saveMoodleQuizToken = (platformId: string, token: string | null) => request<MoodleQuizSettingsView>('PUT', `${mq(platformId)}/token`, { token });
export const setMoodleQuizEnabled = (platformId: string, enabled: boolean) => request<MoodleQuizSettingsView>('PUT', mq(platformId), { enabled });
export const fetchMoodleQuizzes = (platformId: string) => request<{ quizzes: MoodleQuizView[] }>('GET', `${mq(platformId)}/quizzes`);
export const mapMoodleQuiz = (platformId: string, q: { quizId: string; courseExternalId: string; quizName?: string; objectiveId: string | null }) =>
  request<{ ok: boolean }>('PUT', `${mq(platformId)}/quizzes/${encodeURIComponent(q.quizId)}`, { courseExternalId: q.courseExternalId, quizName: q.quizName, objectiveId: q.objectiveId });
export const runMoodleQuizImport = (platformId: string) => request<{ quizzes: number; attempts: number; wrong: number; right: number; skipped: number; errors: number }>('POST', `${mq(platformId)}/run`, {});

// Assessment engine P4: the item bank and the question generator (switch assessGen).
export const fetchBankItems = (params: { status?: string; subject?: string; language?: string } = {}) =>
  request<{ items: any[] }>('GET', `/api/item-bank?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()}`);
export const generateBankItems = (body: any) => request<{ created: any[]; refused: any[] }>('POST', '/api/item-bank/generate', body);
export const reviewBankItem = (id: string, body: { decision: 'approve' | 'edit' | 'reject'; reasonCode?: string; edits?: any }) => request<any>('POST', `/api/item-bank/${encodeURIComponent(id)}/review`, body);
export const bankItemQuestion = (id: string) => request<{ question: any }>('GET', `/api/item-bank/${encodeURIComponent(id)}/question`);
export const fetchBankStats = () => request<any>('GET', '/api/item-bank/stats');
