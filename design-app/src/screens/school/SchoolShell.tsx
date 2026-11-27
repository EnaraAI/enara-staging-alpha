import * as React from 'react';
import { FileSpreadsheet, Inbox, LayoutDashboard, Megaphone, Smartphone } from 'lucide-react';
import { useT, num, usePreview } from '@/lib/preview';
import { useSession } from '@/lib/session';
import { AdminShell, type NavItem } from '@/components/shell';
import { cn } from '@/lib/utils';
import { n0, useParentsSchool, useRequestCounts, useScope } from './data';

const T = {
  en: { school: 'School', dashboard: 'Dashboard', imports: 'Imports', announcements: 'Announcements', requests: 'Requests', parents: 'Parents app', nav: 'School admin' },
  ar: { school: 'المدرسة', dashboard: 'لوحة المتابعة', imports: 'الاستيراد', announcements: 'الإعلانات', requests: 'الطلبات', parents: 'تطبيق أولياء الأمور', nav: 'إدارة المدرسة' },
};

export type SchoolNav = 'dashboard' | 'imports' | 'announcements' | 'requests' | 'parents';
export const ROUTE: Record<SchoolNav, string> = { dashboard: '/school', imports: '/school/imports', announcements: '/school/announcements', requests: '/school/requests', parents: '/school/sections' };

/** The school admin shell used by every screen in this area: the signed-in user, the school's name, real routes. */
export function SchoolShell({ active, title, subtitle, actions, children }: { active: SchoolNav; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useT(T);
  const { lang } = usePreview();
  const { user } = useSession();
  const scope = useScope();
  // The school's name: GET /api/parents-admin/schools (a school admin sees only their own school). Falls back to "School".
  const mine = useParentsSchool().school;
  const counts = useRequestCounts();
  const open = counts ? n0(counts.new) + n0(counts.in_progress) : 0;
  const nav: NavItem[] = [
    { id: 'dashboard', label: t.dashboard, icon: <LayoutDashboard />, href: scope.href(ROUTE.dashboard) },
    { id: 'imports', label: t.imports, icon: <FileSpreadsheet />, href: scope.href(ROUTE.imports) },
    { id: 'announcements', label: t.announcements, icon: <Megaphone />, href: scope.href(ROUTE.announcements) },
    { id: 'requests', label: t.requests, icon: <Inbox />, href: scope.href(ROUTE.requests), ...(open > 0 ? { badge: num(open, lang) } : {}) },
    { id: 'parents', label: t.parents, icon: <Smartphone />, href: scope.href(ROUTE.parents) },
  ];
  return (
    <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={mine?.name || t.school} user={user?.name || user?.email || ''}>
      {/* Phone and tablet: the side navigation is hidden below lg, so the same links scroll in a row here. */}
      <nav aria-label={t.nav} className="-mx-4 -mt-1 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
        {nav.map((n) => (
          <a key={n.id} href={n.href} aria-current={n.id === active ? 'page' : undefined}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold [&_svg]:size-3.5', n.id === active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
            {n.icon}{n.label}{n.badge && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', n.id === active ? 'bg-primary-foreground/20' : 'bg-accent text-accent-foreground')}>{n.badge}</span>}
          </a>
        ))}
      </nav>
      {children}
    </AdminShell>
  );
}
