import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0b: AI gateway metering into usage_ledger. All providers are mocked; no
// network. Each billable provider attempt is one immutable ledger row.
const ai = vi.hoisted(() => ({
  create: vi.fn(),
  betaCreate: vi.fn(),
  betaStream: vi.fn(),
  tts: vi.fn(),
}));
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class Anthropic {
    static APIError = APIError;
    messages = { create: ai.create };
    beta = { messages: { create: ai.betaCreate, stream: ai.betaStream } };
  }
  return { default: Anthropic };
});
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToSpeech = { stream: ai.tts };
  },
}));
vi.mock('../src/config/env', () => ({
  getConfig: () => ({
    anthropicApiKey: 'test-key',
    anthropicTutorModel: 'claude-opus-5-5',
    anthropicVoiceModel: 'claude-haiku-5-5',
    anthropicVisualModel: 'claude-sonnet-5-5',
    anthropicTutorEffort: 'low',
    uploadDir: '/tmp',
    elevenlabs: { apiKey: 'k', voiceIdEn: 'en', voiceIdAr: 'ar', femaleVoiceId: 'f', ttsModel: 'eleven_flash_v2_5', sttModel: 's' },
  }),
}));

import { runWithCallContext } from '../src/utils/callContext';
import { logger } from '../src/utils/logging';
import { UsageLedger } from '../src/models/UsageLedger';
import { AiCall } from '../src/models/AiCall';
import { askForJson } from '../src/services/aiJson';
import { recordAttempt, setGatewayRetryDelay, startOperation } from '../src/services/aiGateway';
import { queryDirectTutorModel, streamDirectTutorModel } from '../src/services/directTutorModel';
import { answerDataQuestion } from '../src/services/dataAssistant';
import { generateVisualAid } from '../src/services/avatarVisuals';
import { synthesizeSpeech } from '../src/services/elevenlabsVoice';
import { evaluateShortAnswer } from '../src/services/gradingProposals';

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
  for (const c of ['usage_ledger', 'ai_calls', 'grading_proposals']) await mongoose.connection.collection(c).deleteMany({});
  for (const m of Object.values(ai)) m.mockReset();
  vi.restoreAllMocks();
});

const CTX = { requestId: 'req-1', institutionId: 'instA', userId: 'u1', studentId: 's1', role: 'student' };
const inCtx = <T>(fn: () => Promise<T>, ctx = CTX) => runWithCallContext(ctx, fn);
const reply = (text: string, over: Record<string, unknown> = {}) => ({
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
  content: [{ type: 'text', text }],
  ...over,
});
const httpError = (status: number) => Object.assign(new Error(`http ${status}`), { status });
const ledger = () => UsageLedger.find().sort({ attempt: 1 }).lean();
const aiCalls = async (n: number) => {
  for (let i = 0; i < 50 && (await AiCall.countDocuments()) < n; i++) await new Promise((r) => setTimeout(r, 10));
  return AiCall.find().lean();
};
const ask = (over: Record<string, unknown> = {}) =>
  askForJson({ feature: 'lesson_plan', system: 'sys', user: 'secret student text', maxTokens: 500, validate: (v) => v as { ok: boolean }, ...over });

// Fake SDK MessageStream: events, finalMessage(), abort().
function fakeStream(opts: { texts: string[]; final?: unknown; failAt?: number; failBeforeStart?: Error }) {
  const aborted = { value: false };
  const stream = {
    abort: () => {
      aborted.value = true;
    },
    finalMessage: async () => opts.final,
    async *[Symbol.asyncIterator]() {
      if (opts.failBeforeStart) throw opts.failBeforeStart;
      for (let i = 0; i < opts.texts.length; i++) {
        if (opts.failAt === i) throw Object.assign(new Error('stream broke'), { status: 500 });
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: opts.texts[i] } };
      }
    },
  };
  return { stream, aborted };
}

