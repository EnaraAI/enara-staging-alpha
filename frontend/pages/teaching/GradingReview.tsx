import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import {
  correctSubmissionGrade,
  fetchReviewQueue,
  fetchSubmissionForReview,
  finalizeSubmission,
  isFeatureDisabled,
  regradeSubmission,
  releaseSubmission,
  resolveAppeal,
  scoreSubmissionAnswer,
  setSubmissionFeedback,
} from '../../services/apiService';
import { toast } from '../../services/toastService';

// Grading oversight (autograde-v1). Enara grades, checks and releases results
// on its own; this page is where teachers look over that work: submissions
// the grader couldn't finish, students' review requests, and every released
// grade, which they can correct with a reason.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const STATUS: Record<string, string> = {
  grading_exception: 'Needs you: grader stopped',
  grading_failed: 'Grading, will retry',
  grading_in_progress: 'Grading',
  grading_queued: 'Waiting to grade',
  needs_review: 'Needs you: grade by hand',
  graded_draft: 'Scored, not final',
  finalized: 'Final, not released',
  released: 'Released',
  grading_pending: 'Grading',
};
const TONE: Record<string, string> = {
  grading_exception: 'bg-red-100 text-red-800',
  needs_review: 'bg-amber-100 text-amber-800',
  graded_draft: 'bg-amber-100 text-amber-800',
  released: 'bg-emerald-100 text-emerald-800',
};
const REASONS: Record<string, string> = {
  ai_provider_error: 'The AI service failed on every try',
  ai_invalid_output: 'The AI replies kept failing the checks',
  conflicting_results: 'Independent evaluations kept disagreeing',
  integrity_flag: 'The answer may contain instructions to the grader',
  missing_rubric: 'An open question has no rubric',
  feedback_leak: 'Feedback kept revealing the answer key or model answer',
  ai_grading_off: 'AI grading is turned off for your school',
  ai_unavailable: 'AI is not configured',
  version_missing: 'The assessment version is missing',
  unsupported_question: 'A question type can’t be graded automatically',
};
const METHOD: Record<string, string> = { rule: 'answer key', ai: 'Enara grader', teacher: 'teacher', ai_proposal: 'teacher (from AI proposal)' };

