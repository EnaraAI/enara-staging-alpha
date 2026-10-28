import { createPortal } from 'react-dom';
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, MessageCircle, X } from 'lucide-react';
import { Diagnostic } from './Diagnostic';
import {
  completeIntervention,
  createIntervention,
  fetchKnowledgeMap,
  fetchMyInterventions,
  fetchRecommendations,
  reassessIntervention,
  startIntervention,
  fetchObjectiveMastery,
  isFeatureDisabled,
  type KnowledgeMapObjective,
  type MasteryStatus,
} from '../services/apiService';

// A student's learning objectives with their mastery estimate, how much
// evidence it rests on, gaps and the prerequisites behind them. Everything
// shown comes from the backend; estimates are labelled as estimates.

const STATUS: Record<MasteryStatus, { label: string; tone: string }> = {
  mastered: { label: 'Mastered', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  proficient: { label: 'Proficient', tone: 'bg-teal-50 text-teal-800 border-teal-200' },
  developing: { label: 'Developing', tone: 'bg-amber-50 text-amber-900 border-amber-200' },
  emerging: { label: 'Emerging', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
  not_assessed: { label: 'Not assessed yet', tone: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const STRENGTH: Record<string, string> = {
  none: 'no evidence yet',
  limited: 'limited evidence',
  moderate: 'moderate evidence',
  substantial: 'substantial evidence',
};

const EVIDENCE_TYPE: Record<string, string> = {
  independent_assessment: 'Assessment answer',
  diagnostic: 'Diagnostic answer',
  retention_review: 'Review answer',
  guided_practice: 'Guided practice',
  teacher_verified: 'Teacher verified',
};

const StatusBadge: React.FC<{ status: MasteryStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold ${STATUS[status].tone}`}>
    {status === 'mastered' || status === 'proficient' ? <CheckCircle2 size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
    {STATUS[status].label}
  </span>
);

const ObjectiveTitle: React.FC<{ o: Pick<KnowledgeMapObjective, 'title' | 'code' | 'translations'> }> = ({ o }) => (
  <div>
    <p className="m-0 text-xs font-bold text-slate-500">{o.code}</p>
    <p className="m-0 font-bold text-slate-900">{o.title}</p>
    {o.translations?.ar?.title && (
      <p className="m-0 text-sm text-slate-700" dir="rtl" lang="ar">
        {o.translations.ar.title}
      </p>
    )}
  </div>
);

export const KnowledgeMap: React.FC<{ studentId?: string; onAskTutor?: (prompt: string, sessionId?: string) => void; onOpenCourses?: () => void }> = ({ studentId = 'me', onAskTutor, onOpenCourses }) => {
  const [objectives, setObjectives] = useState<KnowledgeMapObjective[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [selected, setSelected] = useState<KnowledgeMapObjective | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [check, setCheck] = useState<{ courseId: string; objectiveIds?: string[]; title: string } | null>(null);

  const [plan, setPlan] = useState<any[]>([]);
  const [recs, setRecs] = useState<any[]>([]);
  const loadPlan = () => {
    if (studentId !== 'me') return;
    fetchMyInterventions()
      .then((r) => setPlan(r.interventions.filter((i: any) => ['assigned', 'in_progress', 'completed'].includes(i.status) && !i.outcome)))
      .catch(() => setPlan([]));
    fetchRecommendations()
      .then((r) => setRecs(r.recommendations.filter((x: any) => x.type !== 'continue_intervention').slice(0, 4)))
      .catch(() => setRecs([]));
  };

  // Practice goes through an intervention: the tutor gets this objective and
  // a chosen strategy, and an independent check follows.
  const practise = async (objective: { id: string; title: string }, interventionId?: string) => {
    try {
      let id = interventionId;
      if (!id) {
        try {
          id = (await createIntervention(objective.id)).id;
        } catch (err) {
          const active = (await fetchMyInterventions()).interventions.find(
            (i: any) => i.objectiveId === objective.id && ['assigned', 'in_progress'].includes(i.status),
          );
          if (!active) throw err;
          id = active.id;
        }
      }
      const started = await startIntervention(id!);
      onAskTutor?.(`I'd like to practise: ${objective.title}.`, started.tutorSessionId ?? undefined);
      loadPlan();
    } catch {
      // Learning intelligence unavailable: ordinary tutoring still works.
      onAskTutor?.(`Help me practise this learning objective: ${objective.title}. Ask me one question at a time.`);
    }
  };

  const load = () => {
    setError(null);
    loadPlan();
    fetchKnowledgeMap(studentId)
      .then((r) => setObjectives(r.objectives))
      .catch((err) => {
        if (isFeatureDisabled(err)) setDisabled(true);
        else setError(err instanceof Error ? err.message : 'Could not load your progress.');
      });
  };
  useEffect(load, [studentId]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    setDetail(null);
    fetchObjectiveMastery(selected.id, studentId).then(setDetail).catch(() => setDetail({ evidence: [] }));
  }, [selected?.id]);

  if (check) {
    return (
      <Diagnostic
        courseId={check.courseId}
        objectiveIds={check.objectiveIds}
        title={check.title}
        onAskTutor={onAskTutor}
        onClose={() => {
          setCheck(null);
          setObjectives(null);
          load();
        }}
      />
    );
  }

  if (disabled) {
    return <p className="max-w-3xl mx-auto p-8 text-slate-700">Learning progress by objective isn't turned on for your school yet.</p>;
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-slate-700">
        {error}{' '}
        <button onClick={load} className="font-bold text-teal-700 hover:underline">Try again</button>
      </div>
    );
  }
  if (!objectives) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-600">
        <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Loading your progress…
      </div>
    );
  }
  if (!objectives.length) {
    return <p className="max-w-3xl mx-auto p-8 text-slate-700">Your teachers haven't set learning objectives for your courses yet.</p>;
  }

  const gaps = objectives.filter((o) => o.isGap);
  const ready = objectives.filter((o) => !o.isGap && o.readyToLearn && o.masteryStatus === 'not_assessed');
  const rest = objectives.filter((o) => !gaps.includes(o) && !ready.includes(o));
  const count = (s: MasteryStatus) => objectives.filter((o) => o.masteryStatus === s).length;

  const Card: React.FC<{ o: KnowledgeMapObjective }> = ({ o }) => (
    <li>
      <button
        onClick={() => setSelected(o)}
        className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <div className="flex items-start justify-between gap-3">
          <ObjectiveTitle o={o} />
          <StatusBadge status={o.masteryStatus} />
        </div>
        <p className="m-0 mt-2 text-sm text-slate-600">
          {o.masteryEstimate === null ? 'No estimate yet' : `Estimate ${Math.round(o.masteryEstimate * 100)}%`} · {STRENGTH[o.evidenceStrength]}
          {o.needsVerification && ' · needs another check to confirm'}
        </p>
        {o.weakPrerequisites.length > 0 && (
          <p className="m-0 mt-1 text-sm text-amber-900">
            Builds on: {o.weakPrerequisites.map((p) => p.code).join(', ')} (not secure yet)
          </p>
        )}
      </button>
    </li>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">My progress</h1>
        <p className="text-slate-600 mt-1 max-w-3xl">
          What your assessment answers show about each learning objective. The percentage is an estimate from your answers so far, not a grade;
          the more questions you answer, the more reliable it gets.
        </p>
      </div>

      {studentId === 'me' && objectives.some((o: any) => o.courseId) && (
        <div className="flex flex-wrap gap-2">
          {[...new Map(objectives.filter((o: any) => o.courseId).map((o: any) => [o.courseId, o])).values()].map((o: any) => (
            <button
              key={o.courseId}
              onClick={() => setCheck({ courseId: o.courseId, title: 'Quick check' })}
              className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold"
            >
              Take a quick check{new Set(objectives.map((x: any) => x.courseId).filter(Boolean)).size > 1 ? ` (${o.code.split('.')[0]})` : ''}
            </button>
          ))}
        </div>
      )}

      {recs.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="m-0 text-lg font-bold text-slate-900">Recommended for you</h2>
          <ul className="m-0 mt-3 p-0 list-none space-y-3">
            {recs.map((r) => {
              const o = objectives.find((x) => x.id === r.objectiveId);
              const check = () => setCheck({ courseId: r.courseId, objectiveIds: [r.objectiveId], title: `Quick check: ${r.objectiveCode}` });
              return (
                <li key={`${r.type}-${r.objectiveId}`} className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-slate-800 max-w-2xl">{r.explanation}</p>
                  {['practise', 'review_prerequisite'].includes(r.type) && o && (
                    <button onClick={() => practise(o)} className="h-9 px-3 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">Practise</button>
                  )}
                  {['reassess', 'review_due'].includes(r.type) && r.courseId && (
                    <button onClick={check} className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold">
                      {r.type === 'review_due' ? 'Review now' : 'Take a quick check'}
                    </button>
                  )}
                  {r.type === 'learn_next' && onOpenCourses && (
                    <button onClick={onOpenCourses} className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold">Go to my lessons</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {plan.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="m-0 text-lg font-bold text-slate-900">My plan</h2>
          <ul className="m-0 mt-3 p-0 list-none space-y-3">
            {plan.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 font-semibold text-slate-900">{i.objective?.code} {i.objective?.title}</p>
                  <p className="m-0 text-sm text-slate-600">
                    {i.assignedBy === 'teacher' ? 'From your teacher' : 'Your choice'}
                    {i.note ? `: ${i.note}` : ''} · {i.status === 'completed' ? 'practice done, check pending' : i.status === 'in_progress' ? 'in progress' : 'not started'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {i.status !== 'completed' && (
                    <button onClick={() => practise({ id: i.objectiveId, title: i.objective?.title }, i.id)} className="h-9 px-3 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
                      {i.status === 'in_progress' ? 'Continue practice' : 'Start practice'}
                    </button>
                  )}
                  {i.status === 'in_progress' && (
                    <button onClick={() => completeIntervention(i.id).then(loadPlan)} className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold">
                      I've finished practising
                    </button>
                  )}
                  {['in_progress', 'completed'].includes(i.status) && i.courseId && (
                    <button
                      onClick={async () => {
                        await reassessIntervention(i.id);
                        setCheck({ courseId: i.courseId, objectiveIds: [i.objectiveId], title: `Check: ${i.objective?.code}` });
                      }}
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold"
                    >
                      Take the check
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-xs text-slate-500">Practice helps, but only the check shows whether it's understood.</p>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(STATUS) as MasteryStatus[]).map((s) => (
          <div key={s} className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="m-0 text-xs text-slate-600">{STATUS[s].label}</p>
            <p className="m-0 text-2xl font-extrabold text-slate-900">{count(s)}</p>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" aria-hidden="true" /> Needs attention
          </h2>
          <ul className="m-0 p-0 list-none grid md:grid-cols-2 gap-3 mt-3">{gaps.map((o) => <Card key={o.id} o={o} />)}</ul>
        </section>
      )}
      {ready.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900">Ready to learn next</h2>
          <ul className="m-0 p-0 list-none grid md:grid-cols-2 gap-3 mt-3">{ready.map((o) => <Card key={o.id} o={o} />)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900">All objectives</h2>
          <ul className="m-0 p-0 list-none grid md:grid-cols-2 gap-3 mt-3">{rest.map((o) => <Card key={o.id} o={o} />)}</ul>
        </section>
      )}

      {selected && (
        <Portal><div className="fixed inset-0 z-[200] bg-black/40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="objective-detail-title">
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div id="objective-detail-title">
                <ObjectiveTitle o={selected} />
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.masteryStatus} />
              <span className="text-sm text-slate-700">
                {selected.masteryEstimate === null ? 'No estimate yet' : `Estimate ${Math.round(selected.masteryEstimate * 100)}%`} ·{' '}
                {STRENGTH[selected.evidenceStrength]}
              </span>
            </div>
            {selected.needsVerification && (
              <p className="m-0 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-3">
                The estimate is high but rests on few questions. Answering more questions on this objective will confirm it.
              </p>
            )}
            {selected.weakPrerequisites.length > 0 && (
              <p className="m-0 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3">
                This builds on {selected.weakPrerequisites.map((p) => p.code).join(', ')}, which your answers don't show as secure yet.
              </p>
            )}
            {studentId === 'me' && (selected as any).courseId && (
              <button
                onClick={() => {
                  setCheck({ courseId: (selected as any).courseId, objectiveIds: [selected.id, ...selected.weakPrerequisites.map((p) => p.id)], title: `Quick check: ${selected.code}` });
                  setSelected(null);
                }}
                className="inline-flex items-center gap-2 border border-slate-300 bg-white font-bold rounded-md px-4 h-10 mr-2"
              >
                Take a quick check
              </button>
            )}
            {onAskTutor && (
              <button
                onClick={() => {
                  void practise(selected);
                  setSelected(null);
                }}
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10"
              >
                <MessageCircle size={16} aria-hidden="true" /> Practise with the AI tutor
              </button>
            )}
            <section>
              <h3 className="text-sm font-bold text-slate-900">Evidence</h3>
              {!detail ? (
                <Loader2 className="animate-spin text-teal-700 mt-2" size={16} aria-label="Loading" />
              ) : detail.evidence.length === 0 ? (
                <p className="text-sm text-slate-600">No answers recorded for this objective yet.</p>
              ) : (
                <ul className="m-0 p-0 list-none divide-y divide-slate-100 mt-2">
                  {detail.evidence.map((e: any) => (
                    <li key={e.id} className="py-2 text-sm flex justify-between gap-3">
                      <span className={e.invalidatedAt ? 'line-through text-slate-400' : 'text-slate-800'}>
                        {EVIDENCE_TYPE[e.evidenceType] || e.evidenceType} · {new Date(e.occurredAt).toLocaleDateString()}
                        {e.priorExposures > 0 && <span className="text-slate-500"> · seen before</span>}
                      </span>
                      <span className={e.result === 'correct' ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                        {e.result === 'correct' ? 'Correct' : e.result === 'incorrect' ? 'Incorrect' : e.result}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div></Portal>
      )}
    </div>
  );
};

// Dialogs render on <body> so a transformed ancestor cannot clip or offset them.
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => createPortal(children, document.body);
