// Assessment engine P1b (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3, §8): the closed item types inside ENARA assessments. One new question
// type, 'engine', carries the item in the engine's own schema (question.engine = {type, options, answer_key, flags, language}); every
// existing type is unchanged. The learner's answer travels as JSON text (the answer fields stay string | number everywhere), and is
// read here only to grade it. The answer key never reaches a learner: forLearner() removes it, and the order of ordering and matching
// options is shuffled (fixed per question) so the stored order cannot give the answer away.
import { createHash } from 'crypto';
import { CLOSED_TYPES, ClosedItem, type ClosedType, type GradeResult } from './schema';
import { gradeClosed, InvalidItemError } from './grading-engine/graders/closed';

export const ENGINE_TYPE = 'engine' as const;
export interface EngineContent { type: ClosedType; options?: unknown; answer_key: unknown; flags?: Record<string, boolean>; language: string; error_codes?: string[] }
type Q = { id: string; type: string; text: string; points?: number; difficulty?: number; engine?: EngineContent | null };

/** The engine item of a question, in the schema the graders check. */
export function itemOf(q: Q): unknown {
  const e = q.engine ?? ({} as EngineContent);
  return {
    id: q.id, version: 1, subject: 'other', language: e.language || 'en', curriculum: 'custom', level: '-', objective_code: '-',
    difficulty: q.difficulty ?? 3, stem: q.text, type: e.type, options: e.options ?? null, answer_key: e.answer_key,
    ...(q.points !== undefined ? { points: q.points } : {}), flags: e.flags ?? {}, error_codes: e.error_codes ?? [],
  };
}

/** Checks a teacher's engine question; returns the stored content or the problems in plain words. */
export function checkEngineQuestion(q: Q): { ok: true; engine: EngineContent } | { ok: false; problems: string[] } {
  const e = q.engine;
  if (!e || typeof e !== 'object' || !(CLOSED_TYPES as readonly string[]).includes(String(e.type))) return { ok: false, problems: [`engine.type must be one of ${CLOSED_TYPES.join(', ')}`] };
  const parsed = ClosedItem.safeParse(itemOf(q));
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`) };
  const p = parsed.data;
  return { ok: true, engine: { type: p.type, options: p.options ?? undefined, answer_key: p.answer_key, flags: p.flags, language: p.language, ...(p.error_codes.length ? { error_codes: p.error_codes } : {}) } };
}

/** The learner's answer: JSON text for structured answers (lists, pairs, blanks), else the text itself. */
export function parseAnswer(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t || !(t.startsWith('{') || t.startsWith('['))) return raw;
  try { return JSON.parse(t); } catch { return raw; }
}

/** The correct answer in plain words (shown on a released result when the assignment reveals answers). */
export function describeKey(q: Q): string {
  const e = q.engine; if (!e) return '';
  const k = e.answer_key as Record<string, unknown>;
  const text = (opts: unknown, id: string) => ((opts as { id: string; text: string }[] | undefined)?.find((o) => o.id === id)?.text ?? id);
  switch (e.type) {
    case 'mcq': return (k.correct as string[]).map((id) => text(e.options, id)).join(' · ');
    case 'true_false': return k.value ? (e.language === 'ar' ? 'صح' : 'True') : (e.language === 'ar' ? 'خطأ' : 'False');
    case 'fill_blank': return Object.entries(k.blanks as Record<string, string[]>).sort().map(([, v]) => v[0]).join(' · ');
    case 'matching': {
      const o = e.options as { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
      return (k.pairs as [string, string][]).map(([l, r]) => `${text(o.left, l)} → ${text(o.right, r)}`).join(' · ');
    }
    case 'numeric': return `${String(k.value)}${k.unit ? ` ${String(k.unit)}` : ''}`;
    case 'ordering': return (k.order as string[]).map((id) => text(e.options, id)).join(' → ');
    case 'dropdown': return Object.entries(k.choices as Record<string, string>).sort().map(([, v]) => v).join(' · ');
  }
}

/** The learner's answer in plain words, with option texts instead of ids (for the result and the teacher's grading view). */
export function describeAnswer(q: Q, raw: unknown): string {
  const e = q.engine; const a = parseAnswer(raw);
  if (!e || a === '' || a === null || a === undefined) return '';
  const text = (opts: unknown, id: unknown) => ((opts as { id: string; text: string }[] | undefined)?.find((o) => o.id === String(id))?.text ?? String(id));
  const ordered = (o: Record<string, unknown>) => Object.entries(o).sort(([x], [y]) => Number(x.split('_')[1]) - Number(y.split('_')[1])).map(([, v]) => String(v ?? '')).join(' · ');
  switch (e.type) {
    case 'mcq': return (Array.isArray(a) ? a : [a]).map((id) => text(e.options, id)).join(' · ');
    case 'true_false': return String(a);
    case 'fill_blank': case 'dropdown': return a && typeof a === 'object' && !Array.isArray(a) ? ordered(a as Record<string, unknown>) : String(a);
    case 'matching': {
      const o = e.options as { left: unknown; right: unknown };
      const pairs = Array.isArray(a) ? (a as unknown[][]).map((p) => [p?.[0], p?.[1]]) : Object.entries((a as Record<string, unknown>) ?? {});
      return pairs.map(([l, r]) => `${text(o.left, l)} → ${text(o.right, r)}`).join(' · ');
    }
    case 'ordering': return Array.isArray(a) ? a.map((id) => text(e.options, id)).join(' → ') : String(a);
    default: return String(a);
  }
}

const shuffled = <T>(xs: T[], seed: string): T[] => {
  const keyed = xs.map((x, i) => ({ x, k: createHash('sha256').update(`${seed}:${i}`).digest('hex') }));
  keyed.sort((a, b) => (a.k < b.k ? -1 : 1));
  const out = keyed.map((y) => y.x);
  // Never the original order for 2+ items (it could be the answer).
  if (out.length > 1 && out.every((y, i) => y === xs[i])) out.push(out.shift()!);
  return out;
};

/** The question as a learner sees it: no answer key; ordering options and matching right column in a fixed shuffled order. */
export function forLearner<T extends Q>(q: T): T {
  if (q.type !== ENGINE_TYPE || !q.engine) return q;
  const { answer_key: _k, error_codes: _e, ...rest } = q.engine;
  let options = rest.options;
  if (rest.type === 'ordering' && Array.isArray(options)) options = shuffled(options, `${q.id}:order`);
  if (rest.type === 'matching' && options && typeof options === 'object') {
    const o = options as { left: unknown[]; right: unknown[] };
    options = { left: o.left, right: shuffled(o.right, `${q.id}:right`) };
  }
  // A multi-answer choice shows checkboxes: whether it is multi is not secret (which options are right is).
  const multi = rest.type === 'mcq' && (q.engine.answer_key as { multi?: boolean } | undefined)?.multi === true;
  return { ...q, engine: { ...rest, options, ...(multi ? { multi: true } : {}) } };
}

/** Grades one engine question; the fields of the stored attempt answer. A malformed item is a problem for a person, not a score. */
export function gradeEngineQuestion(q: Q, rawAnswer: unknown): { result: GradeResult; correctAnswer: string; answerText: string } | { invalid: string[] } {
  try {
    return { result: gradeClosed(itemOf(q), parseAnswer(rawAnswer)), correctAnswer: describeKey(q), answerText: describeAnswer(q, rawAnswer) };
  } catch (e) {
    if (e instanceof InvalidItemError) return { invalid: e.issues };
    throw e;
  }
}
