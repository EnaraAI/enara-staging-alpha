import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { demoHeartbeat, endDemo, getSessionUser, isDemoSession, switchDemoRole, type DemoRole } from '../services/apiService';
import { uiRoleFor } from '../services/roleRouting';

// Shown on every screen of a partner demo: which role you're in, switching
// roles inside the same demo school, and ending it (its data is deleted).
// Keeps the demo alive while the page is open; once the browser closes, the
// server wipes it a few minutes later.
const LABELS: Record<DemoRole, string> = { student: 'Student', teacher: 'Teacher', admin: 'School admin' };
const UI_ROLE_KEY = 'enara_ui_role';

export const DemoBar: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const demo = isDemoSession();
  const role = getSessionUser()?.role as DemoRole | undefined;

  useEffect(() => {
    if (!demo) return;
    const beat = () =>
      demoHeartbeat().catch((e: any) => {
        if (e?.status === 401 || e?.status === 410) {
          void endDemo().finally(() => window.location.assign('/demo?ended=1'));
        }
      });
    void beat();
    const timer = setInterval(beat, 60_000);
    return () => clearInterval(timer);
  }, [demo]);

  if (!demo || !role) return null;

  const switchTo = async (next: DemoRole) => {
    if (next === role || busy) return;
    setBusy(true);
    try {
      const user = await switchDemoRole(next);
      const ui = uiRoleFor(user.role, next === 'student' ? 'student' : 'admin');
      try { if (ui) localStorage.setItem(UI_ROLE_KEY, ui); } catch { /* storage unavailable */ }
      window.location.assign('/');
    } catch {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    await endDemo();
    window.location.assign('/demo?ended=1');
  };

  return createPortal(
    <div
      role="region"
      aria-label="Demo controls"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900/95 px-3 py-2 text-sm text-white shadow-xl max-w-[calc(100vw-2rem)]"
    >
      <span className="px-2 font-semibold">Demo</span>
      <span className="hidden sm:inline text-slate-300 pr-1">Deleted when you close the browser</span>
      <span className="flex rounded-xl bg-slate-800 p-1">
        {(Object.keys(LABELS) as DemoRole[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            aria-pressed={r === role}
            onClick={() => switchTo(r)}
            className={`rounded-lg px-3 py-1.5 font-semibold ${r === role ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-slate-700'}`}
          >
            {LABELS[r]}
          </button>
        ))}
      </span>
      <button type="button" disabled={busy} onClick={end} className="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold hover:bg-slate-800">
        End demo
      </button>
    </div>,
    document.body,
  );
};
