import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import {
  assignmentAction,
  createClassAssignment,
  fetchAuthoringAssessments,
  fetchClassAssignment,
  fetchClassAssignments,
  fetchTeachingClasses,
  grantAssignmentExtension,
  isFeatureDisabled,
  releaseAllResults,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { SubmissionReview } from './GradingReview';
import { DEFAULT_SPEAKING, SpeakingAttemptsPanel, SpeakingPreview, SpeakingSettingsFields, speakingPayload } from './SpeakingExamSettings';

// Class assignments (Phase 3): give a published assessment version to a
// class, follow real submission statuses, extend, close and release.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const STATUS: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', grading: 'Grading', grading_delayed: 'Grader stopped', awaiting_review: 'Awaiting review',
  graded: 'Final, not released', released: 'Released', missing: 'Missing',
};
const A_STATUS: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', active: 'Open', closed: 'Closed', archived: 'Archived' };
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-bold text-slate-900">{title}</h2><button aria-label="Close" onClick={onClose}><X className="w-5 h-5" /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CreateAssignment({ classes, onDone, onClose }: { classes: any[]; onDone: () => void; onClose: () => void }) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const now = new Date();
  const [f, setF] = useState<any>({
    classId: classes[0]?.id ?? '', assessmentId: '', title: '', instructions: '',
    opensAt: toLocalInput(now), dueAt: toLocalInput(new Date(now.getTime() + 7 * 86400000)), closesAt: '',
    latePolicy: 'not_accepted', maxAttempts: 1, timeLimitMinutes: '', answerReveal: 'after-close', tutorPolicy: 'hints_only', format: 'written', draft: false,
  });
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(DEFAULT_SPEAKING);
  useEffect(() => { fetchAuthoringAssessments('published').then(setAssessments).catch(() => setAssessments([])); }, []);
  const cls = classes.find((c) => c.id === f.classId);
  // Only assessments with a published version can be assigned.
  const usable = assessments.filter((a) => a.publishedVersion > 0 && (!cls?.curriculumId || !a.curriculumId || a.curriculumId === cls.curriculumId));
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      await createClassAssignment({
        classId: f.classId, assessmentId: f.assessmentId, title: f.title || undefined, instructions: f.instructions || undefined,
        opensAt: new Date(f.opensAt).toISOString(), dueAt: new Date(f.dueAt).toISOString(),
        closesAt: f.latePolicy === 'accept_late' && f.closesAt ? new Date(f.closesAt).toISOString() : undefined,
        timeZone: localTz, latePolicy: f.latePolicy, maxAttempts: Number(f.maxAttempts),
        timeLimitMinutes: f.timeLimitMinutes ? Number(f.timeLimitMinutes) : undefined,
        answerReveal: f.answerReveal, tutorPolicy: f.tutorPolicy, format: f.format, draft: f.draft,
        ...(f.format === 'english_conversation' ? { speaking: speakingPayload(speaking) } : {}),
      });
      toast.success(f.draft ? 'Saved as draft' : 'Assigned', f.draft ? 'Publish it when ready.' : 'Students will see it from the opening time.');
      onDone();
    } catch (err) {
      toast.error('Not assigned', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const field = 'mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm';
  return (
    <Modal title="New assignment" onClose={onClose}>
      <label className="block text-sm">Class<select className={field} value={f.classId} onChange={(e) => set('classId', e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}</select></label>
      <label className="block text-sm">Assessment (published)<select className={field} value={f.assessmentId} onChange={(e) => set('assessmentId', e.target.value)}><option value="">Choose…</option>{usable.map((a) => <option key={a.id} value={a.id}>{a.title} (v{a.publishedVersion})</option>)}</select></label>
      {!usable.length && <p className="text-xs text-amber-700">No published assessments for this class's curriculum yet. Publish one in the Assessment Builder.</p>}
      <label className="block text-sm">Title (optional)<input className={field} value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
      <label className="block text-sm">Instructions<textarea dir="auto" className={field} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Opens<input type="datetime-local" className={field} value={f.opensAt} onChange={(e) => set('opensAt', e.target.value)} /></label>
        <label className="block text-sm">Due<input type="datetime-local" className={field} value={f.dueAt} onChange={(e) => set('dueAt', e.target.value)} /></label>
      </div>
      <p className="text-xs text-slate-500">Times are in {localTz}.</p>
      <label className="block text-sm">Late work<select className={field} value={f.latePolicy} onChange={(e) => set('latePolicy', e.target.value)}><option value="not_accepted">Not accepted after the due date</option><option value="accept_late">Accepted and marked late</option></select></label>
      {f.latePolicy === 'accept_late' && <label className="block text-sm">Accept late work until<input type="datetime-local" className={field} value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} /></label>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Attempts<input type="number" min={1} max={10} className={field} value={f.maxAttempts} onChange={(e) => set('maxAttempts', e.target.value)} /></label>
        <label className="block text-sm">Time limit (minutes)<input type="number" min={1} max={600} className={field} value={f.timeLimitMinutes} placeholder="None" onChange={(e) => set('timeLimitMinutes', e.target.value)} /></label>
      </div>
      <p className="text-sm text-slate-600">Results: Enara grades each submission and releases it to the student once it passes its checks. You can correct any grade afterwards.</p>
      <label className="block text-sm">Correct answers shown<select className={field} value={f.answerReveal} onChange={(e) => set('answerReveal', e.target.value)}><option value="after-close">After the assignment closes</option><option value="after-submit">After the last attempt</option><option value="never">Never</option></select></label>
      <label className="block text-sm">How students answer<select className={field} value={f.format} onChange={(e) => set('format', e.target.value)}><option value="written">Written answers</option><option value="conversation">Conversation with an AI examiner (open and short answers only)</option><option value="english_conversation">English speaking exam (voice)</option></select></label>
      {f.format === 'english_conversation' && <SpeakingSettingsFields value={speaking} onChange={setSpeaking} classId={f.classId} />}
      {f.format === 'english_conversation' && <SpeakingPreview assessmentId={f.assessmentId} speaking={speaking} />}
      <label className="block text-sm">AI tutor while open<select className={field} value={f.tutorPolicy} onChange={(e) => set('tutorPolicy', e.target.value)}><option value="hints_only">Hints only</option><option value="allowed">Allowed</option><option value="blocked">Not available</option></select></label>
      <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={f.draft} onChange={(e) => set('draft', e.target.checked)} /> Save as draft (not visible to students)</label>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-slate-300">Cancel</button><button disabled={busy || !f.assessmentId} onClick={save} className="px-3 py-2 text-sm rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">{f.draft ? 'Save draft' : 'Assign'}</button></div>
    </Modal>
  );
}

export const ClassAssignments: React.FC = () => {
  const [classes, setClasses] = useState<any[] | null>(null);
  const [classId, setClassId] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [extend, setExtend] = useState<{ studentId: string; name: string } | null>(null);
  const [ext, setExt] = useState({ dueAt: toLocalInput(new Date(Date.now() + 2 * 86400000)), reason: '' });

  useEffect(() => {
    fetchTeachingClasses()
      .then((r) => { setClasses(r.classes); if (r.classes[0]) setClassId(r.classes[0].id); })
      .catch((err) => { if (isFeatureDisabled(err)) setDisabled(true); setClasses([]); });
  }, []);
  const loadList = () => classId && fetchClassAssignments(classId).then((r) => setList(r.assignments)).catch((err) => toast.error('Could not load', errorText(err)));
  useEffect(() => { setList(null); setDetail(null); loadList(); }, [classId]);
  const openDetail = (id: string) => fetchClassAssignment(id).then(setDetail).catch((err) => toast.error('Could not open', errorText(err)));
  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      const r = await fn();
      toast.success(ok, r?.released !== undefined ? `${r.released} released${r.stillToFinalize ? `, ${r.stillToFinalize} still to finalize` : ''}.` : '');
      if (detail) openDetail(detail.assignment.id);
      loadList();
    } catch (err) {
      toast.error('Not done', errorText(err));
    }
  };

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The teaching workflow isn't enabled for your school.</p>;
  if (classes === null) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (!classes.length) return <p className="max-w-4xl mx-auto p-8 text-slate-700">No classes to show. Teachers see the classes they teach.</p>;
  if (review) return <div className="max-w-4xl mx-auto p-6"><SubmissionReview attemptId={review} onClose={() => { setReview(null); if (detail) openDetail(detail.assignment.id); }} /></div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Class assignments</h1>
          <p className="text-sm text-slate-600">Statuses come from students' actual submissions.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">{classes.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}</select>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> New assignment</button>
        </div>
      </div>
      {creating && <CreateAssignment classes={classes} onClose={() => setCreating(false)} onDone={() => { setCreating(false); loadList(); }} />}

      {!list ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : !list.length ? (
        <p className="text-slate-600">No assignments for this class yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id}>
                <button onClick={() => openDetail(a.id)} className={`w-full text-left bg-white border rounded-xl p-3 ${detail?.assignment.id === a.id ? 'border-indigo-500' : 'border-slate-200'}`}>
                  <span className="block font-semibold text-slate-900">{a.title}</span>
                  <span className="text-xs text-slate-600">{A_STATUS[a.status]} · due {new Date(a.dueAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
          {detail && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{detail.assignment.title}</h2>
                  <p className="text-sm text-slate-600">{A_STATUS[detail.assignment.status]} · version {detail.assignment.assessmentVersion} · due {new Date(detail.assignment.dueAt).toLocaleString()} ({detail.assignment.timeZone}) · results released automatically</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.assignment.state === 'draft' && <button onClick={() => act(() => assignmentAction(detail.assignment.id, 'publish'), 'Published')} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm">Publish</button>}
                  {detail.assignment.state === 'published' && <button onClick={() => window.confirm('Close now? Students can no longer submit.') && act(() => assignmentAction(detail.assignment.id, 'close'), 'Closed')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Close</button>}
                  {detail.assignment.state === 'closed' && <button onClick={() => act(() => assignmentAction(detail.assignment.id, 'reopen'), 'Reopened')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Reopen</button>}
                  <button onClick={() => act(() => releaseAllResults(detail.assignment.id), 'Results released')} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm">Release final results</button>
                  {detail.assignment.state !== 'archived' && <button onClick={() => window.confirm('Archive? Submissions and grades are kept.') && act(() => assignmentAction(detail.assignment.id, 'archive'), 'Archived')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Archive</button>}
                </div>
              </div>
              <p className="text-sm text-slate-700">
                {detail.summary.students} students · {detail.summary.notStarted} not started · {detail.summary.inProgress} in progress · {detail.summary.awaitingReview} awaiting review · {detail.summary.graded} final · {detail.summary.released} released · {detail.summary.missing} missing{detail.summary.late ? ` · ${detail.summary.late} late` : ''}
              </p>
              {detail.assignment.format === 'english_conversation' && <SpeakingAttemptsPanel assignmentId={detail.assignment.id} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Student</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Due</th><th className="py-1 pr-3">Score</th><th className="py-1"></th></tr></thead>
                  <tbody>
                    {detail.roster.map((r: any) => (
                      <tr key={r.studentId} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                        <td className="py-1.5 pr-3">{STATUS[r.status] ?? r.status}{r.late ? ' · late' : ''}</td>
                        <td className="py-1.5 pr-3">{new Date(r.dueAt).toLocaleDateString()}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{r.score ?? '—'}</td>
                        <td className="py-1.5 space-x-3 whitespace-nowrap">
                          {r.latestAttemptId && <button onClick={() => setReview(r.latestAttemptId)} className="text-indigo-700 font-semibold">Review</button>}
                          <button onClick={() => setExtend({ studentId: r.studentId, name: r.name })} className="text-slate-600">Extend</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
      {extend && detail && (
        <Modal title={`Extension for ${extend.name}`} onClose={() => setExtend(null)}>
          <label className="block text-sm">New due date<input type="datetime-local" className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value={ext.dueAt} onChange={(e) => setExt({ ...ext, dueAt: e.target.value })} /></label>
          <label className="block text-sm">Reason<input className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value={ext.reason} onChange={(e) => setExt({ ...ext, reason: e.target.value })} /></label>
          <p className="text-xs text-slate-500">The original due date is kept; this extension is recorded with your name and the reason.</p>
          <div className="flex justify-end"><button disabled={!ext.reason} onClick={() => act(() => grantAssignmentExtension(detail.assignment.id, extend.studentId, new Date(ext.dueAt).toISOString(), ext.reason), 'Extension granted').then(() => setExtend(null))} className="px-3 py-2 text-sm rounded-lg bg-indigo-700 text-white font-semibold disabled:opacity-50">Grant</button></div>
        </Modal>
      )}
    </div>
  );
};
