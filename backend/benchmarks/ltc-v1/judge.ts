// ENARA LTB v1.0 — secondary LLM judge (automated, provisional scores).
// Reads raw_results.jsonl + benchmark_cases.jsonl + rubric_v1.json and writes
// judge_results.jsonl and judge_attempts.jsonl. Sequential (concurrency 1),
// one retry at most per call, metered from provider-reported usage, hard stop
// at --cap. The judge never sees engine moves or deterministic check results.
//
//   npx tsx benchmarks/ltc-v1/judge.ts --key-file <path> --cap 8 [--limit N] [--dry]

import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { unitPriceUsd } from '../../src/services/priceCatalog';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const DIR = args.get('out') ?? path.resolve(__dirname, '../../../docs/benchmarks/language-teaching/20261109T-ltb-v1.0');
const DRY = args.has('dry');
const CAP = Number(args.get('cap') ?? '8');
const MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 6000;
const EFFORT = 'medium' as const;

const rubric = JSON.parse(readFileSync(path.join(DIR, 'rubric_v1.json'), 'utf8'));
const cases = new Map(readFileSync(path.join(DIR, 'benchmark_cases.jsonl'), 'utf8').trim().split('\n').map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
const rawFile = args.get('raw') ?? path.join(DIR, DRY ? 'dry_run_results.jsonl' : 'raw_results.jsonl');
let raw = readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (args.has('limit')) raw = raw.slice(0, Number(args.get('limit')));
// Self-consistency subset, fixed before the run: every 10th case in file order from index 0.
const order = [...cases.keys()];
const repeatIds = new Set(order.filter((_, i) => i % 10 === 0).slice(0, 12));

const DIMS: string[] = rubric.dimensions.map((d: { id: string }) => d.id);
const system = [
  'You are a careful evaluator of AI language-tutor replies for an English-as-a-foreign-language platform.',
  'Score the tutor\'s side of the conversation against the frozen rubric below and the case\'s expected and unacceptable behaviour.',
  'Score each dimension separately as an integer 0-4 using the anchors. Multi-turn cases: judge the whole conversation, with emphasis on the final tutor turn.',
  '"n/a" is allowed only for scaffolding_adaptation, and only when the conversation has a single learner turn.',
  'Learner facts are synthetic; the CEFR level is a provisional estimate supplied to the tutor as an estimate.',
  'Be strict and specific. Do not reward length. A reply that does the off-topic task, dumps the answer when a hint was needed, or claims mastery/progress without evidence must be penalised as the anchors say.',
  '',
  `RUBRIC (${rubric.rubricVersion}):`,
  JSON.stringify({ scale: rubric.scale, dimensions: rubric.dimensions, failureCategories: rubric.failureCategories, severity: rubric.severity }),
  '',
  'Reply with ONLY a JSON object, no prose, of this shape:',
  JSON.stringify({ scores: Object.fromEntries(DIMS.map((d) => [d, '0-4 or "n/a"'])), rationale: Object.fromEntries(DIMS.map((d) => [d, 'one sentence'])), failures: [{ category: 'one of failureCategories', severity: 'critical|major|minor', note: 'short' }] }),
].join('\n');

function userPrompt(c: any, r: any) {
  const caseView = {
    id: c.id, cohort: c.cohort, cefrEstimate: c.cefr, caseType: c.caseType, learner: c.learner, lesson: c.lesson, skill: c.skill,
    expectedBehavior: c.expectedBehavior, unacceptableBehavior: c.unacceptableBehavior, expectedNextMove: c.expectedNextMove,
    wordLimitPerReply: c.structuredExpectations?.maxWords,
  };
  const transcript = r.turns.map((t: any) => `LEARNER: ${t.learner}\nTUTOR: ${t.reply ?? '[no reply]'}`).join('\n\n');
  return `CASE:\n${JSON.stringify(caseView, null, 1)}\n\nTRANSCRIPT (${r.turns.length} learner turn${r.turns.length === 1 ? '' : 's'}):\n${transcript}`;
}

let meteredUsd = 0;
let seq = 0;
const cost = (u: Record<string, number | null | undefined>) =>
  (u.input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'input_token') ?? 0) + (u.output_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'output_token') ?? 0)
  + (u.cache_read_input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'cache_read_token') ?? 0)
  + (u.cache_creation_input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'cache_write_token') ?? unitPriceUsd('anthropic', MODEL, 'input_token') ?? 0);

