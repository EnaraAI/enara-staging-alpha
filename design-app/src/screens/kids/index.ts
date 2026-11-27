import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const KidsHome = lazy(() => import('./KidsHome'));
const KidsLesson = lazy(() => import('./KidsLesson'));
const KidsChat = lazy(() => import('./KidsChat'));
const KidsReward = lazy(() => import('./KidsReward'));

export const screens: ScreenDef[] = [
  { id: 'kids-home', area: 'kids', theme: 'kids', title: { en: 'Kids home', ar: 'الصفحة الرئيسية للأطفال' }, render: KidsHome },
  { id: 'kids-lesson', area: 'kids', theme: 'kids', title: { en: 'Picture lesson', ar: 'درس بالصور' }, render: KidsLesson },
  { id: 'kids-chat', area: 'kids', theme: 'kids', title: { en: 'Kids tutor chat', ar: 'محادثة المعلّم للأطفال' }, render: KidsChat },
  { id: 'kids-reward', area: 'kids', theme: 'kids', title: { en: 'Reward moment', ar: 'لحظة المكافأة' }, render: KidsReward },
];
