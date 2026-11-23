import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { bankItemQuestion, fetchAssessments, fetchBankItems, fetchBankStats, generateBankItems, reviewBankItem, updateAssessment } from '../../services/apiService';
import { toast } from '../../services/toastService';

// Assessment engine P4 (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6.4): the question bank. Generate items (checked by code and by a judge
// before you see them), review them (approve, edit, or reject with a reason), and add approved ones to a draft assessment.
const REASONS: [string, string][] = [['wrong_key', 'Wrong answer key'], ['too_hard', 'Too hard'], ['too_easy', 'Too easy'], ['unclear', 'Unclear'], ['off_curriculum', 'Off the curriculum'], ['inappropriate', 'Not suitable'], ['wrong_language', 'Wrong language'], ['other', 'Other']];
const TYPES: Record<string, string[]> = { language: ['mcq', 'true_false', 'fill_blank', 'short_answer', 'essay'], math: ['mcq', 'numeric', 'math_steps'], science: ['mcq', 'true_false', 'short_answer', 'essay'], humanities: ['mcq', 'true_false', 'short_answer', 'essay'] };
const STATUS: [string, string][] = [['judged', 'Waiting for review'], ['draft', 'Draft (not judged)'], ['approved', 'Approved'], ['rejected', 'Rejected']];

function keyText(it: any): string {
  const k = it.answer_key ?? {};
  if (it.type === 'mcq') return (it.options ?? []).filter((o: any) => k.correct?.includes(o.id)).map((o: any) => o.text).join(', ');
  if (it.type === 'true_false') return k.value ? 'True' : 'False';
  if (it.type === 'numeric') return `${k.value}${k.unit ? ` ${k.unit}` : ''}`;
  if (it.type === 'fill_blank') return Object.values(k.blanks ?? {}).map((v: any) => v.join(' / ')).join(' · ');
  if (it.type === 'math_steps') return `${k.final?.value ?? ''}${k.final?.unit ? ` ${k.final.unit}` : ''}`;
  return (k.content_points ?? k.required_points ?? []).join(' · ') || k.model_answer || '';
}

