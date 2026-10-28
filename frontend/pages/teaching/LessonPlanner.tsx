import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import {
  archiveLessonPlan,
  fetchClassObjectives,
  fetchLessonPlan,
  fetchLessonPlans,
  fetchTeachingClasses,
  generateLessonPlanDraft,
  isFeatureDisabled,
  regenerateLessonPlanSection,
  saveLessonPlanVersion,
  updateLessonPlan,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { SourcePicker } from '../../components/SourcePicker';
import { UsageChip } from '../../components/UsageChip';

// Lesson planner (Phase 3): AI drafts a plan from the lesson, objectives and
// course passages; the teacher edits it. Regenerating a section never touches
// the others; saving keeps a numbered version. Lessons themselves never change.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const KINDS: Record<string, string> = {
  sequence: 'Sequence', explanation: 'Explanation', example: 'Example', activity: 'Activity', check_for_understanding: 'Check for understanding',
  differentiation: 'Differentiation', formative_checkpoint: 'Formative checkpoint', follow_up: 'Follow-up',
};

export const LessonPlanner: React.FC = () => {
  const [plans, setPlans] = useState<any[] | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ classId: '', lessonId: '', objectiveIds: [] as string[], uploadIds: [] as string[], durationMinutes: 45, learnerLevel: '', goals: '', preferences: '', language: 'en' });
  const [objectives, setObjectives] = useState<any[]>([]);

  const load = () => fetchLessonPlans().then((r) => setPlans(r.plans)).catch((err) => { if (isFeatureDisabled(err)) setDisabled(true); setPlans([]); });
  useEffect(() => {
    load();
    fetchTeachingClasses().then((r) => {
      const usable = r.classes.filter((c: any) => c.curriculumId);
      setClasses(usable);
      if (usable[0]) setForm((f: any) => ({ ...f, classId: usable[0].id }));
    }).catch(() => setClasses([]));
  }, []);
  useEffect(() => { if (form.classId) fetchClassObjectives(form.classId).then((r) => setObjectives(r.objectives)).catch(() => setObjectives([])); }, [form.classId]);
  const cls = classes.find((c) => c.id === form.classId);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateLessonPlanDraft({ curriculumId: cls.curriculumId, lessonId: form.lessonId || undefined, objectiveIds: form.objectiveIds, durationMinutes: Number(form.durationMinutes), learnerLevel: form.learnerLevel, goals: form.goals, preferences: form.preferences, language: form.language, ...(form.uploadIds.length ? { uploadIds: form.uploadIds } : {}) });
      toast.success('Draft ready', r.note);
      setPlan(r.plan);
      setDirty(false);
      load();
    } catch (err) {
      toast.error('No draft', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => { try { setPlan(await fetchLessonPlan(id)); setDirty(false); } catch (err) { toast.error('Could not open', errorText(err)); } };
  const setSection = (i: number, patch: any) => { setPlan({ ...plan, sections: plan.sections.map((s: any, j: number) => (j === i ? { ...s, ...patch } : s)) }); setDirty(true); };
  const move = (i: number, d: number) => { const s = [...plan.sections]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); setPlan({ ...plan, sections: s }); setDirty(true); };
  const saveDraft = async () => {
    const updated = await updateLessonPlan(plan.id, { title: plan.title, sections: plan.sections });
    setPlan(updated);
    setDirty(false);
    return updated;
  };
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok, ''); load(); } catch (err) { toast.error('Not done', errorText(err)); } finally { setBusy(false); }
  };
  const regenerate = async (i: number) => {
    const instruction = window.prompt('What should change in this section? (optional)') ?? undefined;
    try {
      const r = await regenerateLessonPlanSection(plan.id, plan.sections[i].id, plan.sections, instruction || undefined);
      setSection(i, r.section);
      toast.success('Section rewritten', 'Other sections are unchanged. Save to keep it.');
    } catch (err) {
      toast.error('Not rewritten', errorText(err));
    }
  };

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The teaching workflow isn't enabled for your school.</p>;
  if (plans === null) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  const field = 'mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm';
  const total = plan ? plan.sections.reduce((n: number, s: any) => n + (Number(s.durationMinutes) || 0), 0) : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <aside className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Lesson planner</h1>
        <UsageChip features={['ai_lesson_plan', 'ai_lesson_plan_section']} label="AI drafts" />
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">New AI draft</h2>
          {!classes.length ? <p className="text-sm text-slate-500">None of your classes has a curriculum yet.</p> : (
            <>
              <label className="block text-sm">Class<select className={field} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, lessonId: '', objectiveIds: [] })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.courseName}</option>)}</select></label>
              <label className="block text-sm">Lesson<select className={field} value={form.lessonId} onChange={(e) => setForm({ ...form, lessonId: e.target.value })}><option value="">—</option>{(cls?.lessons || []).map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
              {objectives.length > 0 && (
                <fieldset className="text-sm"><legend>Objectives</legend><div className="max-h-28 overflow-y-auto space-y-1 mt-1">{objectives.map((o) => (
                  <label key={o.id} className="flex gap-2 items-start"><input type="checkbox" checked={form.objectiveIds.includes(o.id)} onChange={(e) => setForm({ ...form, objectiveIds: e.target.checked ? [...form.objectiveIds, o.id] : form.objectiveIds.filter((x: string) => x !== o.id) })} /><span>{o.code} {o.title}</span></label>
                ))}</div></fieldset>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">Minutes<input type="number" min={10} max={240} className={field} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></label>
                <label className="block text-sm">Language<select className={field} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select></label>
              </div>
              <label className="block text-sm">Learner level<input className={field} value={form.learnerLevel} placeholder="e.g. Grade 6, mixed ability" onChange={(e) => setForm({ ...form, learnerLevel: e.target.value })} /></label>
              <SourcePicker curriculumId={cls?.curriculumId} value={form.uploadIds} onChange={(ids) => setForm({ ...form, uploadIds: ids })} />
              <label className="block text-sm">Goals<textarea dir="auto" className={field} value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} /></label>
              <label className="block text-sm">Preferences<input className={field} value={form.preferences} placeholder="e.g. group work, no devices" onChange={(e) => setForm({ ...form, preferences: e.target.value })} /></label>
              <button disabled={busy} onClick={generate} className="w-full inline-flex justify-center items-center gap-1 px-3 py-2 text-sm rounded-lg bg-violet-700 text-white font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft a plan</button>
            </>
          )}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Your plans</h2>
          {!plans.length ? <p className="text-sm text-slate-500">None yet.</p> : (
            <ul className="space-y-1">{plans.map((p) => (
              <li key={p.id}><button onClick={() => open(p.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm border ${plan?.id === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-slate-100'}`}>
                <span className="block font-medium truncate">{p.title}</span><span className="text-xs text-slate-500">{p.status === 'saved' ? `Saved v${p.version}` : 'Draft'} · {p.durationMinutes} min</span>
              </button></li>
            ))}</ul>
          )}
        </div>
      </aside>
      <main>
        {!plan ? <p className="text-slate-600">Draft a new plan or open one of yours.</p> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input aria-label="Plan title" className="text-xl font-bold text-slate-900 border-b border-transparent focus:border-slate-300 outline-none flex-1 min-w-0" value={plan.title} onChange={(e) => { setPlan({ ...plan, title: e.target.value }); setDirty(true); }} />
              <div className="flex gap-2">
                <button disabled={busy || !dirty} onClick={() => run(saveDraft, 'Draft saved')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Save draft</button>
                <button disabled={busy} onClick={() => run(async () => { if (dirty) await saveDraft(); setPlan(await saveLessonPlanVersion(plan.id)); }, 'Version saved')} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold">Save version</button>
                <button onClick={() => window.confirm('Archive this plan?') && run(async () => { await archiveLessonPlan(plan.id); setPlan(null); }, 'Archived')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Archive</button>
              </div>
            </div>
            <p className="text-sm text-slate-600">{dirty ? <span className="text-amber-700 font-semibold">Unsaved changes · </span> : null}{plan.status === 'saved' ? `Saved as version ${plan.version}` : 'Draft'} · {total} of {plan.durationMinutes} minutes planned · AI-written sections are marked until you edit them.</p>
            {plan.sections.map((s: any, i: number) => (
              <section key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{KINDS[s.kind] ?? s.kind}{s.origin === 'ai' && <span className="ml-2 normal-case text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">AI draft</span>}</span>
                  <div className="flex items-center gap-1">
                    <button aria-label="Rewrite with AI" title="Rewrite with AI" onClick={() => regenerate(i)} className="p-1 text-violet-700"><Sparkles className="w-4 h-4" /></button>
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button aria-label="Move down" disabled={i === plan.sections.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button aria-label="Remove section" onClick={() => { setPlan({ ...plan, sections: plan.sections.filter((_: any, j: number) => j !== i) }); setDirty(true); }} className="p-1 text-slate-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input aria-label="Section title" className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm font-semibold" value={s.title} onChange={(e) => setSection(i, { title: e.target.value, origin: 'teacher' })} />
                  <input aria-label="Minutes" type="number" min={0} max={240} className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" value={s.durationMinutes ?? ''} onChange={(e) => setSection(i, { durationMinutes: Number(e.target.value) })} />
                </div>
                <textarea aria-label="Section content" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm min-h-[110px]" value={s.content} onChange={(e) => setSection(i, { content: e.target.value, origin: 'teacher' })} />
                {s.sources?.length ? <p className="text-[11px] text-slate-500">Course material: {s.sources.map((x: any) => `${x.fileName}${x.page ? ` p.${x.page}` : x.section ? ` · ${x.section}` : ''}`).join(', ')}</p> : null}
                {s.sourceStatus === 'no_supporting_source' && <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">No supporting source in the chosen documents. Check or correct this section.</p>}
              </section>
            ))}
            {plan.versions?.length > 0 && <p className="text-xs text-slate-500">Saved versions: {plan.versions.map((v: any) => `v${v.version} (${new Date(v.savedAt).toLocaleDateString()})`).join(', ')}</p>}
          </div>
        )}
      </main>
    </div>
  );
};
