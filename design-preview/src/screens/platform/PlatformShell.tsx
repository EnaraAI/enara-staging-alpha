import * as React from 'react';
import { Building2, Cpu, Settings, Siren, Wallet } from 'lucide-react';
import { useT } from '@/lib/preview';
import { AdminShell, type NavItem } from '@/components/shell';

const T = {
  en: { scope: 'Workspace', search: 'Search schools, incidents…', school: 'ENARA platform', user: 'Mariam Shawky', schools: 'Schools', usage: 'Usage & budgets', models: 'Models & Mishkat', incidents: 'Incidents', settings: 'Settings' },
  ar: { scope: 'مساحة العمل', search: 'ابحث عن مدرسة أو عطل…', school: 'منصة إنارة', user: 'مريم شوقي', schools: 'المدارس', usage: 'الاستخدام والميزانيات', models: 'النماذج ومشكاة', incidents: 'الأعطال', settings: 'الإعدادات' },
};

export type PlatformNav = 'schools' | 'usage' | 'models' | 'incidents' | 'settings';

/** The platform admin shell used by every screen in this area. */
export function PlatformShell({ active, title, subtitle, actions, children }: { active: PlatformNav; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useT(T);
  const nav: NavItem[] = [
    { id: 'schools', label: t.schools, icon: <Building2 /> },
    { id: 'usage', label: t.usage, icon: <Wallet /> },
    { id: 'models', label: t.models, icon: <Cpu /> },
    { id: 'incidents', label: t.incidents, icon: <Siren />, badge: '1' },
    { id: 'settings', label: t.settings, icon: <Settings /> },
  ];
  return <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={t.school} user={t.user} scopeLabel={t.scope} searchPlaceholder={t.search}>{children}</AdminShell>;
}
