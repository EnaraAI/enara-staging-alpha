import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchClassRoster, fetchSpeakingAttempts, previewSpeakingExam, removeSpeakingTranscript } from '../../services/apiService';
import { toast } from '../../services/toastService';

// P4 teacher controls for English speaking exams. Everything here is checked
// again on the server; students cannot change any of it.

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
const field = 'mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm';
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export const DEFAULT_SPEAKING = {
  cefrLevel: 'B1', topic: '', context: '', persona: '', instructions: '', planMode: 'scripted', openingPrompt: '',
  requiredTopics: '', disallowedTopics: '', followUpsPerQuestion: 1, maxStudentTurns: 12, durationMinutes: 10, prepSeconds: 0,
  deliveryPolicy: 'voice_only', examinerVoice: 'default', accommodationStudentIds: [] as string[], passThreshold: '', transcriptRetentionDays: 90,
};
export type SpeakingForm = typeof DEFAULT_SPEAKING;

export const speakingPayload = (s: SpeakingForm) => ({
  cefrLevel: s.cefrLevel || undefined, topic: s.topic || undefined, context: s.context || undefined, persona: s.persona || undefined,
  instructions: s.instructions || undefined, planMode: s.planMode, openingPrompt: s.openingPrompt || undefined,
  requiredTopics: list(s.requiredTopics), disallowedTopics: list(s.disallowedTopics), followUpsPerQuestion: Number(s.followUpsPerQuestion),
  maxStudentTurns: Number(s.maxStudentTurns), durationMinutes: Number(s.durationMinutes), prepSeconds: Number(s.prepSeconds),
  deliveryPolicy: s.deliveryPolicy, examinerVoice: s.examinerVoice, accommodationStudentIds: s.accommodationStudentIds,
  passThreshold: s.passThreshold === '' ? undefined : Number(s.passThreshold), transcriptRetentionDays: Number(s.transcriptRetentionDays),
});

export function SpeakingSettingsFields({ value, onChange, classId }: { value: SpeakingForm; onChange: (v: SpeakingForm) => void; classId: string }) {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!classId) return;
    fetchClassRoster(classId)
      .then((r: any) => setStudents(((r.students ?? r.roster ?? []) as any[]).map((s) => ({ id: s.id ?? s.studentId, name: s.name ?? s.id })).filter((s) => s.id)))
      .catch(() => setStudents([]));
  }, [classId]);
  const set = (k: keyof SpeakingForm, v: any) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="border border-teal-200 bg-teal-50/40 rounded-lg p-3 space-y-2">
      <legend className="text-sm font-semibold text-teal-900 px-1">English speaking exam</legend>
      <p className="text-xs text-slate-600">Students speak into their microphone; Enara transcribes each reply and grades it with your rubric. Open-response questions only. Pronunciation is not scored (the transcript can't show it).</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">CEFR level<select className={field} value={value.cefrLevel} onChange={(e) => set('cefrLevel', e.target.value)}><option value="">None</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l}>{l}</option>)}</select></label>
        <label className="block text-sm">Conversation plan<select className={field} value={value.planMode} onChange={(e) => set('planMode', e.target.value)}><option value="scripted">Scripted (your questions in order)</option><option value="guided_adaptive">Guided (one neutral follow-up allowed)</option><option value="bounded_free">Bounded conversation</option></select></label>
      </div>
      <label className="block text-sm">Topic<input className={field} value={value.topic} onChange={(e) => set('topic', e.target.value)} /></label>
      <label className="block text-sm">Scenario / context<textarea className={field} value={value.context} onChange={(e) => set('context', e.target.value)} /></label>
      <label className="block text-sm">Examiner persona<input className={field} value={value.persona} placeholder="e.g. a friendly interviewer" onChange={(e) => set('persona', e.target.value)} /></label>
      <label className="block text-sm">Opening line (optional)<input className={field} value={value.openingPrompt} onChange={(e) => set('openingPrompt', e.target.value)} /></label>
      <label className="block text-sm">Instructions for students<textarea className={field} value={value.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Required topics (comma separated)<input className={field} value={value.requiredTopics} onChange={(e) => set('requiredTopics', e.target.value)} /></label>
        <label className="block text-sm">Topics the examiner must avoid<input className={field} value={value.disallowedTopics} onChange={(e) => set('disallowedTopics', e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm">Speaking time (min)<input type="number" min={1} max={60} className={field} value={value.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} /></label>
        <label className="block text-sm">Preparation (sec)<input type="number" min={0} max={300} className={field} value={value.prepSeconds} onChange={(e) => set('prepSeconds', e.target.value)} /></label>
        <label className="block text-sm">Max replies<input type="number" min={1} max={60} className={field} value={value.maxStudentTurns} onChange={(e) => set('maxStudentTurns', e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Follow-ups per question<select className={field} value={value.followUpsPerQuestion} onChange={(e) => set('followUpsPerQuestion', e.target.value)}><option value={0}>None</option><option value={1}>One neutral follow-up</option></select></label>
        <label className="block text-sm">Examiner voice<select className={field} value={value.examinerVoice} onChange={(e) => set('examinerVoice', e.target.value)}><option value="default">Default</option><option value="female">Female</option></select></label>
      </div>
      <label className="block text-sm">Delivery
        <select className={field} value={value.deliveryPolicy} onChange={(e) => set('deliveryPolicy', e.target.value)}>
          <option value="voice_only">Voice only (no avatar needed)</option>
          <option value="voice_avatar" disabled>Voice + avatar (not available yet)</option>
          <option value="student_choice" disabled>Student chooses (needs the avatar)</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Pass mark % (optional)<input type="number" min={0} max={100} className={field} value={value.passThreshold} onChange={(e) => set('passThreshold', e.target.value)} /></label>
        <label className="block text-sm">Keep transcripts (days)<input type="number" min={7} max={365} className={field} value={value.transcriptRetentionDays} onChange={(e) => set('transcriptRetentionDays', e.target.value)} /></label>
      </div>
      {students.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-700">Typed accommodation ({value.accommodationStudentIds.length} students)</summary>
          <p className="text-xs text-slate-500 my-1">These students may type instead of speaking. Their results are labelled as a written accommodation, never as a speaking score.</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={value.accommodationStudentIds.includes(s.id)} onChange={(e) => set('accommodationStudentIds', e.target.checked ? [...value.accommodationStudentIds, s.id] : value.accommodationStudentIds.filter((x) => x !== s.id))} /> {s.name}</label>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  );
}

// Teacher preview: a typed run-through of the exam flow. Nothing is saved
// and no student data is touched.
export function SpeakingPreview({ assessmentId, speaking }: { assessmentId: string; speaking: SpeakingForm }) {
  const [turns, setTurns] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const step = async (message?: string) => {
    setBusy(true);
    try {
      const r = await previewSpeakingExam({ assessmentId, speaking: speakingPayload(speaking), history: turns, message });
      setTurns([...turns, ...r.turns]);
      setDone(Boolean(r.state?.done));
      setMsg('');
    } catch (err) {
      toast.error('Preview failed', errorText(err));
    } finally {
      setBusy(false);
    }
  };
  if (!assessmentId) return null;
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Preview (not saved)</p>{!turns.length && <button disabled={busy} onClick={() => step()} className="text-sm text-teal-700 font-semibold">Start preview</button>}</div>
      {turns.map((t, i) => <p key={i} className={`text-sm ${t.role === 'student' ? 'text-right text-teal-800' : 'text-slate-700'}`}>{t.kind === 'follow_up' ? 'Follow-up: ' : ''}{t.text}</p>)}
      {turns.length > 0 && !done && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) step(msg.trim()); }}>
          <input className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" placeholder="Type what a student might say" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button disabled={busy || !msg.trim()} className="px-3 text-sm rounded bg-teal-700 text-white disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}</button>
        </form>
      )}
      <p className="text-xs text-slate-500">The preview is typed. Students must speak; their replies are transcribed from their recordings.</p>
    </div>
  );
}

