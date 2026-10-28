import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OriginSelector } from '../../components/OriginSelector';
import { ApiError, fetchClassRoster, fetchOutcomes, fetchStudentTimeline, fetchTeachingClasses } from '../../services/apiService';
import type { OriginView } from '../../services/roleRouting';

// P4 outcomes: what was observed for the students in your scope. "Gap
// closed" only when an independent, unassisted reassessment verified it;
// otherwise "not yet verified". Counts only; demo data is out of the live view.
// Teachers: their classes. Admins and academic managers: the school.

const RANGES = [{ days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }, { days: 365, label: 'Last 12 months' }];
const EVENT_LABEL: Record<string, string> = {
  attempt_started: 'Started an assessment', attempt_submitted: 'Submitted', grading_released: 'Result released (graded automatically)', grading_exception: 'Grading needs attention',
  insufficient_evidence: 'Not scored: insufficient spoken evidence', intervention_created: 'Intervention assigned', intervention_completed: 'Intervention completed',
  reassessed: 'Reassessed', gap_detected: 'Gap observed', gap_closed_verified: 'Gap closed (verified by unassisted reassessment)',
};

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export const Outcomes: React.FC<{ allowClassFilter?: boolean; showTimeline?: boolean }> = ({ allowClassFilter = true, showTimeline = true }) => {
  const [origin, setOrigin] = useState<OriginView>('live');
  const [days, setDays] = useState(90);
  const [classes, setClasses] = useState<{ id: string; courseName: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [timeline, setTimeline] = useState<{ name: string; events: any[] } | null>(null);

  useEffect(() => { if (allowClassFilter) fetchTeachingClasses().then((r) => setClasses(r.classes)).catch(() => setClasses([])); }, [allowClassFilter]);
  useEffect(() => {
    setData(null);
    setError(null);
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    fetchOutcomes({ classId: classId || undefined, origin, from, page })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError && err.code === 'FEATURE_DISABLED' ? 'Outcomes are not enabled for your school.' : err instanceof Error ? err.message : 'Could not load outcomes'));
  }, [origin, days, classId, page]);
  useEffect(() => {
    setStudents([]);
    setTimeline(null);
    if (!showTimeline || !classId) return;
    fetchClassRoster(classId, origin)
      .then((r: any) => setStudents(((r.students ?? r.roster ?? []) as any[]).map((s) => ({ id: s.id ?? s.studentId, name: s.name ?? s.id })).filter((s) => s.id)))
      .catch(() => setStudents([]));
  }, [classId, origin, showTimeline]);

  const openTimeline = (s: { id: string; name: string }) =>
    fetchStudentTimeline(s.id).then((r) => setTimeline({ name: s.name, events: r.events })).catch((err) => setError(err instanceof Error ? err.message : 'Could not load timeline'));

  // Embedded (academic manager dashboard): stay out of the way when the feature is off.
  if (!allowClassFilter && error === 'Outcomes are not enabled for your school.') return null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Outcomes</h1>
          <p className="text-sm text-slate-600">Observed results. A gap counts as closed only after an independent, unassisted reassessment verifies it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OriginSelector value={origin} onChange={(v) => { setOrigin(v); setPage(1); }} />
          <select aria-label="Time range" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">{RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}</select>
          {allowClassFilter && classes.length > 0 && (
            <select aria-label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="">All my classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}</select>
          )}
        </div>
      </div>
      {origin !== 'live' && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{origin === 'demo_seed' ? 'Showing seeded demo data only.' : 'Showing live and seeded demo data together.'}</p>}
      {error ? <p className="text-slate-700">{error}</p> : !data ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Students in scope" value={data.scope.students} />
            <Stat label="Results released" value={data.grading.released} hint={`${data.grading.inProgress} grading · ${data.grading.exception} need attention`} />
            <Stat label="Interventions" value={data.interventions.total} hint={`${data.interventions.reassessed} reassessed · ${data.interventions.observedImprovement} observed improvement`} />
            <Stat label="Speaking exams" value={data.speaking.attempts} hint={`${data.speaking.spokenGraded} spoken · ${data.speaking.accommodationGraded} typed accommodation · ${data.speaking.insufficientEvidence} insufficient evidence`} />
          </div>
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="font-semibold text-slate-900 mb-2">Learning objectives</h2>
            {!data.objectives.items.length ? <p className="text-sm text-slate-600">No gaps observed in this period.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Objective</th><th className="py-1 pr-3">Students with a gap</th><th className="py-1 pr-3">Gap closed (verified)</th><th className="py-1 pr-3">Not yet verified</th><th className="py-1 pr-3">Median time to understand</th></tr></thead>
                  <tbody>
                    {data.objectives.items.map((o: any) => (
                      <tr key={o.objectiveId} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{o.code ? `${o.code} · ` : ''}{o.title ?? o.objectiveId}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{o.studentsWithGap}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-emerald-800">{o.gapClosed}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{o.notYetVerified + o.endedUnverified}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{o.ttuAvailable ? `${Math.round(o.medianActiveSecondsToUnderstand / 60)} min active` : 'Not available yet'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.objectives.total > data.objectives.pageSize && (
              <div className="flex justify-end gap-2 mt-2 text-sm">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 border rounded disabled:opacity-40">Previous</button>
                <button disabled={page * data.objectives.pageSize >= data.objectives.total} onClick={() => setPage(page + 1)} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">{data.note}</p>
          </section>
          {showTimeline && classId && students.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h2 className="font-semibold text-slate-900">Student timeline</h2>
              <div className="flex flex-wrap gap-2">{students.map((s) => <button key={s.id} onClick={() => openTimeline(s)} className="px-2 py-1 text-sm border border-slate-300 rounded-lg">{s.name}</button>)}</div>
              {timeline && (
                <ol className="space-y-1 text-sm">
                  <li className="font-medium text-slate-800">{timeline.name}</li>
                  {!timeline.events.length && <li className="text-slate-600">No events yet.</li>}
                  {timeline.events.map((e, i) => <li key={i} className="text-slate-700"><span className="text-xs text-slate-500 tabular-nums">{new Date(e.at).toLocaleString()} · </span>{EVENT_LABEL[e.type] ?? e.type}{e.detail?.mode ? ` (${e.detail.mode.replace('_', ' ')})` : ''}</li>)}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default Outcomes;
