import React, { useEffect, useState } from 'react';
import { OriginSelector } from '../components/OriginSelector';
import { OriginView } from '../services/roleRouting';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import {
  assignIntervention,
  fetchClasses,
  fetchClassInsights,
  fetchStrategies,
  fetchTtu,
  isFeatureDisabled,
  reviewMisconception,
} from '../services/apiService';
import { toast } from '../services/toastService';

// Class learning intelligence for teachers (their classes) and school admins:
// knowledge heatmap, common gaps, possible misconceptions to review,
// interventions, diagnostic completion and baseline-to-latest change. All
// numbers come from stored records; estimates are labelled as such.

const CELL: Record<string, { short: string; label: string; tone: string }> = {
  mastered: { short: 'M', label: 'Mastered', tone: 'bg-emerald-600 text-white' },
  proficient: { short: 'P', label: 'Proficient', tone: 'bg-emerald-200 text-emerald-950' },
  developing: { short: 'D', label: 'Developing', tone: 'bg-amber-200 text-amber-950' },
  emerging: { short: 'E', label: 'Emerging', tone: 'bg-rose-200 text-rose-950' },
  not_assessed: { short: '–', label: 'Not assessed', tone: 'bg-slate-100 text-slate-500' },
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

export const ClassInsights: React.FC = () => {
  const [classes, setClasses] = useState<{ id: string; courseName: string }[] | null>(null);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<any>(null);
  const [ttu, setTtu] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);
  const [strategies, setStrategies] = useState<{ id: string; description: string }[]>([]);
  const [assigning, setAssigning] = useState<{ objectiveId: string; code: string; students: { id: string; name: string }[] } | null>(null);
  const [strategyId, setStrategyId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Live data unless deliberately switched; the class list follows the view.
  const [origin, setOrigin] = useState<OriginView>('live');

  useEffect(() => {
    fetchClasses(origin)
      .then((r) => {
        setClasses(r.classes);
        setClassId((current) => (r.classes.some((c) => c.id === current) ? current : r.classes[0]?.id ?? ''));
      })
      .catch((err) => {
        if (isFeatureDisabled(err)) setDisabled(true);
        setClasses([]);
      });
  }, [origin]);
  useEffect(() => {
    fetchStrategies().then((r) => setStrategies(r.strategies)).catch(() => setStrategies([]));
  }, []);

  const load = () => {
    if (!classId) return;
    setData(null);
    fetchClassInsights(classId, origin).then(setData).catch((err) => toast.error('Could not load insights', errorText(err)));
    fetchTtu(classId, origin).then(setTtu).catch(() => setTtu(null));
  };
  useEffect(load, [classId, origin]);

  const review = async (id: string, status: 'confirmed' | 'dismissed') => {
    try {
      await reviewMisconception(id, status);
      toast.success(status === 'confirmed' ? 'Confirmed' : 'Dismissed', 'Recorded with your name and the time.');
      load();
    } catch (err) {
      toast.error('Not changed', errorText(err));
    }
  };

  const assign = async () => {
    if (!assigning) return;
    setBusy(true);
    let done = 0;
    const skipped: string[] = [];
    for (const s of assigning.students) {
      try {
        await assignIntervention(s.id, assigning.objectiveId, strategyId || undefined, note || undefined);
        done += 1;
      } catch {
        skipped.push(s.name);
      }
    }
    setBusy(false);
    toast.success(`Practice assigned to ${done} student${done === 1 ? '' : 's'}`, skipped.length ? `Already active for: ${skipped.join(', ')}` : 'They will see it in My progress.');
    setAssigning(null);
    setNote('');
    setStrategyId('');
    load();
  };

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">Class learning insights aren't enabled for your school.</p>;
  if (!classes) return <Loader2 className="animate-spin text-teal-700 m-8" aria-label="Loading" />;
  if (!classes.length) return <div className="max-w-4xl mx-auto p-8 space-y-3"><OriginSelector value={origin} onChange={setOrigin} /><p className="text-slate-700">No classes to show in this view. Teachers see the classes they teach.</p></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Learning intelligence</p>
          <h1 className="text-3xl font-extrabold text-slate-900">Class insights</h1>
          <p className="text-slate-600 mt-1">Where each student stands on each approved objective, from their assessed answers. Statuses are estimates, not grades.</p>
        </div>
        <OriginSelector value={origin} onChange={setOrigin} />
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-10 px-3 rounded-md border border-slate-300 bg-white text-sm min-w-[220px]">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}
          </select>
        </label>
      </div>

      {!data ? (
        <Loader2 className="animate-spin text-teal-700" aria-label="Loading" />
      ) : !data.objectives.length ? (
        <p className="text-slate-700">This class's curriculum has no approved objectives yet. Add them under Learning Objectives.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="m-0 text-xs text-slate-600">Students</p>
              <p className="m-0 text-2xl font-extrabold">{data.studentsShown}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="m-0 text-xs text-slate-600">Took a quick check</p>
              <p className="m-0 text-2xl font-extrabold">{data.diagnostics.studentsCompleted} / {data.diagnostics.students}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="m-0 text-xs text-slate-600">Interventions reassessed</p>
              <p className="m-0 text-2xl font-extrabold">{data.interventions.reassessed}</p>
              <p className="m-0 text-xs text-slate-500">{data.interventions.improvedAfterReassessment} improved after</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="m-0 text-xs text-slate-600">Median time to understand</p>
              <p className="m-0 text-2xl font-extrabold">
                {ttu?.verified?.activeInstructionMinutes?.median != null ? `${ttu.verified.activeInstructionMinutes.median} min` : '—'}
              </p>
              <p className="m-0 text-xs text-slate-500">{ttu ? `${ttu.counts.verified} verified · ${ttu.counts.inProgress} in progress` : 'no data'}</p>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <h2 className="m-0 px-4 pt-4 text-lg font-bold text-slate-900">Knowledge heatmap</h2>
            <p className="m-0 px-4 text-xs text-slate-600">M mastered · P proficient · D developing · E emerging · – not assessed. Hover or focus a cell for the estimate.</p>
            <table className="mt-3 text-sm border-separate border-spacing-1">
              <thead>
                <tr>
                  <th scope="col" className="text-left px-3 sticky left-0 bg-white">Student</th>
                  {data.objectives.map((o: any) => (
                    <th key={o.id} scope="col" title={o.title} className="px-1 text-xs font-bold text-slate-600">{o.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heatmap.map((row: any) => (
                  <tr key={row.studentId}>
                    <th scope="row" className="text-left px-3 font-semibold text-slate-900 whitespace-nowrap sticky left-0 bg-white">{row.name}</th>
                    {row.cells.map((c: any) => {
                      const meta = CELL[c.masteryStatus];
                      const detail = `${row.name}, ${data.objectives.find((o: any) => o.id === c.objectiveId)?.code}: ${meta.label}${c.masteryEstimate !== null ? `, estimate ${Math.round(c.masteryEstimate * 100)}%` : ''}, ${c.evidenceStrength} evidence${c.needsVerification ? ', needs verification' : ''}`;
                      return (
                        <td key={c.objectiveId} tabIndex={0} title={detail} aria-label={detail} className={`w-9 h-9 text-center rounded font-bold ${meta.tone}`}>
                          {meta.short}
                          {c.needsVerification ? '?' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.studentsTruncated && <p className="m-0 p-4 text-xs text-slate-500">Showing the first 500 students.</p>}
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="m-0 text-lg font-bold text-slate-900">Common gaps</h2>
              {data.commonGaps.length === 0 ? (
                <p className="text-sm text-slate-600">No gaps shown by assessed answers yet.</p>
              ) : (
                <ul className="m-0 mt-3 p-0 list-none space-y-3">
                  {data.commonGaps.map((g: any) => (
                    <li key={g.objectiveId} className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="m-0 font-semibold text-slate-900">{g.code} {g.title}</p>
                        <p className="m-0 text-sm text-slate-600">
                          {g.studentsWithGap.length} of {g.assessed} assessed: {g.studentsWithGap.map((s: any) => s.name).join(', ')}
                        </p>
                      </div>
                      <button onClick={() => setAssigning({ objectiveId: g.objectiveId, code: g.code, students: g.studentsWithGap })} className="h-9 px-3 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
                        Assign practice
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="m-0 text-lg font-bold text-slate-900">Possible misconceptions to review</h2>
              <p className="m-0 text-xs text-slate-600">Detected from answer patterns; not confirmed until you confirm them.</p>
              {data.misconceptionsToReview.length === 0 ? (
                <p className="text-sm text-slate-600">None detected.</p>
              ) : (
                <ul className="m-0 mt-3 p-0 list-none space-y-4">
                  {data.misconceptionsToReview.map((g: any) => (
                    <li key={`${g.objectiveId}-${g.description}`}>
                      <p className="m-0 font-semibold text-slate-900">{g.code}: {g.description}</p>
                      <ul className="m-0 mt-1 p-0 list-none space-y-1">
                        {g.items.map((m: any) => (
                          <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-slate-800">{m.name}</span>
                            <span className="text-slate-500">{m.status === 'confirmed' ? 'confirmed' : `possible (confidence ${Math.round(m.confidence * 100)}%, heuristic)`}</span>
                            {m.status === 'suspected' && (
                              <>
                                <button onClick={() => review(m.id, 'confirmed')} className="h-7 px-2 rounded border border-slate-300 text-xs font-semibold">Confirm</button>
                                <button onClick={() => review(m.id, 'dismissed')} className="h-7 px-2 rounded border border-slate-300 text-xs font-semibold">Dismiss</button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="m-0 text-lg font-bold text-slate-900">Interventions</h2>
            <p className="m-0 text-sm text-slate-600">
              {data.interventions.byStatus.map((s: any) => `${s.count} ${s.status.replace('_', ' ')}`).join(' · ')}
            </p>
            {data.interventions.list.length > 0 && (
              <table className="w-full mt-3 text-sm">
                <thead className="text-left text-slate-600">
                  <tr><th className="py-1">Student</th><th>Objective</th><th>Status</th><th>From</th><th>After reassessment</th></tr>
                </thead>
                <tbody>
                  {data.interventions.list.map((i: any) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="py-1.5">{i.name}</td>
                      <td>{i.code}</td>
                      <td>{i.status.replace('_', ' ')}</td>
                      <td>{i.assignedBy}</td>
                      <td>{i.outcome ? `${i.outcome.masteryStatus}${i.outcome.improved ? ' (improved)' : ''}` : 'not reassessed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="m-0 text-lg font-bold text-slate-900">Baseline to latest</h2>
            <p className="m-0 text-xs text-slate-600">{data.baselineToLatest.note}</p>
            <table className="w-full mt-3 text-sm">
              <thead className="text-left text-slate-600"><tr><th className="py-1">Objective</th><th>Students</th><th>Mean first estimate</th><th>Mean latest estimate</th></tr></thead>
              <tbody>
                {data.baselineToLatest.objectives.map((o: any) => (
                  <tr key={o.objectiveId} className="border-t border-slate-100">
                    <td className="py-1.5">{o.code}</td>
                    <td>{o.students}</td>
                    <td>{o.meanBaseline === null ? '—' : `${Math.round(o.meanBaseline * 100)}%`}</td>
                    <td>{o.meanLatest === null ? '—' : `${Math.round(o.meanLatest * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {assigning &&
        createPortal(
          <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="assign-title">
            <div className="w-full max-w-lg bg-white rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 id="assign-title" className="m-0 text-lg font-bold">Assign practice on {assigning.code}</h2>
                <button onClick={() => setAssigning(null)} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <p className="m-0 text-sm text-slate-700">To: {assigning.students.map((s) => s.name).join(', ')}</p>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Teaching strategy for the AI tutor (optional)
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className="h-10 px-3 rounded-md border border-slate-300 bg-white text-sm">
                  <option value="">Let Enara choose from the evidence</option>
                  {strategies.map((s) => <option key={s.id} value={s.id}>{s.id.replace(/_/g, ' ')}: {s.description}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Note to students (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="h-10 px-3 rounded-md border border-slate-300 text-sm" />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAssigning(null)} className="h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold">Cancel</button>
                <button onClick={assign} disabled={busy} className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50">
                  {busy ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
