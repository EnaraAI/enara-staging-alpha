import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AzurePronunciationScorer, assessPronunciation, feedbackFrom, pronunciationStatus, PronunciationDisabledError } from '../src/services/pronunciation';

// r4.4 #4 (rebuilt): provider-neutral pronunciation interface + Azure adapter, OFF by default.
// Synthetic audio and a mocked provider only; nothing here calls Azure.
const azureBody = { RecognitionStatus: 'Success', NBest: [{ Display: 'She goes to school.', PronunciationAssessment: { AccuracyScore: 82, FluencyScore: 90, CompletenessScore: 100, PronScore: 85 },
  Words: [
    { Word: 'she', PronunciationAssessment: { AccuracyScore: 95, ErrorType: 'None' }, Phonemes: [{ Phoneme: 'ʃ', PronunciationAssessment: { AccuracyScore: 95 } }] },
    { Word: 'goes', PronunciationAssessment: { AccuracyScore: 48, ErrorType: 'Mispronunciation' }, Phonemes: [{ Phoneme: 'ɡ', PronunciationAssessment: { AccuracyScore: 90 } }, { Phoneme: 'z', PronunciationAssessment: { AccuracyScore: 20 } }] },
  ] }] };
const input = { audio: Buffer.from('RIFF'), contentType: 'audio/wav; codecs=audio/pcm; samplerate=16000', referenceText: 'She goes to school.', locale: 'en-GB' };

describe('r4.4 #4 pronunciation (synthetic, mocked provider)', () => {
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false' });
    for (const k of ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'PRONUNCIATION_ASSESSMENT_ENABLED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests();
  });
  it('is disabled by default (flag off, no provider config)', () => {
    expect(pronunciationStatus().enabled).toBe(false);
  });
  it('refuses to call any provider when disabled', async () => {
    await expect(assessPronunciation({ audio: Buffer.from('x'), contentType: 'audio/wav', referenceText: 'hi' })).rejects.toBeInstanceOf(PronunciationDisabledError);
  });
  it('the Azure adapter sends the assessment header and parses word and phoneme scores', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(azureBody), { status: 200 }));
    const r = await new AzurePronunciationScorer('test-key', 'westeurope', fetchMock as never).score(input);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('westeurope.stt.speech.microsoft.com');
    expect(url).toContain('language=en-GB');
    const hdr = JSON.parse(Buffer.from((init.headers as Record<string, string>)['Pronunciation-Assessment'], 'base64').toString());
    expect(hdr).toMatchObject({ ReferenceText: 'She goes to school.', Granularity: 'Phoneme' });
    expect(r.pronunciation).toBe(85);
    expect(r.words[1]).toMatchObject({ word: 'goes', errorType: 'Mispronunciation' });
  });
  it('learner feedback names the weakest word and sound, with no raw scores', async () => {
    const s = new AzurePronunciationScorer('k', 'r', (async () => new Response(JSON.stringify(azureBody))) as never);
    const f = feedbackFrom(await s.score(input));
    expect(f.focus).toEqual([{ word: 'goes', sound: 'z' }]);
    expect(f.summary).not.toMatch(/\d/);
  });
  it('provider errors and no-speech surface as errors', async () => {
    const bad = new AzurePronunciationScorer('k', 'r', (async () => new Response('', { status: 401 })) as never);
    await expect(bad.score(input)).rejects.toMatchObject({ status: 401 });
    const none = new AzurePronunciationScorer('k', 'r', (async () => new Response(JSON.stringify({ RecognitionStatus: 'NoMatch' }))) as never);
    await expect(none.score(input)).rejects.toMatchObject({ status: 422 });
  });
  it('stays disabled with flag and config but no price entry (no unpriced paid traffic)', async () => {
    Object.assign(process.env, { AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'r', PRONUNCIATION_ASSESSMENT_ENABLED: 'true' });
    (await import('../src/config/env')).resetConfigForTests();
    expect(pronunciationStatus()).toMatchObject({ enabled: false, reason: expect.stringMatching(/price/) });
    for (const k of ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'PRONUNCIATION_ASSESSMENT_ENABLED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests();
  });
});
