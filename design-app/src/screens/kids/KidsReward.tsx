import { useState } from 'react';
import { ArrowRight, Home, Play } from 'lucide-react';
import { usePreview, useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { get } from '@/lib/api';
import { go } from '@/App';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { BigStar, Burst, Confetti, FruitSticker } from './art';
import { lessonPath, readReward, speak, totalStars, useLoad, useStopSpeechOnLeave } from './data';
import { KidMessage } from './states';

const T = {
  en: {
    home: 'Home', listen: 'Listen',
    earned: (n: number) => (n === 1 ? 'You earned 1 star!' : `You earned ${n} stars!`),
    right: (r: number, of: number) => `${r} of ${of} right the first time`,
    hear: (n: number, title: string) => `You earned ${n} ${n === 1 ? 'star' : 'stars'} in ${title}!`,
    sticker: 'Sticker!', stickerName: 'Lesson explorer', toGo: (done: number, of: number) => `${done} of ${of} lessons to your sticker`,
    nextLesson: 'Next lesson', goHome: 'Go home',
    none: 'Finish a lesson to earn stars!', start: 'Start a lesson',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع',
    earned: (n: number) => (n === 1 ? 'ربحتَ نجمة واحدة!' : n === 2 ? 'ربحتَ نجمتين!' : `ربحتَ ${n} نجوم!`),
    right: (r: number, of: number) => `${r} من ${of} صحيحة من أول مرة`,
    hear: (n: number, title: string) => `${n === 1 ? 'ربحتَ نجمة واحدة' : n === 2 ? 'ربحتَ نجمتين' : `ربحتَ ${n} نجوم`} في درس ${title}!`,
    sticker: 'ملصق!', stickerName: 'مستكشف الدروس', toGo: (done: number, of: number) => `${done} من ${of} دروس للحصول على الملصق`,
    nextLesson: 'الدرس التالي', goHome: 'إلى الرئيسية',
    none: 'أنهِ درسًا لتربح النجوم!', start: 'ابدأ درسًا',
  },
};

export default function KidsReward() {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();
  useStopSpeechOnLeave();
  // The stars of the lesson just finished (worked out in the browser, kept on this device).
  const [reward] = useState(readReward);
  // The "Lesson explorer" achievement from the server (5 finished lessons); shown only if it loads.
  const ach = useLoad(async (signal) => {
    const list = await get<any[]>('/api/me/achievements', signal);
    const a = Array.isArray(list) ? list.find((x) => x?.id === 'ach-lessons') : null;
    if (!a) return null;
    const target = Number(a.target) || 0, progress = Number(a.progress) || 0;
    return target > 0 ? { unlocked: !!a.unlocked, progress: Math.min(progress, target), target } : null;
  }, []);

  if (!reward) {
    return (
      <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={totalStars(user)}>
        <KidMessage title={t.none} action={<KidButton className="w-full max-w-sm text-2xl" onPress={() => go('/kids')}><Play strokeWidth={3} />{t.start}</KidButton>} />
      </KidsShell>
    );
  }
  const n = reward.stars;
  const sticker = ach.data;
  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={totalStars(user)}>
      <div className="relative mx-auto grid w-full max-w-5xl flex-1 content-start items-center gap-4 text-center md:grid-cols-2 md:content-center md:gap-10">
        <Confetti className="absolute inset-x-0 -top-4 h-[22rem] w-full md:inset-y-0 md:end-auto md:h-full md:w-1/2" />

        {/* Stars bursting: the earned ones bright, the others dim */}
        <div className="relative mx-auto grid size-44 place-items-center md:size-96" role="img" aria-label={t.earned(n)}>
          <Burst className="absolute inset-0 size-full" />
          <div className="relative flex items-end">
            <BigStar className="size-14 -rotate-12 md:size-28" dim={n < 1} />
            <BigStar className="-mx-2 mb-5 size-20 md:mb-10 md:size-36" dim={n < 2} />
            <BigStar className="size-14 rotate-12 md:size-28" dim={n < 3} />
          </div>
        </div>

        <div className="relative flex min-w-0 flex-col items-center gap-4 md:gap-8">
          <div className="flex items-center gap-4">
            <p className="text-3xl font-extrabold leading-tight md:text-4xl">{t.earned(n)}</p>
            <SpeakButton label={t.hear(n, reward.title)} onPress={() => speak(t.hear(n, reward.title), lang)} />
          </div>
          {reward.total > 0 && <p className="text-[19px] font-bold text-muted-foreground">{t.right(reward.right, reward.total)}</p>}

          {/* The lesson sticker (server achievement), when it loaded */}
          {sticker && (
            <div className="flex max-w-full items-center gap-4 rounded-[2rem] border-2 bg-card py-3 ps-3 pe-6">
              <FruitSticker className={`size-24 shrink-0 -rotate-6 drop-shadow-md md:size-36 ${sticker.unlocked ? '' : 'opacity-40 grayscale'}`} />
              <div className="flex min-w-0 flex-col items-start gap-1">
                {sticker.unlocked && <span className="whitespace-nowrap rounded-full bg-primary px-4 text-lg font-extrabold text-primary-foreground md:text-xl">{t.sticker}</span>}
                <span className="text-xl font-bold text-muted-foreground">{t.stickerName}</span>
                {!sticker.unlocked && <span className="text-[18px] font-bold text-muted-foreground">{t.toGo(sticker.progress, sticker.target)}</span>}
              </div>
            </div>
          )}

          {reward.nextId ? (
            <KidButton className="w-full max-w-sm text-2xl md:text-3xl" onPress={() => go(lessonPath(reward.courseId, reward.nextId!))}>
              {t.nextLesson}<Dir><ArrowRight strokeWidth={3} /></Dir>
            </KidButton>
          ) : (
            <KidButton className="w-full max-w-sm text-2xl md:text-3xl" onPress={() => go('/kids')}>
              <Home strokeWidth={3} />{t.goHome}
            </KidButton>
          )}
        </div>
      </div>
    </KidsShell>
  );
}
