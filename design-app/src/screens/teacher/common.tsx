// Shared bits for teacher screens: the AdminShell with teacher navigation, data loading with loading / error / empty
// states, the class switcher, safe readers for API fields, dates, and grading-source badges.
// Every value shown on a teacher screen comes from the lms-test API; what no endpoint gives is shown as "Not available yet".
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Bot, CircleSlash, ClipboardCheck, FileText, Inbox, Lamp, ListChecks, RefreshCw, Target, UserCheck, Users } from 'lucide-react';
import { useT, usePreview, type Lang } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { ApiError, errorText, get } from '@/lib/api';
import { AdminShell } from '@/components/shell';
import { Alert, Badge, Button, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

const T = {
  en: {
    classes: 'Classes', grading: 'Grading', assessments: 'Assessments', errors: 'Errors to work on', school: 'Your school', pages: 'Teacher pages',
    retry: 'Try again', loadErr: 'We couldn’t load this', offTitle: 'Not available yet', offBody: 'This part of ENARA is not switched on for your school yet.',
    notYet: 'Not available yet', cls: 'Class', noClasses: 'You have no classes yet', noClassesBody: 'When your school adds you to a class, it appears here.',
  },
  ar: {
    classes: 'الفصول', grading: 'التصحيح', assessments: 'التقييمات', errors: 'أخطاء للعمل عليها', school: 'مدرستك', pages: 'صفحات المعلم',
    retry: 'إعادة المحاولة', loadErr: 'تعذّر تحميل هذه البيانات', offTitle: 'غير متاح بعد', offBody: 'هذا الجزء من إنارة غير مفعَّل لمدرستك بعد.',
    notYet: 'غير متاح بعد', cls: 'الفصل', noClasses: 'لا توجد لديك فصول بعد', noClassesBody: 'عندما تضيفك مدرستك إلى فصل، سيظهر هنا.',
  },
};

// ------------------------------------------------------------------ safe readers (the API is not tested from here)
export const arr = <X = any>(x: unknown): X[] => (Array.isArray(x) ? (x as X[]) : []);
export const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
export const numOr = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export const obj = (x: unknown): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, any>) : {});

