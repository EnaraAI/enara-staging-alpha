// Class overview, wired to lms-test:
//   GET /api/assignments/classes                      the teacher's classes (switcher)
//   GET /api/teaching/overview                        per-class work counts and the teacher's open follow-ups
//   GET /api/teaching/classes/:classId/roster         learners, last activity, submitted / late / missing
//   GET /api/learning/classes/:classId/insights       mastery estimates per learner and outcome (may be switched off)
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, CalendarClock, ClipboardCheck, Flag as FlagIcon, Gauge, TriangleAlert, UserX, Users } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { get } from '@/lib/api';
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Cell, Column, Progress, Row, SearchField, Skeleton, Table, TableBody, TableHeader, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ClassPicker, EmptyPanel, ErrorPanel, NoClasses, NotYet, SkeletonRows, TeacherShell, arr, daysAgo, fmtDateTime, isFeatureOff, learnersAr, numOr, obj, relDay, str,
  useLoad, useSelectedClass, useTeacherClasses,
} from './common';

const T = {
  en: {
    title: 'Class overview', loadingSub: 'Loading your classes…',
    sub: (n: number) => `${n} ${n === 1 ? 'learner' : 'learners'}`,
    kActive: 'Active this week', kActiveHint: 'Recorded learning activity in the last 7 days', kMastery: 'Average mastery', kMasteryHint: 'ENARA’s estimate across learning outcomes',
    kGrade: 'Waiting for your review', kGradeHint: (n: number) => (n ? `${n} still being graded` : 'Nothing is being graded now'), kMissing: 'Missing work', kMissingHint: (n: number) => `${n} handed in late`,
    learners: 'Learners', search: 'Search learners', all: 'All', flagged: 'Flagged',
    cName: 'Learner', cLevel: 'Grade', cActive: 'Last active', cMastery: 'Mastery', cFlag: 'Flag',
    noActivity: 'No activity yet', missing: (n: number) => `${n} missing`, late: (n: number) => `${n} late`, followUp: 'Follow-up open', notStarted: 'Not started in the LMS',
    showing: (a: number, b: number) => `Showing ${a} of ${b} learners`, viewAll: 'View all', viewLess: 'Show fewer',
    noLearners: 'No learners in this class yet', noLearnersBody: 'Learners appear here when they join the class.', noMatch: 'No learners match your search',
    attention: 'Needs attention', attentionSub: 'Your open follow-ups and missing work in this class',
    nothing: 'Nothing needs attention', nothingBody: 'No open follow-ups and no missing work.',
    overdue: 'Overdue', due: (d: string) => `Due ${d}`, missingWork: (n: number) => (n === 1 ? '1 assignment missing' : `${n} assignments missing`),
    action: {
      revisit_lesson: 'Revisit the lesson', prerequisite_practice: 'Practise a prerequisite', targeted_exercise: 'Targeted exercise', check_in: 'Check in',
      tutor_support: 'Tutor support', spaced_review: 'Spaced review', reassessment: 'Reassessment', ai_tutoring: 'AI tutoring', guided_practice: 'Guided practice', review: 'Review', teacher_assigned: 'Teacher-assigned work',
    } as Record<string, string>,
    skills: 'Class mastery by outcome', skillsSub: 'Lowest first · ENARA’s estimate, not a grade', noOutcomes: 'No mastery estimates for this class yet.',
    nextDue: 'Next due', none: 'None',
  },
  ar: {
    title: 'نظرة عامة على الفصل', loadingSub: 'جارٍ تحميل فصولك…',
    sub: (n: number) => learnersAr(n),
    kActive: 'النشطون هذا الأسبوع', kActiveHint: 'نشاط تعلّم مسجَّل خلال آخر 7 أيام', kMastery: 'متوسط الإتقان', kMasteryHint: 'تقدير إنارة عبر نواتج التعلّم',
    kGrade: 'بانتظار مراجعتك', kGradeHint: (n: number) => (n ? `${n} قيد التصحيح الآن` : 'لا شيء قيد التصحيح الآن'), kMissing: 'أعمال لم تُسلَّم', kMissingHint: (n: number) => `${n} سُلّمت متأخرة`,
    learners: 'الطلاب', search: 'ابحث عن طالب', all: 'الكل', flagged: 'عليهم علامة',
    cName: 'الطالب', cLevel: 'الصف', cActive: 'آخر نشاط', cMastery: 'الإتقان', cFlag: 'العلامة',
    noActivity: 'لا نشاط بعد', missing: (n: number) => `${n} لم تُسلَّم`, late: (n: number) => `${n} متأخرة`, followUp: 'متابعة مفتوحة', notStarted: 'لم يبدأ في نظام التعلّم',
    showing: (a: number, b: number) => `يُعرض ${a} من ${b}`, viewAll: 'عرض الكل', viewLess: 'عرض أقل',
    noLearners: 'لا يوجد طلاب في هذا الفصل بعد', noLearnersBody: 'يظهر الطلاب هنا عند انضمامهم إلى الفصل.', noMatch: 'لا يوجد طلاب يطابقون بحثك',
    attention: 'يحتاج إلى متابعة', attentionSub: 'متابعاتك المفتوحة والأعمال غير المسلَّمة في هذا الفصل',
    nothing: 'لا شيء يحتاج إلى متابعة', nothingBody: 'لا متابعات مفتوحة ولا أعمال غير مسلَّمة.',
    overdue: 'متأخرة', due: (d: string) => `موعدها ${d}`, missingWork: (n: number) => (n === 1 ? 'واجب واحد لم يُسلَّم' : n === 2 ? 'واجبان لم يُسلَّما' : `${n} واجبات لم تُسلَّم`),
    action: {
      revisit_lesson: 'مراجعة الدرس', prerequisite_practice: 'تدريب على متطلب سابق', targeted_exercise: 'تمرين موجَّه', check_in: 'متابعة شخصية',
      tutor_support: 'دعم المعلم الذكي', spaced_review: 'مراجعة متباعدة', reassessment: 'إعادة تقييم', ai_tutoring: 'تعليم بالذكاء الاصطناعي', guided_practice: 'تدريب موجَّه', review: 'مراجعة', teacher_assigned: 'عمل عيّنه المعلم',
    } as Record<string, string>,
    skills: 'إتقان الفصل حسب ناتج التعلّم', skillsSub: 'الأضعف أولًا · تقدير إنارة وليس درجة', noOutcomes: 'لا توجد تقديرات إتقان لهذا الفصل بعد.',
    nextDue: 'الموعد التالي', none: 'لا يوجد',
  },
};

