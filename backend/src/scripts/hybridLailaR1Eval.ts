import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EVALV2_SYSTEM } from '../services/candidateV2/evalV2Criterion';
import { createR1Grader, lailaRubricR1, R1_CANDIDATE_VERSION as CANDIDATE_VERSION, R1_SYSTEM_SUFFIX, LAILA_ZERO_SENTENCE_SHA256, type R1Trace } from '../services/candidateV2/lailaR1';
import { SettledBudget } from '../services/candidateV2/settledBudget';
import { rubricTextHash } from '../services/candidateV2/rubricIntegrity';
import { priceBound, PRICES } from '../services/candidateV2/pricing';
import { runCandidateV2, type ResultStore } from '../services/candidateV2/runner';
import { anthropicPromptProvider } from '../services/candidateV2Live/promptProvider';

// Fresh B-only validation of candidate-v2-evalv2-criterion-laila@offline-v2 (R1) on fold
// test_prompt1 train+dev essays, excluding every id in the diagnosis exclusion list (306 ids).
// Main sample: 140 essays (20 per prompt) chosen by seeded hash without labels. Relevance recall
// set: 30 further essays with gold relevance 0 (15) or 1 (15), seeded, reported separately.
// The test split is never opened. Writes only to OUT; no essay text, quotes or feedback.
// Paid calls need --execute AND HYBRID_LAILA_APPROVED_RUN = the printed config hash.
const [SPLITS, RUBRICS, PROMPTS, EXCLUSIONS, OUT] = process.argv.slice(2, 7);
const EXECUTE = process.argv.includes('--execute');
const FOLD = 'test_prompt1', MODEL = 'claude-sonnet-5-5', EFFORT = 'low' as const, PER_PROMPT = 20, RECALL_PER_LEVEL = 15, MAX_OUT = 3000, TIMEOUT = 120_000;
const SEED = 'enara-hybrid-laila-fresh-v1';
const CAPS = { maxCalls: 500, maxUsd: 12.5 };
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

// Exclusions: pilot, first evaluation and earlier eval-v2/relevance runs (verified ids).
const ex = JSON.parse(readFileSync(EXCLUSIONS, 'utf8')) as Record<string, string[]>;
const excluded = new Map<string, string>();
for (const [why, ids] of Object.entries(ex)) for (const id of ids) excluded.set(String(Number(id)), why);
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
const order = (a: Essay, b: Essay) => sha(`${SEED}|${a.essay_id}`).localeCompare(sha(`${SEED}|${b.essay_id}`));
const main: Essay[] = prompts.flatMap((p) => [...byPrompt.get(p)!].sort(order).slice(0, PER_PROMPT));
// Recall set: selected by gold relevance (labels read here only), never pooled with the main sample.
const gold = new Map<string, string>();
for (const split of ['train', 'dev']) {
  const lines = readFileSync(join(SPLITS, FOLD, split, `${split}_human_scores_(${FOLD}).csv`), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  for (const l of lines.slice(1)) { const c = l.split(','); gold.set(c[head.indexOf('essay_id')], c[head.indexOf('relevance')]); }
}
const inMain = new Set(main.map((e) => e.essay_id));
const recall: Essay[] = ['0', '1'].flatMap((lv) => eligible.filter((e) => !inMain.has(e.essay_id) && gold.get(e.essay_id) === lv).sort(order).slice(0, RECALL_PER_LEVEL));
const sample: (Essay & { set: 'main' | 'recall' })[] = [...main.map((e) => ({ ...e, set: 'main' as const })), ...recall.map((e) => ({ ...e, set: 'recall' as const }))];
const N = sample.length;
const price = PRICES[MODEL];
if (!price || price.status !== 'VERIFIED') throw new Error(`no verified price for ${MODEL}`);
const sysLen = EVALV2_SYSTEM('Arabic').length;
const rubricChars = Object.fromEntries(prompts.map((p) => [p, JSON.stringify(lailaRubricR1(RUBRICS, p).text).length + 2000 + R1_SYSTEM_SUFFIX.length]));
const perCallBound = sample.map((e) => priceBound({ model: MODEL, inputChars: sysLen + rubricChars[e.prompt_id] + e.essay.length, maxOutputTokens: MAX_OUT })!);
const meanBound = perCallBound.reduce((a, b) => a + b, 0) / sample.length;
const config = {
  candidate: CANDIDATE_VERSION, model: MODEL, effort: EFFORT, maxOutputTokens: MAX_OUT, timeoutMs: TIMEOUT, transportRetries: 0,
  fold: FOLD, splits: ['train', 'dev'], prompts, n: sample.length, seed: SEED, caps: CAPS,
  sampleIdsSha256: sha(sample.map((e) => `${e.set}:${e.essay_id}`).join(',')), evalv2SystemSha256: sha(EVALV2_SYSTEM('Arabic')),
  r1SuffixSha256: sha(R1_SYSTEM_SUFFIX), zeroSentenceSha256: LAILA_ZERO_SENTENCE_SHA256, exclusionsSha256: sha(readFileSync(EXCLUSIONS)),
  rubricTextSha256: Object.fromEntries(prompts.map((p) => [p, rubricTextHash(lailaRubricR1(RUBRICS, p).text)])),
  budget: 'settled (bound reserved before each call, measured cost booked after)',
};
const configHash = sha(JSON.stringify(config));
const estimate = {
  price: `${price.inputPerMTok}/${price.outputPerMTok} USD per MTok (${price.source})`,
  callsPerEssay: { min: 2, typical: '2-2.3', max: 6 },
  reservedBoundPerCallUsd: +meanBound.toFixed(4),
  worstCaseUncappedUsd: +(perCallBound.reduce((a, b) => a + b, 0) * 6).toFixed(2),
  worstCaseEnforcedUsd: CAPS.maxUsd,
  expectedUsd: `≈ ${(N * 2.03 * 0.0242).toFixed(2)} (measured: 2.03 calls per essay, $0.0242 per call)`,
  maxTokens: { outputPerCall: MAX_OUT, outputTotal: MAX_OUT * CAPS.maxCalls },
};
mkdirSync(OUT, { recursive: true });
const PLAN = join(OUT, 'run_plan.json');
if (!existsSync(PLAN)) writeFileSync(PLAN, JSON.stringify({ config, configHash, estimate, eligible: eligible.length, excluded: excluded.size, perPrompt: Object.fromEntries(prompts.map((p) => [p, { eligible: byPrompt.get(p)!.length, main: main.filter((e) => e.prompt_id === p).length, recall: recall.filter((e) => e.prompt_id === p).length }])), splitFiles,
  sample: sample.map((e) => ({ essay_id: e.essay_id, prompt_id: e.prompt_id, split: e.split, set: e.set })) }, null, 1));
console.log(JSON.stringify({ configHash, ...config, estimate, eligibleAfterExclusions: eligible.length, excludedIds: excluded.size }, null, 1));
if (!EXECUTE) process.exit(0);

if (process.env.HYBRID_LAILA_APPROVED_RUN !== configHash) throw new Error('no recorded approval for this exact configuration (HYBRID_LAILA_APPROVED_RUN)');
if (estimate.worstCaseEnforcedUsd > 15) throw new Error('enforced worst case exceeds $15');
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error('ANTHROPIC_API_KEY missing');
const RES = join(OUT, 'results.jsonl');
if (existsSync(RES)) throw new Error('results exist; refusing to overwrite');
const budget = new SettledBudget(CAPS, (c) => priceBound(c));
const claimed = new Set<string>();
const store: ResultStore = { async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; }, async put() {} };
const questions = Object.fromEntries(prompts.map((p) => [p, JSON.parse(readFileSync(join(PROMPTS, `prompt${p}.json`), 'utf8')).prompt_text as string]));