// P5: the Item bank card: what is in the bank, how the reviewer model judges it, how often engine-graded answers go to the teacher,
// and the last benchmark (agreement with reference scores, speed) on this deployment.
const BankCard: React.FC = () => {
  const [s, setS] = useState<any>(null);
  useEffect(() => { fetchBankStats().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;
  const tile = 'border border-slate-200 rounded-lg p-3 bg-white';
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="bank-card">
      <div className={tile}><p className="text-xs text-slate-500">Questions in the bank</p><p className="text-xl font-bold">{s.items.total}</p><p className="text-xs text-slate-500">{Object.entries(s.items.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ')}</p></div>
      <div className={tile}><p className="text-xs text-slate-500">Passed the reviewer model</p><p className="text-xl font-bold">{pct(s.judgePassRate)}</p><p className="text-xs text-slate-500">{Object.entries(s.items.bySubject).map(([k, v]) => `${k} ${v}`).join(' · ')}</p></div>
      <div className={tile}><p className="text-xs text-slate-500">Answers sent to the teacher (30 days)</p><p className="text-xl font-bold">{pct(s.grading30d.flagRate)}</p><p className="text-xs text-slate-500">{s.grading30d.answers} graded by the engine</p></div>
      <div className={tile}><p className="text-xs text-slate-500">Last benchmark: agreement with reference scores</p>
        {s.lastBench ? <><p className="text-xl font-bold">{pct(Math.min(...s.lastBench.sets.map((x: any) => x.within1)))}+</p><p className="text-xs text-slate-500">{s.lastBench.sets.length} sets · {s.lastBench.failures.length ? `${s.lastBench.failures.length} below the bar` : 'all at or above 85%'} · typical answer {(Math.max(...s.lastBench.sets.map((x: any) => x.p50)) / 1000).toFixed(1)}s</p></> : <p className="text-sm text-slate-500">Not run yet</p>}
      </div>
    </section>
  );
};

export const QuestionBank: React.FC = () => {
  const [status, setStatus] = useState('judged');
  const [items, setItems] = useState<any[] | null>(null);
  const [off, setOff] = useState(false);
  const [form, setForm] = useState({ domain: 'language', language: 'en', type: 'mcq', objective_code: '', level: 'grade 6', count: 3, source_text: '' });
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const load = () => { setItems(null); fetchBankItems({ status }).then((r) => setItems(r.items)).catch((e) => { if (String(e).includes('404')) setOff(true); setItems([]); }); };
  useEffect(load, [status]);
  useEffect(() => { fetchAssessments().then((a) => setDrafts((a as any[]).filter((x) => x.lifecycle === 'draft'))).catch(() => setDrafts([])); }, []);
  if (off) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The question bank isn't switched on for your school.</p>;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateBankItems({ ...form, types: [form.type], source_text: form.source_text || undefined });
      toast.success('Questions generated', `${r.created.length} added for review${r.refused.length ? `, ${r.refused.length} refused by the checks` : ''}`);
      setStatus('judged'); load();
    } catch (e) { toast.error('Could not generate questions', String((e as Error).message ?? e)); }
    setBusy(false);
  };
  const review = async (id: string, decision: 'approve' | 'reject') => {
    try { await reviewBankItem(id, { decision, ...(decision === 'reject' ? { reasonCode: reason[id] } : {}) }); load(); } catch (e) { toast.error('Not saved', String((e as Error).message ?? e)); }
  };
  const addTo = async (id: string, assessmentId: string) => {
    try {
      const { question } = await bankItemQuestion(id);
      const a = drafts.find((d) => d.id === assessmentId);
      await updateAssessment(assessmentId, { questions: [...(a?.questions ?? []), question] });
      toast.success('Added', 'The question is in the draft assessment');
    } catch (e) { toast.error('Not added', String((e as Error).message ?? e)); }
  };
  const field = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white';

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5" data-testid="question-bank">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
        <p className="text-sm text-slate-600 max-w-2xl">Generated questions are checked by code and by a reviewer model before you see them. Approve the ones you want, reject the rest with a reason, and add approved questions to a draft assessment.</p>
      </div>
      <BankCard />
      <section className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Generate</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select aria-label="Subject" className={field} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value, type: TYPES[e.target.value][0] })}>{Object.keys(TYPES).map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <select aria-label="Language" className={field} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select>
          <select aria-label="Type" className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES[form.domain].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select>
          <input aria-label="How many" type="number" min={1} max={5} className={field} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
          <input aria-label="Objective code" placeholder="Objective code" className={`${field} col-span-2`} value={form.objective_code} onChange={(e) => setForm({ ...form, objective_code: e.target.value })} />
          <input aria-label="Level" placeholder="Level (e.g. grade 6, A2)" className={`${field} col-span-2`} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
        </div>
        {form.domain === 'humanities' && <textarea aria-label="Source text" placeholder="Source text: questions use only facts from it" className={`${field} w-full min-h-[90px]`} value={form.source_text} onChange={(e) => setForm({ ...form, source_text: e.target.value })} />}
        <button disabled={busy || !form.objective_code.trim()} onClick={generate} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Generate'}</button>
      </section>
      <div className="flex items-center gap-2">
        <select aria-label="Show" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {!items ? <Loader2 className="w-5 h-5 animate-spin text-slate-500" /> : !items.length ? <p className="text-sm text-slate-600">No questions here yet.</p> : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={`${it.id}-${it.version}`} className="border border-slate-200 rounded-xl p-4 bg-white space-y-2" dir={it.language === 'ar' ? 'rtl' : 'ltr'} data-testid={`bank-item-${it.id}`}>
              <p className="text-xs text-slate-500">{it.subject} · {it.type.replace('_', ' ')} · {it.level} · {it.objective_code} · v{it.version} · {it.source}</p>
              {it.passage && <blockquote className="text-sm bg-slate-50 rounded p-2 whitespace-pre-wrap">{it.passage}</blockquote>}
              <p className="text-slate-900 font-medium whitespace-pre-wrap">{it.stem}</p>
              {it.type === 'mcq' && <ul className="text-sm text-slate-700 list-disc ps-5">{(it.options ?? []).map((o: any) => <li key={o.id}>{o.text}</li>)}</ul>}
              <p className="text-xs text-slate-600">Key: <b>{keyText(it)}</b></p>
              {it.judge_report?.scores && <p className="text-xs text-slate-500">Reviewer ({it.judge_report.judge}): {Object.entries(it.judge_report.scores).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}{it.judge_report.feedback ? ` — ${it.judge_report.feedback}` : ''}</p>}
              <div className="flex flex-wrap items-center gap-2" dir="ltr">
                {it.review_status !== 'approved' && <button onClick={() => review(it.id, 'approve')} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold">Approve</button>}
                {it.review_status !== 'rejected' && (
                  <>
                    <select aria-label="Reason" className={field} value={reason[it.id] ?? ''} onChange={(e) => setReason({ ...reason, [it.id]: e.target.value })}><option value="">Reason…</option>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <button disabled={!reason[it.id]} onClick={() => review(it.id, 'reject')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50">Reject</button>
                  </>
                )}
                {it.review_status === 'approved' && drafts.length > 0 && (
                  <select aria-label="Add to assessment" className={field} defaultValue="" onChange={(e) => e.target.value && addTo(it.id, e.target.value)}><option value="">Add to a draft assessment…</option>{drafts.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
