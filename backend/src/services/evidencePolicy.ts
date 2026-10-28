import type { AssistanceLevel, EvidenceResult, EvidenceType } from '../models/LearningEvidence';
import type { ILearningEvent } from '../models/LearningEvent';

// Evidence policy: which events count as evidence of understanding, and how
// much each counts. Versioned; changing any rule means a new version string.
//
// evidence-v1
// - question_answered (assessment, verified, answer-key graded) -> independent_assessment, weight 1.0
// - question_answered from a diagnostic -> diagnostic, weight 1.0 (Sprint 3)
// - review_answered (spaced review, verified) -> retention_review, weight 0.8
// - assistance: none for both (no hints exist in these flows); hint 0.6x, guided 0.4x, worked_solution 0.2x
// - repeat exposure to the same question: weight / (1 + prior exposures), so memorising one
//   item can't build mastery on its own
// - difficulty is stored but not used: it isn't calibrated yet
// - nothing else (lesson views or completions, tutor turns, browser events, AI output) is evidence
//
// evidence-v2 (Phase 3): all v1 rules unchanged, plus
// - question_answered (assessment, verified) scored by a teacher (an open
//   response, possibly from an AI proposal the teacher approved) with
//   outcome.score in [0, 1] -> independent_assessment, weight 1.0;
//   result correct at 1, incorrect at 0, partially_correct in between;
//   normalizedScore = the score. Unapproved AI proposals never get here.
//
// evidence-v3 (autonomous grading): all v2 rules unchanged, plus
// - question_answered (assessment, verified) graded by the automatic grader
//   (gradedBy 'ai') with outcome.score in [0, 1] -> independent_assessment,
//   same result mapping, weight 0.8 (AI_GRADED_WEIGHT). Only grades that
//   passed the grader's validation and were finalized are recorded at all.
//   The lower weight reflects that AI grading reliability is measured on a
//   benchmark, not per answer (docs/phase3/PHASE3_AI_SAFEGUARDS.md).
// - A teacher correction invalidates the AI-graded evidence and records
//   teacher-graded evidence instead (weight 1.0).
export const EVIDENCE_POLICY_VERSION = 'evidence-v3';
export const AI_GRADED_WEIGHT = 0.8;

const BASE: Partial<Record<string, { type: EvidenceType; weight: number }>> = {
  'question_answered:assessment': { type: 'independent_assessment', weight: 1 },
  'question_answered:diagnostic': { type: 'diagnostic', weight: 1 },
  'review_answered:review': { type: 'retention_review', weight: 0.8 },
};

const ASSISTANCE_FACTOR: Record<AssistanceLevel, number> = { none: 1, hint: 0.6, guided: 0.4, worked_solution: 0.2 };

export interface EvidenceDraft {
  evidenceType: EvidenceType;
  result: EvidenceResult;
  normalizedScore: number;
  assistanceLevel: AssistanceLevel;
  reliabilityWeight: number;
  itemKey?: string;
}

export function itemKeyFor(event: Pick<ILearningEvent, 'type' | 'refs'>): string | undefined {
  const r = event.refs || {};
  if (event.type === 'question_answered' && r.assessmentId && r.questionId) return `q:${r.assessmentId}:${r.questionId}`;
  if (event.type === 'review_answered' && r.reviewItemId) return `review:${r.reviewItemId}`;
  return undefined;
}

// Returns the evidence an event gives (per objective), or null if it gives none.
export function evidenceFromEvent(
  event: Pick<ILearningEvent, 'type' | 'source' | 'verified' | 'gradedBy' | 'outcome' | 'refs'>,
  priorExposures: number,
): EvidenceDraft | null {
  if (!event.verified) return null;
  if ((event.gradedBy === 'teacher' || event.gradedBy === 'ai') && event.type === 'question_answered' && event.source === 'assessment') {
    const score = event.outcome?.score;
    if (typeof score !== 'number' || score < 0 || score > 1) return null;
    const weight = (event.gradedBy === 'ai' ? AI_GRADED_WEIGHT : 1) / (1 + Math.max(0, priorExposures));
    return {
      evidenceType: 'independent_assessment',
      result: score >= 1 ? 'correct' : score <= 0 ? 'incorrect' : 'partially_correct',
      normalizedScore: Math.round(score * 1000) / 1000,
      assistanceLevel: 'none',
      reliabilityWeight: Math.round(weight * 1000) / 1000,
      itemKey: itemKeyFor(event),
    };
  }
  if (event.gradedBy !== 'rule') return null;
  const base = BASE[`${event.type}:${event.source}`];
  if (!base || typeof event.outcome?.correct !== 'boolean') return null;
  const assistanceLevel: AssistanceLevel = (event.outcome?.hintsUsed ?? 0) > 0 ? 'hint' : 'none';
  const weight = (base.weight * ASSISTANCE_FACTOR[assistanceLevel]) / (1 + Math.max(0, priorExposures));
  return {
    evidenceType: base.type,
    result: event.outcome.correct ? 'correct' : 'incorrect',
    normalizedScore: event.outcome.correct ? 1 : 0,
    assistanceLevel,
    reliabilityWeight: Math.round(weight * 1000) / 1000,
    itemKey: itemKeyFor(event),
  };
}
