import React, { useCallback, useEffect, useState } from 'react';
import { fetchMoodleQuizSettings, fetchMoodleQuizzes, fetchObjectives, mapMoodleQuiz, runMoodleQuizImport, saveMoodleQuizToken, setMoodleQuizEnabled, type LearningObjectiveRecord, type MoodleQuizSettingsView, type MoodleQuizView } from '../services/apiService';

// Errors to work on from Moodle's own quizzes, for one LMS connection (school admin). Hidden while the switch is off (the API answers 404).
// The token is write-only: it is typed once, sent to ENARA, stored encrypted and never shown again.
const CHECK_TEXT: Record<string, string> = {
  ok: 'Moodle answered.',
  no_token: 'No token saved yet.',
  invalidtoken: 'Moodle did not accept this token.',
  accessexception: 'The token\'s web service does not include the 3 quiz functions, or its user cannot see the quizzes.',
  webservicesnotenabled: 'Web services are switched off in Moodle (Site administration → Advanced features).',
  network_error: 'Moodle could not be reached.',
};

export const MoodleQuizCard: React.FC<{ platformId: string }> = ({ platformId }) => {
  const [s, setS] = useState<MoodleQuizSettingsView | null>(null);
  const [token, setToken] = useState('');
  const [quizzes, setQuizzes] = useState<MoodleQuizView[] | null>(null);
  const [objectives, setObjectives] = useState<LearningObjectiveRecord[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setS(await fetchMoodleQuizSettings(platformId)); } catch { setS(null); }
  }, [platformId]);
  useEffect(() => { void load(); }, [load]);
  if (!s || !s.switchOn) return null;

  const act = async (f: () => Promise<unknown>, done?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); if (done) setMsg(done); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const showQuizzes = () => act(async () => {
    const [q, o] = await Promise.all([fetchMoodleQuizzes(platformId), fetchObjectives(undefined, 'approved')]);
    setQuizzes(q.quizzes); setObjectives(o.objectives);
  });
  const checkText = (code?: string | null) => (code ? CHECK_TEXT[code] ?? `Moodle answered with an error (${code}).` : '');

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-testid="lms-moodle-quiz">
      <p className="text-sm font-semibold text-slate-800">Errors to work on from Moodle quizzes</p>
      <p className="text-xs text-slate-500 mb-2">
        After a Moodle quiz closes, wrong answers become “points to practise” in the ENARA tutor. ENARA only reads results: in Moodle, create a web service with
        the 3 functions <code>mod_quiz_get_quizzes_by_courses</code>, <code>mod_quiz_get_user_attempts</code> and <code>mod_quiz_get_attempt_review</code>, and paste its token here.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={s.hasToken ? 'text-teal-700' : 'text-slate-500'}>{s.hasToken ? 'Token saved' : 'No token'}</span>
        <input type="password" autoComplete="off" className="border rounded px-2 py-1 text-xs w-64" placeholder={s.hasToken ? 'Replace the token' : 'Moodle web-service token'} value={token} onChange={(e) => setToken(e.target.value)} aria-label="Moodle web-service token" data-testid="lms-moodle-quiz-token" />
        <button disabled={busy || !token} className="text-sm font-semibold text-teal-700" onClick={() => act(async () => { const r = await saveMoodleQuizToken(platformId, token.trim()); setToken(''); setMsg(checkText(r.check?.code)); })}>Save token</button>
        {s.hasToken && <button disabled={busy} className="text-sm font-semibold text-red-700" onClick={() => window.confirm('Remove the Moodle token? Imports stop.') && act(() => saveMoodleQuizToken(platformId, null), 'Token removed.')}>Remove</button>}
        {s.hasToken && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={s.enabled} disabled={busy} onChange={(e) => act(() => setMoodleQuizEnabled(platformId, e.target.checked))} data-testid="lms-moodle-quiz-enabled" /> Import every night
          </label>
        )}
      </div>
      {s.lastCheck && <p className={`text-xs mt-1 ${s.lastCheck.ok ? 'text-teal-700' : 'text-amber-700'}`}>Last check: {checkText(s.lastCheck.code)}</p>}
      {s.lastRun && <p className="text-xs text-slate-500">Last import: {s.lastRun.attempts ?? 0} attempts, {s.lastRun.wrong ?? 0} wrong answers, {s.lastRun.skipped ?? 0} not closed yet{s.lastRun.errors ? `, ${s.lastRun.errors} errors` : ''}.</p>}
      {s.hasToken && (
        <div className="mt-2 flex gap-3">
          <button disabled={busy} className="text-sm font-semibold text-slate-700" onClick={showQuizzes}>Quizzes and objectives</button>
          <button disabled={busy} className="text-sm font-semibold text-slate-700" onClick={() => act(async () => { const r = await runMoodleQuizImport(platformId); setMsg(`Imported ${r.attempts} attempts (${r.wrong} wrong answers).`); })}>Import now</button>
        </div>
      )}
      {quizzes && (
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Quiz</th><th>Closes</th><th>Review after close</th><th>ENARA objective</th></tr></thead>
          <tbody>
            {quizzes.length === 0 && <tr><td colSpan={4} className="py-1 text-slate-500">No quizzes in the linked courses.</td></tr>}
            {quizzes.map((q) => (
              <tr key={q.quizId} className="border-t border-slate-100">
                <td className="py-1">{q.name}</td>
                <td>{q.closesAt ? new Date(q.closesAt).toLocaleString() : q.maxAttempts ? `after ${q.maxAttempts} attempt(s)` : 'never'}</td>
                <td>{q.reviewAfterClose === null ? '?' : q.reviewAfterClose ? 'yes' : 'no (nothing is imported)'}</td>
                <td>
                  <select aria-label={`Objective for ${q.name}`} className="border rounded px-1 py-0.5" value={q.objectiveId ?? ''} disabled={busy}
                    onChange={(e) => { const objectiveId = e.target.value || null; void act(async () => { await mapMoodleQuiz(platformId, { quizId: q.quizId, courseExternalId: q.courseExternalId, quizName: q.name, objectiveId }); setQuizzes((all) => all?.map((x) => (x.quizId === q.quizId ? { ...x, objectiveId } : x)) ?? null); }, 'Saved.'); }}>
                    <option value="">Not used</option>
                    {objectives.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.title}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <p className="text-xs mt-1 text-slate-700" role="status">{msg}</p>}
    </div>
  );
};
