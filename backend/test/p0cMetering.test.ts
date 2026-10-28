import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0c: avatar session time, STT, orchestrator, ingestion engine and the
// remaining direct model call sites. Every provider is mocked; no network.
const ai = vi.hoisted(() => ({ create: vi.fn(), sttToken: vi.fn(), pg: vi.fn(async () => ({ rows: [] })) }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: vi.fn() } };
  }
  return { default: Anthropic };
});
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    tokens = { singleUse: { create: ai.sttToken } };
    textToSpeech = { stream: vi.fn() };
  },
}));
vi.mock('../src/config/postgres', () => ({ getPostgresPool: () => ({ query: ai.pg }) }));
vi.mock('../src/config/env', () => ({
  getConfig: () => ({
    anthropicApiKey: 'test-key',
    anthropicTutorModel: 'claude-opus-5-5',
    anthropicVoiceModel: 'claude-haiku-5-5',
    anthropicTutorEffort: 'low',
    uploadDir: '/tmp',
    elevenlabs: { apiKey: 'k', voiceIdEn: 'en', voiceIdAr: 'ar', femaleVoiceId: 'f', ttsModel: 'eleven_flash_v2_5', sttModel: 'scribe_v2_realtime' },
    enaraOrchestratorUrl: 'https://orchestrator.test',
    enaraApiKey: 'orch-key',
    aiEngineUrl: 'https://engine.test',
    aiEngineTimeoutMs: 1000,
    ingestHmacSecret: 'test-hmac-secret-32-characters-minimum',
  }),
}));

import { runWithCallContext } from '../src/utils/callContext';
import { logger } from '../src/utils/logging';
import { UsageLedger } from '../src/models/UsageLedger';
import { AvatarSession } from '../src/models/AvatarSession';
import { AiCall } from '../src/models/AiCall';
import { AVATAR_STALE_MS, finalizeAvatarUsage, sweepAvatarUsage } from '../src/services/avatarUsage';
import { createTranscriptionToken } from '../src/services/elevenlabsVoice';
import { queryOrchestratorChat } from '../src/services/enaraOrchestrator';
import { submitFileToEngine } from '../src/services/ingestionService';
import { trackAiCall } from '../src/services/aiCalls';
import { nextStepsNote } from '../src/services/nextStepsService';
import { anthropicV6Client } from '../src/services/hybridV1/client';
import { queryDirectTutorModel } from '../src/services/directTutorModel';
import { setGatewayRetryDelay } from '../src/services/aiGateway';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await UsageLedger.createIndexes();
  setGatewayRetryDelay(0);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['usage_ledger', 'avatarsessions', 'ai_calls']) await mongoose.connection.collection(c).deleteMany({});
  for (const m of Object.values(ai)) m.mockReset();
  ai.pg.mockResolvedValue({ rows: [] });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const CTX = { requestId: 'req-9', institutionId: 'instA', userId: 'u1', studentId: 's1', role: 'student' };
