// Assessment engine: grading one open answer (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3). Two independent runs (consistency, as the
// existing grader); the first valid run is the proposal. The answer is FLAGGED for the teacher's queue (the learner sees "under review"
// until the teacher has looked and the result is released) when:
//   - the model is unavailable or a run failed or was invalid (no score is invented: points 0, a person scores it);
//   - confidence < 0.7 (the lower of the two runs);
//   - the two runs differ by more than 1 point on any criterion;
//   - the answer may contain instructions to the grader.
// The "within 1 point of the pass mark" flag needs the whole attempt and is applied by the caller (attemptBoundaryFlag).
// Rules-first (switch rulesFirst, off by default; docs/tutor/RULES_FIRST_GRADING_PLAN.md §2): code rules run first. When they decide
// every criterion (a blank answer, the wrong script, the question copied) the grade is code's alone: no model call, confidence 1,
// grader 'code'. Otherwise the model scores only what code left open; code scores stand, and confidence and flags are the model's share.
import { gradeOpenRun, type CriterionScore, type OpenItem, type RunResult, type RunOptions } from './graders/domains';
import { runRules, type RulesResult } from './rules';
import { engineV2 } from '../../services/engineV2';

export const CONFIDENCE_FLAG = 0.7;
export const FLAG_REASONS = ['model_unavailable', 'model_error', 'low_confidence', 'runs_disagree', 'integrity', 'near_pass_mark'] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface OpenGrade {
  points: number;
  maxPoints: number;
  criterionScores: CriterionScore[];
  criteria: { code: string; points: number; max: number; reasonCode: string; scoredBy?: 'code' | 'model'; rule?: string; reason?: string }[];
  errorCodes: string[];
  confidence: number;
  flagged: boolean;
  flagReasons: FlagReason[];
  feedback: string;
  scoreExplanation: string;
  strengths: string[];
  improvements: string[];
  proposalId?: string;
  grader: string;
  runs: RunResult[];
}

const reasonFor = (points: number, max: number) => (points >= max ? 'met' : points > 0 ? 'partly_met' : 'not_met');

const criterionOf = (maxByCriterion: Record<string, number>) => (s: CriterionScore): OpenGrade['criteria'][number] => ({
  code: s.criterionId, points: s.points, max: maxByCriterion[s.criterionId] ?? s.points, reasonCode: reasonFor(s.points, maxByCriterion[s.criterionId] ?? s.points),
  ...(s.scoredBy ? { scoredBy: s.scoredBy, ...(s.rule ? { rule: s.rule } : {}), ...(s.reason ? { reason: s.reason } : {}) } : {}),
});

const CODE_FEEDBACK: Record<string, { en: string; ar: string }> = {
  blank: { en: 'No answer was written.', ar: 'لم تُكتب إجابة.' },
  wrong_script: { en: 'The answer is not written in the language of the question.', ar: 'الإجابة ليست مكتوبة بلغة السؤال.' },
  copied_stem: { en: 'The answer repeats the question instead of answering it.', ar: 'الإجابة تكرر نص السؤال ولا تجيب عنه.' },
};
/** A grade decided entirely by code rules (no model call). Exported for tests. */
export function codeGrade(rules: RulesResult, maxByCriterion: Record<string, number>, ui: 'ar' | 'en'): OpenGrade {
  const scores: CriterionScore[] = Object.keys(maxByCriterion).map((id) => {
    const d = rules.decided[id];
    return { criterionId: id, levelId: `p${d.points}`, points: d.points, scoredBy: 'code', rule: d.ruleId, reason: d.reason };
  });
  const first = rules.decided[Object.keys(maxByCriterion)[0]];
  const fb = CODE_FEEDBACK[first?.ruleId] ?? { en: 'Scored by the answer checks.', ar: 'صُحّحت بالفحص الآلي.' };
  const points = scores.reduce((n, c) => n + c.points, 0);
  return {
    points, maxPoints: Object.values(maxByCriterion).reduce((n, m) => n + m, 0), criterionScores: scores, criteria: scores.map(criterionOf(maxByCriterion)),
    errorCodes: [], confidence: 1, flagged: false, flagReasons: [], feedback: fb[ui], scoreExplanation: fb[ui], strengths: [], improvements: [], grader: 'code', runs: [],
  };
}

