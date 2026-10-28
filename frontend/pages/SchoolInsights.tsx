import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchCurriculums, fetchCurriculumProcessing, fetchSchoolAnalytics, fetchShadowComparison, isFeatureDisabled, processCurriculumFiles } from '../services/apiService';
import { toast } from '../services/toastService';

// School-wide learning analytics for admins. Every number has its definition
// next to it; zeros are shown as "nothing recorded yet", never filled in.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

const STATUS_LABEL: Record<string, string> = {
  mastered: 'Mastered', proficient: 'Proficient', developing: 'Developing', emerging: 'Emerging',
  suspected: 'Suspected', confirmed: 'Confirmed', resolved: 'Resolved', dismissed: 'Dismissed',
  assigned: 'Assigned', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
  done: 'Text extracted', pending: 'Waiting', processing: 'Processing', failed: 'Failed', unsupported: 'Not supported', no_text: 'Not readable',
};
const label = (k: string) => STATUS_LABEL[k] ?? k.replace(/_/g, ' ');

const Tile: React.FC<{ title: string; value: React.ReactNode; definition: string }> = ({ title, value, definition }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <div className="text-xs font-semibold text-slate-500">{title}</div>
    <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
    <p className="text-[11px] text-slate-500 mt-2 leading-snug">{definition}</p>
  </div>
);

const Counts: React.FC<{ title: string; counts: Record<string, number>; definition: string; extra?: React.ReactNode }> = ({ title, counts, definition, extra }) => {
  const entries = Object.entries(counts || {});
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {entries.length ? (
        <ul className="mt-2 space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between text-sm text-slate-700"><span>{label(k)}</span><span className="tabular-nums font-medium">{v}</span></li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p>
      )}
      {extra}
      <p className="text-[11px] text-slate-500 mt-3 leading-snug">{definition}</p>
    </div>
  );
};

