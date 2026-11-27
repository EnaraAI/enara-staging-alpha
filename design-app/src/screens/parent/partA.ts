import type { ScreenDef } from '../types';
import ParentHome from './A_Home';
import ParentProgress from './A_Progress';
import ParentChat from './A_Chat';

export const screens: ScreenDef[] = [
  { id: 'parent-home', area: 'parent', theme: 'learner', title: { en: 'Parent home', ar: 'الصفحة الرئيسية لولي الأمر' }, render: ParentHome },
  { id: 'parent-progress', area: 'parent', theme: 'learner', title: { en: 'Child progress', ar: 'التقدّم الدراسي' }, render: ParentProgress },
  { id: 'parent-chat', area: 'parent', theme: 'learner', title: { en: 'Ask about school', ar: 'اسأل عن المدرسة' }, render: ParentChat },
];
