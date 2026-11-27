import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
import Login from './Login';
import ParentCode from './ParentCode';
const EmptyStates = lazy(() => import('./EmptyStates'));
const ErrorStates = lazy(() => import('./ErrorStates'));

export const screens: ScreenDef[] = [
  { id: 'login', area: 'shared', theme: 'learner', title: { en: 'Login', ar: 'تسجيل الدخول' }, render: Login },
  { id: 'parent-code', area: 'shared', theme: 'learner', title: { en: 'Parent code entry', ar: 'إدخال رمز ولي الأمر' }, render: ParentCode },
  { id: 'empty-states', area: 'shared', theme: 'learner', title: { en: 'Empty states', ar: 'الحالات الفارغة' }, render: EmptyStates },
  { id: 'error-states', area: 'shared', theme: 'learner', title: { en: 'Error states', ar: 'حالات الخطأ' }, render: ErrorStates },
];
