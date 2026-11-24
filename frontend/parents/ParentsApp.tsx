import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './parents.css';
import type { Lang } from './i18n';
import { parentsApi, schoolApi, type LearnerChip } from './api';
import { Avatar, Icon, Loading, ParentsCtx, makeCtx, ErrorBox } from './ui';
import { StatusLine, Updated } from './shared';
import { useLive } from './useLive';
import { Home } from './screens/Home';
import { Progress } from './screens/Progress';
import { Activity } from './screens/Activity';
import { Controls } from './screens/Controls';
import { Account } from './screens/Account';
import { LinkChild } from './screens/LinkChild';
import { ShareSheet } from './screens/ShareSheet';
import { AddEmail } from './screens/AddEmail';
import { ALL, SubjectChips } from './screens/Subjects';
import { School, SchoolHomeCard, type SchoolView } from './screens/School';

// ENARA Parents Portal: a parent mode inside the ENARA app, under /parents.
// Mobile-first; English and Arabic with full RTL; week starts Saturday;
// times in Africa/Cairo; live data on every visit, focus and pull-to-refresh.

const TABS = ['home', 'progress', 'activity', 'controls', 'account', 'school'] as const;
type Tab = (typeof TABS)[number] | 'link';
const LANG_KEY = 'enara_parents_lang';
const LEARNER_KEY = 'enara_parents_learner';
const LINK_INTENT_KEY = 'enara_parent_link_intent';
const EMAIL_PROMPT_KEY = 'enara_parent_email_prompt_dismissed';

const read = (k: string, store: 'local' | 'session' = 'local') => { try { return (store === 'local' ? localStorage : sessionStorage).getItem(k); } catch { return null; } };
const write = (k: string, v: string | null, store: 'local' | 'session' = 'local') => { try { const s = store === 'local' ? localStorage : sessionStorage; if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* storage unavailable */ } };

function tabFromPath(): Tab {
  const seg = window.location.pathname.replace(/^\/parents\/?/, '').split('/')[0];
  if (seg === 'link') return 'link';
  return (TABS as readonly string[]).includes(seg) ? (seg as Tab) : 'home';
}

function usePwaHead(lang: Lang) {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); added.push(el); };
    add('link', { rel: 'manifest', href: '/parents.webmanifest' });
    add('meta', { name: 'theme-color', content: '#0b203c' });
    add('link', { rel: 'apple-touch-icon', href: '/parents-icon.svg' });
    add('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap' });
    const prevTitle = document.title;
    return () => { added.forEach((el) => el.remove()); document.title = prevTitle; };
  }, []);
  useEffect(() => {
    document.title = lang === 'ar' ? 'إنارة لأولياء الأمور' : 'ENARA Parents';
    const html = document.documentElement;
    const prev = { lang: html.lang, dir: html.dir };
    html.lang = lang; html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    return () => { html.lang = prev.lang; html.dir = prev.dir; };
  }, [lang]);
}

