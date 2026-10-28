// Offline evaluation adapter: runs ENARA's production grading logic on
// benchmark samples without touching real data.
//
//   npx tsx src/scripts/gradingEvalAdapter.ts --in samples.jsonl --out results.jsonl [--concurrency 4] [--policy policy.json]
//
// Without --policy the production policy is used (eval-v2, leak check v1),
// i.e. exactly what live grading does. A policy file selects the opt-in
// eval-v3 variants for comparison:
//   { "version": "eval-v3", "levelGuidance": true, "leakCheck": "v2",
//     "brevityFor": ["short_answer"], "anchors": { "<assessment_type>": [EvalAnchor] } }
//
// Called by scripts/benchmarks/run_grading_eval.py. Input lines carry only
// what a grader may see: question, student response, reference answer,
// rubric. Gold scores are never sent here (the Python side strips them, and
// this script refuses lines that contain them).
//
// Every sample goes through the same functions the live grader uses:
// evaluateOpen (two independent rubric evaluations, a consistency check, and
// a third evaluation on disagreement; eval-v2 output validation) and then
// validateGrading (the production pre-release checks, including feedback
// leaks). The database is a throwaway in-memory MongoDB. Nothing is
// finalized, released or written to student records.
import { readFileSync, writeFileSync } from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { IQuestion } from '../models/Assessment';
import type { EvalAnchor, EvalPolicy } from '../services/gradingProposals';
import { BudgetLedger } from './benchmarkBudget';

export interface PolicyFile { version: 'eval-v2' | 'eval-v3'; levelGuidance?: boolean; leakCheck?: 'v1' | 'v2'; brevityFor?: string[]; criterionScopedFor?: string[]; alternativesFor?: string[]; anchors?: Record<string, EvalAnchor[]>; relevanceCriteriaFor?: Record<string, string[]>; arabicSemanticFor?: string[]; weakAnswerGuardFor?: string[] }

export function policyFor(file: PolicyFile | null, assessmentType: string): { policy?: EvalPolicy; leakCheck: 'v1' | 'v2' } {
  if (!file) return { leakCheck: 'v1' };
  return {
    policy: { version: file.version, levelGuidance: file.levelGuidance, brevityTolerant: (file.brevityFor ?? []).includes(assessmentType), criterionScoped: (file.criterionScopedFor ?? []).includes(assessmentType), alternativesAccepted: (file.alternativesFor ?? []).includes(assessmentType), anchors: file.anchors?.[assessmentType], relevanceCriteria: file.relevanceCriteriaFor?.[assessmentType], arabicSemantic: (file.arabicSemanticFor ?? []).includes(assessmentType), weakAnswerGuard: (file.weakAnswerGuardFor ?? []).includes(assessmentType) },
    leakCheck: file.leakCheck ?? 'v1',
  };
}

interface Level { id: string; label: string; points: number; description?: string }
interface InCriterion { id: string; title: string; description?: string; max_points: number; levels?: Level[] }
export interface AdapterInput {
  sample_id: string;
  language: string;
  assessment_type: string;
  question: string;
  student_response: string;
  reference_answer?: string | null;
  rubric: { source: string; criteria: InCriterion[] };
}

const FORBIDDEN = ['canonical_gold_score', 'human_scores', 'gold', 'score_avg', 'final_score', 'trait_gold'];
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

// Rubric levels: given ones, else 0..max in half-point steps (AR-AES graders
// scored in halves). The level labels are generic; descriptions come only
// from the dataset's criterion text.
export function levelsFor(c: InCriterion): Level[] {
  if (c.levels?.length) return c.levels;
  const out: Level[] = [];
  for (let p = 0; p <= c.max_points + 1e-9; p += 0.5) {
    const v = Math.round(p * 2) / 2;
    out.push({ id: `${c.id}-${String(v).replace('.', '_')}`, label: `${v} / ${c.max_points}`, points: v });
  }
  return out;
}

