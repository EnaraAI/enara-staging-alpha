import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Sparkles, X } from 'lucide-react';
import {
  ApiError,
  archiveAssessmentById,
  createAssessment,
  duplicateAssessmentById,
  fetchAssessmentDetail,
  fetchAssessmentVersions,
  fetchAuthoringAssessments,
  fetchClassObjectives,
  fetchTeachingClasses,
  generateAssessmentDraft,
  regenerateAssessmentQuestion,
  isFeatureDisabled,
  publishAssessmentVersion,
  updateAssessment,
  validateAssessmentDraft,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { SourcePicker } from '../../components/SourcePicker';
import { UsageChip } from '../../components/UsageChip';

// Assessment builder (Phase 3): drafts, questions with points and rubrics,
// validation, publishing versions. Students only see published versions.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const TYPES = [
  ['multiple-choice', 'Multiple choice'],
  ['true-false', 'True / false'],
  ['short-answer', 'Short answer (exact match)'],
  ['open-response', 'Open response (rubric)'],
] as const;

type Level = { id: string; label: string; points: number; description?: string };
type Criterion = { id: string; title: string; description?: string; levels: Level[] };
type Q = { id: string; type: string; text: string; options?: string[]; correctAnswer?: string; explanation?: string; modelAnswer?: string; points?: number; rubric?: { criteria: Criterion[] }; source?: string; objectiveIds?: string[]; sources?: { chunkId: string; uploadId?: string; fileName: string; page?: number | null; section?: string }[]; sourceStatus?: 'supported' | 'no_supporting_source' };

function AiDraftForm({ classes, onDone, onClose }: { classes: any[]; onDone: (assessmentId: string) => void; onClose: () => void }) {
  const withCurriculum = classes.filter((c) => c.curriculumId);
  const [f, setF] = useState<any>({ classId: withCurriculum[0]?.id ?? '', objectiveIds: [] as string[], uploadIds: [] as string[], brief: '', language: 'en', difficulty: 'Medium', mc: 4, tf: 0, sa: 0, open: 1 });
  const [objectives, setObjectives] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (f.classId) fetchClassObjectives(f.classId).then((r) => setObjectives(r.objectives)).catch(() => setObjectives([])); }, [f.classId]);
  const cls = withCurriculum.find((c) => c.id === f.classId);
  const go = async () => {
    setBusy(true);
    try {
      const r = await generateAssessmentDraft({
        curriculumId: cls.curriculumId, objectiveIds: f.objectiveIds, brief: f.brief, language: f.language, difficulty: f.difficulty,
        ...(f.uploadIds.length ? { uploadIds: f.uploadIds } : {}),
        counts: { 'multiple-choice': Number(f.mc), 'true-false': Number(f.tf), 'short-answer': Number(f.sa), 'open-response': Number(f.open) },
      });
      toast.success('Draft ready', r.note);
      onDone(r.assessment.id);
    } catch (err) {
      toast.error('No draft', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const field = 'mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm';
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000]" role="dialog" aria-modal="true" aria-label="AI draft">
      <div className="bg-white rounded-xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-3">
        <div className="flex justify-between"><h2 className="font-bold text-slate-900">Draft questions with AI</h2><button aria-label="Close" onClick={onClose}><X className="w-5 h-5" /></button></div>
        <p className="text-xs text-slate-600">You get an editable draft. Nothing reaches students until you check it, publish it and assign it.</p>
        {!withCurriculum.length ? <p className="text-sm text-amber-700">None of your classes has a curriculum yet.</p> : (
          <>
            <label className="block text-sm">Class / curriculum<select className={field} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, objectiveIds: [], uploadIds: [] })}>{withCurriculum.map((c) => <option key={c.id} value={c.id}>{c.courseName} · {c.curriculumName}</option>)}</select></label>
            {objectives.length > 0 && (
              <fieldset className="text-sm"><legend>Objectives</legend>
                <div className="max-h-32 overflow-y-auto mt-1 space-y-1">{objectives.map((o) => (
                  <label key={o.id} className="flex gap-2 items-start"><input type="checkbox" checked={f.objectiveIds.includes(o.id)} onChange={(e) => setF({ ...f, objectiveIds: e.target.checked ? [...f.objectiveIds, o.id] : f.objectiveIds.filter((x: string) => x !== o.id) })} /><span>{o.code} {o.title}</span></label>
                ))}</div>
              </fieldset>
            )}
            <SourcePicker curriculumId={cls?.curriculumId} value={f.uploadIds} onChange={(ids) => setF({ ...f, uploadIds: ids })} />
            <label className="block text-sm">What should it cover?<textarea dir="auto" className={field} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="e.g. adding fractions with unlike denominators, word problems" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">Language<select className={field} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select></label>
              <label className="block text-sm">Difficulty<select className={field} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[['mc', 'Multiple choice'], ['tf', 'True/false'], ['sa', 'Short answer'], ['open', 'Open']].map(([k, l]) => (
                <label key={k} className="block text-xs">{l}<input type="number" min={0} max={20} className={field} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
              ))}
            </div>
            <div className="flex justify-end"><button disabled={busy} onClick={go} className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-violet-700 text-white font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft</button></div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

