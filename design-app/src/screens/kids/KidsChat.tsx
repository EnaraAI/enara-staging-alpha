import type { ReactNode } from 'react';
import { Mic } from 'lucide-react';
import { useT } from '@/lib/preview';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { cn } from '@/lib/utils';
import { Cat, KidAvatar, Owl, Splat, Sun } from './art';

const T = {
  en: {
    home: 'Home', listen: 'Listen', tutor: 'Nour',
    b1: 'What is this?', b1say: 'Hear: what is this?',
    me: 'A cat!', meLabel: 'Yassin said: a cat',
    b2: 'Yes! And the sun is…', b2say: 'Hear: yes! And the sun is…',
    hold: 'Hold to talk', or: 'or tap',
    colours: { yellow: 'Yellow', blue: 'Blue', green: 'Green' },
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', tutor: 'نور',
    b1: 'ما هذا؟', b1say: 'استمع: ما هذا؟',
    me: 'A cat!', meLabel: 'قال ياسين: قطة',
    b2: 'أحسنت! والشمس لونها…', b2say: 'استمع: أحسنت! والشمس لونها…',
    hold: 'اضغط مطوّلًا وتكلّم', or: 'أو المس',
    colours: { yellow: 'أصفر', blue: 'أزرق', green: 'أخضر' },
  },
};

export default function KidsChat() {
  const t = useT(T);
  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} title={t.tutor}>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-10">
        {/* Conversation: short bubbles, a picture in each question, every bubble can be heard */}
        <ol className="flex min-w-0 flex-col gap-4">
          <TutorBubble say={t.b1say} text={t.b1} pic={<Cat className="size-20 md:size-24" />} earlier />
          <li className="hidden items-center justify-end gap-3 md:flex">
            <span aria-label={t.meLabel} className="flex items-center gap-3 rounded-3xl rounded-ee-md bg-primary px-5 py-3 text-2xl font-extrabold text-primary-foreground">
              <Wave /><span lang="en" dir="ltr">{t.me}</span>
            </span>
            <KidAvatar className="size-14 shrink-0" />
          </li>
          <TutorBubble say={t.b2say} text={t.b2} pic={<Sun className="size-16 md:size-24" face={false} />} current />
        </ol>

        {/* Answer: one big hold-to-talk button, or three colour pictures */}
        <section className="flex flex-col items-center gap-4 rounded-[2rem] border-2 bg-card p-4 md:gap-5 md:p-8">
          <KidButton aria-label={t.hold} className="size-28 rounded-full p-0 md:size-40 [&_svg]:size-12 md:[&_svg]:size-16">
            <Mic strokeWidth={2.5} />
          </KidButton>
          <p className="text-[19px] font-bold text-muted-foreground">{t.hold}</p>
          <div className="flex w-full items-center gap-3">
            <span className="h-0.5 flex-1 rounded bg-border" /><span className="text-[18px] font-bold text-muted-foreground">{t.or}</span><span className="h-0.5 flex-1 rounded bg-border" />
          </div>
          <div className="grid w-full grid-cols-3 gap-3">
            {([['yellow', 'oklch(0.87 0.17 90)'], ['blue', 'oklch(0.62 0.15 240)'], ['green', 'oklch(0.68 0.16 145)']] as const).map(([id, c]) => (
              <KidButton key={id} tone="white" aria-label={t.colours[id]} className="h-[88px] w-full p-2 md:aspect-square md:h-auto">
                <Splat color={c} className="size-14! md:size-20!" />
              </KidButton>
            ))}
          </div>
        </section>
      </div>
    </KidsShell>
  );
}

function TutorBubble({ text, say, pic, current, earlier }: { text: string; say: string; pic: ReactNode; current?: boolean; earlier?: boolean }) {
  return (
    <li className={cn('relative items-end gap-3 pt-11 md:pt-0', earlier ? 'hidden md:flex' : 'flex')}>
      {/* Nour the owl: a corner badge on phone, beside the bubble on wider screens */}
      <Owl className="absolute top-0 start-3 z-[1] size-12 md:static md:size-16 md:shrink-0" />
      <div className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-3xl border-2 bg-card p-3 ps-4 md:rounded-es-md md:ps-3', current && 'border-primary/40 shadow-[0_6px_0_var(--border)]')}>
        <span className="grid shrink-0 place-items-center rounded-2xl bg-muted p-1">{pic}</span>
        <p className="min-w-0 flex-1 text-xl font-extrabold leading-snug md:text-2xl">{text}</p>
        <SpeakButton label={say} />
      </div>
    </li>
  );
}

function Wave() {
  return (
    <svg viewBox="0 0 40 24" className="h-6 w-10 shrink-0" aria-hidden>
      {[4, 12, 20, 28, 36].map((x, i) => <rect key={x} x={x - 2} y={12 - [4, 9, 6, 10, 4][i]} width="4" height={[4, 9, 6, 10, 4][i] * 2} rx="2" fill="currentColor" />)}
    </svg>
  );
}
