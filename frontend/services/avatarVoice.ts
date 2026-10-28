import { CommitStrategy, RealtimeEvents, Scribe, type RealtimeConnection } from '@elevenlabs/client';
import { avatarFetch } from './apiService';

import { isEcho, languageOfText, toVoiceLanguage, voiceWords as words, type VoiceLanguage } from './voiceText';

export { SentenceSplitter } from './sentenceSplitter';
export { languageOfText, type VoiceLanguage } from './voiceText';

// ElevenLabs voice for the live avatar (used when the backend reports
// speech: 'elevenlabs'). The microphone streams straight to ElevenLabs
// real-time transcription, which ends each sentence on silence and detects its
// language; the tutor's reply is spoken by ElevenLabs as 16 kHz PCM, paced to
// real time into Anam, which only lip-syncs. The student can talk over the
// avatar to interrupt it.

// Minimal shape of Anam's AgentAudioInputStream.
export interface AudioSink {
  sendAudioChunk(chunk: Uint8Array): void;
  endSequence(): void;
}

export interface VoiceCallbacks {
  onUtterance(text: string, language: VoiceLanguage): void;
  // Live text while the student is still talking.
  onHearing?(text: string): void;
  // The student talked over the avatar: stop its current speech.
  onInterrupt?(): void;
  onError(message: string): void;
}

const PCM_BYTES_PER_SECOND = 16000 * 2;
// Anam plays passthrough audio quietly; lift ElevenLabs' level (about -21 dBFS RMS).
const OUTPUT_GAIN = 2.2;

function amplify(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const view = new DataView(out.buffer);
  for (let i = 0; i < pcm.length; i += 2) {
    const v = Math.round(input.getInt16(i, true) * OUTPUT_GAIN);
    view.setInt16(i, Math.max(-32768, Math.min(32767, v)), true);
  }
  return out;
}

export class AvatarVoice {
  private connection: RealtimeConnection | null = null;
  private rotating = false;
  private stopped = false;
  private playback: Promise<void> = Promise.resolve();
  // Bumped on interrupt: queued and playing audio from older turns is dropped.
  private generation = 0;
  private spokenText = '';
  // The avatar's recent words, and until when they may still echo back: Anam
  // plays audio a second or two after we send it, and the room carries it.
  private recentSpoken: string[] = [];
  private echoUntil = 0;

  constructor(
    private readonly sessionId: string,
    private readonly sink: AudioSink,
    private readonly callbacks: VoiceCallbacks,
  ) {}

  get isSpeaking(): boolean {
    return this.spokenText.length > 0;
  }

  private isOwnEcho(text: string): boolean {
    if (!this.isSpeaking && performance.now() > this.echoUntil) return false;
    return isEcho(text, [...this.recentSpoken, this.spokenText].join(' '));
  }

  async startListening(): Promise<void> {
    if (this.stopped) return;
    const res = await avatarFetch(`/session/${this.sessionId}/stt-token`, { method: 'POST' });
    if (!res.ok) throw new Error(`Transcription token failed (${res.status})`);
    const { token, model_id } = await res.json();

    const connection = Scribe.connect({
      token,
      modelId: model_id,
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: 0.6,
      includeLanguageDetection: true,
      includeTimestamps: true,
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.connection = connection;

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (msg) => {
      const text = msg.text?.trim();
      if (text && !this.isOwnEcho(text)) this.callbacks.onHearing?.(text);
    });
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, (msg) => {
      const text = msg.text?.trim();
      if (!text) return;
      // The mic hears the avatar too; never answer its own words.
      if (this.isOwnEcho(text)) return;
      if (this.isSpeaking) {
        // Real speech over the avatar interrupts it; a stray word doesn't.
        if (words(text).length < 2) return;
        this.interrupt();
        this.callbacks.onInterrupt?.();
      }
      this.callbacks.onUtterance(text, toVoiceLanguage(msg.language_code, text));
      // A long transcription session leans on the language heard so far (real
      // English speech came back in Arabic letters after Arabic turns), so each
      // sentence gets a fresh one.
      void this.rotate();
    });
    connection.on(RealtimeEvents.AUTH_ERROR, () => this.callbacks.onError('Voice transcription was refused.'));
    connection.on(RealtimeEvents.QUOTA_EXCEEDED, () => this.callbacks.onError('The voice quota has run out.'));
    // Resolve once the session is live (or after 3 s), so a rotation only
    // closes the previous session when this one is already listening.
    const started = new Promise<void>((resolve) => {
      connection.on(RealtimeEvents.SESSION_STARTED, () => resolve());
      setTimeout(resolve, 3000);
    });
    connection.on(RealtimeEvents.CLOSE, () => {
      if (this.connection !== connection) return;
      this.connection = null;
      // Tokens and sessions are time-limited: reconnect while the call is open.
      if (!this.stopped) {
        setTimeout(
          () => void this.startListening().catch(() => this.callbacks.onError('Voice transcription stopped.')),
          500,
        );
      }
    });
    await started;
  }

