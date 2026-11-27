import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RolePlaySceneCard, type SceneCardData } from './RolePlaySceneCard';
import { EnaraMark } from '../brand/EnaraLogo';
import { X, Loader2, AlertCircle, RefreshCw, Mic, MicOff, Volume2, VolumeX, Captions, CaptionsOff } from 'lucide-react';
import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import { Assessment } from '../../types';
import {
  avatarFetch,
  lmsNewTabTarget,
  fetchMyTutorFace,
  setMyTutorFace,
  type TutorFace,
  type TutorFaceChoice,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { FaceGallery } from './FaceGallery';
import { AvatarVoice, SentenceSplitter, languageOfText, type VoiceLanguage } from '../../services/avatarVoice';
import { UtteranceRecorder, base64 } from '../../services/utteranceRecorder';
import { markRelayDown, relayBase } from '../../services/relay';
import { notCaughtLine } from '../../services/voiceText';
import { SpeechChunkCleaner, stripMarkdownForSpeech } from '../../services/speechText';
import { cueAtSeconds, cueTag, isExpressiveCue } from '../../services/expressiveCues';
import { WebAudioSink } from '../../services/webAudioSink';
import { classifyMicError, isInFrame, micMessage } from '../../services/micCheck';
import { MicProblemNotice, useMicGate, type MicProblem } from '../MicCheck';

interface LiveAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonTitle?: string;
  subject?: string;
  initialAvatarId?: string;
  isStudent?: boolean;
  courseId?: string;
  lessonId?: string;
  assessments?: Assessment[];
  /** LMS Phase 8: the page "Open in a new tab" lands on (default: My learning for students). */
  newTabPage?: string;
}

// 'voice': the video avatar couldn't connect, so the tutor talks without a face.
type AvatarProvider = 'anam' | 'tavus' | 'voice';

type AvatarSessionResponse = {
  session_id: string;
  // 'video' (older servers: 'anam') is the lip-synced face.
  provider: AvatarProvider | 'video';
  session_token?: string;
  conversation_url?: string;
  fallback_reason?: string | null;
  // 'server' (older servers: 'elevenlabs'): ENARA listens and speaks, the video is only the face.
  speech?: 'server' | 'avatar' | 'anam' | 'elevenlabs';
  // avatarSpeaking: record each finished sentence as a short clip for pronunciation feedback (adults only; the server decides).
  pronunciation?: boolean;
  // Live call controls whose switch is on (absent: none).
  features?: LiveCallFeatures;
};

// The server's live call switches (ENARA_ENGINE_V2 liveMute, ...): off means the call looks as before.
type LiveCallFeatures = { mute?: boolean; captions?: boolean };

// liveCaptions: one caption line (the tutor's spoken words, or what was heard from the learner). An open
// line still grows: the tutor's current turn, or the learner's words while they are talking.
type CaptionLine = { id: number; who: 'tutor' | 'learner'; text: string; open: boolean };
const CAPTION_LINES = 4;
const CAPTION_CHARS = 220;
const CAPTIONS_KEY = 'enara.liveCaptions';
const readCaptionsChoice = (): boolean => {
  try {
    return localStorage.getItem(CAPTIONS_KEY) === 'on';
  } catch {
    return false;
  }
};

const MIC_PERMISSION_DENIED_REASON = 'CONNECTION_CLOSED_CODE_MICROPHONE_PERMISSION_DENIED';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Shown in the visual panel while a requested drawing is being made.
const DRAWING_PLACEHOLDER =
  '<div style="font-family:system-ui,sans-serif;color:#475569;display:flex;align-items:center;justify-content:center;height:90vh;font-size:15px">Drawing a visual for you… / جاري الرسم…</div>';

