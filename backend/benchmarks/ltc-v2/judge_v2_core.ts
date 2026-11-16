// ENARA LTB fixture v2: evaluator core for rubric v2 (POST-13). Pure functions,
// no I/O and no provider calls, so the evaluator's contract is unit-tested.
//
// Contract:
//   - The evaluator sees ONLY the case's `evaluatorView` (what the tutor received
//     plus evaluation guidance) and the learner-visible transcript. It never
//     reads `lessonDelivered`, answer keys, target forms, engine moves or state.
//   - A missing or malformed evaluatorView is an explicit error (EvaluatorViewError).
//     There is no fallback to any other lesson field.
//   - Every result records the fixture, rubric and view versions it was made with.
//   - The outcome is computed here from the evaluator's dimension scores and
//     severity tags, by the rubric v2 outcome rule; a critical defect is never
//     offset by other scores.

import { createHash } from 'crypto';

export const VIEW_VERSION = 'ltb-fixture-v2/evaluatorView';
// core-2: a core dimension scored n/a (cannot apply) is excluded from the core floor,
// as the rubric excludes n/a; core-1 wrongly blocked MEETS on it.
export const EVALUATOR_CORE_VERSION = 'ltb-judge-v2-core-3';

// r4.3 (POST-16): the aggregation policy, explicit and recorded on every outcome.
// PROVISIONAL product policy, not academically validated; outcome logic is
// identical to core-2 (verified by re-scoring all stored r4.2 evaluations).
export const OUTCOME_POLICY = {
  id: 'ltb-outcome-provisional-1',
  academicallyValidated: false,
  insufficientEvidence: 'unscored; excluded from the mean and floors; never counted as 0 or 3; a core dimension with insufficient_evidence makes the case UNCERTAIN',
  notApplicable: 'unscored; excluded from the mean and floors; a case with no scorable core dimension cannot MEET',
  order: 'INVALID > DOES_NOT_MEET > UNCERTAIN > MEETS | PARTIAL',
  thresholds: 'MEETS: deterministic pass, no critical/major tag, all scored >= 2, all scored core >= 3, mean >= 3.00',
} as const;

export class EvaluatorViewError extends Error {
  constructor(public caseId: string, public reason: string) {
    super(`evaluatorView unusable for ${caseId}: ${reason}`);
    this.name = 'EvaluatorViewError';
  }
}

// Field names that carry assessment secrets or runtime internals. None may
// appear anywhere in what the evaluator receives.
const FORBIDDEN_KEYS = ['acceptedAnswers', 'targetForms', 'structuredExpectations', 'lessonDelivered', 'tutorView', 'answerKey', 'languageTurn', 'moves', 'keyVerdict'];

export interface RubricDimension { id: string; ref: string; title: string; core: boolean; description: string; anchors: Record<'0' | '1' | '2' | '3' | '4', string>; notes?: string[] }
export interface RubricV2 { rubricVersion: string; machineFormat: string; dimensions: RubricDimension[]; severity: Record<string, string>; outcomeRule: Record<string, string>; globalRules: string; interpretations: Record<string, string> }

export function loadRubricV2(text: string): { rubric: RubricV2; sha256: string } {
  const rubric = JSON.parse(text) as RubricV2;
  if (rubric.rubricVersion !== 'ltb-rubric-v2') throw new Error(`rubric: expected ltb-rubric-v2, got ${rubric.rubricVersion}`);
  if (!Array.isArray(rubric.dimensions) || rubric.dimensions.length !== 11) throw new Error('rubric: expected 11 dimensions');
  for (const d of rubric.dimensions) {
    for (const k of ['0', '1', '2', '3', '4'] as const) if (typeof d.anchors?.[k] !== 'string' || !d.anchors[k].trim()) throw new Error(`rubric: ${d.id} lacks anchor ${k}`);
  }
  const core = rubric.dimensions.filter((d) => d.core).map((d) => d.id).sort();
  if (core.join(',') !== 'answer_judgement,context_grounding,grammar_accuracy,hint_leakage') throw new Error(`rubric: unexpected core set ${core}`);
  return { rubric, sha256: createHash('sha256').update(text).digest('hex') };
}