const blankQuestion = (type = 'multiple-choice'): Q =>
  type === 'open-response'
    ? { id: uid('q'), type, text: '', rubric: { criteria: [{ id: uid('c'), title: 'Reasoning', levels: [{ id: uid('l'), label: 'Missing', points: 0 }, { id: uid('l'), label: 'Partial', points: 2 }, { id: uid('l'), label: 'Complete', points: 4 }] }] } }
    : type === 'true-false'
      ? { id: uid('q'), type, text: '', options: ['True', 'False'], correctAnswer: 'True', points: 1 }
      : type === 'short-answer'
        ? { id: uid('q'), type, text: '', correctAnswer: '', points: 1 }
        : { id: uid('q'), type, text: '', options: ['', ''], correctAnswer: '', points: 1 };

const LIFECYCLE: Record<string, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' };

function RubricEditor({ value, onChange }: { value: Criterion[]; onChange: (c: Criterion[]) => void }) {
  const set = (i: number, c: Criterion) => onChange(value.map((x, j) => (j === i ? c : x)));
  return (
    <div className="space-y-3">
      {value.map((c, i) => (
        <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input aria-label="Criterion" className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" value={c.title} onChange={(e) => set(i, { ...c, title: e.target.value })} placeholder="Criterion (e.g. Reasoning)" />
            <button aria-label="Remove criterion" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
          </div>
          {c.levels.map((l, li) => (
            <div key={l.id} className="flex gap-2 items-center">
              <input aria-label="Level" className="w-32 border border-slate-300 rounded px-2 py-1 text-sm" value={l.label} onChange={(e) => set(i, { ...c, levels: c.levels.map((x, k) => (k === li ? { ...x, label: e.target.value } : x)) })} />
              <input aria-label="Points" type="number" min={0} max={100} className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" value={l.points} onChange={(e) => set(i, { ...c, levels: c.levels.map((x, k) => (k === li ? { ...x, points: Number(e.target.value) } : x)) })} />
              <input aria-label="Level description" className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" value={l.description ?? ''} placeholder="What this level looks like" onChange={(e) => set(i, { ...c, levels: c.levels.map((x, k) => (k === li ? { ...x, description: e.target.value } : x)) })} />
              <button aria-label="Remove level" onClick={() => set(i, { ...c, levels: c.levels.filter((_, k) => k !== li) })} className="text-slate-400 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => set(i, { ...c, levels: [...c.levels, { id: uid('l'), label: '', points: 0 }] })} className="text-xs text-indigo-700 font-semibold">+ level</button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { id: uid('c'), title: '', levels: [{ id: uid('l'), label: 'Missing', points: 0 }, { id: uid('l'), label: 'Complete', points: 2 }] }])} className="text-xs text-indigo-700 font-semibold">+ criterion</button>
    </div>
  );
}

export const AssessmentBuilder: React.FC = () => {
  const [items, setItems] = useState<any[] | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [doc, setDoc] = useState<any>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetchAuthoringAssessments(filter || undefined)
      .then(setItems)
      .catch((err) => {
        if (isFeatureDisabled(err)) setDisabled(true);
        else toast.error('Could not load assessments', errorText(err));
        setItems([]);
      });
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { fetchTeachingClasses().then((r) => setClasses(r.classes)).catch(() => setClasses([])); }, []);
  const curricula = useMemo(() => [...new Map(classes.filter((c) => c.curriculumId).map((c) => [c.curriculumId!, c.curriculumName || c.curriculumId!])).entries()], [classes]);

  const open = async (id: string) => {
    setProblems(null);
    try {
      const d = await fetchAssessmentDetail(id);
      setDoc(d);
      setVersions((await fetchAssessmentVersions(id)).versions);
    } catch (err) {
      toast.error('Could not open', errorText(err));
    }
  };
  const newDraft = () => { setDoc({ title: '', subject: '', curriculumId: curricula[0]?.[0] ?? '', instructions: '', questions: [blankQuestion()], lifecycle: 'draft' }); setVersions([]); setProblems(null); };

  const payload = () => ({ title: doc.title, subject: doc.subject || 'General', curriculumId: doc.curriculumId || undefined, instructions: doc.instructions || undefined, questions: doc.questions.map((q: Q) => ({ ...q, points: q.type === 'open-response' ? undefined : Number(q.points ?? 1) })) });

  const save = async () => {
    setBusy(true);
    try {
      const saved = doc.id ? await updateAssessment(doc.id, payload()) : await createAssessment({ ...payload(), lifecycle: 'draft' });
      if (saved.publishProblems?.length) toast.warning('Saved, not published', saved.publishProblems.join(' '));
      else toast.success('Saved', saved.lifecycle === 'published' ? 'Published as a new version.' : 'Draft saved.');
      setDirty(false);
      await open(saved.id);
      load();
    } catch (err) {
      toast.error('Not saved', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => setProblems((await validateAssessmentDraft(doc.id)).problems);
  const publish = async () => {
    setBusy(true);
    try {
      let r;
      try {
        r = await publishAssessmentVersion(doc.id);
      } catch (err) {
        // Source-linked drafts: questions with no supporting source need an explicit decision.
        if (!(err instanceof ApiError && err.code === 'UNSOURCED_QUESTIONS') || !window.confirm(`${err.message}\n\nPublish anyway?`)) throw err;
        r = await publishAssessmentVersion(doc.id, true);
      }
      toast.success('Published', `Version ${r.version.version} is what students will get when you assign it.`);
      await open(doc.id);
      load();
    } catch (err) {
      toast.error('Not published', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      const r = await fn();
      toast.success(msg, '');
      load();
      if (r?.id) open(r.id);
    } catch (err) {
      toast.error('Not done', errorText(err));
    }
  };

  const regenerate = async (i: number) => {
    const q = doc.questions[i];
    const instruction = window.prompt('What should change? (optional)') ?? undefined;
    try {
      const r = await regenerateAssessmentQuestion(doc.id, q.id, q, instruction || undefined);
      setDoc({ ...doc, questions: doc.questions.map((x: Q, j: number) => (j === i ? r.question : x)) });
      setDirty(true);
      toast.success('New version of this question', 'Not saved yet: check it, then save.');
    } catch (err) {
      toast.error('Not regenerated', errorText(err));
    }
  };

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The teaching workflow isn't enabled for your school.</p>;
  if (items === null) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const setQ = (i: number, q: Q) => setDoc({ ...doc, questions: doc.questions.map((x: Q, j: number) => (j === i ? q : x)) });
  const move = (i: number, d: number) => {
    const qs = [...doc.questions];
    const [q] = qs.splice(i, 1);
    qs.splice(i + d, 0, q);
    setDoc({ ...doc, questions: qs });
  };
  const editable = doc && doc.lifecycle !== 'archived';

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {aiOpen && <AiDraftForm classes={classes} onClose={() => setAiOpen(false)} onDone={(id) => { setAiOpen(false); load(); open(id); }} />}
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-slate-900">Assessments</h1><UsageChip features={['ai_assessment_draft', 'ai_question_regenerate']} label="AI drafts" /></div>
          <div className="flex gap-1">
            <button onClick={() => setAiOpen(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-violet-800 border border-violet-300 rounded-lg px-2 py-1.5"><Sparkles className="w-4 h-4" /> AI</button>
            <button onClick={newDraft} className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-slate-900 rounded-lg px-3 py-1.5"><Plus className="w-4 h-4" /> New</button>
          </div>
        </div>
        <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
        {!items.length ? <p className="text-sm text-slate-500">No assessments yet.</p> : (
          <ul className="space-y-1">
            {items.map((a) => (
              <li key={a.id}>
                <button onClick={() => open(a.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm border ${doc?.id === a.id ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-slate-100'}`}>
                  <span className="block font-medium text-slate-900 truncate">{a.title}</span>
                  <span className="text-xs text-slate-500">{LIFECYCLE[a.lifecycle] ?? 'Published'}{a.publishedVersion ? ` · v${a.publishedVersion}` : ''}{a.hasUnpublishedChanges ? ' · unpublished changes' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main>
        {!doc ? (
          <p className="text-slate-600">Choose an assessment or start a new one.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <p className="text-sm text-slate-600">
                {dirty && <span className="text-amber-700 font-semibold mr-2">Unsaved changes ·</span>}
                {LIFECYCLE[doc.lifecycle] ?? 'New draft'}
                {doc.publishedVersion ? ` · published version ${doc.publishedVersion}` : ''}
                {typeof doc.totalPoints === 'number' ? ` · ${doc.totalPoints} points` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {editable && <button disabled={busy} onClick={save} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold">{doc.lifecycle === 'published' ? 'Save as new version' : 'Save draft'}</button>}
                {doc.id && editable && <button onClick={validate} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Check</button>}
                {doc.id && doc.lifecycle === 'draft' && <button disabled={busy} onClick={publish} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold">Publish</button>}
                {doc.id && <button onClick={() => act(() => duplicateAssessmentById(doc.id), 'Copied as a draft')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Duplicate</button>}
                {doc.id && editable && <button onClick={() => window.confirm('Archive this assessment? Existing assignments and results stay.') && act(() => archiveAssessmentById(doc.id), 'Archived')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Archive</button>}
              </div>
            </div>
            {problems && (problems.length ? (
              <ul className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 list-disc pl-6">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : <p className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">Ready to publish.</p>)}

            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">Title<input disabled={!editable} className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></label>
              <label className="text-sm text-slate-700">Subject<input disabled={!editable} className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={doc.subject} onChange={(e) => setDoc({ ...doc, subject: e.target.value })} /></label>
              <label className="text-sm text-slate-700">Curriculum
                <select disabled={!editable || !!doc.id} className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={doc.curriculumId ?? ''} onChange={(e) => setDoc({ ...doc, curriculumId: e.target.value })}>
                  <option value="">—</option>
                  {curricula.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-700 sm:col-span-2">Instructions<textarea disabled={!editable} dir="auto" className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" value={doc.instructions ?? ''} onChange={(e) => setDoc({ ...doc, instructions: e.target.value })} /></label>
            </div>

            {doc.questions.map((q: Q, i: number) => (
              <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="text-sm font-semibold text-slate-800">Question {i + 1}{q.source === 'ai' && <span className="ml-2 text-[11px] font-semibold text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">AI draft: check it</span>}</span>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <select aria-label="Question type" className="border border-slate-300 rounded px-2 py-1 text-sm" value={q.type} onChange={(e) => setQ(i, { ...blankQuestion(e.target.value), id: q.id, text: q.text })}>
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {doc.id && <button aria-label="Regenerate with AI" title="Regenerate with AI" onClick={() => regenerate(i)} className="p-1 text-violet-700"><Sparkles className="w-4 h-4" /></button>}
                      <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button aria-label="Move down" disabled={i === doc.questions.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      <button aria-label="Remove question" onClick={() => setDoc({ ...doc, questions: doc.questions.filter((_: Q, j: number) => j !== i) })} className="p-1 text-slate-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                {q.sources?.length ? <p className="text-[11px] text-slate-500">Based on: {q.sources.map((x) => `${x.fileName}${x.page ? ` p.${x.page}` : x.section ? ` · ${x.section}` : ''}`).join(', ')}</p> : null}
                {q.sourceStatus === 'no_supporting_source' && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center justify-between gap-2">
                    <span>No supporting source in the chosen documents. Check or correct this question.</span>
                    {editable && <button className="font-semibold underline" onClick={() => { const { sourceStatus: _s, ...rest } = q; setQ(i, rest); }}>I've checked it</button>}
                  </p>
                )}
                <textarea disabled={!editable} aria-label="Question text" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value={q.text} onChange={(e) => setQ(i, { ...q, text: e.target.value })} placeholder="Question" />
                {q.type === 'multiple-choice' && (
                  <div className="space-y-1">
                    {(q.options || []).map((o, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <input type="radio" aria-label={`Correct option ${k + 1}`} disabled={!editable} checked={q.correctAnswer === o && o !== ''} onChange={() => setQ(i, { ...q, correctAnswer: o })} />
                        <input disabled={!editable} aria-label={`Option ${k + 1}`} className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" value={o} onChange={(e) => setQ(i, { ...q, options: q.options!.map((x, m) => (m === k ? e.target.value : x)), correctAnswer: q.correctAnswer === o ? e.target.value : q.correctAnswer })} />
                      </div>
                    ))}
                    {editable && <button onClick={() => setQ(i, { ...q, options: [...(q.options || []), ''] })} className="text-xs text-indigo-700 font-semibold">+ option</button>}
                  </div>
                )}
                {q.type === 'true-false' && (
                  <select disabled={!editable} aria-label="Correct answer" className="border border-slate-300 rounded px-2 py-1 text-sm" value={q.correctAnswer} onChange={(e) => setQ(i, { ...q, correctAnswer: e.target.value })}><option>True</option><option>False</option></select>
                )}
                {q.type === 'short-answer' && <input disabled={!editable} aria-label="Correct answer" className="w-full border border-slate-300 rounded px-2 py-1 text-sm" value={q.correctAnswer ?? ''} placeholder="Exact answer (case and spaces ignored)" onChange={(e) => setQ(i, { ...q, correctAnswer: e.target.value })} />}
                {q.type === 'open-response' ? (
                  <>
                    <textarea disabled={!editable} aria-label="Model answer" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value={q.modelAnswer ?? ''} placeholder="Model answer (teachers only; never shown to students)" onChange={(e) => setQ(i, { ...q, modelAnswer: e.target.value })} />
                    <RubricEditor value={q.rubric?.criteria || []} onChange={(criteria) => setQ(i, { ...q, rubric: { criteria } })} />
                  </>
                ) : (
                  <label className="text-sm text-slate-700 inline-flex items-center gap-2">Points<input disabled={!editable} type="number" min={0} max={100} className="w-20 border border-slate-300 rounded px-2 py-1" value={q.points ?? 1} onChange={(e) => setQ(i, { ...q, points: Number(e.target.value) })} /></label>
                )}
                {q.type !== 'open-response' && <input disabled={!editable} aria-label="Explanation" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1 text-sm" value={q.explanation ?? ''} placeholder="Explanation shown with the answer key" onChange={(e) => setQ(i, { ...q, explanation: e.target.value })} />}
              </div>
            ))}
            {editable && (
              <div className="flex flex-wrap gap-2">
                {TYPES.map(([v, l]) => <button key={v} onClick={() => setDoc({ ...doc, questions: [...doc.questions, blankQuestion(v)] })} className="px-3 py-1.5 rounded-lg border border-dashed border-slate-400 text-sm text-slate-700">+ {l}</button>)}
              </div>
            )}
            {versions.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-slate-800">Published versions</h2>
                <ul className="mt-2 text-sm text-slate-700 space-y-1">{versions.map((v) => <li key={v.version}>v{v.version} · {v.totalPoints} points · {new Date(v.publishedAt).toLocaleString()}</li>)}</ul>
                <p className="text-xs text-slate-500 mt-2">Assignments keep the version they were given with; later edits create new versions.</p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
