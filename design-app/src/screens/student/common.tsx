// Shared pieces for the student screens wired to the lms-test API: the /api/me response shapes (derived from
// backend/src/controllers/me*.controller.ts and tutor.controller.ts), a small loader hook, hash query params,
// Cairo dates, bilingual error text, and the loading / empty / error / "not available yet" states.
// Every field from the server is optional here: these screens cannot be tested against the live API, so each read is guarded.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CloudOff, RefreshCw } from 'lucide-react';
import { API_BASE, ApiError, errorText, get, post } from '@/lib/api';
import { num, usePreview, type Lang } from '@/lib/preview';
import { Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Response shapes (all optional: guard every read)

/** GET /api/me/courses item (me.controller listMyCourses). */
export interface CourseSummary { id?: string; instanceId?: string; title?: string; subject?: string; academicYear?: string; progressPct?: number; lessonsCount?: number; completedLessons?: number }
/** A lesson inside GET /api/me/courses/:id (studentCourseService buildCourseTree). */
export interface Lesson { id?: string; title?: string; status?: 'completed' | 'active' | 'locked' | string; order?: number; description?: string }
export interface CourseTree { id?: string; title?: string; subject?: string; progressPct?: number; modules?: { id?: string; title?: string; lessonsCount?: number; completedLessons?: number; lessons?: Lesson[] }[] }
/** GET /api/me/dashboard (meDashboard.controller getDashboard). */
export interface Dashboard {
  student?: { name?: string; grade?: string; streak?: number; avatar?: string };
  continueLearning?: { courseId?: string; lessonId?: string; title?: string; subject?: string; progressPct?: number } | null;
  recentActivity?: { title?: string; type?: 'quiz' | 'lesson'; score?: number; date?: string }[];
  upcomingAssessments?: { id?: string; title?: string; subject?: string; status?: string; dueDate?: string }[];
  courses?: { id?: string; title?: string; subject?: string; progressPct?: number }[];
}
export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'grading' | 'grading_delayed' | 'awaiting_review' | 'graded' | 'released' | 'missing';
/** GET /api/me/assignments item (meAssignments.controller listMyAssignments). */
export interface AssignmentItem { id?: string; title?: string; classId?: string; opensAt?: string; dueAt?: string; originalDueAt?: string; timeZone?: string; latePolicy?: string; timeLimitMinutes?: number | null; maxAttempts?: number; attemptsUsed?: number; status?: AssignmentStatus | string; late?: boolean; canSubmit?: boolean; lateIfSubmittedNow?: boolean }
/** One answer of a released result (resultView). */
export interface ResultAnswer { questionId?: string; questionText?: string; studentAnswer?: string | number; points?: number | null; maxPoints?: number; feedback?: string | null; scoreExplanation?: string | null; strengths?: string[]; improvements?: string[]; criterionScores?: { criterionId?: string; levelId?: string; points?: number }[]; correctAnswer?: string | number; explanation?: string; isCorrect?: boolean }
/** A submitted attempt as the student may see it (resultView): nothing but status before release. */
export interface AttemptResult { attemptId?: string; submittedAt?: string; late?: boolean; released?: boolean; processing?: 'grading' | 'with_teacher' | 'delayed' | string; releasedAt?: string; totalPoints?: number; maxPoints?: number; score?: number; overallFeedback?: string | null; answers?: ResultAnswer[]; answerKeyShown?: boolean; appeals?: { id?: string; questionId?: string | null; message?: string; status?: string; response?: string | null }[] }
/** GET /api/me/assignments/:id (getMyAssignment). */
export interface AssignmentDetail {
  assignment?: { id?: string; title?: string; instructions?: string | null; opensAt?: string; dueAt?: string; originalDueAt?: string; timeZone?: string; latePolicy?: string; closesAt?: string | null; timeLimitMinutes?: number | null; maxAttempts?: number; tutorPolicy?: string; format?: string; questionCount?: number; totalPoints?: number };
  status?: AssignmentStatus | string; late?: boolean; canStart?: boolean; window?: { open?: boolean; late?: boolean; reason?: string }; openAttemptId?: string | null; attempts?: AttemptResult[];
}
/** The answer record in GET /api/me/results/:id (the stored attempt answer: carries who scored it). */
export interface StoredAnswer { questionId?: string; questionText?: string; studentAnswer?: string | number; answerText?: string; isCorrect?: boolean; correctAnswer?: string | number; explanation?: string; points?: number | null; maxPoints?: number; method?: 'rule' | 'ai' | 'ai_proposal' | 'teacher' | string; grader?: string; engine?: string; feedback?: string; feedbackText?: string; scoreExplanation?: string; strengths?: string[]; improvements?: string[]; criteria?: { code?: string; points?: number; max?: number; scoredBy?: 'code' | 'model' | 'mishkat' | string }[]; teacherOverride?: unknown; topic?: string }
/** GET /api/me/results item and /api/me/results/:id (meAssessment.controller). */
export interface QuizResult { id?: string; assessmentId?: string; assessmentTitle?: string; subject?: string; score?: number; date?: string; timeSpentSec?: number; answers?: StoredAnswer[]; answersRevealed?: boolean }

// ---------------------------------------------------------------- Helpers

export const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export const firstName = (name?: string) => (name || '').trim().split(/\s+/)[0] || '';
/** A server error code, e.g. FEATURE_DISABLED when a school has the teaching workflow off. */
export const codeOf = (e: unknown) => (e as ApiError | undefined)?.code;
export const isFeatureOff = (e: unknown) => codeOf(e) === 'FEATURE_DISABLED';
export const isAbort = (e: unknown) => (e as Error | undefined)?.name === 'AbortError';
/** Server-side image paths are relative to the API. */
export const mediaUrl = (u?: string) => (!u ? '' : /^https?:\/\//.test(u) ? u : u.startsWith('/') ? API_BASE + u : u);

/** Query parameters after the route in the hash (#/student/assignment?id=…), kept in sync with navigation. */
export function useHashQuery(): URLSearchParams {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [q, setQ] = useState(read);
  useEffect(() => {
    const on = () => setQ(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return q;
}

/** Load data once per key; reload() for Retry. Aborted on unmount or when the key changes. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  const fn = useRef(load);
  fn.current = load;
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ data: s.data, error: null, loading: true }));
    fn.current(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ data, error: null, loading: false }); },
      (error) => { if (!ctl.signal.aborted && !isAbort(error)) setState({ data: null, error, loading: false }); },
    );
    return () => ctl.abort();
  }, [key, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload, setData };
}

/** GET that resolves to { off: true } when the school has the feature off (404 FEATURE_DISABLED). */
export async function getOrOff<T>(path: string, signal?: AbortSignal): Promise<T | { off: true }> {
  try { return await get<T>(path, signal); } catch (e) { if (isFeatureOff(e)) return { off: true }; throw e; }
}
export const isOff = (v: unknown): v is { off: true } => !!v && typeof v === 'object' && (v as { off?: boolean }).off === true;

/** Hands a result, assignment or study item to the tutor (POST /api/me/tutor/handoff, no AI call): returns the new chat's id. */
export const tutorHandoff = (kind: 'assignment' | 'result', refId: string) => post<{ sessionId?: string; title?: string }>('/api/me/tutor/handoff', { kind, refId });

// ---------------------------------------------------------------- Dates (Cairo time, Latin digits, 12-hour)

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
export function fmtDate(iso: string | undefined | null, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { return new Intl.DateTimeFormat(locale(lang), { timeZone: 'Africa/Cairo', ...opts }).format(d); } catch { return d.toLocaleDateString(); }
}
export const fmtTime = (iso: string | undefined | null, lang: Lang) => fmtDate(iso, lang, { hour: 'numeric', minute: '2-digit', hour12: true });
export const fmtDateTime = (iso: string | undefined | null, lang: Lang) => fmtDate(iso, lang, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
/** Whole days from now until the date (negative when past). */
export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}
export function daysLeftLabel(days: number | null, lang: Lang): string {
  if (days === null) return '';
  if (lang === 'ar') {
    if (days < 0) return 'انتهى الموعد';
    if (days === 0) return 'اليوم';
    if (days === 1) return 'بقي يوم واحد';
    if (days === 2) return 'بقي يومان';
    return days <= 10 ? `بقيت ${num(days, lang)} أيام` : `بقي ${num(days, lang)} يومًا`;
  }
  if (days < 0) return 'Past due';
  if (days === 0) return 'Due today';
  return days === 1 ? '1 day left' : `${num(days, lang)} days left`;
}
/** Cairo hour now, for the greeting. */
export function cairoHour(): number {
  try { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date())) % 24; } catch { return new Date().getHours(); }
}

// ---------------------------------------------------------------- Errors in the learner's language

const CODES: Record<string, { en: string; ar: string }> = {
  FEATURE_DISABLED: { en: 'This is not turned on for your school yet.', ar: 'هذه الميزة غير مفعّلة في مدرستك بعد.' },
  TUTOR_BLOCKED: { en: 'The tutor is off while an assignment is open.', ar: 'المعلّم متوقف ما دام هناك واجب مفتوح.' },
  ASSIGNMENT_NOT_FOUND: { en: 'We could not find this assignment.', ar: 'لم نعثر على هذا الواجب.' },
  ASSIGNMENT_PAST_DUE: { en: 'The due date has passed.', ar: 'انقضى موعد التسليم.' },
  ASSIGNMENT_CLOSED: { en: 'This assignment is closed.', ar: 'هذا الواجب مغلق.' },
  ASSIGNMENT_NOT_OPEN_YET: { en: 'This assignment is not open yet.', ar: 'لم يُفتح هذا الواجب بعد.' },
  ATTEMPT_LIMIT_REACHED: { en: 'You have used all your attempts.', ar: 'استنفدت كل محاولاتك.' },
  ATTEMPT_CLOSED: { en: 'This attempt is no longer open.', ar: 'لم تعد هذه المحاولة مفتوحة.' },
  OTHER_ATTEMPT_OPEN: { en: 'Finish your open attempt on this assessment first.', ar: 'أنهِ محاولتك المفتوحة في هذا التقييم أولًا.' },
  TUTOR_STREAM_INTERRUPTED: { en: 'The connection to the tutor was interrupted.', ar: 'انقطع الاتصال بالمعلّم.' },
  TUTOR_STREAM_FAILED: { en: 'The tutor could not finish this reply. Please try again.', ar: 'تعذّر على المعلّم إكمال هذا الرد. حاول مرة أخرى.' },
  NOT_RELEASED: { en: 'Your result is not released yet.', ar: 'لم تُعلَن نتيجتك بعد.' },
};
/** One user-safe line for an error, in the screen's language. */
export function errMsg(e: unknown, lang: Lang): string {
  const err = e as ApiError | undefined;
  const c = err?.code && CODES[err.code];
  if (c) return c[lang];
  if (err?.status === 401) return lang === 'ar' ? 'انتهت جلستك. سجّل الدخول مرة أخرى.' : 'Your session ended. Please sign in again.';
  if (err?.status === 404) return lang === 'ar' ? 'لم نعثر على ما تبحث عنه.' : 'We could not find this.';
  if (err?.status === 402 || err?.code === 'CREDITS_EXHAUSTED') return lang === 'ar' ? 'نفد رصيد الذكاء الاصطناعي لهذه الفترة.' : 'The AI allowance for this period is used up.';
  // Server messages are English: in Arabic, unknown 4xx errors get a general line.
  if (lang === 'ar' && err?.status && err.status !== 429 && err.status !== 0) return 'حدث خطأ. حاول مرة أخرى بعد قليل.';
  return errorText(e, lang);
}

// ---------------------------------------------------------------- States

const S = {
  en: { retry: 'Try again', na: 'Not available yet', loadTitle: 'We couldn’t load this', loading: 'Loading…' },
  ar: { retry: 'إعادة المحاولة', na: 'غير متاح بعد', loadTitle: 'تعذّر تحميل هذه الصفحة', loading: 'جارٍ التحميل…' },
};

/** Marks something no API gives yet. */
export function NotAvailable({ className }: { className?: string }) {
  const { lang } = usePreview();
  return <span className={cn('text-xs font-medium italic text-muted-foreground', className)}>{S[lang].na}</span>;
}

export function StateCard({ icon, title, text, action, className, tone = 'info' }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode; className?: string; tone?: 'info' | 'danger' | 'muted' }) {
  const t = { info: 'bg-info-soft text-info', danger: 'bg-destructive-soft text-destructive', muted: 'bg-muted text-muted-foreground' }[tone];
  return (
    <Card className={cn('flex flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <span className={cn('grid size-14 place-items-center rounded-2xl [&_svg]:size-7', t)}>{icon}</span>
      <h2 className="text-lg font-bold">{title}</h2>
      {text && <div className="max-w-sm text-sm leading-relaxed text-muted-foreground">{text}</div>}
      {action}
    </Card>
  );
}

/** Couldn't load: what happened, and Retry. */
export function ErrorState({ error, onRetry, title, className }: { error: unknown; onRetry: () => void; title?: string; className?: string }) {
  const { lang } = usePreview();
  const offline = (error as ApiError | undefined)?.code === 'NETWORK';
  return (
    <StateCard className={className} tone={offline ? 'info' : 'danger'} icon={offline ? <CloudOff /> : <AlertCircle />} title={title ?? S[lang].loadTitle} text={errMsg(error, lang)}
      action={<Button className="mt-1" onPress={onRetry}><RefreshCw />{S[lang].retry}</Button>} />
  );
}

/** A small inline error with Retry, for one part of a page. */
export function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { lang } = usePreview();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" /><span className="min-w-0 flex-1 text-foreground/80">{errMsg(error, lang)}</span>
      {onRetry && <Button size="sm" variant="outline" onPress={onRetry}><RefreshCw />{S[lang].retry}</Button>}
    </div>
  );
}

/** Generic page skeleton: a hero block, then cards. */
export function PageSkeleton({ rows = 3, aside = true }: { rows?: number; aside?: boolean }) {
  const { lang } = usePreview();
  return (
    <div aria-busy="true" aria-label={S[lang].loading} className={cn('mx-auto grid max-w-6xl gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
      <div className="flex min-w-0 flex-col gap-5">
        <Skeleton className="h-44 rounded-2xl" />
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      {aside && <div className="hidden flex-col gap-4 lg:flex"><Skeleton className="h-56 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>}
    </div>
  );
}

/** Text from the server (titles, feedback, tutor replies) keeps its own direction. Supports **bold** and line breaks. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div dir="auto" className={cn('flex min-w-0 flex-col gap-2 break-words', className)}>
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Assignment status in words

export const STATUS_TEXT: Record<string, { en: string; ar: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  not_started: { en: 'Not started', ar: 'لم يبدأ', tone: 'neutral' },
  in_progress: { en: 'In progress', ar: 'قيد الإنجاز', tone: 'warning' },
  submitted: { en: 'Submitted', ar: 'سُلِّم', tone: 'info' },
  grading: { en: 'Submitted · being marked', ar: 'سُلِّم · قيد التصحيح', tone: 'info' },
  grading_delayed: { en: 'Submitted · result delayed', ar: 'سُلِّم · تأخّرت النتيجة', tone: 'warning' },
  awaiting_review: { en: 'Submitted · with your teacher', ar: 'سُلِّم · لدى المعلّم', tone: 'info' },
  graded: { en: 'Marked · not released yet', ar: 'صُحِّح · لم يُعلَن بعد', tone: 'info' },
  released: { en: 'Result ready', ar: 'النتيجة جاهزة', tone: 'success' },
  missing: { en: 'Missing', ar: 'لم يُسلَّم', tone: 'danger' },
};
export const statusOf = (s: string | undefined, lang: Lang) => {
  const x = STATUS_TEXT[s ?? ''];
  return x ? { label: x[lang], tone: x.tone } : { label: s || '', tone: 'neutral' as const };
};

// ---------------------------------------------------------------- Who scored an answer

export type Source = 'rules' | 'mishkat' | 'ai' | 'teacher';
/** From the stored answer (GET /api/me/results/:id): rules (answer key / code rules), Mishkat, the AI grader, or a teacher. Same reading as the teacher's grading view. */
export function sourcesOf(a: StoredAnswer | undefined | null): Source[] {
  if (!a) return [];
  const out: Source[] = [];
  const crit = arr<{ scoredBy?: string }>(a.criteria);
  if (a.engine || crit.some((c) => c?.scoredBy === 'mishkat')) out.push('mishkat');
  else if (a.method === 'rule' || (a.grader === 'code' && crit.some((c) => c?.scoredBy === 'code'))) out.push('rules');
  else if (a.method === 'ai' || crit.some((c) => c?.scoredBy === 'model')) out.push('ai');
  if (a.method === 'teacher' || a.method === 'ai_proposal' || a.teacherOverride) out.push('teacher');
  return out;
}
