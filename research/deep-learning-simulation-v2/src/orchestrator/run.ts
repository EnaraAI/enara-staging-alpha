import { AsyncLocalStorage } from 'async_hooks';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { sha256 } from '../util/rng';
import { AREAS, type Area, type Outcome } from '../benchmark/schema';
import { validateBenchmark, allItems } from '../benchmark/validate';
import { assign, assignmentHash, CONDITIONS, type Block, type Condition } from '../design/assignment';
import { makeStudent, blockStart, studentPersona, type StudentState } from '../students/population';
import { populationChecks } from '../students/validity';
import { Ledger, BudgetExceeded, summarizeLedger } from '../ledger/ledger';
import { Provider, OutgoingScanner, installFetchGuard, readKey, LeakageDetected, type CallCtx } from '../providers/guard';
import { conditionB, conditionC, conditionD, conditionF } from '../conditions/simple';
import { enaraCondition } from '../conditions/enara';
import { EnaraRuntime } from '../conditions/enaraRuntime';
import type { ConditionAdapter, TeachingRecord } from '../conditions/types';
import { assessBlock, assessAfter, mastery, frac, dimensions, type BlockScores } from '../evaluation/assess';
import { judgeSample, agreement, leakageScan, disagreementSample, type JudgeRecord } from '../evaluation/judge';
import { buildReports, type BlockResult, type Prereg } from '../analytics/analyze';

