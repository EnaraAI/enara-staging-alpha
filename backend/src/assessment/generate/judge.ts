// Assessment engine P4 judge (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6.3). Scores one item 1-5 on each criterion; pass = every criterion
// ≥ 4 and safety = 5. Runs on the configured provider (DeepSeek on lms-test) until the Anthropic judge is switched on: every report says
// "judge: provisional (same provider as the generator)". Never retried on the fallback provider.
import { z } from 'zod';
import { askForJson } from '../../services/aiJson';
import type { GenItem } from './checks';

export const JUDGE_CRITERIA = ['clarity', 'single_correct_answer', 'level_fit', 'objective_fit', 'key_correctness', 'language_quality', 'safety'] as const;
const Reply = z.object({ scores: z.object(Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, z.number().int().min(1).max(5)])) as Record<(typeof JUDGE_CRITERIA)[number], z.ZodNumber>), feedback: z.string().max(1500) });
export interface JudgeReport { scores: Record<string, number>; feedback: string; pass: boolean; judge: string; at: string }

export const judgePass = (s: Record<string, number>) => JUDGE_CRITERIA.every((c) => (s[c] ?? 0) >= 4) && s.safety === 5;

export async function judgeItem(item: GenItem, ctx: { institutionId?: string; objectiveTitle?: string }): Promise<JudgeReport> {
  const system =
    'You review one school assessment item before a teacher sees it. Score each criterion from 1 (bad) to 5 (excellent): clarity (one ' +
    'reading only), single_correct_answer (exactly one defensible answer, or a rubric that can be applied), level_fit (right for the ' +
    'stated level and age), objective_fit (tests the stated objective), key_correctness (solve it yourself: the key is right), ' +
    `language_quality (${item.language === 'ar' ? 'correct Modern Standard Arabic, no dialect, age-appropriate register' : 'correct, natural English'}), ` +
    'safety (5 only when fully suitable for minors: no violence, adult themes, stereotypes, personal data). Be strict: a wrong key is 1. ' +
    'feedback: what to fix, in one or two sentences (empty when everything is 5). Reply with JSON only: {"scores":{...},"feedback":"..."}.';
  const { value, model } = await askForJson({
    feature: 'item_generation', institutionId: ctx.institutionId, maxTokens: 800, allowFallback: false, system,
    user: JSON.stringify({ level: item.level, objective: `${item.objective_code}${ctx.objectiveTitle ? ` — ${ctx.objectiveTitle}` : ''}`, item: { type: item.type, stem: item.stem, options: item.options ?? null, answer_key: item.answer_key, ...(item.source ? { source: item.source } : {}) } }),
    validate: (raw) => Reply.parse(raw),
  });
  return { scores: value.scores, feedback: value.feedback, pass: judgePass(value.scores), judge: `provisional (${model})`, at: new Date().toISOString() };
}
