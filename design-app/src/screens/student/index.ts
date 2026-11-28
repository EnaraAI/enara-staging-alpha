import { lazyScreen } from '../lazyScreen';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const StudentHome = lazyScreen(() => import('./StudentHome'));
const StudentChat = lazyScreen(() => import('./StudentChat'));
const StudentAvatar = lazyScreen(() => import('./StudentAvatar'));
const StudentAssignment = lazyScreen(() => import('./StudentAssignment'));
const StudentResults = lazyScreen(() => import('./StudentResults'));

export const screens: ScreenDef[] = [
  { id: 'student-home', area: 'student', theme: 'learner', title: { en: 'Student home', ar: 'الصفحة الرئيسية للطالب' }, render: StudentHome },
  { id: 'student-chat', area: 'student', theme: 'learner', title: { en: 'Tutor chat', ar: 'المحادثة مع المعلّم' }, render: StudentChat },
  { id: 'student-avatar', area: 'student', theme: 'learner', title: { en: 'Avatar session', ar: 'جلسة المعلّم المرئي' }, render: StudentAvatar },
  { id: 'student-assignment', area: 'student', theme: 'learner', title: { en: 'Assignment', ar: 'الواجب' }, render: StudentAssignment },
  { id: 'student-results', area: 'student', theme: 'learner', title: { en: 'Results', ar: 'النتائج' }, render: StudentResults },
];
