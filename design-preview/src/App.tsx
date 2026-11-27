import { useEffect, useMemo, useState } from 'react';
import { PreviewContext, type Lang, type PreviewState } from '@/lib/preview';
import { AREAS, SCREENS } from '@/screens/registry';
import { Logo } from '@/components/shell';

// Hash routes: #/ (index)  or  #/s/<screen-id>?lang=ar&dark=1
function parse(): { id: string | null; lang: Lang; dark: boolean } {
  const h = window.location.hash.replace(/^#/, '');
  const [path, query = ''] = h.split('?');
  const q = new URLSearchParams(query);
  const m = path.match(/^\/s\/([\w-]+)/);
  return { id: m ? m[1] : null, lang: q.get('lang') === 'ar' ? 'ar' : 'en', dark: q.get('dark') === '1' };
}

export default function App() {
  const [route, setRoute] = useState(parse);
  useEffect(() => { const on = () => setRoute(parse()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const screen = route.id ? SCREENS.find((s) => s.id === route.id) : null;
  const state: PreviewState = useMemo(() => ({ lang: route.lang, theme: screen?.theme ?? 'learner', dark: route.dark }), [route, screen]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = state.lang; el.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    el.dataset.theme = state.theme; el.classList.toggle('dark', state.dark);
    document.title = screen ? `${screen.title[state.lang]} · ENARA preview` : 'ENARA design preview';
  }, [state, screen]);
  return <PreviewContext.Provider value={state}>{screen ? <screen.render /> : <Index lang={route.lang} />}</PreviewContext.Provider>;
}

function Index({ lang }: { lang: Lang }) {
  const other = lang === 'ar' ? 'en' : 'ar';
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between"><Logo /><a className="text-sm font-semibold text-primary underline" href={`#/?lang=${other}`}>{other === 'ar' ? 'العربية' : 'English'}</a></div>
      <h1 className="mb-1 text-2xl font-bold">{lang === 'ar' ? 'معاينة نظام التصميم' : 'Design system preview'}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{lang === 'ar' ? 'شاشات ثابتة ببيانات تجريبية. لا تتصل بأي خادم.' : 'Static screens with sample data. Nothing here talks to a server.'}</p>
      {AREAS.map((a) => (
        <section key={a.id} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{a[lang]}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SCREENS.filter((s) => s.area === a.id).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <a className="font-semibold hover:underline" href={`#/s/${s.id}?lang=${lang}`}>{s.title[lang]}</a>
                <span className="flex gap-2 text-xs"><a className="text-primary" href={`#/s/${s.id}?lang=en`}>EN</a><a className="text-primary" href={`#/s/${s.id}?lang=ar`}>AR</a><a className="text-primary" href={`#/s/${s.id}?lang=${lang}&dark=1`}>{lang === 'ar' ? 'داكن' : 'dark'}</a></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
