// Errors to work on (class-wide), wired to lms-test:
//   GET /api/assignments/classes                    the teacher's classes (switcher)
//   GET /api/learning/classes/:classId/insights     misconceptionsToReview (grouped by outcome + description, with learners),
//                                                   commonGaps (outcomes where learners show a gap) and the mastery heatmap
// There is no class-level "errors to work on" endpoint yet (errors-to-work-on is per learner), so example mistakes,
// trends and practice sets are shown as "Not available yet".
import { useMemo, useState } from 'react';
import { CalendarDays, Info, Target, Users } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { get } from '@/lib/api';
import { Alert, Avatar, Card, Progress, Skeleton, Tab, TabList, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ClassPicker, EmptyPanel, ErrorPanel, NoClasses, NotYet, SkeletonRows, TeacherShell, arr, learnersAr, numOr, obj, str, useLoad, useSelectedClass, useTeacherClasses } from './common';

const T = {
  en: {
    title: 'Errors to work on', sub: (c: string) => `${c} · common errors across the class`,
    tErrors: 'Common errors', tOutcomes: 'Weakest outcomes',
    based: (n: number, d: number) => `Based on ${n} ${n === 1 ? 'learner' : 'learners'} · ${d} finished a diagnostic · computed from stored records`,
    learnersOf: (n: number, m: number) => `${n} of ${m} learners`, assessed: (n: number) => `${n} assessed on this outcome`,
    cat: {
      conceptual_misunderstanding: 'Concept misunderstood', procedural_error: 'Procedure error', calculation_error: 'Calculation error', prerequisite_gap: 'Gap in an earlier skill',
      misinterpretation: 'Question misread', incomplete_reasoning: 'Incomplete reasoning', l1_transfer: 'Carried over from Arabic', unknown: 'Other',
    } as Record<string, string>,
    confirmed: (n: number) => `${n} confirmed`, suspected: (n: number) => `${n} suspected`, avgConf: 'Average confidence', heuristic: 'a heuristic, not a probability',
    who: 'Learners', more: (n: number) => `+${n} more`, examples: 'Example mistakes', trend: 'Trend', practice: 'Practice set',
    mean: 'Class mastery', notAssessed: 'Not assessed yet',
    noErrors: 'No common errors recorded yet', noErrorsBody: 'Errors appear here when ENARA finds the same mistake in learners’ work.',
    noGaps: 'No weak outcomes yet', noGapsBody: 'Outcomes appear here when learners show a gap on independent work.',
    gapNote: 'Example mistakes, trends over time and one-click practice sets need a class-level “errors to work on” summary, which ENARA does not provide yet.',
  },
  ar: {
    title: 'أخطاء للعمل عليها', sub: (c: string) => `${c} · الأخطاء الشائعة في الفصل`,
    tErrors: 'الأخطاء الشائعة', tOutcomes: 'أضعف نواتج التعلّم',
    based: (n: number, d: number) => `بناءً على ${learnersAr(n)} · أنهى ${d} اختبارًا تشخيصيًا · محسوبة من السجلات المحفوظة`,
    learnersOf: (n: number, m: number) => `${n} من ${m}`, assessed: (n: number) => `قُيّم ${n} في هذا الناتج`,
    cat: {
      conceptual_misunderstanding: 'سوء فهم للمفهوم', procedural_error: 'خطأ في الإجراء', calculation_error: 'خطأ حسابي', prerequisite_gap: 'فجوة في مهارة سابقة',
      misinterpretation: 'سوء فهم للسؤال', incomplete_reasoning: 'استدلال غير مكتمل', l1_transfer: 'منقول من العربية', unknown: 'أخرى',
    } as Record<string, string>,
    confirmed: (n: number) => `${n} مؤكَّدة`, suspected: (n: number) => `${n} محتمَلة`, avgConf: 'متوسط الثقة', heuristic: 'تقدير تقريبي وليس احتمالًا',
    who: 'الطلاب', more: (n: number) => `+${n} آخرين`, examples: 'أمثلة على الأخطاء', trend: 'الاتجاه', practice: 'مجموعة التدريب',
    mean: 'إتقان الفصل', notAssessed: 'لم يُقيَّم بعد',
    noErrors: 'لم تُسجَّل أخطاء شائعة بعد', noErrorsBody: 'تظهر الأخطاء هنا عندما تجد إنارة الخطأ نفسه في أعمال الطلاب.',
    noGaps: 'لا توجد نواتج تعلّم ضعيفة بعد', noGapsBody: 'تظهر نواتج التعلّم هنا عندما يُظهر الطلاب فجوة في عمل مستقل.',
    gapNote: 'أمثلة الأخطاء واتجاهها عبر الزمن ومجموعات التدريب بنقرة واحدة تحتاج إلى ملخص «أخطاء للعمل عليها» على مستوى الفصل، وهو غير متاح في إنارة بعد.',
  },
};