const inCtx = <T>(fn: () => Promise<T>, ctx = CTX) => runWithCallContext(ctx, fn);
const ledger = () => UsageLedger.find().sort({ operationKey: 1, attempt: 1 }).lean();
const T0 = new Date('2026-10-28T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

// A call stored the way startAvatarSession stores it.
async function session(id: string, over: Record<string, unknown> = {}) {
  const doc = await AvatarSession.create({ id, userId: 'u1', studentId: 's1', institutionId: 'instA', role: 'student', language: 'english', avatarId: 'face-1', lastActivityAt: T0, ...over });
  await AvatarSession.collection.updateOne({ id }, { $set: { createdAt: (over.createdAt as Date) ?? T0 } });
  return doc;
}
const endCall = (id: string, when: Date) => AvatarSession.updateOne({ id, endedAt: null }, { endedAt: when });

describe('P0c avatar session time', () => {
  it('a normal end gives one immutable row with the measured duration, unpriced (no Anam rate)', async () => {
    await session('av-1', { lastActivityAt: at(5) });
    await endCall('av-1', at(12.5));
    expect(await finalizeAvatarUsage('av-1')).toBe(true);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operationKey: 'avatar:av-1', provider: 'anam', feature: 'avatar_session', modelName: 'face-1', status: 'ok',
      units: { avatarSeconds: 750 }, unitsBasis: 'server_measured', costStatus: 'unpriced', costInternal: null,
      institutionId: 'instA', userId: 'u1', studentId: 's1', role: 'student', refs: { sessionId: 'av-1' },
    });
    expect((await AvatarSession.findOne({ id: 'av-1' }).lean())!.usageFinalizedAt).toBeInstanceOf(Date);
    // The ledger row stays immutable.
    await expect(UsageLedger.updateOne({ operationKey: 'avatar:av-1' }, { $set: { units: {} } })).rejects.toThrow(/append-only/);
  });

  it('a live call is not finalized', async () => {
    await session('av-live', { lastActivityAt: new Date() });
    expect(await finalizeAvatarUsage('av-live')).toBe(false);
    expect(await UsageLedger.countDocuments()).toBe(0);
  });

  it('double close, concurrent close and close-versus-sweep give one charge', async () => {
    await session('av-2', { lastActivityAt: at(3) });
    await endCall('av-2', at(10));
    await endCall('av-2', at(11)); // second close cannot move the end
    const now = at(10 + 120);
    const results = await Promise.all([
      finalizeAvatarUsage('av-2', now), finalizeAvatarUsage('av-2', now), finalizeAvatarUsage('av-2', now),
      sweepAvatarUsage({ now }), sweepAvatarUsage({ now }),
    ]);
    expect(results.slice(0, 3)).toEqual([true, true, true]);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].units).toMatchObject({ avatarSeconds: 600 });
  });

  it('a sweep racing a late close agrees on one frozen end', async () => {
    await session('av-3', { lastActivityAt: at(20) });
    const now = at(20 + 61);
    // Sweep freezes the inferred end, then the student's close arrives.
    const [a] = await Promise.all([sweepAvatarUsage({ now }), endCall('av-3', now).then(() => finalizeAvatarUsage('av-3', now))]);
    expect(a.due).toBeGreaterThanOrEqual(0);
    await sweepAvatarUsage({ now });
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    // Whichever finalizer froze first, every attempt wrote identical data.
    expect([1200, 4860]).toContain(rows[0].units!.avatarSeconds);
  });

  it('an abandoned call is metered from the last request seen, labelled inferred, never invented', async () => {
    await session('av-4', { lastActivityAt: at(7) });
    const out = await sweepAvatarUsage({ now: at(7 + 61) });
    expect(out).toEqual({ due: 1, finalized: 1 });
    const [row] = await ledger();
    expect(row).toMatchObject({ units: { avatarSeconds: 420 }, unitsBasis: 'inferred_from_activity', costStatus: 'unpriced' });
  });

  it('an abandoned call with no activity after start has unknown usage, not zero', async () => {
    await session('av-5', { lastActivityAt: T0 });
    await sweepAvatarUsage({ now: new Date(T0.getTime() + AVATAR_STALE_MS + 1000) });
    const [row] = await ledger();
    expect(row).toMatchObject({ status: 'ok', costStatus: 'usage_unknown', costInternal: null });
    expect(row.units ?? {}).toEqual({});
    expect(row.unitsBasis).toBeUndefined();
  });

  it('a failed ledger append is retried by the sweep without double billing', async () => {
    await session('av-6');
    await endCall('av-6', at(4));
    const ledgerModule = await import('../src/services/usageLedger');
    const spy = vi.spyOn(ledgerModule, 'appendUsage').mockRejectedValue(new Error('db down'));
    expect(await finalizeAvatarUsage('av-6')).toBe(false);
    expect((await AvatarSession.findOne({ id: 'av-6' }).lean())!.usageFinalizedAt).toBeUndefined();
    spy.mockRestore();
    expect(await sweepAvatarUsage({})).toMatchObject({ finalized: 1 });
    // Crash after the append but before the marker: the next sweep adds nothing.
    await AvatarSession.updateOne({ id: 'av-6' }, { $unset: { usageFinalizedAt: 1 } });
    expect(await sweepAvatarUsage({})).toMatchObject({ finalized: 1 });
    expect(await UsageLedger.countDocuments()).toBe(1);
  });

  it('finalization uses the trusted session owner, not the request that triggers it', async () => {
    await session('av-7');
    await endCall('av-7', at(2));
    await inCtx(() => finalizeAvatarUsage('av-7'), { requestId: 'r', institutionId: 'instB', userId: 'intruder', studentId: 'x', role: 'teacher' });
    const [row] = await ledger();
    expect(row).toMatchObject({ institutionId: 'instA', userId: 'u1', studentId: 's1', role: 'student' });
  });
});

