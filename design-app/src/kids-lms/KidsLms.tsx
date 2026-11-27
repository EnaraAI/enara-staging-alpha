// #/kids: the lms-test kids app as it is (src/lms), full screen, without the design app's shell. Loaded in its own chunk.
// Mounted the way frontend/index.tsx and frontend/App.tsx mount it on lms-test (error boundary, toast host, the same props
// for a signed-in kids student). The sign-in bridge (./bridge) has already handed it the design session's token.
import { useEffect, useLayoutEffect } from 'react';
import './kids-lms.css';
import { ErrorBoundary, KidsApp, SESSION_EXPIRED_EVENT, ToastContainer, getSessionUser, isLmsSession } from './entry';
import { loadLmsFonts } from './fonts';

const TITLE = 'Enara | The Intelligence Layer for Education';

export default function KidsLms({ onSignOut }: { onSignOut: () => void }) {
  // The page as frontend/index.html sets it: <html lang="en"> with no theme; the kids root sets its own dir and lang.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const before = { lang: html.lang, dir: html.dir, theme: html.dataset.theme, dark: html.classList.contains('dark'), title: document.title };
    html.classList.add('lms-kids', 'lms-scope'); html.classList.remove('dark'); html.lang = 'en'; html.removeAttribute('dir'); delete html.dataset.theme;
    document.title = TITLE;
    loadLmsFonts();
    return () => {
      html.classList.remove('lms-kids', 'lms-scope'); html.classList.toggle('dark', before.dark); html.lang = before.lang; html.dir = before.dir;
      if (before.theme) html.dataset.theme = before.theme;
      document.title = before.title;
    };
  }, []);
  // As frontend/App.tsx: the copied apiService fires this when lms-test rejects the token.
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, onSignOut);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSignOut);
  }, [onSignOut]);

  const user = getSessionUser();
  return (
    <ErrorBoundary>
      <ToastContainer />
      <KidsApp
        userName={user ? user.name || user.email : ''}
        tourPending={user?.tourPending}
        sharedAssessmentId={null}
        sharedCourseId={null}
        lmsAssignmentId={undefined}
        lmsPage={undefined}
        lmsStudent={isLmsSession() || user?.lmsAccount === true}
        onSignOut={onSignOut}
      />
    </ErrorBoundary>
  );
}