export interface ExperimentConfig {
  experimentId: string; kind: 'validation_campaign' | 'full_experiment' | 'dry'; seed: string; students: number; replications: number; maxTurns: number; adversarialShare: number;
  models: { student: string; genericTutor: string; judge: string }; budgetCapUsd: number; concurrency: number; judgeRate: number; ablate: string[]; conditions: Condition[]; samples?: number;
}
const ROOT = path.resolve(__dirname, '../..');
export const loadBenchmark = (): Outcome[] => readdirSync(path.join(ROOT, 'benchmark/outcomes')).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(readFileSync(path.join(ROOT, 'benchmark/outcomes', f), 'utf8')).outcomes as Outcome[]);
const git = (c: string) => { try { return execSync(`git ${c}`, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
const filesHash = (files: string[]) => sha256(files.map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n---\n'));

export function lockPrereg(): string { const p = path.join(ROOT, 'config/preregistration.json'); const h = sha256(readFileSync(p)); writeFileSync(path.join(ROOT, 'config/preregistration.lock'), JSON.stringify({ sha256: h, lockedAt: new Date().toISOString(), commit: git('rev-parse HEAD') }, null, 2)); return h; }
export function checkPrereg(requireLock: boolean): { prereg: Prereg; sha256: string; locked: boolean } {
  const p = path.join(ROOT, 'config/preregistration.json'); const prereg = JSON.parse(readFileSync(p, 'utf8')) as Prereg; const h = sha256(readFileSync(p)); const lf = path.join(ROOT, 'config/preregistration.lock');
  const locked = existsSync(lf) && JSON.parse(readFileSync(lf, 'utf8')).sha256 === h;
  if (requireLock && !locked) throw new Error('pre-registration is not locked (or changed since locking): run `lock-prereg` and commit it before the main experiment');
  return { prereg, sha256: h, locked };
}

export async function runExperiment(cfg: ExperimentConfig, opts: { dry?: boolean; fetchImpl?: typeof fetch; runsDir?: string } = {}) {
  const runId = `${cfg.experimentId}-${new Date().toISOString().replace(/[:.]/g, '-')}`; const dir = path.join(opts.runsDir ?? path.join(ROOT, 'runs'), cfg.experimentId); mkdirSync(path.join(dir, 'raw'), { recursive: true });
  const outcomes = loadBenchmark(); const bErr = validateBenchmark(outcomes); if (bErr.length) throw new Error(`benchmark invalid: ${bErr[0]}`);
  const byId = new Map(outcomes.map((o) => [o.id, o])); const outcomesByArea = Object.fromEntries(AREAS.map((a) => [a, outcomes.filter((o) => o.area === a).map((o) => o.id)])) as Record<Area, string[]>;
  const pr = checkPrereg(cfg.kind === 'full_experiment');
  const pop: StudentState[] = Array.from({ length: cfg.students }, (_, i) => makeStudent(i, cfg.seed, { adversarial: i < Math.round(cfg.students * cfg.adversarialShare) }));
  const popChecks = populationChecks(pop.map((s) => s)).filter((c) => !c.pass && cfg.students >= 100 && cfg.students <= 200);
  const allBlocks: Block[] = []; const active = opts.dry ? cfg.conditions.filter((c) => c !== 'A' && c !== 'E') : cfg.conditions; // dry mode never fakes the real ENARA tutor: A/E are simply not run
  for (let rep = 1; rep <= cfg.replications; rep += 1) allBlocks.push(...assign({ seed: cfg.seed, replication: rep, students: pop.map((s) => s.id), outcomesByArea }).filter((b) => active.includes(b.condition)));
  const manifest = {
    runId, experimentId: cfg.experimentId, kind: cfg.kind, startedAt: new Date().toISOString(), config: cfg, preregSha256: pr.sha256, preregLocked: pr.locked,
    code: { commit: git('rev-parse HEAD'), dirty: git('status --porcelain -- .') !== '', branch: git('rev-parse --abbrev-ref HEAD') }, node: process.version,
    benchmarkSha256: sha256(JSON.stringify(outcomes)), promptsSha256: filesHash(['src/conditions/types.ts', 'src/conditions/simple.ts', 'src/conditions/enara.ts', 'src/students/population.ts', 'src/evaluation/assess.ts', 'src/evaluation/judge.ts']),
    assignmentSha256: assignmentHash(allBlocks), blocksPlanned: allBlocks.length, populationChecksFailed: popChecks, models: cfg.models, enaraTutorRoute: 'POST /api/me/tutor/sessions/:id/messages (real controller, in-process, throwaway DB)', tutorModelNote: 'tutor/intent models are ENARA defaults from backend config; recorded per call in provider_attempts.jsonl',
    ablatedFeatures: cfg.ablate, simulationOnly: true,
  };
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const ledger = new Ledger(dir, runId, cfg.budgetCapUsd); const rawFile = path.join(dir, 'raw/blocks.jsonl'); const auditFile = path.join(dir, 'raw/audit.jsonl'); const judgeFile = path.join(dir, 'raw/judge.jsonl');
  const done = new Set<string>(existsSync(rawFile) ? readFileSync(rawFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).result.blockId) : []);
  const phrases = outcomes.flatMap((o) => allItems(o).flatMap((it) => [it.prompt, it.material ?? '', ...(it.scoring.type === 'key' ? it.scoring.accepted.filter((a) => a.trim().split(/\s+/).length >= 6) : [])])); // short accepted answers are generic phrases ("what does it mean"): only prompts, materials and long accepted answers are leak signals
  const scanner = new OutgoingScanner(phrases); const leaks: string[] = []; const als = new AsyncLocalStorage<CallCtx>();
  const stub = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ANSWER: dry-run\nCONFIDENCE: 50' }], usage: { input_tokens: 100, output_tokens: 10 } }), { status: 200 })) as unknown as typeof fetch;
  const realFetch = opts.fetchImpl ?? (opts.dry ? stub : globalThis.fetch); let key = ''; let restore = () => {};
  const runtime = new EnaraRuntime();
  const needsEnara = !opts.dry && cfg.conditions.some((c) => c === 'A' || c === 'E');
  if (!opts.dry) { key = readKey(); restore = installFetchGuard(ledger, () => als.getStore() ?? { campaign: cfg.experimentId, studentId: null, blockId: null, role: 'tutor' }, scanner, leaks); }
  const provider = new Provider(ledger, key, scanner, realFetch);
  if (needsEnara && !opts.dry) await runtime.start(key);
  const adapters: Record<Condition, ConditionAdapter> = { A: enaraCondition('A', runtime), B: conditionB, C: conditionC, D: conditionD, E: enaraCondition('E', runtime, cfg.ablate), F: conditionF };
  const stopFlag = { reason: null as string | null };
  const runBlock = async (b: Block) => {
    const s = pop.find((x) => x.id === b.studentId)!; const o = byId.get(b.outcomeId)!; const t0 = Date.now();
    const ctxOf = (role: string): CallCtx => ({ campaign: cfg.experimentId, studentId: s.id, blockId: b.blockId, role });
    const start = blockStart(s, o.area, o.id, o.misconceptions.length, o.difficulty); const mis = o.misconceptions[start.heldMisconceptionIdx] ?? null;
    const persona = studentPersona(s, { cefr: o.cefr, area: o.area, heldMisconception: mis, knowsAlready: start.knowsAlready });
    let rec: TeachingRecord | null = null; let scores: BlockScores | null = null; let error: string | null = null; let leakEvents = 0;
    try {
      await als.run(ctxOf('tutor'), async () => {
        const base = { provider, model: cfg.models.student, persona, student: s, blockId: b.blockId, outcome: o, note: '', ctx: ctxOf, samples: cfg.samples, know: { knowsAlready: start.knowsAlready, misconception: mis, difficulty: o.difficulty } };
        scores = await assessBlock(base);                                   // pre-test, before any instruction
        rec = await adapters[b.condition].teach({ student: s, outcome: o, blockId: b.blockId, persona, provider, studentModel: cfg.models.student, ctx: ctxOf, maxTurns: cfg.maxTurns });
        scores = await assessAfter({ ...base, note: rec.notes }, scores);   // post, transfer, delayed: independent of the tutor
      });
    } catch (e) { error = (e as Error).message; if (e instanceof BudgetExceeded) stopFlag.reason = error; if (e instanceof LeakageDetected) leakEvents += 1; }
    const sc = scores as BlockScores | null; const rc = rec as TeachingRecord | null; const c = ledger.costByBlock.get(b.blockId);
    const failed = error !== null || !sc || sc.post.length === 0;
    const all = sc ? [...sc.pre, ...sc.post, ...sc.transfer, ...sc.delayed] : []; const withConf = all.filter((x) => x.confidence !== null);
    const preM = sc?.pre.filter((x) => x.misconceptionId) ?? []; const postM = sc?.post.filter((x) => x.misconceptionId) ?? [];
    const dl = (i: number) => (sc && sc.delayed[i] ? (sc.delayed[i].correct ? 1 : 0) : null); const m = sc && !failed ? mastery(o, sc) : null;
    const textsToScan = rc ? [...rc.turns.map((t) => ({ where: `${b.blockId}:tutor`, text: t.tutor ?? '' })), { where: `${b.blockId}:notes`, text: rc.notes }, { where: `${b.blockId}:material`, text: rc.materialShown ?? '' }] : [];
    const hits = leakageScan(textsToScan, phrases); leakEvents += hits.length;
    const result: BlockResult = { blockId: b.blockId, studentId: s.id, replication: b.replication, outcomeId: o.id, area: o.area, condition: b.condition, order: b.order, tags: s.tags, difficulty: o.difficulty, cefr: o.cefr, status: failed ? 'failed' : 'ok', error,
      pre: sc ? frac(sc.pre) : NaN, post: sc ? frac(sc.post) : NaN, transfer: sc ? frac(sc.transfer) : NaN, delayed: sc ? frac(sc.delayed) : NaN, delayed1: dl(0), delayed7: dl(1), delayed30: dl(2) === null ? null : ((dl(2) ?? 0) + (dl(3) ?? 0)) / 2, prereq: sc?.prereq ? sc.prereq.correct : null,
      mastered: m?.mastered ?? false, misconceptionHeld: preM.some((x) => !x.correct), misconceptionRecovered: preM.some((x) => !x.correct) && postM.length ? postM.every((x) => x.correct) : null, errorCorrection: sc && sc.pre.some((x) => !x.correct) ? frac(sc.post) : null,
      turns: rc?.turns.length ?? 0, exposureWords: rc?.exposureWords ?? 0, tutorCalls: rc?.tutorCalls ?? 0, costUsd: c ? c.usd : 0, unknownCost: c?.unknown ?? false, teachingSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
      confidenceMean: withConf.length ? withConf.reduce((a, x) => a + (x.confidence ?? 0), 0) / withConf.length / 100 : null,
      calibrationGap: withConf.length ? withConf.reduce((a, x) => a + (x.confidence ?? 0) / 100 - (x.correct ? 1 : 0), 0) / withConf.length : null,
      hintDependence: rc && rc.turns.length ? rc.turns.filter((t) => /hint|clue|think about|look at/i.test(t.tutor ?? '')).length / rc.turns.length : null,
      guessedCorrect: all.filter((x) => x.guess && x.correct).length, lapses: all.filter((x) => x.lapse).length, leakageEvents: leakEvents };
    // Immutable raw record: everything needed to re-score and audit (answers, flags, transcripts, notes, dimensions).
    appendFileSync(rawFile, JSON.stringify({ result, teaching: rc, scores: sc, dimensions: sc && !failed ? dimensions(o, sc, rc?.turns.length ?? 0) : null, leakHits: hits, unavoidableDifferences: rc?.unavoidableDifferences ?? [] }) + '\n');
    if (sc && !failed && cfg.judgeRate > 0 && !opts.dry) {
      const rows = [...sc.post, ...sc.transfer, ...sc.delayed].map((r) => ({ blockId: b.blockId, item: allItems(o).find((i) => i.id === r.itemId)!, result: r }));
      const recs = await judgeSample(provider, cfg.models.judge, cfg.seed, cfg.judgeRate, rows, ctxOf).catch(() => [] as JudgeRecord[]); for (const r of recs) appendFileSync(judgeFile, JSON.stringify(r) + '\n');
    }
    appendFileSync(auditFile, JSON.stringify({ blockId: b.blockId, studentId: s.id, condition: b.condition, outcomeId: o.id, ts: new Date().toISOString(), heldMisconception: mis?.id ?? null, knowsAlready: start.knowsAlready, status: result.status, error }) + '\n');
  };
  // Phase 1: all conditions except E; Phase 2: E with the research ablation env set (the env is process-wide, so E runs alone).
  const phases: Block[][] = [allBlocks.filter((b) => b.condition !== 'E' && !done.has(b.blockId)), allBlocks.filter((b) => b.condition === 'E' && !done.has(b.blockId))];
  for (const [i, phase] of phases.entries()) {
    if (i === 1) { if (cfg.ablate.length) process.env.ENARA_RESEARCH_ABLATE = cfg.ablate.join(','); } else delete process.env.ENARA_RESEARCH_ABLATE;
    let next = 0; await Promise.all(Array.from({ length: cfg.concurrency }, async () => { while (next < phase.length && !stopFlag.reason) { const b = phase[next++]; await runBlock(b); console.log(`${b.blockId} ${b.condition} $${ledger.spentUsd.toFixed(2)}`); } }));
    if (stopFlag.reason) break;
  }
  delete process.env.ENARA_RESEARCH_ABLATE; restore(); if (needsEnara && !opts.dry) await runtime.stop();
  const results: BlockResult[] = readFileSync(rawFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).result);
  const attempts = Ledger.read(ledger.file); const judgeRecs: JudgeRecord[] = existsSync(judgeFile) ? readFileSync(judgeFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const finished = { runId, finishedAt: new Date().toISOString(), complete: !stopFlag.reason && results.length >= allBlocks.length, stoppedReason: stopFlag.reason, blocksPlanned: allBlocks.length, blocksRecorded: results.length, blocksFailed: results.filter((r) => r.status === 'failed').length, leakageEvents: leaks.length + results.reduce((n, r) => n + r.leakageEvents, 0), ledger: summarizeLedger(attempts), judgeAgreement: (({ disagreements, ...x }) => x)(agreement(judgeRecs)), rawSha256: { blocks: sha256(readFileSync(rawFile)), attempts: sha256(readFileSync(ledger.file)) } };
  writeFileSync(path.join(dir, 'finished.json'), JSON.stringify(finished, null, 2)); writeFileSync(path.join(dir, 'disagreements_for_human_review.json'), JSON.stringify(disagreementSample(judgeRecs), null, 2));
  return { dir, manifest, finished, results, attempts, prereg: pr.prereg };
}
export function generateReports(dir: string, limitations: string[]) { // reads ONLY recorded raw results + ledger
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')); const results: BlockResult[] = readFileSync(path.join(dir, 'raw/blocks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).result);
  const attempts = Ledger.read(path.join(dir, 'provider_attempts.jsonl')); const { prereg } = checkPrereg(false); mkdirSync(path.join(dir, 'reports'), { recursive: true });
  const reps = buildReports({ results, attempts, prereg, runId: manifest.runId, experimentId: manifest.experimentId, simulatedOnly: true, limitations });
  for (const [k, v] of Object.entries(reps)) writeFileSync(path.join(dir, 'reports', `${k}.md`), v); return reps;
}
