import { createHash, randomUUID } from 'crypto';
import { AssessmentAttempt } from '../../models/AssessmentAttempt';
import type { IQuestion } from '../../models/Assessment';
import { GradingProposal } from '../../models/GradingProposal';
import { HybridAnchorSet, HybridShadowResult } from '../../models/HybridShadowResult';
import { logger } from '../../utils/logging';
import { estimateCostUsd, maxCallCostUsd } from '../aiCalls';
import { getVersion } from '../assessmentVersions';
import { readHybridV1Config, type HybridV1Config } from './config';
import { ANCHOR_SEED, HYBRID_VERSION, combine, eligibility, pickAnchors } from './hybrid';
import { V6, gradeV6, type V6Client, type V6Result } from './v6';

// Shadow grading with the frozen Hybrid V1. Reads the official eval-v2 result
// (the chosen GradingProposal: no extra eval-v2 call), runs V6 once per eligible
// answer and stores everything in HybridShadowResult. It never writes an
// attempt, a grade, a gradebook or anything a student can see.
const LEASE_MS = 10 * 60_000;
// eval-v2 ran on this model in the confirmatory evaluation; other models are outside the validated envelope.
export const FROZEN_EVALV2_MODEL = 'claude-opus-5-5';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const RELEASED = new Set(['finalized', 'released']);

export class BudgetStop extends Error {}

// Hard per-run caps, checked before every V6 call (reservation = upper bound for the call).
export class ShadowBudget {
  calls = 0;
  reservedUsd = 0;
  estimatedUsd = 0;
  constructor(private cfg: Pick<HybridV1Config, 'maxCalls' | 'maxUsd'>) {}
  wrap(client: V6Client): V6Client {
    return {
      create: async (body, opts) => {
        const promptBytes = Buffer.byteLength(body.system) + Buffer.byteLength(body.messages[0].content);
        const bound = maxCallCostUsd(body.model, promptBytes, body.max_tokens);
        if (bound === null) throw Object.assign(new BudgetStop(`no price for ${body.model}`), { code: 'BUDGET_EXCEEDED' });
        if (this.calls + 1 > this.cfg.maxCalls || this.reservedUsd + bound > this.cfg.maxUsd + 1e-9) {
          throw Object.assign(new BudgetStop('shadow budget cap reached'), { code: 'BUDGET_EXCEEDED' });
        }
        this.calls += 1;
        this.reservedUsd += bound;
        const reply = await client.create(body, opts);
        this.estimatedUsd += reply.usage ? estimateCostUsd(reply.model || body.model, reply.usage) : bound;
        return reply;
      },
    };
  }
}

export interface ShadowOutcome { attemptId: string; skipped?: string; results: { questionId: string; status: string; label?: string }[] }

// Claim (attempt, question) once; a stale 'running' claim (crash) can be taken over.
async function claim(doc: { key: string; institutionId: string; attemptId: string; assessmentId: string; assessmentVersion: number; questionId: string; correlationId: string }, now: Date) {
  try {
    await HybridShadowResult.create({ ...doc, graderVersion: HYBRID_VERSION, status: 'running', claimedAt: now });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    const taken = await HybridShadowResult.findOneAndUpdate({ key: doc.key, status: 'running', claimedAt: { $lt: new Date(now.getTime() - LEASE_MS) } }, { $set: { claimedAt: now } });
    return Boolean(taken);
  }
}

