import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { recordAiCall } from './aiCalls';
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
  recordAiCall({ feature: 'tts', provider: 'elevenlabs', modelName: el.config.ttsModel, status: 'ok', startedAt, characters: text.length });
  return meteredSpeech({ feature: 'tts', modelName: el.config.ttsModel, maxAttempts: 2 }, text.length, () =>
    el.client.textToSpeech.stream(voiceId, {
      text,
      modelId: el.config.ttsModel,
      outputFormat: 'pcm_16000',
      languageCode: language === 'arabic' ? 'ar' : 'en',
    }),
  );
}