type Flag = 'missing' | 'late' | 'followUp' | 'notStarted';
interface Learner { id: string; name: string; grade: string; lastActiveAt: string | null; missing: number; late: number; openInterventions: number; lmsNotStarted: boolean; mastery: number | null }
const barTone = (m: number) => (m < 55 ? 'danger' : m < 65 ? 'warning' : 'success') as 'danger' | 'warning' | 'success';
const PAGE = 14;

function flagsOf(l: Learner): Flag[] {
  const f: Flag[] = [];
  if (l.missing > 0) f.push('missing');
  if (l.openInterventions > 0) f.push('followUp');
  if (l.lmsNotStarted) f.push('notStarted');
  if (l.late > 0) f.push('late');
  return f;
}
function Flags({ l }: { l: Learner }) {
  const t = useT(T);
  const f = flagsOf(l);
  if (!f.length) return <span className="text-muted-foreground" aria-hidden>—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {f.includes('missing') && <Badge tone="danger"><TriangleAlert />{t.missing(l.missing)}</Badge>}
      {f.includes('followUp') && <Badge tone="info"><FlagIcon />{t.followUp}</Badge>}
      {f.includes('notStarted') && <Badge tone="warning"><UserX />{t.notStarted}</Badge>}
      {f.includes('late') && !f.includes('missing') && <Badge tone="warning"><ClipboardCheck />{t.late(l.late)}</Badge>}
    </span>
  );
}
function MasteryCell({ v, insightsOff, wide }: { v: number | null; insightsOff: boolean; wide?: boolean }) {
  const { lang } = usePreview();
  if (insightsOff) return <NotYet />;
  if (v === null) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="flex items-center gap-2.5"><Progress value={v} size="sm" tone={barTone(v)} className={wide ? 'w-32' : 'w-24'} ariaLabel={`${v}%`} /><span className="w-9 text-xs font-semibold tabular-nums">{num(v, lang)}%</span></span>;
}