const EVIDENCE: Record<string, string> = { sufficient: 'Enough spoken evidence', insufficient: 'Insufficient evidence (not scored)' };
export function SpeakingAttemptsPanel({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => fetchSpeakingAttempts(assignmentId).then(setData).catch((err) => toast.error('Could not load speaking attempts', errorText(err)));
  useEffect(() => { load(); }, [assignmentId]);
  if (!data) return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading speaking attempts…</div>;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-slate-900">Speaking attempts</h3>
      {!data.attempts.length && <p className="text-sm text-slate-600">No attempts yet.</p>}
      {data.attempts.map((t: any) => (
        <div key={t.attemptId} className="border border-slate-200 rounded-lg p-3 text-sm space-y-1">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">{t.studentId}</span>
            <span className="text-slate-600">
              {t.mode === 'text_accommodation' ? 'Typed accommodation' : t.mode === 'voice_only' ? 'Voice only' : t.mode ?? 'Not started'}
              {t.fallback ? ' (avatar fallback)' : ''} · {t.status}{t.gradingStatus ? ` · ${t.gradingStatus}` : ''}{t.evidence ? ` · ${EVIDENCE[t.evidence] ?? t.evidence}` : ''}
              {t.score !== null ? ` · ${t.score}%` : ''}
            </span>
          </div>
          {t.assessedAs === 'written_accommodation' && <p className="text-xs text-amber-800">Written accommodation: not a speaking score.</p>}
          <p className="text-xs text-slate-500">Not assessed: {(t.notAssessed ?? []).join(', ') || '—'}</p>
          <div className="flex gap-3">
            <button className="text-teal-700 text-xs font-semibold" onClick={() => setOpen(open === t.attemptId ? null : t.attemptId)}>{open === t.attemptId ? 'Hide transcript' : 'Transcript'}</button>
            {t.status === 'submitted' && !t.transcriptRemoved && (
              <button className="text-rose-700 text-xs" onClick={() => window.confirm('Remove this transcript? Scores and feedback stay.') && removeSpeakingTranscript(assignmentId, t.attemptId).then(load).catch((err) => toast.error('Not removed', errorText(err)))}>Remove transcript</button>
            )}
          </div>
          {open === t.attemptId && (t.transcriptRemoved ? <p className="text-xs text-slate-500">Transcript removed.</p> : (
            <ol className="space-y-1">{t.transcript.map((x: any, i: number) => <li key={i} className={x.role === 'student' ? 'text-teal-900' : 'text-slate-700'}><span className="text-xs text-slate-500">{x.role === 'student' ? (x.source === 'typed_accommodation' ? 'Student (typed)' : 'Student (spoken)') : 'Examiner'}: </span>{x.text}</li>)}</ol>
          ))}
        </div>
      ))}
    </div>
  );
}
