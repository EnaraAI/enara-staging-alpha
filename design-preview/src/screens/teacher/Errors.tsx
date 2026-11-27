import { ArrowRight, CalendarDays, CheckCircle2, Eye, Send, TrendingDown, TrendingUp } from 'lucide-react';
import { useT, usePreview, num } from '@/lib/preview';
import { Avatar, Badge, Button, Card, Progress, Tab, TabList, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SourceBadge, TeacherShell, learner, type Source } from './common';

interface Err {
  id: string; title: { en: string; ar: string }; hint: { en: string; ar: string }; learners: string[]; mistakes: number; trend: 'up' | 'down' | 'flat';
  examples: { wrong: string; bad: string; fix: string; who: string }[]; sources: Source[]; set: { en: string; ar: string }; assigned?: { en: string; ar: string; done: number };
}

const ERRORS: Err[] = [
  {
    id: 'e1', title: { en: 'Past simple of irregular verbs', ar: 'الماضي البسيط للأفعال الشاذة' }, hint: { en: 'Adding -ed to irregular verbs', ar: 'إضافة ‎-ed إلى الأفعال الشاذة' },
    learners: ['l09', 'l17', 'l22', 'l20', 'l07', 'l02', 'l15', 'l26', 'l11', 'l16', 'l18', 'l23', 'l28', 'l05', 'l27', 'l08', 'l24'], mistakes: 46, trend: 'up',
    examples: [{ wrong: 'We goed to the beach.', bad: 'goed', fix: 'went', who: 'l07' }, { wrong: 'She buyed a new bag.', bad: 'buyed', fix: 'bought', who: 'l22' }, { wrong: 'I eated breakfast at seven.', bad: 'eated', fix: 'ate', who: 'l09' }],
    sources: ['rules', 'mishkat'], set: { en: '12 items · about 10 min', ar: '12 تمرينًا · نحو 10 دقائق' },
  },
  {
    id: 'e2', title: { en: 'Articles a/an', ar: 'أداتا النكرة a وan' }, hint: { en: 'Choosing by the first sound, not the first letter', ar: 'الاختيار حسب أول صوت لا أول حرف' },
    learners: ['l02', 'l15', 'l20', 'l09', 'l26', 'l17', 'l05', 'l28', 'l23', 'l11', 'l22', 'l18'], mistakes: 29, trend: 'flat',
    examples: [{ wrong: 'I ate a apple.', bad: 'a apple', fix: 'an apple', who: 'l02' }, { wrong: 'He studies at an university.', bad: 'an university', fix: 'a university', who: 'l15' }, { wrong: 'We waited a hour.', bad: 'a hour', fix: 'an hour', who: 'l20' }],
    sources: ['rules'], set: { en: '10 items · about 6 min', ar: '10 تمارين · نحو 6 دقائق' },
  },
  {
    id: 'e3', title: { en: 'Subject–verb agreement', ar: 'التوافق بين الفاعل والفعل' }, hint: { en: 'Third person -s and there is / there are', ar: 'إضافة ‎-s مع الغائب، وthere is / there are' },
    learners: ['l22', 'l09', 'l13', 'l16', 'l18', 'l20', 'l17', 'l01', 'l26', 'l27'], mistakes: 24, trend: 'down',
    examples: [{ wrong: 'She don’t like tea.', bad: 'don’t', fix: 'doesn’t', who: 'l13' }, { wrong: 'There is many cars.', bad: 'is', fix: 'are', who: 'l16' }, { wrong: 'My brother play football.', bad: 'play', fix: 'plays', who: 'l22' }],
    sources: ['mishkat', 'model'], set: { en: '12 items · about 9 min', ar: '12 تمرينًا · نحو 9 دقائق' },
    assigned: { en: 'Practice assigned on 22 Nov', ar: 'عُيّن التدريب في 22 نوفمبر', done: 6 },
  },
  {
    id: 'e4', title: { en: 'Prepositions of time (in/on/at)', ar: 'حروف الجر الزمنية: in وon وat' }, hint: { en: 'Days, dates, months and times of day', ar: 'الأيام والتواريخ والشهور وأوقات اليوم' },
    learners: ['l05', 'l11', 'l23', 'l26', 'l02', 'l28', 'l15', 'l24'], mistakes: 15, trend: 'flat',
    examples: [{ wrong: 'I was born on 2010.', bad: 'on', fix: 'in', who: 'l05' }, { wrong: 'See you at Monday.', bad: 'at', fix: 'on', who: 'l11' }],
    sources: ['rules'], set: { en: '8 items · about 5 min', ar: '8 تمارين · نحو 5 دقائق' },
  },
  {
    id: 'e5', title: { en: 'Spelling: doubling the final consonant', ar: 'الإملاء: مضاعفة الحرف الساكن الأخير' }, hint: { en: 'stop → stopped, begin → beginning', ar: 'مثل stopped وbeginning' },
    learners: ['l17', 'l20', 'l09', 'l27', 'l02', 'l16'], mistakes: 11, trend: 'down',
    examples: [{ wrong: 'The bus stoped suddenly.', bad: 'stoped', fix: 'stopped', who: 'l17' }, { wrong: 'At the begining of the trip…', bad: 'begining', fix: 'beginning', who: 'l27' }],
    sources: ['rules'], set: { en: '10 words · about 5 min', ar: '10 كلمات · نحو 5 دقائق' },
  },
];

