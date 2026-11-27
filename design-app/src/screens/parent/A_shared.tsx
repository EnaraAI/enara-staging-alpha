// Shared pieces for every parent screen: the parent navigation (real routes), the header bell (real unread count),
// the parent shell, and the child switcher built from /api/parents/learners.
import type { ReactNode } from 'react';
import { Bell, GraduationCap, Home, MessageCircle, School } from 'lucide-react';
import { get } from '@/lib/api';
import { useT } from '@/lib/preview';
import { AppShell, type NavItem } from '@/components/shell';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { childName, ep, optional, useLoad, type Children, type LearnerChip, type NotificationsResp } from './data';

const N = {
  en: { home: 'Home', progress: 'Progress', school: 'School', chat: 'Chat', notif: 'Notifications', unread: (n: number) => `${n} unread`, label: 'Choose a child', age: (n: number) => `${n} years` },
  ar: { home: 'الرئيسية', progress: 'التقدّم', school: 'المدرسة', chat: 'المحادثة', notif: 'الإشعارات', unread: (n: number) => `${n} غير مقروءة`, label: 'اختر الابن أو الابنة', age: (n: number) => `${n} سنة` },
};

export type ParentNavId = 'home' | 'progress' | 'school' | 'chat';
export function useParentNav(): NavItem[] {
  const t = useT(N);
  return [
    { id: 'home', label: t.home, icon: <Home />, href: '#/parent' },
    { id: 'progress', label: t.progress, icon: <GraduationCap />, href: '#/parent/progress' },
    { id: 'school', label: t.school, icon: <School />, href: '#/parent/attendance' },
    { id: 'chat', label: t.chat, icon: <MessageCircle />, href: '#/parent/chat' },
  ];
}

/** The header bell: a dot only when the parent really has unread school notifications. Hidden when notifications are off. */
export function ParentBell() {
  const t = useT(N);
  const q = useLoad((signal) => optional(get<NotificationsResp>(ep.notifications, signal)), []);
  if (!q.data) return null;
  const unread = q.data.unread ?? 0;
  return (
    <a href="#/parent" aria-label={unread ? `${t.notif} · ${t.unread(unread)}` : t.notif} className="relative grid size-tap place-items-center rounded-full hover:bg-muted" data-testid="parent-bell">
      <Bell className="size-5" />{unread > 0 && <span className="absolute end-2 top-2 size-2 rounded-full bg-destructive" />}
    </a>
  );
}

export function ParentShell({ title, subtitle, active, children, bottomBar }: { title: string; subtitle?: string; active: ParentNavId; children: ReactNode; bottomBar?: ReactNode }) {
  const nav = useParentNav();
  return <AppShell nav={nav} active={active} title={title} subtitle={subtitle} actions={<ParentBell />} bottomBar={bottomBar}>{children}</AppShell>;
}

const TONES = ['bg-info-soft text-info', 'bg-accent text-accent-foreground', 'bg-success-soft text-success', 'bg-warning-soft text-warning-foreground'];
export const childTone = (i: number) => TONES[Math.max(0, i) % TONES.length];
export const childMeta = (k: LearnerChip, age: (n: number) => string) => (typeof k.age === 'number' ? age(k.age) : k.school ?? '');
export const useAgeLabel = () => useT(N).age;

/** Child switcher chips (a single-choice group). The choice is remembered on this device. Nothing shows for one child unless `always`. */
export function ChildSwitcher({ kids, className, always }: { kids: Children; className?: string; always?: boolean }) {
  const t = useT(N);
  if (!kids.list.length || (kids.list.length < 2 && !always)) return null;
  return (
    <div role="radiogroup" aria-label={t.label} className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0', className)} data-testid="child-switcher">
      {kids.list.map((k, i) => {
        const on = k.studentId === kids.child?.studentId;
        const name = childName(k) || k.name || '';
        const sub = childMeta(k, t.age);
        return (
          <button
            key={k.studentId}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => kids.select(k.studentId)}
            className={cn('flex min-h-tap shrink-0 items-center gap-2 rounded-full border py-1 ps-1 pe-4 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card hover:bg-muted')}
          >
            <Avatar name={name || '?'} className="size-9" tone={on ? 'bg-primary-foreground/15 text-primary-foreground' : childTone(i)} />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{name}</span>
              {sub && <span className={cn('max-w-40 truncate text-xs', on ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
