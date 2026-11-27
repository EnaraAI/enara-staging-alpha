// Shared pieces for the parent screens of part A: the parent navigation and the child switcher.
import { GraduationCap, Home, MessageCircle, School, UserRound } from 'lucide-react';
import { useT } from '@/lib/preview';
import type { NavItem } from '@/components/shell';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';

const N = {
  en: { home: 'Home', progress: 'Progress', school: 'School', chat: 'Chat', account: 'Account' },
  ar: { home: 'الرئيسية', progress: 'التقدّم', school: 'المدرسة', chat: 'المحادثة', account: 'الحساب' },
};

export function useParentNav(): NavItem[] {
  const t = useT(N);
  return [
    { id: 'home', label: t.home, icon: <Home /> },
    { id: 'progress', label: t.progress, icon: <GraduationCap /> },
    { id: 'school', label: t.school, icon: <School />, badge: '2' },
    { id: 'chat', label: t.chat, icon: <MessageCircle /> },
    { id: 'account', label: t.account, icon: <UserRound /> },
  ];
}

const C = {
  en: { label: 'Choose a child', kids: [{ id: 'omar', name: 'Omar', grade: 'Grade 9' }, { id: 'laila', name: 'Laila', grade: 'Grade 6' }, { id: 'yassin', name: 'Yassin', grade: 'Grade 2' }] },
  ar: { label: 'اختر الابن أو الابنة', kids: [{ id: 'omar', name: 'عمر', grade: 'الصف 9' }, { id: 'laila', name: 'ليلى', grade: 'الصف 6' }, { id: 'yassin', name: 'ياسين', grade: 'الصف 2' }] },
};
const tones: Record<string, string> = {
  omar: 'bg-info-soft text-info', laila: 'bg-accent text-accent-foreground', yassin: 'bg-success-soft text-success',
};

/** Child switcher chips (a single-choice group). Static preview: the selected child is fixed. */
export function ChildSwitcher({ selected = 'laila', className }: { selected?: string; className?: string }) {
  const t = useT(C);
  return (
    <div role="radiogroup" aria-label={t.label} className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0', className)}>
      {t.kids.map((k) => {
        const on = k.id === selected;
        return (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={cn('flex min-h-tap shrink-0 items-center gap-2 rounded-full border py-1 ps-1 pe-4 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card hover:bg-muted')}
          >
            <Avatar name={k.name} className="size-9" tone={on ? 'bg-primary-foreground/15 text-primary-foreground' : tones[k.id]} />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{k.name}</span>
              <span className={cn('text-xs', on ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{k.grade}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
