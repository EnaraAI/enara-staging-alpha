import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { fetchMyStudyPlan, setMyStudyItem, startTutorHandoff } from '../services/apiService';
import { toast } from '../services/toastService';

// Study plan (Phase 3): what to do next and why, built from the student's
// assignments, teachers' requests, released results and recorded answers.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const SOURCE: Record<string, string> = { assignment: 'Assignment', teacher: 'From your teacher', result: 'From your results', recommendation: 'Suggested from your answers' };

export const StudyPlan: React.FC<{ onAskTutor: (message: string, sessionId?: string) => void; onNavigate: (page: string) => void }> = ({ onAskTutor, onNavigate }) => {
  const [plan, setPlan] = useState<any>(null);
  const load = () => fetchMyStudyPlan().then(setPlan).catch((err) => { toast.error('Could not load your plan', errorText(err)); setPlan({ items: [], history: [] }); });
  useEffect(() => { load(); }, []);
  const mark = async (key: string, status: 'todo' | 'done' | 'dismissed') => {
    try { setPlan(await setMyStudyItem(key, status)); } catch (err) { toast.error('Not updated', errorText(err)); }
  };
  const tutor = async (key: string) => {
    try {
      const r = await startTutorHandoff('plan_item', key);
      onAskTutor('', r.sessionId);
    } catch (err) {
      toast.error('Could not open the tutor', errorText(err));
    }
  };
  if (!plan) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  const todo = plan.items.filter((i: any) => i.status === 'todo');
  const finished = plan.items.filter((i: any) => i.status !== 'todo');
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Study plan</h1>
        {plan.note && <p className="text-sm text-slate-600 mt-1">{plan.note}</p>}
      </div>
      {!todo.length ? (
        <p className="text-slate-600 bg-white border border-slate-200 rounded-xl p-4">Nothing to do right now. New assignments, your teachers' requests and your results will show up here.</p>
      ) : (
        <ol className="space-y-3">
          {todo.map((i: any) => (
            <li key={i.key} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{SOURCE[i.source] ?? i.source}</p>
                  <p className="font-semibold text-slate-900" dir="auto">{i.title}</p>
                </div>
                {i.dueAt && <span className="text-xs text-slate-600">Due {new Date(i.dueAt).toLocaleDateString()}</span>}
              </div>
              <p className="text-sm text-slate-700 mt-1" dir="auto">{i.rationale}</p>
              {i.effortMinutes ? <p className="text-xs text-slate-500 mt-1">About {i.effortMinutes} minutes (the time limit).</p> : null}
              <div className="flex flex-wrap gap-2 mt-3">
                {i.kind === 'assignment' ? (
                  <button onClick={() => onNavigate('assignments-student')} className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-sm font-semibold">Open assignment</button>
                ) : (
                  <button onClick={() => tutor(i.key)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-sm font-semibold"><MessageSquare className="w-4 h-4" /> Work on it with the tutor</button>
                )}
                {i.kind !== 'assignment' && <button onClick={() => mark(i.key, 'done')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Mark done</button>}
                {i.source === 'recommendation' && <button onClick={() => mark(i.key, 'dismissed')} className="px-3 py-1.5 rounded-lg text-sm text-slate-600">Not now</button>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {finished.length > 0 && (
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer">Done or set aside ({finished.length})</summary>
          <ul className="mt-2 space-y-1">{finished.map((i: any) => <li key={i.key} className="flex justify-between gap-2"><span>{i.title}</span><button onClick={() => mark(i.key, 'todo')} className="text-teal-700">Put back</button></li>)}</ul>
        </details>
      )}
    </div>
  );
};
