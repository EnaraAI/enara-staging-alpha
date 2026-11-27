import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Circle, CloudCheck, FileText, Info, Send } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell } from '@/components/shell';
import { TextField as AriaTextField, Input } from 'react-aria-components';
import { Badge, Button, Card, Label, Progress, Radio, RadioGroup, inputClass } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';

const ESSAY = `Dear Sir or Madam,

I am writing to ask about rooms for a school trip to Alexandria. We are a group of 24 students and 3 teachers from Nile Valley International School. We would like to stay from 14 to 17 March.

Could you please tell me if you have enough rooms for our group? We would also like to know the price per night and whether breakfast is included.

I look forward to`;

const T = {
  en: {
    title: 'A formal email to a hotel', sub: 'English · Ms Dina Ezzat', status: 'In progress',
    due: 'Due', dueWhen: 'Sunday 29 November, 9:00 pm', points: 'Points', pointsVal: '20', time: 'Suggested time', timeVal: '40 min',
    instrTitle: 'Instructions', instr: 'Answer all four questions. Questions 1 to 3 check what we practised in Lesson 4. In question 4, write a complete email. You can leave and come back; your work saves by itself.',
    saved: 'Saved 1 minute ago', saving: 'All changes saved',
    q: 'Question', mc: 'Multiple choice', short: 'Short answer', essay: 'Writing', pts: 'points',
    q1: 'Choose the best closing for a formal email when you don’t know the reader’s name.',
    q1o: ['Cheers,', 'Yours faithfully,', 'See you soon,', 'Love,'],
    q2: 'Rewrite this sentence so it is formal: “Can you send me the prices?”', q2a: 'Could you please send me the prices?', answer: 'Your answer',
    q3: 'Which subject line is clearest for this email?',
    q3o: ['Hi!!', 'Question', 'Room booking enquiry: school trip, 14–17 March', 'Please read this'],
    q4: 'Write an email to the Sunrise Hotel in Alexandria. Ask about rooms for a school trip, the price per night and whether breakfast is included.',
    q4h: 'Write 120 to 150 words. Use a formal greeting and closing.',
    words: 'words', target: 'Target: 120–150',
    answered: 'answered', of: 'of', saveDraft: 'Save draft', submit: 'Submit', submitHint: 'You can’t change your answers after you submit.',
    overview: 'Questions', notAnswered: 'Not answered yet', done: 'Answered', inProgress: 'In progress',
    grading: 'How it is marked', gradingText: 'Questions 1 to 3 are marked by rules straight away. Your email is scored by Mishkat and checked by Ms Dina.',
  },
  ar: {
    title: 'رسالة بريد إلكتروني رسمية إلى فندق', sub: 'اللغة الإنجليزية · أ. دينا عزت', status: 'قيد الإنجاز',
    due: 'موعد التسليم', dueWhen: 'الأحد 29 نوفمبر، 9:00 مساءً', points: 'الدرجات', pointsVal: '20', time: 'الوقت المقترح', timeVal: '40 دقيقة',
    instrTitle: 'التعليمات', instr: 'أجيبي عن الأسئلة الأربعة كلها. تقيس الأسئلة من 1 إلى 3 ما تدرّبنا عليه في الدرس 4. وفي السؤال 4 اكتبي رسالة كاملة. يمكنك المغادرة والعودة لاحقًا، فعملك يُحفَظ تلقائيًا.',
    saved: 'حُفِظ قبل دقيقة', saving: 'حُفِظت جميع التغييرات',
    q: 'السؤال', mc: 'اختيار من متعدد', short: 'إجابة قصيرة', essay: 'كتابة', pts: 'درجات',
    q1: 'Choose the best closing for a formal email when you don’t know the reader’s name.',
    q1o: ['Cheers,', 'Yours faithfully,', 'See you soon,', 'Love,'],
    q2: 'Rewrite this sentence so it is formal: “Can you send me the prices?”', q2a: 'Could you please send me the prices?', answer: 'إجابتك',
    q3: 'Which subject line is clearest for this email?',
    q3o: ['Hi!!', 'Question', 'Room booking enquiry: school trip, 14–17 March', 'Please read this'],
    q4: 'Write an email to the Sunrise Hotel in Alexandria. Ask about rooms for a school trip, the price per night and whether breakfast is included.',
    q4h: 'اكتبي من 120 إلى 150 كلمة، واستخدمي تحية وخاتمة رسميتين.',
    words: 'كلمة', target: 'المطلوب: 120–150',
    answered: 'تمت الإجابة', of: 'من', saveDraft: 'حفظ المسودة', submit: 'تسليم', submitHint: 'لا يمكنك تعديل إجاباتك بعد التسليم.',
    overview: 'الأسئلة', notAnswered: 'لم تُجَب بعد', done: 'تمت الإجابة', inProgress: 'قيد الكتابة',
    grading: 'طريقة التصحيح', gradingText: 'تُصحَّح الأسئلة من 1 إلى 3 وفق القواعد فورًا. أما رسالتك فيقيّمها نموذج مشكاة، ثم تراجعها أ. دينا.',
  },
};

function QCard({ n, kind, pts, children, prompt }: { n: number; kind: string; pts: number; prompt: string; children: ReactNode }) {
  const t = useT(T);
  const { lang } = usePreview();
  return (
    <Card id={`q${n}`} className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold"><span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground tabular-nums">{num(n, lang)}</span>{t.q} {num(n, lang)} <span className="font-normal text-muted-foreground">· {kind}</span></p>
        <Badge tone="neutral">{num(pts, lang)} {t.pts}</Badge>
      </div>
      <p dir="ltr" className="text-start text-[15px] font-semibold leading-relaxed">{prompt}</p>
      {children}
    </Card>
  );
}

