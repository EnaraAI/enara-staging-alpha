import { apiRequest, downloadFile } from '../services/apiService';
import type { Bi } from './i18n';

// Parents Portal API client (backend/src/parents/routes.ts). Every call reads
// live data; nothing is cached here.

export type Tier = 'kid' | '13plus';
export type LinkRole = 'owner' | 'full' | 'view';

export interface LearnerChip { studentId: string; linkId: string; name: string; firstName: string; initial: string; age: number | null; tier: Tier; role: LinkRole; consent: string; school: string | null }
export interface LearnerHeader { studentId: string; name: string; firstName: string; initial: string; age: number | null; tier: Tier; role: LinkRole; controlsMode: 'parent_sets' | 'co_set' }
export interface StatusDay { day: string; practised: boolean; minutes: number; isToday: boolean; isFuture: boolean; weekend: boolean }
export interface WeeklyStatus { mock: false; weekStart: string; days: StatusDay[]; minutesDone: number; goalMinutes: number; goalAcceptedByLearner: boolean | null; sessions: number; streak: number; lastPractised: string | null; status: 'on_track' | 'needs_nudge' | 'check_this'; reason: { code: string; params: Record<string, unknown> } }
export interface Level { mock: boolean; cefr: string; label: Bi; subLevel: string | null; subLevelPct: number | null; next: string | null; nextLabel: Bi | null; latestCanDo?: { mock: boolean; text?: Bi | null; id?: string } }
export interface Alert { id: string; category: string; subtype: string | null; actionTaken: Bi; createdAt: string; beta: boolean; excerpt?: string }
export interface Home { generatedAt: string; learner: LearnerHeader; status: WeeklyStatus; level: Level; learned: { mock: boolean; items: Bi[] }; tryAtHome: { mock: boolean; text: Bi }; hearProgress: { available: boolean }; alerts: { mock: boolean; count: number; latest: Alert | null }; upcoming: { mock: boolean; items: { kind: string; text: Bi; meta?: string }[] } }
// Multi-class (step 6, Q3): only for a child in several classes.
export interface ClassTag { id: string; name: string }
export interface ClassChoice { items: ClassTag[]; filter: string | null }
export interface Progress { classes?: ClassChoice; generatedAt: string; learner: LearnerHeader; level: Level; ladder: { cefr: string; label: Bi; state: 'done' | 'current' | 'ahead' }[]; skills: { mock: boolean; items: { skill: string; pct: number; trend: 'up' | 'flat' | 'down' }[] }; trend: { mock: boolean; weeks: { weekStart: string; score: number; assessment?: boolean }[] }; canDos: { mock: boolean; items: { id: string; text: Bi; state: 'achieved' | 'in_progress' | 'not_started' }[] }; strengths: { mock: boolean; strengths: Bi[]; focusAreas: Bi[] }; lessonsCompleted: { count: number }; assessments: { mock: boolean; items: { id: string; title: string; score: number | null; submittedAt: string; passed: boolean | null; verified: boolean; waiting?: boolean; class?: ClassTag | null; subject?: SubjectTag | null }[] } }
export interface SessionCard { id: string; day: string; startedAt: string; startTime: string; durationMin: number; title: string; mode: 'chat' | 'voice'; methods: Bi[]; speakingMin: number; insight: { mock: boolean; wentWell: Bi; wasHard: Bi; words: string[]; focus: 'high' | 'medium' | 'low' }; transcript: { available: boolean; retentionDays: number }; audio: { available: boolean }; class?: ClassTag | null; subject?: SubjectTag | null }
export interface Activity { classes?: ClassChoice; generatedAt: string; learner: LearnerHeader; calendar: { days: { day: string; state: 'practised' | 'missed' | 'today' | 'upcoming'; isToday: boolean; minutes: number }[]; practisedCount: number; pastCount: number }; sessions: SessionCard[] }
export interface Transcript { learner: LearnerHeader; session: { id: string; title: string; startedAt: string }; expiresAt: string; messages: { id: string; from: 'learner' | 'enara'; text: string; at: string }[]; audio: { available: boolean } }
export interface Controls { learner: LearnerHeader; controls: { weeklyGoalMin: number; dailyLimitMin: number; focus: string; reminders: boolean; liveAvatar: boolean; microphone: boolean; camera: boolean; learnerAccepted?: boolean }; mode: 'parent_sets' | 'co_set'; enforced: boolean }
/** lms-test: parent emails are blocked until a later step (backend parents/emailBlock.ts). */
export interface ParentEmailState { blocked: boolean; code?: string; message?: { en: string; ar: string } }
export interface Report { learner: LearnerHeader; shareEmail?: ParentEmailState; report: { weekStart: string; status: WeeklyStatus['status']; minutesDone: number; goalMinutes: number; streak: number; level: Level; learned: { mock: boolean; items: Bi[] }; tryAtHome: { mock: boolean; text: Bi } } }
export interface Account { learners: LearnerChip[]; pending: { linkId: string }[]; guardians: { byLearner: { studentId: string; canManage: boolean; items: { linkId: string; name: string; role: LinkRole; isYou: boolean }[] }[] }; plan: AccountPlan; preferences: { language: 'en' | 'ar'; alertChannels: string[]; emails?: { weeklySummary: boolean; newResults: boolean; schoolAttendance?: boolean; schoolAnnouncements?: boolean; schoolFees?: boolean } }; signIn?: { method: 'code' | 'password' | 'google'; hasEmail: boolean; emailSignin?: boolean; email?: string; emailVerified?: boolean; suggestedEmail?: string }; hiddenBySchool?: number }
// Parents P1: with PARENT_SETTINGS_ENABLED the plan is "Provided by <school>" (no price); otherwise the mock plan.
export type AccountPlan = { mock: true; name: Bi; price: string; learners: number; renewsOn: string; payment: Bi } | { mock: false; kind: 'school'; providedBy: string[] };

