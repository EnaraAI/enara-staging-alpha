import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const Fees = lazy(() => import('./B_Fees'));
const Bus = lazy(() => import('./B_Bus'));
const Attendance = lazy(() => import('./B_Attendance'));

export const screens: ScreenDef[] = [
  { id: 'parent-fees', area: 'parent', theme: 'learner', title: { en: 'Fees', ar: 'الرسوم' }, render: Fees },
  { id: 'parent-bus', area: 'parent', theme: 'learner', title: { en: 'Bus', ar: 'الحافلة' }, render: Bus },
  { id: 'parent-attendance', area: 'parent', theme: 'learner', title: { en: 'Attendance', ar: 'الحضور' }, render: Attendance },
];