// ------------------------------------------------------------ evaluator view --
export interface EvaluatorView {
  case_id: string;
  trustedAgeBand: string | null;
  cefrEstimate: string;
  situationType: string;
  learner: Record<string, unknown>;
  lesson: null | { title: string; objective?: string; spec?: Record<string, unknown> };
  guidance: { expectedBehavior: string; unacceptableBehavior: string; expectedNextMove?: string; wordLimitPerReply?: number };
}

function findForbidden(v: unknown, at = ''): string | null {
  if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) { const f = findForbidden(x, `${at}[${i}]`); if (f) return f; }
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(k)) return `${at}.${k}`;
      const f = findForbidden(x, `${at}.${k}`);
      if (f) return f;
    }
  }
  return null;
}

// Returns the case's evaluatorView, validated. Throws EvaluatorViewError otherwise.
export function requireEvaluatorView(caseRecord: { id?: string; fixtureVersion?: string; evaluatorView?: unknown }): EvaluatorView {
  const id = String(caseRecord?.id ?? '?');
  // ltb-skills-v1 (multi-skill benchmark) uses the same case schema; scoring is unchanged.
  if (!['ltb-fixture-v2', 'ltb-skills-v1'].includes(String(caseRecord?.fixtureVersion))) throw new EvaluatorViewError(id, `fixtureVersion is ${JSON.stringify(caseRecord?.fixtureVersion)}, expected ltb-fixture-v2 or ltb-skills-v1`);
  const v = caseRecord.evaluatorView as EvaluatorView | undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new EvaluatorViewError(id, 'missing');
  if (v.case_id !== id) throw new EvaluatorViewError(id, `case_id ${JSON.stringify(v.case_id)} does not match`);
  if (typeof v.cefrEstimate !== 'string' || typeof v.situationType !== 'string') throw new EvaluatorViewError(id, 'cefrEstimate/situationType missing');
  if (!v.learner || typeof v.learner !== 'object') throw new EvaluatorViewError(id, 'learner missing');
  if (v.lesson !== null && (typeof v.lesson !== 'object' || typeof v.lesson.title !== 'string')) throw new EvaluatorViewError(id, 'lesson malformed');
  if (!v.guidance || typeof v.guidance.expectedBehavior !== 'string' || typeof v.guidance.unacceptableBehavior !== 'string') throw new EvaluatorViewError(id, 'guidance missing');
  const forbidden = findForbidden(v);
  if (forbidden) throw new EvaluatorViewError(id, `forbidden field ${forbidden}`);
  return v;
}

// The learner-visible conversation only: what the learner typed and what they saw.
export interface RawTurn { turn: number; learner: string; reply: string | null; httpStatus?: number; runtimeParity?: Record<string, unknown>; tutorAttempt?: { identifierLeaks?: number }[] }
export function visibleTranscript(turns: RawTurn[]): string {
  return turns.map((t, i) => `TURN ${i + 1}\nLEARNER: ${t.learner}\nTUTOR: ${t.reply ?? '[no reply]'}`).join('\n\n');
}

// --------------------------------------------------------- deterministic --
export interface DeterministicResult { pass: boolean; parityValid: boolean; privacyBreach: boolean; failures: string[] }
export function deterministicChecks(turns: RawTurn[]): DeterministicResult {
  const failures: string[] = [];
  let parityValid = true;
  let privacyBreach = false;
  for (const [i, t] of turns.entries()) {
    const p = (t.runtimeParity ?? {}) as { tutorSawTarget?: boolean; acceptedAnswersInSystemPrompt?: string[]; markerInVisibleReply?: boolean };
    if (t.httpStatus !== undefined && t.httpStatus !== 200) failures.push(`turn ${i + 1}: HTTP ${t.httpStatus}`);
    if (!t.reply) failures.push(`turn ${i + 1}: no reply`);
    if (p.tutorSawTarget === false) { parityValid = false; failures.push(`turn ${i + 1}: tutor did not receive the answered item (runtime parity)`); }
    if ((p.acceptedAnswersInSystemPrompt ?? []).length) failures.push(`turn ${i + 1}: accepted answer in system prompt`);
    if (p.markerInVisibleReply || /\[\[assess[\s\]]|verdict=/i.test(t.reply ?? '')) failures.push(`turn ${i + 1}: assessment marker visible`);
    if ((t.tutorAttempt ?? []).some((a) => (a.identifierLeaks ?? 0) > 0)) { privacyBreach = true; failures.push(`turn ${i + 1}: learner identifier sent to the provider`); }
  }
  return { pass: failures.length === 0, parityValid, privacyBreach, failures };
}

// ---------------------------------------------------------- judge output --
export type DimScore = 0 | 1 | 2 | 3 | 4 | 'n/a' | 'insufficient_evidence';
export interface JudgeFailure { severity: 'critical' | 'major' | 'minor'; dimension?: string; quote?: string; note?: string }
export interface JudgeOutput { scores: Record<string, DimScore>; evidence: Record<string, string>; failures: JudgeFailure[]; confidence?: Record<string, 'low' | 'medium' | 'high'> }

export function parseJudgeOutput(text: string | null, rubric: RubricV2): JudgeOutput | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: JudgeOutput;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || typeof j.scores !== 'object') return null;
  for (const d of rubric.dimensions) {
    const v = j.scores[d.id];
    if (!(v === 'n/a' || v === 'insufficient_evidence' || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4))) return null;
  }
  if (!Array.isArray(j.failures)) j.failures = [];
  for (const f of j.failures) if (!['critical', 'major', 'minor'].includes(f?.severity)) return null;
  if (!j.evidence || typeof j.evidence !== 'object') j.evidence = {};
  return j;
}