export default function ClassOverview() {
  const t = useT(T);
  const { lang } = usePreview();
  const classes = useTeacherClasses();
  const cls = useSelectedClass(classes.data);
  const classId = cls?.id ?? null;

  const overview = useLoad(async (signal) => obj(await get('/api/teaching/overview', signal)), []);
  const roster = useLoad(classId ? async (signal) => obj(await get(`/api/teaching/classes/${encodeURIComponent(classId)}/roster`, signal)) : null, [classId]);
  const insights = useLoad(classId ? async (signal) => obj(await get(`/api/learning/classes/${encodeURIComponent(classId)}/insights`, signal)) : null, [classId]);
  const insightsOff = !!insights.error;

  // Mastery per learner: mean of ENARA's per-outcome estimates (0–1) that exist, as a percentage.
  const masteryOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of arr(insights.data?.heatmap)) {
      const vals = arr(obj(row).cells).map((c) => numOr(obj(c).masteryEstimate)).filter((v): v is number => v !== null);
      if (vals.length) m.set(str(obj(row).studentId), Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100));
    }
    return m;
  }, [insights.data]);

  const learners: Learner[] = useMemo(() => arr(roster.data?.students).map((s) => {
    const o = obj(s);
    const id = str(o.id);
    return {
      id, name: str(o.name) || id, grade: str(o.grade), lastActiveAt: str(o.lastActiveAt) || null,
      missing: numOr(o.missing) ?? 0, late: numOr(o.late) ?? 0, openInterventions: numOr(o.openInterventions) ?? 0, lmsNotStarted: o.lmsNotStarted === true,
      mastery: masteryOf.get(id) ?? null,
    };
  }).filter((l) => l.id), [roster.data, masteryOf]);

  const [query, setQueryText] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const flaggedCount = learners.filter((l) => flagsOf(l).length).length;
  const filtered = learners.filter((l) => (!onlyFlagged || flagsOf(l).length) && (!query.trim() || l.name.toLowerCase().includes(query.trim().toLowerCase())));
  const rows = showAll ? filtered : filtered.slice(0, PAGE);

  const ovClass = obj(arr(overview.data?.classes).find((c) => str(obj(c).id) === classId));
  const activeWeek = learners.filter((l) => { const d = daysAgo(l.lastActiveAt); return d !== null && d < 7; }).length;
  const withMastery = learners.map((l) => l.mastery).filter((v): v is number => v !== null);
  const avg = withMastery.length ? Math.round(withMastery.reduce((a, b) => a + b, 0) / withMastery.length) : null;
  const missingTotal = learners.reduce((n, l) => n + l.missing, 0);
  const lateTotal = learners.reduce((n, l) => n + l.late, 0);
  const awaiting = numOr(ovClass.awaitingReview);
  const grading = numOr(ovClass.grading) ?? 0;
  const nextDue = obj(ovClass.nextDue);

  // Needs attention: the teacher's own open follow-ups (from the API) for learners in this class, then learners with missing work.
  const ids = new Set(learners.map((l) => l.id));
  const followUps = arr(overview.data?.followUps).map(obj).filter((f) => ids.has(str(f.studentId)));
  const withFollowUp = new Set(followUps.map((f) => str(f.studentId)));
  const missingList = learners.filter((l) => l.missing > 0 && !withFollowUp.has(l.id)).sort((a, b) => b.missing - a.missing);
  const nameOf = (id: string) => learners.find((l) => l.id === id)?.name ?? '';

  // Outcomes: class mean of the estimates that exist, lowest first.
  const outcomes = useMemo(() => {
    const objectives = arr(insights.data?.objectives).map(obj);
    const heat = arr(insights.data?.heatmap).map(obj);
    return objectives.map((o) => {
      const vals = heat.map((h) => obj(arr(h.cells).find((c) => str(obj(c).objectiveId) === str(o.id)))).map((c) => numOr(c.masteryEstimate)).filter((v): v is number => v !== null);
      return { id: str(o.id), label: [str(o.code), str(o.title)].filter(Boolean).join(' · ') || str(o.id), v: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null };
    }).filter((o) => o.v !== null).sort((a, b) => (a.v ?? 0) - (b.v ?? 0)).slice(0, 6) as { id: string; label: string; v: number }[];
  }, [insights.data]);

  const rosterLoading = !!classId && roster.loading && !roster.data;
  const kpiValue = (loading: boolean, v: ReactNode) => (loading ? <Skeleton className="h-6 w-14" /> : v);
  const kpis = [
    { label: t.kActive, value: kpiValue(rosterLoading, <>{num(activeWeek, lang)}<span className="text-base font-semibold text-muted-foreground"> / {num(learners.length, lang)}</span></>), hint: t.kActiveHint, Icon: Activity, tone: 'text-info bg-info-soft' },
    { label: t.kMastery, value: kpiValue(!!classId && insights.loading && !insights.data, avg === null ? <NotYet className="text-sm font-semibold" /> : `${num(avg, lang)}%`), hint: t.kMasteryHint, Icon: Gauge, tone: 'text-success bg-success-soft' },
    { label: t.kGrade, value: kpiValue(overview.loading && !overview.data, awaiting === null ? '—' : num(awaiting, lang)), hint: t.kGradeHint(grading), Icon: ClipboardCheck, tone: 'text-warning-foreground bg-warning-soft' },
    { label: t.kMissing, value: kpiValue(rosterLoading, num(missingTotal, lang)), hint: t.kMissingHint(lateTotal), Icon: TriangleAlert, tone: 'text-destructive bg-destructive-soft' },
  ];

  const title = cls?.courseName || t.title;
  const subtitle = !classes.data ? t.loadingSub : roster.data ? [cls?.curriculumName, t.sub(learners.length)].filter(Boolean).join(' · ') : cls?.curriculumName ?? undefined;

  if (classes.error) return <TeacherShell active="classes" title={t.title}><ErrorPanel error={classes.error} onRetry={classes.reload} /></TeacherShell>;
  if (classes.data && !classes.data.length) return <TeacherShell active="classes" title={t.title}><NoClasses /></TeacherShell>;

  return (
    <TeacherShell active="classes" title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {classes.data ? <ClassPicker classes={classes.data} value={classId} path="/teacher" /> : <Skeleton className="h-11 w-full sm:w-72" />}
          {nextDue.title && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" /><span className="truncate">{t.nextDue}: <bdi>{str(nextDue.title)}</bdi> · {fmtDateTime(nextDue.dueAt, lang)}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="flex items-start gap-3 p-4">
              <span className={cn('hidden size-9 shrink-0 place-items-center rounded-md sm:grid', k.tone)}><k.Icon className="size-4.5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{k.label}</p>
                <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{k.value}</div>
                <p className="mt-1.5 text-xs text-muted-foreground">{k.hint}</p>
              </div>
            </Card>
          ))}
        </div>
        {!!overview.error && !isFeatureOff(overview.error) && <ErrorPanel error={overview.error} onRetry={overview.reload} />}

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <Card className="min-w-0">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <CardTitle>{t.learners} {roster.data && <span className="font-normal text-muted-foreground">({num(learners.length, lang)})</span>}</CardTitle>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="flex gap-1">
                  <Toggle isSelected={!onlyFlagged} onChange={() => setOnlyFlagged(false)}>{t.all}</Toggle>
                  <Toggle isSelected={onlyFlagged} onChange={() => setOnlyFlagged(true)}>{t.flagged} · {num(flaggedCount, lang)}</Toggle>
                </div>
                <SearchField aria-label={t.search} placeholder={t.search} value={query} onChange={setQueryText} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
              </div>
            </CardHeader>

            {rosterLoading || (!classId && !classes.data) ? (
              <SkeletonRows rows={6} className="border-t p-5" />
            ) : roster.error ? (
              <div className="border-t p-5"><ErrorPanel error={roster.error} onRetry={roster.reload} /></div>
            ) : !learners.length ? (
              <div className="border-t p-5"><EmptyPanel icon={<Users />} title={t.noLearners} body={t.noLearnersBody} /></div>
            ) : !filtered.length ? (
              <div className="border-t p-5"><EmptyPanel title={t.noMatch} /></div>
            ) : (
              <>
                {/* Phone: stacked cards */}
                <ul className="divide-y border-t md:hidden">
                  {rows.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                      <Avatar name={l.name} className="size-9 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{l.name}</p>{l.grade && <Badge tone="outline" className="px-1.5">{l.grade}</Badge>}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"><MasteryCell v={l.mastery} insightsOff={insightsOff} /><span className="truncate text-xs text-muted-foreground">· {relDay(l.lastActiveAt, lang) ?? t.noActivity}</span></div>
                        {flagsOf(l).length > 0 && <div className="mt-1.5"><Flags l={l} /></div>}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <Table aria-label={t.learners}>
                    <TableHeader>
                      <Column isRowHeader className="ps-5">{t.cName}</Column>
                      <Column>{t.cLevel}</Column>
                      <Column>{t.cActive}</Column>
                      <Column className="w-56">{t.cMastery}</Column>
                      <Column className="pe-5">{t.cFlag}</Column>
                    </TableHeader>
                    <TableBody>
                      {rows.map((l) => {
                        const d = daysAgo(l.lastActiveAt);
                        return (
                          <Row key={l.id} id={l.id}>
                            <Cell className="ps-5"><span className="flex items-center gap-2.5"><Avatar name={l.name} className="size-7 text-[11px]" /><span className="font-medium">{l.name}</span></span></Cell>
                            <Cell>{l.grade ? <Badge tone="outline">{l.grade}</Badge> : <span className="text-muted-foreground">—</span>}</Cell>
                            <Cell className={cn('text-muted-foreground', (d === null || d >= 7) && 'font-semibold text-warning-foreground')}>{relDay(l.lastActiveAt, lang) ?? t.noActivity}</Cell>
                            <Cell><MasteryCell v={l.mastery} insightsOff={insightsOff} wide /></Cell>
                            <Cell className="pe-5"><Flags l={l} /></Cell>
                          </Row>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground md:border-t-0">
                  <span>{t.showing(rows.length, filtered.length)}</span>
                  {filtered.length > PAGE && <Button variant="ghost" size="sm" onPress={() => setShowAll((v) => !v)}>{showAll ? t.viewLess : t.viewAll}</Button>}
                </div>
              </>
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><FlagIcon className="size-4 text-destructive" />{t.attention}</CardTitle><CardDescription>{t.attentionSub}</CardDescription></CardHeader>
              {(rosterLoading || (overview.loading && !overview.data)) ? <SkeletonRows rows={3} className="px-5 pb-5" /> : roster.error ? null : !followUps.length && !missingList.length ? (
                <CardContent><EmptyPanel title={t.nothing} body={t.nothingBody} className="py-6" /></CardContent>
              ) : (
                <ul className="divide-y">
                  {followUps.slice(0, 6).map((f) => {
                    const name = str(f.studentName) || nameOf(str(f.studentId));
                    const action = t.action[str(f.action)] ?? str(f.action).replace(/_/g, ' ');
                    return (
                      <li key={str(f.id) || str(f.studentId)} className="flex gap-3 px-5 py-3">
                        <Avatar name={name || '?'} className="size-8 text-[11px]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{name}</p>
                          <p className={cn('flex items-center gap-1 text-xs font-semibold', f.overdue === true ? 'text-destructive' : 'text-info')}><FlagIcon className="size-3.5 shrink-0" />{action}{f.overdue === true ? ` · ${t.overdue}` : f.dueAt ? ` · ${t.due(fmtDateTime(f.dueAt, lang))}` : ''}</p>
                          {str(f.rationale) && <p className="mt-0.5 text-xs text-muted-foreground" dir="auto">{str(f.rationale)}</p>}
                        </div>
                      </li>
                    );
                  })}
                  {missingList.slice(0, Math.max(0, 6 - Math.min(6, followUps.length))).map((l) => (
                    <li key={l.id} className="flex gap-3 px-5 py-3">
                      <Avatar name={l.name} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{l.name}</p>
                        <p className="flex items-center gap-1 text-xs font-semibold text-destructive"><TriangleAlert className="size-3.5 shrink-0" />{t.missingWork(l.missing)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.cActive}: {relDay(l.lastActiveAt, lang) ?? t.noActivity}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle>{t.skills}</CardTitle><CardDescription>{t.skillsSub}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {!classId ? null : insights.loading && !insights.data ? <SkeletonRows rows={4} /> : insights.error ? <ErrorPanel error={insights.error} onRetry={insights.reload} /> : !outcomes.length ? (
                  <p className="text-sm text-muted-foreground">{t.noOutcomes}</p>
                ) : outcomes.map((o) => (
                  <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-2 text-sm">
                    <span className="truncate text-muted-foreground" dir="auto" title={o.label}>{o.label}</span>
                    <Progress value={o.v} size="sm" tone={barTone(o.v)} ariaLabel={o.label} />
                    <span className="text-end text-xs font-semibold tabular-nums">{num(o.v, lang)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
