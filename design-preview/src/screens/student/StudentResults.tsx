import type { ReactNode } from 'react';
import { ArrowRight, Bot, Check, Code2, Dumbbell, Sparkles, UserCheck, X } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell, SectionTitle } from '@/components/shell';
import { Avatar, Badge, Button, Card, Dir, Ring } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';

type Source = 'rules' | 'mishkat' | 'ai' | 'teacher';

const T = {
  en: {
    title: 'A trip I remember', sub: 'English writing task · Returned Wed 25 Nov',
    score: 'Your score', outOf: 'out of', pct: 'Very good', summary: 'You described your trip clearly and in order. Your next step is past tense verbs.',
    submitted: 'Submitted', submittedVal: 'Tue 24 Nov', submittedAt: '8:15 pm', returned: 'Returned', returnedVal: 'Wed 25 Nov', returnedAt: '2:40 pm', classAvg: 'Class average', level: 'Writing level',
    src: { rules: 'Scored by rules', mishkat: 'Scored by Mishkat', ai: 'Scored by the AI model', teacher: 'Checked by your teacher' } as Record<Source, string>,
    srcNote: 'Each answer shows who marked it. Mishkat is ENARA’s own scoring model. Ms Dina checked the final mark.',
    breakdown: 'Question by question', q: 'Question', yours: 'Your answer', right: 'Correct answer',
    items: [
      { kind: 'Multiple choice', prompt: 'Choose the past simple of “go”.', yours: 'went', ok: true, pts: 2, max: 2, src: 'rules' as Source },
      { kind: 'Multiple choice', prompt: 'Choose the correct linking word.', yours: 'However,', ok: true, pts: 2, max: 2, src: 'rules' as Source },
      { kind: 'Short answer', prompt: 'Correct this sentence: “We buyed fish on the Corniche.”', yours: 'We buyed some fish on the Corniche.', right: 'We bought fish on the Corniche.', ok: false, pts: 0, max: 2, src: 'ai' as Source },
      { kind: 'Short answer', prompt: 'Write one sentence about the weather on your trip.', yours: 'It was sunny and windy every morning.', ok: true, pts: 2, max: 2, src: 'ai' as Source },
      { kind: 'Writing', prompt: 'Write 120–150 words about a trip you remember.', yours: '138 words', ok: true, pts: 10, max: 12, src: 'mishkat' as Source, checked: true },
    ],
    criteria: 'Feedback on your writing', criteriaSub: 'Question 5 · four traits, 3 points each',
    traits: [
      { name: 'Task', level: 'Strong', tone: 'success', pts: 3, note: 'You answered every part: where, when, who with and why you remember it.' },
      { name: 'Organisation', level: 'Strong', tone: 'success', pts: 3, note: 'Clear paragraphs and good linking words such as “first”, “after that” and “finally”.' },
      { name: 'Grammar', level: 'Developing', tone: 'warning', pts: 2, note: 'Most sentences are correct. Watch irregular past verbs: “buyed”, “taked”.' },
      { name: 'Vocabulary', level: 'Good', tone: 'info', pts: 2, note: 'Nice words like “crowded” and “breathtaking”. Try fewer repeats of “nice”.' },
    ],
    errors: 'Errors to work on', errorsSub: 'From this task and your last two', practise: 'Practise these with the tutor', practiseHint: 'About 10 minutes · one task at a time',
    errs: [
      { from: 'buyed', to: 'bought', why: 'Irregular past verbs', count: 3 },
      { from: 'the Alexandria', to: 'Alexandria', why: 'No “the” before city names', count: 2 },
      { from: 'very nice', to: 'beautiful / lively', why: 'Choose more exact adjectives', count: 4 },
    ],
    times: 'times',
    teacherNote: 'A note from Ms Dina', teacherText: 'Salma, I could really see the Corniche at sunset. Lovely work! Practise the past verbs list before Sunday’s email task.',
    teacherName: 'Ms Dina Ezzat', pts: 'pts',
  },
  ar: {
    title: 'رحلة لا أنساها', sub: 'مهمة كتابة بالإنجليزية · أُعيدت الأربعاء 25 نوفمبر',
    score: 'درجتك', outOf: 'من', pct: 'جيد جدًا', summary: 'وصفتِ رحلتك بوضوح وبترتيب منطقي. خطوتك التالية هي أفعال الزمن الماضي.',
    submitted: 'تاريخ التسليم', submittedVal: 'الثلاثاء 24 نوفمبر', submittedAt: '8:15 مساءً', returned: 'تاريخ الإعادة', returnedVal: 'الأربعاء 25 نوفمبر', returnedAt: '2:40 مساءً', classAvg: 'متوسط الفصل', level: 'مستوى الكتابة',
    src: { rules: 'صُحّح وفق القواعد', mishkat: 'قيّمه نموذج مشكاة', ai: 'قيّمه نموذج الذكاء الاصطناعي', teacher: 'راجعته معلّمتك' } as Record<Source, string>,
    srcNote: 'تُظهر كل إجابة الجهة التي صحّحتها. مشكاة هو نموذج التقييم الخاص بإنارة. وقد راجعت أ. دينا الدرجة النهائية.',
    breakdown: 'سؤالًا سؤالًا', q: 'السؤال', yours: 'إجابتك', right: 'الإجابة الصحيحة',
    items: [
      { kind: 'اختيار من متعدد', prompt: 'Choose the past simple of “go”.', yours: 'went', ok: true, pts: 2, max: 2, src: 'rules' as Source },
      { kind: 'اختيار من متعدد', prompt: 'Choose the correct linking word.', yours: 'However,', ok: true, pts: 2, max: 2, src: 'rules' as Source },
      { kind: 'إجابة قصيرة', prompt: 'Correct this sentence: “We buyed fish on the Corniche.”', yours: 'We buyed some fish on the Corniche.', right: 'We bought fish on the Corniche.', ok: false, pts: 0, max: 2, src: 'ai' as Source },
      { kind: 'إجابة قصيرة', prompt: 'Write one sentence about the weather on your trip.', yours: 'It was sunny and windy every morning.', ok: true, pts: 2, max: 2, src: 'ai' as Source },
      { kind: 'كتابة', prompt: 'Write 120–150 words about a trip you remember.', yours: '138 words', ok: true, pts: 10, max: 12, src: 'mishkat' as Source, checked: true },
    ],
    criteria: 'ملاحظات على كتابتك', criteriaSub: 'السؤال 5 · أربعة معايير، لكل منها 3 درجات',
    traits: [
      { name: 'تحقيق المهمة', level: 'متمكّن', tone: 'success', pts: 3, note: 'أجبتِ عن كل الأجزاء: أين ومتى ومع من ولماذا تتذكرين الرحلة.' },
      { name: 'التنظيم', level: 'متمكّن', tone: 'success', pts: 3, note: 'فقرات واضحة وأدوات ربط جيدة مثل “first” و“after that” و“finally”.' },
      { name: 'القواعد', level: 'في طور النمو', tone: 'warning', pts: 2, note: 'معظم الجمل صحيحة. انتبهي للأفعال الماضية الشاذة: “buyed” و“taked”.' },
      { name: 'المفردات', level: 'جيد', tone: 'info', pts: 2, note: 'كلمات جميلة مثل “crowded” و“breathtaking”. قلّلي من تكرار كلمة “nice”.' },
    ],
    errors: 'أخطاء تحتاج إلى تدريب', errorsSub: 'من هذه المهمة ومن آخر مهمتين', practise: 'تدرّبي عليها مع المعلّم', practiseHint: 'نحو 10 دقائق · مهمة واحدة في كل مرة',
    errs: [
      { from: 'buyed', to: 'bought', why: 'الأفعال الماضية الشاذة', count: 3 },
      { from: 'the Alexandria', to: 'Alexandria', why: 'لا تُستخدم “the” قبل أسماء المدن', count: 2 },
      { from: 'very nice', to: 'beautiful / lively', why: 'اختاري صفات أدق', count: 4 },
    ],
    times: 'مرات',
    teacherNote: 'ملاحظة من أ. دينا', teacherText: 'يا سلمى، كدتُ أرى الكورنيش عند الغروب. عمل جميل! راجعي قائمة الأفعال الماضية قبل مهمة الرسالة يوم الأحد.',
    teacherName: 'أ. دينا عزت', pts: 'درجة',
  },
};

