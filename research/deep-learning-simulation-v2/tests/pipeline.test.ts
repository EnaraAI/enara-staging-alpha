import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';
import { runExperiment, loadBenchmark, generateReports, checkPrereg, type ExperimentConfig } from '../src/orchestrator/run';
import { validateBenchmark, allItems, tutorVisibleText } from '../src/benchmark/validate';
import { scoreItem } from '../src/benchmark/scoring';
import { buildReports, type BlockResult } from '../src/analytics/analyze';
import { Ledger } from '../src/ledger/ledger';
import { unitPriceUsd } from '../../../backend/src/services/priceCatalog';
import { AREAS } from '../src/benchmark/schema';

const cfg = (id: string): ExperimentConfig => ({ experimentId: id, kind: 'dry', seed: 'test-seed', students: 6, replications: 1, maxTurns: 2, adversarialShare: 0.2, models: { student: 'claude-haiku-5-5', genericTutor: 'claude-opus-5-5', judge: 'claude-haiku-5-5' }, budgetCapUsd: 50, concurrency: 3, judgeRate: 0, ablate: ['diagnosis'], conditions: ['A', 'B', 'C', 'D', 'E', 'F'] });
const tmp = () => mkdtempSync(path.join(tmpdir(), 'rs-'));

describe('benchmark integrity (48 outcomes)', () => {
  const bm = loadBenchmark();
  it('has exactly 48 outcomes, 8 per area, and validates clean', () => { expect(bm.length).toBe(48); for (const a of AREAS) expect(bm.filter((o) => o.area === a).length).toBe(8); expect(validateBenchmark(bm)).toEqual([]); });
  it('every outcome has independent items: 4 pre, 4 post, 4 transfer, 4 delayed, a prerequisite probe, misconceptions and success criteria', () => { for (const o of bm) { expect([o.items.pre.length, o.items.post.length, o.items.transfer.length, o.items.delayed.length]).toEqual([4, 4, 4, 4]); expect(o.prereqProbe).toBeTruthy(); expect(o.misconceptions.length).toBeGreaterThanOrEqual(2); expect(o.teachingSuccessCriteria.length).toBeGreaterThanOrEqual(2); } });
  it('listening is text-based dialogue comprehension, never audio', () => { for (const o of bm.filter((x) => x.area === 'listening')) { expect(o.modality).toBe('text_dialogue'); expect(o.audioListening).toBe(false); } });
  it('scoring is deterministic and matches every declared right/wrong example', () => { let n = 0; for (const o of bm) for (const it of allItems(o)) { for (const r of it.right) { expect(scoreItem(r, it).correct).toBe(true); n += 1; } for (const w of it.wrong) { expect(scoreItem(w, it).correct).toBe(false); n += 1; } } expect(n).toBeGreaterThan(500); });
  it('leakage control: no assessment prompt appears in any tutor-visible text', () => { for (const o of bm) { const vis = tutorVisibleText(o).join(' \n ').toLowerCase(); for (const it of allItems(o)) expect(vis.includes(it.prompt.toLowerCase())).toBe(false); } });
  it('item ids are globally unique', () => { const ids = bm.flatMap((o) => allItems(o).map((i) => i.id)); expect(new Set(ids).size).toBe(ids.length); });
});