describe('P0b gateway: JSON generation', () => {
  it('a successful call writes one priced ledger row and keeps the ai_calls row', async () => {
    ai.create.mockResolvedValue(reply('{"ok":true}'));
    const out = await inCtx(() => ask());
    expect(out.value).toEqual({ ok: true });
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      institutionId: 'instA', userId: 'u1', studentId: 's1', role: 'student', requestId: 'req-1',
      feature: 'lesson_plan', provider: 'anthropic', modelName: 'claude-opus-5-5', status: 'ok', attempt: 1, origin: 'live',
      units: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 0 },
      priceCatalogVersion: 'v1', costStatus: 'estimated', costInternal: 0.0081,
    });
    expect(rows[0].operationKey).toMatch(/^ai:req-1:[0-9a-f-]{36}:1$/);
    // No prompt or reply text in the ledger.
    expect(JSON.stringify(rows[0])).not.toMatch(/secret student text|"ok":true/);
    const calls = await aiCalls(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ feature: 'lesson_plan', status: 'ok', inputTokens: 1000, costStatus: 'estimated' });
  });

  it('a provider error is recorded with unknown usage, never as zero cost', async () => {
    ai.create.mockRejectedValue(httpError(400));
    await expect(inCtx(() => ask())).rejects.toThrow('http 400');
    expect(ai.create).toHaveBeenCalledTimes(1); // 400 is not retryable
    const [row, ...rest] = await ledger();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ status: 'error', errorCode: 'http_400', costStatus: 'usage_unknown', costInternal: null });
    expect(row.units ?? {}).toEqual({}); // no invented usage
    expect((await aiCalls(1))[0]).toMatchObject({ status: 'error', errorCode: 'http_400' });
  });

  it('each billed retry is its own ledger row under one operation; the validation retry too', async () => {
    ai.create
      .mockRejectedValueOnce(httpError(529))
      .mockResolvedValueOnce(reply('not json'))
      .mockResolvedValueOnce(reply('{"ok":true}'));
    await inCtx(() => ask());
    const rows = await ledger();
    expect(rows.map((r) => [r.attempt, r.status, r.costStatus])).toEqual([
      [1, 'error', 'usage_unknown'],
      [2, 'ok', 'estimated'],
      [3, 'ok', 'estimated'],
    ]);
    const prefix = rows[0].operationKey.replace(/:1$/, '');
    expect(rows.map((r) => r.operationKey)).toEqual([`${prefix}:1`, `${prefix}:2`, `${prefix}:3`]);
    expect(await aiCalls(3)).toHaveLength(3);
  });

  it('persisting the same attempt twice is idempotent', async () => {
    const op = startOperation();
    const rec = { operationKey: `${op.key}:1`, attempt: 1, meta: { feature: 'x', modelName: 'claude-opus-5-5' }, modelName: 'claude-opus-5-5', status: 'ok' as const, units: { inputTokens: 10 } };
    await inCtx(() => recordAttempt(rec));
    await inCtx(() => recordAttempt(rec));
    expect(await UsageLedger.countDocuments()).toBe(1);
  });

  it('an unknown model stays unpriced in the ledger and flagged in ai_calls', async () => {
    ai.create.mockResolvedValue(reply('{"ok":true}', { model: 'claude-mystery-9' }));
    await inCtx(() => ask());
    const [row] = await ledger();
    expect(row).toMatchObject({ modelName: 'claude-mystery-9', costStatus: 'unpriced', costInternal: null });
    expect((await aiCalls(1))[0]).toMatchObject({ costStatus: 'unpriced' });
  });

  it('a refusal is recorded as a refusal with its reported usage', async () => {
    ai.betaCreate.mockResolvedValue(reply('', { stop_reason: 'refusal', stop_details: { category: 'x' } }));
    expect(await inCtx(() => queryDirectTutorModel({ query: 'q', history: [], teachingMethod: 'socratic' }))).toBeNull();
    const [row] = await ledger();
    expect(row).toMatchObject({ feature: 'tutor_chat', status: 'refusal', costStatus: 'estimated' });
  });
});