const srcStyle: Record<Source, { tone: 'neutral' | 'info' | 'accent' | 'success'; icon: ReactNode }> = {
  rules: { tone: 'neutral', icon: <Code2 /> },
  mishkat: { tone: 'info', icon: <Sparkles /> },
  ai: { tone: 'neutral', icon: <Bot /> },
  teacher: { tone: 'success', icon: <UserCheck /> },
};

function SourceBadge({ src, className }: { src: Source; className?: string }) {
  const t = useT(T);
  const s = srcStyle[src];
  return <Badge tone={s.tone} className={cn(src === 'ai' && 'border bg-card', className)}>{s.icon}{t.src[src]}</Badge>;
}

export default function StudentResults() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const bar: Record<string, string> = { success: 'bg-success', warning: 'bg-warning', info: 'bg-info' };
  return (
    <AppShell nav={nav} active="results" back title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Summary */}
        <Card className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8 md:p-7">
          <div className="flex items-center gap-5">
            <Ring value={80} size={112} stroke={10} tone="var(--success)">
              <span className="flex flex-col items-center leading-none"><span className="text-3xl font-extrabold tabular-nums">{num(16, lang)}</span><span className="mt-1 text-xs font-semibold text-muted-foreground">{t.outOf} {num(20, lang)}</span></span>
            </Ring>
            <div className="min-w-0 md:hidden"><p className="text-xs font-semibold text-muted-foreground">{t.score}</p><p className="text-2xl font-extrabold">{t.pct}</p><p className="text-sm font-semibold text-success tabular-nums">{num(80, lang)}%</p></div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="hidden items-baseline gap-3 md:flex"><p className="text-2xl font-extrabold">{t.pct}</p><p className="font-semibold text-success tabular-nums">{num(80, lang)}%</p></div>
            <p className="leading-relaxed text-muted-foreground">{t.summary}</p>
            <div className="flex flex-wrap gap-2"><SourceBadge src="teacher" /><SourceBadge src="mishkat" /></div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-sm md:w-80 md:shrink-0 md:border-s md:border-t-0 md:ps-8 md:pt-0">
            <div><dt className="text-xs font-semibold text-muted-foreground">{t.submitted}</dt><dd className="font-semibold">{t.submittedVal}<span className="block text-xs font-normal text-muted-foreground">{t.submittedAt}</span></dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{t.returned}</dt><dd className="font-semibold">{t.returnedVal}<span className="block text-xs font-normal text-muted-foreground">{t.returnedAt}</span></dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{t.classAvg}</dt><dd className="font-semibold tabular-nums">{num(14.2, lang)} / {num(20, lang)}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{t.level}</dt><dd><Badge tone="info" className="font-mono">B1</Badge></dd></div>
          </dl>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* Per-question breakdown */}
            <section>
              <SectionTitle>{t.breakdown}</SectionTitle>
              <Card className="divide-y overflow-hidden">
                {t.items.map((it, i) => (
                  <div key={i} className="flex gap-3 p-4 md:gap-4 md:p-5">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', it.ok ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>{it.ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-muted-foreground">{t.q} {num(i + 1, lang)} · {it.kind}</p>
                          <p dir="ltr" className="text-start text-sm font-semibold leading-relaxed">{it.prompt}</p>
                        </div>
                        <span className={cn('shrink-0 text-sm font-bold tabular-nums', it.ok ? 'text-foreground' : 'text-destructive')}>{num(it.pts, lang)}/{num(it.max, lang)}</span>
                      </div>
                      <div className="flex flex-col gap-1 text-sm">
                        <p className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{t.yours}:</span><bdi dir="ltr" className={cn(!it.ok && 'text-destructive line-through decoration-destructive/40')}>{it.yours}</bdi></p>
                        {it.right && <p className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{t.right}:</span><bdi dir="ltr" className="font-semibold text-success">{it.right}</bdi></p>}
                      </div>
                      <div className="flex flex-wrap gap-1.5"><SourceBadge src={it.src} />{it.checked && <SourceBadge src="teacher" />}</div>
                    </div>
                  </div>
                ))}
              </Card>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.srcNote}</p>
            </section>

            {/* Criteria */}
            <section>
              <SectionTitle action={<SourceBadge src="mishkat" />}>{t.criteria}</SectionTitle>
              <p className="-mt-2 mb-3 text-sm text-muted-foreground">{t.criteriaSub}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {t.traits.map((tr) => (
                  <Card key={tr.name} className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-2"><p className="font-bold">{tr.name}</p><Badge tone={tr.tone as 'success' | 'warning' | 'info'}>{tr.level}</Badge></div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 gap-1">{[0, 1, 2].map((k) => <span key={k} className={cn('h-2 flex-1 rounded-full', k < tr.pts ? bar[tr.tone] : 'bg-muted')} />)}</div>
                      <span className="text-xs font-bold tabular-nums text-muted-foreground">{num(tr.pts, lang)}/{num(3, lang)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{tr.note}</p>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section>
              <SectionTitle>{t.errors}</SectionTitle>
              <Card className="flex flex-col gap-4 p-5">
                <p className="-mt-1 text-sm text-muted-foreground">{t.errorsSub}</p>
                <ul className="flex flex-col gap-3">
                  {t.errs.map((e) => (
                    <li key={e.from} className="flex flex-col gap-1.5 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{e.why}</p><span className="shrink-0 text-xs text-muted-foreground tabular-nums">× {num(e.count, lang)}</span></div>
                      <p dir="ltr" className="flex flex-wrap items-center gap-2 text-sm rtl:justify-end">
                        <span className="rounded-md bg-destructive-soft px-1.5 py-0.5 text-destructive line-through decoration-destructive/40">{e.from}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        <span className="rounded-md bg-success-soft px-1.5 py-0.5 font-semibold text-success">{e.to}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                <Button size="lg" className="w-full"><Dumbbell />{t.practise}<Dir><ArrowRight /></Dir></Button>
                <p className="-mt-2 text-center text-xs text-muted-foreground">{t.practiseHint}</p>
              </Card>
            </section>
            <Card className="flex flex-col gap-3 bg-secondary/50 p-5">
              <div className="flex items-center gap-3"><Avatar name={lang === 'ar' ? 'دينا عزت' : 'Dina Ezzat'} className="size-9 text-xs" tone="bg-primary text-primary-foreground" /><div><p className="text-sm font-bold">{t.teacherNote}</p><p className="text-xs text-muted-foreground">{t.teacherName}</p></div></div>
              <p className="text-sm leading-relaxed">{t.teacherText}</p>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
