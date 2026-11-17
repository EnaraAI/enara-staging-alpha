import { apiRequest } from '../services/apiService';
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
export interface Progress { classes?: ClassChoice; generatedAt: string; learner: LearnerHeader; level: Level; ladder: { cefr: string; label: Bi; state: 'done' | 'current' | 'ahead' }[]; skills: { mock: boolean; items: { skill: string; pct: number; trend: 'up' | 'flat' | 'down' }[] }; trend: { mock: boolean; weeks: { weekStart: string; score: number; assessment?: boolean }[] }; canDos: { mock: boolean; items: { id: string; text: Bi; state: 'achieved' | 'in_progress' | 'not_started' }[] }; strengths: { mock: boolean; strengths: Bi[]; focusAreas: Bi[] }; lessonsCompleted: { count: number }; assessments: { mock: boolean; items: { id: string; title: string; score: number | null; submittedAt: string; passed: boolean | null; verified: boolean; class?: ClassTag | null }[] } }
export interface SessionCard { id: string; day: string; startedAt: string; startTime: string; durationMin: number; title: string; mode: 'chat' | 'voice'; methods: Bi[]; speakingMin: number; insight: { mock: boolean; wentWell: Bi; wasHard: Bi; words: string[]; focus: 'high' | 'medium' | 'low' }; transcript: { available: boolean; retentionDays: number }; audio: { available: boolean }; class?: ClassTag | null }
export interface Activity { classes?: ClassChoice; generatedAt: string; learner: LearnerHeader; calendar: { days: { day: string; state: 'practised' | 'missed' | 'today' | 'upcoming'; isToday: boolean; minutes: number }[]; practisedCount: number; pastCount: number }; sessions: SessionCard[] }
export interface Transcript { learner: LearnerHeader; session: { id: string; title: string; startedAt: string }; expiresAt: string; messages: { id: string; from: 'learner' | 'enara'; text: string; at: string }[]; audio: { available: boolean } }
export interface Controls { learner: LearnerHeader; controls: { weeklyGoalMin: number; dailyLimitMin: number; focus: string; reminders: boolean; liveAvatar: boolean; microphone: boolean; camera: boolean; learnerAccepted?: boolean }; mode: 'parent_sets' | 'co_set'; enforced: boolean }
export interface Report { learner: LearnerHeader; report: { weekStart: string; status: WeeklyStatus['status']; minutesDone: number; goalMinutes: number; streak: number; level: Level; learned: { mock: boolean; items: Bi[] }; tryAtHome: { mock: boolean; text: Bi } } }
export interface Account { learners: LearnerChip[]; pending: { linkId: string }[]; guardians: { byLearner: { studentId: string; canManage: boolean; items: { linkId: string; name: string; role: LinkRole; isYou: boolean }[] }[] }; plan: { mock: boolean; name: Bi; price: string; learners: number; renewsOn: string; payment: Bi }; preferences: { language: 'en' | 'ar'; alertChannels: string[] } }

const L = (id: string) => `/api/parents/learners/${encodeURIComponent(id)}`;
export const parentsApi = {
  learners: () => apiRequest<{ generatedAt: string; learners: LearnerChip[]; pending: { linkId: string }[] }>('GET', '/api/parents/learners'),
  status: (id: string) => apiRequest<{ generatedAt: string; status: WeeklyStatus }>('GET', `${L(id)}/status`),
  home: (id: string) => apiRequest<Home>('GET', `${L(id)}/home`),
  progress: (id: string, classId?: string | null) => apiRequest<Progress>('GET', `${L(id)}/progress${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  activity: (id: string, classId?: string | null) => apiRequest<Activity>('GET', `${L(id)}/activity${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  transcript: (id: string, sessionId: string) => apiRequest<Transcript>('GET', `${L(id)}/sessions/${encodeURIComponent(sessionId)}/transcript`),
  alerts: (id: string) => apiRequest<{ alerts: { mock: boolean; items: Alert[] } }>('GET', `${L(id)}/alerts`),
  report: (id: string) => apiRequest<Report>('GET', `${L(id)}/report`),
  share: (id: string, channel: 'email' | 'whatsapp') => apiRequest<{ ok: boolean; preview?: string; stub?: boolean }>('POST', `${L(id)}/report/share`, { channel }),
  controls: (id: string) => apiRequest<Controls>('GET', `${L(id)}/controls`),
  saveControls: (id: string, body: Partial<Controls['controls']>) => apiRequest<Controls>('PUT', `${L(id)}/controls`, body),
  setGuardianRole: (id: string, linkId: string, role: 'full' | 'view') => apiRequest('PUT', `${L(id)}/guardians/${encodeURIComponent(linkId)}`, { role }),
  account: () => apiRequest<Account>('GET', '/api/parents/account'),
  savePreferences: (body: { language?: 'en' | 'ar' }) => apiRequest('PUT', '/api/parents/account/preferences', body),
  previewCode: (code: string) => apiRequest<{ learner: string; school: string | null }>('POST', '/api/parents/link/preview', { code }),
  confirmCode: (code: string) => apiRequest<{ studentId: string; role: LinkRole }>('POST', '/api/parents/link/confirm', { code }),
  unlink: (linkId: string) => apiRequest('DELETE', `/api/parents/links/${encodeURIComponent(linkId)}`),
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
