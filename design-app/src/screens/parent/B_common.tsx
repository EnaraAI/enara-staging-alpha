// Shared bits for the parent school screens (fees, bus, attendance) and the gate every parent screen uses for "which child".
import type { ReactNode } from 'react';
import { Bus, CalendarCheck, Receipt } from 'lucide-react';
import { useT } from '@/lib/preview';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ChildSwitcher, childMeta, childTone, useAgeLabel } from './A_shared';
import { ErrorState, NoChildState, PageSkeleton, childName, useST, type Children, type LearnerChip } from './data';

export { ParentShell } from './A_shared';

const T = {
  en: { attendance: 'Attendance', bus: 'Bus', fees: 'Fees', sections: 'School sections' },
  ar: { attendance: 'الحضور', bus: 'الحافلة', fees: 'الرسوم', sections: 'أقسام المدرسة' },
};

/** The child this page is about. With several children it becomes the switcher. */
export function ChildChip({ kids }: { kids: Children }) {
  const age = useAgeLabel();
  const c = kids.child;
  if (!c) return null;
  if (kids.list.length > 1) return <ChildSwitcher kids={kids} />;
  const name = childName(c) || c.name || '';
  const sub = [childMeta(c, age), typeof c.age === 'number' ? c.school : null].filter(Boolean).join(' · ');
  return (
    <span className="inline-flex max-w-full self-start items-center gap-2.5 rounded-full border bg-card py-1 ps-1 pe-4 text-sm shadow-sm" data-testid="child-chip">
      <Avatar name={name || '?'} className="size-8 text-xs" tone={childTone(0)} />
      <span className="min-w-0"><span className="block font-bold leading-tight">{name}</span>{sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}</span>
    </span>
  );
}

/** Attendance · Bus · Fees: the three school screens, one tap apart. */
export function SchoolTabs({ active }: { active: 'attendance' | 'bus' | 'fees' }) {
  const t = useT(T);
  const items = [
    { id: 'attendance', label: t.attendance, href: '#/parent/attendance', icon: <CalendarCheck /> },
    { id: 'bus', label: t.bus, href: '#/parent/bus', icon: <Bus /> },
    { id: 'fees', label: t.fees, href: '#/parent/fees', icon: <Receipt /> },
  ];
  return (
    <nav aria-label={t.sections} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {items.map((x) => (
        <a key={x.id} href={x.href} aria-current={x.id === active ? 'page' : undefined}
          className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold [&_svg]:size-4', x.id === active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {x.icon}{x.label}
        </a>
      ))}
    </nav>
  );
}

/** Loading, error and "no child linked" for the learners list; renders the page once a child is chosen. */
export function ChildGate({ kids, children, skeleton }: { kids: Children; children: (child: LearnerChip) => ReactNode; skeleton?: ReactNode }) {
  const st = useST();
  if (kids.loading) return <>{skeleton ?? <PageSkeleton />}</>;
  if (kids.error) return <ErrorState error={kids.error} onRetry={kids.reload} />;
  if (!kids.child) return (
    <div className="flex flex-col gap-3">
      <NoChildState />
      {kids.hiddenBySchool > 0 && <p className="text-center text-sm text-muted-foreground">{st.hidden}</p>}
    </div>
  );
  return <>{children(kids.child)}</>;
}
