// School admin screens: the lms-test API shapes they read (derived from backend/src/schoolApp/*.ts and
// backend/src/parents/adminRoutes.ts), a small loading hook, the school scope, date formatting and the shared
// loading / empty / error pieces. Every field read from the API is optional here: the screens cannot be tested
// against the live API from this folder, so nothing assumes a field is present.
import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { ApiError, errorText, get } from '@/lib/api';
import { useSession } from '@/lib/session';
import { usePreview, type Lang } from '@/lib/preview';
import { Alert, Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ shapes
export type Section = 'timetable' | 'announcements' | 'attendance' | 'notifications' | 'fees' | 'buses' | 'requests' | 'consents' | 'chat';
export const SECTIONS: Section[] = ['timetable', 'announcements', 'attendance', 'notifications', 'fees', 'buses', 'requests', 'consents', 'chat'];
export type ImportSection = 'timetable' | 'attendance' | 'announcements' | 'fees' | 'bus_routes' | 'bus_assignments';
export const IMPORT_SECTIONS: ImportSection[] = ['timetable', 'attendance', 'announcements', 'fees', 'bus_routes', 'bus_assignments'];
export const SECTION_OF: Record<ImportSection, Section> = { timetable: 'timetable', attendance: 'attendance', announcements: 'announcements', fees: 'fees', bus_routes: 'buses', bus_assignments: 'buses' };

export interface TemplateCol { key: string; required?: boolean; header?: string; headerAr?: string | null }
/** GET /api/school-app/status */
export interface Status {
  institutionId?: string | null;
  available?: Partial<Record<Section, boolean>>;
  sections?: Partial<Record<Section, boolean>>;
  feesVisibleTo?: 'all' | 'owner';
  retentionDays?: number;
  templates?: Partial<Record<ImportSection, TemplateCol[]>>;
}
export interface RosterStudent { id?: string; name?: string; grade?: string | null }
/** GET /api/school-app/roster */
export interface Roster { groups?: { name?: string; students?: RosterStudent[] }[]; withoutGroup?: RosterStudent[] }
/** GET /api/school-app/imports */
export interface ImportRow { id?: string; section?: ImportSection; fileName?: string; status?: 'preview' | 'confirmed' | 'undone' | 'expired' | string; counts?: Record<string, number>; createdAt?: string; confirmedAt?: string; undoneAt?: string; canUndo?: boolean }
/** GET /api/school-app/requests */
export type ReqStatus = 'new' | 'in_progress' | 'done' | 'refused' | 'cancelled';
export type ReqType = 'certificate' | 'early_leave' | 'teacher_meeting' | 'other';
export interface ReqRow { id?: string; type?: ReqType | string; details?: string; preferredDate?: string | null; status?: ReqStatus | string; reply?: string | null; history?: { at?: string; by?: 'parent' | 'school' | string; status?: string; note?: string | null }[]; createdAt?: string; updatedAt?: string; via?: string; studentId?: string; studentName?: string }
export interface ReqList { counts?: Partial<Record<ReqStatus, number>>; requests?: ReqRow[] }
/** GET /api/school-app/announcements */
export interface Ann { id?: string; audience?: 'school' | 'grade' | 'group' | 'student' | string; audienceValue?: string | null; title?: string; body?: string; publishAt?: string; expiresAt?: string | null; withdrawn?: boolean; source?: string }
/** GET /api/parents-admin/schools (usage: SchoolUsage in backend/src/parents/usage.ts) */
export interface ParentsSchools { schools?: { id?: string; name?: string; usage?: { linkedParents?: number; active7?: number; active30?: number; logins30?: number } }[] }
/** GET /api/school-app/moodle */
export interface Moodle { switchOn?: boolean; connections?: { platformId?: string; site?: string; vendor?: string; hasToken?: boolean; enabled?: boolean; lastRun?: { at?: string; code?: string; announcements?: number; attendance?: number; problems?: number; courses?: number } | null }[] }
/** GET /api/school-app/buses (only busPhonesShared is used here) */
export interface Buses { busPhonesShared?: boolean; routes?: unknown[] }

export const rosterStudents = (r: Roster | undefined | null): RosterStudent[] => [...(r?.groups ?? []).flatMap((g) => g?.students ?? []), ...(r?.withoutGroup ?? [])];
export const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ------------------------------------------------------------------ school scope
/** A school admin works on their own school. An ENARA admin names the school in the address: #/school?institutionId=… */
export function useScope() {
  const { user } = useSession();
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const id = user?.role === 'enara-admin' ? q.get('institutionId') || undefined : undefined;
  return React.useMemo(() => ({
    id,
    /** API path with the school for an ENARA admin. */
    path: (p: string) => (id ? `${p}${p.includes('?') ? '&' : '?'}institutionId=${encodeURIComponent(id)}` : p),
    /** API body with the school for an ENARA admin. */
    body: <B extends object>(b: B): B => (id ? { ...b, institutionId: id } : b),
    /** In-app link that keeps the school for an ENARA admin. */
    href: (route: string) => `#${route}${id ? `?institutionId=${encodeURIComponent(id)}` : ''}`,
  }), [id]);
}

// ------------------------------------------------------------------ loading
export interface Loaded<T> { data?: T; error?: unknown; loading: boolean; reload: () => void; set: (d: T) => void }
/** GET a path (null = do not load). Keeps the last data while reloading so the page does not flash. */
export function useApi<T>(path: string | null): Loaded<T> {
  const [state, setState] = React.useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: !!path });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!path) { setState({ loading: false }); return; }
    const ac = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    get<T>(path, ac.signal)
      .then((data) => setState({ data: data ?? undefined, loading: false }))
      .catch((error) => { if ((error as Error)?.name !== 'AbortError') setState({ error, loading: false }); });
    return () => ac.abort();
  }, [path, tick]);
  const reload = React.useCallback(() => setTick((x) => x + 1), []);
  const set = React.useCallback((data: T) => setState({ data, loading: false }), []);
  return { ...state, reload, set };
}