// ------------------------------------------------------------------ hash query (?class=, ?id=, ?attempt=)
function readQuery() {
  const h = window.location.hash.replace(/^#/, '');
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}
export function useQueryParam(name: string): string | null {
  const [v, setV] = useState(() => readQuery().get(name));
  useEffect(() => {
    const on = () => setV(readQuery().get(name));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [name]);
  return v;
}
/** Navigate to a teacher route, changing only the given query params (others such as lang are kept). */
export function setQuery(path: string, params: Record<string, string | null | undefined>) {
  const q = readQuery();
  for (const [k, v] of Object.entries(params)) { if (v) q.set(k, v); else q.delete(k); }
  const s = q.toString();
  window.location.hash = '#' + path + (s ? `?${s}` : '');
}

// ------------------------------------------------------------------ loading
export interface Load<D> { data: D | undefined; error: unknown; loading: boolean; reload: () => void }
/** Runs fn on mount and whenever deps change; keeps the old data while a reload of the same deps runs. fn = null: nothing to load. */
export function useLoad<D>(fn: ((signal: AbortSignal) => Promise<D>) | null, deps: unknown[]): Load<D> {
  const [state, setState] = useState<{ data?: D; error?: unknown; loading: boolean }>({ loading: !!fn });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps) + (fn ? '' : ':off');
  const lastKey = useRef(key);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const run = fnRef.current;
    const same = lastKey.current === key;
    lastKey.current = key;
    if (!run) { setState({ loading: false }); return; }
    const ac = new AbortController();
    setState((s) => ({ data: same ? s.data : undefined, loading: true }));
    run(ac.signal).then(
      (data) => { if (!ac.signal.aborted) setState({ data, loading: false }); },
      (error) => { if (!ac.signal.aborted && (error as Error)?.name !== 'AbortError') setState((s) => ({ data: same ? s.data : undefined, error, loading: false })); },
    );
    return () => ac.abort();
  }, [key, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

/** The school has this feature switched off (or the endpoint hides itself with a 404). */
export const isFeatureOff = (e: unknown) => e instanceof ApiError && (e.code === 'FEATURE_DISABLED' || (e.status === 404 && e.code === 'NOT_FOUND'));

export function ErrorPanel({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const t = useT(T);
  const { lang } = usePreview();
  const off = isFeatureOff(error);
  return (
    <Alert tone={off ? 'info' : 'danger'} icon={off ? <CircleSlash /> : <AlertCircle />} title={off ? t.offTitle : t.loadErr} className={className}>
      <p>{off ? t.offBody : errorText(error, lang)}</p>
      {!off && onRetry && <Button size="sm" variant="outline" className="mt-2" onPress={onRetry}><RefreshCw />{t.retry}</Button>}
    </Alert>
  );
}

export function EmptyPanel({ title, body, icon, className, children }: { title: string; body?: string; icon?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

export function NotYet({ className }: { className?: string }) {
  const t = useT(T);
  return <span className={cn('text-xs text-muted-foreground', className)}>{t.notYet}</span>;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ classes
export interface TeacherClass { id: string; courseName: string; curriculumId: string | null; curriculumName: string | null; lessons: { id: string; title: string }[] }
/** GET /api/assignments/classes: the classes the teacher instructs (admins: the school's). */
export function useTeacherClasses() {
  return useLoad<TeacherClass[]>(async (signal) => {
    const r = await get<any>('/api/assignments/classes', signal);
    return arr(obj(r).classes).map((c) => {
      const o = obj(c);
      return {
        id: str(o.id), courseName: str(o.courseName), curriculumId: str(o.curriculumId) || null, curriculumName: str(o.curriculumName) || null,
        lessons: arr(o.lessons).map((l) => ({ id: str(obj(l).id), title: str(obj(l).title) })).filter((l) => l.id),
      };
    }).filter((c) => c.id);
  }, []);
}
/** The class in ?class=, or the first class. */
export function useSelectedClass(classes: TeacherClass[] | undefined) {
  const param = useQueryParam('class');
  const list = classes ?? [];
  return list.find((c) => c.id === param) ?? list[0] ?? null;
}

export function ClassPicker({ classes, value, path, allLabel, className }: { classes: TeacherClass[]; value: string | null; path: string; allLabel?: string; className?: string }) {
  const t = useT(T);
  const items = [...(allLabel ? [{ id: '__all', name: allLabel }] : []), ...classes.map((c) => ({ id: c.id, name: c.courseName || c.id }))];
  return (
    <Select aria-label={t.cls} items={items} selectedKey={value ?? (allLabel ? '__all' : null)} className={cn('w-full sm:w-72', className)}
      onSelectionChange={(k) => { if (k != null) setQuery(path, { class: String(k) === '__all' ? null : String(k), attempt: null }); }} />
  );
}

export function NoClasses() {
  const t = useT(T);
  return <EmptyPanel icon={<Users />} title={t.noClasses} body={t.noClassesBody} />;
}

// ------------------------------------------------------------------ shell
type NavId = 'classes' | 'grading' | 'assessments' | 'errors';
export function TeacherShell({ active, title, subtitle, actions, children, badges }: { active: NavId; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; badges?: Partial<Record<NavId, string>> }) {
  const t = useT(T);
  const { user } = useSession();
  const cls = useQueryParam('class');
  const q = cls ? `?class=${encodeURIComponent(cls)}` : '';
  const nav = [
    { id: 'classes', label: t.classes, icon: <Users />, href: `#/teacher${q}` },
    { id: 'grading', label: t.grading, icon: <ClipboardCheck />, href: `#/teacher/grading${q}` },
    { id: 'assessments', label: t.assessments, icon: <FileText />, href: '#/teacher/builder' },
    { id: 'errors', label: t.errors, icon: <Target />, href: `#/teacher/errors${q}` },
  ].map((n) => ({ ...n, badge: badges?.[n.id as NavId] }));
  return (
    <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={t.school} user={user?.name || user?.email || ''}>
      {/* Phone and tablet: the shell's side navigation is hidden, so the four teacher pages are linked here. */}
      <nav aria-label={t.pages} className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
        {nav.map((n) => (
          <a key={n.id} href={n.href} aria-current={n.id === active ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold [&_svg]:size-3.5', n.id === active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
            {n.icon}{n.label}
          </a>
        ))}
      </nav>
      {children}
    </AdminShell>
  );
}

// ------------------------------------------------------------------ dates and numbers
const cairoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
export function daysAgo(iso: unknown): number | null {
  const s = str(iso);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.parse(cairoDay(d)), b = Date.parse(cairoDay(new Date()));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
export function relDay(iso: unknown, lang: Lang): string | null {
  const n = daysAgo(iso);
  if (n === null) return null;
  if (n === 0) return lang === 'ar' ? 'اليوم' : 'Today';
  if (n === 1) return lang === 'ar' ? 'أمس' : 'Yesterday';
  if (lang === 'en') return `${n} days ago`;
  return n === 2 ? 'منذ يومين' : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يومًا`;
}
export function fmtDateTime(iso: unknown, lang: Lang): string {
  const s = str(iso);
  const d = s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(d);
}
/** Arabic count noun: 1 واحد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب. */
export const arCount = (n: number, forms: { one: string; two: string; few: string; many: string }) => (n === 1 ? forms.one : n === 2 ? forms.two : n >= 3 && n <= 10 ? `${n} ${forms.few}` : `${n} ${forms.many}`);
export const learnersAr = (n: number) => (n === 0 ? 'لا طلاب' : arCount(n, { one: 'طالب واحد', two: 'طالبان', few: 'طلاب', many: 'طالبًا' }));

// ------------------------------------------------------------------ grading sources
export type Source = 'mishkat' | 'model' | 'rules' | 'teacher';
const SRC = {
  en: { mishkat: 'Scored by Mishkat', model: 'Scored by the AI model', rules: 'Scored by rules', teacher: 'Teacher override' },
  ar: { mishkat: 'صحّحه مِشكاة', model: 'صحّحه نموذج الذكاء الاصطناعي', rules: 'صُحّح بالقواعد', teacher: 'تعديل المعلم' },
};
const SRC_STYLE: Record<Source, { tone: 'info' | 'outline' | 'neutral' | 'warning'; Icon: typeof Lamp; cls?: string }> = {
  mishkat: { tone: 'info', Icon: Lamp },
  model: { tone: 'outline', Icon: Bot, cls: 'border-chart-4/40 text-chart-4' },
  rules: { tone: 'neutral', Icon: ListChecks },
  teacher: { tone: 'warning', Icon: UserCheck },
};
/** The four grading sources, always shown as a badge next to a score. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const t = useT(SRC);
  const s = SRC_STYLE[source];
  return <Badge tone={s.tone} className={cn(s.cls, className)}><s.Icon />{t[source]}</Badge>;
}
