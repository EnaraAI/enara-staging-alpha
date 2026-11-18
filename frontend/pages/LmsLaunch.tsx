import React, { useEffect, useRef, useState } from 'react';
import { ApiError, clearSession, exchangeLmsHandoff, exchangeLmsLaunch, isLmsPreview, isLmsSession, lmsNewTabTarget, SessionUser, type LmsNewTabTarget } from '../services/apiService';
import { lmsLaunchPortal, type UiRole } from '../services/roleRouting';
import { isInFrame } from '../services/micCheck';
import { OpenInNewTab } from '../components/OpenInNewTab';

// Landing page for a launch from an LMS: /lms/launch#lt=<one-time token>, or
// for "Open in new tab": /lms/launch#hc=<one-time code> (60 seconds, used
// once). Either is read from the fragment (never sent to a server by the
// browser), removed from the address bar, and exchanged once for an ENARA
// session. No cookies are needed. When the browser blocks storage inside the
// LMS frame, or the launch was cookieless, "Open in new tab" is offered.

export const onLmsLaunchPath = () => window.location.pathname.replace(/\/$/, '') === '/lms/launch';

const inFrame = isInFrame();

const ROLE_NOT_SUPPORTED = 'ENARA does not open this kind of account from your LMS. Ask your school administrator.';

export const LmsLaunch: React.FC<{ onReady: (role: UiRole, user: SessionUser) => void }> = ({ onReady }) => {
  const [error, setError] = useState<string | null>(null);
  // Shown under the message so support can find the cause (e.g. lms_role_not_supported).
  const [reference, setReference] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ token: string; target: LmsNewTabTarget } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('lt');
    const code = params.get('hc');
    window.history.replaceState({}, document.title, '/lms/launch');
    if (!token && !code) {
      setError('This link has no sign-in information. Please open the activity again from your LMS.');
      return;
    }
    (code ? exchangeLmsHandoff(code) : exchangeLmsLaunch(token!))
      .then((res) => {
        // The portal comes from the ENARA account's role; an unsupported role
        // never opens the staff portal (P0 item 1). The server refuses these
        // too; this is a second guard, and drops the session just stored.
        const portal = lmsLaunchPortal(res.user.role, res.launch.preview === true);
        if (!portal.role) {
          clearSession();
          setReference(portal.code ?? 'lms_role_not_supported');
          setError(ROLE_NOT_SUPPORTED);
          return;
        }
        if (!res.stored) {
          const t = res.launch.target;
          setBlocked({
            token: res.token,
            target: {
              classId: res.launch.classId,
              assignmentId: t?.kind === 'assignment' ? t.assignmentId : null,
              resourceLinkId: res.launch.resourceLinkId ?? null,
              page: t?.kind === 'page' ? t.page : null,
            },
          });
          return;
        }
        window.history.replaceState({}, document.title, '/');
        onReady(portal.role, res.user);
      })
      .catch((e: Error) => {
        if (e instanceof ApiError && e.code) setReference(e.code.toLowerCase());
        setError(e.message || 'We could not sign you in. Please open the activity again from your LMS.');
      });
  }, [onReady]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">We couldn't open ENARA</h1>
            <p className="text-slate-600">{error}</p>
            {reference && (
              <p data-testid="lms-launch-reference" className="text-xs text-slate-400 mt-4">
                Reference code: <code>{reference}</code>
              </p>
            )}
          </>
        ) : blocked ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Open ENARA in a new tab</h1>
            <p className="text-slate-600 mb-6">Your browser does not let ENARA keep you signed in inside this page.</p>
            <OpenInNewTab
              target={() => blocked.target}
              bearer={blocked.token}
              label="Open in new tab"
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-60"
            />
          </>
        ) : (
          <p className="text-slate-500">Signing you in…</p>
        )}
      </div>
    </div>
  );
};

/** A slim bar shown inside the LMS frame: "Open in new tab" (needed for mic and camera, and when the frame is cramped). */
export const LmsFrameBar: React.FC<{ page?: string }> = ({ page }) => {
  if (!inFrame || !isLmsSession()) return null;
  // The new tab lands on the same step: the launch's activity on the
  // assignments pages, otherwise the page the student is on.
  const onAssignments = !page || page === 'assignments-student' || page === 'class-assignments';
  return (
    <div className="bg-slate-900 text-white text-sm px-4 py-1.5 flex items-center justify-end gap-3">
      <span className="opacity-80">Opened from your LMS</span>
      <OpenInNewTab target={() => lmsNewTabTarget(onAssignments ? {} : { page })} label="Open in new tab" />
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
