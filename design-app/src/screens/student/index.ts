import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const StudentHome = lazy(() => import('./StudentHome'));
const StudentChat = lazy(() => import('./StudentChat'));
const StudentAvatar = lazy(() => import('./StudentAvatar'));
const StudentAssignment = lazy(() => import('./StudentAssignment'));
const StudentResults = lazy(() => import('./StudentResults'));

export const screens: ScreenDef[] = [
  { id: 'student-home', area: 'student', theme: 'learner', title: { en: 'Student home', ar: 'الصفحة الرئيسية للطالب' }, render: StudentHome },
  { id: 'student-chat', area: 'student', theme: 'learner', title: { en: 'Tutor chat', ar: 'المحادثة مع المعلّم' }, render: StudentChat },
  { id: 'student-avatar', area: 'student', theme: 'learner', title: { en: 'Avatar session', ar: 'جلسة المعلّم المرئي' }, render: StudentAvatar },
  { id: 'student-assignment', area: 'student', theme: 'learner', title: { en: 'Assignment', ar: 'الواجب' }, render: StudentAssignment },
  { id: 'student-results', area: 'student', theme: 'learner', title: { en: 'Results', ar: 'النتائج' }, render: StudentResults },
];
