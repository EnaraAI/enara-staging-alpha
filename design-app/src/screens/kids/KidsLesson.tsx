import { useEffect, useState } from 'react';
import { ArrowRight, Check, Home, RotateCcw, X } from 'lucide-react';
import { usePreview, useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { errorText, post } from '@/lib/api';
import { go } from '@/App';
import { KidsShell } from '@/components/shell';
import { KidButton, KidSteps, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BigStar, Owl } from './art';
import { findTodaysLesson, hashQuery, loadLesson, saveStars, setReward, speak, starsFor, totalStars, useLoad, useStopSpeechOnLeave, type KidLesson } from './data';
import { KidError, KidLoading, KidMessage } from './states';

const T = {
  en: {
    home: 'Home', listen: 'Listen', steps: (d: number, n: number) => `Lesson steps: ${d} of ${n}`,
    hearPart: 'Hear this part', next: 'Next', yes: 'Yes!', no: 'Try again', correct: 'correct', wrong: 'not this one',
    tapOne: 'Tap the right answer', hearQ: (q: string) => `Hear: ${q}`, hearYes: 'Yes! That is right.', hearNo: 'Not this one. Try again!',
    finishTitle: 'You did it!', finishSay: 'You did it! Tap to get your stars.', getStars: 'Get my stars',
    saving: 'Saving…', notSaved: 'Your lesson was not saved.', retry: 'Try again',
    loading: 'Getting your lesson…', missing: 'We could not find this lesson.', goHome: 'Go home',
    empty: 'This lesson has nothing to do yet.', emptySay: 'This lesson has nothing to do yet. Ask your teacher.',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', steps: (d: number, n: number) => `خطوات الدرس: ${d} من ${n}`,
    hearPart: 'استمع إلى هذا الجزء', next: 'التالي', yes: 'أحسنت!', no: 'حاول مرة أخرى', correct: 'إجابة صحيحة', wrong: 'ليست هذه',
    tapOne: 'المس الإجابة الصحيحة', hearQ: (q: string) => `استمع: ${q}`, hearYes: 'أحسنت! هذه هي الإجابة الصحيحة.', hearNo: 'ليست هذه. حاول مرة أخرى!',
    finishTitle: 'أحسنت، أنهيت الدرس!', finishSay: 'أحسنت، أنهيت الدرس! المس الزر لتأخذ نجومك.', getStars: 'خذ نجومي',
    saving: 'نحفظ…', notSaved: 'لم يُحفظ درسك.', retry: 'حاول مرة أخرى',
    loading: 'نُحضّر درسك…', missing: 'لم نجد هذا الدرس.', goHome: 'إلى الرئيسية',
    empty: 'لا يوجد في هذا الدرس شيء لفعله بعد.', emptySay: 'لا يوجد في هذا الدرس شيء لفعله بعد. اسأل معلّمك.',
  },
};

type Step = { kind: 'listen'; text: string } | { kind: 'question'; q: KidLesson['questions'][number] } | { kind: 'finish' };

export default function KidsLesson() {
  const t = useT(T);
  const { user } = useSession();
  useStopSpeechOnLeave();
  // The lesson named in the route (#/kids/lesson?course=..&lesson=..), else today's lesson from the dashboard.
  const [where] = useState(() => { const q = hashQuery(); return { course: q.get('course') || '', lesson: q.get('lesson') || '' }; });
  const load = useLoad(async (signal) => {
    const w = where.course && where.lesson ? { courseId: where.course, lessonId: where.lesson } : await findTodaysLesson(signal);
    if (!w) return null;
    return loadLesson(w.courseId, w.lessonId, signal);
  }, [where.course, where.lesson]);

  let body;
  if (load.loading && !load.data) body = <KidLoading label={t.loading} />;
  else if (load.error) body = <KidError error={load.error} onRetry={load.reload} />;
  else if (!load.data) body = <KidMessage title={t.missing} action={<KidButton className="w-full max-w-sm text-2xl" onPress={() => go('/kids')}><Home strokeWidth={3} />{t.goHome}</KidButton>} />;
  else if (!load.data.paragraphs.length && !load.data.questions.length) body = <KidMessage title={t.empty} say={t.emptySay} action={<KidButton className="w-full max-w-sm text-2xl" onPress={() => go('/kids')}><Home strokeWidth={3} />{t.goHome}</KidButton>} />;
  else body = <Lesson key={`${load.data.courseId}:${load.data.id}`} lesson={load.data} />;

  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={totalStars(user)}>
      {body}
    </KidsShell>
  );
}

