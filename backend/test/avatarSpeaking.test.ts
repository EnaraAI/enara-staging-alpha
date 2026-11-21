import { afterEach, describe, expect, it } from 'vitest';
import { avatarSpeakingOn, avatarSpeakingUsesAnamVoice, isWavClip, latencyStats, MAX_CLIP_BYTES, PRONUNCIATION_NOTE_LINE, pronunciationAllowed, pronunciationReady, SPEAKING_PRACTICE_LINE } from '../src/services/avatarSpeaking';

// avatarSpeaking (NEXT_PLAN item 5, owner go 21 Nov 2026): speaking practice through the live avatar; pronunciation clips for adults only
// (no minors before the legal review and consent); audio never stored; latency kept for the p50 <= 1.5 s / p90 <= 2.5 s check.
const wavOf = (seconds: number, rate = 16000) => {
  const n = Math.round(seconds * rate); const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(n * 2, 40); return b;
};
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
// pronunciationStatus() reads the app config: the minimum test environment (no Azure key, so the provider is not ready).
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', MONGODB_URI: 'mongodb://127.0.0.1:1/none' });
delete process.env.AZURE_SPEECH_KEY;

describe('avatarSpeaking', () => {
  it('the avatar uses Anam built-in speech-to-text and voice when the switch is on (ElevenLabs not used); off: unchanged', () => {
    expect(avatarSpeakingUsesAnamVoice()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'avatarSpeaking';
    process.env.ELEVENLABS_API_KEY = 'x';
    expect(avatarSpeakingUsesAnamVoice()).toBe(true);
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('pronunciation clips: adults only; minors and unknown ages never (legal review first)', () => {
    expect(pronunciationAllowed(18)).toBe(true);
    expect(pronunciationAllowed(35)).toBe(true);
    for (const a of [17, 12, 7, undefined]) expect(pronunciationAllowed(a)).toBe(false);
  });

  it('ready says why not: switch off, minor, or provider not ready (no Azure key / flag / price in tests)', () => {
    expect(pronunciationReady(30)).toEqual({ ok: false, reason: 'switch_off' });
    process.env.ENARA_ENGINE_V2 = 'avatarSpeaking';
    expect(avatarSpeakingOn()).toBe(true);
    expect(pronunciationReady(15)).toEqual({ ok: false, reason: 'minor_or_unknown_age' });
    expect(pronunciationReady(30)).toEqual({ ok: false, reason: 'provider_unavailable' });
  });

  it('only a 16 kHz mono 16-bit WAV of at most 15 s is accepted', () => {
    expect(isWavClip(wavOf(3))).toBe(true);
    expect(isWavClip(wavOf(14.9))).toBe(true);
    expect(isWavClip(wavOf(16))).toBe(false);
    expect(isWavClip(wavOf(3, 44100))).toBe(false);
    expect(isWavClip(Buffer.from('not audio at all, just text padding to 44 bytes...'))).toBe(false);
    expect(MAX_CLIP_BYTES).toBe(16000 * 2 * 15 + 44);
  });

  it('latency p50 / p90 for the live check', () => {
    expect(latencyStats([])).toEqual({ n: 0 });
    const ms = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 2000, 3000];
    expect(latencyStats(ms)).toEqual({ n: 10, p50: 1200, p90: 2000 });
  });

  it('the practice line: one task, target-form feedback, spelling of the transcript not counted; the tip never gives a score', () => {
    expect(SPEAKING_PRACTICE_LINE).toMatch(/ONE spoken task/);
    expect(SPEAKING_PRACTICE_LINE).toMatch(/Spelling and punctuation in their transcript do not count/);
    const tip = PRONUNCIATION_NOTE_LINE('Clear overall. Practise: three (the "th" sound).', ['three']);
    expect(tip).toMatch(/"three"/);
    expect(tip).toMatch(/never give a score/);
  });
});
