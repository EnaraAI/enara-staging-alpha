import type { ScreenDef } from '../types';
import SchoolDashboard from './Dashboard';
import SchoolImports from './Imports';
import SchoolAnnouncements from './Announcements';
import SchoolRequests from './Requests';
import SchoolSections from './Sections';

export const screens: ScreenDef[] = [
  { id: 'school-dashboard', area: 'school', theme: 'admin', title: { en: 'Dashboard', ar: 'لوحة المتابعة' }, render: SchoolDashboard },
  { id: 'school-imports', area: 'school', theme: 'admin', title: { en: 'Imports with preview', ar: 'الاستيراد مع المعاينة' }, render: SchoolImports },
  { id: 'school-announcements', area: 'school', theme: 'admin', title: { en: 'Announcements', ar: 'الإعلانات' }, render: SchoolAnnouncements },
  { id: 'school-requests', area: 'school', theme: 'admin', title: { en: 'Requests inbox', ar: 'صندوق الطلبات' }, render: SchoolRequests },
  { id: 'school-sections', area: 'school', theme: 'admin', title: { en: 'Parents app sections', ar: 'أقسام تطبيق أولياء الأمور' }, render: SchoolSections },
];