describe('P0b gateway: tenant ownership', () => {
  it('uses the server-side context; another school passed in cannot take the charge', async () => {
    const warn = vi.spyOn(logger, 'warn');
    ai.create.mockResolvedValue(reply('{"ok":true}'));
    await inCtx(() => ask({ institutionId: 'instB' }), { ...CTX, role: 'teacher' });
    const [row] = await ledger();
    expect(row).toMatchObject({ institutionId: 'instA', userId: 'u1' });
    expect(warn).toHaveBeenCalledWith('ai_gateway_tenant_mismatch', expect.objectContaining({ feature: 'lesson_plan' }));
  });

  it('background work with no request tenant uses the server-derived school', async () => {
    ai.create.mockResolvedValue(reply('{"ok":true}'));
    await ask({ institutionId: 'instC' });
    const [row] = await ledger();
    expect(row).toMatchObject({ institutionId: 'instC' });
    expect(row.operationKey).toMatch(/^ai:bg:/);
    expect(row.userId).toBeUndefined();
  });

  it('the data assistant is charged to the caller scope with one row per call', async () => {
    ai.create.mockResolvedValue(reply('Two students are at risk.'));
    vi.spyOn(await import('../src/services/analyticsService'), 'buildOverview').mockResolvedValue({ generatedAt: 'now', definitions: {}, totals: {}, subjects: [], topics: [], students: [] } as never);
    await inCtx(() => answerDataQuestion({ institutionId: 'instA' }, 'who is at risk?', []), { ...CTX, role: 'admin' });
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'staff_assistant', institutionId: 'instA' });
  });
});

describe('P0b gateway: nested services', () => {
  it('grading through askForJson writes exactly one ledger row per provider call, with the attempt ref', async () => {
    ai.create.mockResolvedValue(reply('{"correct":true,"scoreExplanation":"Same meaning.","feedback":"Well done.","flags":[]}'));
    const proposal = await evaluateShortAnswer({
      attempt: { id: 'att-1', institutionId: 'instA', assignmentId: 'asg-1' } as never,
      question: { id: 'q1', type: 'short-answer', text: 'Half of 4?', correctAnswer: '2', points: 1 } as never,
      answer: 'two',
      run: 1,
    });
    expect(proposal.status).toBe('proposed');
    expect(ai.create).toHaveBeenCalledTimes(1);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'ai_grading', institutionId: 'instA', refs: { attemptId: 'att-1' } });
  });

  it('avatar visuals: one row per call', async () => {
    ai.create.mockResolvedValue(reply('<div>diagram</div>', { model: 'claude-sonnet-5-5' }));
    await inCtx(() => generateVisualAid({ question: 'draw a triangle', requested: true }));
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'avatar_visual', modelName: 'claude-sonnet-5-5', costStatus: 'estimated' });
  });
});

