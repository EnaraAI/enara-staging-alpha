import { Check } from 'lucide-react';
import { useT } from '@/lib/preview';
import { KidsShell } from '@/components/shell';
import { KidButton, KidSteps, SpeakButton } from '@/components/ui/kids';
import { cn } from '@/lib/utils';
import { Apple, Ball, Banana } from './art';

const T = {
  en: {
    home: 'Home', listen: 'Listen', steps: 'Lesson steps: 3 of 6', tap: 'Tap the', word: 'red apple', hear: 'Hear: tap the red apple', yes: 'Yes!',
    choices: { red: 'Red apple', green: 'Green apple', ball: 'Red ball', banana: 'Yellow banana' }, correct: 'correct',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', steps: 'خطوات الدرس: 3 من 6', tap: 'المس', word: 'red apple', hear: 'استمع: المس التفاحة الحمراء', yes: 'أحسنت!',
    choices: { red: 'تفاحة حمراء', green: 'تفاحة خضراء', ball: 'كرة حمراء', banana: 'موزة صفراء' }, correct: 'إجابة صحيحة',
  },
};

export default function KidsLesson() {
  const t = useT(T);
  const choices = [
    { id: 'green', pic: <Apple color="green" className="size-28! md:size-36!" /> },
    { id: 'red', pic: <Apple className="size-28! md:size-36!" />, correct: true },
    { id: 'ball', pic: <Ball className="size-28! md:size-36!" /> },
    { id: 'banana', pic: <Banana className="size-28! md:size-36!" /> },
  ] as const;
  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={24}>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 md:gap-8">
        <KidSteps total={6} done={2} label={t.steps} />

        {/* Instruction: sound first, few words, the English word to learn stands out */}
        <div className="flex items-center gap-4">
          <SpeakButton label={t.hear} />
          <p className="text-2xl font-extrabold leading-snug md:text-4xl">
            {t.tap} <span lang="en" dir="ltr" className="inline-block rounded-2xl bg-destructive-soft px-3 text-destructive">{t.word}</span>
          </p>
        </div>

        {/* Picture choices: each one is a big button; the red apple is shown just after a correct tap */}
        <div role="group" aria-label={t.hear} className="grid w-full grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {choices.map((c) => {
            const ok = 'correct' in c && c.correct;
            return (
              <KidButton
                key={c.id}
                tone="white"
                aria-label={ok ? `${t.choices[c.id]}, ${t.correct}` : t.choices[c.id]}
                className={cn('relative aspect-square h-auto w-full p-3',
                  ok && 'border-4 border-success bg-success-soft shadow-[0_6px_0_var(--success)]')}
              >
                {c.pic}
                {ok && (
                  <>
                    <span className="absolute -top-3 -end-3 grid size-14 place-items-center rounded-full bg-success text-success-foreground shadow-md ring-4 ring-background">
                      <Check strokeWidth={4} className="size-8!" />
                    </span>
                    <span className="absolute -bottom-4 rounded-full bg-success px-4 text-xl font-extrabold text-success-foreground shadow-md">{t.yes}</span>
                  </>
                )}
              </KidButton>
            );
          })}
        </div>
      </div>
    </KidsShell>
  );
}
