import { createPortal } from 'react-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, Loader2, Pencil, Plus, Sparkles, X } from 'lucide-react';
import {
  approveObjective,
  createObjective,
  extractObjectives,
  fetchCurriculums,
  fetchObjectiveQuestions,
  fetchObjectives,
  isFeatureDisabled,
  setObjectiveQuestions,
  updateObjective,
  type LearningObjectiveRecord,
} from '../services/apiService';
import { toast } from '../services/toastService';

// Admins (and later teachers) define a curriculum's learning objectives and
// prerequisites, review AI-proposed drafts, approve them, and link assessment
// questions so answers become evidence for the objective.

interface CurriculumLite {
  id: string;
  name: string;
  courseName?: string;
  chapters: { id: string; title: string }[];
}

type Draft = Partial<LearningObjectiveRecord> & { arTitle?: string; arDescription?: string };

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-900 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const field = 'w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm';
const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

export const LearningObjectives: React.FC = () => {
  const [curricula, setCurricula] = useState<CurriculumLite[]>([]);
  const [curriculumId, setCurriculumId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [objectives, setObjectives] = useState<LearningObjectiveRecord[] | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [linking, setLinking] = useState<LearningObjectiveRecord | null>(null);

  useEffect(() => {
    fetchCurriculums()
      .then((list) => {
        const lite = (list || []).map((c: any) => ({ id: c.id, name: c.name, courseName: c.courseName, chapters: c.chapters || [] }));
        setCurricula(lite);
        if (lite.length) setCurriculumId(lite[0].id);
      })
      .catch((err) => toast.error('Could not load curricula', errorText(err)));
  }, []);

  const load = () => {
    if (!curriculumId) return;
    setObjectives(null);
    fetchObjectives(curriculumId, statusFilter || undefined)
      .then((r) => setObjectives(r.objectives))
      .catch((err) => {
        if (isFeatureDisabled(err)) setDisabled(true);
        else toast.error('Could not load objectives', errorText(err));
        setObjectives([]);
      });
  };
  useEffect(load, [curriculumId, statusFilter]);

  const curriculum = curricula.find((c) => c.id === curriculumId);
  const byId = useMemo(() => new Map((objectives || []).map((o) => [o.id, o])), [objectives]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const payload: Partial<LearningObjectiveRecord> = {
      code: editing.code,
      title: editing.title,
      description: editing.description || '',
      language: editing.language || 'en',
      lessonIds: editing.lessonIds || [],
      prerequisiteObjectiveIds: editing.prerequisiteObjectiveIds || [],
      ...(editing.difficultyLevel ? { difficultyLevel: Number(editing.difficultyLevel) } : {}),
      ...(editing.estimatedLearningMinutes ? { estimatedLearningMinutes: Number(editing.estimatedLearningMinutes) } : {}),
      translations: { ar: { title: editing.arTitle || undefined, description: editing.arDescription || undefined } },
    };
    try {
      if (editing.id) await updateObjective(editing.id, payload);
      else await createObjective({ ...payload, curriculumId });
      toast.success('Objective saved', editing.id ? 'Changes recorded as a new version.' : 'Saved as a draft. Approve it when ready.');
      setEditing(null);
      load();
    } catch (err) {
      toast.error('Could not save', errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done, '');
      load();
    } catch (err) {
      toast.error('Not changed', errorText(err));
    }
  };

  const propose = async () => {
    setExtracting(true);
    try {
      const r = await extractObjectives(curriculumId, 'en');
      toast.success(
        `${r.created.length} AI draft${r.created.length === 1 ? '' : 's'} added`,
        r.skippedExistingCodes.length ? `Skipped existing codes: ${r.skippedExistingCodes.join(', ')}` : 'Review each one before approving.',
      );
      load();
    } catch (err) {
      toast.error('Could not propose objectives', errorText(err));
    } finally {
      setExtracting(false);
    }
  };

  if (disabled) {
    return <p className="max-w-4xl mx-auto p-8 text-slate-700">Learning intelligence isn't enabled for your school. Ask Enara to turn it on.</p>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Learning intelligence</p>
          <h1 className="text-3xl font-extrabold text-slate-900">Learning objectives</h1>
          <p className="text-slate-600 mt-1">
            What students should be able to do, in order. Only <strong>approved</strong> objectives are tracked, and only answers to{' '}
            <strong>linked questions</strong> count as evidence. AI proposals stay drafts until someone approves them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={propose}
            disabled={!curriculumId || extracting}
            className="h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {extracting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />} Propose with AI
          </button>
          <button
            onClick={() => setEditing({ language: 'en', lessonIds: [], prerequisiteObjectiveIds: [] })}
            disabled={!curriculumId}
            className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" /> New objective
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Curriculum
          <select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)} className={`${field} min-w-[240px]`}>
            {curricula.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={field}>
            <option value="">Draft and approved</option>
            <option value="draft">Drafts</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      {!objectives ? (
        <Loader2 className="animate-spin text-teal-700" aria-label="Loading" />
      ) : objectives.length === 0 ? (
        <p className="text-slate-600">No objectives here yet. Add one, or let AI propose drafts from the lessons.</p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-3">
          {objectives.map((o) => (
            <li key={o.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">{o.code}</span>
                    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                    {o.origin === 'ai' && o.status === 'draft' && (
                      <span className="px-2 py-0.5 rounded border text-xs font-bold bg-violet-50 text-violet-800 border-violet-200">AI draft</span>
                    )}
                    <span className="text-xs text-slate-500">v{o.version}</span>
                  </div>
                  <p className="m-0 font-bold text-slate-900 mt-1">{o.title}</p>
                  {o.translations?.ar?.title && <p className="m-0 text-sm text-slate-700" dir="rtl" lang="ar">{o.translations.ar.title}</p>}
                  {o.description && <p className="m-0 text-sm text-slate-600 mt-1">{o.description}</p>}
                  <p className="m-0 text-xs text-slate-500 mt-2">
                    Lessons: {o.lessonIds.map((l) => curriculum?.chapters.find((c) => c.id === l)?.title || l).join(', ') || 'none'}
                    {' · '}Prerequisites: {o.prerequisiteObjectiveIds.map((p) => byId.get(p)?.code || p).join(', ') || 'none'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {o.status === 'draft' && (
                    <button onClick={() => act(() => approveObjective(o.id), 'Objective approved')} className="h-9 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 size={14} aria-hidden="true" /> Approve
                    </button>
                  )}
                  {o.status !== 'archived' && (
                    <>
                      <button
                        onClick={() =>
                          setEditing({ ...o, arTitle: o.translations?.ar?.title, arDescription: o.translations?.ar?.description })
                        }
                        className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-1"
                      >
                        <Pencil size={14} aria-hidden="true" /> Edit
                      </button>
                      <button onClick={() => setLinking(o)} className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-1">
                        <Link2 size={14} aria-hidden="true" /> Questions
                      </button>
                      <button onClick={() => act(() => updateObjective(o.id, { status: 'archived' }), 'Objective archived')} className="h-9 px-3 rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-100">
                        Archive
                      </button>
                    </>
                  )}
                  {o.status === 'archived' && (
                    <button onClick={() => act(() => updateObjective(o.id, { status: 'draft' }), 'Restored as a draft')} className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold">
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && curriculum && (
        <Portal><div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="objective-editor-title">
          <div className="w-full max-w-2xl bg-white rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="objective-editor-title" className="m-0 text-lg font-bold">{editing.id ? `Edit ${editing.code}` : 'New objective'}</h2>
              <button onClick={() => setEditing(null)} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-6 grid sm:grid-cols-2 gap-4">
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Code
                <input value={editing.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="ALG.1" className={field} />
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Language of the text below
                <select value={editing.language || 'en'} onChange={(e) => setEditing({ ...editing, language: e.target.value as 'en' | 'ar' })} className={field}>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </label>
              <label className="sm:col-span-2 text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Title (what the student will be able to do)
                <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={field} dir={editing.language === 'ar' ? 'rtl' : 'ltr'} />
              </label>
              <label className="sm:col-span-2 text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Description
                <textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Arabic title (optional)
                <input value={editing.arTitle || ''} onChange={(e) => setEditing({ ...editing, arTitle: e.target.value })} className={field} dir="rtl" lang="ar" />
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Arabic description (optional)
                <input value={editing.arDescription || ''} onChange={(e) => setEditing({ ...editing, arDescription: e.target.value })} className={field} dir="rtl" lang="ar" />
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Difficulty (1–5)
                <input type="number" min={1} max={5} value={editing.difficultyLevel ?? ''} onChange={(e) => setEditing({ ...editing, difficultyLevel: e.target.value ? Number(e.target.value) : undefined })} className={field} />
              </label>
              <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
                Estimated learning minutes
                <input type="number" min={1} value={editing.estimatedLearningMinutes ?? ''} onChange={(e) => setEditing({ ...editing, estimatedLearningMinutes: e.target.value ? Number(e.target.value) : undefined })} className={field} />
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-700">Lessons that teach it</legend>
                <div className="flex flex-wrap gap-2 mt-1">
                  {curriculum.chapters.map((c) => {
                    const on = (editing.lessonIds || []).includes(c.id);
                    return (
                      <label key={c.id} className={`px-3 h-8 inline-flex items-center gap-2 rounded-full border text-sm ${on ? 'border-teal-600 bg-teal-50' : 'border-slate-300'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setEditing({ ...editing, lessonIds: on ? editing.lessonIds!.filter((x) => x !== c.id) : [...(editing.lessonIds || []), c.id] })}
                        />
                        {c.title}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-700">Prerequisites (only where understanding depends on it, not just lesson order)</legend>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(objectives || []).filter((o) => o.id !== editing.id && o.status !== 'archived').map((o) => {
                    const on = (editing.prerequisiteObjectiveIds || []).includes(o.id);
                    return (
                      <label key={o.id} className={`px-3 h-8 inline-flex items-center gap-2 rounded-full border text-sm ${on ? 'border-teal-600 bg-teal-50' : 'border-slate-300'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setEditing({
                              ...editing,
                              prerequisiteObjectiveIds: on ? editing.prerequisiteObjectiveIds!.filter((x) => x !== o.id) : [...(editing.prerequisiteObjectiveIds || []), o.id],
                            })
                          }
                        />
                        {o.code}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold">Cancel</button>
              <button onClick={save} disabled={saving || !editing.code || !editing.title} className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div></Portal>
      )}

      {linking && <QuestionLinker objective={linking} onClose={() => setLinking(null)} />}
    </div>
  );
};

const QuestionLinker: React.FC<{ objective: LearningObjectiveRecord; onClose: () => void }> = ({ objective, onClose }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchObjectiveQuestions>> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchObjectiveQuestions(objective.id)
      .then((d) => {
        setData(d);
        setSelected(new Set(d.assessments.flatMap((a) => a.questions.filter((q) => q.linked).map((q) => `${a.id}::${q.id}`))));
      })
      .catch((err) => toast.error('Could not load questions', errorText(err)));
  }, [objective.id]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const r = await setObjectiveQuestions(
        objective.id,
        [...selected].map((k) => {
          const [assessmentId, questionId] = k.split('::');
          return { assessmentId, questionId };
        }),
      );
      toast.success('Questions linked', `${r.linked} linked, ${r.unlinked} unlinked; ${r.pastAnswersLinked} earlier answers now count.`);
      onClose();
    } catch (err) {
      toast.error('Could not save links', errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal><div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="linker-title">
      <div className="w-full max-w-3xl bg-white rounded-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="linker-title" className="m-0 text-lg font-bold">Questions for {objective.code}</h2>
            <p className="m-0 text-sm text-slate-600">Answers to ticked questions count as evidence for this objective, including answers already given.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          {!data ? (
            <Loader2 className="animate-spin text-teal-700" aria-label="Loading" />
          ) : data.assessments.length === 0 ? (
            <p className="text-sm text-slate-600">No assessments for this curriculum yet.</p>
          ) : (
            data.assessments.map((a) => (
              <fieldset key={a.id}>
                <legend className="text-sm font-bold text-slate-900">{a.title} <span className="font-normal text-slate-500">· {a.subject}</span></legend>
                <ul className="m-0 p-0 list-none mt-2 space-y-1">
                  {a.questions.map((q) => {
                    const key = `${a.id}::${q.id}`;
                    return (
                      <li key={key}>
                        <label className="flex items-start gap-2 text-sm">
                          <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} className="mt-1" />
                          <span>
                            {q.text}
                            {q.topic && <span className="text-slate-500"> · {q.topic}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-md border border-slate-300 text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={saving || !data} className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save links'}
          </button>
        </div>
      </div>
    </div></Portal>
  );
};

// Dialogs render on <body> so a transformed ancestor cannot clip or offset them.
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => createPortal(children, document.body);
