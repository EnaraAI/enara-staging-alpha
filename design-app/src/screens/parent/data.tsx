// The parent screens' link to the lms-test API: response types (from frontend/parents/api.ts and the backend parents/ and schoolApp/
// routes), a small loader hook, the remembered child, Cairo dates, and the shared loading / error / "not turned on" states.
// Every field is read with optional chaining: the screens must not crash on a missing or older response shape.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleOff, RefreshCw, TriangleAlert, UsersRound } from 'lucide-react';
import { ApiError, errorText, get } from '@/lib/api';
import { usePreview, type Lang } from '@/lib/preview';
import { Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ response types
export type Bi = { en: string; ar: string };
export type LinkRole = 'owner' | 'full' | 'view';
export interface LearnerChip { studentId: string; linkId?: string; name?: string; firstName?: string; initial?: string; age?: number | null; tier?: string; role?: LinkRole; school?: string | null }
export interface LearnersResp { learners?: LearnerChip[]; pending?: { linkId: string }[]; hiddenBySchool?: number }
export interface StatusDay { day: string; practised?: boolean; minutes?: number; isToday?: boolean; isFuture?: boolean; weekend?: boolean }
export interface WeeklyStatus { weekStart?: string; days?: StatusDay[]; minutesDone?: number; goalMinutes?: number; sessions?: number; streak?: number; lastPractised?: string | null; status?: 'on_track' | 'needs_nudge' | 'check_this'; reason?: { code?: string; params?: Record<string, unknown> } }
export interface HomeResp { generatedAt?: string; learner?: { firstName?: string; name?: string }; status?: WeeklyStatus }
export interface Rec { kind?: string; do?: Bi; why?: Bi; say?: Bi; ai?: boolean }
export interface SubjectCardResp { key: string; name?: Bi; english?: boolean; lessons?: { done?: number; total?: number }; outcomes?: { mastered?: number; total?: number; band?: string | null; bandLabel?: Bi | null }; cefr?: { cefr?: string; label?: Bi }; latestResult?: { title?: string; score?: number; submittedAt?: string | null } | null; lessonsThisWeek?: number; minutesThisWeek?: number; top?: Rec | null }
export interface SubjectsResp { subjects?: SubjectCardResp[]; minutesThisWeek?: number }
export interface AssessmentItem { id: string; title?: string; score?: number | null; submittedAt?: string; passed?: boolean | null; waiting?: boolean; subject?: { key?: string; name?: Bi } | null }
export interface ProgressResp { generatedAt?: string; learner?: { firstName?: string }; lessonsCompleted?: { count?: number }; assessments?: { mock?: boolean; items?: AssessmentItem[] } }
export interface ActivityResp { calendar?: { days?: { day: string; state?: string; isToday?: boolean; minutes?: number }[] } }

export type SchoolSection = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees' | 'buses' | 'requests' | 'consents' | 'chat';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type FeeStatus = 'due' | 'overdue' | 'paid' | 'waived';
export interface SchoolSource { label?: string; updatedAt?: string | null; kind?: string | null }
export interface BusNotice { kind?: 'delay' | 'cancel'; minutes?: number | null; message?: string | null; at?: string }
export interface SchoolOverview {
  sections?: Partial<Record<SchoolSection, boolean>>; today?: string; attendanceToday?: AttendanceStatus | null;
  todayClasses?: { period?: number; start?: string; end?: string; subject?: string }[]; announcementsCount?: number; unreadNotifications?: number;
  fees?: { next?: { amount?: number; dueDate?: string; status?: FeeStatus } | null; overdueCount?: number; currency?: string };
  bus?: { trips?: { direction?: 'morning' | 'afternoon'; time?: string | null; stop?: string; notice?: BusNotice | null }[] };
}
export interface TimetableResp { days?: { day: number; periods?: { period?: number; start?: string; end?: string; subject?: string; teacher?: string | null; room?: string | null }[] }[] }
export interface AttendanceResp { month?: string; records?: { date: string; period?: number | null; status?: AttendanceStatus; note?: string | null }[]; counts?: Partial<Record<AttendanceStatus, number>>; source?: SchoolSource }
export interface AnnouncementItem { id: string; title?: string; body?: string; titleAr?: string | null; bodyAr?: string | null; publishAt?: string }
export interface AnnouncementsResp { announcements?: AnnouncementItem[] }
export interface BusTrip { direction?: 'morning' | 'afternoon'; route?: string; busNumber?: string | null; stop?: string; time?: string | null; mapLink?: string | null; supervisor?: string | null; supervisorPhone?: string | null; driver?: string | null; stops?: { name?: string; time?: string | null; mine?: boolean }[]; notices?: BusNotice[] }
export interface BusResp { today?: string; trips?: (BusTrip | null)[]; source?: SchoolSource }
export interface FeeTotals { total?: number; paid?: number; waived?: number; remaining?: number; overdue?: number }
export interface Instalment { id: string; number?: number; amount?: number; dueDate?: string; status?: FeeStatus; paidDate?: string | null; receiptRef?: string | null; hasReceipt?: boolean; note?: string | null }
export interface FeesResp { currency?: string; totals?: FeeTotals; next?: { id?: string; planName?: string; number?: number; amount?: number; dueDate?: string; status?: FeeStatus } | null; plans?: { name?: string; academicYear?: string | null; totals?: FeeTotals; instalments?: Instalment[] }[]; source?: SchoolSource }
export type NotificationKind = 'absence' | 'late' | 'announcement' | 'fee_due' | 'bus_notice' | 'request_update' | 'consent';
export interface NotificationItem { id: string; studentId?: string; kind?: NotificationKind; date?: string | null; title?: string; body?: string; read?: boolean; createdAt?: string }
export interface NotificationsResp { notifications?: NotificationItem[]; unread?: number }
export type RequestType = 'certificate' | 'early_leave' | 'teacher_meeting' | 'other';
export interface ChatReply { answer?: string; lang?: Lang; sources?: { source?: string; updatedAt?: string | null }[]; offerRequest?: { type: RequestType; details: string } | null; engine?: 'code' | 'model' }
export interface RequestItem { id?: string; type?: RequestType; details?: string; status?: string; createdAt?: string }

// ------------------------------------------------------------------ endpoints
const L = (id: string) => `/api/parents/learners/${encodeURIComponent(id)}`;
const S = (id: string) => `/api/parents/school/learners/${encodeURIComponent(id)}`;
export const ep = {
  learners: '/api/parents/learners',
  home: (id: string) => `${L(id)}/home`,
  status: (id: string) => `${L(id)}/status`,
  progress: (id: string) => `${L(id)}/progress`,
  activity: (id: string) => `${L(id)}/activity`,
  subjects: (id: string) => `${L(id)}/subjects`,
  overview: (id: string) => S(id),
  timetable: (id: string) => `${S(id)}/timetable`,
  attendance: (id: string, month?: string) => `${S(id)}/attendance${month ? `?month=${encodeURIComponent(month)}` : ''}`,
  announcements: (id: string) => `${S(id)}/announcements`,
  fees: (id: string) => `${S(id)}/fees`,
  receipt: (id: string, instalmentId: string) => `${S(id)}/fees/${encodeURIComponent(instalmentId)}/receipt`,
  bus: (id: string) => `${S(id)}/bus`,
  chat: (id: string) => `${S(id)}/chat`,
  chatRequest: (id: string) => `${S(id)}/chat/request`,
  notifications: '/api/parents/school/notifications',
};

// ------------------------------------------------------------------ errors
const errOf = (e: unknown) => e as ApiError | null | undefined;
/** The school has this section off (404 SECTION_OFF), or every school section is off on the site (the route answers 404). */
export const isOff = (e: unknown) => errOf(e)?.status === 404;
/** The school shows fees to the main guardian only. */
export const isFeesMainOnly = (e: unknown) => errOf(e)?.status === 403 && errOf(e)?.code === 'FEES_MAIN_GUARDIAN_ONLY';
/** A one-line message in the page's language (server text only when it is safe and in English). */
export function friendly(e: unknown, lang: Lang): string {
  const err = errOf(e);
  if (err?.status === 403 && (err.code === 'PARENT_ACCESS_DENIED' || err.code === 'PARENT_LINK_ENDED'))
    return lang === 'ar' ? 'لم يعد بإمكانك الاطلاع على بيانات هذا الابن أو الابنة.' : 'You no longer have access to this child’s information.';
  if (lang === 'ar' && err?.status && err.status !== 429 && err.status < 500) return 'تعذّر تحميل هذه البيانات. حاول مرة أخرى.';
  return errorText(e, lang);
}
/** Catch "off" (404) and turn it into null, so an optional part of a page simply does not show. */
export const optional = <T,>(p: Promise<T>): Promise<T | null> => p.catch((e) => { if (isOff(e)) return null; throw e; });

// ------------------------------------------------------------------ loader
export interface Load<T> { data: T | null; error: unknown; loading: boolean; reload: () => void }
/** Runs fn when deps change (and on reload). fn returning null means "nothing to load yet" (e.g. no child chosen). */
export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T> | null, deps: unknown[]): Load<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    const ctl = new AbortController();
    const p = fnRef.current(ctl.signal);
    if (!p) { setState({ data: null, error: null, loading: false }); return () => ctl.abort(); }
    setState({ data: null, error: null, loading: true });
    p.then((data) => { if (!ctl.signal.aborted) setState({ data, error: null, loading: false }); },
      (error) => { if (!ctl.signal.aborted && (error as Error)?.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ctl.abort();
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

// ------------------------------------------------------------------ the chosen child (remembered; ?child= in the hash wins)
const CHILD_KEY = 'enara_design_parent_child';
const readKey = () => { try { return localStorage.getItem(CHILD_KEY); } catch { return null; } };
const writeKey = (v: string) => { try { localStorage.setItem(CHILD_KEY, v); } catch { /* storage blocked */ } };
const childInHash = () => { const q = window.location.hash.split('?')[1]; return q ? new URLSearchParams(q).get('child') : null; };

export interface Children { list: LearnerChip[]; child: LearnerChip | null; select: (id: string) => void; loading: boolean; error: unknown; reload: () => void; hiddenBySchool: number; pending: number }
export function useChildren(): Children {
  const q = useLoad((signal) => get<LearnersResp>(ep.learners, signal), []);
  const [sel, setSel] = useState<string | null>(() => childInHash() ?? readKey());
  const list = (q.data?.learners ?? []).filter((l) => l && typeof l.studentId === 'string');
  const child = list.find((l) => l.studentId === sel) ?? list[0] ?? null;
  useEffect(() => { if (child) writeKey(child.studentId); }, [child?.studentId]);
  const select = useCallback((id: string) => {
    setSel(id); writeKey(id);
    // Keep a shared link honest: if the hash names a child, it now names this one (no navigation).
    const [path, query] = window.location.hash.split('?');
    if (query) { const p = new URLSearchParams(query); if (p.has('child')) { p.set('child', id); window.history.replaceState(window.history.state, '', `${path}?${p.toString()}`); } }
  }, []);
  return { list, child, select, loading: q.loading, error: q.error, reload: q.reload, hiddenBySchool: q.data?.hiddenBySchool ?? 0, pending: q.data?.pending?.length ?? 0 };
}
export const childName = (c: LearnerChip | null | undefined) => (c?.firstName || c?.name?.split(/\s+/)[0] || '').trim();

// ------------------------------------------------------------------ Cairo dates and times (Latin digits in both languages)
const TZ = 'Africa/Cairo';
const loc = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
export const cairoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const cairoMonth = () => cairoToday().slice(0, 7);
export const cairoHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
export const cairoHour = () => Number(cairoHHMM().slice(0, 2)) || 0;
const isDay = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d);
/** A YYYY-MM-DD calendar day (formatted at noon UTC so it never shifts). */
export function fmtDay(d: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!isDay(d)) return '';
  try { return new Intl.DateTimeFormat(loc(lang), { timeZone: 'UTC', ...opts }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)); } catch { return d; }
}
/** An ISO timestamp, in Cairo time. */
export function fmtStamp(iso: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, hourCycle: 'h23', ...opts }).format(d);
}
export const fmtMonth = (m: string, lang: Lang) => fmtDay(`${m}-15`, lang, { month: 'long', year: 'numeric' });
export const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 15)); return d.toISOString().slice(0, 7); };
/** Whole days from a to b (YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
/** "15:10" plus minutes, as "15:25" (null when the time is not HH:MM). */
export function addMinutes(hhmm: string | null | undefined, min: number | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m || !min) return null;
  const t = (+m[1] * 60 + +m[2] + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
/** A sentence from the school, ending with a full stop so a following sentence reads well. */
export const sentence = (s: string | null | undefined) => { const x = (s ?? '').trim(); return !x || /[.!?؟…。]$/.test(x) ? x : `${x}.`; };
export const bi = (v: Bi | string | null | undefined, lang: Lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] || v.en || '');

