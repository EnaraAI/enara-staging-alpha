import { createHash } from 'crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CandidateV2Budget } from '../services/candidateV2/budget';
import { lailaRubric } from '../services/candidateV2/lailaAdapter';
import { anthropicProvider } from '../services/candidateV2Live/liveProvider';
import { createNativeGrader } from '../services/candidateV2/nativeGrader';
import { priceBound } from '../services/candidateV2/pricing';
import { PROMPT_SHA256 } from '../services/candidateV2/promptV1';
import { runCandidateV2, type ResultStore } from '../services/candidateV2/runner';

// Candidate V2 LAILA pilot (approved: Sonnet 5.5, fold test_prompt1 train+dev, caps below).
// Reads only *_essays_* files of train/dev; never touches the test split. Writes only to OUT;
// no essay text, evidence or feedback is written. Without --execute it only prints the plan.
const [SPLITS, RUBRICS, PROMPTS, OUT] = process.argv.slice(2, 6);
const EXECUTE = process.argv.includes('--execute');
const FOLD = 'test_prompt1', MODEL = 'claude-sonnet-5-5', N = 100, MAX_OUT = 2000, TIMEOUT = 120_000, SEED = 'enara-cv2-laila-pilot-v1';
const CAPS = { maxCalls: 100, maxUsd: 5 };

type Essay = { prompt_id: string; essay_id: string; essay: string };
const essays: (Essay & { split: string })[] = [];
for (const split of ['train', 'dev']) for (const e of JSON.parse(readFileSync(join(SPLITS, FOLD, split, `${split}_essays_(${FOLD}).json`), 'utf8')) as Essay[]) essays.push({ ...e, split });
if (essays.some((e) => e.prompt_id === '1')) throw new Error('test prompt present in train/dev');
const h = (s: string) => createHash('sha256').update(s).digest('hex');
const byPrompt = new Map<string, typeof essays>();
for (const e of essays) byPrompt.set(e.prompt_id, [...(byPrompt.get(e.prompt_id) ?? []), e]);
const prompts = [...byPrompt.keys()].sort();
const sample: typeof essays = [];
prompts.forEach((p, i) => {
  const k = Math.floor(N / prompts.length) + (i < N % prompts.length ? 1 : 0);
  sample.push(...byPrompt.get(p)!.sort((a, b) => h(`${SEED}|${a.essay_id}`).localeCompare(h(`${SEED}|${b.essay_id}`))).slice(0, k));
});
const est = sample.map((e) => priceBound({ model: MODEL, inputChars: 10_000 + e.essay.length, maxOutputTokens: MAX_OUT })!);
console.log(JSON.stringify({ fold: FOLD, model: MODEL, prompt: PROMPT_SHA256, n: sample.length, perPrompt: Object.fromEntries(prompts.map((p) => [p, sample.filter((e) => e.prompt_id === p).length])), caps: CAPS, worstCaseUsdApprox: est.reduce((a, b) => a + b, 0) }));
if (!EXECUTE) process.exit(0);

const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error('ANTHROPIC_API_KEY missing');
const RES = join(OUT, 'results.jsonl');
if (existsSync(RES)) throw new Error('results exist; refusing to overwrite');
const budget = new CandidateV2Budget(CAPS, (c) => priceBound(c));
const claimed = new Set<string>();
const store: ResultStore = { async claim(k) { if (claimed.has(k)) return false; claimed.add(k); return true; }, async put() {} };
const rubricHashes: Record<string, string> = {};
const run = async (e: (typeof sample)[number]) => {
  const { rubric, text } = lailaRubric(RUBRICS, e.prompt_id);
  let usage: { inputTokens: number; outputTokens: number } | undefined, stop: string | null | undefined;
  const provider = anthropicProvider({ apiKey: key, model: MODEL, maxOutputTokens: MAX_OUT, onUsage: (u) => { usage = u.usage; stop = u.stopReason; } });
  const grader = createNativeGrader({ provider, rubricText: text, budget, model: MODEL, maxOutputTokens: MAX_OUT, callTimeoutMs: TIMEOUT });
  rubricHashes[e.prompt_id] = grader.rubricTextSha256;
  const question = JSON.parse(readFileSync(join(PROMPTS, `prompt${e.prompt_id}.json`), 'utf8')).prompt_text as string;
  const t0 = Date.now();
  const r = await runCandidateV2({
    attempt: { id: e.essay_id, tenantId: 'laila-eval', assessmentVersion: 1, answers: [{ questionId: `laila-p${e.prompt_id}`, studentAnswer: e.essay }] },
    question: { id: `laila-p${e.prompt_id}`, type: 'open-response', text: question, rubric }, assessmentVersion: 1, grader, store,
    config: { enabled: true, tenants: new Set(['laila-eval']), timeoutMs: TIMEOUT + 10_000 },
  });
  const crit = r.result && 'criteria' in r.result ? Object.fromEntries(r.result.criteria.map((c) => [c.criterionId, c.points])) : null;
  const row = { essay_id: e.essay_id, prompt_id: e.prompt_id, split: e.split, status: r.status, reasonCode: r.reasonCode ?? null, scores: crit,
    total: r.result && 'totalPoints' in r.result ? r.result.totalPoints : null, usage: usage ?? null, stopReason: stop ?? null, latencyMs: Date.now() - t0 };
  appendFileSync(RES, JSON.stringify(row) + '\n');
  return row;
};
(async () => {
  const queue = [...sample];
  const rows: unknown[] = [];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let e; (e = queue.shift()); ) rows.push(await run(e)); }));
  writeFileSync(join(OUT, 'run_meta.json'), JSON.stringify({ budget: { calls: budget.calls, reservedUsd: budget.reservedUsd }, rubricTextSha256: rubricHashes, promptSha256: PROMPT_SHA256, n: rows.length }, null, 1));
  console.log('done', rows.length, budget.calls, budget.reservedUsd.toFixed(4));
})();
