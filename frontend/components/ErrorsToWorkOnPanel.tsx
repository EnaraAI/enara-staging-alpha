import React from 'react';
import { ListChecks } from 'lucide-react';
import { dismissErrorToWorkOn, fetchErrorsToWorkOn, type ErrorToWorkOnView } from '../services/apiService';
import { toast } from '../services/toastService';

// Learner memory phase 1: the learner's "errors to work on" from released assessments (teachers and school admins).
// Hidden when the feature is off (the API answers 404) or the list is empty.
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'To work on', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  waiting: { label: 'Waiting for results release', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export const ErrorsToWorkOnPanel: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [rows, setRows] = React.useState<ErrorToWorkOnView[] | null>(null);
  const load = React.useCallback(() => {
    fetchErrorsToWorkOn(studentId).then((r) => setRows(r.errors)).catch(() => setRows(null));
  }, [studentId]);
  React.useEffect(load, [load]);
  if (!rows || !rows.length) return null;
  const dismiss = async (id: string) => {
    try { await dismissErrorToWorkOn(id); load(); } catch { toast.error('Could not dismiss', 'Please try again.'); }
  };
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200" data-testid="errors-to-work-on">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700"><ListChecks size={20} /></div>
        <h3 className="font-semibold text-slate-900">Errors to work on</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">From released assessments. The tutor works on up to 3 at the start of a session, with new practice items. An error is resolved after two right answers on their own in later sessions.</p>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const st = STATUS[r.status === 'open' && r.waitingForRelease ? 'waiting' : r.status];
          return (
            <li key={r.id} className="py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{r.objective.code ? `${r.objective.code} · ` : ''}{r.objective.title ?? 'Objective'}</div>
                <div className="text-sm text-slate-600">{r.error}{r.occurrences >= 2 ? ` · seen ${r.occurrences} times` : ''}{r.status === 'open' && r.rightStreak > 0 ? ` · ${r.rightStreak} of 2 right` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                {r.status === 'open' && <button type="button" onClick={() => dismiss(r.id)} className="text-xs text-slate-500 hover:text-slate-800 underline">Dismiss</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
