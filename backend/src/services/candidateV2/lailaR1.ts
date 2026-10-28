import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Snapshot } from './contract';
import { agree, parseJsonReply, renderEvalV2, validateEvalV2, type EvalV2Evaluation, type PromptProvider, type PromptReply } from './evalV2Criterion';
import { lailaRubric } from './lailaAdapter';
import { buildRequest, GraderError, type RubricText } from './nativeGrader';
import { ProviderError } from './provider';
import type { Grader } from './runner';
import type { CallShape, SettledBudget } from './settledBudget';
import type { CandidateV2Budget } from './budget';

// candidate-v2-evalv2-criterion-laila@offline-v2 = offline-v1 (unchanged module, reused) + R1:
//   (a) the relevance criterion's description carries LAILA's own zero conditions (the level-0
//       sentence that appears verbatim in every other trait's official rubric file) and the README
//       rule (relevance 0 => all traits 0);
//   (b) one LAILA-specific sentence appended after the unchanged eval-v2 system text, replacing
//       eval-v2's "choose the levels it earns" for off-topic answers on this rubric only.
// Grading, validation, evidence, retry and consensus are exactly offline-v1's (same helpers).
// Additions for diagnosis only: every valid evaluation's scores and flags go to the trace, and
// measured usage is settled into a SettledBudget when one is supplied.
export const R1_CANDIDATE_VERSION = 'candidate-v2-evalv2-criterion-laila@offline-v2';

export const LAILA_ZERO_SENTENCE = 'يُعطى صفر إذا كانت الاستجابة محفوظة بالكامل أو منسوخة من الموضوع، أو إذا لم يحاول الطالب تنفيذ المهمة، أو كتب ما لا صلة له بالموضوع المطلوب.';
export const LAILA_ZERO_SENTENCE_SHA256 = createHash('sha256').update(`الدرجة 0: ${LAILA_ZERO_SENTENCE}`).digest('hex');
export const LAILA_README_RULE = 'If an essay receives a score of 0 in Relevance, all other traits are automatically assigned a score of 0.';

export const R1_SYSTEM_SUFFIX =
  ' For this rubric (LAILA essays): if the response is on a different topic, is memorized or copied from the question, or makes no attempt at the task, ' +
  'choose level 0 for relevance instead of the levels it would otherwise earn; when relevance is level 0, choose level 0 for every other criterion.';

const NON_RELEVANCE = ['organization', 'vocabulary', 'style', 'development', 'mechanics', 'grammar'];

