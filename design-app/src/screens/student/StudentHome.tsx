// Student home (teens and adults), wired to lms-test:
//   GET /api/me/dashboard   greeting, next step (continueLearning), recent activity, upcoming assessments, streak
//   GET /api/me/courses     subjects with progress
//   GET /api/me/assignments upcoming assignment (404 FEATURE_DISABLED when the school has assignments off)
//   GET /api/me/assignments/:id  latest released result (or GET /api/me/results when assignments are off)
import { ArrowRight, Atom, BookOpenText, CalendarClock, ClipboardList, Flame, GraduationCap, Lightbulb, Sigma, Sparkles, Trophy } from 'lucide-react';
import { go } from '@/App';
import { get } from '@/lib/api';
import { num, usePreview, useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { AppShell, SectionTitle } from '@/components/shell';
import { Badge, Button, Card, Dir, LinkButton, Progress, Ring, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';
import {
  ErrorState, InlineError, NotAvailable, PageSkeleton, StateCard, arr, cairoHour, daysLeftLabel, daysUntil, firstName, fmtDate, fmtDateTime,
  getOrOff, isNum, isOff, useLoad,
  type AssignmentDetail, type AssignmentItem, type AttemptResult, type CourseSummary, type Dashboard, type QuizResult,
} from './common';

const T = {
  en: {
    morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', grade: 'Grade',
    nextLabel: 'Your next step', nextBtn: 'Continue with the tutor', nextWhy: 'Your tutor picks one task at a time, so you always know what to do next.',
    lessonsDone: (d: string, n: string) => `${d} of ${n} lessons done`,
    noNextTitle: 'Nothing to continue yet', noNextText: 'When your school adds you to a course, your next lesson appears here. You can still ask the tutor anything.', askTutor: 'Ask the tutor',
    subjects: 'Your subjects', done: 'done', noCourses: 'You are not in any course yet.',
    week: 'This week', streak: 'Day streak', activities: 'Activities', weekNote: 'From your recent quizzes and tutor chats.', minutes: 'Minutes learning',
    due: 'Due next', open: 'Open assignment', noDue: 'Nothing due. Well done!', allWork: 'All assignments', offWork: 'Assignments are not turned on for your school yet.',
    recent: 'Latest result', view: 'View result', noResult: 'No results yet. They appear here once your work is marked.',
  },
  ar: {
    morning: 'صباح الخير', afternoon: 'مساء الخير', evening: 'مساء الخير', grade: 'الصف',
    nextLabel: 'خطوتك التالية', nextBtn: 'المتابعة مع المعلّم', nextWhy: 'يختار معلّمك مهمة واحدة في كل مرة، فتعرف دائمًا ما الخطوة التالية.',
    lessonsDone: (d: string, n: string) => `اكتمل ${d} من ${n} دروس`,
    noNextTitle: 'لا يوجد ما تتابعه بعد', noNextText: 'عندما تضيفك مدرستك إلى مقرر، يظهر درسك التالي هنا. ويمكنك أن تسأل المعلّم عن أي شيء.', askTutor: 'اسأل المعلّم',
    subjects: 'موادّك', done: 'مكتمل', noCourses: 'لم تُسجَّل في أي مقرر بعد.',
    week: 'هذا الأسبوع', streak: 'أيام متتالية', activities: 'الأنشطة', weekNote: 'من اختباراتك ومحادثاتك الأخيرة مع المعلّم.', minutes: 'دقائق التعلم',
    due: 'الموعد القادم', open: 'فتح الواجب', noDue: 'لا توجد واجبات مستحقة. أحسنت!', allWork: 'كل الواجبات', offWork: 'الواجبات غير مفعّلة في مدرستك بعد.',
    recent: 'آخر نتيجة', view: 'عرض النتيجة', noResult: 'لا توجد نتائج بعد. تظهر هنا بعد تصحيح عملك.',
  },
};

type Assignments = { assignments?: AssignmentItem[] } | { off: true } | { failed: unknown };
type Latest = { kind: 'assignment'; title: string; assignmentId: string; attempt: AttemptResult } | { kind: 'quiz'; r: QuizResult } | null;
type Loaded<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };

function subjectLook(subject = '', title = '') {
  const s = `${subject} ${title}`.toLowerCase();
  if (/english|arabic|language|reading|writing|عرب|إنجليز/.test(s)) return { icon: <BookOpenText />, tone: 'bg-info-soft text-info', bar: 'info' as const };
  if (/math|algebra|geometry|رياض/.test(s)) return { icon: <Sigma />, tone: 'bg-warning-soft text-warning-foreground', bar: 'warning' as const };
  if (/science|physics|chemistry|biology|علوم|فيزياء|كيمياء|أحياء/.test(s)) return { icon: <Atom />, tone: 'bg-success-soft text-success', bar: 'success' as const };
  return { icon: <GraduationCap />, tone: 'bg-secondary text-secondary-foreground', bar: 'primary' as const };
}

const isOpenWork = (a: AssignmentItem) => !!a.canSubmit && (a.status === 'not_started' || a.status === 'in_progress');
const chatHref = (courseId?: string, lessonId?: string) => `/student/chat${courseId ? `?course=${encodeURIComponent(courseId)}${lessonId ? `&lesson=${encodeURIComponent(lessonId)}` : ''}` : ''}`;

export default function StudentHome() {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();

  const main = useLoad(async (signal) => {
    const [dash, courses, work] = await Promise.all([
      get<Dashboard>('/api/me/dashboard', signal),
      get<CourseSummary[]>('/api/me/courses', signal).catch(() => null),
      getOrOff<{ assignments?: AssignmentItem[] }>('/api/me/assignments', signal).catch((e): Assignments => ({ failed: e })),
    ]);
    return { dash: dash ?? {}, courses: Array.isArray(courses) ? courses : null, work: work as Assignments };
  }, 'home');

  const work = main.data?.work;
  const list = work && 'assignments' in work ? arr<AssignmentItem>(work.assignments) : [];
  const openWork = list.filter(isOpenWork).sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
  const nav = useStudentNav({ workBadge: openWork.length });

  // Latest result: the newest released assignment (one detail call), or the newest quiz result when assignments are off.
  const releasedId = [...list].filter((a) => a.status === 'released' && a.id).sort((a, b) => new Date(b.dueAt ?? 0).getTime() - new Date(a.dueAt ?? 0).getTime())[0]?.id ?? '';
  const latestKey = !main.data ? 'wait' : work && isOff(work) ? 'quiz' : releasedId ? `a:${releasedId}` : 'none';
  const latest = useLoad<Latest>(async (signal) => {
    if (latestKey === 'quiz') {
      const r = arr<QuizResult>(await get<QuizResult[]>('/api/me/results', signal));
      return r[0] ? { kind: 'quiz', r: r[0] } : null;
    }
    if (!latestKey.startsWith('a:')) return null;
    const d = await get<AssignmentDetail>(`/api/me/assignments/${encodeURIComponent(releasedId)}`, signal);
    const att = arr<AttemptResult>(d?.attempts).filter((x) => x?.released).pop();
    return att ? { kind: 'assignment', title: d?.assignment?.title ?? '', assignmentId: releasedId, attempt: att } : null;
  }, latestKey);

  const dash = main.data?.dash;
  const name = firstName(dash?.student?.name || user?.name);
  const h = cairoHour();
  const hello = `${h < 12 ? t.morning : h < 18 ? t.afternoon : t.evening}${name ? (lang === 'ar' ? ` يا ${name}` : `, ${name}`) : ''}`;
  const grade = dash?.student?.grade;
  const subtitle = [fmtDate(new Date().toISOString(), lang, { weekday: 'long', day: 'numeric', month: 'long' }), grade ? `${t.grade} ${grade}` : ''].filter(Boolean).join(' · ');

  return (
    <AppShell nav={nav} active="home" title={hello} subtitle={subtitle}>
      {main.loading && !main.data ? <PageSkeleton rows={2} /> : main.error || !dash ? (
        <div className="mx-auto max-w-xl"><ErrorState error={main.error} onRetry={main.reload} /></div>
      ) : (
        <HomeBody dash={dash} courses={main.data?.courses ?? null} work={work} openWork={openWork} latest={latest} />
      )}
    </AppShell>
  );
}

function HomeBody({ dash, courses, work, openWork, latest }: { dash: Dashboard; courses: CourseSummary[] | null; work?: Assignments; openWork: AssignmentItem[]; latest: Loaded<Latest> }) {
  const t = useT(T);
  const { lang } = usePreview();
  const next = dash.continueLearning ?? null;
  const subjects: CourseSummary[] = courses ?? arr<CourseSummary>(dash.courses);
  const nextCourse = subjects.find((c) => c.id === next?.courseId);

  // This week: activities per day from the dashboard's recent activity (quizzes and tutor chats), Cairo days.
  const dayKey = (d: Date) => fmtDate(d.toISOString(), 'en', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86_400_000); return { key: dayKey(d), label: fmtDate(d.toISOString(), lang, { weekday: 'short' }), count: 0 }; });
  for (const a of arr<{ date?: string }>(dash.recentActivity)) {
    if (!a?.date) continue;
    const d = new Date(a.date);
    if (Number.isNaN(d.getTime())) continue;
    const slot = days.find((x) => x.key === dayKey(d));
    if (slot) slot.count += 1;
  }
  const weekTotal = days.reduce((s, d) => s + d.count, 0);
  const weekMax = Math.max(1, ...days.map((d) => d.count));
  const streak = dash.student?.streak;
  const due = openWork[0];
  const legacyDue = work && isOff(work) ? arr<NonNullable<Dashboard['upcomingAssessments']>[number]>(dash.upcomingAssessments)[0] : undefined;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 md:gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-5 md:gap-6 lg:col-span-2">
        {/* Next step: one clear action */}
        {next?.title ? (
          <section className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm md:p-7">
            <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-primary-foreground/[0.06]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 end-10 size-40 rounded-full bg-accent/10" />
            <div className="relative flex flex-col gap-4">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"><Sparkles className="size-3.5" />{t.nextLabel}</span>
              <div className="min-w-0">
                <h2 dir="auto" className="break-words text-xl font-extrabold leading-snug md:text-2xl">{next.title}</h2>
                <p dir="auto" className="mt-1.5 text-sm text-primary-foreground/75">
                  {[nextCourse?.title || next.subject, isNum(nextCourse?.lessonsCount) && nextCourse.lessonsCount > 0 ? t.lessonsDone(num(nextCourse.completedLessons ?? 0, lang), num(nextCourse.lessonsCount, lang)) : ''].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button variant="accent" size="lg" className="w-full sm:w-auto" onPress={() => go(chatHref(next.courseId, next.lessonId))}>{t.nextBtn}<Dir><ArrowRight /></Dir></Button>
                {isNum(next.progressPct) && <span className="flex items-center gap-2 text-sm text-primary-foreground/80"><Progress value={next.progressPct} size="sm" tone="accent" className="w-24" ariaLabel={t.done} />{num(next.progressPct, lang)}% {t.done}</span>}
              </div>
              <p className="flex items-start gap-2 border-t border-primary-foreground/15 pt-3 text-xs text-primary-foreground/70"><Lightbulb className="mt-0.5 size-3.5 shrink-0" />{t.nextWhy}</p>
            </div>
          </section>
        ) : (
          <StateCard icon={<Sparkles />} title={t.noNextTitle} text={t.noNextText} action={<Button onPress={() => go('/student/chat')}>{t.askTutor}<Dir><ArrowRight /></Dir></Button>} />
        )}

        {/* Subjects */}
        <section>
          <SectionTitle>{t.subjects}</SectionTitle>
          {subjects.length === 0 ? <Card className="p-5 text-sm text-muted-foreground">{t.noCourses}</Card> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subjects.map((s, i) => {
                const look = subjectLook(s.subject, s.title);
                const value = isNum(s.progressPct) ? Math.max(0, Math.min(100, s.progressPct)) : 0;
                return (
                  <a key={s.id ?? i} href={`#${chatHref(s.id)}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="flex h-full flex-col gap-4 p-4 hover:bg-muted/40">
                      <div className="flex items-start gap-3">
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5', look.tone)}>{look.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className="break-words font-bold">{s.title || s.subject}</p>
                          {s.subject && s.subject !== s.title && <p dir="auto" className="text-sm leading-snug text-muted-foreground">{s.subject}</p>}
                        </div>
                      </div>
                      <div className="mt-auto flex flex-col gap-1.5">
                        <Progress value={value} tone={look.bar} size="sm" ariaLabel={s.title} />
                        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                          <span>{isNum(s.lessonsCount) && s.lessonsCount > 0 ? t.lessonsDone(num(s.completedLessons ?? 0, lang), num(s.lessonsCount, lang)) : ''}</span>
                          <span className="font-semibold tabular-nums text-foreground">{num(value, lang)}% {t.done}</span>
                        </div>
                      </div>
                    </Card>
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* This week */}
        <section>
          <SectionTitle>{t.week}</SectionTitle>
          <Card className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-xl bg-warning-soft text-warning-foreground"><Flame className="size-6" /></span>
                <div>{isNum(streak) ? <p className="text-2xl font-extrabold tabular-nums leading-none">{num(streak, lang)}</p> : <NotAvailable />}<p className="mt-1 text-xs font-semibold text-muted-foreground">{t.streak}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-xl bg-success-soft text-success"><Trophy className="size-6" /></span>
                <div><p className="text-2xl font-extrabold tabular-nums leading-none">{num(weekTotal, lang)}</p><p className="mt-1 text-xs font-semibold text-muted-foreground">{t.activities}</p></div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex h-16 items-end justify-between gap-1.5">
                {days.map((d, i) => (
                  <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                    <div className={cn('w-full max-w-7 rounded-md', d.count === 0 ? 'bg-muted' : i === 6 ? 'bg-primary' : 'bg-primary/35')} style={{ height: `${Math.max(6, (d.count / weekMax) * 56)}px` }} title={num(d.count, lang)} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between gap-1.5">{days.map((d) => <span key={d.key} className="flex-1 truncate text-center text-[10px] font-semibold text-muted-foreground">{d.label}</span>)}</div>
              <p className="text-xs text-muted-foreground">{t.weekNote} {t.minutes}: <NotAvailable /></p>
            </div>
          </Card>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-5 md:gap-6">
        {/* Upcoming assignment */}
        <section>
          <SectionTitle action={work && 'assignments' in work ? <a href="#/student/assignment" className="text-sm font-semibold text-primary">{t.allWork}</a> : undefined}>{t.due}</SectionTitle>
          {work && 'failed' in work ? <InlineError error={work.failed} /> : due ? (
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><CalendarClock className="size-5" /></span>
                {due.dueAt && <Badge tone={(daysUntil(due.dueAt) ?? 9) <= 2 ? 'warning' : 'neutral'}>{daysLeftLabel(daysUntil(due.dueAt), lang)}</Badge>}
              </div>
              <div className="min-w-0">
                <p dir="auto" className="break-words font-bold leading-snug">{due.title}</p>
                {due.dueAt && <p className="mt-2 text-sm font-semibold">{fmtDateTime(due.dueAt, lang)}</p>}
              </div>
              <LinkButton href={`#/student/assignment?id=${encodeURIComponent(due.id ?? '')}`} variant="outline" className="w-full">{t.open}<Dir><ArrowRight /></Dir></LinkButton>
            </Card>
          ) : legacyDue?.title ? (
            <Card className="flex flex-col gap-3 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><CalendarClock className="size-5" /></span>
              <p dir="auto" className="break-words font-bold leading-snug">{legacyDue.title}</p>
              {legacyDue.subject && <p dir="auto" className="text-sm text-muted-foreground">{legacyDue.subject}</p>}
              {legacyDue.dueDate && <p className="text-sm font-semibold">{fmtDate(legacyDue.dueDate, lang, { weekday: 'long', day: 'numeric', month: 'long' }) || legacyDue.dueDate}</p>}
            </Card>
          ) : (
            <Card className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><ClipboardList className="size-5 shrink-0" />{work && isOff(work) ? t.offWork : t.noDue}</Card>
          )}
        </section>

        {/* Latest result */}
        <section>
          <SectionTitle>{t.recent}</SectionTitle>
          {latest.loading ? <Skeleton className="h-48 rounded-xl" /> : latest.error ? <InlineError error={latest.error} onRetry={latest.reload} /> : !latest.data ? (
            <Card className="p-5 text-sm text-muted-foreground">{t.noResult}</Card>
          ) : latest.data.kind === 'assignment' ? (
            <ResultCard title={latest.data.title} score={latest.data.attempt.score} got={latest.data.attempt.totalPoints} max={latest.data.attempt.maxPoints} when={latest.data.attempt.releasedAt ?? latest.data.attempt.submittedAt} note={latest.data.attempt.overallFeedback ?? undefined}
              href={`#/student/results?id=${encodeURIComponent(latest.data.assignmentId)}&attempt=${encodeURIComponent(latest.data.attempt.attemptId ?? '')}`} />
          ) : (
            <ResultCard title={latest.data.r.assessmentTitle ?? ''} subject={latest.data.r.subject} score={latest.data.r.score} when={latest.data.r.date} href={`#/student/results?quiz=${encodeURIComponent(latest.data.r.id ?? '')}`} />
          )}
        </section>
      </aside>
    </div>
  );
}

function ResultCard({ title, subject, score, got, max, when, note, href }: { title: string; subject?: string; score?: number; got?: number; max?: number; when?: string; note?: string; href: string }) {
  const t = useT(T);
  const { lang } = usePreview();
  const pct = isNum(score) ? score : isNum(got) && isNum(max) && max > 0 ? Math.round((got / max) * 100) : null;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-4">
        <Ring value={pct ?? 0} size={64} stroke={7} tone={pct !== null && pct < 50 ? 'var(--warning)' : 'var(--success)'} ariaLabel={t.recent}>
          <span className="text-xs tabular-nums">{isNum(got) && isNum(max) ? `${num(got, lang)}/${num(max, lang)}` : pct !== null ? `${num(pct, lang)}%` : '–'}</span>
        </Ring>
        <div className="min-w-0">
          <p dir="auto" className="break-words font-bold leading-snug">{title}</p>
          <p className="text-sm text-muted-foreground">{[subject, fmtDate(when, lang)].filter(Boolean).join(' · ')}</p>
          {isNum(got) && pct !== null && <p className="text-xs font-semibold tabular-nums text-muted-foreground">{num(pct, lang)}%</p>}
        </div>
      </div>
      {note && <p dir="auto" className="line-clamp-4 rounded-lg bg-muted p-3 text-sm leading-relaxed">{note}</p>}
      <LinkButton href={href} variant="ghost" className="w-full">{t.view}<Dir><ArrowRight /></Dir></LinkButton>
    </Card>
  );
}
