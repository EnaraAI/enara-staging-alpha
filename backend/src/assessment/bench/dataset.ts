// Assessment bench datasets (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §7): data/assessment-bench/<domain>/<lang>/{items,answers}.json,
// written once and frozen in the repo. Each answer carries reference ("gold") scores per rubric criterion, set by the dataset's author
// against the rubric's level descriptions (gold: author, provisional until teacher-graded answers replace it). Nothing here calls a model.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { templateFor, rubricFor, isChecklist } from '../rubrics/templates';
import { ERROR_CODES, type OpenItem } from '../grading-engine/graders/domains';

export const BENCH_SETS = [
  { domain: 'language', lang: 'en' }, { domain: 'language', lang: 'ar' },
  { domain: 'math', lang: 'en' }, { domain: 'math', lang: 'ar' },
  { domain: 'science', lang: 'en' }, { domain: 'science', lang: 'ar' },
  { domain: 'humanities', lang: 'en' }, { domain: 'humanities', lang: 'ar' },
] as const;
export type BenchDomain = 'language' | 'math' | 'science' | 'humanities';
export type BenchLang = 'en' | 'ar';

const Item = z.object({
  id: z.string().min(1),
  type: z.enum(['short_answer', 'essay', 'math_steps']),
  domain: z.enum(['language', 'math', 'science', 'humanities']),
  language: z.enum(['en', 'ar']),
  level: z.string().min(1),
  difficulty: z.number().int().min(1).max(3),
  stem: z.string().min(3),
  model_answer: z.string().optional(),
  final: z.object({ value: z.union([z.number(), z.string()]), unit: z.string().nullable().optional(), tolerance_abs: z.number().nonnegative().optional(), tolerance_rel: z.number().nonnegative().optional() }).optional(),
  solution: z.string().optional(),
  points: z.array(z.string().min(2)).min(1).max(6).optional(),
  units: z.boolean().optional(),
  source: z.string().min(40).optional(),
});
const Answer = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  band: z.enum(['weak', 'mid', 'strong']),
  answer: z.union([z.string(), z.object({ steps: z.string(), final: z.string() })]),
  gold: z.record(z.number().int().min(0)),
  goldTotal: z.number().int().min(0),
  errorCodes: z.array(z.string()).default([]),
  note: z.string().optional(),
});
export type BenchItem = z.infer<typeof Item>;
export type BenchAnswer = z.infer<typeof Answer>;
export interface BenchSet { domain: BenchDomain; lang: BenchLang; items: BenchItem[]; answers: BenchAnswer[] }

export function benchDir(): string | null {
  const c = [join(__dirname, '../../../../data/assessment-bench'), join(__dirname, '../../../data/assessment-bench'), join(process.cwd(), '../data/assessment-bench'), join(process.cwd(), 'data/assessment-bench')];
  return c.find((p) => existsSync(p)) ?? null;
}

/** Problems in one dataset (empty when it is sound): shape, counts, gold scores against the rubric template. */
export function checkSet(set: { domain: string; lang: string; items: unknown; answers: unknown }): string[] {
  const problems: string[] = [];
  const items = z.array(Item).safeParse(set.items);
  const answers = z.array(Answer).safeParse(set.answers);
  if (!items.success) return [`items: ${items.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`];
  if (!answers.success) return [`answers: ${answers.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`];
  const byId = new Map(items.data.map((i) => [i.id, i]));
  if (byId.size !== items.data.length) problems.push('duplicate item ids');
  if (new Set(answers.data.map((a) => a.id)).size !== answers.data.length) problems.push('duplicate answer ids');
  for (const it of items.data) {
    if (it.domain !== set.domain || it.language !== set.lang) problems.push(`${it.id}: domain/language is not ${set.domain}/${set.lang}`);
    if (!templateFor(it.domain, it.type)) problems.push(`${it.id}: no rubric for ${it.domain}/${it.type}`);
    if (it.type === 'math_steps' && !it.final) problems.push(`${it.id}: math item without final`);
    if (isChecklist(it.domain, it.type) && !it.points?.length) problems.push(`${it.id}: ${it.domain} item without points`);
    if (it.domain === 'humanities' && !it.source) problems.push(`${it.id}: humanities item without a source`);
    const n = answers.data.filter((a) => a.itemId === it.id);
    if (n.length !== 3 || new Set(n.map((a) => a.band)).size !== 3) problems.push(`${it.id}: needs one weak, one mid, one strong answer`);
  }
  const codes = ERROR_CODES[set.domain as BenchDomain] ?? [];
  for (const a of answers.data) {
    const it = byId.get(a.itemId);
    if (!it) { problems.push(`${a.id}: unknown item ${a.itemId}`); continue; }
    const crit = rubricFor(it.domain, it.type, it.language, { points: it.points, units: it.units })!.criteria;
    const want = crit.map((c) => c.id).sort();
    const got = Object.keys(a.gold).sort();
    if (want.join() !== got.join()) problems.push(`${a.id}: gold criteria ${got.join(',')} (want ${want.join(',')})`);
    for (const c of crit) if ((a.gold[c.id] ?? 0) > c.maxPoints) problems.push(`${a.id}: ${c.id} over its max`);
    if (Object.values(a.gold).reduce((x, y) => x + y, 0) !== a.goldTotal) problems.push(`${a.id}: goldTotal is not the sum`);
    if (it.type === 'math_steps' && typeof a.answer === 'string') problems.push(`${a.id}: maths answers are {steps, final}`);
    const bad = a.errorCodes.filter((c) => !codes.includes(c));
    if (bad.length) problems.push(`${a.id}: unknown error codes ${bad.join(',')}`);
  }
  return problems;
}

export function loadSet(domain: BenchDomain, lang: BenchLang, dir = benchDir()): BenchSet {
  if (!dir) throw new Error('data/assessment-bench not found');
  const read = (f: string) => JSON.parse(readFileSync(join(dir, domain, lang, f), 'utf8')) as unknown;
  const raw = { domain, lang, items: read('items.json'), answers: read('answers.json') };
  const problems = checkSet(raw);
  if (problems.length) throw new Error(`bench ${domain}/${lang}: ${problems.slice(0, 5).join('; ')}`);
  return { domain, lang, items: z.array(Item).parse(raw.items), answers: z.array(Answer).parse(raw.answers) };
}

/** The engine's view of a bench item (the same shape the assessment bridge builds). */
export function openItemOf(it: BenchItem): OpenItem {
  return {
    questionId: it.id, stem: it.stem, type: it.type, domain: it.domain, language: it.language,
    ...(it.solution ? { solution: it.solution } : {}),
    ...(it.points ? { points: it.points, units: it.units === true } : {}), ...(it.source ? { source: it.source } : {}),
    ...(it.final ? { final: { value: it.final.value, unit: it.final.unit ?? null, ...(it.final.tolerance_abs !== undefined ? { tolerance_abs: it.final.tolerance_abs } : {}), ...(it.final.tolerance_rel !== undefined ? { tolerance_rel: it.final.tolerance_rel } : {}) } } : {}),
  };
}

/** The learner's answer as the engine receives it (maths: the screen's JSON {steps, final}). */
export const answerTextOf = (a: BenchAnswer): string => (typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer));
