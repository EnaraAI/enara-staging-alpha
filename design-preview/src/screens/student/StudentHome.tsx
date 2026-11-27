import { ArrowRight, Atom, BookOpenText, CalendarClock, Clock, Flame, Lightbulb, Sigma, Sparkles } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Badge, Button, Card, Dir, LinkButton, Progress, Ring } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';

const T = {
  en: {
    hello: 'Good afternoon, Salma', date: 'Friday 27 November · Grade 10 · NVIS',
    nextLabel: 'Your next step', nextTitle: 'Write the opening line of a formal email',
    nextSub: 'English · Lesson 4: Formal emails · Step 3 of 8', nextTime: 'About 10 minutes', nextBtn: 'Continue with the tutor', nextWhy: 'Your tutor picks one task at a time, so you always know what to do next.',
    subjects: 'Your subjects', all: 'See all',
    english: 'English', englishNow: 'Formal emails', englishLevel: 'B1', englishGoal: 'On the way to B2',
    maths: 'Mathematics', mathsNow: 'Quadratic equations', mathsGoal: 'Unit 3 of 6',
    science: 'Science', scienceNow: 'Cells and energy', scienceGoal: 'Unit 2 of 5',
    done: 'done',
    week: 'This week', streak: 'Day streak', streakHint: 'Best: 11 days', minutes: 'Minutes learning', minutesHint: 'Goal: 150 minutes',
    days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    due: 'Due next', dueTitle: 'A formal email to a hotel', dueBy: 'Ms Dina Ezzat · English', dueWhen: 'Sunday 29 November, 9:00 pm', dueLeft: '2 days left', open: 'Open assignment',
    recent: 'Latest result', recentTitle: 'Quiz: Linear inequalities', recentWhen: 'Mathematics · Wednesday', recentBy: 'Scored by rules', recentNote: 'Great work on solving steps. Check the sign when you divide by a negative number.', view: 'View result',
  },
  ar: {
    hello: 'مساء الخير يا سلمى', date: 'الجمعة 27 نوفمبر · الصف العاشر · مدرسة وادي النيل الدولية',
    nextLabel: 'خطوتك التالية', nextTitle: 'اكتبي السطر الافتتاحي لرسالة بريد إلكتروني رسمية',
    nextSub: 'اللغة الإنجليزية · الدرس 4: الرسائل الرسمية · الخطوة 3 من 8', nextTime: 'نحو 10 دقائق', nextBtn: 'تابعي مع المعلّم', nextWhy: 'يختار معلّمك مهمة واحدة في كل مرة، فتعرفين دائمًا ما الخطوة التالية.',
    subjects: 'موادّك', all: 'عرض الكل',
    english: 'اللغة الإنجليزية', englishNow: 'الرسائل الرسمية', englishLevel: 'B1', englishGoal: 'في الطريق إلى B2',
    maths: 'الرياضيات', mathsNow: 'المعادلات التربيعية', mathsGoal: 'الوحدة 3 من 6',
    science: 'العلوم', scienceNow: 'الخلايا والطاقة', scienceGoal: 'الوحدة 2 من 5',
    done: 'مكتمل',
    week: 'هذا الأسبوع', streak: 'أيام متتالية', streakHint: 'الأفضل: 11 يومًا', minutes: 'دقائق التعلم', minutesHint: 'الهدف: 150 دقيقة',
    days: ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'],
    due: 'الموعد القادم', dueTitle: 'رسالة بريد إلكتروني رسمية إلى فندق', dueBy: 'أ. دينا عزت · اللغة الإنجليزية', dueWhen: 'الأحد 29 نوفمبر، 9:00 مساءً', dueLeft: 'بقي يومان', open: 'فتح الواجب',
    recent: 'آخر نتيجة', recentTitle: 'اختبار قصير: المتباينات الخطية', recentWhen: 'الرياضيات · الأربعاء', recentBy: 'صُحّح وفق القواعد', recentNote: 'عمل رائع في خطوات الحل. انتبهي للإشارة عند القسمة على عدد سالب.', view: 'عرض النتيجة',
  },
};

const minutesByDay = [22, 30, 0, 26, 35, 18, 11];

