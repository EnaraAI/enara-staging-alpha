import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const ClassOverview = lazy(() => import('./ClassOverview'));
const Grading = lazy(() => import('./Grading'));
const Builder = lazy(() => import('./Builder'));
const Errors = lazy(() => import('./Errors'));

export const screens: ScreenDef[] = [
  { id: 'teacher-class', area: 'teacher', theme: 'admin', title: { en: 'Class overview', ar: 'نظرة عامة على الفصل' }, render: ClassOverview },
  { id: 'teacher-grading', area: 'teacher', theme: 'admin', title: { en: 'Grading queue', ar: 'قائمة التصحيح' }, render: Grading },
  { id: 'teacher-builder', area: 'teacher', theme: 'admin', title: { en: 'Assessment builder', ar: 'منشئ التقييمات' }, render: Builder },
  { id: 'teacher-errors', area: 'teacher', theme: 'admin', title: { en: 'Errors to work on', ar: 'أخطاء للعمل عليها' }, render: Errors },
];
