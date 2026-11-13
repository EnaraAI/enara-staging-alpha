import { getConfig } from '../config/env';
import { unitPriceUsd } from './priceCatalog';
import { logger } from '../utils/logging';

// r4.4 #4: provider-neutral pronunciation assessment. OFF by default.
// It runs only when PRONUNCIATION_ASSESSMENT_ENABLED=true, a provider key and region are configured,
// AND the price catalogue has an entry for the provider (no unpriced paid traffic). Supplier choice,
// data agreement and audio consent are owner decisions; this is the integration only. Adding the
// provider to the AI-call log (a schema enum) is part of switching it on, not done here.

export interface PhonemeScore { phoneme: string; accuracy: number }
export interface WordScore { word: string; accuracy: number; errorType: string; phonemes: PhonemeScore[] }
export interface PronunciationResult { provider: string; recognizedText: string; accuracy: number; fluency: number; completeness: number; pronunciation: number; words: WordScore[] }
export interface PronunciationScorer {
  readonly provider: string;
  score(input: { audio: Buffer; contentType: string; referenceText: string; locale: string }): Promise<PronunciationResult>;
}

export class PronunciationDisabledError extends Error { constructor(reason: string) { super(`pronunciation assessment disabled: ${reason}`); this.name = 'PronunciationDisabledError'; } }

export function pronunciationStatus(): { enabled: boolean; reason?: string } {
  const c = getConfig();
  if (!c.pronunciationAssessmentEnabled) return { enabled: false, reason: 'flag off' };
  if (!c.azureSpeechKey || !c.azureSpeechRegion) return { enabled: false, reason: 'provider not configured' };
  // the catalogue has no entry for this provider until the contracted price is added
  if (unitPriceUsd('azure-speech' as never, 'pronunciation-assessment', 'audio_second' as never) === undefined) return { enabled: false, reason: 'no price entry for the provider (add the contracted price first)' };
  return { enabled: true };
}

// Azure Speech short-audio REST with the Pronunciation-Assessment header (WAV/PCM 16 kHz mono, up to 60 s).
export class AzurePronunciationScorer implements PronunciationScorer {
  readonly provider = 'azure-speech';
  constructor(private key: string, private region: string, private fetchImpl: typeof fetch = fetch) {}
  async score({ audio, contentType, referenceText, locale }: { audio: Buffer; contentType: string; referenceText: string; locale: string }): Promise<PronunciationResult> {
    const params = { ReferenceText: referenceText.slice(0, 500), GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive' };
    const url = `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': this.key, 'Content-Type': contentType, 'Pronunciation-Assessment': Buffer.from(JSON.stringify(params)).toString('base64'), Accept: 'application/json' },
      body: audio,
    });
    if (!res.ok) throw Object.assign(new Error(`pronunciation provider error ${res.status}`), { status: res.status });
    type Ph = { Phoneme: string; AccuracyScore?: number; PronunciationAssessment?: { AccuracyScore?: number } };
    type Wd = { Word: string; AccuracyScore?: number; ErrorType?: string; PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string }; Phonemes?: Ph[] };
    const j = (await res.json()) as { RecognitionStatus?: string; NBest?: { Display?: string; AccuracyScore?: number; FluencyScore?: number; CompletenessScore?: number; PronScore?: number; PronunciationAssessment?: Record<string, number>; Words?: Wd[] }[] };
    const best = j.NBest?.[0];
    if (j.RecognitionStatus !== 'Success' || !best) throw Object.assign(new Error(`no speech recognised (${j.RecognitionStatus ?? 'unknown'})`), { status: 422 });
    const pa = best.PronunciationAssessment ?? {};
    const n = (x?: number) => (typeof x === 'number' ? x : 0);
    return {
      provider: this.provider,
      recognizedText: best.Display ?? '',
      accuracy: n(pa.AccuracyScore ?? best.AccuracyScore), fluency: n(pa.FluencyScore ?? best.FluencyScore), completeness: n(pa.CompletenessScore ?? best.CompletenessScore), pronunciation: n(pa.PronScore ?? best.PronScore),
      words: (best.Words ?? []).map((w) => ({
        word: w.Word, accuracy: n(w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore), errorType: w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? 'None',
        phonemes: (w.Phonemes ?? []).map((p) => ({ phoneme: p.Phoneme, accuracy: n(p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore) })),
      })),
    };
  }
}

// Learner-facing feedback: the two weakest words and their weakest sound, never a raw score dump.
export function feedbackFrom(r: PronunciationResult): { summary: string; focus: { word: string; sound?: string }[] } {
  const weak = r.words.filter((w) => w.errorType !== 'None' || w.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy).slice(0, 2);
  const focus = weak.map((w) => ({ word: w.word, sound: [...w.phonemes].sort((a, b) => a.accuracy - b.accuracy)[0]?.phoneme }));
  const summary = !weak.length ? 'Clear and easy to understand. Well done.' : `Clear overall. Practise: ${focus.map((f) => f.word + (f.sound ? ` (the "${f.sound}" sound)` : '')).join(' and ')}.`;
  return { summary, focus };
}

export async function assessPronunciation(input: { audio: Buffer; contentType: string; referenceText: string; locale?: string }, scorer?: PronunciationScorer) {
  const st = pronunciationStatus();
  if (!scorer && !st.enabled) throw new PronunciationDisabledError(st.reason ?? 'disabled');
  const c = getConfig();
  const s = scorer ?? new AzurePronunciationScorer(c.azureSpeechKey!, c.azureSpeechRegion!);
  const started = Date.now();
  try {
    const result = await s.score({ ...input, locale: input.locale ?? 'en-US' });
    logger.info('pronunciation_assessed', { provider: s.provider, ms: Date.now() - started, audioBytes: input.audio.length });
    return { result, feedback: feedbackFrom(result) };
  } catch (error) {
    logger.warn('pronunciation_failed', { provider: s.provider, ms: Date.now() - started, status: (error as { status?: number }).status ?? null });
    throw error;
  }
}
