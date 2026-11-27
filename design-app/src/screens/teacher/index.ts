import type { ScreenDef } from '../types';
import ClassOverview from './ClassOverview';
import Grading from './Grading';
import Builder from './Builder';
import Errors from './Errors';

export const screens: ScreenDef[] = [
  { id: 'teacher-class', area: 'teacher', theme: 'admin', title: { en: 'Class overview', ar: 'نظرة عامة على الفصل' }, render: ClassOverview },
  { id: 'teacher-grading', area: 'teacher', theme: 'admin', title: { en: 'Grading queue', ar: 'قائمة التصحيح' }, render: Grading },
  { id: 'teacher-builder', area: 'teacher', theme: 'admin', title: { en: 'Assessment builder', ar: 'منشئ التقييمات' }, render: Builder },
  { id: 'teacher-errors', area: 'teacher', theme: 'admin', title: { en: 'Errors to work on', ar: 'أخطاء للعمل عليها' }, render: Errors },
];