// All subjects (PARENT_ALL_SUBJECTS_ENABLED): 404 when the switch is off (the portal then shows no subject chips).
export interface SubjectTag { key: string; name: Bi }
export interface Rec { kind: string; do: Bi; why: Bi; say: Bi; ai: boolean }
export interface Cefr { cefr: string; label: Bi; subLevel: string | null; subLevelPct: number | null; next: string | null; nextLabel: Bi | null }
export interface SubjectCard { key: string; name: Bi; english: boolean; lessons: { done: number; total: number }; outcomes: { mastered: number; total: number; band: string | null; bandLabel: Bi | null }; cefr?: Cefr; latestResult: { title: string; score: number; submittedAt: string | null } | null; lessonsThisWeek: number; pointsCount: number; minutesThisWeek: number; top: Rec | null }
export interface SubjectsOverview { learner: LearnerHeader; subjects: SubjectCard[]; minutesThisWeek: number }
export interface SubjectFull {
  learner: LearnerHeader;
  subject: { key: string; name: Bi; english: boolean; cefr?: Cefr; lessons: { done: number; total: number; thisWeek: number }; outcomes: { mastered: number; inProgress: number; total: number; band: string | null; bandLabel: Bi | null; items: { id: string; title: string; state: 'achieved' | 'in_progress' | 'not_started' }[] }; results: { id: string; title: string; score: number | null; submittedAt: string | null; passed: boolean | null; waiting?: true }[]; latestResult: SubjectCard['latestResult']; points: { id: string; objective: string; error: string; occurrences: number; since: string }[]; sessions: { id: string; title: string; day: string; startTime: string; durationMin: number; mode: 'chat' | 'voice' }[]; minutesThisWeek: number; next: { lesson: string | null; due: { title: string; dueAt: string } | null } };
  recommendations: { source: string; items: Rec[] };
}

