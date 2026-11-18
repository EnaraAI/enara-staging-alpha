import React, { useEffect, useState } from 'react';
import { fetchLmsEmailOptIn, saveLmsEmailOptIn } from '../services/apiService';

// LMS emails, owner decision D2: a teacher who opened ENARA from the LMS is
// asked once whether Enara may email them (their course is ready, grades
// changed in Moodle, newer attempts waiting, students who have not started).
// The address is pre-filled from Moodle; the teacher confirms, changes or
// declines it. Nothing is ever sent without this "yes" (never silent).
export const LmsEmailOptIn: React.FC = () => {
  const [state, setState] = useState<'loading' | 'ask' | 'done' | 'hidden'>('loading');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchLmsEmailOptIn()
      .then((r) => {
        if (!live) return;
        if (r.state === 'ask') {
          setEmail(r.prefill ?? '');
          setState('ask');
        } else setState('hidden');
      })
      .catch(() => live && setState('hidden'));
    return () => { live = false; };
  }, []);

  if (state !== 'ask') return null;

  const answer = async (optIn: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await saveLmsEmailOptIn(optIn ? { optIn, email } : { optIn });
      setState('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m-4 sm:m-6 rounded-xl border border-teal-200 bg-teal-50 p-4" role="region" aria-label="Enara emails" data-testid="lms-email-optin">
      <p className="font-semibold text-slate-900">Email me Enara updates?</p>
      <p className="text-sm text-slate-700 mt-1">
        When your course is ready, when grades are changed in Moodle, when newer attempts wait for review and when students have not started. No student names in emails. You can change this later.
      </p>
      <p className="text-sm text-slate-700 mt-1" dir="rtl" lang="ar">هل ترغب في تلقي رسائل من إنارة عن مقرراتك؟ لا تتضمن الرسائل أسماء الطلاب.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-700" htmlFor="lms-optin-email">Email</label>
        <input id="lms-optin-email" type="email" className="border rounded px-2 py-1 text-sm min-w-[16rem]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <button disabled={busy || !email.trim()} className="rounded bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void answer(true)}>Yes, email me</button>
        <button disabled={busy} className="rounded px-3 py-1.5 text-sm font-semibold text-slate-700" onClick={() => void answer(false)}>No thanks</button>
      </div>
      {error && <p className="text-sm text-red-700 mt-2" role="alert">{error}</p>}
    </div>
  );
};
