import type { ScreenDef } from '../types';
import KidsHome from './KidsHome';
import KidsLesson from './KidsLesson';
import KidsChat from './KidsChat';
import KidsReward from './KidsReward';

export const screens: ScreenDef[] = [
  { id: 'kids-home', area: 'kids', theme: 'kids', title: { en: 'Kids home', ar: 'الصفحة الرئيسية للأطفال' }, render: KidsHome },
  { id: 'kids-lesson', area: 'kids', theme: 'kids', title: { en: 'Picture lesson', ar: 'درس بالصور' }, render: KidsLesson },
  { id: 'kids-chat', area: 'kids', theme: 'kids', title: { en: 'Kids tutor chat', ar: 'محادثة المعلّم للأطفال' }, render: KidsChat },
  { id: 'kids-reward', area: 'kids', theme: 'kids', title: { en: 'Reward moment', ar: 'لحظة المكافأة' }, render: KidsReward },
];
