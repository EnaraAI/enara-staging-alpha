import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError, fetchTeachingEffectiveness } from '../services/apiService';
import type { OriginView } from '../services/roleRouting';

// P21: what happened after each teaching method, for staff (teachers: their
// classes; admins and academic managers: the school, read-only). Descriptive
// only: a change is shown with its sample size and 90% interval, and only from
// at least 10 comparable episodes of at least 5 students. Rows are alphabetical,
// never a ranking. No costs.

const DIMENSIONS = [
  { id: 'none', label: 'All learners' },
  { id: 'baselineBand', label: 'By starting level' },
  { id: 'objective', label: 'By objective' },
  { id: 'subject', label: 'By subject' },
  { id: 'gradeBand', label: 'By grade band' },
  { id: 'misconception', label: 'By misconception type' },
];
const LABELS: Record<string, string> = {
  associated_with_intervention: 'comparable before/after',
  observed_change: 'change seen, not comparable',
  insufficient_evidence: 'not enough evidence',
};
const FLAG: Record<string, string> = {
  missing_baseline: 'no evidence before', no_post_evidence: 'no evidence after', few_items: 'too few questions', repeated_items: 'same questions again',
  difficulty_shift: 'difficulty changed', difficulty_unknown: 'difficulty not set', assessment_kind_differs: 'different kind of assessment',
  assessment_kind_unspecified: 'assessment kind not set', grading_method_changed: 'grading method changed', long_gap: 'long gap',
};
const pct = (x: number | null | undefined) => (x == null ? '—' : `${x > 0 ? '+' : ''}${Math.round(x * 100)} pts`);

export const TeachingEffectivenessPanel: React.FC<{ classId?: string; origin: OriginView }> = ({ classId, origin }) => {
  const [dimension, setDimension] = useState('none');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchTeachingEffectiveness({ classId, origin, dimension })
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && (err.code === 'FEATURE_DISABLED' || err.status === 403)) setHidden(true);
        else setError(err instanceof Error ? err.message : 'Could not load teaching effectiveness');
      });
  }, [classId, origin, dimension]);

  if (hidden) return null;
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-labelledby="teaching-effectiveness">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="teaching-effectiveness" className="font-semibold text-slate-900">Teaching methods and later assessment results</h2>
          <p className="text-xs text-slate-600">What students' assessed scores did after the tutor used each method. Observational: it does not show that a method caused a change.</p>
        </div>
        <select aria-label="Group by" value={dimension} onChange={(e) => setDimension(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      {error ? <p className="text-sm text-slate-700">{error}</p> : !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !data.coverage.episodes ? (
        <p className="text-sm text-slate-600">No teaching episodes with assessment evidence yet in this view.</p>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            {data.coverage.episodes} episodes · {data.coverage.students} students ·{' '}
            {Object.entries(data.coverage.byLabel).map(([k, v]) => `${v} ${LABELS[k] ?? k}`).join(' · ')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-3">Method</th>
                  {data.dimension !== 'none' && <th className="py-1 pr-3">Group</th>}
                  <th className="py-1 pr-3">Comparable episodes (students)</th>
                  <th className="py-1 pr-3">Average change</th>
                  <th className="py-1 pr-3">90% range</th>
                  <th className="py-1 pr-3">Retention change</th>
                  <th className="py-1 pr-3">Most common limits</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g: any) => (
                  <tr key={`${g.method}|${g.key}`} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3">{g.methodName}</td>
                    {data.dimension !== 'none' && <td className="py-1.5 pr-3">{g.key}</td>}
                    <td className="py-1.5 pr-3 tabular-nums">{g.comparable.episodes} ({g.comparable.students}) <span className="text-slate-500">of {g.episodes}</span></td>
                    <td className="py-1.5 pr-3 tabular-nums">{g.status === 'reported' ? pct(g.meanChange) : <span className="text-slate-500">Not enough evidence</span>}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{g.interval90 ? `${pct(g.interval90.low)} to ${pct(g.interval90.high)}` : '—'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{g.retention.meanChange == null ? '—' : pct(g.retention.meanChange)}</td>
                    <td className="py-1.5 pr-3 text-xs text-slate-600">
                      {Object.entries(g.flagShare).filter(([f]) => FLAG[f]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2).map(([f, v]: any) => `${FLAG[f]} (${Math.round(v * 100)}%)`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="text-xs text-slate-500 list-disc pl-5 space-y-0.5">{data.caveats.map((c: string) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
    </section>
  );
};

export default TeachingEffectivenessPanel;