describe('P0c ElevenLabs speech-to-text', () => {
  it('meters each transcription token as one STT use with unknown usage (the browser streams audio directly)', async () => {
    ai.sttToken.mockResolvedValue({ token: 'tok-123' });
    expect(await inCtx(() => createTranscriptionToken({ sessionId: 'av-1' }))).toBe('tok-123');
    const [row, ...rest] = await ledger();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ provider: 'elevenlabs', feature: 'stt', modelName: 'scribe_v2_realtime', status: 'ok', costStatus: 'usage_unknown', costInternal: null, refs: { sessionId: 'av-1' }, institutionId: 'instA' });
    expect(JSON.stringify(row)).not.toContain('tok-123');
  });

  it('a failed token request is an error row and the error is unchanged', async () => {
    ai.sttToken.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 401 }));
    await expect(inCtx(() => createTranscriptionToken())).rejects.toThrow('nope');
    expect((await ledger())[0]).toMatchObject({ status: 'error', errorCode: 'Error', costStatus: 'usage_unknown' });
  });
});

describe('P0c external orchestrator and ingestion engine', () => {
  const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('one orchestrator chat query is one row with unknown usage; the reply is unchanged and not stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ answer: 'Private answer text', intent: 'x', context_found: 1, version: 'v' })));
    const out = await inCtx(() => queryOrchestratorChat({ course_id: 'c1', query: 'secret question' }));
    expect(out).toMatchObject({ answer: 'Private answer text' });
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'orchestrator', feature: 'tutor_chat', status: 'ok', costStatus: 'usage_unknown', institutionId: 'instA' });
    expect(JSON.stringify(rows)).not.toMatch(/Private answer|secret question/);
    expect(ai.create).not.toHaveBeenCalled(); // no nested model call to double count
  });

  it('an orchestrator failure is an error row and still returns null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect(await inCtx(() => queryOrchestratorChat({ course_id: 'c1', query: 'q' }))).toBeNull();
    expect((await ledger())[0]).toMatchObject({ status: 'error', errorCode: 'http_503', costStatus: 'usage_unknown' });
  });

  it('an ingestion submission is metered once per event at the engine boundary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ingestion_id: 'ing-1' })));
    const params = { schoolId: 'instA', courseId: 'course1', instructorId: 'teach1', assetId: 'asset1', s3Key: 'k/file.pdf', modality: 'document' as const, fileName: 'Secret doc.pdf' };
    const out = await inCtx(() => submitFileToEngine(params));
    expect(out.ingestionId).toBe('ing-1');
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operationKey: `ingest:${out.eventId}`, provider: 'ingestion_engine', feature: 'curriculum_ingestion', status: 'ok', costStatus: 'usage_unknown', refs: { uploadId: 'asset1' }, institutionId: 'instA' });
    expect(JSON.stringify(rows)).not.toMatch(/Secret doc|k\/file\.pdf/);
  });

  it('a rejected ingestion is an error row and keeps its AppError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
    await expect(inCtx(() => submitFileToEngine({ schoolId: 'instA', courseId: 'course1', instructorId: 'teach1', assetId: 'asset1', s3Key: 'k', modality: 'document' }))).rejects.toMatchObject({ code: 'AI_ENGINE_REJECTED' });
    expect((await ledger())[0]).toMatchObject({ status: 'error', errorCode: 'http_400' });
  });

  it('a mismatching explicit school cannot take the charge inside another school request', async () => {
    const warn = vi.spyOn(logger, 'warn');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ingestion_id: 'ing-2' })));
    await inCtx(() => submitFileToEngine({ schoolId: 'instB', courseId: 'course1', instructorId: 'teach1', assetId: 'asset1', s3Key: 'k', modality: 'document' }), { ...CTX, role: 'teacher' });
    expect((await ledger())[0]).toMatchObject({ institutionId: 'instA' });
    expect(warn).toHaveBeenCalledWith('ai_gateway_tenant_mismatch', expect.anything());
  });

  it('a signed service submission with no user context is charged to its school', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ingestion_id: 'ing-3' })));
    await submitFileToEngine({ schoolId: 'instC', courseId: 'course1', instructorId: 'teach1', assetId: 'asset1', s3Key: 'k', modality: 'audio' });
    expect((await ledger())[0]).toMatchObject({ institutionId: 'instC', modelName: 'ingestion-engine:audio' });
  });
});

