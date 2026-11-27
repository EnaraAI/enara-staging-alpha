import { lazy } from 'react';
import type { ScreenDef } from '../types';
// lms-speed-6: each screen's code loads when its route opens (App.tsx shows a fallback meanwhile).
const SchoolDashboard = lazy(() => import('./Dashboard'));
const SchoolImports = lazy(() => import('./Imports'));
const SchoolAnnouncements = lazy(() => import('./Announcements'));
const SchoolRequests = lazy(() => import('./Requests'));
const SchoolSections = lazy(() => import('./Sections'));

export const screens: ScreenDef[] = [
  { id: 'school-dashboard', area: 'school', theme: 'admin', title: { en: 'Dashboard', ar: 'لوحة المتابعة' }, render: SchoolDashboard },
  { id: 'school-imports', area: 'school', theme: 'admin', title: { en: 'Imports with preview', ar: 'الاستيراد مع المعاينة' }, render: SchoolImports },
  { id: 'school-announcements', area: 'school', theme: 'admin', title: { en: 'Announcements', ar: 'الإعلانات' }, render: SchoolAnnouncements },
  { id: 'school-requests', area: 'school', theme: 'admin', title: { en: 'Requests inbox', ar: 'صندوق الطلبات' }, render: SchoolRequests },
  { id: 'school-sections', area: 'school', theme: 'admin', title: { en: 'Parents app sections', ar: 'أقسام تطبيق أولياء الأمور' }, render: SchoolSections },
];
