// Student navigation shared by every student screen (AppShell: bottom tabs on phone, side rail on desktop).
import { BarChart3, ClipboardList, Home, MessageCircle, UserRound } from 'lucide-react';
import { useT } from '@/lib/preview';
import type { NavItem } from '@/components/shell';

const T = {
  en: { home: 'Home', tutor: 'Tutor', work: 'Assignments', results: 'Results', me: 'Profile' },
  ar: { home: 'الرئيسية', tutor: 'المعلّم', work: 'الواجبات', results: 'النتائج', me: 'حسابي' },
};

export type StudentTab = 'home' | 'tutor' | 'work' | 'results' | 'me';

export function useStudentNav(): NavItem[] {
  const t = useT(T);
  return [
    { id: 'home', label: t.home, icon: <Home /> },
    { id: 'tutor', label: t.tutor, icon: <MessageCircle /> },
    { id: 'work', label: t.work, icon: <ClipboardList />, badge: '2' },
    { id: 'results', label: t.results, icon: <BarChart3 /> },
    { id: 'me', label: t.me, icon: <UserRound /> },
  ];
}
