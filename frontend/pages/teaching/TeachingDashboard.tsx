import React, { useEffect, useState } from 'react';
import { OriginSelector } from '../../components/OriginSelector';
import { OriginView } from '../../services/roleRouting';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import {
  createEducatorIntervention,
  fetchClassObjectives,
  fetchClassRoster,
  fetchLearnerProfile,
  fetchTeachingOverview,
  isFeatureDisabled,
  updateEducatorIntervention,
} from '../../services/apiService';
import { toast } from '../../services/toastService';

// Teaching dashboard (Phase 3): the teacher's classes, review backlog,
// deadlines and follow-ups; class rosters; learner profiles that keep what was
// observed, assessment results, model estimates and recommendations apart.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const ACTIONS: Record<string, string> = {
  revisit_lesson: 'Revisit a lesson', prerequisite_practice: 'Prerequisite practice', targeted_exercise: 'Targeted exercise',
  check_in: 'Check-in', tutor_support: 'AI tutor support', spaced_review: 'Spaced review', reassessment: 'Reassessment', teacher_assigned: 'Practice',
};
const SUB: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', grading: 'Grading', grading_delayed: 'Grader stopped', awaiting_review: 'Awaiting review', graded: 'Final', released: 'Released', missing: 'Missing',
};

function Section({ title, kind, children }: { title: string; kind: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{title}</h3><span className="text-[11px] uppercase tracking-wide text-slate-400">{kind}</span></div>
      <div className="mt-2 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function Profile({ studentId, classId, origin, onClose }: { studentId: string; classId: string; origin: OriginView; onClose: () => void }) {
  const [p, setP] = useState<any>(null);
  const [objectives, setObjectives] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);
  // A student outside the chosen data view is not shown (the server returns 404).
  const load = () => fetchLearnerProfile(studentId, origin).then(setP).catch((err) => { toast.error('Could not load profile', errorText(err)); onClose(); });
  useEffect(() => { load(); fetchClassObjectives(classId).then((r) => setObjectives(r.objectives)).catch(() => setObjectives([])); }, [studentId, origin]);
  const save = async () => {
    try {
      await createEducatorIntervention({ studentId, action: form.action, objectiveId: form.objectiveId || undefined, rationale: form.rationale, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined });
      toast.success('Follow-up added', '');
      setForm(null);
      load();
    } catch (err) {
      toast.error('Not added', errorText(err));
    }
  };
  const close = async (id: string, status: string) => {
    const note = window.prompt(status === 'completed' ? 'What happened? (optional)' : 'Why cancel? (optional)') ?? undefined;
    try {
      await updateEducatorIntervention(id, { status, outcomeNote: note || undefined });
      load();
    } catch (err) {
      toast.error('Not updated', errorText(err));
    }
  };
  if (!p) return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <button onClick={onClose} className="text-sm text-indigo-700 font-semibold">← Class</button>
          <h2 className="text-xl font-bold text-slate-900 mt-1">{p.student.name}</h2>
          <p className="text-xs text-slate-500 max-w-2xl">{p.note}</p>
        </div>
        <button onClick={() => setForm({ action: 'check_in', objectiveId: '', rationale: '', dueAt: '' })} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold">Add follow-up</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Submissions" kind="Observed">
          {!p.observed.submissions.length ? <p className="text-slate-500">No assignments yet.</p> : (
            <ul className="space-y-1">{p.observed.submissions.map((s: any) => <li key={s.assignmentId} className="flex justify-between gap-2"><span>{s.title}</span><span className="text-slate-600">{SUB[s.status] ?? s.status}{s.late ? ' · late' : ''}</span></li>)}</ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Activity in the last 30 days: {p.observed.activityLast30Days.length ? p.observed.activityLast30Days.map((a: any) => `${a.type.replace(/_/g, ' ')} ×${a.count}`).join(', ') : 'none recorded'}.</p>
        </Section>
        <Section title="Assessment results" kind="Results">
          {!p.results.length ? <p className="text-slate-500">No submitted work yet.</p> : (
            <ul className="space-y-1">{p.results.map((r: any) => <li key={r.attemptId} className="flex justify-between gap-2"><span>{r.title}</span><span className="tabular-nums text-slate-600">{r.final ? `${r.score ?? '—'}%` : 'not final yet'}{r.final && !r.released ? ' · not released' : ''}{r.late ? ' · late' : ''}</span></li>)}</ul>
          )}
        </Section>
        <Section title="Objective estimates" kind="Model estimates">
          {!p.estimates.enabled ? <p className="text-slate-500">Learning intelligence isn't on for your school.</p> : !p.estimates.items.length ? <p className="text-slate-500">No evidence on any objective yet.</p> : (
            <ul className="space-y-1">{p.estimates.items.map((e: any) => <li key={e.objectiveId} className="flex justify-between gap-2"><span>{e.code} {e.title}</span><span className="text-slate-600">{e.status} · {e.evidenceStrength} evidence</span></li>)}</ul>
          )}
          {p.misconceptions.enabled && p.misconceptions.items.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">{p.misconceptions.items.map((m: any) => <li key={m.id}>Possible misconception ({m.status === 'confirmed' ? 'confirmed' : 'not confirmed'}), {m.code}: {m.description}</li>)}</ul>
          )}
        </Section>
        <Section title="Recommended next steps" kind="Recommendations">
          {!p.recommendations.enabled ? <p className="text-slate-500">Recommendations aren't on for your school.</p> : !p.recommendations.items.length ? <p className="text-slate-500">Nothing to recommend from the evidence so far.</p> : (
            <ul className="space-y-1">{p.recommendations.items.slice(0, 5).map((r: any, i: number) => <li key={i}>{r.explanation}</li>)}</ul>
          )}
        </Section>
      </div>
      <Section title="Follow-ups and interventions" kind="Actions">
        {!p.interventions.length ? <p className="text-slate-500">None yet.</p> : (
          <ul className="space-y-2">
            {p.interventions.map((i: any) => (
              <li key={i.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{ACTIONS[i.action] ?? i.action}{i.objective?.code ? ` · ${i.objective.code}` : ''}</span>
                  <span className="text-slate-600">{i.status}{i.dueAt ? ` · due ${new Date(i.dueAt).toLocaleDateString()}` : ''}</span>
                </div>
                {i.rationale && <p className="text-xs text-slate-600">Why: {i.rationale}</p>}
                {i.outcomeNote && <p className="text-xs text-slate-600">Outcome: {i.outcomeNote}</p>}
                {['assigned', 'in_progress'].includes(i.status) && Object.keys(ACTIONS).slice(0, 7).includes(i.action) && (
                  <div className="space-x-3 text-xs mt-1"><button onClick={() => close(i.id, 'completed')} className="text-indigo-700 font-semibold">Mark done</button><button onClick={() => close(i.id, 'cancelled')} className="text-slate-600">Cancel</button></div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {form && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000]" role="dialog" aria-modal="true" aria-label="Add follow-up">
          <div className="bg-white rounded-xl p-5 max-w-md w-full space-y-3">
            <div className="flex justify-between"><h2 className="font-bold">Follow-up for {p.student.name}</h2><button aria-label="Close" onClick={() => setForm(null)}><X className="w-5 h-5" /></button></div>
            <label className="block text-sm">Action<select className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>{Object.entries(ACTIONS).slice(0, 7).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block text-sm">Objective{form.action === 'check_in' ? ' (optional)' : ''}<select className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={form.objectiveId} onChange={(e) => setForm({ ...form, objectiveId: e.target.value })}><option value="">—</option>{objectives.map((o) => <option key={o.id} value={o.id}>{o.code} {o.title}</option>)}</select></label>
            <label className="block text-sm">Why (rationale)<textarea className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} /></label>
            <label className="block text-sm">Follow up by<input type="date" className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
            <div className="flex justify-end"><button disabled={!form.rationale} onClick={save} className="px-3 py-2 text-sm rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">Add</button></div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export const TeachingDashboard: React.FC = () => {
  const [o, setO] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [roster, setRoster] = useState<any>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  // Live data unless the teacher deliberately picks demo data; every request states its view.
  const [origin, setOrigin] = useState<OriginView>('live');
  useEffect(() => {
    setO(null);
    fetchTeachingOverview(origin).then(setO).catch((err) => { if (isFeatureDisabled(err)) setDisabled(true); else toast.error('Could not load', errorText(err)); setO({ classes: [] }); });
  }, [origin]);
  useEffect(() => { if (classId) { setRoster(null); fetchClassRoster(classId, origin).then(setRoster).catch((err) => toast.error('Could not load class', errorText(err))); } }, [classId, origin]);
  const selector = <OriginSelector value={origin} onChange={setOrigin} />;

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The teaching workflow isn't enabled for your school.</p>;
  if (!o) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (studentId && classId) return <div className="max-w-6xl mx-auto p-6 space-y-3">{selector}<Profile studentId={studentId} classId={classId} origin={origin} onClose={() => setStudentId(null)} /></div>;

  if (classId) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><button onClick={() => setClassId(null)} className="text-sm text-indigo-700 font-semibold">← Overview</button>{selector}</div>
        {!roster ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">{roster.class.courseName}</h1>
            <p className="text-sm text-slate-600">{roster.students.length} students · {roster.assignments} assignments</p>
            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="p-3">Student</th><th className="p-3">Submitted</th><th className="p-3">Late</th><th className="p-3">Missing</th><th className="p-3">Last active</th><th className="p-3">Open follow-ups</th></tr></thead>
                <tbody>
                  {roster.students.map((s: any) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="p-3"><button onClick={() => setStudentId(s.id)} className="font-semibold text-indigo-700">{s.name}</button></td>
                      <td className="p-3 tabular-nums">{s.submitted}</td>
                      <td className="p-3 tabular-nums">{s.late}</td>
                      <td className={`p-3 tabular-nums ${s.missing ? 'text-rose-700 font-semibold' : ''}`}>{s.missing}</td>
                      <td className="p-3">{s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString() : '—'}</td>
                      <td className="p-3 tabular-nums">{s.openInterventions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teaching dashboard</h1>
          <p className="text-sm text-slate-600">{o.note}</p>
        </div>
        {selector}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Grader stopped', o.review?.exceptions], ['Review requests', o.review?.openAppeals], ['Being graded', o.review?.grading], ['Oldest waiting for you', o.review?.oldestWaitingHours == null ? '—' : `${o.review.oldestWaitingHours} h`]].map(([l, v]) => (
          <div key={l as string} className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-xs font-semibold text-slate-500">{l}</div><div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{v ?? 0}</div></div>
        ))}
      </div>
      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Your classes</h2>
        {!o.classes.length ? <p className="text-slate-600">No classes. Teachers see the classes they teach.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {o.classes.map((c: any) => (
              <button key={c.id} onClick={() => setClassId(c.id)} className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400">
                <div className="font-semibold text-slate-900">{c.courseName}</div>
                <div className="text-sm text-slate-600 mt-1">{c.students} students · {c.activeAssignments} open · {c.awaitingReview} awaiting review · <span className={c.missing ? 'text-rose-700 font-semibold' : ''}>{c.missing} missing</span></div>
                {c.nextDue && <div className="text-xs text-slate-500 mt-1">Next due: {c.nextDue.title}, {new Date(c.nextDue.dueAt).toLocaleString()}</div>}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-800">Due in the next 7 days</h2>
          {!o.upcoming?.length ? <p className="text-sm text-slate-500 mt-2">Nothing due.</p> : <ul className="mt-2 text-sm space-y-1">{o.upcoming.map((u: any) => <li key={u.id} className="flex justify-between"><span>{u.title}</span><span className="text-slate-600">{new Date(u.dueAt).toLocaleString()}</span></li>)}</ul>}
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-800">Your follow-ups</h2>
          {!o.followUps?.length ? <p className="text-sm text-slate-500 mt-2">None open.</p> : <ul className="mt-2 text-sm space-y-1">{o.followUps.map((f: any) => <li key={f.id} className="flex justify-between gap-2"><span>{f.studentName}: {ACTIONS[f.action] ?? f.action}</span><span className={f.overdue ? 'text-rose-700' : 'text-slate-600'}>{f.dueAt ? new Date(f.dueAt).toLocaleDateString() : ''}{f.overdue ? ' · overdue' : ''}</span></li>)}</ul>}
        </section>
      </div>
    </div>
  );
};