// ------------------------------------------------------------- outcome --
export type OutcomeV2 = 'INVALID' | 'DOES_NOT_MEET' | 'UNCERTAIN' | 'MEETS' | 'PARTIAL';
export interface OutcomeResult { outcome: OutcomeV2; mean: number | null; scored: number; reasons: string[]; policy: string; insufficientEvidence: string[]; notApplicable: string[] }

export function computeOutcomeV2(j: JudgeOutput, det: DeterministicResult, rubric: RubricV2): OutcomeResult {
  const reasons: string[] = [];
  const scored = rubric.dimensions.map((d) => ({ d, v: j.scores[d.id] })).filter((x): x is { d: RubricDimension; v: 0 | 1 | 2 | 3 | 4 } => typeof x.v === 'number');
  const mean = scored.length ? scored.reduce((s, x) => s + x.v, 0) / scored.length : null;
  const insufficientEvidence = rubric.dimensions.filter((d) => j.scores[d.id] === 'insufficient_evidence').map((d) => d.id);
  const notApplicable = rubric.dimensions.filter((d) => j.scores[d.id] === 'n/a').map((d) => d.id);
  const r = (outcome: OutcomeV2): OutcomeResult => ({ outcome, mean: mean === null ? null : Math.round(mean * 1000) / 1000, scored: scored.length, reasons, policy: OUTCOME_POLICY.id, insufficientEvidence, notApplicable });
  if (!det.parityValid) { reasons.push('runtime parity failed'); return r('INVALID'); }
  const critical = j.failures.filter((f) => f.severity === 'critical');
  if (det.privacyBreach) reasons.push('privacy breach (deterministic)');
  if (critical.length) reasons.push(`${critical.length} critical defect(s)`);
  const zeros = scored.filter((x) => x.v === 0).map((x) => x.d.id);
  if (zeros.length) reasons.push(`dimension 0: ${zeros.join(',')}`);
  // A critical defect or a 0 is never offset by other scores.
  if (det.privacyBreach || critical.length || zeros.length) return r('DOES_NOT_MEET');
  const coreInsufficient = rubric.dimensions.filter((d) => d.core && j.scores[d.id] === 'insufficient_evidence').map((d) => d.id);
  if (coreInsufficient.length) { reasons.push(`core insufficient_evidence: ${coreInsufficient.join(',')}`); return r('UNCERTAIN'); }
  const major = j.failures.filter((f) => f.severity === 'major').length;
  const below2 = scored.filter((x) => x.v < 2).map((x) => x.d.id);
  const coreBelow3 = scored.filter((x) => x.d.core && x.v < 3).map((x) => x.d.id);
  // n/a = the dimension cannot apply to this case (e.g. no answer to judge): excluded,
  // like any n/a. A case where no core dimension is scorable at all cannot MEET.
  const coreScored = rubric.dimensions.filter((d) => d.core && typeof j.scores[d.id] === 'number').length;
  const coreMissing = coreScored === 0 ? ['all core dimensions n/a'] : [];
  if (!det.pass) reasons.push(`deterministic: ${det.failures.join('; ')}`);
  if (major) reasons.push(`${major} major defect(s)`);
  if (below2.length) reasons.push(`below 2: ${below2.join(',')}`);
  if (coreBelow3.length) reasons.push(`core below 3: ${coreBelow3.join(',')}`);
  if (coreMissing.length) reasons.push(`core not scored: ${coreMissing.join(',')}`);
  if (mean === null || mean < 3) reasons.push(`mean ${mean === null ? 'n/a' : mean.toFixed(2)} < 3.00`);
  const meets = det.pass && !major && !below2.length && !coreBelow3.length && !coreMissing.length && mean !== null && mean >= 3;
  return r(meets ? 'MEETS' : 'PARTIAL');
}

