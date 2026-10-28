import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, Volume2 } from 'lucide-react';
import { ApiError, beginSpeakingExam, sendSpeakingAudio, sendSpeakingText, type SpeakingAudio } from '../services/apiService';
import { toast } from '../services/toastService';
import { UsageChip } from './UsageChip';

// P4 English speaking exam, voice only. The student records each reply with
// the microphone; the server transcribes it, the examiner replies and its
// voice is played back. No avatar is used. A typed reply is only possible as
// an accommodation the teacher arranged, and it is labelled as such.

type Settings = {
  topic: string | null; cefrLevel: string | null; instructions: string | null; durationMinutes: number; prepSeconds: number;
  maxStudentTurns: number; deliveryPolicy: string; accommodationAllowed: boolean; consentText: string; notAssessed: string[];
};
const MAX_RECORDING_MS = 85_000;

const ERRORS: Record<string, string> = {
  NO_SPEECH_DETECTED: "We couldn't hear you. Check your microphone and say your answer again.",
  STT_FAILED: 'Your recording could not be transcribed. Please say it again.',
  INVALID_AUDIO: 'The recording could not be used. Please try again.',
  VOICE_UNAVAILABLE: 'Spoken exams are not available right now (no speech service is set up). Ask your teacher.',
  AVATAR_UNAVAILABLE: 'Your teacher requires the avatar for this exam, and it is not available. Ask your teacher.',
  MODE_NOT_ALLOWED: 'Your teacher has not allowed that way of taking this exam.',
  AI_PAUSED: 'AI features are paused for your school right now. Try again later.',
  AI_BUDGET_EXCEEDED: "Your school's AI allowance has been reached for now. Try again later.",
  AI_BUDGET_POLICY_MISSING: 'Spoken exams are not set up for your school yet. Ask your teacher.',
  AI_BUDGET_UNAVAILABLE: 'The exam cannot continue right now. Try again in a moment.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  PREPARATION_TIME: 'Preparation time is not over yet.',
  ATTEMPT_CLOSED: 'Time is up for this attempt.',
};
const explain = (err: unknown) => (err instanceof ApiError && err.code && ERRORS[err.code]) || (err instanceof Error ? err.message : 'Something went wrong');

