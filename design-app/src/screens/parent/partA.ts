import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const ParentHome = lazy(() => import('./A_Home'));
const ParentProgress = lazy(() => import('./A_Progress'));
const ParentChat = lazy(() => import('./A_Chat'));

export const screens: ScreenDef[] = [
  { id: 'parent-home', area: 'parent', theme: 'learner', title: { en: 'Parent home', ar: 'الصفحة الرئيسية لولي الأمر' }, render: ParentHome },
  { id: 'parent-progress', area: 'parent', theme: 'learner', title: { en: 'Child progress', ar: 'التقدّم الدراسي' }, render: ParentProgress },
  { id: 'parent-chat', area: 'parent', theme: 'learner', title: { en: 'Ask about school', ar: 'اسأل عن المدرسة' }, render: ParentChat },
];
