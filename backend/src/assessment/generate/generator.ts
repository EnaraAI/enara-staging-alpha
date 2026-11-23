// Assessment engine P4 generator (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6.1). One model call per request (≤5 items): strict JSON, one
// retry on a malformed reply (askForJson), the key and (for maths) the worked solution in the same call. Humanities items take their
// facts only from the teacher's source text. Never retried on the fallback provider (no spending on another model's account).
import { z } from 'zod';
import { askForJson } from '../../services/aiJson';
import type { GenItem } from './checks';

export const GEN_DOMAINS = ['language', 'math', 'science', 'humanities'] as const;
export const GEN_TYPES: Record<(typeof GEN_DOMAINS)[number], string[]> = {
  language: ['mcq', 'true_false', 'fill_blank', 'short_answer', 'essay'],
  math: ['mcq', 'numeric', 'math_steps'],
  science: ['mcq', 'true_false', 'short_answer', 'essay'],
  humanities: ['mcq', 'true_false', 'short_answer', 'essay'],
};
export interface GenRequest {
  domain: (typeof GEN_DOMAINS)[number]; language: 'ar' | 'en'; level: string; objective_code: string; objective_title?: string;
  types: string[]; count: number; difficulty: [number, number]; source_text?: string; kids?: boolean; feedback?: string;
}

const SHAPES = `JSON shapes by type (ids are short strings):
- mcq: {"type":"mcq","stem":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"answer_key":{"correct":["b"],"multi":false}}  (3-5 options, exactly one correct)
- true_false: {"type":"true_false","stem":"a statement","answer_key":{"value":true}}
- fill_blank: {"type":"fill_blank","stem":"I {{blank_1}} to school every day.","answer_key":{"blanks":{"blank_1":["go","walk"]}}}
- numeric: {"type":"numeric","stem":"...","answer_key":{"value":24,"unit":"cm^2"}}  (unit only when the answer has one; else omit it)
- short_answer / essay (language): {"type":"essay","stem":"...","answer_key":{"model_answer":"..."}}
- short_answer / essay (science): {"type":"short_answer","stem":"...","answer_key":{"content_points":["point 1","point 2"],"model_answer":"..."}}  (2-4 points)
- short_answer / essay (humanities): {"type":"short_answer","stem":"...","answer_key":{"required_points":["point 1","point 2"],"model_answer":"..."}}  (points only from the source)
- math_steps: {"type":"math_steps","stem":"...","answer_key":{"final":{"value":24,"unit":"cm^2"},"solution":"worked steps"}}
Every item also has "difficulty" (1-5).`;

const Reply = z.object({ items: z.array(z.object({ type: z.string(), stem: z.string().min(3), options: z.unknown().optional(), answer_key: z.unknown(), difficulty: z.number().int().min(1).max(5) }).passthrough()).min(1).max(5) });

/** Open items: keep only the key fields the subject's schema allows (the model sometimes adds points or a rubric to a language item, or
 * names a science item's points 'required_points'); found by the generation bench. Closed items are left as they are. */
export function tidyKey(domain: string, type: string, key: unknown): unknown {
  // Numeric keys written as a fraction or expression ("11/12"): mark them as expressions, so 11/12 and 0.91666… both match.
  if (type === 'numeric' && key && typeof key === 'object') {
    const k = key as Record<string, unknown>;
    if (typeof k.value === 'string' && Number.isNaN(Number(k.value))) return { ...k, accept_equivalent_expression: true };
    return key;
  }
  if (!['short_answer', 'essay'].includes(type) || !key || typeof key !== 'object') return key;
  const k = key as Record<string, unknown>;
  const points = (Array.isArray(k.content_points) ? k.content_points : Array.isArray(k.required_points) ? k.required_points : Array.isArray(k.points) ? k.points : undefined) as unknown[] | undefined;
  const model = typeof k.model_answer === 'string' ? { model_answer: k.model_answer } : {};
  if (domain === 'language') return model;
  if (domain === 'science') return { ...(points ? { content_points: points.map(String) } : {}), ...model };
  if (domain === 'humanities') return { ...(points ? { required_points: points.map(String) } : {}), ...model };
  return key;
}

export async function generateItems(req: GenRequest, ctx: { institutionId?: string }): Promise<GenItem[]> {
  const lang = req.language === 'ar' ? 'Modern Standard Arabic (never dialect)' : 'English';
  const system =
    `You write school assessment items for ENARA (Egypt). Write every item in ${lang}, for level ${req.level}${req.kids ? ' (young children: short, simple, friendly)' : ''}. ` +
    `Subject: ${req.domain}. Objective: ${req.objective_code}${req.objective_title ? ` — ${req.objective_title}` : ''}. ` +
    'Each item tests the objective, has one clearly correct answer (or a clear rubric for open items), wrong options that are plausible ' +
    'and based on common mistakes, and never gives the answer away in the stem. Stems under 400 characters. No personal data, names of ' +
    'real living people, links, or content unsuitable for minors. ' +
    (req.domain === 'humanities' ? 'Use ONLY facts from the SOURCE text given; never add facts from your own knowledge. ' : '') +
    (req.feedback ? `A reviewer rejected an earlier version of this item: ${req.feedback.slice(0, 1000)}. Fix every point. ` : '') +
    `${SHAPES} Reply with JSON only: {"items":[...]}.`;
  const user = JSON.stringify({
    count: Math.min(5, Math.max(1, req.count)), types: req.types, difficulty_range: req.difficulty,
    ...(req.source_text ? { source: `<source>${req.source_text.slice(0, 6000)}</source>` } : {}),
  });
  const { value } = await askForJson({
    feature: 'item_generation', institutionId: ctx.institutionId, maxTokens: 4000, allowFallback: false,
    system, user, validate: (raw) => Reply.parse(raw),
  });
  return value.items.slice(0, Math.min(5, req.count)).map((it) => ({
    type: it.type, domain: ['short_answer', 'essay', 'math_steps'].includes(it.type) ? req.domain : undefined, subject: req.domain, language: req.language,
    stem: it.stem, options: it.options, answer_key: tidyKey(req.domain, it.type, it.answer_key), difficulty: it.difficulty, objective_code: req.objective_code,
    level: req.level, ...(req.domain === 'humanities' && req.source_text && ['short_answer', 'essay'].includes(it.type) ? { source: req.source_text } : {}),
  }));
}