function AnswerReview({ item, attemptId, mode, onChanged, conversation }: { item: any; attemptId: string; mode: 'score' | 'correct' | 'view'; onChanged: () => void; conversation?: any[] | null }) {
  const q = item.question;
  const a = item.answer || {};
  const ev = item.aiProposal;
  const [editing, setEditing] = useState(mode === 'score');
  const [levels, setLevels] = useState<Record<string, string>>(Object.fromEntries((a.criterionScores || []).map((c: any) => [c.criterionId, c.levelId])));
  const [points, setPoints] = useState<string>(a.points ?? '');
  const [feedback, setFeedback] = useState<string>(a.feedback ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const body = {
      ...(q.type === 'open-response' ? { criterionScores: Object.entries(levels).map(([criterionId, levelId]) => ({ criterionId, levelId })) } : { points: Number(points) }),
      feedback: feedback || undefined,
      reason: reason || undefined,
    };
    try {
      if (mode === 'correct') await correctSubmissionGrade(attemptId, { questionId: q.id, ...body });
      else await scoreSubmissionAnswer(attemptId, q.id, body);
      toast.success(mode === 'correct' ? 'Grade corrected' : 'Saved', mode === 'correct' ? 'The student sees the new grade; the original is kept in the history.' : '');
      setReason('');
      onChanged();
    } catch (err) {
      toast.error('Not saved', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex justify-between gap-3">
        <p className="font-semibold text-slate-900 text-sm" dir="auto">{q.text}</p>
        <span className="text-sm tabular-nums shrink-0">
          {a.points ?? '–'} / {a.maxPoints}
          {typeof a.originalPoints === 'number' && <span className="block text-xs text-slate-500">was {a.originalPoints}</span>}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">{conversation ? "Student's answer (said to the AI examiner)" : "Student's answer"}</p>
        <p className="text-sm text-slate-900 whitespace-pre-wrap bg-slate-50 rounded p-2 mt-1" dir="auto">{String(a.studentAnswer || '—')}</p>
        {conversation && (
          <details className="mt-2 text-sm" open>
            <summary className="cursor-pointer text-xs font-semibold text-teal-800">Conversation with the AI examiner</summary>
            <div className="mt-2 space-y-1.5">
              {conversation.filter((t: any) => t.questionId === item.question.id).map((t: any, i: number) => (
                <p key={i} dir="auto" className={`rounded-lg px-3 py-1.5 ${t.role === 'student' ? 'bg-teal-50 text-slate-900 ml-8' : 'bg-white border border-slate-200 text-slate-700 mr-8'}`}>
                  <span className="text-[11px] font-semibold text-slate-500 block">{t.role === 'student' ? 'Student' : t.kind === 'follow_up' ? 'Examiner · follow-up' : 'Examiner'}</span>{t.text}
                </p>
              ))}
            </div>
          </details>
        )}
        {q.type !== 'open-response' && <p className="text-xs text-slate-600 mt-1">Answer key: <b>{String(q.correctAnswer)}</b></p>}
        {q.modelAnswer && <p className="text-xs text-slate-600 mt-1" dir="auto">Model answer (never shown to students): {q.modelAnswer}</p>}
        {a.method && <p className="text-xs text-slate-600 mt-1">Graded by {METHOD[a.method] ?? a.method}</p>}
      </div>

      {a.method === 'ai' && ev?.status === 'proposed' && (
        <div className="border border-violet-200 bg-violet-50/60 rounded-lg p-3 text-sm space-y-1">
          <p className="font-semibold text-violet-900 inline-flex items-center gap-1"><Sparkles className="w-4 h-4" /> How Enara graded this</p>
          {ev.criteria?.map((c: any) => {
            const crit = q.rubric?.criteria?.find((x: any) => x.id === c.criterionId);
            const level = crit?.levels?.find((l: any) => l.id === c.levelId);
            return (
              <div key={c.criterionId}>
                <p className="text-slate-800"><b>{crit?.title}:</b> {level?.label} ({c.points}). {c.rationale}</p>
                {c.evidence?.length > 0 && <p className="text-xs text-slate-600">Evidence from the answer: {c.evidence.map((e: string) => `“${e}”`).join(' · ')}</p>}
              </div>
            );
          })}
          {a.scoreExplanation && <p className="text-slate-700" dir="auto">Why: {a.scoreExplanation}</p>}
          {a.strengths?.length > 0 && <p className="text-slate-700" dir="auto">Strengths: {a.strengths.join(' · ')}</p>}
          {a.improvements?.length > 0 && <p className="text-slate-700" dir="auto">To improve: {a.improvements.join(' · ')}</p>}
          <p className="text-xs text-slate-500">
            {item.evaluations?.length ?? 1} independent evaluation(s): {(item.evaluations || []).map((e: any) => e.points ?? e.status).join(', ')}
            {ev.flags?.length > 0 ? ` · flags: ${ev.flags.join(', ').replace(/_/g, ' ')}` : ''}
          </p>
        </div>
      )}
      {a.feedback && !editing && <p className="text-sm text-slate-700" dir="auto"><b>Feedback the student sees:</b> {a.feedback}</p>}

      {mode === 'correct' && !editing && <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">Correct this grade</button>}
      {editing && mode !== 'view' && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {q.type === 'open-response' ? (
            (q.rubric?.criteria || []).map((c: any) => (
              <fieldset key={c.id}>
                <legend className="text-xs font-semibold text-slate-700">{c.title}</legend>
                <div className="flex flex-wrap gap-2 mt-1">
                  {c.levels.map((l: any) => (
                    <label key={l.id} className="text-xs border border-slate-300 rounded-lg px-2 py-1 cursor-pointer has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-500">
                      <input type="radio" className="mr-1" name={`${q.id}-${c.id}`} checked={levels[c.id] === l.id} onChange={() => setLevels({ ...levels, [c.id]: l.id })} />
                      {l.label} ({l.points})
                    </label>
                  ))}
                </div>
              </fieldset>
            ))
          ) : (
            <label className="text-sm text-slate-700 inline-flex items-center gap-2">Points<input type="number" min={0} max={a.maxPoints} className="w-20 border border-slate-300 rounded px-2 py-1" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
          )}
          <textarea aria-label="Feedback" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Feedback for the student (specific and with a next step)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <input aria-label="Reason" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder={mode === 'correct' ? 'Reason for the correction (required, kept in the history)' : 'Reason (required when changing an answer-key score)'} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button disabled={busy} onClick={save} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">{mode === 'correct' ? 'Save correction' : 'Save score'}</button>
        </div>
      )}
    </div>
  );
}

function Appeals({ attemptId, appeals, questions, onChanged }: { attemptId: string; appeals: any[]; questions: any[]; onChanged: () => void }) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  if (!appeals.length) return null;
  const answer = async (id: string, decision: 'upheld' | 'rejected') => {
    try {
      await resolveAppeal(attemptId, id, decision, responses[id] || '');
      toast.success('Reply sent', '');
      onChanged();
    } catch (err) {
      toast.error('Not sent', errorText(err));
    }
  };
  return (
    <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-slate-900">Review requests from the student</h3>
      {appeals.map((p) => (
        <div key={p.id} className="text-sm space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
          <p className="text-slate-800" dir="auto">
            <b>{p.questionId ? `About “${questions.find((q) => q.question.id === p.questionId)?.question.text ?? p.questionId}”` : 'About the whole result'}:</b> {p.message}
          </p>
          {p.status === 'open' ? (
            <>
              <textarea aria-label="Reply" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Your reply to the student. If you agree, correct the grade above first." value={responses[p.id] ?? ''} onChange={(e) => setResponses({ ...responses, [p.id]: e.target.value })} />
              <div className="flex gap-2">
                <button onClick={() => answer(p.id, 'upheld')} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold">Agree</button>
                <button onClick={() => answer(p.id, 'rejected')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">Keep the grade</button>
              </div>
            </>
          ) : (
            <p className="text-slate-600" dir="auto">{p.status === 'upheld' ? 'Agreed' : 'Grade kept'}: {p.response}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export const SubmissionReview: React.FC<{ attemptId: string; onClose: () => void }> = ({ attemptId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [overall, setOverall] = useState('');
  const [confirmFinal, setConfirmFinal] = useState(false);
  const load = () =>
    fetchSubmissionForReview(attemptId)
      .then((d) => { setData(d); setOverall(d.attempt.overallFeedback ?? ''); })
      .catch((err) => toast.error('Could not open submission', errorText(err)));
  useEffect(() => { load(); }, [attemptId]);
  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      toast.success(ok, '');
      load();
    } catch (err) {
      toast.error('Not done', errorText(err));
    }
  };
  if (!data) return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  const st = data.attempt.gradingStatus;
  const final = st === 'finalized' || st === 'released';
  const byHand = st === 'grading_exception' || st === 'needs_review' || st === 'graded_draft';
  const mode = final ? 'correct' : byHand ? 'score' : 'view';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={onClose} className="text-sm text-indigo-700 font-semibold">← Back</button>
          <h2 className="text-lg font-bold text-slate-900 mt-1">{data.student?.name} · {data.assignment.title}</h2>
          <p className="text-sm text-slate-600">
            {STATUS[st] ?? st} · {data.attempt.totalPoints ?? 0} / {data.attempt.maxPoints} points · submitted {new Date(data.attempt.submittedAt).toLocaleString()}
            {data.attempt.late ? ' · late' : ''} · version {data.version.version}{data.format === 'conversation' ? ' · conversation exam' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(st === 'grading_exception' || st === 'grading_failed') && <button onClick={() => run(() => regradeSubmission(attemptId), 'Sent back to the grader')} className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-800 text-sm">Try the grader again</button>}
          {byHand && !confirmFinal && <button onClick={() => setConfirmFinal(true)} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-sm font-semibold">Finalize and release</button>}
          {byHand && confirmFinal && (
            <span className="inline-flex items-center gap-2 text-sm">
              Release these grades to the student now?
              <button onClick={() => { setConfirmFinal(false); run(() => finalizeSubmission(attemptId), 'Released to the student'); }} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white font-semibold">Release</button>
              <button onClick={() => setConfirmFinal(false)} className="px-3 py-1.5 rounded-lg border border-slate-300">Cancel</button>
            </span>
          )}
          {st === 'finalized' && <button onClick={() => run(() => releaseSubmission(attemptId), 'Released to the student')} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold">Release</button>}
        </div>
      </div>
      {st === 'grading_exception' && (
        <div className="flex gap-2 items-start bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            The grader stopped: {REASONS[data.attempt.exceptionReason] ?? data.attempt.exceptionReason} ({data.attempt.gradingRuns} tries). No grade was given. Grade it by hand below and release, or send it back to the grader.
            {data.attempt.gradingError ? <span className="block text-xs mt-1 text-red-800">{data.attempt.gradingError}</span> : null}
          </p>
        </div>
      )}
      {(st === 'grading_queued' || st === 'grading_in_progress' || st === 'grading_failed') && <p className="text-sm text-slate-600">Enara is grading this submission. It will be released to the student as soon as it passes its checks.</p>}
      <Appeals attemptId={attemptId} appeals={data.attempt.appeals || []} questions={data.items} onChanged={load} />
      {data.items.map((item: any) => <AnswerReview key={item.question.id + (item.answer?.points ?? '') + st} item={item} attemptId={attemptId} mode={mode} onChanged={load} conversation={data.format === 'conversation' ? data.attempt.conversation : null} />)}
      {byHand && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <label className="text-sm font-semibold text-slate-800" htmlFor="overall">Overall feedback</label>
          <textarea id="overall" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value={overall} onChange={(e) => setOverall(e.target.value)} />
          <button onClick={() => run(() => setSubmissionFeedback(attemptId, overall), 'Feedback saved')} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Save feedback</button>
        </div>
      )}
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">Grading history</summary>
        <ul className="mt-2 space-y-1">{data.attempt.history.map((h: any, i: number) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.action.replace(/_/g, ' ')}{h.by?.startsWith('system:') ? ` (${h.by.slice(7)})` : ''}{h.questionId ? ` · ${h.questionId}` : ''}{h.from !== undefined && h.to !== undefined && typeof h.to !== 'object' ? ` · ${h.from} → ${h.to}` : ''}{h.reason ? `: ${h.reason}` : ''}</li>)}</ul>
      </details>
    </div>
  );
};

const FILTERS: [string, string][] = [
  ['', 'Everything'],
  ['grading_exception', 'Grader stopped'],
  ['appeals', 'Review requests'],
  ['released', 'Released'],
  ['grading_failed', 'Retrying'],
  ['needs_review', 'Grade by hand'],
];

export const GradingReview: React.FC = () => {
  const [filter, setFilter] = useState('');
  const [queue, setQueue] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = () => {
    setQueue(null);
    const params: Record<string, string> = filter === 'appeals' ? { appeals: 'open' } : filter ? { status: filter } : {};
    fetchReviewQueue(params).then(setQueue).catch((err) => {
      if (isFeatureDisabled(err)) setDisabled(true);
      else toast.error('Could not load submissions', errorText(err));
      setQueue({ items: [] });
    });
  };
  useEffect(() => { if (!openId) load(); }, [filter, openId]);
  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">The teaching workflow isn't enabled for your school.</p>;
  if (openId) return <div className="max-w-4xl mx-auto p-6"><SubmissionReview attemptId={openId} onClose={() => setOpenId(null)} /></div>;
  const c = queue?.counts || {};
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Grading</h1>
          <p className="text-sm text-slate-600 max-w-2xl">Enara grades submissions, checks each result and releases it to the student. Look over any of them here, correct a grade with a reason, and answer students' review requests.</p>
        </div>
        <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {queue && !filter && (c.grading_exception > 0 || queue.openAppeals > 0) && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
          {c.grading_exception > 0 && <>{c.grading_exception} submission(s) the grader couldn't finish. </>}
          {queue.openAppeals > 0 && <>{queue.openAppeals} review request(s) from students.</>}
        </p>
      )}
      {!queue ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div> : !queue.items.length ? (
        <p className="text-slate-600">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="p-3">Student</th><th className="p-3">Assignment</th><th className="p-3">Submitted</th><th className="p-3">Status</th><th className="p-3">Score</th><th className="p-3"></th></tr></thead>
            <tbody>
              {queue.items.map((i: any) => (
                <tr key={i.attemptId} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-900">{i.studentName}</td>
                  <td className="p-3">{i.assignmentTitle}</td>
                  <td className="p-3">{new Date(i.submittedAt).toLocaleString()}{i.late ? ' · late' : ''}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TONE[i.gradingStatus] ?? 'bg-slate-100 text-slate-700'}`}>{STATUS[i.gradingStatus] ?? i.gradingStatus}</span>
                    {i.openAppeals > 0 && <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{i.openAppeals} request(s)</span>}
                    {i.exceptionReason && <span className="block text-xs text-slate-500 mt-0.5">{REASONS[i.exceptionReason] ?? i.exceptionReason}</span>}
                  </td>
                  <td className="p-3 tabular-nums">{i.score !== null && i.score !== undefined ? `${i.score}%` : '–'}</td>
                  <td className="p-3"><button onClick={() => setOpenId(i.attemptId)} className="text-indigo-700 font-semibold">Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