// Official vs independent: a disagreement whose official mean lies within
// 3.00 ± 0.15 goes to human adjudication (UNCERTAIN), per the rubric.
export function reconcile(official: OutcomeResult, independent: OutcomeResult): OutcomeV2 {
  if (official.outcome !== independent.outcome && official.mean !== null && Math.abs(official.mean - 3) <= 0.15) return 'UNCERTAIN';
  return official.outcome;
}

export function cohenKappa(pairs: [string, string][]): { agreement: number; kappa: number | null; n: number } {
  const n = pairs.length;
  if (!n) return { agreement: 0, kappa: null, n };
  const labels = [...new Set(pairs.flat())];
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pe = labels.reduce((s, l) => s + (pairs.filter(([a]) => a === l).length / n) * (pairs.filter(([, b]) => b === l).length / n), 0);
  return { agreement: po, kappa: pe === 1 ? null : (po - pe) / (1 - pe), n };
}

// ------------------------------------------------------------- prompts --
export function systemPrompt(rubric: RubricV2): string {
  const dims = rubric.dimensions.map((d) => [
    `${d.ref} ${d.title} (${d.id})${d.core ? ' [CORE]' : ''}: ${d.description}`,
    ...(['0', '1', '2', '3', '4'] as const).map((k) => `  ${k}: ${d.anchors[k]}`),
    ...(d.notes ?? []).map((n) => `  ${n}`),
  ].join('\n')).join('\n\n');
  return [
    'You evaluate an AI language tutor for an English-as-a-foreign-language platform, using the rubric below.',
    'You receive exactly what the tutor received about the learner and lesson (no answer keys), the evaluation guidance for this case, and the learner-visible conversation. Do not assume any information the tutor did not have.',
    'Score each of the 11 dimensions as an integer 0-4 using its anchors, or "n/a" (the dimension cannot apply: single learner turn, or no check due), or "insufficient_evidence" (the transcript cannot show it). Never score 4 without visible evidence.',
    'Every score below 3 and every failure tag must quote the tutor or learner verbatim with its turn number. Score only what is visible; do not infer learning gains or mastery. Do not reward length.',
    'Severity: ' + JSON.stringify(rubric.severity),
    '',
    'GLOBAL RULES (verbatim):',
    rubric.globalRules,
    '',
    `DIMENSIONS (${rubric.rubricVersion}, anchors verbatim):`,
    dims,
    '',
    'Reply with ONLY one JSON object, no prose:',
    JSON.stringify({ scores: Object.fromEntries(rubric.dimensions.map((d) => [d.id, '0-4 | "n/a" | "insufficient_evidence"'])), evidence: { '<dimension id, for every score below 3 or 4>': 'turn N: "verbatim quote" - why' }, failures: [{ severity: 'critical|major|minor', dimension: '<id>', quote: 'turn N: "verbatim"', note: 'short' }], confidence: { '<dimension id, only if low>': 'low' } }),
  ].join('\n');
}

// r4.3: hash of the exact evaluator system prompt, recorded with every result.
export function promptSha256(rubric: RubricV2): string {
  return createHash('sha256').update(systemPrompt(rubric)).digest('hex');
}

export function userPrompt(view: EvaluatorView, turns: RawTurn[]): string {
  return `CASE (evaluatorView, ${VIEW_VERSION}):\n${JSON.stringify(view, null, 1)}\n\nCONVERSATION (${turns.length} learner turn${turns.length === 1 ? '' : 's'}; learner-visible text only):\n${visibleTranscript(turns)}`;
}