// Cached for the page's life: the school's name and parent numbers (Parents P1), used by the shell and the dashboard.
const cache = new Map<string, Promise<unknown>>();
export function useCached<T>(path: string | null): { data?: T; failed: boolean } {
  const [s, setS] = React.useState<{ data?: T; failed: boolean }>({ failed: false });
  React.useEffect(() => {
    if (!path) return;
    let live = true;
    if (!cache.has(path)) cache.set(path, get<T>(path));
    (cache.get(path) as Promise<T>).then((data) => { if (live) setS({ data, failed: false }); }).catch(() => { cache.delete(path); if (live) setS({ failed: true }); });
    return () => { live = false; };
  }, [path]);
  return s;
}

/** The school's name and parent numbers: GET /api/parents-admin/schools (Parents P1; 404 while that switch is off). */
export function useParentsSchool() {
  const { user } = useSession();
  const scope = useScope();
  const res = useCached<ParentsSchools>(user?.role === 'admin' || user?.role === 'enara-admin' ? '/api/parents-admin/schools' : null);
  const school = res.data?.schools?.find((s) => s?.id === (scope.id ?? user?.institutionId)) ?? (scope.id ? undefined : res.data?.schools?.[0]);
  return { school, loading: !!user && (user.role === 'admin' || user.role === 'enara-admin') && !res.data && !res.failed, failed: res.failed || !(user?.role === 'admin' || user?.role === 'enara-admin') };
}

