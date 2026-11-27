// Shared bits for parent part B screens (fees, bus, attendance): the parent AppShell and the child switcher chip.
import type { ReactNode } from 'react';
import { ChevronDown, Home, MessageCircle, School, TrendingUp, UserRound } from 'lucide-react';
import { useT } from '@/lib/preview';
import { AppShell } from '@/components/shell';
import { Avatar } from '@/components/ui';

const T = {
  en: { home: 'Home', progress: 'Progress', school: 'School', chat: 'Chat', account: 'Account', child: 'Laila', childMeta: 'Grade 6 · NVIS', switchChild: 'Switch child' },
  ar: { home: 'الرئيسية', progress: 'التقدّم', school: 'المدرسة', chat: 'المحادثة', account: 'الحساب', child: 'ليلى', childMeta: 'الصف السادس · مدرسة وادي النيل الدولية', switchChild: 'تبديل الابن أو الابنة' },
};

export function ParentShell({ title, subtitle, children, active = 'school', back }: { title: string; subtitle?: string; children: ReactNode; active?: string; back?: boolean }) {
  const t = useT(T);
  const nav = [
    { id: 'home', label: t.home, icon: <Home /> },
    { id: 'progress', label: t.progress, icon: <TrendingUp /> },
    { id: 'school', label: t.school, icon: <School /> },
    { id: 'chat', label: t.chat, icon: <MessageCircle />, badge: '2' },
    { id: 'account', label: t.account, icon: <UserRound /> },
  ];
  return <AppShell title={title} subtitle={subtitle} nav={nav} active={active} back={back}>{children}</AppShell>;
}

/** The child this page is about, with a (static) switcher affordance. */
export function ChildChip() {
  const t = useT(T);
  return (
    <a href="#" aria-label={t.switchChild} className="inline-flex max-w-full self-start items-center gap-2.5 rounded-full border bg-card py-1 ps-1 pe-3 text-sm shadow-sm hover:bg-muted">
      <Avatar name={t.child} className="size-8 bg-accent text-xs text-accent-foreground" tone="bg-accent text-accent-foreground" />
      <span className="min-w-0"><span className="block font-bold leading-tight">{t.child}</span><span className="block truncate text-xs text-muted-foreground">{t.childMeta}</span></span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