interface Person { id: string; name: string }
function People({ people, label }: { people: Person[]; label: string }) {
  const t = useT(T);
  const shown = people.slice(0, 7);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((p) => <li key={p.id} className="flex items-center gap-1.5 rounded-full border bg-card py-0.5 ps-0.5 pe-2.5 text-xs"><Avatar name={p.name || '?'} className="size-6 text-[10px]" />{(p.name || '—').split(' ')[0]}</li>)}
        {people.length > shown.length && <li className="flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{t.more(people.length - shown.length)}</li>}
      </ul>
    </div>
  );
}
const rankTone = (i: number) => (i === 0 ? 'bg-destructive text-destructive-foreground' : i < 3 ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground');
const barTone = (i: number) => (i === 0 ? 'danger' : i < 3 ? 'warning' : 'info') as 'danger' | 'warning' | 'info';

export default function Errors() {
  const t = useT(T);
  const { lang } = usePreview();
  const classes = useTeacherClasses();
  const cls = useSelectedClass(classes.data);
  const classId = cls?.id ?? null;
  const [tab, setTab] = useState<'errors' | 'outcomes'>('errors');
  const insights = useLoad(classId ? async (signal) => obj(await get(`/api/learning/classes/${encodeURIComponent(classId)}/insights`, signal)) : null, [classId]);
  const d = insights.data;
  const classSize = numOr(d?.studentsShown) ?? arr(d?.heatmap).length;
  const diag = numOr(obj(d?.diagnostics).studentsCompleted) ?? 0;

  const errors = useMemo(() => arr(d?.misconceptionsToReview).map(obj).map((g, i) => {
    const items = arr(g.items).map(obj);
    const confs = items.map((x) => numOr(x.confidence)).filter((v): v is number => v !== null);
    const people = new Map<string, Person>();
    for (const x of items) if (str(x.studentId)) people.set(str(x.studentId), { id: str(x.studentId), name: str(x.name) });
    return {
      key: `${str(g.objectiveId)}|${str(g.description)}|${i}`, description: str(g.description), category: str(g.category), code: str(g.code),
      people: [...people.values()], confirmed: items.filter((x) => x.status === 'confirmed').length, suspected: items.filter((x) => x.status === 'suspected').length,
      avgConf: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) : null,
    };
  }).sort((a, b) => b.people.length - a.people.length), [d]);

  const gaps = useMemo(() => {
    const heat = arr(d?.heatmap).map(obj);
    return arr(d?.commonGaps).map(obj).map((g) => {
      const vals = heat.map((h) => obj(arr(h.cells).find((c) => str(obj(c).objectiveId) === str(g.objectiveId)))).map((c) => numOr(c.masteryEstimate)).filter((v): v is number => v !== null);
      return {
        id: str(g.objectiveId), code: str(g.code), title: str(g.title), assessed: numOr(g.assessed) ?? 0,
        people: arr(g.studentsWithGap).map(obj).map((s) => ({ id: str(s.id), name: str(s.name) })).filter((p) => p.id),
        mean: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null,
      };
    });
  }, [d]);

  if (classes.error) return <TeacherShell active="errors" title={t.title}><ErrorPanel error={classes.error} onRetry={classes.reload} /></TeacherShell>;
  if (classes.data && !classes.data.length) return <TeacherShell active="errors" title={t.title}><NoClasses /></TeacherShell>;
  const loading = !classes.data || (insights.loading && !d);

  return (
    <TeacherShell active="errors" title={t.title} subtitle={cls ? t.sub(cls.courseName || cls.id) : undefined} badges={d && errors.length ? { errors: num(errors.length, lang) } : undefined}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {classes.data ? <ClassPicker classes={classes.data} value={classId} path="/teacher/errors" /> : <Skeleton className="h-11 w-full sm:w-72" />}
            <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k) as 'errors' | 'outcomes')}>
              <TabList aria-label={t.title}>
                <Tab id="errors">{t.tErrors}{d && <span className="ms-1 text-muted-foreground">{num(errors.length, lang)}</span>}</Tab>
                <Tab id="outcomes">{t.tOutcomes}{d && <span className="ms-1 text-muted-foreground">{num(gaps.length, lang)}</span>}</Tab>
              </TabList>
            </Tabs>
          </div>
          {d && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5 shrink-0" />{t.based(classSize, diag)}</p>}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Card key={i} className="p-5"><SkeletonRows rows={2} /><Skeleton className="mt-4 h-2 w-48" /></Card>)}</div>
        ) : insights.error ? (
          <ErrorPanel error={insights.error} onRetry={insights.reload} />
        ) : tab === 'errors' ? (
          !errors.length ? <EmptyPanel icon={<Target />} title={t.noErrors} body={t.noErrorsBody} /> : (
            <ol className="flex flex-col gap-3">
              {errors.map((e, i) => {
                const n = e.people.length;
                return (
                  <li key={e.key}>
                    <Card className="overflow-hidden">
                      <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_240px]">
                        <div className="flex flex-col gap-3 p-4 md:p-5">
                          <div className="flex items-start gap-3">
                            <span className={cn('grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold', rankTone(i))}>{num(i + 1, lang)}</span>
                            <div className="min-w-0 flex-1">
                              <h2 className="text-base font-bold leading-snug" dir="auto">{e.description || '—'}</h2>
                              <p className="text-xs text-muted-foreground">{[t.cat[e.category] ?? e.category.replace(/_/g, ' '), e.code].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={classSize ? (n / classSize) * 100 : 0} size="sm" tone={barTone(i)} className="max-w-48" ariaLabel={t.learnersOf(n, classSize)} />
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{t.learnersOf(n, classSize)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {e.confirmed > 0 && <span className="tabular-nums">{t.confirmed(e.confirmed)}</span>}
                            {e.suspected > 0 && <span className="tabular-nums">{t.suspected(e.suspected)}</span>}
                            {e.avgConf !== null && <span title={t.heuristic}>{t.avgConf}: <b className="tabular-nums text-foreground">{num(e.avgConf, lang)}%</b></span>}
                          </div>
                          <p className="text-xs text-muted-foreground"><span className="font-semibold">{t.examples}</span> · <NotYet /></p>
                        </div>
                        <div className="flex flex-col gap-3 border-t p-4 md:p-5 xl:border-s xl:border-t-0"><People people={e.people} label={t.who} /></div>
                        <div className="flex flex-col justify-center gap-1.5 border-t bg-muted/30 p-4 md:p-5 xl:border-s xl:border-t-0">
                          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t.trend}</span> · <NotYet /></p>
                          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t.practice}</span> · <NotYet /></p>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )
        ) : !gaps.length ? <EmptyPanel icon={<Users />} title={t.noGaps} body={t.noGapsBody} /> : (
          <ol className="flex flex-col gap-3">
            {gaps.map((g, i) => {
              const n = g.people.length;
              return (
                <li key={g.id || i}>
                  <Card className="overflow-hidden">
                    <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_240px]">
                      <div className="flex flex-col gap-3 p-4 md:p-5">
                        <div className="flex items-start gap-3">
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold', rankTone(i))}>{num(i + 1, lang)}</span>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-base font-bold leading-snug" dir="auto">{g.title || g.code || g.id}</h2>
                            {g.code && <p className="text-xs text-muted-foreground"><bdi>{g.code}</bdi></p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={classSize ? (n / classSize) * 100 : 0} size="sm" tone={barTone(i)} className="max-w-48" ariaLabel={t.learnersOf(n, classSize)} />
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{t.learnersOf(n, classSize)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">{t.assessed(g.assessed)}</p>
                      </div>
                      <div className="flex flex-col gap-3 border-t p-4 md:p-5 xl:border-s xl:border-t-0"><People people={g.people} label={t.who} /></div>
                      <div className="flex flex-col justify-center gap-2 border-t bg-muted/30 p-4 md:p-5 xl:border-s xl:border-t-0">
                        <p className="text-xs font-semibold">{t.mean}</p>
                        {g.mean === null ? <p className="text-xs text-muted-foreground">{t.notAssessed}</p> : (
                          <div className="flex items-center gap-2"><Progress value={g.mean} size="sm" tone={g.mean < 55 ? 'danger' : g.mean < 65 ? 'warning' : 'success'} ariaLabel={`${g.mean}%`} /><span className="text-xs font-semibold tabular-nums">{num(g.mean, lang)}%</span></div>
                        )}
                        <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t.practice}</span> · <NotYet /></p>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
        {!loading && !insights.error && <Alert tone="info" icon={<Info />}>{t.gapNote}</Alert>}
      </div>
    </TeacherShell>
  );
}
