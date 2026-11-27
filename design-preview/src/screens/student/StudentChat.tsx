import type { ReactNode } from 'react';
import { BookOpenText, Check, CheckCircle2, Circle, Clock, Lightbulb, Mic, PenLine, SendHorizontal, Square, Video } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import { AppShell } from '@/components/shell';
import { Avatar, Badge, Button, Card, Dir, Progress, Separator } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useStudentNav } from './nav';

/** English text inside an Arabic sentence keeps its own direction. */
const En = ({ children }: { children: ReactNode }) => <bdi dir="ltr" className="font-semibold">{children}</bdi>;

const T = {
  en: {
    title: 'Formal emails', subtitle: 'English · Lesson 4 · with your tutor', voice: 'Talk instead',
    subject: 'English', lesson: 'Lesson 4: Formal emails', step: 'Step 3 of 8',
    today: 'Today, 4:12 pm',
    t1a: 'We are writing an email to a hotel to ask about rooms for a school trip.',
    t1b: (<>One task for now: <strong>write the greeting line</strong> for the hotel manager. You don’t know their name.</>),
    s1: 'Hi manager,',
    fbTitle: 'Nearly there', fbRight: 'What was right', fbR1: 'You started with a greeting.', fbR2: 'You ended the line with a comma.',
    fbFix: 'One thing to change', fbFixText: (<>“Hi” is informal. When you don’t know the name, write <En>Dear Sir or Madam,</En></>),
    t2: (<>Your next task: <strong>write the first sentence</strong> and say why you are writing.</>),
    hint: 'Hint', hintAsked: 'Hint', hintText: (<>Formal emails often start with <En>I am writing to…</En></>),
    s2: 'I am writing to ask about rooms for a school trip in March.',
    streamA: (<>Excellent. <En>I am writing to ask about</En> is exactly the formal opening we need, and you gave the reason clearly.</>),
    streamB: 'Your next task: add one sentence with the dates and the number of guests, using',
    writing: 'Tutor is writing…', stop: 'Stop',
    placeholder: 'Type your answer…', mic: 'Speak your answer', send: 'Send',
    footnote: 'The tutor gives one task at a time. Ask for a hint whenever you need one.',
    goals: 'Lesson goals', g1: 'Choose a formal greeting', g2: 'Say why you are writing', g3: 'Give the details clearly', g4: 'Close the email politely',
    progress: 'Your progress', stepOf: 'Step 3 of 8', timeIn: 'Time in this lesson', mins: '14 min', hintsUsed: 'Hints used', from: 'Assigned by', teacher: 'Ms Dina Ezzat',
    level: 'Level', b1: 'B1',
  },
  ar: {
    title: 'الرسائل الرسمية', subtitle: 'اللغة الإنجليزية · الدرس 4 · مع معلّمك', voice: 'تحدّثي بدلًا من الكتابة',
    subject: 'اللغة الإنجليزية', lesson: 'الدرس 4: الرسائل الرسمية', step: 'الخطوة 3 من 8',
    today: 'اليوم، 4:12 مساءً',
    t1a: 'نكتب رسالة بريد إلكتروني إلى فندق نسأل فيها عن غرف لرحلة مدرسية.',
    t1b: (<>مهمة واحدة الآن: <strong>اكتبي سطر التحية</strong> الموجَّه إلى مدير الفندق، وأنتِ لا تعرفين اسمه.</>),
    s1: 'Hi manager,',
    fbTitle: 'اقتربتِ كثيرًا', fbRight: 'ما أصبتِ فيه', fbR1: 'بدأتِ بتحية.', fbR2: 'أنهيتِ السطر بفاصلة.',
    fbFix: 'أمر واحد يحتاج إلى تعديل', fbFixText: (<>كلمة <En>Hi</En> غير رسمية. عندما لا تعرفين الاسم اكتبي <En>Dear Sir or Madam,</En></>),
    t2: (<>مهمتك التالية: <strong>اكتبي الجملة الأولى</strong> واذكري سبب كتابتك.</>),
    hint: 'تلميح', hintAsked: 'تلميح', hintText: (<>تبدأ الرسائل الرسمية كثيرًا بعبارة <En>I am writing to…</En></>),
    s2: 'I am writing to ask about rooms for a school trip in March.',
    streamA: (<>ممتاز. عبارة <En>I am writing to ask about</En> هي البداية الرسمية التي نحتاج إليها، وقد ذكرتِ السبب بوضوح.</>),
    streamB: 'مهمتك التالية: أضيفي جملة واحدة تذكرين فيها التواريخ وعدد الضيوف، مستخدمةً',
    writing: 'المعلّم يكتب…', stop: 'إيقاف',
    placeholder: 'اكتبي إجابتك…', mic: 'قولي إجابتك بصوتك', send: 'إرسال',
    footnote: 'يقدّم المعلّم مهمة واحدة في كل مرة. اطلبي تلميحًا متى احتجتِ إليه.',
    goals: 'أهداف الدرس', g1: 'اختيار تحية رسمية', g2: 'ذكر سبب الكتابة', g3: 'عرض التفاصيل بوضوح', g4: 'ختام الرسالة بلباقة',
    progress: 'تقدّمك', stepOf: 'الخطوة 3 من 8', timeIn: 'الوقت في هذا الدرس', mins: '14 دقيقة', hintsUsed: 'التلميحات المستخدمة', from: 'أسندته', teacher: 'أ. دينا عزت',
    level: 'المستوى', b1: 'B1',
  },
};

function TutorMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-primary', className)}>
      <svg viewBox="0 0 24 24" className="size-4"><path d="M12 3c3.3 0 6 2.6 6 5.8 0 2-1 3.5-2.3 4.5-.7.6-1 1.2-1 2V16H9.3v-.7c0-.8-.4-1.4-1-2C7 12.3 6 10.8 6 8.8 6 5.6 8.7 3 12 3Z" fill="var(--accent)" /><rect x="9.5" y="17.6" width="5" height="1.8" rx=".9" fill="var(--primary-foreground)" /></svg>
    </span>
  );
}

function TutorMsg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <TutorMark className="mt-0.5" />
      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-2 rounded-2xl rounded-ss-md border bg-card px-4 py-3 text-[15px] leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.04)]', className)}>{children}</div>
    </div>
  );
}
function LearnerMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-3 text-[15px] leading-relaxed text-primary-foreground"><p dir="ltr" className="text-start">{children}</p></div>
    </div>
  );
}

export default function StudentChat() {
  const t = useT(T);
  const { lang } = usePreview();
  const nav = useStudentNav();
  const goals = [{ l: t.g1, s: 'done' }, { l: t.g2, s: 'now' }, { l: t.g3, s: 'todo' }, { l: t.g4, s: 'todo' }];
  return (
    <AppShell
      nav={nav} active="tutor" back title={t.title} subtitle={t.subtitle}
      actions={<Button variant="outline" size="sm" className="rounded-full"><Video />{<span className="hidden sm:inline">{t.voice}</span>}</Button>}
    >
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col">
          {/* Lesson context */}
          <div className="mb-5 flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info"><BookOpenText className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted-foreground">{t.subject}<Badge tone="info" className="font-mono">{t.b1}</Badge></p>
              <p className="truncate font-bold">{t.lesson}</p>
            </div>
            <div className="hidden w-32 shrink-0 flex-col gap-1 sm:flex"><span className="text-end text-xs font-semibold text-muted-foreground">{t.step}</span><Progress value={37.5} size="sm" /></div>
            <span className="shrink-0 text-xs font-bold text-muted-foreground sm:hidden">{num(3, lang)}/{num(8, lang)}</span>
          </div>

          <p className="mb-4 text-center text-xs font-semibold text-muted-foreground">{t.today}</p>

          <div className="flex flex-col gap-4">
            <TutorMsg>
              <p>{t.t1a}</p>
              <p>{t.t1b}</p>
            </TutorMsg>
            <LearnerMsg>{t.s1}</LearnerMsg>

            {/* Correction feedback with what was right, then one new task */}
            <TutorMsg className="p-0">
              <div className="flex flex-col gap-3 px-4 pt-3">
                <p className="flex items-center gap-2 font-bold"><PenLine className="size-4 text-warning-foreground" />{t.fbTitle}</p>
                <div className="rounded-xl bg-success-soft p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-success">{t.fbRight}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    <li className="flex items-start gap-2"><Check className="mt-1 size-4 shrink-0 text-success" />{t.fbR1}</li>
                    <li className="flex items-start gap-2"><Check className="mt-1 size-4 shrink-0 text-success" />{t.fbR2}</li>
                  </ul>
                </div>
                <div className="rounded-xl bg-warning-soft p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">{t.fbFix}</p>
                  <p className="text-sm">{t.fbFixText}</p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col items-start gap-3 px-4 pb-3">
                <p>{t.t2}</p>
                <Button variant="outline" size="sm" className="rounded-full border-accent bg-accent/15 text-accent-foreground data-[hovered]:bg-accent/25"><Lightbulb />{t.hint}</Button>
              </div>
            </TutorMsg>

            {/* The hint the learner asked for */}
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/25 text-accent-foreground"><Lightbulb className="size-4" /></span>
              <div className="max-w-[85%] rounded-2xl rounded-ss-md border border-dashed border-accent bg-accent/10 px-4 py-3 text-[15px]">
                <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-accent-foreground">{t.hintAsked}</p>
                <p>{t.hintText}</p>
              </div>
            </div>

            <LearnerMsg>{t.s2}</LearnerMsg>

            {/* Still streaming */}
            <TutorMsg>
              <p>{t.streamA}</p>
              <p>{t.streamB}<span aria-hidden className="ms-0.5 inline-block h-[1.1em] w-[3px] translate-y-[3px] animate-pulse rounded-sm bg-primary" /></p>
              <div className="mt-1 flex items-center justify-between gap-3 border-t pt-2.5">
                <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                  {t.writing}
                </span>
                <Button variant="outline" size="sm" className="rounded-full"><Square className="fill-current" />{t.stop}</Button>
              </div>
            </TutorMsg>
          </div>

          {/* Composer (in the product it stays pinned above the tab bar; static here so the full conversation is visible) */}
          <div className="mt-6">
            <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-lg shadow-primary/5">
              <Button variant="ghost" size="icon" aria-label={t.mic} className="shrink-0 rounded-xl text-muted-foreground"><Mic /></Button>
              <textarea rows={1} placeholder={t.placeholder} aria-label={t.placeholder} className="min-h-tap min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground" />
              <Button size="icon" aria-label={t.send} className="shrink-0 rounded-xl"><Dir><SendHorizontal /></Dir></Button>
            </div>
            <p className="mt-2 hidden text-center text-xs text-muted-foreground md:block">{t.footnote}</p>
          </div>
        </div>

        {/* Desktop side panel */}
        <aside className="hidden flex-col gap-4 lg:flex">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t.goals}</h2>
            <ol className="flex flex-col gap-1">
              {goals.map((g) => (
                <li key={g.l} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm', g.s === 'now' && 'bg-secondary font-semibold')}>
                  {g.s === 'done' ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : g.s === 'now' ? <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-primary"><span className="size-2 rounded-full bg-primary" /></span> : <Circle className="size-5 shrink-0 text-muted-foreground/50" />}
                  <span className={cn(g.s === 'done' && 'text-muted-foreground line-through decoration-muted-foreground/40', g.s === 'todo' && 'text-muted-foreground')}>{g.l}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="font-bold">{t.progress}</h2>
            <Progress value={37.5} label={t.stepOf} />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.timeIn}</dt><dd className="mt-1 flex items-center gap-1.5 font-bold"><Clock className="size-4 text-muted-foreground" />{t.mins}</dd></div>
              <div className="rounded-lg bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">{t.hintsUsed}</dt><dd className="mt-1 flex items-center gap-1.5 font-bold"><Lightbulb className="size-4 text-muted-foreground" />{num(1, lang)}</dd></div>
            </dl>
            <Separator />
            <div className="flex items-center gap-3">
              <Avatar name={lang === 'ar' ? 'دينا عزت' : 'Dina Ezzat'} className="size-9 text-xs" />
              <div className="text-sm"><p className="text-xs text-muted-foreground">{t.from}</p><p className="font-semibold">{t.teacher}</p></div>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