const runOne = async (e: (typeof sample)[number]) => {
  const { rubric, text } = lailaRubricR1(RUBRICS, e.prompt_id);
  const calls: { inputTokens: number; outputTokens: number; latencyMs: number; stopReason: string | null | undefined; model: string }[] = [];
  let trace: R1Trace | undefined;
  const provider = anthropicPromptProvider({ apiKey: key, model: MODEL, effort: EFFORT, onReply: (r) => calls.push({ inputTokens: r.usage!.inputTokens, outputTokens: r.usage!.outputTokens, latencyMs: r.latencyMs, stopReason: r.stopReason, model: r.model }) });
  const grader = createR1Grader({ provider, rubricText: text, budget, model: MODEL, maxOutputTokens: MAX_OUT, callTimeoutMs: TIMEOUT, onTrace: (_, t) => { trace = t; } });
  const t0 = Date.now();
  const r = await runCandidateV2({
    attempt: { id: e.essay_id, tenantId: 'laila-eval', assessmentVersion: 1, answers: [{ questionId: `laila-p${e.prompt_id}`, studentAnswer: e.essay }] },
    question: { id: `laila-p${e.prompt_id}`, type: 'open-response', text: questions[e.prompt_id], rubric }, assessmentVersion: 1, grader, store,
    config: { enabled: true, tenants: new Set(['laila-eval']), timeoutMs: TIMEOUT * 6 + 30_000 },
  });
  const res = r.result && 'criteria' in r.result ? r.result : null;
  const row = {
    essay_id: e.essay_id, prompt_id: e.prompt_id, split: e.split, set: e.set, status: r.status, reasonCode: r.reasonCode ?? null,
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
  writeFileSync(join(OUT, 'run_meta.json'), JSON.stringify({ configHash, budget: { calls: budget.calls, settledCalls: budget.settledCalls, actualUsd: budget.actualUsd, bookedUsd: budget.reservedUsd }, finishedUtc: new Date().toISOString() }, null, 1));
  console.log('done', budget.calls, budget.actualUsd.toFixed(4));
})();