export const LiveAvatarModal: React.FC<LiveAvatarModalProps> = ({
  isOpen,
  onClose,
  lessonTitle = 'Business English',
  subject = 'Academic',
  courseId,
  lessonId,
  isStudent = false,
  newTabPage,
}) => {
  const [provider, setProvider] = useState<AvatarProvider | null>(null);
  const [tavusUrl, setTavusUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactHtml, setArtifactHtml] = useState<string | null>(null);
  // liveRolePlay: the scene card ({ scene } from /query-stream; null outside a scene).
  const [scene, setScene] = useState<SceneCardData | null>(null);
  const [status, setStatus] = useState('');
  // Anam's STT/voice language is fixed for the whole session and there's no
  // auto-detect from a cold start, so we ask up front instead of requiring
  // the student to say "speak Arabic" in English first.
  // 'auto': the server picks the opening language (the student's last call's).
  const [languageChoice, setLanguageChoice] = useState<'english' | 'arabic' | 'auto' | null>(null);
  // Mic / new tab: a short mic probe on "Start call", before any voice or
  // avatar SDK starts; its error (and any later one) picks the message, and
  // "blocked by the LMS frame" offers "Open in a new tab".
  const mic = useMicGate('avatar', { showOnLoad: true });
  const micRef = useRef(mic);
  micRef.current = mic;
  const micFailed = useCallback((p: MicProblem) => {
    micRef.current.fail(p);
    setError(`${micMessage(p, 'en').title} / ${micMessage(p, 'ar').title}`);
  }, []);
  const newTabTarget = useCallback(() => lmsNewTabTarget({ page: newTabPage ?? (isStudent ? 'courses' : null) }), [isStudent, newTabPage]);

  const sessionIdRef = useRef<string | null>(null);
  const anamClientRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closingRef = useRef(false);
  const fallbackStartedRef = useRef(false);
  const startVoiceOnlyRef = useRef<() => Promise<void>>(async () => {});
  // "Try again" waits a few seconds between attempts (the server limits call starts).
  const [retryWaitUntil, setRetryWaitUntil] = useState(0);
  const [, setRetryTick] = useState(0);
  const answeringRef = useRef(false);
  const lastUserMessageRef = useRef<string>('');
  const anamLanguageRef = useRef<'english' | 'arabic'>('english');
  const lastHeardLanguageRef = useRef<'english' | 'arabic' | null>(null);
  const notCaughtAtRef = useRef(0);
  const switchingLanguageRef = useRef(false);
  // Always points at the latest switchAnamLanguage closure so
  // streamEnaraAnswerToAnam (defined earlier) can call it without being
  // re-created every time switchAnamLanguage's own deps change.
  const switchAnamLanguageRef = useRef<(target: string) => Promise<void>>(async () => {});
  // Restarts the call after a dropped connection; set once `start` exists.
  const restartRef = useRef<() => Promise<void>>(async () => {});
  // Once per call: restart it so the server hands back the video tutor's own
  // voice and listening (it has marked ENARA's voice as refused).
  const voiceSwitchedRef = useRef(false);
  const switchToAvatarVoice = useCallback(() => {
    if (voiceSwitchedRef.current || closingRef.current) return;
    voiceSwitchedRef.current = true;
    setStatus('Switching voice…');
    void restartRef.current();
  }, []);
  const reconnectsRef = useRef<number[]>([]);
  const speechModeRef = useRef<'anam' | 'elevenlabs'>('anam');
  const voiceRef = useRef<AvatarVoice | null>(null);
  // avatarSpeaking: the last seconds of the microphone, and when the current sentence started (first live text).
  const clipRecorderRef = useRef<UtteranceRecorder | null>(null);
  const hearingSinceRef = useRef<number | null>(null);
  const voiceHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const voiceTurnRef = useRef(0);
  const [myTutor, setMyTutor] = useState<{ current: TutorFace | null; chosen: boolean; options: TutorFaceChoice[] } | null>(null);
  const [tutorPickerOpen, setTutorPickerOpen] = useState(false);
  const [tutorSaving, setTutorSaving] = useState<string | null>(null);
  const anamReadyRef = useRef(false);
  const [features, setFeatures] = useState<LiveCallFeatures>({});
  // liveMute: the learner's microphone (the tutor hears nothing) and the tutor's
  // voice (the tutor keeps talking, face moving, unheard). Kept across reconnects
  // within a call; a new call starts with both on.
  const [micMuted, setMicMuted] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const micMutedRef = useRef(false);
  const voiceMutedRef = useRef(false);
  const voiceSinkRef = useRef<WebAudioSink | null>(null);
  // liveCaptions: off until the learner turns them on; the choice is remembered in this browser.
  const [captionsOn, setCaptionsOn] = useState(readCaptionsChoice);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const captionIdRef = useRef(0);
  // mode 'append': add to the speaker's open line; 'replace': the speaker's open line becomes text (live
  // recognition); 'close': end the speaker's open line. Clean words only (no Markdown, citations or LaTeX).
  const caption = useCallback((who: CaptionLine['who'], text: string, mode: 'append' | 'replace' | 'close') => {
    const clean = mode === 'close' ? '' : stripMarkdownForSpeech(text).replace(/\s+/g, ' ').trim();
    if (mode !== 'close' && !clean) return;
    setCaptions((lines) => {
      const last = lines[lines.length - 1];
      const own = last && last.who === who && last.open ? last : null;
      if (mode === 'close') return own ? [...lines.slice(0, -1), { ...own, open: false }] : lines;
      // The other speaker's open line ends when this one speaks.
      const closed = lines.map((l) => (l.open && l.who !== who ? { ...l, open: false } : l));
      const next = own
        ? [...closed.slice(0, -1), { ...own, text: mode === 'append' ? `${own.text} ${clean}` : clean }]
        : [...closed, { id: ++captionIdRef.current, who, text: clean, open: true }];
      return next.slice(-CAPTION_LINES);
    });
  }, []);
  // liveExpressive: the last cue sent and the video tutor's own confirmations, as data attributes on the video's frame
  // (read by the screenshot run; nothing is shown).
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const markExpression = (key: 'cueSent' | 'cueApplied' | 'personaTurn' | 'personaDone', value: string) => {
    const el = videoFrameRef.current;
    if (el) el.dataset[key] = `${value}@${Date.now()}`;
  };
  // Created on the student's click, so the browser lets it play sound later.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While Anam's stream is connected, tell the server once a minute (usage
  // metering evidence; no content is sent).
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nudgesRef = useRef(0);
  const answerSpokenTurnRef = useRef<
    (text: string | null, language: VoiceLanguage | undefined, kind?: 'turn' | 'opening' | 'nudge') => Promise<void>
  >(async () => {});

  const unlockAudio = () => {
    try {
      audioCtxRef.current ??= new AudioContext();
      void audioCtxRef.current.resume();
    } catch {
      // No Web Audio: voice-only fallback won't be available.
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sessionId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await avatarFetch(`/artifact/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.html) setArtifactHtml(data.html);
      } catch {
        // Visual aids are optional; do not interrupt tutoring.
      }
    }, 2000);
  }, [stopPolling]);

  const stopAnam = useCallback(async () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    voiceRef.current?.stop();
    voiceRef.current = null;
    voiceSinkRef.current = null;
    clipRecorderRef.current?.stop();
    clipRecorderRef.current = null;
    const client = anamClientRef.current;
    anamClientRef.current = null;
    if (!client) return;
    try {
      await client.stopStreaming();
    } catch {
      // best effort
    }
  }, []);

  const endServerSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (!sessionId) return;
    try {
      await avatarFetch(`/session/${sessionId}`, { method: 'DELETE' });
    } catch {
      // best effort
    }
  }, []);

  const resetUi = useCallback(() => {
    micRef.current.clear();
    voiceSwitchedRef.current = false;
    setProvider(null);
    setTavusUrl(null);
    setArtifactHtml(null);
    setScene(null);
    setError(null);
    setStatus('');
    fallbackStartedRef.current = false;
    answeringRef.current = false;
    lastUserMessageRef.current = '';
    anamLanguageRef.current = 'english';
    lastHeardLanguageRef.current = null;
    switchingLanguageRef.current = false;
    setLanguageChoice(null);
    setFeatures({});
    setCaptions([]);
    micMutedRef.current = false;
    voiceMutedRef.current = false;
    setMicMuted(false);
    setVoiceMuted(false);
  }, []);

  const switchToTavus = useCallback(async (reason: string) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || fallbackStartedRef.current || closingRef.current) return;

    fallbackStartedRef.current = true;
    setLoading(true);
    setStatus('Reconnecting tutor…');

    try {
      await stopAnam();

      const res = await avatarFetch(`/session/${sessionId}/fallback`, { method: 'POST', body: { reason } });

      if (!res.ok) throw new Error(`Fallback failed (${res.status})`);

      const data = await res.json();
      if (!data.conversation_url) throw new Error('Fallback did not return a Tavus URL');

      setProvider('tavus');
      setTavusUrl(data.conversation_url);
      setStatus('Connected');
      setLoading(false);
    } catch (e) {
      console.error('[AVATAR] Tavus fallback failed', e);
      // No backup video: the call can still go on by voice.
      if (speechModeRef.current === 'elevenlabs' && sessionIdRef.current && !closingRef.current) {
        await startVoiceOnlyRef.current();
        return;
      }
      setError('The AI tutor is temporarily unavailable. Please try again.');
      setLoading(false);
    }
  }, [stopAnam]);

  const streamEnaraAnswerToAnam = useCallback(async (messageHistory: any[]) => {
    const client = anamClientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId || answeringRef.current) return;

    const last = messageHistory?.[messageHistory.length - 1];
    if (!last || last.role !== 'user' || !last.content?.trim()) return;

    const dedupeKey = `${messageHistory.length}:${last.content.trim()}`;
    if (lastUserMessageRef.current === dedupeKey) return;
    lastUserMessageRef.current = dedupeKey;

    answeringRef.current = true;
    let talkStream: any = null;
    let pendingLanguageSwitch: string | null = null;
    // liveCaptions: what the video tutor heard, then its answer as it is streamed to its voice.
    caption('learner', last.content, 'replace');
    caption('learner', '', 'close');

    try {
      const messages = messageHistory.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      talkStream = client.createTalkMessageStream();

      const res = await avatarFetch('/query-stream', {
        method: 'POST',
        body: { session_id: sessionId, messages },
      });

      if (!res.ok || !res.body) throw new Error(`ENARA query failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Anam speaks what it is given: words only, no Markdown symbols, citation markers or LaTeX.
      const speech = new SpeechChunkCleaner();

      const handleLine = (trimmed: string) => {
        if (!trimmed) return;
        const data = JSON.parse(trimmed);
        if (data.visual === 'drawing') setArtifactHtml(DRAWING_PLACEHOLDER);
        if ('scene' in data) setScene(data.scene ?? null);
        // liveExpressive: the cue goes into the talk stream only (the video tutor reads it; it is never spoken or shown).
        if (isExpressiveCue(data.cue) && talkStream?.isActive()) {
          const before = speech.flush();
          if (before) {
            talkStream.streamMessageChunk(before, false);
            caption('tutor', before, 'append');
          }
          talkStream.streamMessageChunk(cueTag(data.cue), false);
          markExpression('cueSent', data.cue);
          return;
        }
        if (data.content && talkStream?.isActive()) {
          const words = speech.push(data.content);
          if (words) {
            talkStream.streamMessageChunk(words, false);
            caption('tutor', words, 'append');
          }
        } else if (data.language_switch) {
          // The current answer keeps speaking in the current voice; the
          // switch only takes effect once this turn is fully spoken.
          pendingLanguageSwitch = data.language_switch;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) handleLine(line.trim());
      }

      if (buffer.trim()) handleLine(buffer.trim());

      const rest = speech.flush();
      if (rest && talkStream?.isActive()) {
        talkStream.streamMessageChunk(rest, false);
        caption('tutor', rest, 'append');
      }
      caption('tutor', '', 'close');
      if (talkStream?.isActive()) talkStream.endMessage();
    } catch (e) {
      console.error('[AVATAR] ENARA answer streaming failed', e);
      try {
        if (talkStream?.isActive()) talkStream.endMessage();
        await client.talk('Sorry, I had trouble answering that. Please try again.');
        caption('tutor', 'Sorry, I had trouble answering that. Please try again.', 'append');
        caption('tutor', '', 'close');
      } catch {
        // If Anam itself is broken, the connection handler will trigger fallback.
      }
    } finally {
      answeringRef.current = false;
      if (pendingLanguageSwitch) {
        void switchAnamLanguageRef.current(pendingLanguageSwitch);
      }
    }
  }, [caption]);

  // ElevenLabs mode: one spoken turn. The reply streams in as text, is cut into
  // sentences, and each sentence is spoken as soon as it is complete. A new
  // utterance (the student talking over the avatar) supersedes the current turn.
  // The tutor speaks up by itself: it opens the call, and nudges a student who
  // goes quiet after one of its questions (at most twice in a row).
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const answerSpokenTurn = useCallback(async (
    text: string | null,
    language: VoiceLanguage | undefined,
    kind: 'turn' | 'opening' | 'nudge' = 'turn',
  ) => {
    const voice = voiceRef.current;
    const sessionId = sessionIdRef.current;
    if (!voice || !sessionId) return;
    clearSilenceTimer();
    if (kind === 'turn') nudgesRef.current = 0;
    const turn = ++voiceTurnRef.current;
    const current = () => turn === voiceTurnRef.current && !closingRef.current;
    caption('tutor', '', 'close');
    setStatus(kind !== 'turn' ? 'Speaking…' : language === 'arabic' ? 'Thinking… (Arabic)' : 'Thinking… (English)');

    const messages =
      kind === 'turn' && text
        ? [...voiceHistoryRef.current, { role: 'user' as const, content: text }]
        : [...voiceHistoryRef.current];
    const splitter = new SentenceSplitter();
    let reply = '';
    // Sentences whose audio arrives inside the reply (server-side speech).
    const inlineSentences = new Map<number, { push(chunk: Uint8Array): void; end(): void }>();
    const endInline = () => {
      inlineSentences.forEach((sentence) => sentence.end());
      inlineSentences.clear();
    };
    let voiceDown = false;
    try {
      const res = await avatarFetch('/query-stream', {
        method: 'POST',
        body: { session_id: sessionId, messages, language, kind, speak: true },
      });
      if (!res.ok || !res.body) throw new Error(`ENARA query failed (${res.status})`);
      // An older server sends text only: the browser then speaks each sentence itself.
      const inline = res.headers.get('X-Enara-Speech') === 'inline';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.visual === 'drawing') setArtifactHtml(DRAWING_PLACEHOLDER);
        if ('scene' in data) setScene(data.scene ?? null);
        // liveExpressive: ENARA speaks, so the cue goes to the face over the data channel, timed from the turn's start.
        if (isExpressiveCue(data.cue)) {
          try {
            anamClientRef.current?.sendDirectorNoteCue(data.cue, { atSeconds: cueAtSeconds(reply.length) });
            markExpression('cueSent', data.cue);
          } catch {
            // No face (voice only) or an older engine: the call goes on without the cue.
          }
          return;
        }
        if (data.content) {
          reply += data.content;
          if (!inline) for (const sentence of splitter.push(data.content)) voice.say(sentence);
        }
        if (inline && typeof data.say === 'string') inlineSentences.set(data.s, voice.sayInline(data.say));
        if (inline && typeof data.audio === 'string') inlineSentences.get(data.s)?.push(decodeBase64(data.audio));
        if (data.voice === 'unavailable') voiceDown = true;
        if (inline && typeof data.said === 'number') {
          inlineSentences.get(data.said)?.end();
          inlineSentences.delete(data.said);
        }
      };
      while (current()) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!current()) break;
        setStatus('Speaking…');
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(handleLine);
      }
      if (!current()) {
        void reader.cancel().catch(() => {});
        return;
      }
      handleLine(buffer);
      endInline();
      // ENARA's voice was refused: carry on with the video tutor's voice.
      if (voiceDown) {
        if (reply) voiceHistoryRef.current = [...messages, { role: 'assistant' as const, content: reply }].slice(-12);
        switchToAvatarVoice();
        return;
      }
      if (!inline) for (const sentence of splitter.flush()) voice.say(sentence);
      if (reply) voiceHistoryRef.current = [...messages, { role: 'assistant' as const, content: reply }].slice(-12);
      await voice.finishTurn();
      // Ended on a question: if the student stays quiet, help them along.
      // One nudge per student turn, after a longer pause: thinking time first.
      if (current() && /[?؟]\s*$/.test(reply) && nudgesRef.current < 1 && !micMutedRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          // Microphone off: the learner can't answer, so no nudge.
          if (!current() || micMutedRef.current) return;
          nudgesRef.current += 1;
          void answerSpokenTurnRef.current(null, undefined, 'nudge');
        }, 22_000);
      }
    } catch (e) {
      console.error('[AVATAR] Spoken answer failed', e);
      if (!current()) return;
      if (kind !== 'turn') return;
      voice.say(language === 'arabic' ? 'آسف، حصلت مشكلة. ممكن تسأل تاني؟' : 'Sorry, I had trouble answering that. Please try again.');
      await voice.finishTurn();
    } finally {
      // A broken stream must not leave a sentence waiting for audio forever.
      endInline();
      if (current()) setStatus('Listening…');
    }
  }, [caption, clearSilenceTimer, switchToAvatarVoice]);

  useEffect(() => {
    answerSpokenTurnRef.current = answerSpokenTurn;
  }, [answerSpokenTurn]);

  // ElevenLabs listening and speaking, into either Anam (lip-sync) or the browser.
  const startVoice = useCallback((sink: import('../../services/avatarVoice').AudioSink, interrupt: () => void) => {
    if (!sessionIdRef.current) return;
    const voice = new AvatarVoice(sessionIdRef.current, sink, {
      onUtterance: (text, language) => {
        lastHeardLanguageRef.current = language;
        caption('learner', text, 'replace');
        caption('learner', '', 'close');
        // avatarSpeaking: one English sentence as a short clip for pronunciation feedback (fire and forget; never blocks the answer).
        const rec = clipRecorderRef.current; const since = hearingSinceRef.current; hearingSinceRef.current = null;
        if (rec && language === 'english' && sessionIdRef.current) {
          const clip = rec.lastClip(since ? (Date.now() - since) / 1000 + 0.6 : 4);
          if (clip) void avatarFetch(`/session/${sessionIdRef.current}/pronunciation`, { method: 'POST', body: { audio: base64(clip), reference_text: text } }).catch(() => {});
        }
        void answerSpokenTurn(text, language);
      },
      // Misheard as another language: ask again in the call's language, at
      // most every 8 s, and never send it to the tutor.
      onNotCaught: () => {
        const now = Date.now();
        if (now - notCaughtAtRef.current < 8000 || !voiceRef.current) return;
        notCaughtAtRef.current = now;
        voiceRef.current.say(notCaughtLine(lastHeardLanguageRef.current ?? anamLanguageRef.current));
        void voiceRef.current.finishTurn();
      },
      // The student is talking: no nudge.
      onHearing: (text) => { clearSilenceTimer(); hearingSinceRef.current ??= Date.now(); caption('learner', text, 'replace'); },
      // liveCaptions: each sentence as its audio starts.
      onSpeaking: (text) => caption('tutor', text, 'append'),
      onInterrupt: interrupt,
      onVoiceUnavailable: () => switchToAvatarVoice(),
      onError: (message) => setError(message),
    });
    voiceRef.current = voice;
    // liveMute: a reconnect keeps the learner's microphone choice.
    if (micMutedRef.current) voice.setMicMuted(true);
    voice
      .startListening()
      .then(() => {
        setStatus('Listening…');
        // The tutor opens the call; a reconnect carries on instead.
        if (voiceHistoryRef.current.length === 0) void answerSpokenTurn(null, undefined, 'opening');
      })
      .catch((e) => {
        console.error('[AVATAR] Voice start failed', e);
        micFailed(classifyMicError(e, isInFrame()));
      });
  }, [answerSpokenTurn, caption, clearSilenceTimer, micFailed, switchToAvatarVoice]);

  // The video avatar refused the call: carry on as a voice-only tutor.
  const startVoiceOnly = useCallback(async () => {
    await stopAnam();
    const ctx = audioCtxRef.current;
    if (!ctx || !sessionIdRef.current) {
      setError('The video tutor is unavailable right now. Please try again later.');
      setLoading(false);
      return;
    }
    void ctx.resume().catch(() => {});
    const sink = new WebAudioSink(ctx);
    sink.setMuted(voiceMutedRef.current);
    voiceSinkRef.current = sink;
    setProvider('voice');
    setLoading(false);
    setStatus('Voice only');
    startVoice(sink, () => sink.stopPlayback());
  }, [startVoice, stopAnam]);

  useEffect(() => {
    startVoiceOnlyRef.current = startVoiceOnly;
  }, [startVoiceOnly]);

  // Check Enara's relay while the call is being set up, not after.
  useEffect(() => {
    void relayBase();
  }, []);

  const startAnam = useCallback(async (sessionToken: string, allowRelay = true): Promise<void> => {
    anamReadyRef.current = false;
    const elevenlabs = speechModeRef.current === 'elevenlabs';
    // The video service's signalling goes through Enara's relay when it answers.
    const relay = allowRelay ? await relayBase() : null;
    // In ElevenLabs mode the microphone goes to ElevenLabs, not to Anam.
    const client = createClient(sessionToken, {
      ...(elevenlabs ? { disableInputAudio: true } : {}),
      // SDK 4.29.1 reads the gateway only under `api` (a top-level apiGateway is ignored, so calls went direct).
      ...(relay ? { api: { apiGateway: { enabled: true, baseUrl: `${relay}/v`, wsPath: '/v/ws' } } } : {}),
    });
    anamClientRef.current = client;
    // liveMute: a new video connection (reconnect, language switch) keeps the microphone off.
    if (!elevenlabs && micMutedRef.current) {
      try {
        client.muteInputAudio();
      } catch {
        // applied again once the session is ready
      }
    }

    client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
      setStatus('Connected');
    });

    client.addListener(AnamEvent.SESSION_READY, () => {
      setLoading(false);
      setStatus('Connected');
      if (!elevenlabs && micMutedRef.current) {
        try {
          client.muteInputAudio();
        } catch {
          // best effort
        }
      }
      const beat = () => {
        const sessionId = sessionIdRef.current;
        if (!sessionId || anamClientRef.current !== client) return;
        let providerSessionId: string | null = null;
        try {
          providerSessionId = client.getActiveSessionId();
        } catch {
          // not available
        }
        void avatarFetch(`/session/${sessionId}/heartbeat`, { method: 'POST', body: { provider_session_id: providerSessionId } }).catch(() => {});
      };
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      beat();
      heartbeatRef.current = setInterval(beat, 60_000);
      if (!elevenlabs || !sessionIdRef.current) return;

      anamReadyRef.current = true;
      const sink = client.createAgentAudioInputStream({ encoding: 'pcm_s16le', sampleRate: 16000, channels: 1 });
      startVoice(sink, () => {
        try {
          client.interruptPersona();
        } catch {
          // best effort
        }
      });
    });

    if (!elevenlabs) client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, streamEnaraAnswerToAnam);
    // liveExpressive: when the video tutor confirms a cue, and when each spoken reply starts (screenshot run timing).
    let lastPersonaId = '';
    client.addListener(AnamEvent.DIRECTOR_NOTE_CUE_APPLIED, (e: { cueTag?: string }) => markExpression('cueApplied', String(e?.cueTag ?? '')));
    client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (e: { id?: string; role?: string; cueTag?: string; endOfSpeech?: boolean }) => {
      if (e?.role === 'user' || !e?.id) return;
      if (e.id !== lastPersonaId) {
        lastPersonaId = e.id;
        markExpression('personaTurn', e.cueTag ?? '');
      }
      if (e.endOfSpeech) markExpression('personaDone', e.id);
    });

    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
      answeringRef.current = false;
    });

    client.addListener(AnamEvent.CONNECTION_CLOSED, async (reason: unknown) => {
      console.warn('[AVATAR] video connection closed', reason);
      if (String(reason) === MIC_PERMISSION_DENIED_REASON) {
        micFailed(isInFrame() ? 'blocked_in_frame' : 'denied');
        setLoading(false);
        return;
      }
      if (closingRef.current || anamClientRef.current !== client) return;
      // Closed before the call started through the relay: try once directly.
      if (!anamReadyRef.current && relay) {
        markRelayDown();
        void startAnam(sessionToken, false).catch(() => void startVoiceOnly());
        return;
      }
      // Closed before the call even started: Anam is refusing sessions (for
      // example an account limit), so reconnecting won't help.
      if (!anamReadyRef.current) {
        if (speechModeRef.current === 'elevenlabs') {
          void startVoiceOnly();
        } else {
          setError('The video tutor is unavailable right now. Please try again later.');
          setLoading(false);
        }
        return;
      }
      // Anam's video connection can drop mid-call: reconnect (keeping the
      // conversation) a few times before falling back.
      const now = Date.now();
      reconnectsRef.current = reconnectsRef.current.filter((t) => now - t < 5 * 60 * 1000);
      if (reconnectsRef.current.length < 3) {
        reconnectsRef.current.push(now);
        void restartRef.current();
        return;
      }
      await switchToTavus(`anam_connection_closed:${String(reason)}`);
    });

    try {
      await client.streamToVideoElement('enara-anam-video');
    } catch (error) {
      // Already handled (closed and retried directly, or the call ended).
      if (anamClientRef.current !== client) return;
      if (!relay) throw error;
      // The relay couldn't start the video: connect directly instead.
      markRelayDown();
      anamClientRef.current = null;
      void client.stopStreaming().catch(() => {});
      await startAnam(sessionToken, false);
    }
  }, [micFailed, startVoice, startVoiceOnly, streamEnaraAnswerToAnam, switchToTavus]);

  // Anam has no mid-call language switch: the adapter decides (from the
  // transcript) that the student wants Arabic/English, and this tears down
  // the current Anam client and starts a fresh one with the matching
  // voice/STT. The current turn already finished speaking before this runs.
  const switchAnamLanguage = useCallback(async (target: string) => {
    const sessionId = sessionIdRef.current;
    const desired = target === 'arabic' ? 'arabic' : 'english';
    if (
      !sessionId ||
      provider !== 'anam' ||
      switchingLanguageRef.current ||
      desired === anamLanguageRef.current ||
      closingRef.current
    ) {
      return;
    }

    switchingLanguageRef.current = true;
    setStatus(desired === 'arabic' ? 'Switching to Arabic…' : 'Switching to English…');

    try {
      const res = await avatarFetch(`/session/${sessionId}/language`, {
        method: 'POST',
        body: { target_language: desired },
      });
      if (!res.ok) throw new Error(`Language switch failed (${res.status})`);

      const data = await res.json();
      if (!data.session_token) return;

      anamLanguageRef.current = desired;
      await stopAnam();
      await startAnam(data.session_token);
    } catch (e) {
      console.error('[AVATAR] video language switch failed', e);
      setStatus('Connected');
      // Non-fatal: the current voice keeps working, and the next turn will
      // retry the switch if the student is still speaking the other language.
    } finally {
      switchingLanguageRef.current = false;
    }
  }, [provider, startAnam, stopAnam]);

  useEffect(() => {
    switchAnamLanguageRef.current = switchAnamLanguage;
  }, [switchAnamLanguage]);

  const start = useCallback(async (preferredLanguage: 'english' | 'arabic' | undefined, reconnect = false) => {
    closingRef.current = false;
    fallbackStartedRef.current = false;
    anamLanguageRef.current = preferredLanguage || 'english';
    switchingLanguageRef.current = false;
    setLoading(true);
    setError(null);
    if (!reconnect) { setArtifactHtml(null); setScene(null); }
    setTavusUrl(null);
    setProvider(null);
    setStatus(reconnect ? 'Reconnecting…' : 'Starting session…');

    // A fresh start ("Try again") first closes whatever call is still open, so
    // half-started calls don't pile up and block the next one.
    if (!reconnect && sessionIdRef.current) {
      stopPolling();
      await stopAnam();
      await endServerSession();
    }

    try {
      const res = await avatarFetch('/session', {
        method: 'POST',
        body: {
          course_id: courseId,
          lesson_id: lessonId,
          subject,
          lesson_title: lessonTitle,
          preferred_language: preferredLanguage,
        },
      });

      if (!res.ok) throw new Error(`Session start failed (${res.status})`);

      const data: AvatarSessionResponse = await res.json();
      sessionIdRef.current = data.session_id;
      setFeatures(data.features ?? {});
      // 'server' (and the older 'elevenlabs'): ENARA speaks and listens itself.
      speechModeRef.current = data.speech === 'server' || data.speech === 'elevenlabs' ? 'elevenlabs' : 'anam';
      // A reconnect continues the same conversation.
      if (!reconnect) {
        voiceHistoryRef.current = [];
        reconnectsRef.current = [];
      }
      startPolling(data.session_id);
      // avatarSpeaking: the server says when pronunciation clips may be recorded (adult learner, provider ready).
      if (data.pronunciation && !clipRecorderRef.current) {
        const rec = new UtteranceRecorder();
        rec.start().then(() => { clipRecorderRef.current = rec; }, () => rec.stop());
      }

      if ((data.provider === 'video' || data.provider === 'anam') && data.session_token) {
        setProvider('anam');
        try {
          await startAnam(data.session_token);
        } catch (e) {
          console.error('[AVATAR] video startup failed', e);
          // The video didn't start: carry on as a voice-only tutor when the
          // voice is ours (ElevenLabs) instead of a backup video service.
          if (speechModeRef.current === 'elevenlabs') await startVoiceOnly();
          else await switchToTavus('anam_client_start_failed');
        }
        return;
      }

      if (data.provider === 'tavus' && data.conversation_url) {
        setProvider('tavus');
        setTavusUrl(data.conversation_url);
        setStatus('Connected');
        setLoading(false);
        return;
      }

      throw new Error('Invalid avatar session response');
    } catch (e) {
      console.error('[AVATAR] Session startup failed', e);
      setError('Could not start the AI tutor. Please try again.');
      setLoading(false);
    }
  }, [courseId, endServerSession, lessonId, lessonTitle, startAnam, startPolling, startVoiceOnly, stopAnam, stopPolling, subject, switchToTavus]);

  useEffect(() => {
    restartRef.current = async () => {
      stopPolling();
      await stopAnam();
      await endServerSession();
      await start(anamLanguageRef.current, true);
    };
  }, [endServerSession, start, stopAnam, stopPolling]);

  const handleClose = useCallback(async () => {
    closingRef.current = true;
    stopPolling();
    await stopAnam();
    await endServerSession();
    resetUi();
    onClose();
  }, [endServerSession, onClose, resetUi, stopAnam, stopPolling]);

  // liveMute: microphone off/on. With the video tutor listening, its input is
  // muted; with ENARA listening, the transcription session closes (nothing is
  // sent) until the microphone is on again.
  const toggleMic = useCallback(() => {
    const muted = !micMutedRef.current;
    micMutedRef.current = muted;
    setMicMuted(muted);
    if (muted) clearSilenceTimer();
    if (speechModeRef.current === 'elevenlabs') {
      voiceRef.current?.setMicMuted(muted);
      return;
    }
    const client = anamClientRef.current;
    try {
      if (muted) client?.muteInputAudio();
      else client?.unmuteInputAudio();
    } catch {
      // not connected yet: applied when the session is ready
    }
  }, [clearSilenceTimer]);

  // liveMute: tutor voice off/on. The tutor keeps talking (the face keeps
  // moving); only what the learner hears is silenced: the video's sound, or
  // the browser's own playback in a voice-only call.
  const toggleVoice = useCallback(() => {
    const muted = !voiceMutedRef.current;
    voiceMutedRef.current = muted;
    setVoiceMuted(muted);
    voiceSinkRef.current?.setMuted(muted);
  }, []);

  // liveCaptions: on/off, remembered in this browser.
  const toggleCaptions = useCallback(() => {
    setCaptionsOn((on) => {
      try {
        localStorage.setItem(CAPTIONS_KEY, on ? 'off' : 'on');
      } catch {
        // storage blocked: the choice lasts for this page only
      }
      return !on;
    });
  }, []);

  useEffect(() => {
    if (provider !== 'anam') return;
    const video = document.getElementById('enara-anam-video') as HTMLVideoElement | null;
    if (video) video.muted = voiceMuted;
  }, [provider, voiceMuted]);

  useEffect(() => {
    if (isOpen) {
      // Wait for the student to pick English/Arabic first -- Anam's STT/voice
      // language can't be auto-detected and is fixed once the session opens.
      if (languageChoice) {
        void start(languageChoice === 'auto' ? undefined : languageChoice);
      }
    } else {
      closingRef.current = true;
      stopPolling();
      void stopAnam();
      void endServerSession();
      resetUi();
    }

    return () => {
      closingRef.current = true;
      stopPolling();
      void stopAnam();
      void endServerSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, languageChoice]);

  // Anam has no server-side "end this session" API — the only way to stop billing
  // is the browser actually disconnecting. Without this, closing the tab/navigating
  // away while connected leaves the Anam session running (and billing) indefinitely.
  useEffect(() => {
    if (!isOpen) return;

    const forceDisconnect = () => {
      const client = anamClientRef.current;
      if (client) {
        try {
          client.stopStreaming();
        } catch {
          // best effort — page is unloading
        }
      }
      // Tell the server the call ended, so its usage is metered from this end.
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sessionIdRef.current = null;
        void avatarFetch(`/session/${sessionId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      }
    };

    window.addEventListener('pagehide', forceDisconnect);
    window.addEventListener('beforeunload', forceDisconnect);
    return () => {
      window.removeEventListener('pagehide', forceDisconnect);
      window.removeEventListener('beforeunload', forceDisconnect);
    };
  }, [isOpen]);

  // Students pick their own tutor face before the call (the voice follows it).
  // The first time, the choice opens by itself; they can skip it.
  useEffect(() => {
    if (!isOpen || !isStudent) return;
    let cancelled = false;
    fetchMyTutorFace()
      .then(t => {
        if (cancelled) return;
        setMyTutor(t);
        if (!t.chosen && t.options.length > 1) setTutorPickerOpen(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, isStudent]);

  const pickTutor = async (face: TutorFaceChoice | null) => {
    setTutorSaving(face?.id || 'school');
    try {
      await setMyTutorFace(face ? face.id : null);
      setMyTutor(await fetchMyTutorFace());
      setTutorPickerOpen(false);
    } catch (err) {
      toast.error('Could not save your tutor', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setTutorSaving(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    {tutorPickerOpen && myTutor && (
      <FaceGallery
        title="Choose your tutor"
        subtitle="Pick the face you'd like to learn with. The voice matches the face."
        faces={myTutor.options}
        selectedIds={myTutor.chosen && myTutor.current ? [myTutor.current.avatarId] : []}
        busyId={tutorSaving}
        onPick={pickTutor}
        onClose={() => setTutorPickerOpen(false)}
        extraAction={{
          label: myTutor.chosen ? "Use my school's tutor" : 'Skip for now',
          onClick: () => (myTutor.chosen ? void pickTutor(null) : setTutorPickerOpen(false)),
        }}
      />
    )}
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-7xl h-[90vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-white font-bold text-sm">Enara AI Tutor</p>
            <p className="text-slate-400 text-xs">
              {lessonTitle}
              {/* liveMute: never "Listening…" while the learner's microphone is off. */}
              {features.mute && micMuted && status === 'Listening…' ? ' · Microphone off · الميكروفون مُغلَق' : status ? ` · ${status}` : ''}
            </p>
          </div>
          <button
            onClick={() => void handleClose()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Call controls, each behind its own switch (video or voice-only call; the backup video has its own) */}
        {(features.mute || features.captions) && (provider === 'anam' || provider === 'voice') && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-white/10 shrink-0" role="group" aria-label="Call controls · أدوات المكالمة">
            {features.mute && (<>
            <button
              type="button"
              data-testid="live-mic-toggle"
              data-state={micMuted ? 'off' : 'on'}
              onClick={toggleMic}
              aria-label={micMuted
                ? 'Microphone off: the tutor cannot hear you. Turn it on · الميكروفون مُغلَق: لا يسمعك المعلّم. شغِّله'
                : 'Microphone on: the tutor can hear you. Turn it off · الميكروفون يعمل: يسمعك المعلّم. أغلِقه'}
              className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
                micMuted ? 'bg-rose-600 text-white hover:bg-rose-500' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {micMuted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              <span>{micMuted ? 'Microphone off' : 'Microphone on'}</span>
              <span lang="ar" dir="rtl">{micMuted ? 'الميكروفون مُغلَق' : 'الميكروفون يعمل'}</span>
            </button>
            <button
              type="button"
              data-testid="live-voice-toggle"
              data-state={voiceMuted ? 'off' : 'on'}
              onClick={toggleVoice}
              aria-label={voiceMuted
                ? 'Tutor voice off: you cannot hear the tutor. Turn it on · صوت المعلّم مكتوم: لا تسمع المعلّم. شغِّله'
                : 'Tutor voice on: you can hear the tutor. Turn it off · صوت المعلّم يعمل: تسمع المعلّم. اكتمه'}
              className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
                voiceMuted ? 'bg-rose-600 text-white hover:bg-rose-500' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {voiceMuted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
              <span>{voiceMuted ? 'Tutor voice off' : 'Tutor voice on'}</span>
              <span lang="ar" dir="rtl">{voiceMuted ? 'صوت المعلّم مكتوم' : 'صوت المعلّم يعمل'}</span>
            </button>
            </>)}
            {features.captions && (
              <button
                type="button"
                data-testid="live-captions-toggle"
                data-state={captionsOn ? 'on' : 'off'}
                onClick={toggleCaptions}
                aria-label={captionsOn
                  ? 'Captions on: the tutor’s words and yours are written on the screen. Turn them off · التسميات التوضيحية مُفعَّلة: تُكتب كلمات المعلّم وكلماتك على الشاشة. أوقِفها'
                  : 'Captions off. Turn them on to see the tutor’s words and yours written on the screen · التسميات التوضيحية مُتوقِّفة. فعِّلها لترى كلمات المعلّم وكلماتك مكتوبةً على الشاشة'}
                className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
                  captionsOn ? 'bg-teal-600 text-white hover:bg-teal-500' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {captionsOn ? <Captions size={16} aria-hidden="true" /> : <CaptionsOff size={16} aria-hidden="true" />}
                <span>{captionsOn ? 'Captions on' : 'Captions off'}</span>
                <span lang="ar" dir="rtl">{captionsOn ? 'التسميات التوضيحية مُفعَّلة' : 'التسميات التوضيحية مُتوقِّفة'}</span>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 relative bg-black flex flex-col lg:flex-row overflow-hidden">

          {!languageChoice && !loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white z-20 bg-black">
              {myTutor && (
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  {myTutor.current?.imageUrl ? (
                    <img src={myTutor.current.imageUrl} alt="" className="w-14 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-14 h-16 rounded-lg bg-white/10" aria-hidden="true" />
                  )}
                  <div className="text-left">
                    <p className="text-xs text-slate-400 m-0">Your tutor</p>
                    <p className="font-bold m-0">{myTutor.current?.name || "Your school's tutor"}</p>
                  </div>
                  {myTutor.options.length > 1 && (
                    <button
                      onClick={() => setTutorPickerOpen(true)}
                      className="ml-2 px-3 h-9 rounded-md border border-white/20 text-sm font-semibold hover:bg-white/10"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}
              {/* No language choice: the tutor follows whichever language the
                  student speaks. The click also lets the browser play sound. */}
              <button
                onClick={() => {
                  unlockAudio();
                  // The mic probe runs before the call (and its SDKs) start.
                  void mic.check().then((status) => { if (status === 'ok') setLanguageChoice('auto'); });
                }}
                className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white text-base font-bold rounded-xl transition-all"
              >
                Start call
              </button>
              <p className="text-sm text-slate-400 m-0">
                Speak English or Arabic. <span dir="rtl">تكلم عربي أو إنجليزي</span>
              </p>
              {mic.problem && (
                <div className="max-w-md w-full px-4">
                  <MicProblemNotice problem={mic.problem} feature="avatar" arabic tone="dark" target={newTabTarget} />
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white z-20 bg-black/60">
              <Loader2 size={32} className="animate-spin text-teal-400" />
              <p className="text-sm text-slate-400">{status || 'Starting session...'}</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white z-30 bg-black">
              <AlertCircle size={32} className="text-rose-400" />
              {mic.problem ? (
                <div className="max-w-md w-full px-4">
                  <MicProblemNotice problem={mic.problem} feature="avatar" arabic tone="dark" target={newTabTarget} />
                </div>
              ) : (
                <p className="text-sm text-slate-400">{error}</p>
              )}
              <button
                disabled={loading || Date.now() < retryWaitUntil}
                onClick={() => {
                  const until = Date.now() + 5000;
                  setRetryWaitUntil(until);
                  setTimeout(() => setRetryTick((n) => n + 1), 5000);
                  // A mic problem: probe again first; the call starts only once the mic works.
                  void mic.check().then((status) => {
                    if (status === 'ok') void start(languageChoice && languageChoice !== 'auto' ? languageChoice : undefined);
                  });
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all"
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          )}

          <div
            ref={videoFrameRef}
            data-testid="live-avatar-frame"
            className={`relative transition-all duration-500 shrink-0 ${
              artifactHtml ? 'h-[38%] lg:h-full w-full lg:w-[34%]' : 'h-full w-full'
            }`}
          >
            {/* liveRolePlay: the scene card, in a corner of the tutor's video (never over the Visual Aid; collapsed on a phone). */}
            <RolePlaySceneCard card={scene} defaultLang={languageChoice === 'arabic' ? 'ar' : 'en'} />
            {provider === 'voice' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900 text-center px-6">
                {myTutor?.current?.imageUrl ? (
                  <img src={myTutor.current.imageUrl} alt="" className="w-28 h-28 rounded-full object-cover border border-teal-400/40" />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-teal-600/20 border border-teal-400/40 grid place-items-center">
                    <EnaraMark className="w-12 h-12 text-teal-300" />
                  </div>
                )}
                <p className="text-white font-bold">{myTutor?.current?.name || 'Enara tutor'} · voice</p>
                <p className="text-slate-300 text-sm max-w-xs">
                  The video avatar can't connect right now, so your tutor is talking without a face. Everything else works as usual.
                </p>
              </div>
            )}

            {provider === 'anam' && (
              <video
                id="enara-anam-video"
                autoPlay
                playsInline
                className="w-full h-full object-cover object-[center_25%] bg-black"
              />
            )}


            {/* liveCaptions: the last few lines, inside the tutor's pane (never over the visual aid), in the call's language. */}
            {features.captions && captionsOn && (provider === 'anam' || provider === 'voice') && (() => {
              const lead = [...captions].reverse().find((l) => l.who === 'tutor') ?? captions[captions.length - 1];
              const arabic = !!lead && languageOfText(lead.text) === 'arabic';
              return (
                <div
                  data-testid="live-captions"
                  role="log"
                  aria-live="polite"
                  aria-label={arabic ? 'التسميات التوضيحية' : 'Captions'}
                  dir={arabic ? 'rtl' : 'ltr'}
                  lang={arabic ? 'ar' : 'en'}
                  className="absolute inset-x-2 bottom-2 sm:inset-x-6 sm:bottom-4 z-10 max-h-[60%] overflow-hidden flex flex-col justify-end gap-1 rounded-xl bg-black/75 px-3 py-2 text-white text-sm sm:text-base leading-snug pointer-events-none"
                >
                  {captions.length === 0 ? (
                    <p className="m-0 text-xs text-slate-300">Captions will appear here · <span lang="ar" dir="rtl">ستظهر التسميات التوضيحية هنا</span></p>
                  ) : (
                    captions.map((line) => (
                      <p key={line.id} data-testid="live-caption-line" data-who={line.who} className="m-0">
                        <span className={`font-bold ${line.who === 'tutor' ? 'text-teal-300' : 'text-amber-200'}`}>
                          {line.who === 'tutor' ? (arabic ? 'المعلّم' : 'Tutor') : arabic ? 'أنت' : 'You'}
                          {': '}
                        </span>
                        <span dir="auto" data-testid="live-caption-text">
                          {line.text.length > CAPTION_CHARS ? `…${line.text.slice(-CAPTION_CHARS).replace(/^\S*\s/, '')}` : line.text}
                        </span>
                      </p>
                    ))
                  )}
                </div>
              );
            })()}

            {provider === 'tavus' && tavusUrl && (
              <iframe
                src={tavusUrl}
                allow="camera; microphone; autoplay; display-capture"
                className="w-full h-full border-0"
                title="Enara AI Tutor"
              />
            )}
          </div>

          {/* Visual artifact panel */}
          {artifactHtml && (
            <div className="flex-1 min-h-0 min-w-0 bg-white transition-all duration-500 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
                <p className="text-slate-700 font-semibold text-sm">Visual Aid</p>
                <button
                  onClick={() => setArtifactHtml(null)}
                  aria-label="Close visual aid"
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <iframe
                  srcDoc={artifactHtml}
                  className="w-full h-full border-0"
                  sandbox=""
                  title="Visual Aid"
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
};