export const SchoolInsights: React.FC<{ isEnaraAdmin?: boolean }> = ({ isEnaraAdmin }) => {
  const [curricula, setCurricula] = useState<{ id: string; name: string; institutionId?: string }[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<any>(null);
  const [shadow, setShadow] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);
  const [curriculumId, setCurriculumId] = useState('');
  const [files, setFiles] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCurriculums()
      .then((list) => {
        setCurricula(list);
        if (isEnaraAdmin) setInstitutionId(list.find((c) => c.institutionId)?.institutionId ?? '');
      })
      .catch(() => setCurricula([]));
  }, [isEnaraAdmin]);

  useEffect(() => {
    if (isEnaraAdmin && !institutionId) return;
    setData(null);
    setShadow(null);
    fetchShadowComparison(isEnaraAdmin ? institutionId : undefined).then(setShadow).catch(() => setShadow(null));
    fetchSchoolAnalytics(isEnaraAdmin ? institutionId : undefined)
      .then(setData)
      .catch((err) => {
        if (isFeatureDisabled(err)) setDisabled(true);
        else toast.error('Could not load analytics', errorText(err));
      });
  }, [institutionId, isEnaraAdmin]);

  const schoolCurricula = curricula.filter((c) => !isEnaraAdmin || c.institutionId === institutionId);
  useEffect(() => {
    setCurriculumId(schoolCurricula[0]?.id ?? '');
  }, [institutionId, curricula.length]);
  useEffect(() => {
    if (!curriculumId) return setFiles(null);
    fetchCurriculumProcessing(curriculumId).then((r) => setFiles(r.files)).catch(() => setFiles(null));
  }, [curriculumId]);

  const process = async (retryFailed: boolean) => {
    setBusy(true);
    try {
      const r = await processCurriculumFiles(curriculumId, retryFailed);
      setFiles(r.files);
      toast.success('Processing started', `${r.processed} file(s) processed now; the rest continue in the daily job.`);
    } catch (err) {
      toast.error('Could not process files', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">Learning insights aren't enabled for your school.</p>;
  const institutions = [...new Set(curricula.map((c) => c.institutionId).filter(Boolean))] as string[];
  const d = data?.definitions ?? {};
  const m = data?.metrics;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">School Insights</h1>
          <p className="text-sm text-slate-600 mt-1">Learning analytics from recorded evidence. Mastery figures are estimates from a scoring rule, not probabilities or grades.</p>
        </div>
        {isEnaraAdmin && (
          <label className="text-sm text-slate-700">
            School{' '}
            <select className="ml-2 border border-slate-300 rounded-lg px-2 py-1" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
              {institutions.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        )}
      </div>

      {!m ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile title="Students with evidence" value={`${m.studentsWithEvidence} of ${m.studentsTotal}`} definition={d.studentsWithEvidence} />
            <Tile title="Objectives with evidence" value={`${m.objectivesWithEvidence} of ${m.objectivesApproved}`} definition={d.objectivesWithEvidence} />
            <Tile title="Diagnostics completed (30 days)" value={m.diagnosticsCompletedLast30Days} definition={d.diagnosticsCompletedLast30Days} />
            <Tile title="Reviews due / overdue" value={`${m.retention.due} / ${m.retention.overdue}`} definition={d.retention} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Counts title="Mastery estimates" counts={m.masteryDistribution} definition={d.masteryDistribution} />
            <Counts title="Evidence in the last 30 days" counts={m.evidenceLast30Days} definition={d.evidenceLast30Days} />
            <Counts title="Interventions" counts={m.interventions.byStatus} definition={d.interventions}
              extra={<p className="mt-2 text-sm text-slate-700">Reassessed: <b>{m.interventions.reassessed}</b> · improved: <b>{m.interventions.improved}</b></p>} />
            <Counts title="Possible misconceptions" counts={m.misconceptions} definition={d.misconceptions} />
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-800">Objectives</h2>
            <p className="text-[11px] text-slate-500 mt-1">{d.objectives}</p>
            {data.objectives.length ? (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Code</th><th className="py-1 pr-3">Objective</th><th className="py-1 pr-3 text-right">Students assessed</th><th className="py-1 text-right">Proficient or mastered</th></tr></thead>
                  <tbody>
                    {data.objectives.map((o: any) => (
                      <tr key={o.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 font-mono text-xs">{o.code}</td>
                        <td className="py-1.5 pr-3">{o.title}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{o.studentsAssessed || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums">{o.studentsAssessed ? o.proficientOrMastered : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No approved objectives yet. Teachers add and approve them under Learning Objectives.</p>
            )}
          </section>
        </>
      )}

      {shadow && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-800">Estimates vs. assessment scores</h2>
          <p className="text-[11px] text-slate-500 mt-1">{shadow.definitions.caveat}</p>
          {shadow.statesCompared ? (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Agree: <b>{shadow.agree}</b> · Disagree: <b>{shadow.disagree}</b> · No related score: <b>{shadow.noScore}</b>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{shadow.definitions.agree}</p>
              {shadow.toReview.length ? (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Student</th><th className="py-1 pr-3">Objective</th><th className="py-1 pr-3">Estimate</th><th className="py-1 pr-3">Evidence</th><th className="py-1">Assessment score</th></tr></thead>
                    <tbody>
                      {shadow.toReview.map((r: any) => (
                        <tr key={`${r.studentId}-${r.objectiveId}`} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3">{r.name ?? r.studentId}</td>
                          <td className="py-1.5 pr-3 font-mono text-xs">{r.code}</td>
                          <td className="py-1.5 pr-3">{label(r.masteryStatus)}</td>
                          <td className="py-1.5 pr-3">{r.evidenceStrength}</td>
                          <td className="py-1.5">{r.assessmentScore}% ({r.assessmentTitle})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-500 mt-2">{shadow.definitions.toReview}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No strong disagreements to review.</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No estimates to compare yet.</p>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Course materials for the tutor</h2>
            <p className="text-[11px] text-slate-500 mt-1">Text is extracted from uploaded PDF and text files so the tutor can quote and cite them. Scanned PDFs without a text layer can't be read yet.</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="border border-slate-300 rounded-lg px-2 py-1 text-sm" value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
              {schoolCurricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button disabled={!curriculumId || busy} onClick={() => process(false)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">
              {busy ? 'Working…' : 'Process files'}
            </button>
            <button disabled={!curriculumId || busy} onClick={() => process(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-50">Retry failed</button>
          </div>
        </div>
        {!curriculumId ? (
          <p className="mt-3 text-sm text-slate-500">No curricula yet.</p>
        ) : !files ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : !files.length ? (
          <p className="mt-3 text-sm text-slate-500">No files recorded for processing yet. Press "Process files" to scan this curriculum's uploads.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-slate-800">{f.fileName}</span>
                <span className="text-slate-600">
                  {label(f.status)}
                  {f.status === 'done' ? ` · ${f.pagesWithText ?? '?'} page(s), ${f.chunkCount} passage(s)` : ''}
                  {f.detail ? ` · ${f.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
