import { Check, Play } from 'lucide-react';
import { useT } from '@/lib/preview';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Apple, Ball, Cat, KidAvatar, StepIcon, Sun } from './art';

const T = {
  en: {
    home: 'Home', listen: 'Listen', hi: 'Hi, Yassin!', hear: 'Hear the greeting',
    start: 'Start today’s lesson', topic: 'Colours and fruit', today: 'Today',
    steps: ['Listen', 'Look and tap', 'Talk', 'Stars'], done: 'done', now: 'now',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', hi: 'مرحبًا يا ياسين!', hear: 'استمع إلى التحية',
    start: 'ابدأ درس اليوم', topic: 'الألوان والفواكه', today: 'اليوم',
    steps: ['استمع', 'انظر والمس', 'تحدّث', 'النجوم'], done: 'تمّ', now: 'الآن',
  },
};

const kinds = ['listen', 'look', 'talk', 'star'] as const;

export default function KidsHome() {
  const t = useT(T);
  const doneCount = 1;
  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={24}>
      <div className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-8 md:grid-cols-[1fr_1.15fr] md:items-center md:gap-12 md:content-center">
        {/* Greeting */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <KidAvatar className="size-24 shrink-0 drop-shadow-sm md:size-36" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
              <p className="text-3xl font-extrabold leading-tight md:text-4xl">{t.hi}</p>
              <SpeakButton label={t.hear} />
            </div>
          </div>

          {/* Today's path: small, not tappable, pictures first */}
          <section aria-label={t.today} className="hidden rounded-2xl border-2 bg-card p-5 md:block">
            <Path t={t} doneCount={doneCount} />
          </section>
        </div>

        {/* The one big action */}
        <KidButton className="h-auto w-full flex-col gap-4 rounded-[2rem] p-5 text-2xl md:p-7 md:text-3xl" aria-label={t.start}>
          <span className="relative grid h-40 w-full place-items-center overflow-hidden rounded-3xl bg-card md:h-60">
            <span className="absolute top-2 end-3 md:top-4 md:end-6"><Sun className="size-16! md:size-28!" /></span>
            <span className="flex items-end gap-3 pt-10 md:gap-6 md:pt-12">
              <Apple className="size-16! md:size-28!" />
              <Cat className="size-20! md:size-32!" />
              <Ball className="size-14! md:size-24!" color="blue" />
            </span>
          </span>
          <span className="flex w-full items-center justify-between gap-3">
            <span className="text-start leading-tight">{t.start}</span>
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground md:size-20"><Dir><Play className="fill-current" /></Dir></span>
          </span>
        </KidButton>

        <section aria-label={t.today} className="rounded-2xl border-2 bg-card p-4 md:hidden">
          <Path t={t} doneCount={doneCount} />
        </section>
      </div>
    </KidsShell>
  );
}

function Path({ t, doneCount }: { t: (typeof T)['en']; doneCount: number }) {
  return (
    <ol className="relative flex items-start justify-between">
      <span aria-hidden className="absolute inset-x-8 top-7 border-t-4 border-dashed border-border md:top-8" />
      {kinds.map((k, i) => {
        const done = i < doneCount, now = i === doneCount;
        return (
          <li key={k} className="relative flex w-1/4 flex-col items-center gap-1.5 text-center">
            <span className={cn('relative grid size-14 place-items-center rounded-full border-4 bg-card md:size-16',
              done ? 'border-success bg-success text-success-foreground' : now ? 'border-primary text-primary ring-4 ring-primary/20' : 'border-border text-muted-foreground')}>
              {done ? <Check className="size-8" strokeWidth={3.5} /> : <StepIcon kind={k} className="size-8 md:size-9" />}
            </span>
            <span className={cn('text-[18px] font-bold leading-tight', now ? 'text-primary' : 'text-muted-foreground')}>{t.steps[i]}</span>
            <span className="sr-only">{done ? t.done : now ? t.now : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}
