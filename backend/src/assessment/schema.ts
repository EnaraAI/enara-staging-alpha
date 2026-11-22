// Assessment engine: the item schema (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3-§4). One strict (zod) definition of every item type's
// options, answer key and learner answer, used by the graders, the bank and (later) generation. Subject-agnostic: nothing here assumes
// English or CEFR. Bank items are immutable: an edit makes a new version.
import { z } from 'zod';

export const SUBJECTS = ['language', 'math', 'science', 'humanities', 'code', 'other'] as const;
export const CLOSED_TYPES = ['mcq', 'true_false', 'fill_blank', 'matching', 'numeric', 'ordering', 'dropdown'] as const;
export const OPEN_TYPES = ['short_answer', 'essay', 'math_steps', 'sentence_correction', 'paraphrase', 'reading_comprehension'] as const;
export const MEDIA_TYPES = ['listening', 'speaking'] as const;
export const ITEM_TYPES = [...CLOSED_TYPES, ...OPEN_TYPES, ...MEDIA_TYPES, 'code'] as const;
export type ClosedType = (typeof CLOSED_TYPES)[number];
export type ItemType = (typeof ITEM_TYPES)[number];
export const isClosedType = (t: string): t is ClosedType => (CLOSED_TYPES as readonly string[]).includes(t);

/** Why a part of an answer got its points: fixed codes, so every screen can say it in Arabic or English. */
export const REASON_CODES = ['correct', 'wrong', 'empty', 'partly_correct', 'spelling_close', 'unit_missing', 'unit_wrong', 'not_a_number', 'equivalent_expression', 'order_partly_correct'] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

const id = z.string().min(1).max(64);
const text = z.string().min(1).max(2000);
const BLANK = /\{\{(blank_\d+)\}\}/g;
const DROP = /\{\{(drop_\d+)\}\}/g;
export const placeholders = (stem: string, re: RegExp): string[] => [...stem.matchAll(new RegExp(re.source, 'g'))].map((m) => m[1]);

export const ItemFlags = z.object({
  lenient_spelling: z.boolean().optional(),
  ta_marbuta_fold: z.boolean().optional(),
  kids: z.boolean().optional(),
  exam_style: z.boolean().optional(),
}).strict();
export type ItemFlags = z.infer<typeof ItemFlags>;

const Option = z.object({ id, text, error_code: z.string().max(64).optional() }).strict();

// ---- per-type options, answer key and learner answer -------------------------------------------------------------
export const McqKey = z.object({ correct: z.array(id).min(1), multi: z.boolean() }).strict();
export const TrueFalseKey = z.object({ value: z.boolean() }).strict();
export const FillBlankKey = z.object({ blanks: z.record(z.string().regex(/^blank_\d+$/), z.array(z.string().min(1).max(200)).min(1)) }).strict();
export const MatchingOptions = z.object({ left: z.array(Option).min(2), right: z.array(Option).min(2) }).strict();
export const MatchingKey = z.object({ pairs: z.array(z.tuple([id, id])).min(2) }).strict();
export const NumericKey = z.object({
  value: z.union([z.number(), z.string().min(1).max(200)]),
  tolerance_abs: z.number().nonnegative().optional(),
  tolerance_rel: z.number().nonnegative().max(1).optional(),
  unit: z.string().max(32).nullable().optional(),
  accept_equivalent_expression: z.boolean().optional(),
}).strict();
export const OrderingKey = z.object({ order: z.array(id).min(2) }).strict();
export const DropdownOptions = z.record(z.string().regex(/^drop_\d+$/), z.array(z.string().min(1).max(200)).min(2));
export const DropdownKey = z.object({ choices: z.record(z.string().regex(/^drop_\d+$/), z.string().min(1).max(200)) }).strict();

const base = {
  id,
  version: z.number().int().min(1),
  subject: z.enum(SUBJECTS),
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  curriculum: z.string().min(1).max(64),
  level: z.string().min(1).max(32),
  objective_code: z.string().min(1).max(64),
  difficulty: z.number().int().min(1).max(5),
  stem: z.string().min(1).max(4000),
  media: z.object({ kind: z.enum(['image', 'audio', 'table']), url: z.string().url(), alt_ar: z.string().max(500), alt_en: z.string().max(500) }).strict().nullable().optional(),
  points: z.number().positive().max(100).optional(),
  skill_codes: z.array(z.string().max(64)).default([]),
  error_codes: z.array(z.string().max(64)).default([]),
  flags: ItemFlags.default({}),
};