function Lesson({ lesson }: { lesson: KidLesson }) {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();
  const steps: Step[] = [
    ...lesson.paragraphs.map((text) => ({ kind: 'listen' as const, text })),
    ...lesson.questions.map((q) => ({ kind: 'question' as const, q })),
    { kind: 'finish' as const },
  ];
  const [i, setI] = useState(0);
  // Per question: the choices tapped so far, and whether the first tap was right (that decides the stars).
  const [tapped, setTapped] = useState<Record<string, number[]>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const step = steps[Math.min(i, steps.length - 1)];
  const next = () => { setI((x) => Math.min(x + 1, steps.length - 1)); window.scrollTo?.(0, 0); };

  const firstTryRight = lesson.questions.filter((q) => (tapped[q.id] ?? [])[0] === q.answer).length;
  const total = lesson.questions.length;
  // Same rule as today's kids app (starsFor): 85% or more = 3 stars, 60% = 2, else 1. A lesson without questions: 3 stars for finishing it.
  const stars = total ? starsFor((100 * firstTryRight) / total) : 3;

  const finish = async () => {
    setSaving(true); setSaveError(null);
    try {
      // The same "I finished this lesson" call as today's kids app.
      await post(`/api/me/courses/${encodeURIComponent(lesson.courseId)}/lessons/${encodeURIComponent(lesson.id)}/complete`);
      saveStars(user, lesson.courseId, lesson.id, stars);
      setReward({ stars, right: firstTryRight, total, title: lesson.title, courseId: lesson.courseId, nextId: lesson.nextId });
      go('/kids/reward');
    } catch (e) {
      setSaveError(e);
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 md:gap-8">
      <KidSteps total={steps.length} done={i} label={t.steps(i + 1, steps.length)} />

      {step.kind === 'listen' && (
        <div className="flex w-full max-w-3xl flex-col items-center gap-6">
          <div className="flex w-full items-start gap-4 rounded-[2rem] border-2 bg-card p-4 md:p-6">
            <SpeakButton label={t.hearPart} onPress={() => speak(step.text, lang)} />
            <p dir="auto" className="min-w-0 flex-1 whitespace-pre-line break-words text-2xl font-bold leading-relaxed md:text-3xl">{step.text}</p>
          </div>
          <KidButton className="w-full max-w-sm text-2xl md:text-3xl" onPress={next}>{t.next}<Dir><ArrowRight strokeWidth={3} /></Dir></KidButton>
        </div>
      )}

      {step.kind === 'question' && <Question key={step.q.id} q={step.q} tapped={tapped[step.q.id] ?? []} onTap={(k) => setTapped((m) => ({ ...m, [step.q.id]: [...(m[step.q.id] ?? []), k] }))} onNext={next} />}

      {step.kind === 'finish' && (
        <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <div aria-hidden className="flex items-end">
            <BigStar className="size-16 -rotate-12 md:size-24" />
            <BigStar className="-mx-2 mb-4 size-24 md:size-32" />
            <BigStar className="size-16 rotate-12 md:size-24" />
          </div>
          <div className="flex items-center gap-4">
            <p className="text-3xl font-extrabold leading-tight md:text-4xl">{t.finishTitle}</p>
            <SpeakButton label={t.finishSay} onPress={() => speak(t.finishSay, lang)} />
          </div>
          {saveError != null && (
            <p role="alert" className="rounded-2xl bg-destructive-soft px-4 py-3 text-[19px] font-bold text-destructive">{t.notSaved} {errorText(saveError, lang)}</p>
          )}
          <KidButton tone="success" className="w-full max-w-sm text-2xl md:text-3xl" isDisabled={saving} onPress={finish}>
            {saving ? t.saving : saveError != null ? <><RotateCcw strokeWidth={3} />{t.retry}</> : t.getStars}
          </KidButton>
        </div>
      )}
    </div>
  );
}

function Question({ q, tapped, onTap, onNext }: { q: KidLesson['questions'][number]; tapped: number[]; onTap: (k: number) => void; onNext: () => void }) {
  const t = useT(T);
  const { lang } = usePreview();
  const solved = tapped.includes(q.answer);
  const lastWrong = !solved && tapped.length > 0;
  useEffect(() => { if (solved) speak(t.hearYes, lang); }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex w-full flex-col items-center gap-6 md:gap-8">
      {/* Instruction: sound first, few words */}
      <div className="flex w-full max-w-3xl items-center gap-4">
        <SpeakButton label={t.hearQ(q.text)} onPress={() => speak(q.text, lang)} />
        <p dir="auto" className="min-w-0 flex-1 break-words text-2xl font-extrabold leading-snug md:text-4xl">{q.text}</p>
      </div>
      <p className="sr-only" aria-live="polite">{solved ? t.hearYes : lastWrong ? t.hearNo : ''}</p>

      {/* Choices: each one is a big button; feedback on every tap */}
      <div role="group" aria-label={t.tapOne} className={cn('grid w-full gap-4 md:gap-6', q.choices.length > 2 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2')}>
        {q.choices.map((c, k) => {
          const isRight = solved && k === q.answer;
          const isWrong = tapped.includes(k) && k !== q.answer;
          return (
            <KidButton
              key={k}
              tone="white"
              isDisabled={solved ? k !== q.answer : isWrong}
              aria-label={isRight ? `${c}, ${t.correct}` : isWrong ? `${c}, ${t.wrong}` : c}
              onPress={() => { if (solved || isWrong) return; onTap(k); if (k !== q.answer) speak(t.hearNo, lang); }}
              className={cn('relative min-h-[120px] w-full p-4 text-2xl md:min-h-[160px] md:text-3xl',
                isRight && 'border-4 border-success bg-success-soft shadow-[0_6px_0_var(--success)]',
                isWrong && 'border-4 border-destructive/60 bg-destructive-soft opacity-80',
                solved && !isRight && 'opacity-50')}
            >
              <span dir="auto" className="break-words text-center font-extrabold leading-snug">{c}</span>
              {isRight && (
                <>
                  <span className="absolute -top-3 -end-3 grid size-14 place-items-center rounded-full bg-success text-success-foreground shadow-md ring-4 ring-background">
                    <Check strokeWidth={4} className="size-8!" />
                  </span>
                  <span className="absolute -bottom-4 rounded-full bg-success px-4 text-xl font-extrabold text-success-foreground shadow-md">{t.yes}</span>
                </>
              )}
              {isWrong && (
                <span className="absolute -top-3 -end-3 grid size-12 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md ring-4 ring-background">
                  <X strokeWidth={4} className="size-7!" />
                </span>
              )}
            </KidButton>
          );
        })}
      </div>

      {lastWrong && (
        <p className="flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-2 text-[19px] font-bold">
          <Owl className="size-10 shrink-0" />{t.no}
        </p>
      )}
      {solved && (
        <div className="flex w-full max-w-3xl flex-col items-center gap-4 pt-2">
          {q.why && (
            <div className="flex w-full items-center gap-4 rounded-[2rem] border-2 bg-card p-3 ps-4">
              <p dir="auto" className="min-w-0 flex-1 break-words text-xl font-bold leading-snug">{q.why}</p>
              <SpeakButton label={t.hearQ(q.why)} onPress={() => speak(q.why, lang)} />
            </div>
          )}
          <KidButton className="w-full max-w-sm text-2xl md:text-3xl" onPress={onNext}>{t.next}<Dir><ArrowRight strokeWidth={3} /></Dir></KidButton>
        </div>
      )}
    </div>
  );
}
