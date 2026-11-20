import React from 'react';
import { Brain } from 'lucide-react';
import { fetchMemoryReport, type MemoryReportView } from '../services/apiService';

// Learner memory report for school admins (own school): counts only, no learner names or text. Hidden when no memory switch is on (404).
const GUARD: Record<string, string> = {
  'pair_not_wrong:meaning_swap': 'a "wrong" example that was good English (meaning swap)',
  'pair_not_wrong:misspelling_shown': 'a misspelled example',
  'pair_not_wrong:joining_word_swap': 'a joining-word swap shown as wrong',
  'pair_not_wrong:pronoun_swap': 'a pronoun swap shown as wrong',
  'pair_not_wrong:statement_question': 'a statement question shown as wrong',
  'pair_not_wrong:politeness_only': 'a polite/impolite pair shown as wrong',
  'pair_not_wrong:both_comparatives_ok': 'a correct "more red" / "redder" form shown as wrong',
  'pair_not_wrong:model_fixed': 'a model sentence repaired ("Pig is big" → "The pig is big")',
  'pair_not_wrong:bare_noun_start': 'a model with a missing "the"',
  'pair_not_wrong:article_omitted': 'a model with a missing a/an',
};
const NEXT: Record<string, string> = { reteach: 'reteach', finish_item: 'finish an open exercise', next_point: 'next point' };

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-slate-200 p-3">
    <div className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
    <div className="text-xs text-slate-600">{label}</div>
    {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
);

export const MemoryReportCard: React.FC = () => {
  const [days, setDays] = React.useState(7);
  const [r, setR] = React.useState<MemoryReportView | null | undefined>(undefined);
  React.useEffect(() => { setR(undefined); fetchMemoryReport(days).then(setR).catch(() => setR(null)); }, [days]);
  if (r === null) return null; // switch off or no access
  const guards = r ? Object.entries(r.tutorReplies.guardRemovals).sort((a, b) => b[1] - a[1]) : [];
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="memory-report" aria-labelledby="memory-report-title">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700"><Brain size={20} /></div>
          <div>
            <h2 id="memory-report-title" className="font-semibold text-slate-900">Learner memory</h2>
            <p className="text-xs text-slate-500">How the tutor's memory is used in your school. Counts only.</p>
          </div>
        </div>
        <div role="group" aria-label="Period" className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-md border ${days === d ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{d} days</button>
          ))}
        </div>
      </div>
      {r === undefined ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Errors to work on</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat label="recorded" value={r.errorsToWorkOn.recorded} hint={`${r.errorsToWorkOn.fromPractice} from practice`} />
              <Stat label="resolved" value={r.errorsToWorkOn.resolved} />
              <Stat label="reopened" value={r.errorsToWorkOn.reopened} />
              <Stat label="dismissed by teachers" value={r.errorsToWorkOn.dismissed} />
              <Stat label="open now" value={r.errorsToWorkOn.open} hint={`${r.errorsToWorkOn.learnersWithOpen} learners`} />
              <Stat label="practice items set by the tutor" value={r.errorsToWorkOn.practiceItemsSetByTutor} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tutor sessions</h3>
              <p className="text-sm text-slate-700">{r.sessions.summarised} sessions summarised · {r.sessions.right} right, {r.sessions.wrong} wrong · {r.sessions.stoppedWithOpenItem} stopped mid-exercise</p>
              {Object.keys(r.sessions.nextStep).length > 0 && <p className="text-xs text-slate-500 mt-1">Next session starts with: {Object.entries(r.sessions.nextStep).map(([k, v]) => `${NEXT[k] ?? k} ${v}`).join(' · ')}</p>}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Profiles and habits</h3>
              <p className="text-sm text-slate-700">{r.habits.activeLearners} active learners · {r.habits.minutes} minutes with the tutor</p>
              <p className="text-xs text-slate-500 mt-1">Set: first language {r.profiles.withFirstLanguage} · interests {r.profiles.withInterests} · accommodations {r.profiles.withAccommodations}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tutor safety checks</h3>
              <p className="text-sm text-slate-700">{r.tutorReplies.total} tutor replies · {guards.reduce((n, [, v]) => n + v, 0)} fixed before the learner saw them</p>
              <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
                {guards.slice(0, 5).map(([k, v]) => <li key={k}>{v} × {GUARD[k] ?? k.replace(/_/g, ' ')}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
