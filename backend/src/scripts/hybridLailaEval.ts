import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CandidateV2Budget } from '../services/candidateV2/budget';
import { createEvalV2CriterionGrader, EVALV2_SYSTEM, CANDIDATE_VERSION, type EvalV2Trace } from '../services/candidateV2/evalV2Criterion';
import { lailaRubric } from '../services/candidateV2/lailaAdapter';
import { priceBound, PRICES } from '../services/candidateV2/pricing';
import { runCandidateV2, type ResultStore } from '../services/candidateV2/runner';
import { anthropicPromptProvider } from '../services/candidateV2Live/promptProvider';

// Hybrid-to-LAILA evaluation: candidate-v2-evalv2-criterion-laila@offline-v1 on fold test_prompt1
// train+dev essays, excluding every essay used in earlier LAILA runs. Reads only *_essays_* files
// of train/dev; the test split is never opened. Writes only to OUT; no essay text, quotes or
// feedback are written. Paid calls need --execute AND HYBRID_LAILA_APPROVED_RUN = the printed
// config hash, so an approval covers exactly one configuration.
const [SPLITS, RUBRICS, PROMPTS, PRIOR_RUNS, PILOT_RESULTS, OUT] = process.argv.slice(2, 8);
const EXECUTE = process.argv.includes('--execute');
const FOLD = 'test_prompt1', MODEL = 'claude-sonnet-5-5', EFFORT = 'low' as const, N = 100, MAX_OUT = 3000, TIMEOUT = 120_000;
const SEED = 'enara-hybrid-laila-eval-v1';
const CAPS = { maxCalls: 290, maxUsd: 15 };
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

// Exclusions: every LAILA essay any earlier ENARA run has sent to a model.
const excluded = new Map<string, string>();
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.jsonl') ? [join(d, e.name)] : []));
for (const f of walk(PRIOR_RUNS)) for (const m of readFileSync(f, 'utf8').matchAll(/"sample_id":\s*"laila:(\d+)"/g)) excluded.set(String(Number(m[1])), 'prior eval-v2 / relevance runs');
for (const l of readFileSync(PILOT_RESULTS, 'utf8').split('\n').filter(Boolean)) excluded.set(String(Number(JSON.parse(l).essay_id)), 'candidate V2 pilot (informed this candidate)');

type Essay = { prompt_id: string; essay_id: string; essay: string; split: string };
const essays: Essay[] = [];
const splitFiles: Record<string, string> = {};
for (const split of ['train', 'dev']) {
  const f = join(SPLITS, FOLD, split, `${split}_essays_(${FOLD}).json`);
  splitFiles[`${FOLD}/${split}/${split}_essays_(${FOLD}).json`] = sha(readFileSync(f));
  for (const e of JSON.parse(readFileSync(f, 'utf8')) as Essay[]) essays.push({ ...e, split });
}
if (essays.some((e) => e.prompt_id === '1')) throw new Error('held-out prompt present in train/dev');
const eligible = essays.filter((e) => e.essay.trim() && !excluded.has(String(Number(e.essay_id))));
const byPrompt = new Map<string, Essay[]>();
for (const e of eligible) byPrompt.set(e.prompt_id, [...(byPrompt.get(e.prompt_id) ?? []), e]);
const prompts = [...byPrompt.keys()].sort();
const sample: Essay[] = [];
prompts.forEach((p, i) => {
  const k = Math.floor(N / prompts.length) + (i < N % prompts.length ? 1 : 0);
  sample.push(...byPrompt.get(p)!.sort((a, b) => sha(`${SEED}|${a.essay_id}`).localeCompare(sha(`${SEED}|${b.essay_id}`))).slice(0, k));
});

const price = PRICES[MODEL];
if (!price || price.status !== 'VERIFIED') throw new Error(`no verified price for ${MODEL}`);
const sysLen = EVALV2_SYSTEM('Arabic').length;
const rubricChars = Object.fromEntries(prompts.map((p) => [p, JSON.stringify(lailaRubric(RUBRICS, p).text).length + 2000]));
const perCallBound = sample.map((e) => priceBound({ model: MODEL, inputChars: sysLen + rubricChars[e.prompt_id] + e.essay.length, maxOutputTokens: MAX_OUT })!);
const meanBound = perCallBound.reduce((a, b) => a + b, 0) / sample.length;
const config = {
  candidate: CANDIDATE_VERSION, model: MODEL, effort: EFFORT, maxOutputTokens: MAX_OUT, timeoutMs: TIMEOUT, transportRetries: 0,
  fold: FOLD, splits: ['train', 'dev'], prompts, n: sample.length, seed: SEED, caps: CAPS,
  sampleIdsSha256: sha(sample.map((e) => e.essay_id).join(',')), evalv2SystemSha256: sha(EVALV2_SYSTEM('Arabic')),
};
const configHash = sha(JSON.stringify(config));
const estimate = {
  price: `${price.inputPerMTok}/${price.outputPerMTok} USD per MTok (${price.source})`,
  callsPerEssay: { min: 2, typical: '2-2.3', max: 6 },
  reservedBoundPerCallUsd: +meanBound.toFixed(4),
  worstCaseUncappedUsd: +(perCallBound.reduce((a, b) => a + b, 0) * 6).toFixed(2),
  worstCaseEnforcedUsd: +Math.min(CAPS.maxUsd, meanBound * CAPS.maxCalls).toFixed(2),
  expectedUsd: '≈ 5-7 (≈ 6.5k input + 1.2k output tokens per call, ≈ 230 calls)',
  maxTokens: { outputPerCall: MAX_OUT, outputTotal: MAX_OUT * CAPS.maxCalls },
};
mkdirSync(OUT, { recursive: true });
const PLAN = join(OUT, 'run_plan.json');
if (!existsSync(PLAN)) writeFileSync(PLAN, JSON.stringify({ config, configHash, estimate, eligible: eligible.length, excluded: excluded.size, perPrompt: Object.fromEntries(prompts.map((p) => [p, { eligible: byPrompt.get(p)!.length, sampled: sample.filter((e) => e.prompt_id === p).length }])), splitFiles,
  sample: sample.map((e) => ({ essay_id: e.essay_id, prompt_id: e.prompt_id, split: e.split })) }, null, 1));
