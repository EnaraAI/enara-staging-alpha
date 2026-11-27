// Student navigation shared by every student screen (AppShell: bottom tabs on phone, side rail on desktop).
// Every tab goes to a real route. There is no profile screen yet, so the fifth tab is the live tutor.
import { BarChart3, ClipboardList, Home, MessageCircle, Video } from 'lucide-react';
import { num, usePreview, useT } from '@/lib/preview';
import type { NavItem } from '@/components/shell';

const T = {
  en: { home: 'Home', tutor: 'Tutor', work: 'Assignments', results: 'Results', live: 'Live tutor' },
  ar: { home: 'الرئيسية', tutor: 'المعلّم', work: 'الواجبات', results: 'النتائج', live: 'المعلّم المرئي' },
};

export type StudentTab = 'home' | 'tutor' | 'work' | 'results' | 'live';

/** workBadge: open assignments, only where a screen has loaded them (never a made-up number). */
export function useStudentNav(opts: { workBadge?: number } = {}): NavItem[] {
  const t = useT(T);
  const { lang } = usePreview();
  return [
    { id: 'home', label: t.home, icon: <Home />, href: '#/student' },
    { id: 'tutor', label: t.tutor, icon: <MessageCircle />, href: '#/student/chat' },
    { id: 'work', label: t.work, icon: <ClipboardList />, href: '#/student/assignment', ...(opts.workBadge ? { badge: num(opts.workBadge, lang) } : {}) },
    { id: 'results', label: t.results, icon: <BarChart3 />, href: '#/student/results' },
    { id: 'live', label: t.live, icon: <Video />, href: '#/student/avatar' },
  ];
}