  // Opens the next transcription session before closing this one, so nothing
  // said in between is lost.
  private async rotate(): Promise<void> {
    if (this.stopped || this.rotating) return;
    this.rotating = true;
    const old = this.connection;
    try {
      await this.startListening();
      try {
        old?.close();
      } catch {
        // already closed
      }
    } catch {
      // Keep the current session if a new one can't open.
      if (old && !this.connection) this.connection = old;
    } finally {
      this.rotating = false;
    }
  }

  // Queues one sentence: its audio is fetched right away and played after the
  // sentences before it, so speech starts before the whole reply exists.
  // The voice follows the sentence's own script (Arabic letters -> Arabic).
  say(text: string): void {
    const clean = text.trim();
    if (!clean || this.stopped) return;
    const generation = this.generation;
    this.spokenText += ` ${clean}`;
    const audio = avatarFetch('/speak', {
      method: 'POST',
      body: { session_id: this.sessionId, text: clean, language: languageOfText(clean) },
    });
    this.playback = this.playback.then(() => this.play(audio, generation)).catch(() => {});
  }

  // Resolves once everything queued has been spoken; then ends Anam's turn.
  async finishTurn(): Promise<void> {
    const generation = this.generation;
    await this.playback;
    if (this.stopped || generation !== this.generation) return;
    try {
      this.sink.endSequence();
    } catch {
      // session may have ended
    }
    this.rememberSpoken();
  }

  interrupt(): void {
    this.generation += 1;
    this.playback = Promise.resolve();
    this.rememberSpoken();
    try {
      this.sink.endSequence();
    } catch {
      // best effort
    }
  }

  private rememberSpoken(): void {
    if (this.spokenText.trim()) this.recentSpoken = [...this.recentSpoken, this.spokenText].slice(-2);
    this.spokenText = '';
    this.echoUntil = performance.now() + 6000;
  }

  private async play(audio: Promise<Response>, generation: number): Promise<void> {
    const res = await audio;
    if (!res.ok || !res.body || this.stopped || generation !== this.generation) return;

    // ElevenLabs returns audio faster than real time; sending it to Anam in one
    // burst desyncs the lip-sync, so chunks go out at the PCM's own playback rate.
    const reader = res.body.getReader();
    const started = performance.now();
    let sent = 0;
    let carry: Uint8Array | null = null;
    while (!this.stopped && generation === this.generation) {
      const { done, value } = await reader.read();
      if (done) break;
      let chunk = value;
      if (carry) {
        chunk = new Uint8Array(carry.length + value.length);
        chunk.set(carry);
        chunk.set(value, carry.length);
        carry = null;
      }
      // Keep 16-bit samples whole across network chunks.
      if (chunk.length % 2) {
        carry = chunk.slice(-1);
        chunk = chunk.slice(0, -1);
      }
      if (!chunk.length) continue;
      const wait = (sent / PCM_BYTES_PER_SECOND) * 1000 - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (generation !== this.generation) break;
      try {
        this.sink.sendAudioChunk(amplify(chunk));
      } catch {
        return;
      }
      sent += chunk.length;
    }
    if (generation !== this.generation) void reader.cancel().catch(() => {});
  }

  stop(): void {
    this.stopped = true;
    this.generation += 1;
    const connection = this.connection;
    this.connection = null;
    try {
      connection?.close();
    } catch {
      // best effort
    }
  }
}
