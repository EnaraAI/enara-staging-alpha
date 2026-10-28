import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// Hybrid V1 frozen-behaviour tests. Offline only: every expected value comes from
// golden fixtures exported from the frozen Python modules
// (scripts/benchmarks/diagnostics/export_hybrid_v1_frozen.py, synthetic inputs).
// Any network attempt fails the test.
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { throw new Error('network client must not be constructed in tests'); } } }));
vi.stubGlobal('fetch', () => { throw new Error('network access in tests'); });

import { PRODUCTION_POLICY } from '../src/services/gradingProposals';
import { readHybridV1Config } from '../src/services/hybridV1/config';
import { ANCHOR_SEED, combine, eligibility, pickAnchors, pyRound } from '../src/services/hybridV1/hybrid';
import { pyDumps, pyFloat, pyFloatRepr, pyRawDecode } from '../src/services/hybridV1/pyjson';
import { V6, extractJson, gradeV6, parseOutput, payload, renderPrompt, requestBody, verifyFrozenSpec, type V6Client } from '../src/services/hybridV1/v6';

const FIX = path.join(__dirname, 'fixtures/hybridV1');
const load = (f: string) => JSON.parse(readFileSync(path.join(FIX, f), 'utf8'));
const prompts = load('golden_prompts.json');
const INPUT = { question: prompts.inputs.question, reference: prompts.inputs.reference, maxScore: 5, answer: prompts.inputs.answer,
  anchors: prompts.inputs.anchors.map((a: any) => ({ answer: a.answer, humanScore: a.human_score })) };

describe('frozen spec', () => {
  it('matches the confirmatory hashes and refuses a modified spec', () => {
    expect(verifyFrozenSpec()).toBe('ddcda7fe656d9dcc15a9f43001d4d40bb3ebf63f4d516308744f4da43298f1a5');
    expect(V6.source_sha256['anchored_holistic.py']).toBe('a1be3f9c6dbabdfc00956ec53c6139709fa827335ffa2b383622127fc6ed55f3');
    expect(load('frozen_v6_spec.json')).toEqual(V6);
    expect({ model: V6.model, max_tokens: V6.max_tokens, k: V6.k_anchors, grid: V6.hybrid_grid }).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 8000, k: 4, grid: 0.125 });
    const saved = V6.instructions;
    (V6 as any).instructions = `${saved} `;
    try {
      expect(() => verifyFrozenSpec()).toThrow(/hash mismatch/);
    } finally {
      (V6 as any).instructions = saved;
    }
  });
});

describe('python-compatible JSON', () => {
  it('writes Python floats and escapes', () => {
    expect([pyFloatRepr(5), pyFloatRepr(3.25), pyFloatRepr(0), pyFloatRepr(1e-7)]).toEqual(['5.0', '3.25', '0.0', '1e-07']);
    expect(pyDumps({ b: pyFloat(1), a: ['x"\n\u0001', 2, null, true] })).toBe('{"a": ["x\\"\\n\\u0001", 2, null, true], "b": 1.0}');
  });
  it('decodes like raw_decode (trailing text, strict strings, NaN)', () => {
    expect(pyRawDecode('{"a": 1} tail').value).toEqual({ a: 1 });
    expect(() => pyRawDecode('{"a": "x\ny"}')).toThrow(/control character/);
    expect(Number.isNaN((pyRawDecode('{"s": NaN}').value as any).s)).toBe(true);
    const r = pyRawDecode('{"s": 4.0, "t": 4}');
    expect([r.floats.get(r.value as object)?.has('s'), r.floats.get(r.value as object)?.has('t')]).toEqual([true, false]);
  });
});

describe('prompt rendering (byte-exact with the frozen Python)', () => {
  it('first call and request body', () => {
    expect(renderPrompt(payload(INPUT))).toBe(prompts.first);
    expect(requestBody(prompts.first)).toEqual(prompts.request_body);
  });
  it('repair call', () => {
    const p = { ...payload(INPUT), correction: prompts.repair_correction };
    expect(renderPrompt(p)).toBe(prompts.repair);
  });
});