const ParentsApp: React.FC<{ userName?: string; onSignOut: () => void }> = ({ onSignOut }) => {
  const [lang, setLangState] = useState<Lang>(() => (read(LANG_KEY) === 'ar' ? 'ar' : 'en'));
  const setLang = (l: Lang) => { setLangState(l); write(LANG_KEY, l); };
  const ctx = useMemo(() => makeCtx(lang), [lang]);
  const { t, n } = ctx;
  usePwaHead(lang);

  // P0 item 4 (D15): a link code is never taken from the URL; the parent types
  // it. An old link that still carries ?code= opens the code screen, and the
  // code is dropped from the address bar (and so from history) unread.
  const codeInUrl = useMemo(() => new URLSearchParams(window.location.search).has('code'), []);
  useEffect(() => {
    if (!codeInUrl) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('code');
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
  }, [codeInUrl]);
  const [tab, setTab] = useState<Tab>(() => (read(LINK_INTENT_KEY, 'session') === '1' || codeInUrl ? 'link' : tabFromPath()));
  useEffect(() => { write(LINK_INTENT_KEY, null, 'session'); }, []);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [sharing, setSharing] = useState(false);

  const learners = useLive(() => parentsApi.learners(), [], refreshKey);
  // Parents P2: "Add your email" until the account has one (dismissed for this visit only: it comes back).
  const account = useLive(() => parentsApi.account(), [], refreshKey);
  const [emailPromptDismissed, setEmailPromptDismissed] = useState(() => read(EMAIL_PROMPT_KEY, 'session') === '1');
  const signIn = account.data?.signIn;
  const showEmailPrompt = !!signIn?.emailSignin && !signIn.hasEmail && !emailPromptDismissed;
  const list = learners.data?.learners ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(() => read(LEARNER_KEY));
  const learner: LearnerChip | undefined = list.find((l) => l.studentId === selectedId) ?? list[0];
  useEffect(() => { if (learner) write(LEARNER_KEY, learner.studentId); }, [learner?.studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = useLive(() => (learner ? parentsApi.status(learner.studentId).then((r) => r.status) : Promise.resolve(null)), [learner?.studentId], refreshKey);
  // All subjects: the chips under the child picker (none when the server has the feature off: 404).
  const subjects = useLive(() => (learner ? parentsApi.subjects(learner.studentId).catch(() => null) : Promise.resolve(null)), [learner?.studentId], refreshKey);
  const [subject, setSubject] = useState<string>(ALL);
  useEffect(() => { setSubject(ALL); }, [learner?.studentId]);
  const subjectList = subjects.data?.subjects ?? [];
  const chosen = subject === ALL ? null : subjectList.find((x) => x.key === subject) ?? null;
  const subjectKey = chosen ? chosen.key : ALL;
  // Parents school app (a): the School tab and the bell appear only when the site and the child's school have a section on.
  const school = useLive(() => (learner ? schoolApi.overview(learner.studentId).catch(() => null) : Promise.resolve(null)), [learner?.studentId], refreshKey);
  const schoolOn = !!school.data && Object.values(school.data.sections).some(Boolean);
  const unread = school.data?.unreadNotifications ?? 0;
  const [schoolView, setSchoolView] = useState<SchoolView>('today');
  const tabs = TABS.filter((k) => k !== 'school' || schoolOn);
  const [screenFetched, setScreenFetched] = useState<{ at: Date | null; loading: boolean }>({ at: null, loading: false });
  const onFetched = useCallback((at: Date | null, loading: boolean) => setScreenFetched({ at, loading }), []);
  useEffect(() => { setScreenFetched({ at: null, loading: false }); }, [tab, learner?.studentId]);

  const go = (next: Tab) => {
    setTab(next);
    const path = next === 'home' ? '/parents' : `/parents/${next}`;
    if (window.location.pathname !== path) window.history.pushState({ tab: next }, '', path);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => setTab(tabFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Pull to refresh (touch): drag down from the top of the page.
  const pull = useRef<{ y: number; active: boolean }>({ y: 0, active: false });
  const [pullPx, setPullPx] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => { pull.current = { y: e.touches[0].clientY, active: window.scrollY <= 0 }; };
  const onTouchMove = (e: React.TouchEvent) => { if (pull.current.active) setPullPx(Math.max(0, Math.min(80, e.touches[0].clientY - pull.current.y))); };
  const onTouchEnd = () => { if (pullPx >= 64) refresh(); setPullPx(0); pull.current.active = false; };

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const noLearners = learners.data && list.length === 0;
  const showLink = tab === 'link' || noLearners;
  const fetched = screenFetched.at ?? status.fetchedAt;

  const nav = (
    <nav className="pp-nav" aria-label={t.main}>
      {tabs.map((k) => (
        <button type="button" key={k} className="pp-navlink" aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>
          <Icon name={k} />{t.tabs[k]}
        </button>
      ))}
    </nav>
  );

  return (
    <ParentsCtx.Provider value={ctx}>
      <div className="pp" dir={dir} lang={lang} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <header className="pp-header">
          <div className="pp-brand"><b>{t.brand}</b><span>{t.parents}</span></div>
          <div className="pp-head-actions">
            {schoolOn && school.data?.sections.notifications && (
              <button type="button" className="pp-iconbtn pp-bell" data-testid="pp-bell" aria-label={t.sch.bell(n(unread))} onClick={() => { setSchoolView('notifications'); go('school'); }}>
                <Icon name="bell" />{unread > 0 && <span className="pp-badge" aria-hidden="true">{n(unread > 99 ? '99+' : unread)}</span>}
              </button>
            )}
            <button type="button" className="pp-langbtn" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} lang={lang === 'en' ? 'ar' : 'en'} aria-label={`${t.language}: ${lang === 'en' ? 'العربية' : 'English'}`}>{lang === 'en' ? 'ع' : 'EN'}</button>
            <button type="button" className="pp-iconbtn" aria-label={t.signOut} onClick={onSignOut}><Icon name="out" flip /></button>
          </div>
        </header>

        {list.length > 0 && !showLink && (
          <nav className="pp-switcher" aria-label={t.chooseLearner}>
            {list.map((l, i) => (
              <button type="button" key={l.studentId} className="pp-chip" aria-current={learner?.studentId === l.studentId ? 'true' : undefined} onClick={() => setSelectedId(l.studentId)}>
                <Avatar initial={l.initial} index={i} />
                <span className="pp-chip-name"><b>{l.firstName}</b><small>{l.age !== null ? t.age(n(l.age)) : t.tierLine[l.tier].split('·')[0].trim()}</small></span>
              </button>
            ))}
            <button type="button" className="pp-chip pp-chip--add" onClick={() => go('link')} aria-label={t.addAnotherChild} title={t.addAnotherChild}><Icon name="plus" /></button>
          </nav>
        )}

        <main className="pp-main" id="pp-main">
          <div className="pp-ptr" style={{ blockSize: pullPx }} aria-hidden="true">{pullPx > 0 ? (pullPx >= 64 ? t.refreshing : t.pullToRefresh) : ''}</div>
          {!learners.data && (learners.error ? <ErrorBox onRetry={learners.reload} /> : <Loading />)}
          {showLink && learners.data && (
            <>
              {noLearners && tab !== 'link' && <section className="pp-notice"><Icon name="link" style={{ color: '#075985' }} /><div><b>{t.noLearners}</b><p>{t.noLearnersBody}</p></div></section>}
              <LinkChild another={list.length > 0} onCancel={list.length ? () => go('home') : undefined} onLinked={(id) => { setSelectedId(id); refresh(); go('home'); }} />
            </>
          )}
          {learners.data?.hiddenBySchool ? <p className="pp-notice" role="status" data-testid="pp-hidden-by-school" style={{ display: 'block', fontSize: 13 }}>{t.hiddenBySchool}</p> : null}
          {showEmailPrompt && tab === 'home' && !showLink && learners.data && (
            <AddEmail mode="prompt" suggested={signIn?.suggestedEmail} onDone={refresh} onDismiss={() => { setEmailPromptDismissed(true); write(EMAIL_PROMPT_KEY, '1', 'session'); }} />
          )}
          {!showLink && learner && (
            <>
              {(tab === 'home' || tab === 'progress' || tab === 'activity') && <SubjectChips subjects={subjectList} value={subjectKey} onChange={setSubject} />}
              {status.data && tab !== 'school' && <StatusLine status={status.data} />}
              <Updated at={fetched} loading={status.loading || screenFetched.loading} onRefresh={refresh} />
              {tab === 'home' && schoolOn && school.data && <SchoolHomeCard overview={school.data} open={(v) => { setSchoolView(v); go('school'); }} />}
              {tab === 'school' && school.data && schoolOn && <School learner={learner} refreshKey={refreshKey} overview={school.data} view={schoolView} setView={setSchoolView} onRead={school.reload} nameOf={(id) => list.find((l) => l.studentId === id)?.firstName ?? ''} />}
              {tab === 'school' && !schoolOn && (school.data || school.error || !school.loading) && <p className="pp-notice">{t.sch.off}</p>}
              {tab === 'home' && <Home learner={learner} refreshKey={refreshKey} go={(k) => go(k as Tab)} onShare={() => setSharing(true)} onFetched={onFetched} subjectKey={subjectKey} overview={subjectList} onPickSubject={(k) => { setSubject(k); window.scrollTo({ top: 0 }); }} />}
              {tab === 'progress' && <Progress learner={learner} refreshKey={refreshKey} onFetched={onFetched} subjectKey={subjectKey} english={!!chosen?.english} />}
              {tab === 'activity' && <Activity learner={learner} refreshKey={refreshKey} onFetched={onFetched} subjectKey={subjectKey} />}
              {tab === 'controls' && <Controls learner={learner} refreshKey={refreshKey} />}
              {tab === 'account' && <Account schoolOn={schoolOn && !!school.data?.sections.notifications} feesOn={!!school.data?.sections.fees} busOn={!!school.data?.sections.buses} refreshKey={refreshKey} setLang={setLang} onLink={() => go('link')} onPick={(id) => { setSelectedId(id); go('home'); }} onChanged={refresh} onSignOut={onSignOut} />}
            </>
          )}
        </main>
        {!showLink && learner && nav}
        {sharing && learner && <ShareSheet learner={learner} onClose={() => setSharing(false)} />}
      </div>
    </ParentsCtx.Provider>
  );
};

export default ParentsApp;