// The open-requests count for the navigation badge. Any status filter returns the counts of every status, so the
// smallest list (cancelled) is asked for. Screens that change a request call refreshRequestCounts().
let countsP: { key: string; p: Promise<ReqList['counts']> } | null = null;
const countListeners = new Set<() => void>();
export function refreshRequestCounts() { countsP = null; countListeners.forEach((l) => l()); }
export function useRequestCounts() {
  const scope = useScope();
  const [counts, setCounts] = React.useState<ReqList['counts'] | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const l = () => setTick((x) => x + 1); countListeners.add(l); return () => { countListeners.delete(l); }; }, []);
  React.useEffect(() => {
    let live = true;
    const key = scope.path('/api/school-app/requests?status=cancelled');
    if (!countsP || countsP.key !== key) countsP = { key, p: get<ReqList>(key).then((r) => r?.counts ?? {}) };
    countsP.p.then((c) => { if (live) setCounts(c ?? {}); }).catch(() => { countsP = null; if (live) setCounts(null); });
    return () => { live = false; };
  }, [scope, tick]);
  return counts;
}

// ------------------------------------------------------------------ text and dates
const TZ = 'Africa/Cairo';
const loc = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
export const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const cairoToday = () => ymd(new Date());
export function fmtDate(v: unknown, lang: Lang, withYear = false): string {
  if (!isDate(v)) return '—';
  return new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(v));
}
export function fmtLongToday(lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}
/** "Today, 08:40" · "Yesterday, 14:12" · "23 Nov, 10:05" in Cairo time. */
export function fmtWhen(v: unknown, lang: Lang, inSentence = false): string {
  if (!isDate(v)) return '—';
  const d = new Date(v);
  const time = new Intl.DateTimeFormat(loc(lang), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const day = ymd(d), today = cairoToday(), yesterday = ymd(new Date(Date.now() - 86_400_000));
  const sep = lang === 'ar' ? '، ' : ', ';
  if (day === today) return `${lang === 'ar' ? 'اليوم' : inSentence ? 'today' : 'Today'}${sep}${time}`;
  if (day === yesterday) return `${lang === 'ar' ? 'أمس' : inSentence ? 'yesterday' : 'Yesterday'}${sep}${time}`;
  return `${fmtDate(v, lang)}${sep}${time}`;
}
export const hoursSince = (v: unknown) => (isDate(v) ? (Date.now() - new Date(v).getTime()) / 3_600_000 : 0);

/** A one-line message for a failed load: the school app switched off (404) or a role without access (403) get their own words. */
export function loadErrorText(e: unknown, lang: Lang): string {
  const err = e as ApiError;
  if (err?.status === 404) return lang === 'ar' ? 'تطبيق المدرسة لأولياء الأمور غير مفعّل على هذا الموقع بعد.' : 'The school app for parents is not switched on for this site yet.';
  if (err?.status === 403) return lang === 'ar' ? 'لا يملك حسابك صلاحية إدارة تطبيق المدرسة. اطلب ذلك من مسؤول المدرسة.' : 'Your account cannot manage the school app. Ask a school admin.';
  if (err?.status === 400) return lang === 'ar' ? 'لا توجد مدرسة محددة لهذا الحساب.' : 'No school is set for this account.';
  return errorText(e, lang);
}

// ------------------------------------------------------------------ shared pieces
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { lang } = usePreview();
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="error-state">
      <Alert tone="danger" title={lang === 'ar' ? 'تعذّر التحميل' : 'Could not load'}>{loadErrorText(error, lang)}</Alert>
      {onRetry && <Button variant="outline" size="sm" className="w-fit" onPress={onRetry}><RotateCw />{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>}
    </div>
  );
}
export function EmptyState({ icon, title, children, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)} data-testid="empty-state">
      {icon && <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span>}
      <p className="text-sm font-semibold">{title}</p>
      {children && <p className="max-w-sm text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn('divide-y', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </Card>
  );
}
export const NotYet = ({ className }: { className?: string }) => {
  const { lang } = usePreview();
  return <span className={cn('text-xs font-medium text-muted-foreground', className)}>{lang === 'ar' ? 'غير متاح بعد' : 'Not available yet'}</span>;
};

/** A minimal CSV reader (quotes, commas, new lines) for the local file summary and the column samples. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** Save bytes or text as a file (templates). */
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