const T = {
  en: {
    title: 'Errors to work on', sub: 'Grade 9 – B · common errors across the class',
    w2: 'Last 2 weeks', unit: 'This unit', term: 'This term',
    based: 'Based on 312 answers from 26 learners · updated today at 07:00',
    learnersOf: (n: number) => `${n} of 28 learners`, mistakes: (n: number) => `${n} mistakes`,
    trend: { up: 'More than last fortnight', down: 'Fewer than last fortnight', flat: 'About the same' },
    examples: 'Example mistakes', who: 'Learners', found: 'Found by', more: (n: number) => `+${n} more`,
    assign: 'Assign practice', assignTo: (n: number) => `Assign to ${n} learners`, previewSet: 'Preview set', practice: 'Practice set',
    done: (d: number, n: number) => `${d} of ${n} finished`, remind: 'Send reminder',
  },
  ar: {
    title: 'أخطاء للعمل عليها', sub: 'الصف التاسع – ب · الأخطاء الشائعة في الفصل',
    w2: 'آخر أسبوعين', unit: 'هذه الوحدة', term: 'هذا الفصل الدراسي',
    based: 'بناءً على 312 إجابة من 26 طالبًا · حُدّث اليوم الساعة 07:00',
    learnersOf: (n: number) => `${n} من 28 طالبًا`, mistakes: (n: number) => `${n} خطأً`,
    trend: { up: 'أكثر من الأسبوعين السابقين', down: 'أقل من الأسبوعين السابقين', flat: 'تقريبًا بالمستوى نفسه' },
    examples: 'أمثلة على الأخطاء', who: 'الطلاب', found: 'رُصد بواسطة', more: (n: number) => `+${n} آخرين`,
    assign: 'تعيين تدريب', assignTo: (n: number) => `تعيين لـ ${n} ${n >= 3 && n <= 10 ? 'طلاب' : 'طالبًا'}`, previewSet: 'معاينة المجموعة', practice: 'مجموعة التدريب',
    done: (d: number, n: number) => `أنهى ${d} من ${n}`, remind: 'إرسال تذكير',
  },
};

function Example({ e }: { e: Err['examples'][number] }) {
  const { lang } = usePreview();
  const [before, after] = e.wrong.split(e.bad);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-muted/60 px-2.5 py-1.5">
      <span dir="ltr" lang="en" className="text-sm">
        {before}<span className="rounded-sm bg-destructive-soft px-0.5 text-destructive line-through decoration-1">{e.bad}</span>
        <ArrowRight className="mx-1 inline size-3 text-muted-foreground" aria-hidden />
        <span className="rounded-sm bg-success-soft px-0.5 font-semibold text-success">{e.fix}</span>{after}
      </span>
      <span className="text-[11px] text-muted-foreground">— {learner(e.who)[lang]}</span>
    </li>
  );
}

export default function Errors() {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <TeacherShell active="errors" title={t.title} subtitle={t.sub}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs defaultSelectedKey="w2"><TabList aria-label={t.title}><Tab id="w2">{t.w2}</Tab><Tab id="unit">{t.unit}</Tab><Tab id="term">{t.term}</Tab></TabList></Tabs>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{t.based}</p>
        </div>

        <ol className="flex flex-col gap-3">
          {ERRORS.map((e, i) => {
            const n = e.learners.length, shown = e.learners.slice(0, 7);
            const TrendI = e.trend === 'up' ? TrendingUp : e.trend === 'down' ? TrendingDown : null;
            return (
              <li key={e.id}>
                <Card className="overflow-hidden">
                  <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_240px]">
                    {/* What and how many */}
                    <div className="flex flex-col gap-3 p-4 md:p-5">
                      <div className="flex items-start gap-3">
                        <span className={cn('grid size-8 shrink-0 place-items-center rounded-md text-sm font-bold', i === 0 ? 'bg-destructive text-destructive-foreground' : i < 3 ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground')}>{num(i + 1, lang)}</span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-bold leading-snug">{e.title[lang]}</h2>
                          <p className="text-xs text-muted-foreground">{e.hint[lang]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={(n / 28) * 100} size="sm" tone={i === 0 ? 'danger' : i < 3 ? 'warning' : 'info'} className="max-w-48" />
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{t.learnersOf(n)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">{t.mistakes(e.mistakes)}</span>
                        <span className={cn('flex items-center gap-1', e.trend === 'up' && 'text-destructive', e.trend === 'down' && 'text-success')}>{TrendI && <TrendI className="size-3.5" />}{t.trend[e.trend]}</span>
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        <li className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.examples}</li>
                        {e.examples.map((x) => <Example key={x.wrong} e={x} />)}
                      </ul>
                    </div>

                    {/* Who */}
                    <div className="flex flex-col gap-3 border-t p-4 md:p-5 xl:border-s xl:border-t-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.who}</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {shown.map((id) => {
                          const l = learner(id);
                          return <li key={id} className="flex items-center gap-1.5 rounded-full border bg-card py-0.5 ps-0.5 pe-2.5 text-xs"><Avatar name={l[lang]} className="size-6 text-[10px]" />{l[lang].split(' ')[0]}</li>;
                        })}
                        {n > shown.length && <li className="flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{t.more(n - shown.length)}</li>}
                      </ul>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{t.found}</span>
                        {e.sources.map((s) => <SourceBadge key={s} source={s} />)}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex flex-col justify-center gap-2 border-t bg-muted/30 p-4 md:p-5 xl:border-s xl:border-t-0">
                      {e.assigned ? (
                        <>
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="size-4" />{e.assigned[lang]}</p>
                          <Progress value={(e.assigned.done / n) * 100} size="sm" tone="success" />
                          <p className="text-xs text-muted-foreground">{t.done(e.assigned.done, n)}</p>
                          <Button variant="outline" size="sm" className="w-full">{t.remind}</Button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t.practice}</span> · {e.set[lang]}</p>
                          <Button className="w-full"><Send />{t.assignTo(n)}</Button>
                          <Button variant="ghost" size="sm" className="w-full"><Eye />{t.previewSet}</Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </TeacherShell>
  );
}
