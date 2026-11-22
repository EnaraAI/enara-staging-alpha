// Assessment engine P4 code checks for a generated (or teacher-edited) item (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6.2). Pure. An item is
// refused, with the reasons in plain words, when: the schema is wrong; a single-answer choice item does not have exactly one correct
// option; there are not 3-5 options; options repeat or nearly repeat; the stem is over 400 characters (200 for kids); the objective or
// difficulty is missing; it contains personal data or banned content; the stem gives the answer away; it nearly repeats a recent item;
// the text's script does not match the item's language.
import { checkEngineQuestion } from '../questionBridge';
import { editDistance, normalizeAnswer, scriptOf } from '../text/ar';

export interface GenItem {
  type: string; domain?: string; language: 'ar' | 'en'; stem: string; options?: unknown; answer_key: unknown; difficulty: number;
  objective_code: string; source?: string; flags?: Record<string, boolean>; level?: string;
}

const PII = [/[\w.+-]+@[\w-]+\.[\w.]+/, /(?:\+?\d[\d\s-]{8,}\d)/, /https?:\/\//i];
// Minors' content list (kept short and plain; the judge's safety score covers the rest).
const BANNED = /\b(kill yourself|suicide|porn|sex|cocaine|heroin|gamble|betting|nazi)\b|انتحار|إباحي|مخدرات|قمار|جنس/i;
const tokens = (s: string) => new Set(normalizeAnswer(s).split(/\s+/).filter((w) => w.length > 2));
export function similarity(a: string, b: string): number {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

/** The engine question a bank item becomes (the shape teachers write). */
export function questionOf(item: GenItem, id = 'gen') {
  const open = ['short_answer', 'essay', 'math_steps'].includes(item.type);
  return {
    id, type: 'engine', text: item.stem, ...(open ? {} : { points: 1 }), difficulty: item.difficulty,
    engine: { type: item.type, language: item.language, ...(open ? { domain: item.domain } : {}), ...(item.options !== undefined && item.options !== null ? { options: item.options } : {}), answer_key: item.answer_key, ...(item.flags ? { flags: item.flags } : {}), ...(item.source ? { source: item.source } : {}) },
  };
}

export function checkGenerated(item: GenItem, ctx: { recentStems?: string[]; kids?: boolean } = {}): string[] {
  const p: string[] = [];
  const q = questionOf(item);
  const schema = checkEngineQuestion(q as never);
  if (!schema.ok) p.push(...schema.problems.map((x) => `schema: ${x}`));
  if (!item.objective_code?.trim()) p.push('the objective is missing');
  if (!(item.difficulty >= 1 && item.difficulty <= 5)) p.push('the difficulty is missing (1-5)');
  const max = ctx.kids ? 200 : 400;
  if (item.stem.length > max) p.push(`the stem is over ${max} characters`);
  if (item.type === 'mcq') {
    const opts = (item.options as { id: string; text: string }[] | undefined) ?? [];
    const key = item.answer_key as { correct?: string[]; multi?: boolean };
    if (opts.length < 3 || opts.length > 5) p.push('a choice item needs 3-5 options');
    if (!key.multi && key.correct?.length !== 1) p.push('a single-answer choice item needs exactly one correct option');
    for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
      const a = normalizeAnswer(opts[i].text); const b = normalizeAnswer(opts[j].text);
      if (a === b || (a.length > 4 && editDistance(a, b) <= 1)) p.push(`options ${opts[i].id} and ${opts[j].id} are the same or nearly`);
    }
    const right = opts.filter((o) => key.correct?.includes(o.id)).map((o) => normalizeAnswer(o.text));
    if (right.some((r) => r.length >= 4 && normalizeAnswer(item.stem).includes(r))) p.push('the stem gives the answer away');
  }
  if (item.type === 'fill_blank') {
    const blanks = (item.answer_key as { blanks?: Record<string, string[]> }).blanks ?? {};
    const stem = normalizeAnswer(item.stem.replace(/\{\{blank_\d+\}\}/g, ' '));
    if (Object.values(blanks).flat().some((a) => normalizeAnswer(a).length >= 4 && stem.includes(normalizeAnswer(a)))) p.push('the stem gives the answer away');
  }
  const text = [item.stem, JSON.stringify(item.options ?? '')].join(' ');
  if (PII.some((r) => r.test(text))) p.push('it contains personal data (an email, a phone number or a link)');
  if (BANNED.test(`${text} ${item.source ?? ''}`)) p.push('it contains content not suitable for school learners');
  const script = scriptOf(item.stem.replace(/\{\{\w+\}\}/g, ''));
  if (item.language === 'ar' && script === 'latin') p.push('the item is Arabic but the stem is not written in Arabic');
  if (item.language === 'en' && script === 'ar') p.push('the item is English but the stem is written in Arabic');
  if ((ctx.recentStems ?? []).some((s) => similarity(s, item.stem) >= 0.85)) p.push('it nearly repeats a recent item');
  return [...new Set(p)];
}