export default function StudentHome() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const total = minutesByDay.reduce((a, b) => a + b, 0);
  const subjects = [
    { name: t.english, now: t.englishNow, goal: t.englishGoal, value: 62, icon: <BookOpenText />, tone: 'bg-info-soft text-info', bar: 'info' as const, level: t.englishLevel },
    { name: t.maths, now: t.mathsNow, goal: t.mathsGoal, value: 45, icon: <Sigma />, tone: 'bg-warning-soft text-warning-foreground', bar: 'warning' as const },
    { name: t.science, now: t.scienceNow, goal: t.scienceGoal, value: 71, icon: <Atom />, tone: 'bg-success-soft text-success', bar: 'success' as const },
  ];
  return (
    <AppShell nav={nav} active="home" title={t.hello} subtitle={t.date}>
      <div className="mx-auto grid max-w-6xl gap-5 md:gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-5 md:gap-6 lg:col-span-2">
          {/* Next step: one clear action */}
          <section className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm md:p-7">
            <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-primary-foreground/[0.06]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 end-10 size-40 rounded-full bg-accent/10" />
            <div className="relative flex flex-col gap-4">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"><Sparkles className="size-3.5" />{t.nextLabel}</span>
              <div>
                <h2 className="text-xl font-extrabold leading-snug md:text-2xl">{t.nextTitle}</h2>
                <p className="mt-1.5 text-sm text-primary-foreground/75">{t.nextSub}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button variant="accent" size="lg" className="w-full sm:w-auto">{t.nextBtn}<Dir><ArrowRight /></Dir></Button>
                <span className="flex items-center gap-1.5 text-sm text-primary-foreground/80"><Clock className="size-4" />{t.nextTime}</span>
              </div>
              <p className="flex items-start gap-2 border-t border-primary-foreground/15 pt-3 text-xs text-primary-foreground/70"><Lightbulb className="mt-0.5 size-3.5 shrink-0" />{t.nextWhy}</p>
            </div>
          </section>

          {/* Subjects */}
          <section>
            <SectionTitle action={<a href="#" className="text-sm font-semibold text-primary">{t.all}</a>}>{t.subjects}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              {subjects.map((s) => (
                <Card key={s.name} className="flex flex-col gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5', s.tone)}>{s.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-bold">{s.name}{s.level && <Badge tone="info" className="font-mono">{s.level}</Badge>}</p>
                      <p className="text-sm leading-snug text-muted-foreground">{s.now}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Progress value={s.value} tone={s.bar} size="sm" />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{s.goal}</span><span className="font-semibold tabular-nums text-foreground">{num(s.value, lang)}% {t.done}</span></div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* This week (phone: shown after subjects; desktop: in main column too) */}
          <section>
            <SectionTitle>{t.week}</SectionTitle>
            <Card className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-warning-soft text-warning-foreground"><Flame className="size-6" /></span>
                  <div><p className="text-2xl font-extrabold tabular-nums leading-none">{num(6, lang)}</p><p className="mt-1 text-xs font-semibold text-muted-foreground">{t.streak}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Ring value={Math.min(100, (total / 150) * 100)} size={52} stroke={6} tone="var(--success)"><span className="text-[11px]">{num(Math.round((total / 150) * 100), lang)}%</span></Ring>
                  <div><p className="text-2xl font-extrabold tabular-nums leading-none">{num(total, lang)}</p><p className="mt-1 text-xs font-semibold text-muted-foreground">{t.minutes}</p></div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex h-16 items-end justify-between gap-1.5">
                  {minutesByDay.map((m, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className={cn('w-full max-w-7 rounded-md', m === 0 ? 'bg-muted' : i === 6 ? 'bg-primary' : 'bg-primary/35')} style={{ height: `${Math.max(6, (m / 35) * 56)}px` }} title={`${m}`} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between gap-1.5">{t.days.map((d) => <span key={d} className="flex-1 truncate text-center text-[10px] font-semibold text-muted-foreground">{d}</span>)}</div>
                <p className="text-xs text-muted-foreground">{t.streakHint} · {t.minutesHint}</p>
              </div>
            </Card>
          </section>
        </div>

        <aside className="flex flex-col gap-5 md:gap-6">
          {/* Upcoming assignment */}
          <section>
            <SectionTitle>{t.due}</SectionTitle>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><CalendarClock className="size-5" /></span>
                <Badge tone="warning">{t.dueLeft}</Badge>
              </div>
              <div>
                <p className="font-bold leading-snug">{t.dueTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.dueBy}</p>
                <p className="mt-2 text-sm font-semibold">{t.dueWhen}</p>
              </div>
              <LinkButton href="#" variant="outline" className="w-full">{t.open}<Dir><ArrowRight /></Dir></LinkButton>
            </Card>
          </section>

          {/* Recent result */}
          <section>
            <SectionTitle>{t.recent}</SectionTitle>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <Ring value={85} size={64} stroke={7} tone="var(--success)"><span className="tabular-nums">{num(17, lang)}/{num(20, lang)}</span></Ring>
                <div className="min-w-0">
                  <p className="font-bold leading-snug">{t.recentTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.recentWhen}</p>
                </div>
              </div>
              <Badge tone="neutral" className="w-fit">{t.recentBy}</Badge>
              <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed">{t.recentNote}</p>
              <LinkButton href="#" variant="ghost" className="w-full">{t.view}<Dir><ArrowRight /></Dir></LinkButton>
            </Card>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