async function anchorsFor(institutionId: string, assessmentId: string, version: number, questionId: string, excludeAttemptId: string) {
  const setId = `has-${sha([institutionId, assessmentId, version, questionId, HYBRID_VERSION].join('|')).slice(0, 24)}`;
  let set = await HybridAnchorSet.findOne({ id: setId }).lean();
  if (!set) {
    // Teacher-scored answers to the same question in the same school and version (tenant-isolated).
    const pool = await AssessmentAttempt.find({ institutionId, assessmentId, assessmentVersion: version, id: { $ne: excludeAttemptId } }).select('id answers').lean();
    const cands = pool.flatMap((t) => t.answers.filter((a) => a.questionId === questionId && a.method === 'teacher' && typeof a.points === 'number' && String(a.studentAnswer ?? '').trim())
      .map((a) => ({ id: `${t.id}:${questionId}`, answer: String(a.studentAnswer), score: a.points as number })));
    const picked = pickAnchors(cands, ANCHOR_SEED);
    if (picked.length < V6.k_anchors) return { ok: false as const, reason: 'INSUFFICIENT_ANCHORS' };
    try {
      await HybridAnchorSet.create({ id: setId, institutionId, assessmentId, assessmentVersion: version, questionId, graderVersion: HYBRID_VERSION, seed: ANCHOR_SEED,
        anchors: picked.map((p) => ({ attemptId: p.id.split(':')[0], questionId, score: p.score, answerSha256: sha(p.answer) })) });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    set = await HybridAnchorSet.findOne({ id: setId }).lean();
  }
  if (!set) return { ok: false as const, reason: 'ANCHORS_UNAVAILABLE' };
  if (set.anchors.some((a) => a.attemptId === excludeAttemptId)) return { ok: false as const, reason: 'ANSWER_IS_ANCHOR' };
  const docs = await AssessmentAttempt.find({ institutionId, id: { $in: set.anchors.map((a) => a.attemptId) } }).select('id answers').lean();
  const anchors = [];
  for (const a of set.anchors) {
    const ans = docs.find((d) => d.id === a.attemptId)?.answers.find((x) => x.questionId === questionId);
    const text = String(ans?.studentAnswer ?? '');
    if (!ans || sha(text) !== a.answerSha256) return { ok: false as const, reason: 'ANCHORS_CHANGED' };
    anchors.push({ answer: text, humanScore: a.score });
  }
  return { ok: true as const, setId: set.id, anchors };
}

export async function shadowGradeAttempt(attemptId: string, deps: { client: V6Client; budget: ShadowBudget; config?: HybridV1Config; now?: Date }): Promise<ShadowOutcome> {
  const cfgR = deps.config ? { ok: true as const, config: deps.config } : readHybridV1Config();
  if (!cfgR.ok) return { attemptId, skipped: cfgR.reason, results: [] };
  const cfg = cfgR.config;
  const now = deps.now ?? new Date();
  const attempt = await AssessmentAttempt.findOne({ id: attemptId }).lean();
  if (!attempt) return { attemptId, skipped: 'attempt_missing', results: [] };
  if (!attempt.institutionId || !cfg.institutions.has(attempt.institutionId)) return { attemptId, skipped: 'institution_not_allowlisted', results: [] };
  if (!RELEASED.has(String(attempt.gradingStatus))) return { attemptId, skipped: 'not_graded', results: [] };
  if (!attempt.assessmentVersion) return { attemptId, skipped: 'version_missing', results: [] };
  const version = await getVersion(attempt.assessmentId, attempt.assessmentVersion);
  const byId = new Map((version.questions as IQuestion[]).map((q) => [q.id, q]));
  const results: ShadowOutcome['results'] = [];
  for (const a of attempt.answers) {
    const q = byId.get(a.questionId);
    const answer = String(a.studentAnswer ?? '');
    const key = `${attemptId}|${a.questionId}|${HYBRID_VERSION}`;
    const base = { key, institutionId: attempt.institutionId, attemptId, assessmentId: attempt.assessmentId, assessmentVersion: attempt.assessmentVersion, questionId: a.questionId, correlationId: `hyb-${randomUUID()}` };
    const el = eligibility(q, answer);
    if (!el.eligible && el.reason === 'NOT_OPEN_RESPONSE') continue; // answer-key questions: nothing to shadow
    if (!(await claim(base, now))) {
      results.push({ questionId: a.questionId, status: 'skipped_duplicate' });
      continue;
    }
    const t0 = Date.now();
    const finish = async (set: Record<string, unknown>) => {
      await HybridShadowResult.updateOne({ key, status: 'running' }, { $set: { ...set, answerSha256: sha(answer), latencyMs: Date.now() - t0 } });
    };
    if (!el.eligible) {
      await finish({ status: 'not_eligible', eligibility: el.reason });
      results.push({ questionId: a.questionId, status: 'not_eligible' });
      continue;
    }
    // Official eval-v2 component: the proposal the grader chose (never re-run here).
    const prop = a.proposalId ? await GradingProposal.findOne({ id: a.proposalId, attemptId, institutionId: attempt.institutionId }).lean() : null;
    const evalv2 = prop && prop.status === 'proposed' && typeof prop.points === 'number' ? prop.points : null;
    if (prop && !(String(prop.modelName ?? '').startsWith(FROZEN_EVALV2_MODEL))) {
      await finish({ status: 'not_eligible', eligibility: 'EVALV2_MODEL_NOT_FROZEN', evalv2: { score: evalv2, proposalId: prop.id, modelName: prop.modelName, status: prop.status } });
      results.push({ questionId: a.questionId, status: 'not_eligible' });
      continue;
    }
    if (evalv2 === null) {
      const h = combine(null, null);
      await finish({ status: 'done', evalv2: { score: null, proposalId: a.proposalId, status: prop?.status ?? 'missing' }, v6: { score: null, status: 'NOT_RUN', reasonCode: 'NO_EVALV2', repairs: 0, calls: 0 }, hybrid: h });
      results.push({ questionId: a.questionId, status: 'done', label: h.label });
      continue;
    }
    const anc = await anchorsFor(attempt.institutionId, attempt.assessmentId, attempt.assessmentVersion, a.questionId, attemptId);
    let v6: V6Result;
    if (!anc.ok) {
      v6 = { status: 'NON_SCORED', score: null, reasonCode: anc.reason, repairs: 0, calls: [] };
    } else {
      try {
        v6 = await gradeV6(deps.budget.wrap(deps.client), { question: q!.text, reference: String(q!.modelAnswer), maxScore: 5, anchors: anc.anchors, answer });
      } catch (e) {
        v6 = { status: 'NON_SCORED', score: null, reasonCode: 'INTERNAL_ERROR', repairs: 0, calls: [], message: String((e as Error).message).slice(0, 200) };
      }
      if (v6.reasonCode === 'BUDGET_EXCEEDED') {
        await finish({ status: 'error', v6: { score: null, status: v6.status, reasonCode: v6.reasonCode, repairs: v6.repairs, calls: v6.calls.length } });
        results.push({ questionId: a.questionId, status: 'budget_stop' });
        logger.warn('hybrid_v1_shadow_budget_stop', { attemptId, calls: deps.budget.calls, reservedUsd: deps.budget.reservedUsd });
        return { attemptId, skipped: 'budget_exceeded', results };
      }
    }
    const h = combine(evalv2, v6.score);
    await finish({
      status: 'done',
      evalv2: { score: evalv2, proposalId: prop!.id, modelName: prop!.modelName, status: prop!.status },
      v6: { score: v6.score, status: v6.status, reasonCode: v6.reasonCode, repairs: v6.repairs, calls: v6.calls.length, model: V6.model, anchorSetId: anc.ok ? anc.setId : undefined, groundingDiagnostics: v6.groundingDiagnostics },
      hybrid: h,
      disagreement: v6.score === null ? null : Math.abs(v6.score - evalv2),
      cost: { reservedUsd: deps.budget.reservedUsd, estimatedUsd: deps.budget.estimatedUsd, confirmedRequests: v6.calls.length },
    });
    logger.info('hybrid_v1_shadow', { attemptId, questionId: a.questionId, label: h.label, v6Status: v6.status, v6Reason: v6.reasonCode, calls: v6.calls.length });
    results.push({ questionId: a.questionId, status: 'done', label: h.label });
  }
  return { attemptId, results };
}
