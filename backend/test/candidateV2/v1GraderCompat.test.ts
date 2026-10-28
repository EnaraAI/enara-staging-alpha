import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// Documents (deterministically, no inference) why the V1 grader (gradeV6) cannot serve as the
// Candidate V2 grader: wrong input contract, wrong output contract, anchor dependence, and a
// client with production side effects. Mocked provider only.
const sdk = vi.hoisted(() => ({ reply: '' }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async () => ({ id: 'r1', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: sdk.reply }] }) };
  },
}));
const aiCallCreate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../src/models/AiCall', () => ({ AiCall: { create: aiCallCreate } }));
vi.stubGlobal('fetch', () => { throw new Error('network access in tests'); });

import { anthropicV6Client } from '../../src/services/hybridV1/client';
import { V6, gradeV6, payload, type V6Client } from '../../src/services/hybridV1/v6';
import { CANDIDATE_VERSION, validateOpenOutput, type Rubric, type Snapshot } from '../../src/services/candidateV2/contract';

// LAILA-shaped V2 rubric: 7 criteria, Relevance 0-2, others 0-5, total 0-32.
const lv = (id: string, max: number) => ({ id, maxPoints: max, levels: Array.from({ length: max + 1 }, (_, p) => ({ id: `${id}-${p}`, points: p })) });
const LAILA_RUBRIC: Rubric = { id: 'laila-shaped', version: 1, criteria: [lv('relevance', 2), lv('organization', 5), lv('vocabulary', 5), lv('style', 5), lv('development', 5), lv('mechanics', 5), lv('grammar', 5)] };
const ANSWER = 'نص مقال تجريبي للاختبار فقط';
const SNAP: Snapshot = { candidateVersion: CANDIDATE_VERSION, tenantId: 't', attemptId: 'a', questionId: 'q', assessmentVersion: 1, kind: 'open-response', rubric: LAILA_RUBRIC, maxPoints: 32, questionText: 'سؤال', answerSha256: 'x', hash: 'h' };
const V6_REPLY = JSON.stringify({ ideas: [{ idea: 'x', status: 'COVERED', evidence: [{ text: 'مقال تجريبي' }] }], score: 3.25 });

describe('V1 grader (gradeV6) vs the Candidate V2 contract', () => {
  it('gradeV6 has no rubric input: a V2 rubric cannot be expressed in its payload', () => {
    const p = payload({ question: 'q', reference: 'ref', maxScore: 32, anchors: [], answer: ANSWER });
    expect(Object.keys(p).sort()).toEqual(['anchors', 'format', 'instructions', 'max', 'question', 'reference_answer', 'student_answer']);
    expect(V6.instructions).toMatch(/ONE holistic score for the whole answer on a 0\.25 grid, consistent with the anchors/);
  });

  it('gradeV6 output is a holistic score + ideas; the V2 contract rejects it (no criteria, no levels)', async () => {
    const client: V6Client = { create: async () => ({ text: V6_REPLY, stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model: V6.model }) };
    const r = await gradeV6(client, { question: 'q', reference: 'ref', maxScore: 32, anchors: [], answer: ANSWER });
    expect(r).toMatchObject({ status: 'SCORED', score: 3.25 });
    expect(r).not.toHaveProperty('criteria');
    const asV2 = validateOpenOutput({ score: r.score, ideas: r.ideas }, SNAP, ANSWER);
    expect(asV2.status).not.toBe('VALID');
  });

  it('per-trait reuse would need an invented mapping: V6 scores lie on a 0.25 grid, V2 levels are declared integers', () => {
    const offLevel = validateOpenOutput({ rubricVersion: 1, feedback: 'f', totalPoints: 3.25,
      criteria: LAILA_RUBRIC.criteria.map((c, i) => ({ criterionId: c.id, selectedLevelId: i === 0 ? `${c.id}-3.25` : `${c.id}-0`, points: i === 0 ? 3.25 : 0, evidence: i === 0 ? ['مقال'] : [] })) }, SNAP, ANSWER);
    expect(offLevel).toMatchObject({ status: 'INVALID_OUTPUT', reasonCode: 'INVALID_LEVEL_ID' });
  });

  it('the V1 client writes a production AiCall record on every call (unsuitable for offline evaluation)', async () => {
    sdk.reply = V6_REPLY;
    // The gateway reads the config; don't depend on a local .env for it.
    for (const [k, v] of Object.entries({
      NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/enara_test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum',
      INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    })) vi.stubEnv(k, v);
    (await import('../../src/config/env')).resetConfigForTests();
    const c = anthropicV6Client('test-key');
    await c.create({ model: V6.model, max_tokens: 10, system: 's', messages: [{ role: 'user', content: 'u' }] }, { timeoutMs: 1000 });
    expect(aiCallCreate).toHaveBeenCalledTimes(1);
    expect(aiCallCreate.mock.calls[0][0]).toMatchObject({ feature: 'hybrid_v1_shadow' });
  });

  it('frozen V1 artifacts are unchanged', () => {
    const sha = (f: string) => require('crypto').createHash('sha256').update(readFileSync(path.join(__dirname, '../../src/services/hybridV1', f))).digest('hex');
    const m = JSON.parse(readFileSync(path.join(__dirname, '../../../docs/benchmarks/diagnostics/20261028T090000Z-hybrid-v1-production-readiness/V1_FREEZE_MANIFEST.json'), 'utf8'));
    for (const f of ['v6.ts', 'hybrid.ts', 'pyjson.ts', 'client.ts', 'shadow.ts', 'config.ts', 'frozenV6Spec.json']) {
      expect(sha(f)).toBe(m.new_files_sha256[`backend/src/services/hybridV1/${f}`]);
    }
  });
});