// ------------------------------------------------------------------ shared states
const ST = {
  en: { retry: 'Try again', offTitle: 'The school has not turned this on', offBody: 'When the school shares this information on ENARA, it will appear here.', noChildTitle: 'No child linked yet', noChildBody: 'When a child is linked to your account, their school information will appear here.', hidden: 'The school has turned off parent access for one of your children for now.', notYet: 'Not available yet', errTitle: 'This could not be loaded' },
  ar: { retry: 'حاول مرة أخرى', offTitle: 'لم تفعّل المدرسة هذا القسم', offBody: 'عندما تشارك المدرسة هذه المعلومات على إنارة، ستظهر هنا.', noChildTitle: 'لا يوجد ابن أو ابنة مرتبط بعد', noChildBody: 'عند ربط ابن أو ابنة بحسابك، ستظهر معلوماته المدرسية هنا.', hidden: 'أوقفت المدرسة مؤقتًا وصول أولياء الأمور لأحد أبنائك.', notYet: 'غير متاح بعد', errTitle: 'تعذّر تحميل هذه الصفحة' },
};
export const useST = () => ST[usePreview().lang];

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry: () => void; className?: string }) {
  const { lang } = usePreview();
  const t = ST[lang];
  return (
    <Card role="alert" className={cn('flex flex-col items-center gap-3 p-6 text-center', className)} data-testid="parent-error">
      <span className="grid size-12 place-items-center rounded-full bg-destructive-soft text-destructive"><TriangleAlert className="size-6" /></span>
      <div><p className="font-bold">{t.errTitle}</p><p className="mt-1 text-sm text-muted-foreground">{friendly(error, lang)}</p></div>
      <Button variant="outline" onPress={onRetry}><RefreshCw />{t.retry}</Button>
    </Card>
  );
}

