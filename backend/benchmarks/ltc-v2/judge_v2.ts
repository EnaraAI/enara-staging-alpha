// ENARA LTB fixture v2: rubric v2 evaluator (POST-13). Replaces nothing: the v1
// judge (benchmarks/ltc-v1/judge.ts) stays frozen for historical runs.
//
// Reads fixture v2 cases + a v2 run (run_fixture_v2.ts raw_results.jsonl) and
// scores each case against rubric v2 from the case's evaluatorView ONLY. Every
// selected case's evaluatorView is validated before the first provider call; a
// missing or malformed view aborts the run (no fallback).
//
// Roles are stored separately: --role official -> judge_v2_official.jsonl,
// --role independent -> judge_v2_independent.jsonl.
//
//   npx tsx benchmarks/ltc-v2/judge_v2.ts --role official --cases <jsonl> --raw <raw_results.jsonl> \
//     --rubric <rubric_v2_machine.json> --out <dir> --cap 2 --key-file <path> [--ids a,b] [--dry]

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { unitPriceUsd } from '../../src/services/priceCatalog';
import {
  EVALUATOR_CORE_VERSION, OUTCOME_POLICY, VIEW_VERSION, computeOutcomeV2, promptSha256, deterministicChecks, loadRubricV2, parseJudgeOutput,
  requireEvaluatorView, systemPrompt, userPrompt, type RawTurn,
} from './judge_v2_core';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true');
}
const need = (k: string) => { const v = args.get(k); if (!v) throw new Error(`--${k} is required`); return v; };
const ROLE = need('role');
if (!['official', 'independent'].includes(ROLE)) throw new Error('--role official|independent');
const DRY = args.has('dry');
const CAP = Number(args.get('cap') ?? '1');
const MODEL = args.get('model') ?? (ROLE === 'official' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5');
const EFFORT = (args.get('effort') ?? (ROLE === 'official' ? 'medium' : 'low')) as 'low' | 'medium' | 'high';
const MAX_TOKENS = Number(args.get('max-tokens') ?? '6000');
const OUT_DIR = need('out');
const CASES_FILE = need('cases');
const RAW_FILE = need('raw');
const RUBRIC_FILE = need('rubric');

const rubricText = readFileSync(RUBRIC_FILE, 'utf8');
const { rubric, sha256: rubricSha256 } = loadRubricV2(rubricText);
const casesBuf = readFileSync(CASES_FILE);
const fixtureSha256 = createHash('sha256').update(casesBuf).digest('hex');
const cases = new Map(casesBuf.toString('utf8').trim().split('\n').map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
let raw: { caseId: string; turns: RawTurn[] }[] = readFileSync(RAW_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (args.has('ids')) { const ids = new Set(args.get('ids')!.split(',')); raw = raw.filter((r) => ids.has(r.caseId)); }

// Explicit failure before any paid call: every selected case must have a valid view.
const views = new Map(raw.map((r) => {
  const c = cases.get(r.caseId);
  if (!c) throw new Error(`case ${r.caseId} not in the fixture`);
  return [r.caseId, requireEvaluatorView(c)];
}));

const SYSTEM = systemPrompt(rubric);
const cost = (u: Record<string, number | null | undefined>) =>
  (u.input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'input_token') ?? NaN) + (u.output_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'output_token') ?? NaN)
  + (u.cache_read_input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'cache_read_token') ?? NaN)
  + (u.cache_creation_input_tokens ?? 0) * (unitPriceUsd('anthropic', MODEL, 'cache_write_token') ?? unitPriceUsd('anthropic', MODEL, 'input_token') ?? NaN);

mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, `${DRY ? 'dry_' : ''}judge_v2_${ROLE}.jsonl`);
const ATT = path.join(OUT_DIR, `${DRY ? 'dry_' : ''}judge_v2_${ROLE}_attempts.jsonl`);
const client = DRY ? null : new Anthropic({ apiKey: readFileSync(need('key-file'), 'utf8').trim(), timeout: 120_000, maxRetries: 0 });
let meteredUsd = 0;
let seq = 0;
let retries = 0;

