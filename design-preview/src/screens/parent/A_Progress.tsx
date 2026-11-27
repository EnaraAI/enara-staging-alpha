import type { ReactNode } from 'react';
import { Atom, BookA, Calculator, Home, Languages } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, useParentNav } from './A_shared';

type Subject = {
  id: string; name: string; level: string; tone: 'success' | 'info' | 'warning'; mastered: number; progress: number; total: number;
  results: { what: string; when: string; score: string }[]; tip: string;
};

const T = {
  en: {
    title: 'Progress', sub: 'Laila · Grade 6 · Term 1',
    sum: [['Lessons this term', '48'], ['Average quiz score', '86%'], ['Learning time', '19 h']],
    chart: 'Learning time per week', chartSub: 'Minutes on ENARA, last 8 weeks', weeks: ['6 Oct', '13 Oct', '20 Oct', '27 Oct', '3 Nov', '10 Nov', '17 Nov', '24 Nov'],
    min: 'min', goal: 'Weekly goal: 150 min', thisWeek: 'This week', table: 'Minutes per week', week: 'Week', minutes: 'Minutes',
    subjects: 'Subjects', mastered: 'Mastered', inProgress: 'In progress', notYet: 'Not started', outcomes: 'Learning outcomes', of: 'of',
    recent: 'Recent results', home: 'Practise at home',
    list: [
      { id: 'math', name: 'Mathematics', level: 'Above expected', tone: 'success', mastered: 14, progress: 4, total: 20,
        results: [{ what: 'Fractions quiz', when: '24 Nov', score: '18/20' }, { what: 'Ratio homework', when: '19 Nov', score: '9/10' }],
        tip: 'Cook together and halve a recipe: it turns fractions into something she can see.' },
      { id: 'eng', name: 'English', level: 'On track', tone: 'info', mastered: 11, progress: 5, total: 18,
        results: [{ what: 'Reading check: “The Secret Garden”', when: '23 Nov', score: '8/10' }, { what: 'Persuasive paragraph', when: '17 Nov', score: 'B+' }],
        tip: 'Ask her to tell you one opinion about a book and two reasons for it.' },
      { id: 'sci', name: 'Science', level: 'On track', tone: 'info', mastered: 9, progress: 3, total: 15,
        results: [{ what: 'Forces and motion test', when: '20 Nov', score: '41/50' }, { what: 'Lab report: friction', when: '12 Nov', score: '7/10' }],
        tip: 'Roll a toy car down a ramp on carpet and on tiles, and talk about why it stops sooner.' },
      { id: 'ar', name: 'Arabic', level: 'Needs practice', tone: 'warning', mastered: 8, progress: 6, total: 18,
        results: [{ what: 'Grammar: nominal sentences', when: '25 Nov', score: '13/20' }, { what: 'Dictation', when: '18 Nov', score: '15/20' }],
        tip: 'Read a short news item aloud together and find the subject and predicate in two sentences.' },
    ] as Subject[],
  },
  ar: {
    title: 'التقدّم', sub: 'ليلى · الصف 6 · الفصل الأول',
    sum: [['الدروس هذا الفصل', '48'], ['متوسط الاختبارات', '86%'], ['وقت التعلّم', '19 ساعة']],
    chart: 'وقت التعلّم أسبوعيًا', chartSub: 'الدقائق على إنارة خلال آخر 8 أسابيع', weeks: ['6 أكتوبر', '13 أكتوبر', '20 أكتوبر', '27 أكتوبر', '3 نوفمبر', '10 نوفمبر', '17 نوفمبر', '24 نوفمبر'],
    min: 'دقيقة', goal: 'الهدف الأسبوعي: 150 دقيقة', thisWeek: 'هذا الأسبوع', table: 'الدقائق في كل أسبوع', week: 'الأسبوع', minutes: 'الدقائق',
    subjects: 'المواد', mastered: 'أُتقنت', inProgress: 'قيد التعلّم', notYet: 'لم تبدأ بعد', outcomes: 'نواتج التعلّم', of: 'من',
    recent: 'أحدث النتائج', home: 'تدرّبوا في البيت',
    list: [
      { id: 'math', name: 'الرياضيات', level: 'أعلى من المتوقّع', tone: 'success', mastered: 14, progress: 4, total: 20,
        results: [{ what: 'اختبار الكسور', when: '24 نوفمبر', score: '18/20' }, { what: 'واجب النِّسب', when: '19 نوفمبر', score: '9/10' }],
        tip: 'اطبخوا معها وقسّموا مقادير وصفة إلى النصف، فتصبح الكسور شيئًا تراه بعينيها.' },
      { id: 'eng', name: 'اللغة الإنجليزية', level: 'في المسار الصحيح', tone: 'info', mastered: 11, progress: 5, total: 18,
        results: [{ what: 'اختبار قراءة: «الحديقة السرية»', when: '23 نوفمبر', score: '8/10' }, { what: 'فقرة إقناعية', when: '17 نوفمبر', score: 'B+' }],
        tip: 'اطلبوا منها أن تذكر رأيًا واحدًا في كتاب وسببين يدعمانه.' },
      { id: 'sci', name: 'العلوم', level: 'في المسار الصحيح', tone: 'info', mastered: 9, progress: 3, total: 15,
        results: [{ what: 'اختبار القوى والحركة', when: '20 نوفمبر', score: '41/50' }, { what: 'تقرير مختبر: الاحتكاك', when: '12 نوفمبر', score: '7/10' }],
        tip: 'دحرجوا سيارة لعبة على منحدر فوق السجاد ثم فوق البلاط، وتحدّثوا عن سبب توقفها أسرع.' },
      { id: 'ar', name: 'اللغة العربية', level: 'تحتاج إلى تدريب', tone: 'warning', mastered: 8, progress: 6, total: 18,
        results: [{ what: 'النحو: الجملة الاسمية', when: '25 نوفمبر', score: '13/20' }, { what: 'إملاء', when: '18 نوفمبر', score: '15/20' }],
        tip: 'اقرؤوا معًا خبرًا قصيرًا بصوت عالٍ، واستخرجوا المبتدأ والخبر من جملتين.' },
    ] as Subject[],
  },
};