describe('P0b gateway: streaming tutor', () => {
  const final = { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 400, output_tokens: 50 } };
  const params = { query: 'q', history: [], teachingMethod: 'socratic' as const, mode: 'voice' as const };

  it('records the final usage exactly once on normal completion', async () => {
    const { stream } = fakeStream({ texts: ['Hel', 'lo'], final });
    ai.betaStream.mockReturnValue(stream);
    let text = '';
    await inCtx(async () => {
      for await (const t of streamDirectTutorModel(params)) text += t;
    });
    expect(text).toBe('Hello');
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'tutor_voice', status: 'ok', units: { inputTokens: 400, outputTokens: 50 }, costStatus: 'estimated' });
    expect(await aiCalls(1)).toHaveLength(1);
  });

  it('a consumer that stops early aborts the stream and is metered as cancelled with unknown usage', async () => {
    const { stream, aborted } = fakeStream({ texts: ['a', 'b', 'c'], final });
    ai.betaStream.mockReturnValue(stream);
    await inCtx(async () => {
      for await (const _ of streamDirectTutorModel(params)) break;
    });
    expect(aborted.value).toBe(true);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'cancelled', costStatus: 'usage_unknown', costInternal: null });
    expect(rows[0].units ?? {}).toEqual({});
    // Cancellations get no ai_calls row, as before.
    await new Promise((r) => setTimeout(r, 50));
    expect(await AiCall.countDocuments()).toBe(0);
  });

  it('a failure after text was sent is not retried and is recorded with unknown usage', async () => {
    const { stream } = fakeStream({ texts: ['a', 'b'], final, failAt: 1 });
    ai.betaStream.mockReturnValue(stream);
    let text = '';
    await inCtx(async () => {
      for await (const t of streamDirectTutorModel(params)) text += t;
    });
    expect(text).toBe('a');
    expect(ai.betaStream).toHaveBeenCalledTimes(1);
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'error', costStatus: 'usage_unknown', costInternal: null });
  });

  it('a failure before any text is retried once, each attempt metered', async () => {
    ai.betaStream
      .mockReturnValueOnce(fakeStream({ texts: [], failBeforeStart: httpError(529) }).stream)
      .mockReturnValueOnce(fakeStream({ texts: ['ok'], final }).stream);
    let text = '';
    await inCtx(async () => {
      for await (const t of streamDirectTutorModel(params)) text += t;
    });
    expect(text).toBe('ok');
    expect((await ledger()).map((r) => [r.attempt, r.status])).toEqual([[1, 'error'], [2, 'ok']]);
  });
});

describe('P0b gateway: speech', () => {
  it('meters TTS characters once per accepted request; ai_calls logging unchanged', async () => {
    ai.tts.mockResolvedValue(new ReadableStream());
    await inCtx(() => synthesizeSpeech('Hello there', 'english'));
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'elevenlabs', feature: 'tts', modelName: 'eleven_flash_v2_5', units: { characters: 11 }, costStatus: 'estimated', costInternal: 0.00088 });
    expect(await aiCalls(1)).toHaveLength(1);
  });

  it('a retried TTS failure gives two rows, the failed one with unknown usage', async () => {
    ai.tts.mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 503 })).mockResolvedValueOnce(new ReadableStream());
    await inCtx(() => synthesizeSpeech('Hi', 'english'));
    expect((await ledger()).map((r) => [r.attempt, r.status, r.costStatus])).toEqual([[1, 'error', 'usage_unknown'], [2, 'ok', 'estimated']]);
  });
});

describe('P0b gateway: ledger conflicts', () => {
  it('a reused key with different billing data is logged safely and surfaced, not swallowed', async () => {
    const error = vi.spyOn(logger, 'error');
    const op = startOperation();
    const base = { operationKey: `${op.key}:1`, attempt: 1, meta: { feature: 'x', modelName: 'claude-opus-5-5' }, modelName: 'claude-opus-5-5', status: 'ok' as const };
    await inCtx(() => recordAttempt({ ...base, units: { inputTokens: 10 } }));
    const err = await inCtx(() => recordAttempt({ ...base, units: { inputTokens: 99 } })).catch((e) => e);
    expect(err).toMatchObject({ code: 'USAGE_METERING_FAILED', statusCode: 500, message: 'Usage could not be recorded' });
    expect(error).toHaveBeenCalledWith('ai_gateway_ledger_conflict', { operationKey: base.operationKey, fields: expect.arrayContaining(['units', 'costInternal']), feature: 'x' });
    // The safe log carries no prices.
    const logged = JSON.stringify(error.mock.calls.filter((c) => c[0] === 'ai_gateway_ledger_conflict'));
    expect(logged).not.toMatch(/costInternal":\s*\d|0\.0/);
    expect(await UsageLedger.countDocuments()).toBe(1);
  });
});
