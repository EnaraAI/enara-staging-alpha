// ragRewrite + ragReuse (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item C, from ARCHITECTURE.md §5-6): our course retrieval is keyword-only
// (BM25), so an Arabic question about English material (or the reverse) found nothing, and "explain again" searched from scratch.
// - ragRewrite: when the first search finds nothing, ONE cheap model call turns the question into short search keywords in English AND
//   Arabic, and the search runs once more (same school / curriculum / document-safety scope). Metered like any call.
// - ragReuse: when the learner asks to have the last answer explained again ("I don't understand", "explain again", "مش فاهم"), the
//   passages cited in the previous reply are reused (same scope), so the re-explanation stays on the same material.
// Both are named-only switches, off by default.
import { engineV2 } from './engineV2';
import { askForJson } from './aiJson';
import { getConfig } from '../config/env';
import { CurriculumChunk } from '../models/CurriculumChunk';
import { retrieveCurriculumSources, retrievalScope, type RetrievedSource } from './curriculumRetrieval';

export const ragRewriteOn = (): boolean => engineV2('ragRewrite');
export const ragReuseOn = (): boolean => engineV2('ragReuse');

// "explain again" in English and Arabic (MSA and Egyptian). Short messages only: a long message is a new question.
const AGAIN = /\b(explain (it |that |this )?(again|differently|another way|more simply)|i (still )?(don'?t|do not|didn'?t) (get|understand)|not clear|say (it|that) again|simpler|again please|one more time)\b|مش فاهم|مو فاهم|لم افهم|لم أفهم|ما فهمت|مافهمتش|اشرح(ها|ه)? (تاني|مرة تانية|مرة أخرى|مره تانيه|من جديد|بطريقة)|وضح أكثر|بشكل أبسط|أبسط/i;
export const asksToExplainAgain = (text: string): boolean => text.trim().length <= 120 && AGAIN.test(text);

export const REWRITE_SYSTEM = 'You turn a student\'s question into search keywords for a keyword search over course materials that may be in English or Arabic. Reply with JSON only: {"en": "3-8 English keywords", "ar": "3-8 Arabic keywords"}. Keywords only: the topic\'s nouns and terms, no question words, no full sentences.';
/** Parses the rewrite reply: two short keyword strings (letters, digits, spaces), at most 120 characters each. */
export function parseRewrite(v: unknown): { en: string; ar: string } {
  const o = v as { en?: unknown; ar?: unknown };
  const clean = (x: unknown) => String(x ?? '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const r = { en: clean(o?.en), ar: clean(o?.ar) };
  if (!r.en && !r.ar) throw new Error('no keywords');
  return r;
}

type Params = Parameters<typeof retrieveCurriculumSources>[0];
/** The first search; when it finds nothing and ragRewrite is on, one rewrite and a second search. */
export async function retrieveWithRewrite(params: Params, deps: { search?: typeof retrieveCurriculumSources; rewrite?: (q: string) => Promise<{ en: string; ar: string }> } = {}): Promise<{ sources: RetrievedSource[]; rewritten: boolean }> {
  const search = deps.search ?? retrieveCurriculumSources;
  const first = await search(params);
  if (first.length || !ragRewriteOn() || !params.institutionId || !params.curriculumId) return { sources: first, rewritten: false };
  const rewrite = deps.rewrite ?? (async (q: string) => (await askForJson({
    feature: 'tutor_retrieval_rewrite', system: REWRITE_SYSTEM, user: q.slice(0, 600), maxTokens: 120, institutionId: params.institutionId,
    model: getConfig().anthropicIntentModel, validationAttempts: 1, validate: parseRewrite,
  })).value);
  let kw: { en: string; ar: string };
  try { kw = await rewrite(params.query); } catch { return { sources: [], rewritten: false }; }
  const second = await search({ ...params, query: `${kw.en} ${kw.ar}`.trim() });
  return { sources: second, rewritten: true };
}

/** ragReuse: the passages the previous reply cited (by chunk id), re-read in the SAME scope; numbered 1..n in the given order. */
export async function reusePassages(params: { institutionId?: string; curriculumId?: string; chunkIds: string[] }): Promise<RetrievedSource[]> {
  if (!ragReuseOn() || !params.chunkIds.length) return [];
  const scope = await retrievalScope(params);
  if (!scope) return [];
  const ids = [...new Set(params.chunkIds)].slice(0, 6);
  const rows = await CurriculumChunk.find({ ...scope, id: { $in: ids } }).select('id text fileName fileUrl uploadId page sectionLabel lessonId').lean();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((r, i) => ({
    n: i + 1, chunkId: r!.id, text: r!.text, fileName: r!.fileName, fileUrl: (r as { fileUrl?: string }).fileUrl ?? '', ...(r!.uploadId ? { uploadId: r!.uploadId } : {}),
    ...(r!.page !== undefined ? { page: r!.page } : {}), ...(r!.sectionLabel ? { sectionLabel: r!.sectionLabel } : {}), lessonId: r!.lessonId, score: 0,
  }));
}
