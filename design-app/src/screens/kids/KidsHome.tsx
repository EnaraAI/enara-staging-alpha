import { Check, MessageCircle, Play } from 'lucide-react';
import { usePreview, useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { go } from '@/App';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Apple, Ball, Cat, KidAvatar, Owl, StepIcon, Sun } from './art';
import { findTodaysLesson, firstName, lessonPath, lessonStars, loadLesson, speak, totalStars, useLoad, useStopSpeechOnLeave } from './data';
import { KidError, KidLoading, KidMessage } from './states';

const T = {
  en: {
    home: 'Home', listen: 'Listen', hi: (n: string) => (n ? `Hi, ${n}!` : 'Hi there!'), hear: 'Hear the greeting',
    start: 'Start today’s lesson', again: 'Do today’s lesson again', today: 'Today', lessonOf: (n: number, of: number) => `Lesson ${n} of ${of}`,
    steps: { listen: 'Listen', look: 'Look and tap', star: 'Stars' }, done: 'done', now: 'now',
    talk: 'Talk with Enara', loading: 'Finding today’s lesson…',
    none: 'No lesson for today yet.', noneSay: 'There is no lesson for today yet. You can talk with Enara.',
    sayStart: (title: string) => `Start today’s lesson: ${title}`,
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', hi: (n: string) => (n ? `مرحبًا يا ${n}!` : 'مرحبًا!'), hear: 'استمع إلى التحية',
    start: 'ابدأ درس اليوم', again: 'أعد درس اليوم', today: 'اليوم', lessonOf: (n: number, of: number) => `الدرس ${n} من ${of}`,
    steps: { listen: 'استمع', look: 'انظر والمس', star: 'النجوم' }, done: 'تمّ', now: 'الآن',
    talk: 'تحدّث مع إنارة', loading: 'نبحث عن درس اليوم…',
    none: 'لا يوجد درس لليوم بعد.', noneSay: 'لا يوجد درس لليوم بعد. يمكنك التحدّث مع إنارة.',
    sayStart: (title: string) => `ابدأ درس اليوم: ${title}`,
  },
};

type Kind = 'listen' | 'look' | 'star';

export default function KidsHome() {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();
  useStopSpeechOnLeave();
  const name = firstName(user?.name);
  // Today's lesson: the dashboard's "continue learning" lesson, read from its course (same API as today's kids app).
  const load = useLoad(async (signal) => {
    const where = await findTodaysLesson(signal);
    if (!where) return null;
    return loadLesson(where.courseId, where.lessonId, signal);
  }, []);
  const lesson = load.data ?? null;
  const stars = totalStars(user);
  const earned = lesson ? lessonStars(user, lesson.courseId, lesson.id) : null;
  const kinds: Kind[] = lesson ? [...(lesson.paragraphs.length ? (['listen'] as Kind[]) : []), ...(lesson.questions.length ? (['look'] as Kind[]) : []), 'star'] : [];
  const doneCount = earned != null ? kinds.length : 0;
  const talk = (cls: string) => (
    <KidButton tone="white" className={cn('w-full text-xl', cls)} onPress={() => go('/kids/chat')}>
      <Owl className="size-12 shrink-0" />{t.talk}
    </KidButton>
  );

  let body;
  if (load.loading && !load.data) body = <KidLoading label={t.loading} />;
  else if (load.error) body = <KidError error={load.error} onRetry={load.reload} />;
  else if (!lesson) {
    body = (
      <KidMessage
        title={t.none} say={t.noneSay}
        action={<KidButton className="w-full max-w-sm text-2xl" onPress={() => go('/kids/chat')}><MessageCircle strokeWidth={3} />{t.talk}</KidButton>}
      />
    );
  } else {
    const label = earned != null ? t.again : t.start;
    body = (
      <div className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-8 md:grid-cols-[1fr_1.15fr] md:items-center md:gap-12 md:content-center">
        {/* Greeting */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex items-center gap-4">
            <KidAvatar className="size-24 shrink-0 drop-shadow-sm md:size-36" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
              <p className="max-w-full break-words text-3xl font-extrabold leading-tight md:text-4xl">{t.hi(name)}</p>
              <SpeakButton label={t.hear} onPress={() => speak(`${t.hi(name)} ${t.sayStart(lesson.title)}`, lang)} />
            </div>
          </div>

          {/* Today's path: small, not tappable, pictures first */}
          <section aria-label={t.today} className="hidden rounded-2xl border-2 bg-card p-5 md:block">
            <Path t={t} kinds={kinds} doneCount={doneCount} />
          </section>
          {talk('hidden md:inline-flex')}
        </div>

        {/* The one big action */}
        <KidButton className="h-auto w-full min-w-0 flex-col gap-4 rounded-[2rem] p-5 text-2xl md:p-7 md:text-3xl" aria-label={`${label}: ${lesson.title}`} onPress={() => go(lessonPath(lesson.courseId, lesson.id))}>
          <span aria-hidden className="relative grid h-40 w-full place-items-center overflow-hidden rounded-3xl bg-card md:h-60">
            <span className="absolute top-2 end-3 md:top-4 md:end-6"><Sun className="size-16! md:size-28!" /></span>
            <span className="flex items-end gap-3 pt-10 md:gap-6 md:pt-12">
              <Apple className="size-16! md:size-28!" />
              <Cat className="size-20! md:size-32!" />
              <Ball className="size-14! md:size-24!" color="blue" />
            </span>
          </span>
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start leading-tight">
              <span>{label}</span>
              <span dir="auto" className="w-full truncate text-xl font-bold opacity-90 md:text-2xl">{lesson.title}</span>
              <span className="text-[18px] font-bold opacity-80">{t.lessonOf(lesson.n, lesson.of)}</span>
            </span>
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground md:size-20">{earned != null ? <Check strokeWidth={3.5} /> : <Dir><Play className="fill-current" /></Dir>}</span>
          </span>
        </KidButton>

        <section aria-label={t.today} className="rounded-2xl border-2 bg-card p-4 md:hidden">
          <Path t={t} kinds={kinds} doneCount={doneCount} />
        </section>
        {talk('md:hidden')}
      </div>
    );
  }

  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={stars}>
      {body}
    </KidsShell>
  );
}

function Path({ t, kinds, doneCount }: { t: (typeof T)['en']; kinds: Kind[]; doneCount: number }) {
  return (
    <ol className="relative flex items-start justify-between">
      <span aria-hidden className="absolute inset-x-8 top-7 border-t-4 border-dashed border-border md:top-8" />
      {kinds.map((k, i) => {
        const done = i < doneCount, now = i === doneCount;
        return (
          <li key={k} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            <span className={cn('relative grid size-14 place-items-center rounded-full border-4 bg-card md:size-16',
              done ? 'border-success bg-success text-success-foreground' : now ? 'border-primary text-primary ring-4 ring-primary/20' : 'border-border text-muted-foreground')}>
              {done ? <Check className="size-8" strokeWidth={3.5} /> : <StepIcon kind={k} className="size-8 md:size-9" />}
            </span>
            <span className={cn('text-[18px] font-bold leading-tight', now ? 'text-primary' : 'text-muted-foreground')}>{t.steps[k]}</span>
            <span className="sr-only">{done ? t.done : now ? t.now : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}