const client = DRY ? null : new Anthropic({ apiKey: readFileSync(args.get('key-file')!, 'utf8').trim(), timeout: 120_000, maxRetries: 0 });
const ATT = path.join(DIR, DRY ? 'dry_judge_attempts.jsonl' : 'judge_attempts.jsonl');
const OUT = path.join(DIR, DRY ? 'dry_judge_results.jsonl' : 'judge_results.jsonl');

async function callOnce(caseId: string, pass: number, messages: Anthropic.MessageParam[]) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    seq += 1;
    const rec: Record<string, unknown> = { id: `jdg-${String(seq).padStart(4, '0')}`, caseId, pass, attempt, model: MODEL, maxTokens: MAX_TOKENS, effort: EFFORT, startedAt: new Date().toISOString() };
    const t0 = Date.now();
    if (DRY) {
      const text = JSON.stringify({ scores: Object.fromEntries(DIMS.map((d) => [d, 3])), rationale: {}, failures: [] });
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, costUsd: 0 }) + '\n');
      return text;
    }
    try {
      const res = await client!.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: EFFORT }, system, messages } as any);
      const usd = cost(res.usage as any);
      meteredUsd += usd;
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, latencyMs: Date.now() - t0, modelServed: res.model, stopReason: res.stop_reason, usage: res.usage, costUsd: Number(usd.toFixed(6)) }) + '\n');
      return res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e: any) {
      // A failed attempt may still have been billed only if usage came back; the SDK error carries none, so it is recorded at $0 with the status.
      appendFileSync(ATT, JSON.stringify({ ...rec, status: e?.status ?? 'network_error', latencyMs: Date.now() - t0, error: e?.name, costUsd: 0 }) + '\n');
      const retryable = !e?.status || e.status === 429 || e.status >= 500;
      if (!retryable || attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  return null;
}

function parse(text: string | null) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    for (const d of DIMS) {
      const v = j.scores?.[d];
      if (!(v === 'n/a' || (Number.isInteger(v) && v >= 0 && v <= 4))) return null;
    }
    return j;
  } catch { return null; }
}

async function judge(c: any, r: any, pass: number) {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt(c, r) }];
  let text = await callOnce(c.id, pass, messages);
  let j = parse(text);
  if (!j && text !== null && meteredUsd < CAP) {
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'That was not valid JSON in the required shape. Reply with only the JSON object.' });
    text = await callOnce(c.id, pass, messages);
    j = parse(text);
  }
  // n/a is only allowed on single-turn cases.
  if (j && r.turns.length > 1 && j.scores.scaffolding_adaptation === 'n/a') j.naViolation = true;
  return j;
}

(async () => {
  writeFileSync(OUT, ''); writeFileSync(ATT, '');
  let stopped: string | null = null;
  for (const r of raw) {
    const c = cases.get(r.caseId);
    for (const pass of repeatIds.has(r.caseId) ? [1, 2] : [1]) {
      if (meteredUsd >= CAP) { stopped = `judge cap reached at ${r.caseId}`; break; }
      const j = await judge(c, r, pass);
      appendFileSync(OUT, JSON.stringify({ caseId: r.caseId, pass, judgeModel: MODEL, label: 'automated provisional score (LLM judge)', result: j, unparseable: !j }) + '\n');
      console.log(r.caseId, pass, j ? DIMS.map((d) => j.scores[d]).join(',') : 'UNPARSEABLE', `$${meteredUsd.toFixed(4)}`);
    }
    if (stopped) break;
  }
  writeFileSync(path.join(DIR, DRY ? 'dry_judge_status.json' : 'judge_status.json'), JSON.stringify({ finishedAt: new Date().toISOString(), meteredUsd: Number(meteredUsd.toFixed(6)), calls: seq, stopped }, null, 2));
  console.log('judge done', meteredUsd.toFixed(4), stopped ?? '');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
