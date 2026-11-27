import { ArrowRight } from 'lucide-react';
import { useT } from '@/lib/preview';
import { KidsShell } from '@/components/shell';
import { KidButton, SpeakButton } from '@/components/ui/kids';
import { Dir } from '@/components/ui';
import { BigStar, Burst, Confetti, FruitSticker } from './art';

const T = {
  en: {
    home: 'Home', listen: 'Listen', earned: 'You earned 3 stars!', hear: 'Hear: you earned 3 stars and a new sticker',
    sticker: 'New sticker!', stickerName: 'Fruit friend', next: 'Next',
  },
  ar: {
    home: 'الرئيسية', listen: 'استمع', earned: 'ربحتَ 3 نجوم!', hear: 'استمع: ربحتَ 3 نجوم وملصقًا جديدًا',
    sticker: 'ملصق جديد!', stickerName: 'صديق الفواكه', next: 'التالي',
  },
};

export default function KidsReward() {
  const t = useT(T);
  return (
    <KidsShell homeLabel={t.home} listenLabel={t.listen} stars={27}>
      <div className="relative mx-auto grid w-full max-w-5xl flex-1 content-start items-center gap-4 text-center md:grid-cols-2 md:content-center md:gap-10">
        <Confetti className="absolute inset-x-0 -top-4 h-[22rem] w-full md:inset-y-0 md:end-auto md:h-full md:w-1/2" />

        {/* Stars bursting */}
        <div className="relative mx-auto grid size-44 place-items-center md:size-96">
          <Burst className="absolute inset-0 size-full" />
          <div className="relative flex items-end">
            <BigStar className="size-14 -rotate-12 md:size-28" />
            <BigStar className="-mx-2 mb-5 size-20 md:mb-10 md:size-36" />
            <BigStar className="size-14 rotate-12 md:size-28" />
          </div>
        </div>

        <div className="relative flex flex-col items-center gap-4 md:gap-8">
          <div className="flex items-center gap-4">
            <p className="text-3xl font-extrabold leading-tight md:text-4xl">{t.earned}</p>
            <SpeakButton label={t.hear} />
          </div>

          {/* The new sticker */}
          <div className="flex items-center gap-4 rounded-[2rem] border-2 bg-card py-3 ps-3 pe-6">
            <FruitSticker className="size-24 shrink-0 -rotate-6 drop-shadow-md md:size-36" />
            <div className="flex flex-col items-start gap-1">
              <span className="whitespace-nowrap rounded-full bg-primary px-4 text-lg font-extrabold text-primary-foreground md:text-xl">{t.sticker}</span>
              <span className="text-xl font-bold text-muted-foreground">{t.stickerName}</span>
            </div>
          </div>

          <KidButton className="w-full max-w-sm text-2xl md:text-3xl">
            {t.next}<Dir><ArrowRight strokeWidth={3} /></Dir>
          </KidButton>
        </div>
      </div>
    </KidsShell>
  );
}
