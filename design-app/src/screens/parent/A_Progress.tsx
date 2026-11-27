import type { ReactNode } from 'react';
import { Atom, BookA, BookOpen, Calculator, Home, Languages, Sparkles } from 'lucide-react';
import { get } from '@/lib/api';
import { num, usePreview, useT, type Lang } from '@/lib/preview';
import { SectionTitle } from '@/components/shell';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, ParentShell } from './A_shared';
import { ChildGate } from './B_common';
import {
  bi, childName, ep, ErrorState, fmtDay, NotYet, optional, PageSkeleton, useChildren, useLoad,
  type ActivityResp, type AssessmentItem, type LearnerChip, type ProgressResp, type SubjectCardResp, type SubjectsResp, type WeeklyStatus,
} from './data';

const T = {
  en: {
    title: 'Progress', sub: (n: string, s: string) => [n, s].filter(Boolean).join(' · '),
    lessons: 'Lessons completed', avg: 'Average of recent results', time: 'Minutes this week',
    chart: 'Learning time per day', chartSub: 'Minutes on ENARA, last 14 days', min: 'min', thisWeek: 'This week', goal: (g: string) => `Weekly goal: ${g} min`,
    table: 'Minutes per day', day: 'Day', minutes: 'Minutes', noChart: 'No learning time recorded in the last 14 days.',
    subjects: 'Subjects', mastered: 'Mastered', notYet: 'Not mastered yet', outcomes: 'Learning outcomes', of: 'of', lessonsOf: (a: string, b: string) => `${a} of ${b} lessons done`,
    recent: 'Recent results', home: 'Practise at home', ai: 'Suggested by ENARA', waiting: 'Waiting for the teacher', noResults: 'No results yet.',
    subjectsOff: 'A subject-by-subject view is not available yet.', noSubjects: 'No subject activity yet. Subjects appear here once your child starts learning on ENARA.',
  },
  ar: {
    title: 'التقدّم', sub: (n: string, s: string) => [n, s].filter(Boolean).join(' · '),
    lessons: 'الدروس المكتملة', avg: 'متوسط النتائج الأخيرة', time: 'الدقائق هذا الأسبوع',
    chart: 'وقت التعلّم يوميًا', chartSub: 'الدقائق على إنارة خلال آخر 14 يومًا', min: 'دقيقة', thisWeek: 'هذا الأسبوع', goal: (g: string) => `الهدف الأسبوعي: ${g} دقيقة`,
    table: 'الدقائق في كل يوم', day: 'اليوم', minutes: 'الدقائق', noChart: 'لم يُسجَّل وقت تعلّم خلال آخر 14 يومًا.',
    subjects: 'المواد', mastered: 'أُتقنت', notYet: 'لم تُتقن بعد', outcomes: 'نواتج التعلّم', of: 'من', lessonsOf: (a: string, b: string) => `أُنجز ${a} من ${b} درسًا`,
    recent: 'أحدث النتائج', home: 'تدرّبوا في البيت', ai: 'اقتراح من إنارة', waiting: 'بانتظار المعلّم', noResults: 'لا توجد نتائج بعد.',
    subjectsOff: 'عرض التقدّم لكل مادة غير متاح بعد.', noSubjects: 'لا يوجد نشاط في المواد بعد. تظهر المواد هنا عندما يبدأ ابنك أو ابنتك التعلّم على إنارة.',
  },
};
type TT = (typeof T)['en'];

function iconFor(s: SubjectCardResp): ReactNode {
  const k = `${s.key} ${s.name?.en ?? ''}`.toLowerCase();
  if (/math/.test(k)) return <Calculator />;
  if (/arab/.test(k)) return <Languages />;
  if (s.english || /engl/.test(k)) return <BookA />;
  if (/scien|physic|chem|biol/.test(k)) return <Atom />;
  return <BookOpen />;
}

export default function ParentProgress() {
  const t = useT(T);
  const kids = useChildren();
  return (
    <ParentShell active="progress" title={t.title} subtitle={kids.child ? t.sub(childName(kids.child), kids.child.school ?? '') : undefined}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ChildGate kids={kids} skeleton={<PageSkeleton cards={2} aside={false} />}>
          {(child) => (<><ChildSwitcher kids={kids} /><ProgressBody key={child.studentId} child={child} /></>)}
        </ChildGate>
      </div>
    </ParentShell>
  );
}

