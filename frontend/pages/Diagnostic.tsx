import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import {
  answerDiagnostic,
  completeDiagnostic,
  fetchDiagnosticReport,
  startDiagnostic,
  type DiagnosticView,
} from '../services/apiService';

// A short adaptive check: one question at a time, chosen by the server. No
// right/wrong feedback until the end, so the check stays a fair measurement.

const RESULT: Record<string, { label: string; tone: string }> = {
  secure: { label: 'Secure', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  gap: { label: 'Needs work', tone: 'text-rose-800 bg-rose-50 border-rose-200' },
  mixed: { label: 'Mixed', tone: 'text-amber-900 bg-amber-50 border-amber-200' },
  inconclusive: { label: 'Not enough answers', tone: 'text-slate-700 bg-slate-50 border-slate-200' },
};

const STOP: Record<string, string> = {
  enough_evidence: 'The check had enough answers to see where you are.',
  max_questions: 'You reached the question limit.',
  max_duration: 'The time limit was reached.',
  pool_exhausted: 'There were no more questions to ask.',
  student_ended: 'You ended the check early, so some results may be incomplete.',
};

export const Diagnostic: React.FC<{
  courseId: string;
  objectiveIds?: string[];
  title?: string;
  onClose: () => void;
  onAskTutor?: (prompt: string, sessionId?: string) => void;
}> = ({ courseId, objectiveIds, title, onClose, onAskTutor }) => {
  const [stage, setStage] = useState<'intro' | 'question' | 'report'>('intro');
  const [session, setSession] = useState<DiagnosticView | null>(null);
  const [report, setReport] = useState<any>(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), [stage, session?.currentQuestion?.questionId]);

  const show = async (view: DiagnosticView) => {
    setSession(view);
    setChoice('');
    if (view.status === 'in_progress' && view.currentQuestion) {
      setStage('question');
    } else {
      setReport(await fetchDiagnosticReport(view.id));
      setStage('report');
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const begin = () => run(async () => show(await startDiagnostic(courseId, objectiveIds)));
  const submit = () =>
    run(async () => {
      const q = session!.currentQuestion!;
      await show(await answerDiagnostic(session!.id, q.assessmentId, q.questionId, choice));
    });
  const end = () => run(async () => show(await completeDiagnostic(session!.id)));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button onClick={onClose} className="text-sm font-semibold text-teal-700 hover:underline">← Back to my progress</button>

      {stage === 'intro' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h1 ref={heading} tabIndex={-1} className="m-0 text-2xl font-extrabold text-slate-900 outline-none">{title || 'Quick check'}</h1>
          <p className="m-0 text-slate-700">
            A short check of up to about 12 questions, one at a time. Each question is chosen from your earlier answers, so it stops as soon as it can
            see where you are. You'll see your results at the end, not after each question. If you leave, you can carry on later.
          </p>
          {error && <p className="m-0 text-rose-700" role="alert">{error}</p>}
          <button onClick={begin} disabled={busy} className="h-11 px-5 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />} Start or continue
          </button>
        </section>
      )}

      {stage === 'question' && session?.currentQuestion && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <p className="m-0 text-sm text-slate-600" aria-live="polite">
              Question {session.questionsAnswered + 1} of at most {session.maxQuestions}
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={session.maxQuestions} aria-valuenow={session.questionsAnswered} aria-label="Progress">
              <div className="h-2 rounded-full bg-teal-600" style={{ width: `${(session.questionsAnswered / session.maxQuestions) * 100}%` }} />
            </div>
          </div>
          <h2 ref={heading} tabIndex={-1} className="m-0 text-xl font-bold text-slate-900 outline-none">{session.currentQuestion.text}</h2>
          <fieldset className="space-y-2">
            <legend className="sr-only">Choose an answer</legend>
            {(session.currentQuestion.options.length ? session.currentQuestion.options : ['True', 'False']).map((opt) => (
              <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${choice === opt ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="diagnostic-answer" value={opt} checked={choice === opt} onChange={() => setChoice(opt)} />
                <span className="text-slate-900">{opt}</span>
              </label>
            ))}
          </fieldset>
          {error && <p className="m-0 text-rose-700" role="alert">{error}</p>}
          <div className="flex flex-wrap justify-between gap-3">
            <button onClick={end} disabled={busy} className="h-10 px-4 rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-100">
              End check now
            </button>
            <button onClick={submit} disabled={busy || !choice} className="h-11 px-5 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold inline-flex items-center gap-2 disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Submit answer
            </button>
          </div>
        </section>
      )}

      {stage === 'report' && report && (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h1 ref={heading} tabIndex={-1} className="m-0 text-2xl font-extrabold text-slate-900 outline-none">Your results</h1>
            <p className="m-0 mt-1 text-slate-700">
              {report.questionsAnswered} question{report.questionsAnswered === 1 ? '' : 's'} answered. {STOP[report.stopReason] || ''}
            </p>
            {report.inconclusive && <p className="m-0 mt-2 text-slate-700">There weren't enough answers to say much yet. Try again when you have a few minutes.</p>}
          </div>
          <ul className="m-0 p-0 list-none space-y-3">
            {report.objectives.map((row: any) => (
              <li key={row.objective.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-xs font-bold text-slate-500">{row.objective.code}</p>
                    <p className="m-0 font-bold text-slate-900">{row.objective.title}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded border text-xs font-bold ${RESULT[row.diagnostic.result].tone}`}>
                    {row.diagnostic.blockedByPrerequisite ? `Check ${row.diagnostic.blockedByPrerequisite} first` : RESULT[row.diagnostic.result].label}
                  </span>
                </div>
                <p className="m-0 text-sm text-slate-600">
                  {row.diagnostic.answered > 0 ? `${row.diagnostic.correct} of ${row.diagnostic.answered} right in this check.` : 'Not asked in this check.'}
                  {row.mastery.masteryEstimate !== null && ` Overall estimate ${Math.round(row.mastery.masteryEstimate * 100)}% (from all your answers).`}
                </p>
                {row.possibleMisconceptions.map((m: any) => (
                  <p key={m.id} className="m-0 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 flex gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Possible mix-up (not confirmed): {m.description}
                    </span>
                  </p>
                ))}
                <p className="m-0 text-sm text-slate-800 flex gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" /> {row.recommendation.text}
                </p>
                {onAskTutor && ['practise', 'review_prerequisite'].includes(row.recommendation.type) && (
                  <button
                    onClick={() => onAskTutor(`Help me with ${row.objective.title}. Start by checking what I already know, then explain step by step.`)}
                    className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <MessageCircle size={14} aria-hidden="true" /> Practise with the AI tutor
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={onClose} className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold">Done</button>
        </section>
      )}
    </div>
  );
};
