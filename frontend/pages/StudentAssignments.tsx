import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clock, Loader2, MessagesSquare, Send } from 'lucide-react';
import {
  appealMyResult,
  converseMyAssignment,
  fetchMyAssignment,
  fetchMyAssignments,
  saveMyAssignmentDraft,
  startMyAssignment,
  startTutorHandoff,
  submitMyAssignment,
} from '../services/apiService';
import { toast } from '../services/toastService';
import { SpeakingExam } from '../components/SpeakingExam';

// Student assignments (Phase 3): work set by teachers with due dates. Enara
// grades submissions and shows results as soon as they pass its checks;
// students can ask their teacher to look again at a result.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

const STATUS: Record<string, { label: string; tone: string }> = {
  not_started: { label: 'Not started', tone: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In progress', tone: 'bg-sky-100 text-sky-800' },
  submitted: { label: 'Submitted', tone: 'bg-indigo-100 text-indigo-800' },
  grading: { label: 'Submitted · grading', tone: 'bg-indigo-100 text-indigo-800' },
  grading_delayed: { label: 'Submitted · result delayed', tone: 'bg-amber-100 text-amber-800' },
  awaiting_review: { label: 'Submitted · being marked', tone: 'bg-indigo-100 text-indigo-800' },
  graded: { label: 'Marked · not released yet', tone: 'bg-indigo-100 text-indigo-800' },
  released: { label: 'Results ready', tone: 'bg-emerald-100 text-emerald-800' },
  missing: { label: 'Missing', tone: 'bg-rose-100 text-rose-800' },
};

const formatWhen = (iso: string, tz: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  useEffect(() => {
    if (left === 0) onEnd();
  }, [left === 0]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${left < 120000 ? 'text-rose-700' : 'text-slate-700'}`} role="timer" aria-live="off">
      <Clock className="w-4 h-4" /> {m}:{String(s).padStart(2, '0')} left
    </span>
  );
}

function Appeal({ assignmentId, attemptId, questionId, onDone }: { assignmentId: string; attemptId: string; questionId?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-teal-700 font-semibold">Ask your teacher to look again</button>;
  const send = async () => {
    setBusy(true);
    try {
      await appealMyResult(assignmentId, attemptId, message, questionId);
      toast.success('Sent to your teacher', 'They will reply here.');
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error('Not sent', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <textarea aria-label="What should your teacher look at?" dir="auto" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="What should your teacher look at again, and why?" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex gap-2">
        <button disabled={busy || !message.trim()} onClick={send} className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold disabled:opacity-50">Send</button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs">Cancel</button>
      </div>
    </div>
  );
}

function Result({ r, assignmentId, onChanged }: { r: any; assignmentId: string; onChanged: () => void }) {
  // While grading runs, check back every few seconds until the result is in.
  const reload = useRef(onChanged);
  reload.current = onChanged;
  useEffect(() => {
    if (r.released || r.processing !== 'grading') return;
    const t = setInterval(() => reload.current(), 4000);
    return () => clearInterval(t);
  }, [r.released, r.processing, r.attemptId]);
  if (!r.released) {
    const when = `Submitted ${new Date(r.submittedAt).toLocaleString()}${r.late ? ' (late)' : ''}.`;
    if (r.processing === 'delayed') return <p className="text-sm text-amber-800">{when} Your result is taking longer than usual. Your teacher has been told and will check it; no score has been given yet.</p>;
    if (r.processing === 'with_teacher') return <p className="text-sm text-slate-600">{when} Your teacher is marking this.</p>;
    return <p className="text-sm text-slate-600 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {when} Enara is grading your answers. Your result appears here when it's ready.</p>;
  }
  const appealFor = (questionId?: string) => (r.appeals || []).find((p: any) => (p.questionId ?? null) === (questionId ?? null));
  const AppealState = ({ questionId }: { questionId?: string }) => {
    const p = appealFor(questionId);
    if (!p) return <Appeal assignmentId={assignmentId} attemptId={r.attemptId} questionId={questionId} onDone={onChanged} />;
    if (p.status === 'open') return <p className="text-xs text-slate-500">You asked your teacher to look again. Waiting for their reply.</p>;
    return <p className="text-xs text-slate-700 bg-slate-50 rounded p-2" dir="auto"><b>Your teacher {p.status === 'upheld' ? 'agreed' : 'kept the grade'}:</b> {p.response}</p>;
  };
  return (
    <div className="space-y-3">
      <p className="text-lg font-bold text-slate-900">
        {r.totalPoints} / {r.maxPoints} points <span className="text-slate-500 font-medium">({r.score}%)</span>
        {r.late && <span className="ml-2 text-xs font-semibold text-amber-700">submitted late</span>}
      </p>
      {r.overallFeedback && <p className="text-sm bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-slate-800" dir="auto">{r.overallFeedback}</p>}
      <ol className="space-y-3">
        {r.answers.map((a: any, i: number) => (
          <li key={a.questionId} className="border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900" dir="auto">{i + 1}. {a.questionText}</p>
              <span className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">{a.points ?? '–'} / {a.maxPoints}</span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="auto"><span className="text-slate-500">Your answer: </span>{String(a.studentAnswer || '—')}</p>
            {r.answerKeyShown && a.correctAnswer !== undefined && <p className="text-sm text-slate-700">Correct answer: <b>{String(a.correctAnswer)}</b></p>}
            {r.answerKeyShown && a.explanation && <p className="text-sm text-slate-600" dir="auto">{a.explanation}</p>}
            {a.scoreExplanation && <p className="text-sm text-slate-700" dir="auto"><span className="text-slate-500">Why this score: </span>{a.scoreExplanation}</p>}
            {a.strengths?.length > 0 && <p className="text-sm text-emerald-800" dir="auto"><span className="font-semibold">What went well: </span>{a.strengths.join(' · ')}</p>}
            {a.improvements?.length > 0 && <p className="text-sm text-amber-800" dir="auto"><span className="font-semibold">To work on: </span>{a.improvements.join(' · ')}</p>}
            {a.feedback && <p className="text-sm text-slate-800 bg-slate-50 rounded p-2" dir="auto">{a.feedback}</p>}
            <AppealState questionId={a.questionId} />
          </li>
        ))}
      </ol>
      {!r.answerKeyShown && <p className="text-xs text-slate-500">Correct answers are shown when the assignment closes, if your teacher allows it.</p>}
    </div>
  );
}

// Conversation exam: the AI examiner asks each question in turn (and may ask
// one follow-up); what the student says is recorded as their answer.
function ConversationExam({ assignmentId, attempt, questionCount, busy, onSubmit }: { assignmentId: string; attempt: any; questionCount: number; busy: boolean; onSubmit: () => void }) {
  const [turns, setTurns] = useState<any[]>(attempt.conversation || []);
  const [state, setState] = useState<{ index: number; probed: boolean; done: boolean } | null>(attempt.conversationState);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = useCallback(async (text?: string) => {
    setSending(true);
    if (text) setTurns((t) => [...t, { role: 'student', text, pending: true }]);
    try {
      const r = await converseMyAssignment(assignmentId, attempt.id, text);
      setTurns((t) => [...t.filter((x) => !x.pending), ...r.turns]);
      setState(r.state);
      if (text) setMsg('');
    } catch (err) {
      setTurns((t) => t.filter((x) => !x.pending));
      toast.error('Not sent', errorText(err));
    } finally {
      setSending(false);
    }
  }, [assignmentId, attempt.id]);

  useEffect(() => {
    if (!started.current && !attempt.conversationState) { started.current = true; send(); }
  }, [attempt.conversationState, send]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, sending]);

  const done = !!state?.done;
  const current = state ? Math.min(state.index + 1, questionCount) : 1;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 230px)', minHeight: 480 }}>
      <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center"><MessagesSquare className="w-4 h-4" aria-hidden="true" /></div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900 text-sm">AI examiner</p>
          <p className="text-xs text-slate-500">{done ? 'All questions done' : `Question ${current} of ${questionCount}`} · Answer in your own words</p>
        </div>
        <div className="w-40 h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
          <div className="h-full bg-teal-600 transition-all" style={{ width: `${((done ? questionCount : current - 1) / questionCount) * 100}%` }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div dir="auto" className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${t.role === 'student' ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'} ${t.pending ? 'opacity-70' : ''}`}>
              {t.kind === 'follow_up' && <span className="block text-[11px] font-semibold text-teal-700 mb-0.5">Follow-up</span>}
              {t.text}
            </div>
          </div>
        ))}
        {sending && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3 h-3 animate-spin" /> The examiner is listening…</div>}
        <div ref={endRef} />
      </div>
      {done ? (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Your answers are saved. Submit to have them marked.</p>
          <button disabled={busy} onClick={onSubmit} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Submit exam</button>
        </div>
      ) : (
        <form className="p-3 border-t border-slate-200 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msg.trim() && !sending && state) send(msg.trim()); }}>
          <textarea
            aria-label="Your answer"
            dir="auto"
            rows={2}
            className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm resize-none"
            placeholder="Type your answer…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (msg.trim() && !sending && state) send(msg.trim()); } }}
          />
          <button type="submit" disabled={!msg.trim() || sending || !state} className="px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"><Send className="w-4 h-4" aria-hidden="true" /> Send</button>
        </form>
      )}
    </div>
  );
}

