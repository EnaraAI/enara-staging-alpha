import React from 'react';
import { Target } from 'lucide-react';
import { fetchErrorsToWorkOn, type ErrorToWorkOnView } from '../services/apiService';

// Learner memory phase 1, the learner's own view: points from their released tests that the tutor will practise with them.
// Hidden when the feature is off (404) or nothing is open.
export const MyErrorsToWorkOnCard: React.FC<{ onAskTutor?: () => void }> = ({ onAskTutor }) => {
  const [rows, setRows] = React.useState<ErrorToWorkOnView[] | null>(null);
  React.useEffect(() => { fetchErrorsToWorkOn('me').then((r) => setRows(r.errors)).catch(() => setRows(null)); }, []);
  const open = (rows ?? []).filter((r) => r.status === 'open');
  const done = (rows ?? []).filter((r) => r.status === 'resolved').length;
  if (!open.length && !done) return null;
  return (
    <section className="bg-white p-5 rounded-xl border border-slate-200" data-testid="my-errors-to-work-on">
      <div className="flex items-center gap-2 mb-2">
        <Target size={18} className="text-amber-600" />
        <h2 className="font-semibold text-slate-900">Points to practise</h2>
      </div>
      <p className="text-sm text-slate-500 mb-3">From your tests. Your tutor practises these with you, with new exercises. Two right answers on your own clear a point.</p>
      <ul className="space-y-2">
        {open.slice(0, 5).map((r) => (
          <li key={r.id} className="text-sm">
            <span className="font-medium text-slate-800">{r.objective.title ?? 'A point'}</span>
            <span className="text-slate-600"> · {r.error}</span>
            {r.waitingForRelease ? <span className="text-xs text-slate-500"> · after your test closes</span> : r.rightStreak > 0 ? <span className="text-xs text-emerald-700"> · {r.rightStreak} of 2 right</span> : null}
          </li>
        ))}
      </ul>
      {done > 0 && <p className="text-xs text-emerald-700 mt-2">{done} point{done === 1 ? '' : 's'} cleared.</p>}
      {onAskTutor && open.some((r) => !r.waitingForRelease) && (
        <button type="button" onClick={onAskTutor} className="mt-3 text-sm font-medium text-indigo-700 hover:text-indigo-900">Practise with the tutor →</button>
      )}
    </section>
  );
};
