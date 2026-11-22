// Assessment bench runner (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7): the real engine (gradeOpenAnswer: two runs, the same prompts,
// checks and flags as for learners) on the frozen bench answers, compared with the gold scores.
//   - resumable: each call grades the next answers of a run that are not graded yet (a stopped run continues where it stopped);
//   - nothing is stored as a GradingProposal; never retried on the fallback provider (no spending on another model's account);
//   - spending cap per run (default $5): the cost of grading calls since the run started, from the call records; refused at the cap.
import { AssessmentBenchResult, AssessmentBenchRun } from '../../models/AssessmentBenchResult';
import { gradeOpenAnswer } from '../grading-engine/open';
import { rubricFor } from '../rubrics/templates';
import { BENCH_SETS, loadSet, openItemOf, answerTextOf, benchDir, type BenchDomain, type BenchLang } from './dataset';
import { summarize, gate, oneLine, type BenchRow } from './metrics';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const DEFAULT_CAP_USD = 5;

export async function spentSince(since: Date): Promise<number> {
  const { AiCall } = await import('../../models/AiCall');
  const r = await AiCall.aggregate([{ $match: { feature: 'ai_grading', createdAt: { $gte: since } } }, { $group: { _id: null, usd: { $sum: '$costUsd' } } }]);
  return Math.round((r[0]?.usd ?? 0) * 10000) / 10000;
}

export async function startRun(p: { runId: string; capUsd?: number; note?: string }) {
  const cap = Math.min(20, Math.max(0.1, p.capUsd ?? DEFAULT_CAP_USD));
  await AssessmentBenchRun.updateOne({ runId: p.runId }, { $setOnInsert: { runId: p.runId, startedAt: new Date(), capUsd: cap, note: p.note ?? '' } }, { upsert: true });
  return AssessmentBenchRun.findOne({ runId: p.runId }).lean();
}

/** Grades up to `limit` not-yet-graded answers of one set (in parallel); returns how many are left. */
export async function gradeBatch(p: { runId: string; domain: BenchDomain; lang: BenchLang; limit?: number; modelReady?: boolean }) {
  const run = await startRun({ runId: p.runId });
  const spent = await spentSince(run!.startedAt);
  if (spent >= (run!.capUsd ?? DEFAULT_CAP_USD)) return { graded: 0, remaining: -1, spentUsd: spent, stopped: 'cap' as const };
  const set = loadSet(p.domain, p.lang);
  const done = new Set((await AssessmentBenchResult.find({ runId: p.runId, domain: p.domain, lang: p.lang }).select('answerId').lean()).map((r) => r.answerId));
  const todo = set.answers.filter((a) => !done.has(a.id));
  const batch = todo.slice(0, Math.min(12, Math.max(1, p.limit ?? 6)));
  const items = new Map(set.items.map((i) => [i.id, i]));
  await Promise.all(batch.map(async (a) => {
    const it = items.get(a.itemId)!;
    const rubric = rubricFor(it.domain, it.type, it.language)!;
    const maxByCriterion = Object.fromEntries(rubric.criteria.map((c) => [c.id, c.maxPoints]));
    const t0 = Date.now();
    const g = await gradeOpenAnswer({
      attempt: { id: `bench-${p.runId}` }, item: openItemOf(it), answer: answerTextOf(a), uiLanguage: it.language,
      maxByCriterion, modelReady: p.modelReady ?? true, options: { store: false, allowFallback: false },
    });
    const ok = g.grader !== 'none';
    const row: BenchRow & Record<string, unknown> = {
      answerId: a.id, itemId: it.id, domain: it.domain, lang: it.language, type: it.type, band: a.band,
      gold: a.gold, goldTotal: a.goldTotal,
      model: ok ? Object.fromEntries(g.criterionScores.map((c) => [c.criterionId, c.points])) : null, modelTotal: ok ? g.points : null,
      flagged: g.flagged, flagReasons: g.flagReasons, confidence: g.confidence, latencyMs: Date.now() - t0,
      error: ok ? null : g.flagReasons[0] ?? 'error', errorCodes: g.errorCodes, goldErrorCodes: a.errorCodes, modelName: ok ? g.grader.replace(/^model:/, '') : null,
    };
    await AssessmentBenchResult.updateOne({ runId: p.runId, answerId: a.id }, { $set: { runId: p.runId, ...row } }, { upsert: true });
  }));
  return { graded: batch.length, remaining: todo.length - batch.length, spentUsd: await spentSince(run!.startedAt) };
}

export function baseline(): Record<string, number> {
  const dir = benchDir();
  const f = dir ? join(dir, 'baseline.json') : '';
  if (!f || !existsSync(f)) return {};
  return (JSON.parse(readFileSync(f, 'utf8')) as { within1?: Record<string, number> }).within1 ?? {};
}

/** The run's numbers, the gate, and the cost so far. Saved on the run. */
export async function summary(runId: string) {
  const run = await AssessmentBenchRun.findOne({ runId }).lean();
  if (!run) return { runId, missing: true };
  const rows = (await AssessmentBenchResult.find({ runId }).lean()) as unknown as BenchRow[];
  const sets = summarize(rows);
  const expected: Record<string, number> = {};
  for (const s of BENCH_SETS) { try { expected[`${s.domain}/${s.lang}`] = loadSet(s.domain, s.lang).answers.length; } catch { /* set not present */ } }
  const failures = gate(sets.filter((s) => expected[s.set]), { baseline: baseline(), expected });
  const spentUsd = await spentSince(run.startedAt);
  await AssessmentBenchRun.updateOne({ runId }, { $set: { summary: sets, failures, finishedAt: new Date() } });
  return { runId, gold: 'author (provisional)', spentUsd, capUsd: run.capUsd, lines: sets.map(oneLine), failures, passed: failures.length === 0, sets };
}

/** Rows that disagree by more than 1 point, for reading (fake bench answers only). */
export async function misses(runId: string, limit = 40) {
  const rows = await AssessmentBenchResult.find({ runId }).lean();
  return rows
    .filter((r) => r.modelTotal === null || Math.abs((r.modelTotal as number) - (r.goldTotal as number)) > 1)
    .slice(0, limit)
    .map((r) => ({ answerId: r.answerId, band: r.band, gold: r.gold, model: r.model, goldTotal: r.goldTotal, modelTotal: r.modelTotal, flagReasons: r.flagReasons, error: r.error }));
}