export const ClosedItem = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('mcq'), options: z.array(Option).min(2).max(8), answer_key: McqKey }).strict(),
  z.object({ ...base, type: z.literal('true_false'), options: z.null().optional(), answer_key: TrueFalseKey }).strict(),
  z.object({ ...base, type: z.literal('fill_blank'), options: z.null().optional(), answer_key: FillBlankKey }).strict(),
  z.object({ ...base, type: z.literal('matching'), options: MatchingOptions, answer_key: MatchingKey }).strict(),
  z.object({ ...base, type: z.literal('numeric'), options: z.null().optional(), answer_key: NumericKey }).strict(),
  z.object({ ...base, type: z.literal('ordering'), options: z.array(Option).min(2).max(10), answer_key: OrderingKey }).strict(),
  z.object({ ...base, type: z.literal('dropdown'), options: DropdownOptions, answer_key: DropdownKey }).strict(),
]).superRefine((item, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  switch (item.type) {
    case 'mcq': {
      const all = ids(item.options);
      if (all.size !== item.options.length) bad('option ids must be unique');
      if (item.answer_key.correct.some((c) => !all.has(c))) bad('a correct id is not an option');
      if (!item.answer_key.multi && item.answer_key.correct.length !== 1) bad('a single-answer mcq has exactly one correct option');
      break;
    }
    case 'fill_blank': {
      const marks = placeholders(item.stem, BLANK);
      const keys = Object.keys(item.answer_key.blanks);
      if (!marks.length) bad('the stem has no {{blank_n}}');
      if (new Set(marks).size !== marks.length) bad('a blank appears twice in the stem');
      if (marks.length !== keys.length || marks.some((m) => !keys.includes(m))) bad('every blank in the stem needs accepted answers, and only those');
      break;
    }
    case 'matching': {
      const L = ids(item.options.left); const R = ids(item.options.right);
      const usedL = item.answer_key.pairs.map((p) => p[0]);
      if (item.answer_key.pairs.some(([l, r]) => !L.has(l) || !R.has(r))) bad('a pair names an unknown option');
      if (new Set(usedL).size !== usedL.length) bad('a left option is paired twice');
      break;
    }
    case 'numeric':
      if (typeof item.answer_key.value === 'string' && !item.answer_key.accept_equivalent_expression && Number.isNaN(Number(item.answer_key.value))) bad('a non-number key needs accept_equivalent_expression');
      break;
    case 'ordering': {
      const all = ids(item.options);
      if (item.answer_key.order.length !== item.options.length || item.answer_key.order.some((o) => !all.has(o)) || new Set(item.answer_key.order).size !== item.answer_key.order.length) bad('the order must list every option once');
      break;
    }
    case 'dropdown': {
      const marks = placeholders(item.stem, DROP);
      if (!marks.length) bad('the stem has no {{drop_n}}');
      for (const m of marks) {
        const choice = item.answer_key.choices[m];
        if (!item.options[m]) bad(`${m} has no choices`);
        else if (!choice || !item.options[m].includes(choice)) bad(`${m}: the key is not one of its choices`);
      }
      if (Object.keys(item.answer_key.choices).length !== marks.length) bad('every drop in the stem needs one key, and only those');
      break;
    }
  }
});
export type ClosedItem = z.infer<typeof ClosedItem>;

/** A learner's answer per type (loose on purpose: what the app sends is checked by the grader, never trusted). */
export type ClosedAnswer = unknown;

// ---- grading result (the engine's one output shape) --------------------------------------------------------------
export interface CriterionResult { code: string; points: number; max: number; reason_code: ReasonCode }
export interface GradeResult {
  total: number;
  max: number;
  criteria: CriterionResult[];
  error_codes: string[];
  confidence: number;
  flagged: boolean;
  feedback_text: string;
  grader: 'code' | `model:${string}` | 'teacher';
}

// ---- rubric (bank, bilingual) ------------------------------------------------------------------------------------
export const RubricCriterion = z.object({
  code: z.string().min(1).max(64),
  title_ar: z.string().min(1).max(200),
  title_en: z.string().min(1).max(200),
  max_points: z.number().positive().max(100),
  descriptors_ar: z.record(z.string(), z.string().max(1000)),
  descriptors_en: z.record(z.string(), z.string().max(1000)),
}).strict();
export const RubricSchema = z.object({
  id, version: z.number().int().min(1), domain: z.enum(SUBJECTS), type: z.string().min(1).max(32),
  criteria: z.array(RubricCriterion).min(1).max(12), total_points: z.number().positive(),
}).strict().refine((r) => Math.abs(r.criteria.reduce((n, c) => n + c.max_points, 0) - r.total_points) < 1e-9, { message: 'total_points must equal the sum of the criteria' });
