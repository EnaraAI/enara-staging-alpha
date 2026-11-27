import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const PlatformSchools = lazy(() => import('./Schools'));
const PlatformUsage = lazy(() => import('./Usage'));
const PlatformModels = lazy(() => import('./Models'));

export const screens: ScreenDef[] = [
  { id: 'platform-schools', area: 'platform', theme: 'admin', title: { en: 'Schools', ar: 'المدارس' }, render: PlatformSchools },
  { id: 'platform-usage', area: 'platform', theme: 'admin', title: { en: 'Usage and budgets', ar: 'الاستخدام والميزانيات' }, render: PlatformUsage },
  { id: 'platform-models', area: 'platform', theme: 'admin', title: { en: 'Mishkat and model status', ar: 'حالة مشكاة والنماذج' }, render: PlatformModels },
];