console.log(JSON.stringify({ configHash, ...config, estimate, eligibleAfterExclusions: eligible.length, excludedIds: excluded.size }, null, 1));
if (!EXECUTE) process.exit(0);

if (process.env.HYBRID_LAILA_APPROVED_RUN !== configHash) throw new Error('no recorded approval for this exact configuration (HYBRID_LAILA_APPROVED_RUN)');
if (estimate.worstCaseEnforcedUsd > 15) throw new Error('enforced worst case exceeds $15');
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error('ANTHROPIC_API_KEY missing');
const RES = join(OUT, 'results.jsonl');
if (existsSync(RES)) throw new Error('results exist; refusing to overwrite');
const budget = new CandidateV2Budget(CAPS, (c) => priceBound(c));
const claimed = new Set<string>();
const store: ResultStore = { async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; }, async put() {} };
const questions = Object.fromEntries(prompts.map((p) => [p, JSON.parse(readFileSync(join(PROMPTS, `prompt${p}.json`), 'utf8')).prompt_text as string]));

const runOne = async (e: Essay) => {
  const { rubric, text } = lailaRubric(RUBRICS, e.prompt_id);
  const calls: { inputTokens: number; outputTokens: number; latencyMs: number; stopReason: string | null | undefined; model: string }[] = [];
  let trace: EvalV2Trace | undefined;
  const provider = anthropicPromptProvider({ apiKey: key, model: MODEL, effort: EFFORT, onReply: (r) => calls.push({ inputTokens: r.usage!.inputTokens, outputTokens: r.usage!.outputTokens, latencyMs: r.latencyMs, stopReason: r.stopReason, model: r.model }) });
  const grader = createEvalV2CriterionGrader({ provider, rubricText: text, budget, model: MODEL, maxOutputTokens: MAX_OUT, callTimeoutMs: TIMEOUT, onTrace: (_, t) => { trace = t; } });
  const t0 = Date.now();
  const r = await runCandidateV2({
    attempt: { id: e.essay_id, tenantId: 'laila-eval', assessmentVersion: 1, answers: [{ questionId: `laila-p${e.prompt_id}`, studentAnswer: e.essay }] },
    question: { id: `laila-p${e.prompt_id}`, type: 'open-response', text: questions[e.prompt_id], rubric }, assessmentVersion: 1, grader, store,
    config: { enabled: true, tenants: new Set(['laila-eval']), timeoutMs: TIMEOUT * 6 + 30_000 },
  });
  const res = r.result && 'criteria' in r.result ? r.result : null;
  const row = {
    essay_id: e.essay_id, prompt_id: e.prompt_id, split: e.split, status: r.status, reasonCode: r.reasonCode ?? null,
    scores: res ? Object.fromEntries(res.criteria.map((c) => [c.criterionId, c.points])) : null, total: res?.totalPoints ?? null,
    evidenceKept: res ? res.criteria.reduce((n, c) => n + c.evidence.length, 0) : null,
    decision: trace?.decision ?? null, attempts: trace?.events ?? [], callsTraced: trace?.calls ?? 0,
    droppedQuotes: (trace?.events ?? []).reduce((n, ev) => n + (ev.droppedQuotes ?? 0), 0),
    calls, latencyMs: Date.now() - t0,
  };
  appendFileSync(RES, JSON.stringify(row) + '\n');
};
(async () => {
  const queue = [...sample];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let e; (e = queue.shift()); ) await runOne(e); }));
  writeFileSync(join(OUT, 'run_meta.json'), JSON.stringify({ configHash, budget: { calls: budget.calls, reservedUsd: budget.reservedUsd }, finishedUtc: new Date().toISOString() }, null, 1));
  console.log('done', budget.calls, budget.reservedUsd.toFixed(4));
})();