export const StudentAssignments: React.FC<{ onAskTutor?: (message: string, sessionId?: string) => void }> = ({ onAskTutor }) => {
  const [list, setList] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [work, setWork] = useState<{ attempt: any; questions: any[]; format?: string; speaking?: any; speakingAttempt?: any } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = useRef(false);

  const loadList = () => fetchMyAssignments().then((r) => setList(r.assignments)).catch((err) => { toast.error('Could not load assignments', errorText(err)); setList([]); });
  useEffect(() => { loadList(); }, []);

  const open = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setWork(null);
    try {
      setDetail(await fetchMyAssignment(id));
    } catch (err) {
      toast.error('Could not open assignment', errorText(err));
      setOpenId(null);
    }
  };

  // Quiet reload (no loading state), for polling and after an appeal.
  const refresh = async (id: string) => {
    try {
      setDetail(await fetchMyAssignment(id));
    } catch {
      // Keep what is shown; the next refresh tries again.
    }
  };

  const start = async () => {
    if (!openId) return;
    setBusy(true);
    try {
      const r = await startMyAssignment(openId);
      setWork(r);
      setAnswers(Object.fromEntries(Object.entries(r.attempt.draftAnswers || {}).map(([k, v]) => [k, String(v)])));
      setSavedAt(r.attempt.draftSavedAt);
    } catch (err) {
      toast.error('Could not start', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = useCallback(async () => {
    if (!openId || !work || !dirty.current) return;
    dirty.current = false;
    try {
      const r = await saveMyAssignmentDraft(openId, work.attempt.id, answers);
      setSavedAt(r.savedAt);
    } catch {
      dirty.current = true;
    }
  }, [openId, work, answers]);

  useEffect(() => {
    if (!work) return;
    const t = setInterval(save, 15000);
    return () => clearInterval(t);
  }, [work, save]);

  const submit = async () => {
    if (!openId || !work) return;
    setBusy(true);
    setConfirm(false);
    try {
      await submitMyAssignment(openId, work.attempt.id, answers);
      toast.success('Submitted', 'Your work was received.');
      setWork(null);
      await Promise.all([open(openId), loadList()]);
    } catch (err) {
      toast.error('Not submitted', `${errorText(err)}. Your saved answers are kept.`);
    } finally {
      setBusy(false);
    }
  };

  const askTutor = async (kind: 'assignment' | 'result', refId: string) => {
    if (!onAskTutor) return;
    try {
      const r = await startTutorHandoff(kind, refId);
      onAskTutor('', r.sessionId);
    } catch (err) {
      toast.error('Tutor not available', errorText(err));
    }
  };

  if (list === null) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  if (openId && work && work.format === 'english_conversation' && work.speaking) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Speaking exam</p>
          {work.attempt.expiresAt && work.speakingAttempt && <Countdown until={work.attempt.expiresAt} onEnd={() => { toast.info('Time is up', 'Submitting what you said.'); submit(); }} />}
        </div>
        <SpeakingExam assignmentId={openId} attempt={{ ...work.attempt, speakingStarted: Boolean(work.speakingAttempt) }} settings={work.speaking} busy={busy} onSubmit={submit} />
      </div>
    );
  }

  if (openId && work && work.format === 'conversation') {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Conversation exam</p>
          {work.attempt.expiresAt && <Countdown until={work.attempt.expiresAt} onEnd={() => { toast.info('Time is up', 'Submitting your answers.'); submit(); }} />}
        </div>
        <ConversationExam
          assignmentId={openId}
          attempt={work.attempt}
          questionCount={work.questions.filter((q) => q.type === 'open-response' || q.type === 'short-answer').length}
          busy={busy}
          onSubmit={submit}
        />
      </div>
    );
  }

  if (openId && work) {
    const answered = work.questions.filter((q) => (answers[q.id] ?? '').trim()).length;
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 bg-slate-50/95 py-2 z-10">
          <p className="text-sm text-slate-600">{answered} of {work.questions.length} answered · {savedAt ? `saved ${new Date(savedAt).toLocaleTimeString()}` : 'not saved yet'}</p>
          {work.attempt.expiresAt && <Countdown until={work.attempt.expiresAt} onEnd={() => { toast.info('Time is up', 'Submitting your answers.'); submit(); }} />}
        </div>
        {work.questions.map((q: any, i: number) => (
          <fieldset key={q.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="flex justify-between gap-3">
              <p className="font-semibold text-slate-900" dir="auto">{i + 1}. {q.text}</p>
              <span className="text-xs text-slate-500 shrink-0">{q.points} pt{q.points === 1 ? '' : 's'}</span>
            </div>
            {q.type === 'multiple-choice' || q.type === 'true-false' ? (
              <div className="mt-3 space-y-2">
                {(q.type === 'true-false' && !q.options?.length ? ['True', 'False'] : q.options).map((o: string) => (
                  <label key={o} className="flex items-center gap-2 text-sm text-slate-800 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50">
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === o} onChange={() => { setAnswers({ ...answers, [q.id]: o }); dirty.current = true; }} />
                    <span dir="auto">{o}</span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <textarea
                  aria-label={`Answer to question ${i + 1}`}
                  dir="auto"
                  className="mt-3 w-full border border-slate-300 rounded-lg p-3 text-sm min-h-[110px]"
                  value={answers[q.id] ?? ''}
                  onChange={(e) => { setAnswers({ ...answers, [q.id]: e.target.value }); dirty.current = true; }}
                />
                {q.rubric?.criteria?.length > 0 && (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer">How this is marked</summary>
                    <ul className="mt-1 space-y-1">
                      {q.rubric.criteria.map((c: any) => (
                        <li key={c.id}><b>{c.title}</b> ({c.maxPoints} pts): {c.levels.map((l: any) => `${l.label} ${l.points}`).join(' · ')}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-3">
          <button onClick={save} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">Save</button>
          <button disabled={busy} onClick={() => setConfirm(true)} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Submit</button>
        </div>
        {confirm && createPortal(
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000]" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3">
              <h2 id="confirm-title" className="font-bold text-slate-900">Submit your work?</h2>
              <p className="text-sm text-slate-600">{answered} of {work.questions.length} questions answered. You can't change answers after submitting.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirm(false)} className="px-3 py-2 text-sm rounded-lg border border-slate-300">Keep working</button>
                <button onClick={submit} className="px-3 py-2 text-sm rounded-lg bg-teal-700 text-white font-semibold">Submit</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  if (openId) {
    if (!detail) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
    const a = detail.assignment;
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
        <button onClick={() => { setOpenId(null); loadList(); }} className="inline-flex items-center gap-1 text-sm text-teal-700 font-semibold"><ArrowLeft className="w-4 h-4" /> All assignments</button>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-slate-900" dir="auto">{a.title}</h1>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS[detail.status]?.tone}`}>{STATUS[detail.status]?.label ?? detail.status}</span>
          </div>
          {a.instructions && <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="auto">{a.instructions}</p>}
          <p className="text-sm text-slate-600">
            Due {formatWhen(a.dueAt, a.timeZone)} ({a.timeZone}){a.originalDueAt !== a.dueAt ? ' · extended for you' : ''} · {a.questionCount} questions · {a.totalPoints} points
            {a.timeLimitMinutes ? ` · ${a.timeLimitMinutes} minutes once you start` : ''} · {a.maxAttempts} attempt{a.maxAttempts === 1 ? '' : 's'}
          </p>
          {a.format === 'english_conversation' && <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">Speaking exam: you talk with an AI examiner using your microphone. You'll need a working microphone and a quiet place.</p>}
          {a.format === 'conversation' && <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">Conversation exam: an AI examiner asks you each question and you answer in your own words. It may ask you to explain a little more, but it can't give hints.</p>}
          {a.latePolicy === 'accept_late' && a.closesAt && <p className="text-xs text-amber-700">Late work accepted until {formatWhen(a.closesAt, a.timeZone)} and marked late.</p>}
          {detail.canStart || detail.openAttemptId ? (
            <button disabled={busy} onClick={start} className="mt-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
              {detail.openAttemptId ? 'Continue' : detail.attempts.length ? 'Start another attempt' : a.format === 'conversation' ? 'Start conversation exam' : a.format === 'english_conversation' ? 'Start speaking exam' : 'Start'}
            </button>
          ) : (
            !detail.attempts.length && <p className="text-sm text-slate-600">{detail.window?.reason === 'not_open_yet' ? `Opens ${formatWhen(a.opensAt, a.timeZone)}.` : 'This assignment is closed.'}</p>
          )}
        </div>
        {onAskTutor && a.tutorPolicy !== 'blocked' && !detail.attempts.some((r: any) => r.released) && (
          <button onClick={() => askTutor('assignment', a.id)} className="text-sm text-teal-700 font-semibold">Get help from the AI tutor{a.tutorPolicy === 'hints_only' ? ' (hints only)' : ''}</button>
        )}
        {detail.attempts.map((r: any) => (
          <section key={r.attemptId} className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Your submission</h2>
            <Result r={r} assignmentId={a.id} onChanged={() => refresh(a.id)} />
            {r.released && onAskTutor && <button onClick={() => askTutor('result', r.attemptId)} className="mt-3 text-sm text-teal-700 font-semibold">Go over this with the AI tutor</button>}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
      {!list.length ? (
        <p className="text-slate-600">No assignments yet. Work your teachers set will appear here.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <li key={a.id}>
              <button onClick={() => open(a.id)} className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-600">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-slate-900" dir="auto">{a.title}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS[a.status]?.tone}`}>{STATUS[a.status]?.label ?? a.status}{a.late ? ' · late' : ''}</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">Due {formatWhen(a.dueAt, a.timeZone)}{a.lateIfSubmittedNow ? ' · now accepted as late' : ''}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
