// Loading, empty and error states for the kids screens: a picture, few words, a listen button and one big action.
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { usePreview } from '@/lib/preview';
import { errorText } from '@/lib/api';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Owl } from './art';
import { speak } from './data';

const T = {
  en: { loading: 'Getting things ready…', hear: 'Listen', retry: 'Try again', oops: 'Oh no! That did not work.' },
  ar: { loading: 'نُجهّز كل شيء…', hear: 'استمع', retry: 'حاول مرة أخرى', oops: 'عذرًا، لم ينجح ذلك.' },
};

export function KidLoading({ label }: { label?: string }) {
  const { lang } = usePreview();
  const t = T[lang];
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 text-center">
      <Owl className="size-28 animate-bounce motion-reduce:animate-none md:size-36" />
      <p className="text-2xl font-extrabold">{label ?? t.loading}</p>
    </div>
  );
}

/** A message to hear and one big action (e.g. Try again, Go home). */
export function KidMessage({ title, say, action, pic }: { title: string; say?: string; action?: ReactNode; pic?: ReactNode }) {
  const { lang } = usePreview();
  const t = T[lang];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 text-center">
      {pic ?? <Owl className="size-28 md:size-36" />}
      <div className="flex items-center gap-4">
        <p className="text-2xl font-extrabold leading-snug md:text-3xl">{title}</p>
        <SpeakButton label={`${t.hear}: ${say ?? title}`} onPress={() => speak(say ?? title, lang)} />
      </div>
      {action}
    </div>
  );
}

export function KidError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { lang } = usePreview();
  const t = T[lang];
  return (
    <div role="alert" className="contents">
      <KidMessage
        title={t.oops}
        say={`${t.oops} ${errorText(error, lang)}`}
        action={
          <>
            <p className="text-[19px] font-bold text-muted-foreground">{errorText(error, lang)}</p>
            <KidButton className="w-full max-w-sm text-2xl" onPress={onRetry}><RotateCcw strokeWidth={3} />{t.retry}</KidButton>
          </>
        }
      />
    </div>
  );
}
