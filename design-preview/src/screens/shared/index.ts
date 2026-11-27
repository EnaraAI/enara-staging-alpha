import type { ScreenDef } from '../types';
import Login from './Login';

export const screens: ScreenDef[] = [
  { id: 'login', area: 'shared', theme: 'learner', title: { en: 'Login', ar: 'تسجيل الدخول' }, render: Login },
];
