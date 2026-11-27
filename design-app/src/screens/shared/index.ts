import type { ScreenDef } from '../types';
import Login from './Login';
import ParentCode from './ParentCode';
import EmptyStates from './EmptyStates';
import ErrorStates from './ErrorStates';

export const screens: ScreenDef[] = [
  { id: 'login', area: 'shared', theme: 'learner', title: { en: 'Login', ar: 'تسجيل الدخول' }, render: Login },
  { id: 'parent-code', area: 'shared', theme: 'learner', title: { en: 'Parent code entry', ar: 'إدخال رمز ولي الأمر' }, render: ParentCode },
  { id: 'empty-states', area: 'shared', theme: 'learner', title: { en: 'Empty states', ar: 'الحالات الفارغة' }, render: EmptyStates },
  { id: 'error-states', area: 'shared', theme: 'learner', title: { en: 'Error states', ar: 'حالات الخطأ' }, render: ErrorStates },
];
