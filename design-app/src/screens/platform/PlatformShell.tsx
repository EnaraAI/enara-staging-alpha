import * as React from 'react';
import { Building2, Cpu, Wallet } from 'lucide-react';
import { useT } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { AdminShell, type NavItem } from '@/components/shell';
import { cn } from '@/lib/utils';

const T = {
  en: { scope: 'Workspace', search: 'Search schools…', school: 'ENARA platform', user: 'ENARA admin', schools: 'Schools', usage: 'Usage & budgets', models: 'Models & Mishkat' },
  ar: { scope: 'مساحة العمل', search: 'ابحث عن مدرسة…', school: 'منصة إنارة', user: 'مشرف إنارة', schools: 'المدارس', usage: 'الاستخدام والميزانيات', models: 'النماذج ومشكاة' },
};

// Only screens that exist as routes are in the menu (incidents and settings have no screen yet).
export type PlatformNav = 'schools' | 'usage' | 'models';

/** The platform admin shell used by every screen in this area. */
export function PlatformShell({ active, title, subtitle, actions, children }: { active: PlatformNav; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useT(T);
  const { user } = useSession();
  const nav: NavItem[] = [
    { id: 'schools', label: t.schools, icon: <Building2 />, href: '#/platform' },
    { id: 'usage', label: t.usage, icon: <Wallet />, href: '#/platform/usage' },
    { id: 'models', label: t.models, icon: <Cpu />, href: '#/platform/models' },
  ];
  const who = user?.name?.trim() || user?.email || t.user;
  return (
    <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={t.school} user={who} scopeLabel={t.scope} searchPlaceholder={t.search}>
      {/* Below 1024 px the shell hides its side menu: the same links as a tab row. */}
      <nav aria-label={t.school} className="-mt-1 mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 lg:hidden">
        {nav.map((n) => (
          <a key={n.id} href={n.href} aria-current={n.id === active ? 'page' : undefined}
            className={cn('flex min-h-tap flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-semibold [&_svg]:size-4', n.id === active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            {n.icon}{n.label}
          </a>
        ))}
      </nav>
      {children}
    </AdminShell>
  );
}