export function toQuestion(s: AdapterInput): IQuestion {
  return {
    id: 'q',
    type: 'open-response',
    text: s.question,
    explanation: '',
    modelAnswer: s.reference_answer || undefined,
    objectiveIds: [],
    rubric: {
      criteria: s.rubric.criteria.map((c) => ({ id: c.id, title: c.title, description: c.description, maxPoints: c.max_points, objectiveIds: [], levels: levelsFor(c) })),
    },
  } as unknown as IQuestion;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run the evaluation adapter with NODE_ENV=production');
  const inPath = arg('in');
  const outPath = arg('out');
  if (!inPath || !outPath) throw new Error('usage: --in samples.jsonl --out results.jsonl [--concurrency N]');
  const concurrency = Math.max(1, Number(arg('concurrency') ?? 4));
  // Every paid run spends from an explicit, approved budget ledger (benchmarkBudget.ts).
  const budgetPath = arg('budget');
  if (!budgetPath) throw new Error('Refusing to run without --budget <ledger.json> (see docs/benchmarks/GRADING_DATASETS.md, cost guard)');
  const ledger = new BudgetLedger(budgetPath, arg('run') ?? '');
  const policyPath = arg('policy');
  const policyFile: PolicyFile | null = policyPath ? JSON.parse(readFileSync(policyPath, 'utf8')) : null;
  const samples: AdapterInput[] = readFileSync(inPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const s of samples) {
    const leaked = FORBIDDEN.filter((k) => k in (s as unknown as Record<string, unknown>));
    if (leaked.length) throw new Error(`Sample ${s.sample_id} contains gold fields (${leaked.join(', ')}); refusing to grade it`);
  }

  // Throwaway database only: the app's configured MONGODB_URI is never used.
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  const { evaluateOpen, validateGrading, GradingError } = await import('../services/autoGrading');
  const { questionPoints } = await import('../services/assessmentVersions');
  const { AiCall } = await import('../models/AiCall');
  const { getConfig } = await import('../config/env');
  if (!getConfig().anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const { setAiCallGuard } = await import('../services/aiJson');
  setAiCallGuard(ledger);

  const results: Record<string, unknown>[] = new Array(samples.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < samples.length && !ledger.exhausted) {
      const i = next++;
      const s = samples[i];
      const tag = `eval:${i}`; // cost attribution per sample
      const attempt = { id: `eval-${i}`, institutionId: tag, assignmentId: 'eval', assessmentId: 'eval', assessmentVersion: 1 } as never;
      const q = toQuestion(s);
      const started = Date.now();
      const { policy, leakCheck } = policyFor(policyFile, s.assessment_type);
      const base = { sample_id: s.sample_id, max_points: questionPoints(q), policy_version: policy?.version ?? 'eval-v2', leak_check: leakCheck };
      try {
        const { chosen, all } = await evaluateOpen(attempt, q, s.student_response, [], policy);
        const answer = {
          questionId: 'q',
          questionText: q.text,
          studentAnswer: s.student_response,
          isCorrect: false,
          explanation: '',
          points: chosen.points!,
          maxPoints: questionPoints(q),
          method: 'ai' as const,
          criterionScores: chosen.criteria.map((c) => ({ criterionId: c.criterionId, levelId: c.levelId, points: c.points })),
          feedback: chosen.feedback,
          scoreExplanation: chosen.scoreExplanation,
          strengths: chosen.strengths ?? [],
          improvements: chosen.improvements ?? [],
          proposalId: chosen.id,
        };
        let validation = 'passed';
        try {
          validateGrading({ attempt, assignment: { id: 'eval' }, version: { assessmentId: 'eval', version: 1 }, questions: [q], answers: [answer], evaluations: new Map([['q', chosen]]), leakCheck });
        } catch (error) {
          validation = error instanceof GradingError ? error.reason : 'validation_error';
        }
        results[i] = {
          ...base,
          status: validation === 'passed' ? 'graded' : 'invalid',
          reason: validation === 'passed' ? null : validation,
          predicted_score: chosen.points,
          criteria: chosen.criteria.map((c) => ({ criterion_id: c.criterionId, level_id: c.levelId, points: c.points, evidence_quotes: c.evidence.length })),
          evaluations: all.map((e) => e.points ?? null),
          third_evaluation_used: all.length > 2,
          flags: chosen.flags,
          confidence: chosen.confidence,
          feedback: chosen.feedback,
          score_explanation: chosen.scoreExplanation,
          strengths: chosen.strengths ?? [],
          improvements: chosen.improvements ?? [],
          ms: Date.now() - started,
        };
      } catch (error) {
        results[i] = {
          ...base,
          status: 'exception',
          reason: ledger.exhausted ? 'budget_exhausted' : error instanceof GradingError ? error.reason : 'unexpected_error',
          message: String((error as Error).message).slice(0, 300),
          predicted_score: null,
          ms: Date.now() - started,
        };
      }
      const calls = await AiCall.find({ institutionId: tag }).select('costUsd costStatus status').lean();
      results[i].ai_calls = calls.length;
      results[i].ai_call_errors = calls.filter((c) => c.status !== 'ok').length;
      const unpriced = calls.filter((c) => c.costStatus === 'unpriced').length;
      results[i].cost_unpriced_calls = unpriced;
      // Unknown when any call had no price, rather than a partial total.
      results[i].cost_usd = unpriced ? null : Math.round(calls.reduce((n, c) => n + (c.costUsd || 0), 0) * 1e6) / 1e6;
      done += 1;
      if (done % 5 === 0 || done === samples.length) process.stderr.write(`graded ${done}/${samples.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, samples.length) }, worker));
  // Samples never started because the budget ran out are reported, not dropped.
  samples.forEach((s, i) => {
    results[i] ??= { sample_id: s.sample_id, status: 'not_started', reason: 'budget_exhausted', predicted_score: null, ai_calls: 0, cost_usd: 0, ms: 0 };
  });
  if (ledger.exhausted) process.stderr.write(`BUDGET STOP: ${ledger.snapshot().stop_reason}\n`);
  writeFileSync(outPath, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await mongoose.disconnect();
  await mongo.stop();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