describe('P0c remaining direct model call sites', () => {
  const reply = (over: Record<string, unknown> = {}) => ({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Keep going, Sara!' }], ...over });

  it('trackAiCall (classSummary, nextSteps, reminders, objectiveExtraction, hybridV1) writes one ledger row and one ai_calls row per call', async () => {
    const r = await inCtx(() => trackAiCall('weekly_summary', 'claude-haiku-5-5', async () => reply()));
    expect(r.model).toBe('claude-haiku-5-5');
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'weekly_summary', status: 'ok', attempt: 1, costStatus: 'estimated', units: { inputTokens: 100, outputTokens: 20 } });
    for (let i = 0; i < 50 && (await AiCall.countDocuments()) < 1; i++) await new Promise((res) => setTimeout(res, 10));
    expect(await AiCall.countDocuments()).toBe(1);
  });

  it('trackAiCall still rethrows errors (no retries) and records unknown usage', async () => {
    await expect(inCtx(() => trackAiCall('reminder_email', 'claude-haiku-5-5', async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); }))).rejects.toThrow('overloaded');
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'error', errorCode: 'http_529', costStatus: 'usage_unknown' });
  });

  it('nextStepsNote keeps its output and its fallback on error, one row each', async () => {
    const snap = { studentId: 's1', firstName: 'Sara', name: 'Sara', courses: [], weakTopics: [], recentQuizzes: [], reviewsDue: 0, recentTutorTopics: [] } as never;
    ai.create.mockResolvedValueOnce(reply());
    expect(await inCtx(() => nextStepsNote(snap, [{ title: 'Fractions', detail: 'practise' }] as never))).toBe('Keep going, Sara!');
    ai.create.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 500 }));
    const fallback = await inCtx(() => nextStepsNote(snap, [{ title: 'Decimals', detail: 'practise' }] as never));
    expect(typeof fallback).toBe('string');
    expect(fallback).not.toBe('Keep going, Sara!');
    expect((await ledger()).map((r) => [r.feature, r.status])).toEqual(expect.arrayContaining([['next_steps_note', 'ok'], ['next_steps_note', 'error']]));
    expect(await UsageLedger.countDocuments()).toBe(2);
    expect(JSON.stringify(await ledger())).not.toMatch(/Keep going|Fractions|Sara/);
  });

  it('the frozen hybridV1 client is metered through trackAiCall without edits, charged to its school', async () => {
    ai.create.mockResolvedValue(reply({ model: 'claude-opus-5-5' }));
    const client = anthropicV6Client('test-key', 'instH');
    await client.create({ model: 'claude-opus-5-5', max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'u' }] } as never, { timeoutMs: 1000 } as never);
    const [row] = await ledger();
    expect(row).toMatchObject({ feature: 'hybrid_v1_shadow', institutionId: 'instH', costStatus: 'estimated' });
  });

  it('server-side model fallback is metered against the model that answered; each retry is its own row', async () => {
    ai.create
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce(reply({ model: 'claude-sonnet-5-5-20261001' }));
    const out = await inCtx(() => queryDirectTutorModel({ query: 'q', history: [], teachingMethod: 'socratic' }));
    expect(out?.version).toBe('anthropic:claude-sonnet-5-5-20261001');
    const rows = await UsageLedger.find().sort({ attempt: 1 }).lean();
    expect(rows.map((r) => [r.attempt, r.status, r.modelName, r.costStatus])).toEqual([
      [1, 'error', 'claude-opus-5-5', 'usage_unknown'],
      [2, 'ok', 'claude-sonnet-5-5-20261001', 'estimated'],
    ]);
    // Priced at the answering model's rate (sonnet 2/10 per M), not opus.
    expect(rows[1].costInternal).toBe(0.0004);
    expect(new Set(rows.map((r) => r.operationKey)).size).toBe(2);
  });
});
