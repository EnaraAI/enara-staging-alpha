// Live avatar tutor (teens and adults). What is wired to lms-test:
//   GET  /api/me/tutor-face             the tutor's face and name the school (or the learner) chose
//   GET  /api/me/courses                the course the call is about (?course=… or the first enrolled course; ?lesson= is passed on)
//   GET  /api/me/tutor/sessions         past live calls (mode 'voice'), only when the learner asks to see them
//   GET  /api/me/tutor/sessions/:id     one past call's transcript
// The live call: a slimmed port of the lms front end's LiveAvatarModal, its 'avatar' speech path only.
//   Start: a short microphone check first (no session is created if the mic is blocked or missing), then
//   POST /api/avatar/session            { course_id, lesson_id, subject, lesson_title } as LiveAvatarModal sends it (no preferred_language:
//                                       the server opens in the learner's last call language) → session_id, session_token. From here it is a paid session.
//   Anam JS SDK 4.29.1, loaded only on Start (its own chunk), with that token. Signalling goes through the relay rt.enara.app
//   (GET /health first, as relay.ts does; if it is down, or the call fails or closes before it is ready through the relay, it
//   connects directly). The relay is passed as options.api.apiGateway, where SDK 4.29.1 reads it: LiveAvatarModal passes a
//   top-level apiGateway, which 4.29.1 ignores, so the lms front end actually connects directly today.
//   Talk: Anam listens (its own speech-to-text). Each new learner message → POST /api/avatar/query-stream { session_id, messages }
//   (NDJSON) → cleaned words (SpeechChunkCleaner) streamed into Anam's talk stream. A { language_switch } line → once the turn is
//   spoken, POST /api/avatar/session/:id/language { target_language } → new token → the Anam client restarts in English or Arabic.
//   POST /api/avatar/session/:id/heartbeat { provider_session_id }   on ready, then every 60 s while connected.
//   Mute (Anam input audio) and Captions (live text of what the tutor and the learner say) toggles.
//   End, leaving the screen (unmount), and tab close (pagehide/beforeunload): Anam stopStreaming + DELETE /api/avatar/session/:id
//   (keepalive when the page is going away).
// Left out on purpose (this slim port):
//   speech 'server' (ENARA's own voice and listening: stt-token, /speak, inline audio, voice-only fallback): the call is ended at
//   once (DELETE) and the learner is told; lms-test answers 'avatar' while avatarSpeaking is on. The Tavus fallback
//   (POST /session/:id/fallback). Automatic reconnects after a mid-call drop (each is a new paid session: the learner presses
//   Start again). The visual aid panel (GET /artifact/:id polling), pronunciation clips, and the face picker.
// Needs backend: a "time used today" / daily-limit read (the API has none, so both show "not available").
// CSP (worker/index.js): already allows all SDK 4.29.1 uses (https/wss *.anam.ai: api.anam.ai, connect*.anam.ai; rt.enara.app).
//   WebRTC media/ICE is not governed by connect-src, and the video is a srcObject stream (not media-src); no workers, wasm or blobs.
import { useEffect, useRef, useState } from 'react';
import type { AnamClient, Message, MessageStreamEvent } from '@anam-ai/js-sdk';
import { AlertCircle, Captions, ChevronLeft, Clock, History, LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, RefreshCw, Video } from 'lucide-react';
import { API_BASE, get, getToken, post, type ApiError } from '@/lib/api';
import { num, usePreview, useT } from '@/lib/preview';
import { markRelayDown, relayBase } from '@/lib/relay';
import { SpeechChunkCleaner } from '@/lib/speechText';
import { SessionMenu } from '@/components/shell';
import { Alert, Badge, Button, Card, Dir, LinkButton, Skeleton, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { InlineError, NotAvailable, arr, fmtDate, fmtTime, mediaUrl, str, useHashQuery, useLoad, type CourseSummary } from './common';

type Problem = 'micDenied' | 'micMissing' | 'micFailed' | 'dailyLimit' | 'tooMany' | 'offline' | 'unavailable' | 'voiceMode' | 'dropped' | 'startFailed';

const T = {
  en: {
    back: 'Back', title: 'Live tutor', sub: 'Speaking practice with your tutor', notConnected: 'Not connected', connecting: 'Connecting…', live: 'Live',
    tutor: 'ENARA tutor', you: 'You', mute: 'Mute', muted: 'Muted', captions: 'Captions', start: 'Start session', end: 'End call', tryAgain: 'Try again',
    checkingMic: 'Checking your microphone…', starting: 'Starting your session…', switching: 'Switching language…', ending: 'Ending the call…',
    speakHint: 'Speak English or Arabic.',
    useChat: 'Use the chat tutor',
    used: 'Time used today', limit: 'Daily limit',
    transcript: 'Past live calls', transcriptNote: 'Calls are saved with your tutor chats so you and your teacher can read them later.',
    showPast: 'Show my past calls', noPast: 'No live calls yet.', messages: (n: string) => `${n} messages`, backToList: 'All past calls',
    tutorWho: 'Tutor', youWho: 'You', tip: 'Speak when the frame around your tile is green. You can interrupt the tutor at any time.',
    faceFailed: 'We couldn’t load your tutor’s face.',
    sorry: 'Sorry, I had trouble answering that. Please try again.',
    problems: {
      micDenied: ['Your microphone is blocked', 'Allow the microphone for this site in your browser settings, then try again. No session was started.'],
      micMissing: ['No microphone found', 'Connect a microphone, then try again. No session was started.'],
      micFailed: ['We couldn’t use your microphone', 'Close other apps that use the microphone, then try again. No session was started.'],
      dailyLimit: ['Daily limit reached', 'You have used today’s live tutor calls. Try again tomorrow, or use the chat tutor now.'],
      tooMany: ['Too many tries', 'Wait a minute, then try again.'],
      offline: ['Could not connect', 'Check your internet connection, then try again.'],
      unavailable: ['The live tutor is unavailable right now', 'Please try again later. You can use the chat tutor now.'],
      voiceMode: ['This call type is not available in this app yet', 'The call was closed before it began. You can use the chat tutor now.'],
      dropped: ['The call was disconnected', 'Check your internet connection, then start a new session.'],
      startFailed: ['Could not start the tutor', 'Please try again in a moment.'],
    } satisfies Record<Problem, [string, string]>,
  },
  ar: {
    back: 'رجوع', title: 'المعلّم المرئي', sub: 'تدريب على المحادثة مع معلّمك', notConnected: 'غير متصل', connecting: 'جارٍ الاتصال…', live: 'مباشر',
    tutor: 'معلّم إنارة', you: 'أنت', mute: 'كتم الصوت', muted: 'الصوت مكتوم', captions: 'الترجمة النصية', start: 'بدء الجلسة', end: 'إنهاء المكالمة', tryAgain: 'حاول مرة أخرى',
    checkingMic: 'جارٍ التحقق من الميكروفون…', starting: 'جارٍ بدء الجلسة…', switching: 'جارٍ تغيير اللغة…', ending: 'جارٍ إنهاء المكالمة…',
    speakHint: 'تحدّث بالعربية أو بالإنجليزية.',
    useChat: 'المحادثة الكتابية مع المعلّم',
    used: 'الوقت المستخدم اليوم', limit: 'الحد اليومي',
    transcript: 'المكالمات السابقة', transcriptNote: 'تُحفَظ المكالمات مع محادثاتك مع المعلّم لتقرأها أنت ومعلّمك لاحقًا.',
    showPast: 'عرض مكالماتي السابقة', noPast: 'لا توجد مكالمات مباشرة بعد.', messages: (n: string) => `${n} رسالة`, backToList: 'كل المكالمات السابقة',
    tutorWho: 'المعلّم', youWho: 'أنت', tip: 'تحدّث عندما يكون الإطار المحيط بصورتك أخضر. يمكنك مقاطعة المعلّم في أي وقت.',
    faceFailed: 'تعذّر تحميل صورة معلّمك.',
    sorry: 'عذرًا، واجهتُ مشكلة في الإجابة. يُرجى المحاولة مرة أخرى.',
    problems: {
      micDenied: ['الميكروفون محظور', 'اسمح لهذا الموقع باستخدام الميكروفون من إعدادات المتصفح، ثم حاول مرة أخرى. لم تبدأ أي جلسة.'],
      micMissing: ['لم يُعثَر على ميكروفون', 'صِل ميكروفونًا بجهازك، ثم حاول مرة أخرى. لم تبدأ أي جلسة.'],
      micFailed: ['تعذّر استخدام الميكروفون', 'أغلق التطبيقات الأخرى التي تستخدم الميكروفون، ثم حاول مرة أخرى. لم تبدأ أي جلسة.'],
      dailyLimit: ['بلغتَ الحد اليومي', 'استخدمتَ مكالمات المعلّم المرئي المتاحة لهذا اليوم. حاول مرة أخرى غدًا، أو استخدم المحادثة الكتابية مع المعلّم الآن.'],
      tooMany: ['محاولات كثيرة', 'انتظر دقيقة، ثم حاول مرة أخرى.'],
      offline: ['تعذّر الاتصال', 'تحقّق من اتصالك بالإنترنت، ثم حاول مرة أخرى.'],
      unavailable: ['المعلّم المرئي غير متاح الآن', 'يُرجى المحاولة لاحقًا. يمكنك استخدام المحادثة الكتابية مع المعلّم الآن.'],
      voiceMode: ['هذا النوع من المكالمات غير متاح في هذا التطبيق بعد', 'أُغلِقت المكالمة قبل أن تبدأ. يمكنك استخدام المحادثة الكتابية مع المعلّم الآن.'],
      dropped: ['انقطع الاتصال بالمكالمة', 'تحقّق من اتصالك بالإنترنت، ثم ابدأ جلسة جديدة.'],
      startFailed: ['تعذّر بدء المعلّم', 'يُرجى المحاولة مرة أخرى بعد قليل.'],
    } satisfies Record<Problem, [string, string]>,
  },
};

interface Face { avatarId?: string; name?: string; imageUrl?: string }
interface PastCall { id?: string; title?: string; mode?: string; messageCount?: number; lastMessageAt?: string; courseId?: string }
interface CallDoc { id?: string; title?: string; messages?: { id?: string; role?: string; text?: string; timestamp?: string }[] }

// ---------------------------------------------------------------- live call (port of LiveAvatarModal's 'avatar' path)

/** POST /api/avatar/session (avatar.controller startAvatarSession). */
interface AvatarSessionResponse {
  session_id: string;
  provider: 'video' | 'anam' | 'tavus' | 'voice';
  session_token?: string;
  speech?: 'server' | 'avatar' | 'anam' | 'elevenlabs';
}
interface StartBody { course_id?: string; lesson_id?: string; subject: string; lesson_title: string }
type Phase = 'idle' | 'checking' | 'starting' | 'live' | 'ending' | 'error';
interface Caption { id: string; who: 'tutor' | 'you'; text: string }

const VIDEO_ID = 'enara-live-video';
const MIC_DENIED = 'CONNECTION_CLOSED_CODE_MICROPHONE_PERMISSION_DENIED';

/** Raw fetch to /api/avatar… with the sign-in token: streaming bodies and keepalive, which api() doesn't offer. */
function avatarFetch(path: string, body?: unknown, init: { method?: string; keepalive?: boolean } = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${API_BASE}/api/avatar${path}`, {
    method: init.method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'omit',
    keepalive: init.keepalive,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function problemFrom(e: unknown): Problem {
  const err = e as ApiError;
  if (err?.code === 'NETWORK') return 'offline';
  if (err?.code === 'AVATAR_DAILY_LIMIT') return 'dailyLimit';
  if (err?.status === 429) return 'tooMany';
  if (err?.code === 'AVATAR_UNAVAILABLE' || err?.status === 502 || err?.status === 503) return 'unavailable';
  return 'startFailed';
}
function micProblem(e: unknown): Problem {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'micDenied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'micMissing';
  return 'micFailed';
}

function useLiveCall(body: StartBody, sorry: { en: string; ar: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [switching, setSwitching] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [hearing, setHearing] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const bodyRef = useRef(body);
  bodyRef.current = body;
  const clientRef = useRef<AnamClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const busyRef = useRef(false);
  const readyRef = useRef(false);
  const answeringRef = useRef(false);
  const lastUserKeyRef = useRef('');
  // The call's language as far as this page knows: null until a switch (the server opens in the learner's last language and
  // only sends language_switch for a real change, so an unknown start must not block the first switch).
  const languageRef = useRef<'english' | 'arabic' | null>(null);
  const switchingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false);
  const mountedRef = useRef(true);

  const stopAnam = async () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    readyRef.current = false;
    const client = clientRef.current;
    clientRef.current = null;
    if (mountedRef.current) { setVideoOn(false); setHearing(false); }
    if (!client) return;
    try { await client.stopStreaming(); } catch { /* best effort */ }
  };

  const endServerSession = async (keepalive = false) => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!id) return;
    try { await avatarFetch(`/session/${encodeURIComponent(id)}`, undefined, { method: 'DELETE', keepalive }); } catch { /* best effort */ }
  };

  const fail = async (p: Problem) => {
    closingRef.current = true;
    await stopAnam();
    await endServerSession();
    if (!mountedRef.current) return;
    setSwitching(false);
    setCaption(null);
    setProblem(p);
    setPhase('error');
  };

  // Anam has no mid-call language switch: a new token, and a fresh client with the matching voice and listening.
  // Runs after the current turn has been spoken.
  const switchLanguage = async (target: string) => {
    const id = sessionIdRef.current;
    const desired = target === 'arabic' ? 'arabic' : 'english';
    if (!id || !readyRef.current || switchingRef.current || closingRef.current || desired === languageRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    let stopped = false;
    try {
      const res = await avatarFetch(`/session/${encodeURIComponent(id)}/language`, { target_language: desired });
      if (!res.ok) throw new Error(`language switch ${res.status}`);
      const data = (await res.json()) as { session_token?: string };
      if (!data?.session_token || closingRef.current) return;
      languageRef.current = desired;
      stopped = true;
      await stopAnam();
      await startAnam(data.session_token);
    } catch {
      // Before the old client stopped: not fatal, the current voice keeps working. After: the call is gone.
      if (stopped) await fail('dropped');
    } finally {
      switchingRef.current = false;
      if (!stopped && mountedRef.current) setSwitching(false);
    }
  };

  // A new learner message: stream ENARA's answer into Anam's talk stream (LiveAvatarModal streamEnaraAnswerToAnam).
  const streamAnswer = async (client: AnamClient, history: Message[]) => {
    const id = sessionIdRef.current;
    if (!id || clientRef.current !== client || answeringRef.current) return;
    const last = history?.[history.length - 1];
    if (!last || last.role !== 'user' || !last.content?.trim()) return;
    const key = `${history.length}:${last.content.trim()}`;
    if (lastUserKeyRef.current === key) return;
    lastUserKeyRef.current = key;

    answeringRef.current = true;
    let talk: ReturnType<AnamClient['createTalkMessageStream']> | null = null;
    let pendingSwitch: string | null = null;
    try {
      const messages = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      talk = client.createTalkMessageStream();
      const res = await avatarFetch('/query-stream', { session_id: id, messages });
      if (!res.ok || !res.body) throw new Error(`query ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Anam speaks what it is given: words only, no Markdown symbols, citation markers or LaTeX.
      const speech = new SpeechChunkCleaner();
      let buffer = '';
      const handleLine = (line: string) => {
        if (!line) return;
        const data = JSON.parse(line) as { content?: string; language_switch?: string };
        if (data.content && talk?.isActive()) {
          const words = speech.push(data.content);
          if (words) void talk.streamMessageChunk(words, false).catch(() => {});
        } else if (data.language_switch) {
          // The answer keeps the current voice; the switch happens once it is spoken.
          pendingSwitch = data.language_switch;
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) handleLine(line.trim());
      }
      handleLine(buffer.trim());
      const rest = speech.flush();
      if (rest && talk?.isActive()) void talk.streamMessageChunk(rest, false).catch(() => {});
      if (talk?.isActive()) await talk.endMessage();
    } catch {
      try {
        if (talk?.isActive()) await talk.endMessage();
        await client.talk(languageRef.current === 'arabic' ? sorry.ar : sorry.en);
      } catch {
        // Anam itself is broken: its connection handler ends the call.
      }
    } finally {
      answeringRef.current = false;
      if (pendingSwitch) void switchLanguage(pendingSwitch);
    }
  };

  const startAnam = async (token: string, allowRelay = true): Promise<void> => {
    readyRef.current = false;
    // The video service's signalling goes through Enara's relay when it answers.
    const [{ createClient, AnamEvent }, relay] = await Promise.all([import('@anam-ai/js-sdk'), allowRelay ? relayBase() : Promise.resolve(null)]);
    if (closingRef.current) return;
    const client = createClient(token, relay ? { api: { apiGateway: { enabled: true, baseUrl: `${relay}/v`, wsPath: '/v/ws' } } } : {});
    clientRef.current = client;
    if (mutedRef.current) client.muteInputAudio();

    client.addListener(AnamEvent.SESSION_READY, () => {
      if (clientRef.current !== client) return;
      readyRef.current = true;
      setPhase('live');
      setSwitching(false);
      // While connected, tell the server once a minute (usage metering evidence; no content).
      const beat = () => {
        const id = sessionIdRef.current;
        if (!id || clientRef.current !== client) return;
        let providerSessionId: string | null = null;
        try { providerSessionId = client.getActiveSessionId(); } catch { /* not available */ }
        void avatarFetch(`/session/${encodeURIComponent(id)}/heartbeat`, { provider_session_id: providerSessionId }).catch(() => {});
      };
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      beat();
      heartbeatRef.current = setInterval(beat, 60_000);
    });
    client.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => { if (clientRef.current === client) setVideoOn(true); });
    client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages: Message[]) => { void streamAnswer(client, messages); });
    client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (ev: MessageStreamEvent) => {
      if (clientRef.current !== client || !ev?.content) return;
      const who = ev.role === 'user' ? 'you' : 'tutor';
      setCaption((c) => (c && c.id === ev.id ? { ...c, text: c.text + ev.content } : { id: ev.id, who, text: ev.content }));
    });
    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => { answeringRef.current = false; });
    client.addListener(AnamEvent.USER_SPEECH_STARTED, () => { if (clientRef.current === client) setHearing(true); });
    client.addListener(AnamEvent.USER_SPEECH_ENDED, () => { if (clientRef.current === client) setHearing(false); });
    client.addListener(AnamEvent.CONNECTION_CLOSED, (reason: unknown) => {
      if (closingRef.current || clientRef.current !== client) return;
      if (String(reason) === MIC_DENIED) { void fail('micDenied'); return; }
      // Closed before the call started through the relay: try once directly.
      if (!readyRef.current && relay) {
        markRelayDown();
        clientRef.current = null;
        void startAnam(token, false).catch(() => void fail('unavailable'));
        return;
      }
      // Before ready: the video service refused the session. After: a drop (no automatic reconnect here).
      void fail(readyRef.current ? 'dropped' : 'unavailable');
    });

    try {
      await client.streamToVideoElement(VIDEO_ID);
    } catch (error) {
      // Already handled (closed and retried directly, or the call ended).
      if (clientRef.current !== client) return;
      if (!relay) throw error;
      // The relay couldn't start the video: connect directly instead.
      markRelayDown();
      clientRef.current = null;
      void client.stopStreaming().catch(() => {});
      await startAnam(token, false);
    }
  };

  const start = async () => {
    if (busyRef.current || cooldown) return;
    busyRef.current = true;
    // The server limits call starts: wait a few seconds between attempts.
    setCooldown(true);
    setTimeout(() => { if (mountedRef.current) setCooldown(false); }, 5000);
    try {
      closingRef.current = false;
      setProblem(null);
      setCaption(null);
      setPhase('checking');
      void relayBase(); // check the relay while the call is being set up
      // The mic probe runs before any paid session exists.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((tr) => tr.stop());
      } catch (e) {
        if (mountedRef.current) { setProblem(micProblem(e)); setPhase('error'); }
        return;
      }
      if (closingRef.current || !mountedRef.current) return;
      setPhase('starting');
      // A fresh start first closes whatever call is still open.
      if (sessionIdRef.current) { await stopAnam(); await endServerSession(); }

      let data: AvatarSessionResponse;
      try {
        data = await post<AvatarSessionResponse>('/api/avatar/session', bodyRef.current);
      } catch (e) {
        if (mountedRef.current) { setProblem(problemFrom(e)); setPhase('error'); }
        return;
      }
      sessionIdRef.current = data?.session_id ?? null;
      // Left the screen while the session was being created.
      if (closingRef.current || !mountedRef.current) { await endServerSession(true); return; }
      answeringRef.current = false;
      lastUserKeyRef.current = '';
      languageRef.current = null;
      switchingRef.current = false;
      if (data.speech === 'server' || data.speech === 'elevenlabs') { await fail('voiceMode'); return; }
      if (!(data.provider === 'video' || data.provider === 'anam') || !data.session_token) { await fail('unavailable'); return; }
      try {
        await startAnam(data.session_token);
      } catch {
        await fail('unavailable');
      }
    } finally {
      busyRef.current = false;
    }
  };

  const end = async () => {
    closingRef.current = true;
    setPhase('ending');
    await stopAnam();
    await endServerSession();
    if (!mountedRef.current) return;
    setCaption(null);
    setSwitching(false);
    setPhase('idle');
  };

  const setMuted = (m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
    const client = clientRef.current;
    try { if (client) (m ? client.muteInputAudio() : client.unmuteInputAudio()); } catch { /* not streaming yet: applied on the next client */ }
  };

  // Leaving the screen or closing the tab: Anam bills until the browser disconnects, so stop it and end the server session.
  useEffect(() => {
    mountedRef.current = true;
    const hardStop = () => {
      closingRef.current = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      const client = clientRef.current;
      clientRef.current = null;
      if (client) { try { void client.stopStreaming().catch(() => {}); } catch { /* page is unloading */ } }
      void endServerSession(true);
    };
    window.addEventListener('pagehide', hardStop);
    window.addEventListener('beforeunload', hardStop);
    return () => {
      window.removeEventListener('pagehide', hardStop);
      window.removeEventListener('beforeunload', hardStop);
      mountedRef.current = false;
      hardStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, problem, switching, videoOn, muted, caption, hearing, cooldown, start, end, setMuted };
}

// ---------------------------------------------------------------- screen

/** Stylised tutor portrait: shapes and gradients only, no external image. */
function TutorPortrait() {
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <radialGradient id="av-bg" cx="50%" cy="35%" r="80%"><stop offset="0" stopColor="oklch(0.45 0.08 250)" /><stop offset="1" stopColor="oklch(0.24 0.06 263)" /></radialGradient>
        <linearGradient id="av-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="oklch(0.8 0.07 60)" /><stop offset="1" stopColor="oklch(0.72 0.08 55)" /></linearGradient>
        <linearGradient id="av-scarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="oklch(0.7 0.09 190)" /><stop offset="1" stopColor="oklch(0.55 0.09 200)" /></linearGradient>
        <linearGradient id="av-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="oklch(0.92 0.02 90)" /><stop offset="1" stopColor="oklch(0.84 0.03 85)" /></linearGradient>
        <radialGradient id="av-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="oklch(0.82 0.15 78)" stopOpacity=".28" /><stop offset="1" stopColor="oklch(0.82 0.15 78)" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="640" height="400" fill="url(#av-bg)" />
      {/* soft shelves / room hint */}
      <rect x="40" y="70" width="120" height="8" rx="4" fill="white" opacity=".06" />
      <rect x="52" y="40" width="18" height="30" rx="3" fill="white" opacity=".07" />
      <rect x="76" y="48" width="14" height="22" rx="3" fill="white" opacity=".05" />
      <rect x="480" y="96" width="120" height="8" rx="4" fill="white" opacity=".06" />
      <circle cx="560" cy="74" r="20" fill="oklch(0.6 0.12 150)" opacity=".18" />
      <circle cx="320" cy="190" r="190" fill="url(#av-glow)" />
      {/* shoulders */}
      <path d="M140 400c10-74 80-106 180-106s170 32 180 106Z" fill="url(#av-top)" />
      {/* headscarf: covers the head and drapes over the chest */}
      <path d="M320 70c-58 0-86 46-86 102 0 42 12 76 28 100-26 18-48 52-54 128h224c-6-76-28-110-54-128 16-24 28-58 28-100 0-56-28-102-86-102Z" fill="url(#av-scarf)" />
      <path d="M262 272q58 34 116 0" stroke="oklch(0.5 0.09 200)" strokeWidth="3" fill="none" opacity=".5" />
      <path d="M300 330q20 30 18 70M352 318q-10 40 4 82" stroke="oklch(0.5 0.09 200)" strokeWidth="3" fill="none" opacity=".35" strokeLinecap="round" />
      {/* face */}
      <ellipse cx="320" cy="180" rx="54" ry="66" fill="url(#av-skin)" />
      {/* scarf edge framing the forehead */}
      <path d="M264 166c4-44 26-70 56-70s52 26 56 70c-12-30-30-46-56-46s-44 16-56 46Z" fill="oklch(0.64 0.09 192)" />
      {/* brows, eyes, cheeks, mouth (speaking) */}
      <path d="M287 158q12-7 24 0M329 158q12-7 24 0" stroke="oklch(0.33 0.04 50)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="299" cy="174" rx="6" ry="7" fill="oklch(0.25 0.03 260)" />
      <ellipse cx="341" cy="174" rx="6" ry="7" fill="oklch(0.25 0.03 260)" />
      <circle cx="301" cy="172" r="1.8" fill="white" />
      <circle cx="343" cy="172" r="1.8" fill="white" />
      <ellipse cx="288" cy="198" rx="10" ry="6" fill="oklch(0.72 0.12 25)" opacity=".35" />
      <ellipse cx="352" cy="198" rx="10" ry="6" fill="oklch(0.72 0.12 25)" opacity=".35" />
      <path d="M314 186q6 6 12 0" stroke="oklch(0.6 0.08 50)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M304 210q16 16 32 0q-16 6-32 0Z" fill="oklch(0.45 0.12 20)" stroke="oklch(0.45 0.12 20)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M309 212q11 4 22 0" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export default function StudentAvatar() {
  const t = useT(T);
  const q = useHashQuery();
  const qCourse = q.get('course') ?? '';
  const qLesson = q.get('lesson') ?? '';
  const [captionsOn, setCaptionsOn] = useState(true);

  // Cheap reads only: no avatar session, no AI call. A session starts only on "Start session".
  const ctx = useLoad(async (signal) => {
    const [face, courses] = await Promise.all([
      get<{ current?: Face | null }>('/api/me/tutor-face', signal).then((r) => ({ ok: true as const, face: r?.current ?? null }), (e) => ({ ok: false as const, error: e })),
      get<CourseSummary[]>('/api/me/courses', signal).catch(() => []),
    ]);
    const list = arr<CourseSummary>(courses);
    return { face, course: list.find((c) => c.id === qCourse) ?? list[0] ?? null };
  }, qCourse);

  const face = ctx.data?.face.ok ? ctx.data.face.face : null;
  const img = mediaUrl(face?.imageUrl);
  const tutorName = face?.name || t.tutor;
  const course = ctx.data?.course;

  // The same body LiveAvatarModal sends from the course page (its defaults when there is no course).
  const call = useLiveCall(
    { course_id: course?.id || undefined, lesson_id: qLesson || undefined, subject: course?.subject || 'Academic', lesson_title: course?.title || 'Active Course Session' },
    { en: T.en.sorry, ar: T.ar.sorry },
  );
  const { phase } = call;
  const active = phase === 'checking' || phase === 'starting' || phase === 'live' || phase === 'ending';
  const connecting = phase === 'checking' || phase === 'starting';
  const live = phase === 'live';
  const overlay = phase === 'checking' ? t.checkingMic : phase === 'starting' ? t.starting : phase === 'ending' ? t.ending : live && call.switching ? t.switching : '';
  const problem = call.problem ? t.problems[call.problem] : null;
  const chatHref = qCourse ? `#/student/chat?course=${encodeURIComponent(qCourse)}` : '#/student/chat';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-8">
        <a href={qCourse ? `#/student/chat?course=${encodeURIComponent(qCourse)}` : '#/student'} aria-label={t.back} className="grid size-tap shrink-0 place-items-center rounded-lg hover:bg-muted"><Dir><ChevronLeft className="size-5" /></Dir></a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight md:text-xl">{t.title}</h1>
          <p dir="auto" className="truncate text-xs text-muted-foreground md:text-sm">{[course?.title, t.sub].filter(Boolean).join(' · ')}</p>
        </div>
        {live ? <Badge tone="success" className="gap-1.5"><span className="size-2 animate-pulse rounded-full bg-success" />{t.live}</Badge>
          : connecting ? <Badge tone="info" className="gap-1.5"><LoaderCircle className="animate-spin" />{t.connecting}</Badge>
          : <Badge tone="neutral" className="gap-1.5"><span className="size-2 rounded-full bg-muted-foreground" />{t.notConnected}</Badge>}
        <SessionMenu compact />
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Video stage: the chosen tutor's face until the live video plays over it */}
          <div className="relative h-[420px] overflow-hidden rounded-2xl bg-primary shadow-lg md:aspect-video md:h-auto">
            {ctx.loading && !ctx.data ? <Skeleton className="absolute inset-0 rounded-none" /> : img ? <img src={img} alt={tutorName} className="absolute inset-0 size-full object-cover" /> : <TutorPortrait />}
            <video id={VIDEO_ID} autoPlay playsInline aria-label={tutorName} className={cn('absolute inset-0 size-full bg-black object-cover object-[center_25%] transition-opacity duration-500', call.videoOn ? 'opacity-100' : 'pointer-events-none opacity-0')} />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 md:p-4">
              <span dir="auto" className="flex min-w-0 items-center gap-2 truncate rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <span className={cn('size-2 shrink-0 rounded-full', live ? 'bg-success' : 'bg-white/60')} />{tutorName}
              </span>
            </div>
            {/* The learner's tile: green frame while the tutor is listening, brighter while the learner speaks */}
            <div className={cn('absolute end-3 top-14 flex w-24 flex-col overflow-hidden rounded-xl border-2 bg-[oklch(0.32_0.04_262)] shadow-lg transition-colors md:end-4 md:top-16 md:w-36',
              live && !call.muted ? (call.hearing ? 'border-success ring-4 ring-success/40' : 'border-success') : 'border-white/25')}>
              <div className="relative grid aspect-[4/5] place-items-center">
                <svg viewBox="0 0 80 100" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
                  <circle cx="40" cy="42" r="16" fill="oklch(0.55 0.04 262)" />
                  <path d="M12 100c2-22 14-34 28-34s26 12 28 34Z" fill="oklch(0.55 0.04 262)" />
                </svg>
              </div>
              <div className="flex items-center justify-between gap-1 bg-black/35 px-2 py-1 text-[10px] font-semibold text-white md:text-xs">
                <span>{call.muted ? t.muted : t.you}</span>{call.muted ? <MicOff className="size-3" /> : <Mic className={cn('size-3', live ? 'opacity-100' : 'opacity-60')} />}
              </div>
            </div>
            {overlay && (
              <div className="absolute inset-0 grid place-items-center bg-black/45" role="status" aria-live="polite">
                <p className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur"><LoaderCircle className="size-4 animate-spin" />{overlay}</p>
              </div>
            )}
            {live && captionsOn && call.caption?.text.trim() && (
              <div className="absolute inset-x-3 bottom-3 md:inset-x-10 md:bottom-6" aria-live="polite">
                <p dir="auto" className="mx-auto w-fit max-w-2xl rounded-xl bg-black/70 px-4 py-2.5 text-center text-sm leading-relaxed text-white backdrop-blur md:text-base">
                  <span className="font-bold opacity-80">{call.caption.who === 'you' ? t.youWho : t.tutorWho}: </span>{call.caption.text.trim().slice(-220)}
                </p>
              </div>
            )}
          </div>
          {ctx.data && !ctx.data.face.ok && <InlineError error={ctx.data.face.error} onRetry={ctx.reload} />}

          {/* Controls */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-2.5 md:p-3">
            <div className="flex items-center gap-2">
              <Toggle isDisabled={!live} isSelected={call.muted} onChange={call.setMuted} aria-label={t.mute} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4">
                {call.muted ? <MicOff className="!size-5" /> : <Mic className="!size-5" />}<span className="hidden md:inline">{t.mute}</span>
              </Toggle>
              <Toggle isSelected={captionsOn} onChange={setCaptionsOn} aria-label={t.captions} className="size-12 rounded-full px-0 md:h-12 md:w-auto md:px-4"><Captions className="!size-5" /><span className="hidden md:inline">{t.captions}</span></Toggle>
            </div>
            {active
              ? <Button variant="destructive" className="h-12 rounded-full px-5" isDisabled={phase === 'ending' || phase === 'checking'} onPress={() => void call.end()}><PhoneOff />{t.end}</Button>
              : <Button className="h-12 rounded-full px-5" isDisabled={call.cooldown || (ctx.loading && !ctx.data)} onPress={() => void call.start()}>{phase === 'error' ? <RefreshCw /> : <Video />}{phase === 'error' ? t.tryAgain : t.start}</Button>}
          </div>

          {phase === 'error' && problem && (
            <Alert tone="danger" icon={<AlertCircle />} title={problem[0]}>
              <p>{problem[1]}</p>
              <LinkButton href={chatHref} variant="outline" size="sm" className="mt-2"><MessageCircle />{t.useChat}</LinkButton>
            </Alert>
          )}
          <p className="text-center text-xs text-muted-foreground">{t.tip} {t.speakHint}</p>

          {/* Phone: time used */}
          <Card className="flex flex-col gap-2 p-4 lg:hidden">
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{t.used}</span><NotAvailable /></div>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{t.limit}</span><NotAvailable /></div>
          </Card>
          <div className="lg:hidden"><PastCalls /></div>
        </div>

        <aside className="hidden flex-col gap-4 lg:flex">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Clock className="size-4 text-muted-foreground" />{t.used}</h2><NotAvailable /></div>
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t.limit}</h2><NotAvailable /></div>
          </Card>
          <PastCalls />
        </aside>
      </main>
    </div>
  );
}

/** Past live calls: loaded only when the learner asks (the list request also wakes the tutor model). */
function PastCalls() {
  const t = useT(T);
  const { lang } = usePreview();
  const [shown, setShown] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(async (signal) => (shown ? arr<PastCall>(await get<PastCall[]>('/api/me/tutor/sessions?limit=50', signal)).filter((s) => s?.mode === 'voice') : []), shown ? 'shown' : 'hidden');
  const call = useLoad(async (signal) => (openId ? await get<CallDoc>(`/api/me/tutor/sessions/${encodeURIComponent(openId)}`, signal) : null), openId ?? '');
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-5">
      <h2 className="flex items-center gap-2 font-bold"><History className="size-4 text-muted-foreground" />{t.transcript}</h2>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">{t.transcriptNote}</p>
      {!shown ? <Button variant="outline" onPress={() => setShown(true)}>{t.showPast}</Button>
        : list.loading ? <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : list.error ? <InlineError error={list.error} onRetry={list.reload} />
        : openId ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setOpenId(null)} className="flex w-fit items-center gap-1 text-sm font-semibold text-primary"><Dir><ChevronLeft className="size-4" /></Dir>{t.backToList}</button>
            {call.loading ? <Skeleton className="h-32" /> : call.error ? <InlineError error={call.error} onRetry={call.reload} /> : (
              <ol className="flex max-h-[60vh] flex-col gap-3.5 overflow-y-auto">
                {arr<NonNullable<CallDoc['messages']>[number]>(call.data?.messages).filter((m) => str(m?.text)).map((m, i) => (
                  <li key={m.id ?? i} className="flex flex-col gap-0.5">
                    <span className={cn('text-xs font-bold', m.role === 'user' ? 'text-muted-foreground' : 'text-primary')}>{m.role === 'user' ? t.youWho : t.tutorWho}{m.timestamp && <span className="font-normal text-muted-foreground"> · {fmtTime(m.timestamp, lang)}</span>}</span>
                    <p dir="auto" className="whitespace-pre-wrap break-words text-start text-sm leading-relaxed">{m.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : arr<PastCall>(list.data).length === 0 ? <p className="text-sm text-muted-foreground">{t.noPast}</p> : (
          <ul className="flex flex-col gap-1">
            {arr<PastCall>(list.data).map((s, i) => (
              <li key={s.id ?? i}>
                <button type="button" onClick={() => s.id && setOpenId(s.id)} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-start hover:bg-muted">
                  <span dir="auto" className="w-full truncate text-sm font-semibold">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{[fmtDate(s.lastMessageAt, lang), typeof s.messageCount === 'number' ? t.messages(num(s.messageCount, lang)) : ''].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