const L = (id: string) => `/api/parents/learners/${encodeURIComponent(id)}`;
export const parentsApi = {
  learners: () => apiRequest<{ generatedAt: string; learners: LearnerChip[]; pending: { linkId: string }[]; hiddenBySchool?: number }>('GET', '/api/parents/learners'),
  status: (id: string) => apiRequest<{ generatedAt: string; status: WeeklyStatus }>('GET', `${L(id)}/status`),
  home: (id: string) => apiRequest<Home>('GET', `${L(id)}/home`),
  progress: (id: string, classId?: string | null) => apiRequest<Progress>('GET', `${L(id)}/progress${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  activity: (id: string, classId?: string | null) => apiRequest<Activity>('GET', `${L(id)}/activity${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  transcript: (id: string, sessionId: string) => apiRequest<Transcript>('GET', `${L(id)}/sessions/${encodeURIComponent(sessionId)}/transcript`),
  alerts: (id: string) => apiRequest<{ alerts: { mock: boolean; items: Alert[] } }>('GET', `${L(id)}/alerts`),
  report: (id: string) => apiRequest<Report>('GET', `${L(id)}/report`),
  share: (id: string, channel: 'email' | 'whatsapp') => apiRequest<{ ok: boolean; preview?: string; stub?: boolean }>('POST', `${L(id)}/report/share`, { channel }),
  subjects: (id: string) => apiRequest<SubjectsOverview>('GET', `${L(id)}/subjects`),
  subject: (id: string, key: string) => apiRequest<SubjectFull>('GET', `${L(id)}/subjects/${encodeURIComponent(key)}`),
  controls: (id: string) => apiRequest<Controls>('GET', `${L(id)}/controls`),
  saveControls: (id: string, body: Partial<Controls['controls']>) => apiRequest<Controls>('PUT', `${L(id)}/controls`, body),
  setGuardianRole: (id: string, linkId: string, role: 'full' | 'view') => apiRequest('PUT', `${L(id)}/guardians/${encodeURIComponent(linkId)}`, { role }),
  account: () => apiRequest<Account>('GET', '/api/parents/account'),
  savePreferences: (body: { language?: 'en' | 'ar'; weeklySummaryEmail?: boolean; newResultsEmail?: boolean; schoolAttendanceEmail?: boolean; schoolAnnouncementsEmail?: boolean; schoolFeesEmail?: boolean }) => apiRequest('PUT', '/api/parents/account/preferences', body),
  previewCode: (code: string) => apiRequest<{ learner: string; school: string | null }>('POST', '/api/parents/link/preview', { code }),
  confirmCode: (code: string) => apiRequest<{ studentId: string; role: LinkRole }>('POST', '/api/parents/link/confirm', { code }),
  unlink: (linkId: string) => apiRequest('DELETE', `/api/parents/links/${encodeURIComponent(linkId)}`),
  // Parents P2: add your email (6-digit code) and the merge it may offer.
  emailStart: (email: string) => apiRequest<{ sent?: boolean; alreadyVerified?: boolean }>('POST', '/api/parents/email/start', { email }),
  emailVerify: (email: string, code: string) => apiRequest<{ verified: boolean; email?: string; merge?: { ticket: string; otherChildren: string[]; yourChildren: string[] } }>('POST', '/api/parents/email/verify', { email, code }),
  emailMerge: (ticket: string) => apiRequest<{ token: string; user: any; deviceToken: string; linksMoved: number }>('POST', '/api/parents/email/merge', { ticket }),
};

// Parents school app (a): /api/parents/school. 404 while every SCHOOL_APP_* switch is off (the tab is then hidden);
// a section the school has off answers 404 SECTION_OFF.
export type SchoolSection = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees';
export interface SchoolSource { label: string; updatedAt: string | null; kind: string | null }
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export interface SchoolOverview { sections: Record<SchoolSection, boolean>; today: string; attendanceToday?: AttendanceStatus | null; todayClasses?: { period: number; start: string; end: string; subject: string }[]; announcementsCount?: number; unreadNotifications?: number; fees?: { next: { amount: number; dueDate: string; status: FeeStatus } | null; overdueCount: number; currency: string } }
export interface SchoolTimetable { group: string | null; days: { day: number; periods: { period: number; start: string; end: string; subject: string; teacher: string | null; room: string | null }[] }[]; source: SchoolSource }
export interface SchoolAttendance { month: string; records: { date: string; period: number | null; status: AttendanceStatus; note: string | null }[]; counts: Record<AttendanceStatus, number>; source: SchoolSource }
export interface SchoolAnnouncementItem { id: string; title: string; body: string; titleAr: string | null; bodyAr: string | null; audience: string; publishAt: string; expiresAt: string | null }
export interface SchoolAnnouncements { announcements: SchoolAnnouncementItem[]; source: SchoolSource }
export type FeeStatus = 'due' | 'overdue' | 'paid' | 'waived';
export interface FeeTotals { total: number; paid: number; waived: number; remaining: number; overdue: number }
export interface SchoolFees { currency: string; totals: FeeTotals; next: { id: string; planName: string; number: number; amount: number; dueDate: string; status: FeeStatus } | null; plans: { name: string; academicYear: string | null; totals: FeeTotals; instalments: { id: string; number: number; amount: number; dueDate: string; status: FeeStatus; paidDate: string | null; receiptRef: string | null; hasReceipt: boolean; note: string | null }[] }[]; source: SchoolSource }
export interface ParentNotificationItem { id: string; studentId: string; kind: 'absence' | 'late' | 'announcement' | 'fee_due'; date: string | null; title: string; body: string; read: boolean; createdAt: string }
const S = (id: string) => `/api/parents/school/learners/${encodeURIComponent(id)}`;
export const schoolApi = {
  overview: (id: string) => apiRequest<SchoolOverview>('GET', S(id)),
  timetable: (id: string) => apiRequest<SchoolTimetable>('GET', `${S(id)}/timetable`),
  attendance: (id: string, month?: string) => apiRequest<SchoolAttendance>('GET', `${S(id)}/attendance${month ? `?month=${encodeURIComponent(month)}` : ''}`),
  announcements: (id: string) => apiRequest<SchoolAnnouncements>('GET', `${S(id)}/announcements`),
  fees: (id: string) => apiRequest<SchoolFees>('GET', `${S(id)}/fees`),
  receipt: (id: string, instalmentId: string) => downloadFile(`${S(id)}/fees/${encodeURIComponent(instalmentId)}/receipt`, 'receipt'),
  notifications: () => apiRequest<{ notifications: ParentNotificationItem[]; unread: number }>('GET', '/api/parents/school/notifications'),
  markRead: (ids?: string[]) => apiRequest<{ marked: number }>('POST', '/api/parents/school/notifications/read', { ids: ids ?? [] }),
};

// --- Africa/Cairo formatting --------------------------------------------------
const TZ = 'Africa/Cairo';
export function cairoTime(iso: string | Date, lang: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: lang !== 'ar' ? true : true }).format(new Date(iso));
}
export function cairoDate(day: string, lang: 'en' | 'ar', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  // day is YYYY-MM-DD (a Cairo calendar day): format at noon UTC so it never shifts.
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${day}T12:00:00Z`));
}
export function weekdayIndex(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
export function dayOfMonth(day: string): number {
  return +day.slice(8, 10);
}