async function callOnce(caseId: string, messages: Anthropic.MessageParam[]): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    seq += 1;
    const rec: Record<string, unknown> = { id: `j2-${ROLE}-${String(seq).padStart(4, '0')}`, caseId, attempt, model: MODEL, effort: EFFORT, maxTokens: MAX_TOKENS, startedAt: new Date().toISOString() };
    if (DRY) {
      const scores = Object.fromEntries(rubric.dimensions.map((d) => [d.id, 3]));
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, costUsd: 0 }) + '\n');
      return JSON.stringify({ scores, evidence: {}, failures: [] });
    }
    const t0 = Date.now();
    try {
      const res = await client!.messages.create({
        model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: EFFORT },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages,
      } as never) as Anthropic.Message;
      const usd = cost(res.usage as never);
      if (!Number.isFinite(usd)) throw Object.assign(new Error('unpriced usage: cost attribution unreliable'), { fatal: true });
      meteredUsd += usd;
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, latencyMs: Date.now() - t0, modelServed: res.model, stopReason: res.stop_reason, usage: res.usage, costUsd: Number(usd.toFixed(6)) }) + '\n');
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      const err = e as { status?: number; name?: string; fatal?: boolean };
      if (err.fatal) throw e;
      appendFileSync(ATT, JSON.stringify({ ...rec, status: err.status ?? 'network_error', latencyMs: Date.now() - t0, error: err.name, costUsd: 0 }) + '\n');
      const retryable = !err.status || err.status === 429 || err.status >= 500;
      if (!retryable || attempt === 2) return null;
      retries += 1;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  return null;
}

(async () => {
  writeFileSync(OUT, ''); writeFileSync(ATT, '');
  let stopped: string | null = null;
  for (const r of raw) {
    if (meteredUsd >= CAP) { stopped = `cap $${CAP} reached before ${r.caseId}`; break; }
    const view = views.get(r.caseId)!;
    const det = deterministicChecks(r.turns);
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt(view, r.turns) }];
    let text = await callOnce(r.caseId, messages);
    let j = parseJudgeOutput(text, rubric);
    if (!j && text !== null && meteredUsd < CAP) {
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'That was not one valid JSON object in the required shape. Reply with only the JSON object.' });
      text = await callOnce(r.caseId, messages);
      j = parseJudgeOutput(text, rubric);
    }
    const outcome = j ? computeOutcomeV2(j, det, rubric) : null;
    appendFileSync(OUT, JSON.stringify({
      caseId: r.caseId, role: ROLE, evaluatorModel: MODEL, effort: EFFORT,
      fixtureVersion: 'ltb-fixture-v2', fixtureSha256, rubricVersion: rubric.rubricVersion, rubricMachineFormat: rubric.machineFormat, rubricSha256,
      viewVersion: VIEW_VERSION, coreVersion: EVALUATOR_CORE_VERSION, promptSha256: promptSha256(rubric), outcomePolicy: OUTCOME_POLICY.id, maxTokens: MAX_TOKENS,
      label: ROLE === 'official' ? 'automated provisional score (official LLM evaluator, rubric v2 draft)' : 'independent automated review (separate model, rubric v2 draft)',
      deterministic: det, result: j, outcome, unparseable: !j,
    }) + '\n');
    console.log(r.caseId, outcome ? `${outcome.outcome} ${outcome.mean}` : 'UNPARSEABLE', `$${meteredUsd.toFixed(4)}`);
  }
  const status = { role: ROLE, model: MODEL, effort: EFFORT, finishedAt: new Date().toISOString(), cases: raw.length, calls: seq, retries, meteredUsd: Number(meteredUsd.toFixed(6)), capUsd: CAP, stopped, rubricSha256, fixtureSha256, viewVersion: VIEW_VERSION, dry: DRY };
  writeFileSync(path.join(OUT_DIR, `${DRY ? 'dry_' : ''}judge_v2_${ROLE}_status.json`), JSON.stringify(status, null, 2));
  console.log('judge_v2 done', JSON.stringify(status));
})().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
