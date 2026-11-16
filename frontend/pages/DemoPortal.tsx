import React, { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, LayoutDashboard, Loader2, ShieldCheck } from 'lucide-react';
import { EnaraLogo } from '../components/brand/EnaraLogo';
import { fetchDemoStatus, startDemo, type DemoRole, type SessionUser } from '../services/apiService';
import { uiRoleFor, type UiRole } from '../services/roleRouting';

// Public partner demo page (/demo): one click opens a fresh, private demo
// school signed in as the chosen role. Nothing to fill in.
const ROLES: { role: DemoRole; title: string; text: string; icon: React.ReactNode }[] = [
  {
    role: 'student',
    title: 'Student',
    text: 'Take the course, ask the AI tutor, try a live tutor call and see your assignments and results.',
    icon: <GraduationCap size={28} />,
  },
  {
    role: 'teacher',
    title: 'Teacher',
    text: 'Build assessments with AI, see automatic grading with feedback, plan lessons and follow your class.',
    icon: <BookOpen size={28} />,
  },
  {
    role: 'admin',
    title: 'School admin',
    text: "See the school's insights, usage and AI controls, and choose the tutor's face.",
    icon: <LayoutDashboard size={28} />,
  },
];

export const DemoPortal: React.FC<{ onStart: (role: UiRole, user: SessionUser) => void }> = ({ onStart }) => {
  const [status, setStatus] = useState<{ available: boolean; full: boolean } | null>(null);
  const [busy, setBusy] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ended = new URLSearchParams(window.location.search).get('ended') === '1';

  useEffect(() => {
    fetchDemoStatus().then(setStatus).catch(() => setStatus({ available: false, full: false }));
  }, []);

  const start = async (role: DemoRole) => {
    setBusy(role);
    setError(null);
    try {
      const user = await startDemo(role);
      const ui = uiRoleFor(user.role, role === 'student' ? 'student' : 'admin');
      if (!ui) throw new Error('The demo could not open this role.');
      window.history.replaceState({}, document.title, '/');
      onStart(ui, user);
    } catch (e: any) {
      setError(e?.message || 'The demo could not start. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const closed = status && !status.available;
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <EnaraLogo className="h-9 w-auto" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Try Enara</h1>
        <p className="mt-2 text-lg text-slate-600 max-w-2xl">
          Pick a role to open your own demo school, with a real course, students, assignments and AI. No sign-up.
        </p>
        {ended && (
          <p className="mt-4 rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 text-slate-700">
            Your demo ended and its data was deleted. Start a new one any time.
          </p>
        )}
        {closed && (
          <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900">
            {status!.full ? 'The demo is fully booked this month. Please contact Enara for a guided demo.' : "The demo isn't open right now. Please try again later."}
          </p>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">{error}</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              disabled={!!busy || !status?.available}
              onClick={() => start(r.role)}
              className="flex flex-col items-start text-left rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{r.icon}</span>
              <span className="mt-4 block text-xl font-bold text-slate-900">{r.title}</span>
              <span className="mt-2 block text-sm text-slate-600 leading-relaxed">{r.text}</span>
              <span className="mt-auto pt-5"><span className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">
                {busy === r.role ? <><Loader2 size={16} className="animate-spin" /> Preparing your demo…</> : `Start as ${r.title.toLowerCase()}`}
              </span></span>
            </button>
          ))}
        </div>

        <p className="mt-8 flex items-start gap-2 text-sm text-slate-500">
          <ShieldCheck size={18} className="shrink-0 text-slate-400" />
          Each demo is a private copy with fictional people. You can switch roles inside it. It is deleted when you close your browser
          (or after 4 hours), and you can start up to 3 demos a day.
        </p>
      </div>
    </div>
  );
};
