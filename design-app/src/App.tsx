import { useEffect, useMemo, useState } from 'react';
import { PreviewContext, type Lang, type PreviewState } from '@/lib/preview';
import { SessionProvider, homeFor, useSession, type Role } from '@/lib/session';
import { SCREENS } from '@/screens/registry';

// Real routes (hash-based, so the static host needs no rewrites): #/login, #/student/chat, #/parent/fees …
// Each route maps to one approved screen; an area is open only to its roles.
export const ROUTES: Record<string, string> = {
  '/login': 'login', '/parent-code': 'parent-code',
  '/student': 'student-home', '/student/chat': 'student-chat', '/student/avatar': 'student-avatar', '/student/assignment': 'student-assignment', '/student/results': 'student-results',
  '/kids': 'kids-home', '/kids/lesson': 'kids-lesson', '/kids/chat': 'kids-chat', '/kids/reward': 'kids-reward',
  '/parent': 'parent-home', '/parent/progress': 'parent-progress', '/parent/fees': 'parent-fees', '/parent/bus': 'parent-bus', '/parent/attendance': 'parent-attendance', '/parent/chat': 'parent-chat',
  '/teacher': 'teacher-class', '/teacher/grading': 'teacher-grading', '/teacher/builder': 'teacher-builder', '/teacher/errors': 'teacher-errors',
  '/school': 'school-dashboard', '/school/imports': 'school-imports', '/school/announcements': 'school-announcements', '/school/requests': 'school-requests', '/school/sections': 'school-sections',
  '/platform': 'platform-schools', '/platform/usage': 'platform-usage', '/platform/models': 'platform-models',
};
const AREA_ROLES: Record<string, Role[]> = {
  student: ['student'], kids: ['student'], parent: ['parent'], teacher: ['teacher', 'admin'],
  school: ['admin', 'academic_manager', 'enara-admin'], platform: ['enara-admin'],
};
/** Screens already wired to the lms-test API (each area lists its own in screens/<area>/wired.ts). The rest show sample data. */
import { wired as wShared } from '@/screens/shared/wired';
import { wired as wStudent } from '@/screens/student/wired';
import { wired as wKids } from '@/screens/kids/wired';
import { wired as wParent } from '@/screens/parent/wired';
import { wired as wTeacher } from '@/screens/teacher/wired';
import { wired as wSchool } from '@/screens/school/wired';
import { wired as wPlatform } from '@/screens/platform/wired';
export const WIRED = new Set<string>([...wShared, ...wStudent, ...wKids, ...wParent, ...wTeacher, ...wSchool, ...wPlatform]);

const LANG_KEY = 'enara_design_lang';
function parse() {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = h.split('?');
  const q = new URLSearchParams(query);
  let lang: Lang | null = q.get('lang') === 'ar' ? 'ar' : q.get('lang') === 'en' ? 'en' : null;
  if (lang) { try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ } }
  else { try { lang = localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en'; } catch { lang = 'en'; } }
  return { path: path.replace(/\/$/, '') || '/', lang, dark: q.get('dark') === '1', query: q };
}
export const go = (path: string) => { window.location.hash = '#' + path; };
export function setLang(lang: Lang) { try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ } window.dispatchEvent(new HashChangeEvent('hashchange')); }

export default function App() { return <SessionProvider><Router /></SessionProvider>; }

function Router() {
  const [route, setRoute] = useState(parse);
  useEffect(() => { const on = () => setRoute(parse()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const { user, ready } = useSession();

  // Where to go: signed out -> login (the parent code page stays open); signed in -> the role's own area only.
  const area = route.path.split('/')[1] ?? '';
  let path = route.path;
  if (ready) {
    if (!user && path !== '/login' && path !== '/parent-code') path = '/login';
    else if (user && (path === '/' || path === '/login' || path === '/parent-code')) path = homeFor(user);
    else if (user && AREA_ROLES[area] && !AREA_ROLES[area].includes(user.role)) path = homeFor(user);
    else if (user && area === 'kids' && user.uiMode !== 'kids') path = homeFor(user);
    else if (user && area === 'student' && user.uiMode === 'kids') path = homeFor(user);
    else if (!ROUTES[path]) path = user ? homeFor(user) : '/login';
  }
  useEffect(() => { if (ready && path !== route.path) window.location.replace('#' + path); }, [ready, path, route.path]);

  const screen = SCREENS.find((s) => s.id === ROUTES[path]) ?? SCREENS.find((s) => s.id === 'login')!;
  const state: PreviewState = useMemo(() => ({ lang: route.lang, theme: screen.theme, dark: route.dark }), [route.lang, route.dark, screen.theme]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = state.lang; el.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    el.dataset.theme = state.theme; el.classList.toggle('dark', state.dark);
    document.title = `${screen.title[state.lang]} · ENARA`;
  }, [state, screen]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">…</div>;
  return (
    <PreviewContext.Provider value={state}>
      <screen.render />
      {!WIRED.has(screen.id) && (
        <div role="note" data-testid="sample-ribbon" className="pointer-events-none fixed inset-x-0 top-2 z-50 mx-auto w-fit rounded-full bg-warning px-3 py-1 text-xs font-bold text-warning-foreground shadow">
          {state.lang === 'ar' ? 'بيانات تجريبية: لم تُربط هذه الشاشة بعد' : 'Sample data: this screen is not wired yet'}
        </div>
      )}
    </PreviewContext.Provider>
  );
}