export function CalmState({ icon, title, body, className, children }: { icon?: ReactNode; title: string; body?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <Card className={cn('flex flex-col items-center gap-3 p-8 text-center', className)} data-testid="parent-calm">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">{icon ?? <CircleOff />}</span>
      <div className="max-w-md"><p className="font-bold">{title}</p>{body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}</div>
      {children}
    </Card>
  );
}
export function OffState({ className }: { className?: string }) {
  const t = useST();
  return <CalmState title={t.offTitle} body={t.offBody} className={className} />;
}
export function NoChildState() {
  const t = useST();
  return <CalmState icon={<UsersRound />} title={t.noChildTitle} body={t.noChildBody} />;
}
/** A small note where the approved design shows something no API provides yet. */
export function NotYet({ children, className }: { children?: ReactNode; className?: string }) {
  const t = useST();
  return <p className={cn('text-xs text-muted-foreground', className)}>{children ?? t.notYet}</p>;
}

/** Generic page skeleton: a chip row and a few cards. */
export function PageSkeleton({ cards = 3, aside = true }: { cards?: number; aside?: boolean }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" data-testid="parent-loading">
      <div className="flex gap-2"><Skeleton className="h-11 w-36 rounded-full" /><Skeleton className="h-11 w-36 rounded-full" /></div>
      <div className={cn('grid gap-5', aside && 'lg:grid-cols-[1fr_340px]')}>
        <div className="flex min-w-0 flex-col gap-5">{Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
        {aside && <div className="flex flex-col gap-4"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>}
      </div>
    </div>
  );
}