const optionClass = 'rounded-xl border px-3 data-[selected]:border-primary data-[selected]:bg-secondary data-[hovered]:bg-muted';

export default function StudentAssignment() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const words = ESSAY.trim().split(/\s+/).length;
  const qs = [{ s: 'done' }, { s: 'done' }, { s: 'todo' }, { s: 'now' }];
  const answered = 2;
  return (
    <AppShell nav={nav} active="work" back title={t.title} subtitle={t.sub}
      actions={<span className="hidden items-center gap-1.5 text-xs font-semibold text-success sm:flex"><CloudCheck className="size-4" />{t.saved}</span>}>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Overview */}
          <Card className="flex flex-col gap-5 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info"><FileText className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold leading-snug md:text-xl">{t.title}</h2><Badge tone="warning">{t.status}</Badge></div>
                <p className="mt-0.5 text-sm text-muted-foreground">{t.sub}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
              <div className="col-span-2 rounded-lg bg-muted p-3 sm:col-span-1"><dt className="text-xs font-semibold text-muted-foreground">{t.due}</dt><dd className="mt-0.5 flex items-center gap-1.5 text-sm font-bold"><CalendarClock className="size-4 shrink-0 text-warning-foreground" />{t.dueWhen}</dd></div>
              <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.points}</dt><dd className="mt-0.5 text-sm font-bold tabular-nums">{t.pointsVal}</dd></div>
              <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.time}</dt><dd className="mt-0.5 text-sm font-bold">{t.timeVal}</dd></div>
            </dl>
            <div>
              <h3 className="mb-1 text-sm font-bold">{t.instrTitle}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t.instr}</p>
            </div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success sm:hidden"><CloudCheck className="size-4" />{t.saved}</p>
          </Card>

          <QCard n={1} kind={t.mc} pts={2} prompt={t.q1}>
            <RadioGroup aria-label={t.q1} defaultValue="1" className="grid gap-2 sm:grid-cols-2">
              {t.q1o.map((o, i) => <Radio key={o} value={String(i)} className={optionClass}><span dir="ltr">{o}</span></Radio>)}
            </RadioGroup>
          </QCard>

          <QCard n={2} kind={t.short} pts={3} prompt={t.q2}>
            <AriaTextField defaultValue={t.q2a} className="flex flex-col gap-1.5">
              <Label>{t.answer}</Label>
              <Input dir="ltr" className={cn(inputClass, 'text-start text-[15px]')} />
            </AriaTextField>
          </QCard>

          <QCard n={3} kind={t.mc} pts={3} prompt={t.q3}>
            <RadioGroup aria-label={t.q3}>
              {t.q3o.map((o, i) => <Radio key={o} value={String(i)} className={optionClass}><span dir="ltr">{o}</span></Radio>)}
            </RadioGroup>
          </QCard>

          <QCard n={4} kind={t.essay} pts={12} prompt={t.q4}>
            <p className="-mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />{t.q4h}</p>
            <div className="overflow-hidden rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
              <textarea dir="ltr" aria-label={t.answer} defaultValue={ESSAY} rows={10} className="block w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-muted/60 px-4 py-2.5">
                <span className="text-sm font-bold tabular-nums">{num(words, lang)} <span className="font-normal text-muted-foreground">{t.words}</span></span>
                <Progress value={(words / 120) * 100} size="sm" tone="warning" className="w-28" />
                <span className="text-xs text-muted-foreground">{t.target}</span>
                <span className="ms-auto flex items-center gap-1.5 text-xs font-semibold text-success"><CloudCheck className="size-4" />{t.saving}</span>
              </div>
            </div>
          </QCard>

          {/* Submit bar (phone: above tab bar) */}
          <div className="lg:hidden">
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg shadow-primary/5">
              <div className="min-w-0 flex-1"><p className="text-sm font-bold tabular-nums">{num(answered, lang)} {t.of} {num(4, lang)} {t.answered}</p><Progress value={(answered / 4) * 100} size="sm" className="mt-1.5" /></div>
              <Button variant="outline" className="hidden sm:inline-flex">{t.saveDraft}</Button>
              <Button><Send className="rtl:-scale-x-100" />{t.submit}</Button>
            </div>
          </div>
        </div>

        {/* Desktop side panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-baseline justify-between"><h2 className="font-bold">{t.overview}</h2><span className="text-sm tabular-nums text-muted-foreground">{num(answered, lang)}/{num(4, lang)}</span></div>
              <Progress value={(answered / 4) * 100} size="sm" />
              <ol className="flex flex-col gap-1">
                {qs.map((q, i) => (
                  <li key={i}>
                    <a href={`#`} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted', q.s === 'now' && 'bg-secondary')}>
                      {q.s === 'done' ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : q.s === 'now' ? <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-primary"><span className="size-2 rounded-full bg-primary" /></span> : <Circle className="size-5 shrink-0 text-muted-foreground/50" />}
                      <span className="font-semibold">{t.q} {num(i + 1, lang)}</span>
                      <span className="ms-auto text-xs text-muted-foreground">{q.s === 'done' ? t.done : q.s === 'now' ? t.inProgress : t.notAnswered}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2 border-t pt-4">
                <Button size="lg" className="w-full"><Send className="rtl:-scale-x-100" />{t.submit}</Button>
                <Button variant="ghost" className="w-full">{t.saveDraft}</Button>
                <p className="text-center text-xs text-muted-foreground">{t.submitHint}</p>
              </div>
            </Card>
            <div className="rounded-xl bg-muted p-4 text-sm">
              <p className="mb-1 font-bold">{t.grading}</p>
              <p className="leading-relaxed text-muted-foreground">{t.gradingText}</p>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