const soft = <T,>(p: Promise<T | null>) => p.catch(() => null);

function ProgressBody({ child }: { child: LearnerChip }) {
  const t = useT(T);
  const { lang } = usePreview();
  const id = child.studentId;
  const q = useLoad(async (signal) => {
    const [progress, subjects, activity, status] = await Promise.all([
      get<ProgressResp>(ep.progress(id), signal),
      soft(optional(get<SubjectsResp>(ep.subjects(id), signal))),
      soft(get<ActivityResp>(ep.activity(id), signal)),
      soft(get<{ status?: WeeklyStatus }>(ep.status(id), signal)),
    ]);
    return { progress, subjects, activity, status: status?.status ?? null };
  }, [id]);

  if (q.loading) return (
    <div className="flex flex-col gap-6" aria-busy="true" data-testid="parent-loading">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]"><div className="grid grid-cols-3 gap-3 lg:grid-cols-1"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div><Skeleton className="h-64 rounded-xl" /></div>
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  );
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;

  const { progress, subjects, activity, status } = q.data;
  const results = (progress?.assessments?.items ?? []).filter((a) => a && a.id);
  const scored = results.filter((a) => typeof a.score === 'number') as (AssessmentItem & { score: number })[];
  const avg = scored.length ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length) : null;
  const sum: [string, string][] = [
    [t.lessons, typeof progress?.lessonsCompleted?.count === 'number' ? num(progress.lessonsCompleted.count, lang) : '—'],
    [t.avg, avg !== null ? `${num(avg, lang)}%` : '—'],
    [t.time, typeof status?.minutesDone === 'number' ? num(status.minutesDone, lang) : '—'],
  ];
  const list = subjects?.subjects ?? [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]">
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          {sum.map(([l, v]) => (
            <Card key={l} className="flex min-w-0 flex-col justify-center gap-1 p-3 md:p-4">
              <span className="text-xs font-semibold text-muted-foreground">{l}</span>
              <span className="text-xl font-bold tabular-nums md:text-2xl">{v}</span>
            </Card>
          ))}
        </div>
        <DailyChart activity={activity} status={status} t={t} lang={lang} />
      </div>

      <section>
        <SectionTitle>{t.subjects}</SectionTitle>
        {!subjects ? (
          <div className="flex flex-col gap-4">
            <NotYet className="text-sm">{t.subjectsOff}</NotYet>
            <Card><CardHeader><CardTitle>{t.recent}</CardTitle></CardHeader><CardContent><Results items={results.slice(0, 6)} t={t} lang={lang} /></CardContent></Card>
          </div>
        ) : !list.length ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">{t.noSubjects}</p></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((s) => <SubjectCard key={s.key} s={s} results={results.filter((a) => a.subject?.key === s.key).slice(0, 3)} t={t} lang={lang} />)}
          </div>
        )}
      </section>
    </>
  );
}

