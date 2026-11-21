// avatarSpeaking (NEXT_PLAN item 5, owner go 21 Nov 2026): speaking and pronunciation practice through the live avatar. The learner speaks
// (Anam's built-in speech-to-text and voice, see avatarSpeakingUsesAnamVoice); the tutor answers and gives short feedback on the target form; for an adult learner, a short
// clip of the sentence can be scored for pronunciation (Azure, pronunciation.ts) and the next reply gives one tip. Audio is never stored:
// scored, then dropped; only the two-word focus and a one-line summary are kept on the call (deleted with it). Minors: no pronunciation
// clips until the legal review and parent consent; their spoken tutor works as before.
import { engineV2 } from './engineV2';
import { pronunciationStatus } from './pronunciation';

export const avatarSpeakingOn = (): boolean => engineV2('avatarSpeaking');
/** With avatarSpeaking on, the live avatar listens and speaks with Anam's built-in speech-to-text and voice (owner, 21 Nov 2026), even when
 *  an ElevenLabs key is set. Audio is never stored either way. */
export const avatarSpeakingUsesAnamVoice = (): boolean => avatarSpeakingOn();
export const MAX_CLIP_BYTES = 16000 * 2 * 15 + 44;   // 15 s of 16 kHz mono 16-bit WAV
export const LATENCY_KEEP = 50;
/** Pronunciation clips only for a learner known to be 18 or older (no minors before consent). */
export function pronunciationAllowed(ageYears: number | undefined): boolean {
  return typeof ageYears === 'number' && ageYears >= 18;
}
export function pronunciationReady(ageYears: number | undefined): { ok: boolean; reason?: 'switch_off' | 'minor_or_unknown_age' | 'provider_unavailable' } {
  if (!avatarSpeakingOn()) return { ok: false, reason: 'switch_off' };
  if (!pronunciationAllowed(ageYears)) return { ok: false, reason: 'minor_or_unknown_age' };
  if (!pronunciationStatus().enabled) return { ok: false, reason: 'provider_unavailable' };
  return { ok: true };
}
export const SPEAKING_PRACTICE_LINE = 'SPEAKING PRACTICE (live avatar): they are speaking, not typing. Reply in at most 3 short spoken sentences: (1) respond to what they said; (2) one short feedback line on today\'s target form only (say it is right, or say the right form once, no grammar terms); (3) ONE spoken task: ask them to say one short sentence that uses the target form. Spelling and punctuation in their transcript do not count.';
export const PRONUNCIATION_NOTE_LINE = (summary: string, words: string[]) => `Pronunciation of their last sentence: ${summary.replace(/["<>]/g, '')} If it names a word, add ONE short friendly tip on that word${words.length ? ` (${words.map((w) => `"${w.replace(/["<>]/g, '')}"`).join(', ')})` : ''} after your feedback line; never give a score.`;
/** Median and 90th percentile of the kept latencies (ms), for the live check and the report. */
export function latencyStats(ms: number[]): { n: number; p50?: number; p90?: number } {
  const v = ms.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p: number) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, p50: q(0.5), p90: q(0.9) };
}
/** A 16 kHz mono 16-bit PCM WAV clip of at most 15 s (the browser recorder's format). */
export function isWavClip(b: Buffer): boolean {
  if (b.length < 44 || b.length > MAX_CLIP_BYTES) return false;
  return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' && b.readUInt16LE(22) === 1 && b.readUInt32LE(24) === 16000 && b.readUInt16LE(34) === 16;
}
