import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import { Assessment } from '../../types';
import {
  avatarFetch,
  fetchMyTutorFace,
  setMyTutorFace,
  type TutorFace,
  type TutorFaceChoice,
} from '../../services/apiService';
import { toast } from '../../services/toastService';
import { FaceGallery } from './FaceGallery';
import { AvatarVoice, SentenceSplitter, type VoiceLanguage } from '../../services/avatarVoice';
import { WebAudioSink } from '../../services/webAudioSink';

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
}

// 'voice': the video avatar couldn't connect, so the tutor talks without a face.
type AvatarProvider = 'anam' | 'tavus' | 'voice';

type AvatarSessionResponse = {
  session_id: string;
  provider: AvatarProvider;
  session_token?: string;
  conversation_url?: string;
  fallback_reason?: string | null;
  // 'elevenlabs': ElevenLabs listens and speaks, Anam is only the face.
  speech?: 'anam' | 'elevenlabs';
};

const MIC_PERMISSION_DENIED_REASON = 'CONNECTION_CLOSED_CODE_MICROPHONE_PERMISSION_DENIED';

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
}) => {
  const [provider, setProvider] = useState<AvatarProvider | null>(null);
  const [tavusUrl, setTavusUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifactHtml, setArtifactHtml] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // Anam's STT/voice language is fixed for the whole session and there's no
  // auto-detect from a cold start, so we ask up front instead of requiring
  // the student to say "speak Arabic" in English first.
  // 'auto': the server picks the opening language (the student's last call's).
  const [languageChoice, setLanguageChoice] = useState<'english' | 'arabic' | 'auto' | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const anamClientRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closingRef = useRef(false);
  const fallbackStartedRef = useRef(false);
  const answeringRef = useRef(false);
  const lastUserMessageRef = useRef<string>('');
  const anamLanguageRef = useRef<'english' | 'arabic'>('english');
  const switchingLanguageRef = useRef(false);
  // Always points at the latest switchAnamLanguage closure so
  // streamEnaraAnswerToAnam (defined earlier) can call it without being
  // re-created every time switchAnamLanguage's own deps change.
  const switchAnamLanguageRef = useRef<(target: string) => Promise<void>>(async () => {});
  // Restarts the call after a dropped connection; set once `start` exists.
  const restartRef = useRef<() => Promise<void>>(async () => {});
  const reconnectsRef = useRef<number[]>([]);
  const speechModeRef = useRef<'anam' | 'elevenlabs'>('anam');
  const voiceRef = useRef<AvatarVoice | null>(null);
  const voiceHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const voiceTurnRef = useRef(0);
  const [myTutor, setMyTutor] = useState<{ current: TutorFace | null; chosen: boolean; options: TutorFaceChoice[] } | null>(null);
  const [tutorPickerOpen, setTutorPickerOpen] = useState(false);
  const [tutorSaving, setTutorSaving] = useState<string | null>(null);
  const anamReadyRef = useRef(false);
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
    setProvider(null);
    setTavusUrl(null);
    setArtifactHtml(null);
    setError(null);
    setStatus('');
    fallbackStartedRef.current = false;
    answeringRef.current = false;
    lastUserMessageRef.current = '';
    anamLanguageRef.current = 'english';
    switchingLanguageRef.current = false;
    setLanguageChoice(null);
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

      const handleLine = (trimmed: string) => {
        if (!trimmed) return;
        const data = JSON.parse(trimmed);
        if (data.visual === 'drawing') setArtifactHtml(DRAWING_PLACEHOLDER);
        if (data.content && talkStream?.isActive()) {
          talkStream.streamMessageChunk(data.content, false);
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

      if (talkStream?.isActive()) talkStream.endMessage();
    } catch (e) {
      console.error('[AVATAR] ENARA answer streaming failed', e);
      try {
        if (talkStream?.isActive()) talkStream.endMessage();
        await client.talk('Sorry, I had trouble answering that. Please try again.');
      } catch {
        // If Anam itself is broken, the connection handler will trigger fallback.
      }
    } finally {
      answeringRef.current = false;
      if (pendingLanguageSwitch) {
        void switchAnamLanguageRef.current(pendingLanguageSwitch);
      }
    }
  }, []);

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
    setStatus(kind !== 'turn' ? 'Speaking…' : language === 'arabic' ? 'Thinking… (Arabic)' : 'Thinking… (English)');

    const messages =
      kind === 'turn' && text
        ? [...voiceHistoryRef.current, { role: 'user' as const, content: text }]
        : [...voiceHistoryRef.current];
    const splitter = new SentenceSplitter();
    let reply = '';
    try {
      const res = await avatarFetch('/query-stream', {
        method: 'POST',
        body: { session_id: sessionId, messages, language, kind },
      });
      if (!res.ok || !res.body) throw new Error(`ENARA query failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.visual === 'drawing') setArtifactHtml(DRAWING_PLACEHOLDER);
        if (data.content) {
          reply += data.content;
          for (const sentence of splitter.push(data.content)) voice.say(sentence);
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
      for (const sentence of splitter.flush()) voice.say(sentence);
      if (reply) voiceHistoryRef.current = [...messages, { role: 'assistant' as const, content: reply }].slice(-12);
      await voice.finishTurn();
      // Ended on a question: if the student stays quiet, help them along.
      if (current() && /[?؟]\s*$/.test(reply) && nudgesRef.current < 2) {
        silenceTimerRef.current = setTimeout(() => {
          if (!current()) return;
          nudgesRef.current += 1;
          void answerSpokenTurnRef.current(null, undefined, 'nudge');
        }, 12_000);
      }
    } catch (e) {
      console.error('[AVATAR] Spoken answer failed', e);
      if (!current()) return;
      if (kind !== 'turn') return;
      voice.say(language === 'arabic' ? 'آسف، حصلت مشكلة. ممكن تسأل تاني؟' : 'Sorry, I had trouble answering that. Please try again.');
      await voice.finishTurn();
    } finally {
      if (current()) setStatus('Listening…');
    }
  }, [clearSilenceTimer]);

  useEffect(() => {
    answerSpokenTurnRef.current = answerSpokenTurn;
  }, [answerSpokenTurn]);

  // ElevenLabs listening and speaking, into either Anam (lip-sync) or the browser.
  const startVoice = useCallback((sink: import('../../services/avatarVoice').AudioSink, interrupt: () => void) => {
    if (!sessionIdRef.current) return;
    const voice = new AvatarVoice(sessionIdRef.current, sink, {
      onUtterance: (text, language) => void answerSpokenTurn(text, language),
      // The student is talking: no nudge.
      onHearing: () => clearSilenceTimer(),
      onInterrupt: interrupt,
      onError: (message) => setError(message),
    });
    voiceRef.current = voice;
    voice
      .startListening()
      .then(() => {
        setStatus('Listening…');
        // The tutor opens the call; a reconnect carries on instead.
        if (voiceHistoryRef.current.length === 0) void answerSpokenTurn(null, undefined, 'opening');
      })
      .catch((e) => {
        console.error('[AVATAR] Voice start failed', e);
        setError('Microphone permission is required for the live tutor.');
      });
  }, [answerSpokenTurn, clearSilenceTimer]);

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
    setProvider('voice');
    setLoading(false);
    setStatus('Voice only');
    startVoice(sink, () => sink.stopPlayback());
  }, [startVoice, stopAnam]);

  const startAnam = useCallback(async (sessionToken: string) => {
    anamReadyRef.current = false;
    const elevenlabs = speechModeRef.current === 'elevenlabs';
    // In ElevenLabs mode the microphone goes to ElevenLabs, not to Anam.
    const client = createClient(sessionToken, elevenlabs ? { disableInputAudio: true } : undefined);
    anamClientRef.current = client;

    client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
      setStatus('Connected');
    });

    client.addListener(AnamEvent.SESSION_READY, () => {
      setLoading(false);
      setStatus('Connected');
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

    client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
      answeringRef.current = false;
    });

    client.addListener(AnamEvent.CONNECTION_CLOSED, async (reason: unknown) => {
      console.warn('[AVATAR] Anam connection closed', reason);
      if (String(reason) === MIC_PERMISSION_DENIED_REASON) {
        setError('Microphone permission is required for the live tutor.');
        setLoading(false);
        return;
      }
      if (closingRef.current || anamClientRef.current !== client) return;
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

    await client.streamToVideoElement('enara-anam-video');
  }, [startVoice, startVoiceOnly, streamEnaraAnswerToAnam, switchToTavus]);

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
      console.error('[AVATAR] Anam language switch failed', e);
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
    if (!reconnect) setArtifactHtml(null);
    setTavusUrl(null);
    setProvider(null);
    setStatus(reconnect ? 'Reconnecting…' : 'Starting session…');

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
      speechModeRef.current = data.speech === 'elevenlabs' ? 'elevenlabs' : 'anam';
      // A reconnect continues the same conversation.
      if (!reconnect) {
        voiceHistoryRef.current = [];
        reconnectsRef.current = [];
      }
      startPolling(data.session_id);

      if (data.provider === 'anam' && data.session_token) {
        setProvider('anam');
        try {
          await startAnam(data.session_token);
        } catch (e) {
          console.error('[AVATAR] Anam startup failed', e);
          await switchToTavus('anam_client_start_failed');
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
  }, [courseId, lessonId, lessonTitle, startAnam, startPolling, subject, switchToTavus]);

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
              {status ? ` · ${status}` : ''}
            </p>
          </div>
          <button
            onClick={() => void handleClose()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

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
                onClick={() => { unlockAudio(); setLanguageChoice('auto'); }}
                className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white text-base font-bold rounded-xl transition-all"
              >
                Start call
              </button>
              <p className="text-sm text-slate-400 m-0">
                Speak English or Arabic. <span dir="rtl">تكلم عربي أو إنجليزي</span>
              </p>
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
              <p className="text-sm text-slate-400">{error}</p>
              <button
                onClick={() => void start(languageChoice && languageChoice !== 'auto' ? languageChoice : undefined)}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-xl transition-all"
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          )}

          <div
            className={`relative transition-all duration-500 shrink-0 ${
              artifactHtml ? 'h-[38%] lg:h-full w-full lg:w-[34%]' : 'h-full w-full'
            }`}
          >
            {provider === 'voice' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900 text-center px-6">
                {myTutor?.current?.imageUrl ? (
                  <img src={myTutor.current.imageUrl} alt="" className="w-28 h-28 rounded-full object-cover border border-teal-400/40" />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-teal-600/20 border border-teal-400/40 grid place-items-center">
                    <span className="text-4xl font-extrabold text-teal-300">E</span>
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