describe('output parsing (golden cases)', () => {
  const text = readFileSync(path.join(FIX, 'golden_parse.json'), 'utf8');
  const dec = pyRawDecode(text);
  for (const c of dec.value as any[]) {
    it(c.name, () => {
      const run = () => parseOutput(c.raw, dec.floats, prompts.inputs.answer, 5);
      if (c.error) {
        let err: any;
        try {
          run();
        } catch (e) {
          err = e;
        }
        expect(err?.code).toBe(c.code);
        expect(err?.message).toBe(c.message);
        if (c.diagnostics) expect(err.diagnostics).toEqual(c.diagnostics);
      } else {
        const out = run();
        expect(out.score).toBe(c.ok.score);
        expect(out.ideas).toEqual(c.ok.ideas);
        expect(out.materialErrors).toEqual(c.ok.material_errors);
      }
    });
  }
  it('extract_json cases', () => {
    for (const c of load('golden_extract.json')) {
      if (c.ok) expect(extractJson(c.text).value).toEqual(c.ok);
      else expect(() => extractJson(c.text)).toThrow();
    }
  });
});

describe('anchors and blend arithmetic', () => {
  it('anchor selection matches Python for both seeds', () => {
    const a = load('golden_anchors.json');
    const pool = a.records.map((r: any) => ({ id: r.sample_id, answer: r.student_response, score: r.canonical_gold_score }));
    expect(pickAnchors(pool, a.seed).map((x) => x.id)).toEqual(a.picked);
    expect(pickAnchors(pool, 'enara-hybrid-confirmatory-v1').map((x) => x.id)).toEqual(a.picked_confirmatory_seed);
    expect(a.seed).toBe(ANCHOR_SEED);
    expect(pickAnchors(pool.slice(0, 3), a.seed)).toHaveLength(3);
  });
  it('combine matches Python on grid boundaries and fallbacks', () => {
    for (const c of load('golden_combine.json')) expect(combine(c.evalv2, c.v6)).toEqual(c.out);
  });
  it('every V6 quarter point x eval-v2 whole point lands on the 0.125 grid without rounding or clipping', () => {
    for (let e = 0; e <= 5; e++) {
      for (let q = 0; q <= 20; q++) {
        const v = q / 4;
        const out = combine(e, v);
        expect(out.score).toBe((e + v) / 2);
        expect(Number.isInteger(out.score! * 8)).toBe(true);
        expect(out.score! >= 0 && out.score! <= 5).toBe(true);
        expect(combine(e, v)).toEqual(out);
      }
    }
    expect([pyRound(0.5), pyRound(1.5), pyRound(2.5)]).toEqual([0, 2, 2]);
  });
});

describe('V6 grading with a recorded fake client', () => {
  const good = JSON.stringify({ ideas: [{ idea: 'x', status: 'COVERED', evidence: [{ text: 'يقترن' }] }], score: 3.25 });
  const fake = (replies: (string | Error | { text: string; stopReason?: string })[]) => {
    const bodies: any[] = [];
    const client: V6Client = {
      create: async (body) => {
        bodies.push(body);
        const r = replies.shift();
        if (r instanceof Error) throw r;
        return typeof r === 'string' ? { text: r, stopReason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, model: V6.model } : { ...r!, model: V6.model };
      },
    };
    return { client, bodies };
  };
  it('scores, deterministically, with one call', async () => {
    const a = fake([good]);
    const r = await gradeV6(a.client, INPUT);
    expect(r).toMatchObject({ status: 'SCORED', score: 3.25, repairs: 0 });
    expect(a.bodies[0].messages[0].content).toBe(prompts.first);
    const b = fake([good]);
    expect((await gradeV6(b.client, INPUT)).score).toBe(r.score);
  });
  it('repairs once with the frozen correction text', async () => {
    const a = fake([JSON.stringify({ ideas: [{ idea: 'x', status: 'COVERED', evidence: [{ text: 'يقترن' }] }], score: 3.3 }), good]);
    const r = await gradeV6(a.client, INPUT);
    expect(r).toMatchObject({ status: 'SCORED', score: 3.25, repairs: 1 });
    expect(a.bodies[1].messages[0].content).toBe(prompts.repair);
  });
  it('labels a second invalid output and stops', async () => {
    const bad = JSON.stringify({ ideas: [{ idea: 'x', status: 'COVERED', evidence: [{ text: 'غير موجود' }] }], score: 2 });
    const a = fake([bad, bad]);
    expect(await gradeV6(a.client, INPUT)).toMatchObject({ status: 'NON_SCORED', reasonCode: 'GROUNDING_FAILURE', repairs: 1 });
    expect(a.bodies).toHaveLength(2);
  });
  it('truncation, unparseable replies and transport errors end without repair', async () => {
    for (const [reply, code] of [[{ text: good, stopReason: 'max_tokens' }, 'INVALID_MODEL_OUTPUT'], ['not json', 'INVALID_MODEL_OUTPUT'], ['{"a": 1', 'INVALID_MODEL_OUTPUT'],
      [Object.assign(new Error('x'), { code: 'MODEL_TIMEOUT' }), 'MODEL_TIMEOUT'], ['{"ideas": [], "score": NaN}', 'ValueError']] as const) {
      const a = fake([reply as any, good]);
      expect(await gradeV6(a.client, INPUT)).toMatchObject({ status: 'NON_SCORED', reasonCode: code, repairs: 0 });
      expect(a.bodies).toHaveLength(1);
    }
  });
  it('rejects oversized prompts before any call', async () => {
    const a = fake([good]);
    expect(await gradeV6(a.client, { ...INPUT, answer: 'ب'.repeat(20_000) })).toMatchObject({ status: 'NON_SCORED', reasonCode: 'INVALID_REQUEST' });
    expect(a.bodies).toHaveLength(0);
  });
});

