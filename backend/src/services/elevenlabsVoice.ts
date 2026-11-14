import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { errorCodeOf, recordAiCall } from './aiCalls';
import { meteredCall, meteredSpeech } from './aiGateway';
import { getConfig } from '../config/env';
import type { AvatarLanguage } from './avatarLanguage';

// ElevenLabs speech for the live avatar. The browser transcribes the student
// directly with a single-use token; the tutor's replies are synthesised here as
// 16 kHz 16-bit mono PCM, the format Anam's audio passthrough lip-syncs to.

let client: ElevenLabsClient | undefined;

function getElevenLabs() {
  const config = getConfig().elevenlabs;
  if (!config) return undefined;
  // Retries happen in the gateway (metered), not in the SDK.
  client ??= new ElevenLabsClient({ apiKey: config.apiKey, timeoutInSeconds: 20, maxRetries: 0 });
  return { client, config };
}

export function isElevenLabsVoiceConfigured(): boolean {
  return Boolean(getConfig().elevenlabs);
}

// A configured voice can still be refused: a blocked free account, an
// exhausted quota or a revoked key. Calls then use the video tutor's own voice
// and listening instead. Checked with a two-character request at most every
// 10 minutes per server instance; a refusal during a call marks it down too.
const VOICE_CHECK_MS = 10 * 60_000;
let voiceState: { ok: boolean; at: number } | null = null;

export function isVoiceRefusal(error: unknown): boolean {
  const e = error as { statusCode?: unknown; status?: unknown };
  const status = typeof e?.statusCode === 'number' ? e.statusCode : typeof e?.status === 'number' ? e.status : undefined;
  return status === 401 || status === 402 || status === 403;
}

export function markVoiceRefused(): void {
  voiceState = { ok: false, at: Date.now() };
}

export function resetVoiceStateForTests(): void {
  voiceState = null;
}

// Whether calls should use ENARA's own voice pipeline right now.
export async function isElevenLabsVoiceUsable(): Promise<boolean> {
  const el = getElevenLabs();
  if (!el) return false;
  if (voiceState && Date.now() - voiceState.at < VOICE_CHECK_MS) return voiceState.ok;
  try {
    const audio = await meteredSpeech({ feature: 'tts', modelName: el.config.ttsModel }, 2, () =>
      el.client.textToSpeech.convert(el.config.voiceIdEn, { text: 'Hi', modelId: el.config.ttsModel, outputFormat: 'pcm_16000' }),
    );
    // Drain so the connection is released.
    for await (const _ of audio as unknown as AsyncIterable<unknown>) void _;
    voiceState = { ok: true, at: Date.now() };
  } catch (error) {
    // Only a refusal switches calls over; a passing network error does not.
    voiceState = { ok: !isVoiceRefusal(error), at: Date.now() };
  }
  return voiceState.ok;
}

export function elevenLabsSttModel(): string | undefined {
  return getConfig().elevenlabs?.sttModel;
}

// The browser streams audio straight to ElevenLabs with this token, so the
// server never sees STT usage. Each token is metered as one STT use with
// unknown usage (never as free).
export async function createTranscriptionToken(refs: { sessionId?: string } = {}): Promise<string> {
  const el = getElevenLabs();
  if (!el) throw new Error('ElevenLabs is not configured');
  const { token } = await meteredCall({ feature: 'stt', provider: 'elevenlabs', modelName: el.config.sttModel, refs }, () =>
    el.client.tokens.singleUse.create('realtime_scribe'),
  );
  return token;
}

export async function synthesizeSpeech(
  text: string,
  language: AvatarLanguage,
  gender?: 'woman' | 'man',
): Promise<ReadableStream<Uint8Array>> {
  const el = getElevenLabs();
  if (!el) throw new Error('ElevenLabs is not configured');
  const voiceId =
    gender === 'woman' ? el.config.femaleVoiceId : language === 'arabic' ? el.config.voiceIdAr : el.config.voiceIdEn;
  const startedAt = Date.now();
  let audio: ReadableStream<Uint8Array>;
  try {
    audio = await meteredSpeech({ feature: 'tts', modelName: el.config.ttsModel, maxAttempts: 2 }, text.length, () =>
      el.client.textToSpeech.stream(voiceId, {
        text,
        modelId: el.config.ttsModel,
        outputFormat: 'pcm_16000',
        languageCode: language === 'arabic' ? 'ar' : 'en',
      }),
    );
  } catch (error) {
    recordAiCall({ feature: 'tts', provider: 'elevenlabs', modelName: el.config.ttsModel, status: 'error', startedAt, errorCode: errorCodeOf(error) });
    if (isVoiceRefusal(error)) markVoiceRefused();
    throw error;
  }
  // Recorded once the audio starts: its latency is the time to the first audio.
  const firstTokenMs = Date.now() - startedAt;
  recordAiCall({ feature: 'tts', provider: 'elevenlabs', modelName: el.config.ttsModel, status: 'ok', startedAt, characters: text.length, firstTokenMs });
  return audio;
}

// Live check for the voice test endpoint: one two-character speech request and
// one transcription token, ignoring the 10-minute cache. Reports pass or fail
// and the provider's status code only, never the key or the audio.
export type VoiceCheck = {
  configured: boolean;
  tts: { ok: boolean; status?: number; ms?: number };
  stt: { ok: boolean; status?: number; ms?: number };
};

const statusOf = (error: unknown): number | undefined => {
  const e = error as { statusCode?: unknown; status?: unknown };
  return typeof e?.statusCode === 'number' ? e.statusCode : typeof e?.status === 'number' ? e.status : undefined;
};

export async function checkVoiceNow(): Promise<VoiceCheck> {
  const el = getElevenLabs();
  if (!el) return { configured: false, tts: { ok: false }, stt: { ok: false } };
  const out: VoiceCheck = { configured: true, tts: { ok: false }, stt: { ok: false } };
  let t = Date.now();
  try {
    const audio = await el.client.textToSpeech.convert(el.config.voiceIdEn, { text: 'Hi', modelId: el.config.ttsModel, outputFormat: 'pcm_16000' });
    for await (const _ of audio as unknown as AsyncIterable<unknown>) void _;
    out.tts = { ok: true, ms: Date.now() - t };
  } catch (error) {
    out.tts = { ok: false, status: statusOf(error), ms: Date.now() - t };
  }
  t = Date.now();
  try {
    await el.client.tokens.singleUse.create('realtime_scribe');
    out.stt = { ok: true, ms: Date.now() - t };
  } catch (error) {
    out.stt = { ok: false, status: statusOf(error), ms: Date.now() - t };
  }
  voiceState = { ok: out.tts.ok || !(out.tts.status && isVoiceRefusal({ statusCode: out.tts.status })), at: Date.now() };
  return out;
}