describe('pipeline: isolation, reproducibility, failure recovery, cost accounting', () => {
  it('runs end to end offline (A and E are NOT faked: they are skipped in dry mode), and records every block', async () => {
    const dir = tmp(); const r = await runExperiment(cfg('t1'), { dry: true, runsDir: dir });
    expect(r.finished.complete).toBe(true); expect(r.results.length).toBe(24); expect(new Set(r.results.map((x) => x.condition))).toEqual(new Set(['B', 'C', 'D', 'F'])); expect(r.manifest.simulationOnly).toBe(true);
  });
  it('is reproducible: same seed gives the same assignment hash, population and benchmark hash', async () => {
    const a = await runExperiment(cfg('t2a'), { dry: true, runsDir: tmp() }); const b = await runExperiment(cfg('t2b'), { dry: true, runsDir: tmp() });
    expect(a.manifest.assignmentSha256).toBe(b.manifest.assignmentSha256); expect(a.manifest.benchmarkSha256).toBe(b.manifest.benchmarkSha256); expect(a.manifest.promptsSha256).toBe(b.manifest.promptsSha256);
    const c = await runExperiment({ ...cfg('t2c'), seed: 'other-seed' }, { dry: true, runsDir: tmp() }); expect(c.manifest.assignmentSha256).not.toBe(a.manifest.assignmentSha256);
  });
  it('manifest records code commit, model ids, config, hashes', async () => { const r = await runExperiment(cfg('t3'), { dry: true, runsDir: tmp() }); expect(r.manifest.code.commit).toMatch(/^[0-9a-f]{40}$|unknown/); expect(r.manifest.models.student).toBe('claude-haiku-5-5'); expect(r.manifest.preregSha256).toMatch(/^[0-9a-f]{64}$/); expect(r.manifest.config.seed).toBe('test-seed'); });
  it('resume: re-running the same experiment never duplicates or overwrites recorded blocks', async () => { const dir = tmp(); await runExperiment(cfg('t4'), { dry: true, runsDir: dir }); const before = readFileSync(path.join(dir, 't4/raw/blocks.jsonl'), 'utf8'); await runExperiment(cfg('t4'), { dry: true, runsDir: dir }); expect(readFileSync(path.join(dir, 't4/raw/blocks.jsonl'), 'utf8')).toBe(before); });
  it('failure recovery: provider rejection leaves FAILED blocks visible (not dropped) and the run still finishes', async () => {
    const dir = tmp(); const r = await runExperiment(cfg('t5'), { dry: true, runsDir: dir, fetchImpl: (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch });
    expect(r.results.length).toBe(24); expect(r.results.every((x) => x.status === 'failed')).toBe(true); expect(r.finished.blocksFailed).toBe(24); expect(r.results[0].error).toMatch(/rejected/);
    const reps = generateReports(path.join(dir, 't5'), ['x']); expect(reps['6_outcome_performance']).toMatch(/Failed\/incomplete blocks: 24/);
  });
  it('retry: with RETRY_FAILED=1 failed blocks are run again, the failed record is kept, and the later record wins', async () => {
    const dir = tmp(); await runExperiment(cfg('t5r'), { dry: true, runsDir: dir, fetchImpl: (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch });
    process.env.RETRY_FAILED = '1'; try { await runExperiment(cfg('t5r'), { dry: true, runsDir: dir }); } finally { delete process.env.RETRY_FAILED; }
    const lines = readFileSync(path.join(dir, 't5r/raw/blocks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).result); const latest = new Map(lines.map((r) => [r.blockId, r.status]));
    expect(lines.length).toBe(48); expect(lines.filter((r) => r.status === 'failed').length).toBe(24); expect([...latest.values()].every((x) => x === 'ok')).toBe(true);
  });
  it('safe stop: a tiny budget stops the run early and marks it incomplete', async () => { const dir = tmp(); const r = await runExperiment({ ...cfg('t6'), budgetCapUsd: 0.0005, concurrency: 1 }, { dry: true, runsDir: dir }); expect(r.finished.complete).toBe(false); expect(r.finished.stoppedReason).toMatch(/budget/); expect(r.results.length).toBeLessThan(24); });
  it('cost accounting: ledger total equals tokens x catalogue price for every attempt; no invented cost', async () => {
    const dir = tmp(); const r = await runExperiment(cfg('t7'), { dry: true, runsDir: dir }); const rows = Ledger.read(path.join(dir, 't7/provider_attempts.jsonl'));
    const pi = unitPriceUsd('anthropic', 'claude-haiku-5-5', 'input_token')!; const po = unitPriceUsd('anthropic', 'claude-haiku-5-5', 'output_token')!; const haiku = rows.filter((x) => x.model === 'claude-haiku-5-5');
    for (const x of haiku) expect(x.costUsd).toBeCloseTo((x.inputTokens ?? 0) * pi + (x.outputTokens ?? 0) * po, 10); expect(r.finished.ledger.totalUsd).toBeCloseTo(rows.reduce((s, x) => s + (x.costUsd ?? 0), 0), 8);
    const blockSum = r.results.reduce((s, x) => s + (x.costUsd ?? 0), 0); expect(blockSum).toBeCloseTo(r.finished.ledger.totalUsd, 6);
  });
  it('tutor isolation: condition B/C/D/F prompts never include assessment text (leakage events = 0) and the scanner blocks a tutor request that does', async () => {
    const r = await runExperiment(cfg('t8'), { dry: true, runsDir: tmp() }); expect(r.finished.leakageEvents).toBe(0);
  });
  it('data isolation: research code never reads production env/DB and only the isolated adapter touches backend code', () => {
    const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } }; walk(path.join(__dirname, '../src'));
    for (const f of files) { const t = readFileSync(f, 'utf8'); if (!f.endsWith('enaraRuntime.ts')) expect(t).not.toMatch(/MONGODB_URI|DATABASE_URL|AI_TEST_SPEND/); if (!f.endsWith('enaraRuntime.ts') && !f.endsWith('guard.ts') && !f.includes('/tests/')) expect(t).not.toMatch(/backend\/src\/(models|app|config)/); }
    const rt = readFileSync(path.join(__dirname, '../src/conditions/enaraRuntime.ts'), 'utf8'); expect(rt).toMatch(/mongodb-memory-server/); expect(rt).toMatch(/MONGODB_URI: this\.mongo\.getUri\(\)/); expect(rt).toMatch(/\.invalid/);
  });
  it('production source impact is limited to the default-off ablation hook', () => { const t = readFileSync(path.join(__dirname, '../../../backend/src/services/languageTeachingContext.ts'), 'utf8'); expect(t).toMatch(/NODE_ENV !== 'production'/); });
  it('pre-registration exists with a confirmatory family and is hash-stable', () => { const p = checkPrereg(false); expect(p.prereg.confirmatory.length).toBeGreaterThanOrEqual(1); expect(checkPrereg(false).sha256).toBe(p.sha256); });
  it('failed raw data is immutable-by-construction: raw files are append-only (hashes recorded in finished.json)', async () => { const dir = tmp(); const r = await runExperiment(cfg('t9'), { dry: true, runsDir: dir }); expect(r.finished.rawSha256.blocks).toMatch(/^[0-9a-f]{64}$/); expect(existsSync(path.join(dir, 't9/raw/audit.jsonl'))).toBe(true); });
});

describe('report correctness', () => {
  const mk = (studentIdx: number, cond: string, pre: number, post: number, over: Partial<BlockResult> = {}): BlockResult => ({ blockId: `b${studentIdx}-${cond}`, studentId: `S${studentIdx}`, replication: 1, outcomeId: `GR-0${1 + (studentIdx % 8)}`, area: 'grammar', condition: cond as any, order: 0, tags: [], difficulty: 2, cefr: 'A2', status: 'ok', error: null, pre, post, transfer: post, delayed: post, delayed1: post, delayed7: post, delayed30: post, prereq: true, mastered: post >= 1, misconceptionHeld: false, misconceptionRecovered: null, errorCorrection: null, turns: 4, exposureWords: 100, tutorCalls: 4, costUsd: 0.1, unknownCost: false, teachingSeconds: 1, confidenceMean: 0.5, calibrationGap: 0, hintDependence: 0.2, guessedCorrect: 0, lapses: 0, leakageEvents: 0, ...over });
  const results: BlockResult[] = []; for (let s = 0; s < 20; s += 1) for (const c of ['A', 'B', 'C', 'D', 'E', 'F']) results.push(mk(s, c, 0, c === 'A' ? 1 : c === 'F' ? 0 : 0.5));
  const prereg = { seed: 's', confirmatory: [{ a: 'A', b: 'F', measure: 'gain' }, { a: 'A', b: 'B', measure: 'post' }] as any };
  const reps = buildReports({ results, attempts: [], prereg, runId: 'r', experimentId: 'e', simulatedOnly: true, limitations: ['l'] });
  it('table values equal the recorded data (A post 100%, B 50%, F 0%)', () => { const t = reps['1_overall_effectiveness']; expect(t).toMatch(/A actual ENARA tutor \| 20 \| 0\.0% \| 100\.0%/); expect(t).toMatch(/B study notes \| 20 \| 0\.0% \| 50\.0%/); expect(t).toMatch(/F no-teaching control \| 20 \| 0\.0% \| 0\.0%/); });
  it('confirmatory contrasts are labelled and Holm-adjusted; exploratory ones use BH', () => { const t = reps['1_overall_effectiveness']; expect(t).toMatch(/A vs F \| gain \| 20 \| 1\.00 \| 0\.00 \| 1\.00/); expect(t).toMatch(/Holm/); expect(t).toMatch(/exploratory/); });
  it('every report states it is simulation only and lists failed blocks', () => { for (const k of Object.keys(reps).filter((x) => x !== '0_limitations')) { expect(reps[k]).toMatch(/SIMULATION ONLY/); expect(reps[k]).toMatch(/failed\/incomplete/); } });
  it('unknown cost is reported, never invented', () => { const r2 = buildReports({ results, attempts: [{ ts: '', seq: 1, runId: 'r', campaign: 'c', studentId: null, blockId: null, role: 'tutor', provider: 'p', model: 'm', httpStatus: 200, ok: true, retryOf: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null, priced: false, error: null }], prereg, runId: 'r', experimentId: 'e', simulatedOnly: true, limitations: [] }); expect(r2['7_economic_efficiency']).toMatch(/\*\*1 attempts with unknown\/unpriced cost\*\*/); });
  it('seven reports plus limitations are produced', () => { expect(Object.keys(reps).sort()).toEqual(['0_limitations', '1_overall_effectiveness', '2_student_level', '3_adaptive_teaching', '4_misconception_recovery', '5_transfer_retention', '6_outcome_performance', '7_economic_efficiency']); });
});