/** Combines two runs into one grade and its flags (pure; exported for tests). */
export function combineRuns(runs: RunResult[], maxByCriterion: Record<string, number>): OpenGrade {
  const maxPoints = Object.values(maxByCriterion).reduce((n, m) => n + m, 0);
  const ok = runs.filter((r) => r.status === 'proposed');
  const blank = (reason: FlagReason): OpenGrade => ({ points: 0, maxPoints, criterionScores: [], criteria: [], errorCodes: [], confidence: 0, flagged: true, flagReasons: [reason], feedback: '', scoreExplanation: '', strengths: [], improvements: [], grader: 'none', runs });
  if (!ok.length) return blank(runs.some((r) => r.error === 'AI_UNAVAILABLE' || r.error === 'AI_PAUSED' || r.error === 'AI_BUDGET_UNAVAILABLE') ? 'model_unavailable' : 'model_error');
  const chosen = ok[0];
  const reasons = new Set<FlagReason>();
  if (ok.length < runs.length) reasons.add('model_error');
  const confidence = Math.min(...ok.map((r) => r.confidence));
  if (confidence < CONFIDENCE_FLAG) reasons.add('low_confidence');
  if (ok.length >= 2) {
    const [a, b] = ok;
    for (const c of Object.keys(maxByCriterion)) {
      const pa = a.criterionScores.find((x) => x.criterionId === c)?.points ?? 0;
      const pb = b.criterionScores.find((x) => x.criterionId === c)?.points ?? 0;
      if (Math.abs(pa - pb) > 1) reasons.add('runs_disagree');
    }
  }
  if (ok.some((r) => r.flags.includes('possible_integrity_issue'))) reasons.add('integrity');
  return {
    points: chosen.points, maxPoints, criterionScores: chosen.criterionScores,
    criteria: chosen.criterionScores.map(criterionOf(maxByCriterion)),
    errorCodes: chosen.errorCodes, confidence, flagged: reasons.size > 0, flagReasons: [...reasons],
    feedback: chosen.feedback, scoreExplanation: chosen.scoreExplanation, strengths: chosen.strengths, improvements: chosen.improvements,
    proposalId: chosen.proposalId, grader: `model:${chosen.modelName ?? 'unknown'}`, runs,
  };
}

/** Grades one open answer: two runs, combined, flagged when needed. A model that is not available gives a flagged blank grade. */
export async function gradeOpenAnswer(p: { attempt: { id: string; institutionId?: string; assignmentId?: string }; item: OpenItem; answer: unknown; uiLanguage: 'ar' | 'en'; maxByCriterion: Record<string, number>; modelReady: boolean; options?: RunOptions }): Promise<OpenGrade> {
  const rules = engineV2('rulesFirst') ? rulesFor(p.item, p.answer, p.maxByCriterion) : undefined;
  if (rules?.allDecided) return codeGrade(rules, p.maxByCriterion, p.uiLanguage);
  if (!p.modelReady) return combineRuns([{ proposalId: '', status: 'failed', criterionScores: [], points: 0, confidence: 0, errorCodes: [], feedback: '', scoreExplanation: '', strengths: [], improvements: [], flags: [], error: 'AI_UNAVAILABLE' }], p.maxByCriterion);
  const runs = await Promise.all([1, 2].map((run) => gradeOpenRun({ attempt: p.attempt, item: p.item, answer: p.answer, uiLanguage: p.uiLanguage, run, options: p.options, ...(rules ? { rules } : {}) })));
  return combineRuns(runs, p.maxByCriterion);
}

/** The rules on one answer against the item's rubric (criterion → max points). */
export const rulesFor = (item: OpenItem, answer: unknown, maxByCriterion: Record<string, number>): RulesResult =>
  runRules(item, answer, Object.entries(maxByCriterion).map(([id, maxPoints]) => ({ id, maxPoints })), item.language);

/** The pass-mark flag: a model-graded attempt whose total is within 1 point of the pass mark goes to the teacher. */
export function nearPassMark(total: number, max: number, passPercent: number | undefined): boolean {
  if (passPercent === undefined || passPercent === null || !(max > 0)) return false;
  return Math.abs(total - (max * passPercent) / 100) <= 1;
}
