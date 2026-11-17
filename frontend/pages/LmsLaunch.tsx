import React, { useEffect, useRef, useState } from 'react';
import { exchangeLmsLaunch, isLmsPreview, isLmsSession, lmsNewTabUrl, SessionUser } from '../services/apiService';
import type { UiRole } from '../services/roleRouting';

// Landing page for a launch from an LMS: /lms/launch#lt=<one-time token>.
// The token is read from the fragment (never sent to a server by the browser),
// removed from the address bar, and exchanged once for an ENARA session.
// No cookies are needed. When the browser blocks storage inside the LMS frame,
// or the launch was cookieless, "Open in new tab" is offered.

export const onLmsLaunchPath = () => window.location.pathname.replace(/\/$/, '') === '/lms/launch';

const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export function uiRoleForLms(role: string, preview = false): UiRole {
  // A staff preview opens the student view; the account keeps its own role.
  return preview || role === 'student' ? 'student' : 'admin';
}

export const LmsLaunch: React.FC<{ onReady: (role: UiRole, user: SessionUser) => void }> = ({ onReady }) => {
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ token: string; classId: string | null } | null>(null);
  const [opening, setOpening] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('lt');
    window.history.replaceState({}, document.title, '/lms/launch');
    if (!token) {
      setError('This link has no sign-in information. Please open the activity again from your LMS.');
      return;
    }
    exchangeLmsLaunch(token)
      .then((res) => {
        if (!res.stored) {
          setBlocked({ token: res.token, classId: res.launch.classId });
          return;
        }
        window.history.replaceState({}, document.title, '/');
        onReady(uiRoleForLms(res.user.role, res.launch.preview === true), res.user);
      })
      .catch((e: Error) => setError(e.message || 'We could not sign you in. Please open the activity again from your LMS.'));
  }, [onReady]);

  const openNewTab = async () => {
    setOpening(true);
    try {
      const url = await lmsNewTabUrl(blocked?.classId, blocked?.token);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">We couldn't open ENARA</h1>
            <p className="text-slate-600">{error}</p>
          </>
        ) : blocked ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Open ENARA in a new tab</h1>
            <p className="text-slate-600 mb-6">Your browser does not let ENARA keep you signed in inside this page.</p>
            <button onClick={openNewTab} disabled={opening} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-60">
              {opening ? 'Opening…' : 'Open in new tab'}
            </button>
          </>
        ) : (
          <p className="text-slate-500">Signing you in…</p>
        )}
      </div>
    </div>
  );
};

/** A slim bar shown inside the LMS frame: "Open in new tab" (needed for mic and camera, and when the frame is cramped). */
export const LmsFrameBar: React.FC = () => {
  const [busy, setBusy] = useState(false);
  if (!inFrame || !isLmsSession()) return null;
  const open = async () => {
    setBusy(true);
    try {
      let classId: string | null = null;
      try {
        classId = JSON.parse(sessionStorage.getItem('enara_lms') || '{}').classId ?? null;
      } catch { /* none */ }
      window.open(await lmsNewTabUrl(classId), '_blank', 'noopener');
    } catch {
      /* the bar stays; the user can retry */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-slate-900 text-white text-sm px-4 py-1.5 flex items-center justify-end gap-3">
      <span className="opacity-80">Opened from your LMS</span>
      <button onClick={open} disabled={busy} className="underline font-semibold disabled:opacity-60">{busy ? 'Opening…' : 'Open in new tab'}</button>
    </div>
  );
};

/** Always on top of a student preview opened from the LMS by a teacher or admin. */
export const LmsPreviewBanner: React.FC = () => {
  if (!isLmsPreview()) return null;
  return (
    <div role="status" data-testid="lms-preview-banner" className="bg-amber-100 text-amber-900 border-b border-amber-300 text-sm font-semibold px-4 py-2 text-center">
      Preview as student — nothing is saved
    </div>
  );
};