/** One series (minutes per day), so no legend; the title names it. Bars from divs; future days are empty. */
function DailyChart({ activity, status, t, lang }: { activity: ActivityResp | null; status: WeeklyStatus | null; t: TT; lang: Lang }) {
  const days = (activity?.calendar?.days ?? []).filter((d) => d?.day);
  const max = Math.max(1, ...days.map((d) => d.minutes ?? 0));
  const any = days.some((d) => (d.minutes ?? 0) > 0);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div><CardTitle className="text-lg">{t.chart}</CardTitle><p className="text-sm text-muted-foreground">{t.chartSub}</p></div>
        {typeof status?.minutesDone === 'number' && <div className="text-end"><p className="text-xs font-semibold text-muted-foreground">{t.thisWeek}</p><p className="text-2xl font-bold tabular-nums leading-tight">{num(status.minutesDone, lang)} <span className="text-sm font-semibold text-muted-foreground">{t.min}</span></p></div>}
      </CardHeader>
      <CardContent>
        {!days.length ? <NotYet className="text-sm" /> : (
          <>
            {typeof status?.goalMinutes === 'number' && <p className="mb-3 text-xs text-muted-foreground">{t.goal(num(status.goalMinutes, lang))}</p>}
            <div className="relative h-40" aria-hidden>
              <div className="absolute inset-x-0 bottom-0 border-t" />
              <div className="relative flex h-full items-end gap-1 sm:gap-2">
                {days.map((d) => {
                  const m = d.minutes ?? 0;
                  return (
                    <div key={d.day} title={`${fmtDay(d.day, lang, { weekday: 'short', day: 'numeric', month: 'short' })}: ${num(m, lang)} ${t.min}`} className="group flex h-full flex-1 items-end justify-center">
                      <div className={cn('w-full max-w-10 rounded-t-[4px] group-hover:opacity-80', m ? (d.isToday ? 'bg-primary' : 'bg-chart-1') : 'bg-muted')} style={{ height: m ? `${(m / max) * 100}%` : 4 }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex gap-1 sm:gap-2" aria-hidden>
              {days.map((d, i) => (
                <span key={d.day} className={cn('flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground sm:text-xs', i % 2 === 1 && !d.isToday && 'max-sm:invisible', d.isToday && 'font-bold text-foreground')}>{fmtDay(d.day, lang, { day: 'numeric' })}</span>
              ))}
            </div>
            {!any && <p className="mt-3 text-sm text-muted-foreground">{t.noChart}</p>}
            <table className="sr-only">
              <caption>{t.table}</caption>
              <thead><tr><th>{t.day}</th><th>{t.minutes}</th></tr></thead>
              <tbody>{days.map((d) => <tr key={d.day}><td>{fmtDay(d.day, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</td><td>{d.minutes ?? 0}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Results({ items, t, lang }: { items: AssessmentItem[]; t: TT; lang: Lang }) {
  if (!items.length) return <p className="py-2 text-sm text-muted-foreground">{t.noResults}</p>;
  return (
    <ul className="divide-y">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.title}</span>{r.submittedAt && <span className="text-xs text-muted-foreground">{fmtDay(r.submittedAt.slice(0, 10), lang, { day: 'numeric', month: 'short' })}</span>}</span>
          {typeof r.score === 'number' ? <span dir="ltr" className="font-bold tabular-nums">{num(Math.round(r.score), lang)}%</span> : r.waiting ? <Badge tone="neutral">{t.waiting}</Badge> : <span className="text-muted-foreground">—</span>}
        </li>
      ))}
    </ul>
  );
}

function SubjectCard({ s, results, t, lang }: { s: SubjectCardResp; results: AssessmentItem[]; t: TT; lang: Lang }) {
  const mastered = Math.max(0, s.outcomes?.mastered ?? 0);
  const total = Math.max(0, s.outcomes?.total ?? 0);
  const rest = Math.max(0, total - mastered);
  const pct = total ? `${(Math.min(mastered, total) / total) * 100}%` : '0%';
  const level = s.english && s.cefr?.label ? `${bi(s.cefr.label, lang)}${s.cefr.cefr ? ` · ${s.cefr.cefr}` : ''}` : bi(s.outcomes?.bandLabel, lang);
  const latest = s.latestResult;
  const shown: AssessmentItem[] = results.length ? results : latest?.title ? [{ id: `latest-${s.key}`, title: latest.title, score: latest.score ?? null, submittedAt: latest.submittedAt ?? undefined }] : [];
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-5">{iconFor(s)}</span>
        <CardTitle className="min-w-0 flex-1 text-lg">{bi(s.name, lang) || s.key}</CardTitle>
        {level && <Badge tone="info" className="max-w-40 truncate">{level}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {total > 0 ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{t.outcomes}</span>
              <span className="tabular-nums text-muted-foreground">{num(mastered, lang)} {t.of} {num(total, lang)} {t.mastered}</span>
            </div>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${t.mastered} ${mastered}, ${t.notYet} ${rest}`}>
              <div className="bg-success" style={{ width: pct }} />
              <div className="flex-1 bg-muted" />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />{t.mastered} {num(mastered, lang)}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border bg-muted" />{t.notYet} {num(rest, lang)}</span>
            </div>
          </div>
        ) : null}
        {typeof s.lessons?.total === 'number' && s.lessons.total > 0 && <p className="text-sm text-muted-foreground">{t.lessonsOf(num(s.lessons.done ?? 0, lang), num(s.lessons.total, lang))}</p>}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.recent}</p>
          <Results items={shown} t={t} lang={lang} />
        </div>
        {s.top?.do && (
          <div className="mt-auto flex gap-3 rounded-lg bg-warning-soft/70 p-3 text-sm">
            <Home className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <div className="min-w-0">
              <p><span className="font-bold">{t.home}: </span>{bi(s.top.do, lang)}</p>
              {s.top.ai && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3.5" />{t.ai}</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