const icons: Record<string, ReactNode> = { math: <Calculator />, eng: <BookA />, sci: <Atom />, ar: <Languages /> };
const minutes = [95, 120, 140, 110, 160, 135, 175, 145];
const GOAL = 150, MAX = 200;

export default function ParentProgress() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useParentNav();
  return (
    <AppShell nav={nav} active="progress" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ChildSwitcher selected="laila" />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr]">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            {t.sum.map(([l, v]) => (
              <Card key={l} className="flex min-w-0 flex-col justify-center gap-1 p-3 md:p-4">
                <span className="text-xs font-semibold text-muted-foreground">{l}</span>
                <span className="text-xl font-bold tabular-nums md:text-2xl">{v}</span>
              </Card>
            ))}
          </div>

          {/* Weekly chart: one series, so no legend; the title names it. Bars from divs, goal line, two direct labels. */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div><CardTitle className="text-lg">{t.chart}</CardTitle><p className="text-sm text-muted-foreground">{t.chartSub}</p></div>
              <div className="text-end"><p className="text-xs font-semibold text-muted-foreground">{t.thisWeek}</p><p className="text-2xl font-bold tabular-nums leading-tight">{num(minutes[minutes.length - 1], lang)} <span className="text-sm font-semibold text-muted-foreground">{t.min}</span></p></div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><span className="w-5 border-t-2 border-dashed border-muted-foreground/60" />{t.goal}</p>
              <div className="relative h-40" aria-hidden>
                <div className="absolute inset-x-0 z-[1] border-t-2 border-dashed border-muted-foreground/50" style={{ bottom: `${(GOAL / MAX) * 100}%` }} />
                <div className="absolute inset-x-0 bottom-0 border-t" />
                <div className="relative flex h-full items-end gap-1 sm:gap-2">
                  {minutes.map((m, i) => {
                    const last = i === minutes.length - 1;
                    return (
                      <div key={i} title={`${t.weeks[i]}: ${num(m, lang)} ${t.min}`} className="group flex h-full flex-1 items-end justify-center">
                        <div className={cn('w-full max-w-10 rounded-t-[4px] group-hover:opacity-80', last ? 'bg-primary' : 'bg-chart-1')} style={{ height: `${(m / MAX) * 100}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex gap-1 sm:gap-2" aria-hidden>
                {t.weeks.map((w, i) => (
                  <span key={w} className={cn('flex-1 truncate text-center text-[10px] text-muted-foreground sm:text-xs', i % 2 === 0 && 'max-sm:invisible', i === t.weeks.length - 1 && 'font-bold text-foreground')}>{w}</span>
                ))}
              </div>
              <table className="sr-only">
                <caption>{t.table}</caption>
                <thead><tr><th>{t.week}</th><th>{t.minutes}</th></tr></thead>
                <tbody>{minutes.map((m, i) => <tr key={i}><td>{t.weeks[i]}</td><td>{m}</td></tr>)}</tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <section>
          <SectionTitle>{t.subjects}</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {t.list.map((s) => <SubjectCard key={s.id} s={s} t={t} />)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SubjectCard({ s, t }: { s: Subject; t: (typeof T)['en'] }) {
  const { lang } = usePreview();
  const notYet = s.total - s.mastered - s.progress;
  const pct = (n: number) => `${(n / s.total) * 100}%`;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-5">{icons[s.id]}</span>
        <CardTitle className="min-w-0 flex-1 text-lg">{s.name}</CardTitle>
        <Badge tone={s.tone}>{s.level}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{t.outcomes}</span>
            <span className="tabular-nums text-muted-foreground">{num(s.mastered, lang)} {t.of} {num(s.total, lang)} {t.mastered}</span>
          </div>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${t.mastered} ${s.mastered}, ${t.inProgress} ${s.progress}, ${t.notYet} ${notYet}`}>
            <div className="bg-success" style={{ width: pct(s.mastered) }} />
            <div className="bg-info" style={{ width: pct(s.progress) }} />
            <div className="flex-1 bg-muted" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />{t.mastered} {num(s.mastered, lang)}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-info" />{t.inProgress} {num(s.progress, lang)}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border bg-muted" />{t.notYet} {num(notYet, lang)}</span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.recent}</p>
          <ul className="divide-y">
            {s.results.map((r) => (
              <li key={r.what} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.what}</span><span className="text-xs text-muted-foreground">{r.when}</span></span>
                <span dir="ltr" className="font-bold tabular-nums">{r.score}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex gap-3 rounded-lg bg-warning-soft/70 p-3 text-sm">
          <Home className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <p><span className="font-bold">{t.home}: </span>{s.tip}</p>
        </div>
      </CardContent>
    </Card>
  );
}
