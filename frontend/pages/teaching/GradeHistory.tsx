import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { decideLmsGrade, fetchGradeHistory } from '../../services/apiService';
import { toast } from '../../services/toastService';

// Grade history (grade ledger, GRADE_LEDGER_ENABLED): every attempt of one
// student on one assignment, every change to its result (who, why, old -> new,
// when) and what was sent to the LMS. Read-only, except the choice for a grade
// a teacher changed directly in the LMS: keep the LMS value or ENARA's.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

export const REASON_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  newer_attempt: 'Submitted (newer attempt)',
  auto_graded: 'Graded automatically',
  grading_exception: 'Grader stopped',
  teacher_scored: 'Scored by a teacher',
  teacher_override: 'Teacher override',
  teacher_finalized: 'Finalized by a teacher',
  teacher_correction: 'Teacher correction',
  released: 'Released',
  regrade_requested: 'Sent back to the grader',
  regrade_after_grader_fix: 'Regraded',
  lms_change_detected: 'Changed in the LMS',
  lms_change_reverted: 'LMS value matches again',
  kept_lms_value: 'Kept the LMS value',
  kept_enara_value: 'Kept the ENARA value',
};
const SYNC_LABEL: Record<string, string> = { sent: 'Sent to the LMS', retried: 'Sent to the LMS after retrying', failed: 'Not sent yet (will retry)', dead: 'Not sent' };
const GRADED_BY: Record<string, string> = { auto: 'automatic', teacher: 'teacher', regrade: 'regrade' };

const pct = (f: number | null | undefined) => (typeof f === 'number' ? `${Math.round(f * 1000) / 10}%` : '');
function valueText(v: any): string {
  if (!v) return '—';
  if (v.status === 'lms') return v.points === null || v.points === undefined ? 'no grade' : `${v.points} / ${v.maxPoints}${typeof v.fraction === 'number' ? ` (${pct(v.fraction)})` : ''}`;
  const pts = typeof v.points === 'number' && typeof v.maxPoints === 'number' ? `${v.points} / ${v.maxPoints}` : '';
  const frac = typeof v.fraction === 'number' ? ` (${pct(v.fraction)})` : typeof v.percent === 'number' ? ` (${v.percent}%)` : '';
  return [pts + frac, v.status ? String(v.status).replace(/_/g, ' ') : ''].filter(Boolean).join(' · ') || '—';
}