describe('eligibility, configuration and eval-v2 regression', () => {
  const q: any = { id: 'q', type: 'open-response', text: 'س', explanation: '', modelAnswer: 'مرجع', rubric: { criteria: [{ id: 'c', title: 't', maxPoints: 5, levels: [0, 1, 2, 3, 4, 5].map((p) => ({ id: `s${p}`, label: `${p}`, points: p })) }] } };
  it('admits only the validated envelope', () => {
    expect(eligibility(q, 'إجابة')).toEqual({ eligible: true });
    expect(eligibility(q, 'an English answer')).toMatchObject({ reason: 'NOT_ARABIC' });
    expect(eligibility({ ...q, modelAnswer: '' }, 'إجابة')).toMatchObject({ reason: 'NO_REFERENCE_ANSWER' });
    expect(eligibility({ ...q, rubric: { criteria: [q.rubric.criteria[0], q.rubric.criteria[0]] } }, 'إجابة')).toMatchObject({ reason: 'NOT_SINGLE_CRITERION' });
    expect(eligibility({ ...q, rubric: { criteria: [{ ...q.rubric.criteria[0], maxPoints: 10 }] } }, 'إجابة')).toMatchObject({ reason: 'NOT_0_5_WHOLE_POINT_SCALE' });
    expect(eligibility({ ...q, type: 'short-answer' }, 'إجابة')).toMatchObject({ reason: 'NOT_OPEN_RESPONSE' });
  });
  it('is off by default and accepts only a complete shadow configuration', () => {
    expect(readHybridV1Config({})).toEqual({ ok: false, reason: 'disabled' });
    expect(readHybridV1Config({ ENARA_HYBRID_V1_ENABLED: 'true', ENARA_HYBRID_V1_MODE: 'canary' })).toMatchObject({ ok: false });
    expect(readHybridV1Config({ ENARA_HYBRID_V1_ENABLED: 'true', ENARA_HYBRID_V1_MODE: 'shadow', ENARA_HYBRID_V1_SHADOW_INSTITUTIONS: 'i1' })).toMatchObject({ ok: false });
    expect(readHybridV1Config({ ENARA_HYBRID_V1_ENABLED: 'true', ENARA_HYBRID_V1_MODE: 'shadow', ENARA_HYBRID_V1_SHADOW_INSTITUTIONS: 'i1', ENARA_HYBRID_V1_MAX_CALLS: '10', ENARA_HYBRID_V1_MAX_USD: '1' })).toMatchObject({ ok: true });
  });
  it('leaves the production eval-v2 policy as it was', () => {
    expect(PRODUCTION_POLICY).toEqual({ version: 'eval-v2' });
  });
});