// The zero sentence must be the official level-0 line of every non-relevance trait file for this
// prompt; anything else stops the run (no paraphrase, no repaired text).
export function verifyZeroSentence(rubricDir: string, promptId: string): void {
  for (const t of NON_RELEVANCE) {
    const line = readFileSync(join(rubricDir, t, `${t}_rubric_prompt${promptId}.txt`), 'utf8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).find((l) => /^الدرجة\s*0\s*:/.test(l));
    if (!line || createHash('sha256').update(line).digest('hex') !== LAILA_ZERO_SENTENCE_SHA256) throw new Error(`${t} prompt ${promptId}: level-0 line differs from the pinned LAILA zero sentence`);
  }
}

export function lailaRubricR1(rubricDir: string, promptId: string) {
  verifyZeroSentence(rubricDir, promptId);
  const base = lailaRubric(rubricDir, promptId);
  const text: RubricText = {
    ...base.text,
    criteria: base.text.criteria.map((c) => (c.criterionId === 'relevance' ? { ...c, description: `${c.description}. ${LAILA_ZERO_SENTENCE} ${LAILA_README_RULE}` } : c)),
  };
  return { rubric: base.rubric, text };
}

export type R1Event = { evaluation: number; attempt: number; outcome: 'valid' | 'invalid' | 'cut_off'; reason?: string; droppedQuotes?: number; scores?: Record<string, number>; flags?: string[] };
export interface R1Trace { events: R1Event[]; decision?: 'AGREED' | 'THIRD_AGREED' | 'CONFLICT' | 'INVALID' | 'INTEGRITY_FLAG'; calls: number }

export interface R1GraderOptions {
  provider: PromptProvider;
  rubricText: RubricText;
  budget?: CandidateV2Budget | SettledBudget;
  model?: string;
  maxOutputTokens?: number;
  callTimeoutMs?: number;
  onTrace?: (attemptId: string, trace: R1Trace) => void;
}

// Same control flow as offline-v1's grader, with R1_SYSTEM_SUFFIX appended.
export function createR1Grader(o: R1GraderOptions): Grader {
  const maxTokens = o.maxOutputTokens ?? 3000;
  const timeoutMs = o.callTimeoutMs ?? 120_000;
  return async (snap: Snapshot, answer: string) => {
    if (snap.kind !== 'open-response' || !snap.rubric) throw new GraderError('NOT_OPEN_RESPONSE', 'open responses only');
    const rubric = snap.rubric;
    const base = renderEvalV2(buildRequest(snap, answer, o.rubricText));
    const prompt = { system: base.system + R1_SYSTEM_SUFFIX, user: base.user };
    const trace: R1Trace = { events: [], calls: 0 };
    const done = (t: R1Trace['decision']) => { trace.decision = t; o.onTrace?.(snap.attemptId, trace); };

    const evaluate = async (n: number): Promise<{ ev: EvalV2Evaluation } | { raw: unknown }> => {
      let lastRaw: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const call: CallShape = { model: o.model ?? 'unset', inputChars: prompt.system.length + prompt.user.length, maxOutputTokens: maxTokens };
        try {
          o.budget?.reserve(call);
        } catch (e) {
          throw new GraderError('BUDGET_EXCEEDED', (e as Error).message);
        }
        trace.calls++;
        let reply: PromptReply;
        try {
          reply = await o.provider.complete({ ...prompt, maxTokens }, { timeoutMs });
        } catch (e) {
          const code = e instanceof ProviderError ? e.code : 'NETWORK';
          throw code === 'TIMEOUT' ? new GraderError('TIMEOUT', 'provider timeout', true) : new GraderError('PROVIDER_ERROR', `provider error: ${code}`);
        }
        if (o.budget && 'settle' in o.budget) o.budget.settle(call, reply.usage);
        if (reply.stopReason === 'max_tokens') {
          trace.events.push({ evaluation: n, attempt, outcome: 'cut_off' });
          lastRaw = null;
          continue;
        }
        lastRaw = parseJsonReply(reply.text);
        const v = validateEvalV2(lastRaw, rubric, answer);
        if (v.ok) {
          trace.events.push({ evaluation: n, attempt, outcome: 'valid', droppedQuotes: v.droppedQuotes, scores: Object.fromEntries(v.criteria.map((c) => [c.criterionId, c.points])), flags: v.flags });
          return { ev: v };
        }
        trace.events.push({ evaluation: n, attempt, outcome: 'invalid', reason: v.reason });
      }
      return { raw: lastRaw };
    };

    const runs: EvalV2Evaluation[] = [];
    for (const n of [1, 2]) {
      const r = await evaluate(n);
      if (!('ev' in r)) { done('INVALID'); return r.raw; }
      runs.push(r.ev);
    }
    if (runs.some((e) => e.flags.includes('possible_integrity_issue'))) {
      done('INTEGRITY_FLAG');
      throw new GraderError('PROVIDER_ERROR', 'integrity flag: the answer may contain instructions to the grader');
    }
    let chosen: EvalV2Evaluation;
    if (agree(runs[0], runs[1], rubric)) {
      chosen = runs[0];
      done('AGREED');
    } else {
      const r = await evaluate(3);
      if (!('ev' in r)) { done('INVALID'); return r.raw; }
      const partner = runs.find((x) => agree(x, r.ev, rubric));
      if (!partner) { done('CONFLICT'); throw new GraderError('PROVIDER_ERROR', 'independent evaluations disagree'); }
      chosen = partner;
      done('THIRD_AGREED');
    }
    return {
      rubricVersion: rubric.version,
      criteria: chosen.criteria.map((c) => ({ criterionId: c.criterionId, selectedLevelId: c.levelId, points: c.points, evidence: c.evidence })),
      totalPoints: chosen.points,
      feedback: chosen.feedback,
    };
  };
}
