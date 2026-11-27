import * as React from 'react';
import { FileSpreadsheet, Inbox, LayoutDashboard, Megaphone, School, Settings, Smartphone } from 'lucide-react';
import { useT } from '@/lib/preview';
import { AdminShell, type NavItem } from '@/components/shell';

const T = {
  en: { school: 'Nile Valley International School (NVIS)', user: 'Ahmed Anwar', dashboard: 'Dashboard', imports: 'Imports', announcements: 'Announcements', requests: 'Requests', parents: 'Parents app', classes: 'Classes', settings: 'Settings' },
  ar: { school: 'مدرسة وادي النيل الدولية', user: 'أحمد أنور', dashboard: 'لوحة المتابعة', imports: 'الاستيراد', announcements: 'الإعلانات', requests: 'الطلبات', parents: 'تطبيق أولياء الأمور', classes: 'الفصول', settings: 'الإعدادات' },
};

export type SchoolNav = 'dashboard' | 'imports' | 'announcements' | 'requests' | 'parents' | 'classes' | 'settings';

/** The school admin shell used by every screen in this area (same school, same user, same navigation). */
export function SchoolShell({ active, title, subtitle, actions, children }: { active: SchoolNav; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useT(T);
  const nav: NavItem[] = [
    { id: 'dashboard', label: t.dashboard, icon: <LayoutDashboard /> },
    { id: 'imports', label: t.imports, icon: <FileSpreadsheet /> },
    { id: 'announcements', label: t.announcements, icon: <Megaphone /> },
    { id: 'requests', label: t.requests, icon: <Inbox />, badge: '6' },
    { id: 'parents', label: t.parents, icon: <Smartphone /> },
    { id: 'classes', label: t.classes, icon: <School /> },
    { id: 'settings', label: t.settings, icon: <Settings /> },
  ];
  return <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={t.school} user={t.user}>{children}</AdminShell>;
}