// Plays the examiner's 16 kHz mono PCM.
async function play(audio: SpeakingAudio, ctxRef: React.MutableRefObject<AudioContext | null>) {
  if (!audio?.base64) return;
  const bytes = Uint8Array.from(atob(audio.base64), (c) => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  if (!pcm.length) return;
  ctxRef.current ??= new AudioContext();
  const ctx = ctxRef.current;
  const buf = ctx.createBuffer(1, pcm.length, 16000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  await new Promise<void>((resolve) => { src.onended = () => resolve(); src.start(); });
}

export function SpeakingExam({ assignmentId, attempt, settings, busy, onSubmit }: { assignmentId: string; attempt: any; settings: Settings; busy: boolean; onSubmit: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'exam'>(attempt.speakingStarted ? 'exam' : 'intro');
  const [consent, setConsent] = useState(false);
  const [useAccommodation, setUseAccommodation] = useState(false);
  const [micOk, setMicOk] = useState<'unknown' | 'checking' | 'ok' | 'failed'>('unknown');
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<string>('voice_only');
  const [notice, setNotice] = useState<string | null>(null);
  const [turns, setTurns] = useState<any[]>([]);
  const [state, setState] = useState<{ index: number; probed: boolean; done: boolean } | null>(null);
  const [working, setWorking] = useState<'starting' | 'sending' | 'speaking' | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [turnsLeft, setTurnsLeft] = useState(settings.maxStudentTurns);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); audioCtx.current?.close().catch(() => undefined); }, []);

  // Microphone check: permission plus a visible input level.
  const checkMic = async () => {
    setMicOk('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const until = Date.now() + 4000;
      let heard = false;
      await new Promise<void>((resolve) => {
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          const peak = data.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128;
          setLevel(peak);
          if (peak > 0.08) heard = true;
          if (Date.now() < until && !heard) requestAnimationFrame(tick);
          else resolve();
        };
        tick();
      });
      ctx.close().catch(() => undefined);
      setMicOk(heard ? 'ok' : 'failed');
      if (!heard) setError("We didn't pick up any sound. Speak while the check runs, or try another microphone.");
      else setError(null);
    } catch {
      setMicOk('failed');
      setError('Microphone permission was refused or no microphone was found. Allow microphone access in your browser to take this spoken exam.');
    }
  };

  const applyResult = (r: { turns: any[]; state: any; audio: SpeakingAudio }, replace = false) => {
    setTurns((t) => (replace ? r.turns : [...t.filter((x) => !x.pending), ...r.turns]));
    setState(r.state);
    if (r.audio) {
      setWorking('speaking');
      play(r.audio, audioCtx).catch(() => undefined).finally(() => setWorking(null));
    } else setWorking(null);
  };

  const begin = useCallback(async (requested: string, consentGiven: boolean) => {
    setWorking('starting');
    setError(null);
    try {
      const r = await beginSpeakingExam(assignmentId, attempt.id, requested, consentGiven);
      setMode(r.mode);
      if (r.fallback) setNotice(`The avatar is not available, so this exam runs as voice only. (${r.fallback.reason})`);
      setPhase('exam');
      applyResult(r, true);
    } catch (err) {
      setWorking(null);
      setError(explain(err));
    }
  }, [assignmentId, attempt.id]);

  // Reload or a second tab: resume the exam where the server has it.
  useEffect(() => { if (attempt.speakingStarted) begin('voice_only', true); }, [attempt.speakingStarted, begin]);

  const startRecording = async () => {
    setError(null);
    try {
      streamRef.current ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(streamRef.current, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => { void sendRecording(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })); };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      timer.current = window.setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch {
      setError('The microphone is not available. Check your browser permissions and try again.');
    }
  };
  const stopRecording = () => {
    window.clearTimeout(timer.current);
    if (recRef.current?.state === 'recording') recRef.current.stop();
    setRecording(false);
  };

  const turnCount = () => turns.filter((t) => !t.pending).length;
  const sendRecording = async (blob: Blob) => {
    if (blob.size < 500) { setError('That recording was too short. Hold the button while you speak.'); return; }
    setWorking('sending');
    setTurns((t) => [...t, { role: 'student', text: 'Transcribing your answer…', pending: true }]);
    try {
      const r = await sendSpeakingAudio(assignmentId, attempt.id, blob, turnCount());
      setTurnsLeft(r.turnsLeft);
      applyResult(r);
    } catch (err) {
      setTurns((t) => t.filter((x) => !x.pending));
      setWorking(null);
      if (err instanceof ApiError && err.code === 'CONVERSATION_CONFLICT') { await begin(mode, true); return; }
      setError(explain(err));
    }
  };
  const sendTyped = async () => {
    const text = typed.trim();
    if (!text) return;
    setWorking('sending');
    try {
      const r = await sendSpeakingText(assignmentId, attempt.id, text, turnCount());
      setTyped('');
      setTurnsLeft(r.turnsLeft);
      applyResult(r);
    } catch (err) {
      setWorking(null);
      setError(explain(err));
    }
  };

  if (phase === 'intro') {
    const accommodation = settings.accommodationAllowed && useAccommodation;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">English speaking exam{settings.cefrLevel ? ` · CEFR ${settings.cefrLevel}` : ''}</p>
          <h2 className="text-lg font-bold text-slate-900 mt-1">{settings.topic ? `Topic: ${settings.topic}` : 'Spoken conversation'}</h2>
          <p className="text-sm text-slate-600 mt-1">
            You will talk with an AI examiner by voice for up to {settings.durationMinutes} minutes{settings.prepSeconds ? `, after ${settings.prepSeconds} seconds to prepare` : ''}. Press the microphone button, say your answer, then press stop.
            The examiner can ask you to say more, but it can't help you or tell you if you are right.
          </p>
          {settings.instructions && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 mt-2 whitespace-pre-wrap">{settings.instructions}</p>}
          <p className="text-xs text-slate-500 mt-2">Not scored in this exam: {settings.notAssessed.join(', ')}.</p>
        </div>
        {!accommodation && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">1. Check your microphone</p>
            <div className="flex items-center gap-3">
              <button onClick={checkMic} disabled={micOk === 'checking'} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {micOk === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />} {micOk === 'checking' ? 'Say something…' : 'Test microphone'}
              </button>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true"><div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.min(100, level * 300)}%` }} /></div>
              {micOk === 'ok' && <span className="text-sm text-emerald-700 font-medium">Microphone works</span>}
              {micOk === 'failed' && <span className="text-sm text-rose-700 font-medium">Not working</span>}
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-700 rounded-lg border border-slate-200 p-4">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span><span className="font-semibold">{accommodation ? '1' : '2'}. Recording notice. </span>{settings.consentText}</span>
        </label>
        {settings.accommodationAllowed && (
          <label className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input type="checkbox" className="mt-1" checked={useAccommodation} onChange={(e) => setUseAccommodation(e.target.checked)} />
            <span>Use my typed accommodation instead. Typed answers are marked as a written accommodation, not as a speaking score.</span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</p>}
        <button
          disabled={!consent || (!accommodation && micOk !== 'ok') || working === 'starting'}
          onClick={() => begin(accommodation ? 'text_accommodation' : 'voice_only', true)}
          className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {working === 'starting' && <Loader2 className="w-4 h-4 animate-spin" />} Start speaking exam
        </button>
      </div>
    );
  }

  const done = !!state?.done;
  const textMode = mode === 'text_accommodation';
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 230px)', minHeight: 480 }}>
      <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center"><Volume2 className="w-4 h-4" aria-hidden="true" /></div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900 text-sm">AI examiner · {textMode ? 'typed accommodation' : 'voice only'}</p>
          <p className="text-xs text-slate-500">{done ? 'The conversation is finished' : `${turnsLeft} replies left`}{working === 'speaking' ? ' · the examiner is speaking' : ''}</p>
          <UsageChip key={turns.length} features={['speaking_exam_stt', 'speaking_exam_tts', 'conversation_exam']} label="Speech" />
        </div>
      </div>
      {notice && <p className="px-5 py-2 text-xs text-amber-900 bg-amber-50 border-b border-amber-200">{notice}</p>}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${t.role === 'student' ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'} ${t.pending ? 'opacity-70 italic' : ''}`}>
              {t.kind === 'follow_up' && <span className="block text-[11px] font-semibold text-teal-700 mb-0.5">Follow-up</span>}
              {t.role === 'student' && !t.pending && <span className="block text-[11px] text-teal-100 mb-0.5">{t.source === 'typed_accommodation' ? 'Typed (accommodation)' : 'What we heard'}</span>}
              {t.text}
            </div>
          </div>
        ))}
        {working === 'sending' && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3 h-3 animate-spin" /> The examiner is listening…</div>}
      </div>
      {error && <p role="alert" className="px-5 py-2 text-sm text-rose-800 bg-rose-50 border-t border-rose-200">{error}</p>}
      {done ? (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">What you said is saved. Submit to have it marked.</p>
          <button disabled={busy} onClick={onSubmit} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Submit exam</button>
        </div>
      ) : textMode ? (
        <form className="p-3 border-t border-slate-200 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!working) sendTyped(); }}>
          <textarea aria-label="Your typed answer (accommodation)" rows={2} className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm resize-none" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" disabled={!typed.trim() || !!working} className="px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">Send</button>
        </form>
      ) : (
        <div className="p-4 border-t border-slate-200 flex items-center justify-center gap-3">
          {recording ? (
            <button onClick={stopRecording} className="px-5 py-3 rounded-full bg-rose-600 text-white text-sm font-semibold inline-flex items-center gap-2"><Square className="w-4 h-4" /> Stop and send</button>
          ) : (
            <button onClick={startRecording} disabled={!!working || !state} className="px-5 py-3 rounded-full bg-teal-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"><Mic className="w-4 h-4" /> Record my answer</button>
          )}
          {recording && <span className="text-xs text-rose-700 font-medium">Recording… (up to 85 seconds)</span>}
        </div>
      )}
    </div>
  );
}

export function speakingToast(err: unknown) {
  toast.error('Speaking exam', explain(err));
}