export const GradeHistory: React.FC<{ assignmentId: string; studentId: string; onClose: () => void }> = ({ assignmentId, studentId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchGradeHistory(assignmentId, studentId).then(setData).catch((err) => { toast.error('Could not load the grade history', errorText(err)); onClose(); });
  useEffect(() => { load(); }, [assignmentId, studentId]);
  const who = (actor: string) => (actor === 'system' ? 'ENARA (automatic)' : actor === 'student' ? 'Student' : data?.actors?.[actor]?.name ?? 'Staff member');
  const decide = async (resourceLinkId: string, keep: 'lms' | 'enara') => {
    setBusy(true);
    try {
      await decideLmsGrade(assignmentId, studentId, resourceLinkId, keep);
      toast.success(keep === 'lms' ? 'The LMS value is kept' : 'The ENARA value is sent again', '');
      await load();
    } catch (err) {
      toast.error('Not done', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const timeline = data
    ? [
        ...data.entries.map((e: any) => ({ kind: 'entry', at: e.at, e })),
        ...data.syncLog.map((r: any) => ({ kind: 'sync', at: r.at, r })),
      ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())
    : [];
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000]" role="dialog" aria-modal="true" aria-label="Grade history">
      <div className="bg-white rounded-xl p-5 max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Grade history</h2>
            {data && <p className="text-sm text-slate-600">{data.student.name} · {data.assignment.title}</p>}
          </div>
          <button aria-label="Close" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {!data ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {data.lms.filter((s: any) => s.status === 'differs').map((s: any) => (
              <div key={s.resourceLinkId} className="flex gap-2 items-start bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-900" data-testid="lms-differs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>
                    <strong>Changed in LMS.</strong> The LMS gradebook shows <strong>{valueText({ status: 'lms', points: s.lmsValue?.scoreGiven, maxPoints: s.lmsValue?.scoreMaximum, fraction: s.lmsValue?.fraction })}</strong>; ENARA sent{' '}
                    <strong>{s.enaraValue?.scoreGiven ?? 'no score'}{typeof s.enaraValue?.scoreMaximum === 'number' && typeof s.enaraValue?.scoreGiven === 'number' ? ` / ${s.enaraValue.scoreMaximum} (${pct(s.enaraValue.fraction)})` : ''}</strong>. ENARA sends nothing to this grade until you choose which one counts.
                  </p>
                  {data.lmsDecisions && (
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => decide(s.resourceLinkId, 'lms')} className="px-3 py-1.5 rounded-lg border border-amber-400 bg-white font-semibold disabled:opacity-50">Keep LMS value</button>
                      <button disabled={busy} onClick={() => decide(s.resourceLinkId, 'enara')} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">Keep ENARA value</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <section>
              <h3 className="font-semibold text-slate-900 text-sm mb-1">Attempts</h3>
              {!data.attempts.length ? <p className="text-sm text-slate-600">No attempts yet.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Submitted</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Score</th><th className="py-1">Graded by</th></tr></thead>
                  <tbody>
                    {data.attempts.map((t: any) => (
                      <tr key={t.attemptId} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 tabular-nums">{t.number}</td>
                        <td className="py-1.5 pr-3">{t.submittedAt ? new Date(t.submittedAt).toLocaleString() : 'not submitted'}{t.late ? ' · late' : ''}</td>
                        <td className="py-1.5 pr-3">{String(t.gradingStatus ?? t.status).replace(/_/g, ' ')}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{typeof t.points === 'number' ? `${t.points} / ${t.maxPoints}` : '—'}{typeof t.percent === 'number' ? ` (${t.percent}%)` : ''}</td>
                        <td className="py-1.5">{t.gradedBy ? GRADED_BY[t.gradedBy] : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h3 className="font-semibold text-slate-900 text-sm mb-1">What changed</h3>
              {!timeline.length ? <p className="text-sm text-slate-600">Nothing recorded yet.</p> : (
                <ol className="space-y-2 text-sm">
                  {timeline.map((item: any) => item.kind === 'entry' ? (
                    <li key={item.e.id} className="border-l-2 border-indigo-300 pl-3">
                      <span className="text-slate-500">{new Date(item.at).toLocaleString()} · attempt {item.e.attemptNumber ?? '?'}</span>
                      <span className="block font-medium text-slate-900">{REASON_LABEL[item.e.reason] ?? item.e.reason} · {who(item.e.actor)}{item.e.backfilled ? ' · recorded later' : ''}</span>
                      <span className="block text-slate-700">{valueText(item.e.from)} → {valueText(item.e.to)}{item.e.questionId ? ` · question ${item.e.questionId}` : ''}</span>
                      {item.e.note && <span className="block text-slate-600 italic">“{item.e.note}”</span>}
                    </li>
                  ) : (
                    <li key={item.r.id} className="border-l-2 border-slate-300 pl-3">
                      <span className="text-slate-500">{new Date(item.at).toLocaleString()} · attempt {item.r.attemptNumber ?? '?'}</span>
                      <span className="block font-medium text-slate-900">{SYNC_LABEL[item.r.result] ?? item.r.result}{item.r.errorCode ? ` · ${item.r.errorCode}` : ''}{item.r.tries > 1 ? ` · try ${item.r.tries}` : ''}</span>
                      <span className="block text-slate-700">{typeof item.r.sent?.scoreGiven === 'number' ? `${item.r.sent.scoreGiven} / ${item.r.sent.scoreMaximum}` : 'no score'} · {item.r.sent?.gradingProgress === 'PendingManual' ? 'waiting for the teacher' : item.r.sent?.gradingProgress ?? ''}{item.r.sent?.commentShort ? ` · “${item.r.sent.commentShort}”` : ''}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
