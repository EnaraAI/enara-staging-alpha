// planner2e fix 1 (owner: high priority): a "Wrong:" example must really be wrong English. A pair whose wrong sentence only swaps meaning
// words ("A teacher works at a hospital", "I drink milk") or joining words ("small and it is clean") is good English: labelling it wrong
// teaches something false. This module finds right/wrong pairs in a reply and flags those, deterministically (no model call).
// A form error (a missing or extra small word, a wrong ending, a spelling slip, a word-order change, an over-regular past) passes.

import { ADULT_WORDS } from './kidsWordList';
/** Small words: articles, be/do/have, modals, pronouns, determiners, quantifiers, prepositions, frequency adverbs, negation, question words. */
const FUNCTION = new Set(`a an the is am are was were be been being do does did done have has had will would can could shall should must may might
some any much many few little more most less least than as of in on at to for from with by about into onto over under after before up down out off
i you he she it we they me him her us them my your his its our their mine yours hers ours theirs this that these those there here
not no never always often usually sometimes ever yet already just still very too also only
and but or so because if when while then who whom whose which what where how why`.split(/\s+/));
/** Joining words: a swap between two of these changes the meaning, not the form ("small but clean" / "small and clean"). */
const JOINERS = new Set(['and', 'but', 'or', 'so', 'because', 'then', 'when', 'while', 'if', 'although', 'though']);
/** Common irregular verbs: base, past, participle (a swap inside one family, or an over-regular "-ed" of the base, is a form error). */
const IRREGULAR = `be was were been|begin began begun|break broke broken|bring brought|build built|buy bought|catch caught|choose chose chosen|come came|cost|cut|do did done|draw drew drawn|drink drank drunk|drive drove driven|eat ate eaten|fall fell fallen|feel felt|fight fought|find found|fly flew flown|forget forgot forgotten|get got gotten|give gave given|go went gone|grow grew grown|have had|hear heard|hit|hold held|hurt|keep kept|know knew known|learn learnt|leave left|lend lent|let|lose lost|make made|mean meant|meet met|pay paid|put|read|ride rode ridden|ring rang rung|rise rose risen|run ran|say said|see saw seen|sell sold|send sent|set|shut|sing sang sung|sit sat|sleep slept|speak spoke spoken|spend spent|stand stood|steal stole stolen|swim swam swum|take took taken|teach taught|tell told|think thought|throw threw thrown|understand understood|wake woke woken|wear wore worn|win won|write wrote written`
  .split('|').map((f) => f.split(' '));
const familyOf = new Map<string, number>(); IRREGULAR.forEach((f, i) => f.forEach((w) => familyOf.set(w, i)));

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const overRegular = (w: string): number | undefined => {
  if (!/(ed|d)$/.test(w)) return undefined;
  for (const stem of [w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/([b-df-hj-np-tv-z])\1ed$/, '$1'), w.replace(/ied$/, 'y')]) if (familyOf.has(stem)) return familyOf.get(stem);
  return undefined;
};
/** Two words are forms of one word: shared start and close spelling, one irregular family, or an over-regular past of it. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n >= 3 && a.slice(0, 3) === b.slice(0, 3) && Math.abs(a.length - b.length) <= 4) return true;
  if (a[0] === b[0] && lev(a, b) <= 2) return true;
  const fa = familyOf.get(a) ?? overRegular(a); const fb = familyOf.get(b) ?? overRegular(b);
  return fa !== undefined && fa === fb;
}
const DICT = new Set(ADULT_WORDS);
/** A real English word (the app word list, with plain endings removed), so a misspelling ("ben", "swimmed") is not one. */
export function isWord(w: string): boolean {
  if (DICT.has(w) || familyOf.has(w)) return true;
  const c = [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'),
    w.replace(/([b-df-hj-np-tv-z])\1(ing|ed|er|est)$/, '$1'), w.replace(/er$/, ''), w.replace(/est$/, ''), w.replace(/ier$/, 'y'), w.replace(/ly$/, '')];
  return c.some((x) => x.length > 1 && x !== w && DICT.has(x));
}
const words = (s: string) => (s.toLowerCase().replace(/[’']/g, "'").match(/[a-z][a-z']*/g) ?? []).map((w) => w.replace(/'s$/, ''));
/** Words of `a` not matched in `b` (multiset difference, order ignored). */
function minus(a: string[], b: string[]): string[] { const left = [...b]; return a.filter((w) => { const k = left.indexOf(w); if (k >= 0) { left.splice(k, 1); return false; } return true; }); }
const NEG = (ws: string[]) => ws.some((w) => w === 'not' || w === 'no' || w === 'never' || w.endsWith("n't"));
const PRONOUNS = [['he', 'she', 'it', 'they', 'we', 'i', 'you'], ['his', 'her', 'its', 'their', 'our', 'my', 'your'], ['him', 'her', 'it', 'them', 'us', 'me', 'you']];
const AUX_START = /^(do|does|did|is|are|am|was|were|can|could|will|would|have|has|should|may)\b/i;
const bare = (t: string) => t.trim().replace(/^[\s"“”'*]+|[\s"“”'*]+$/g, '');

export type PairProblem = 'same' | 'meaning_swap' | 'joining_word_swap' | 'negation_swap' | 'pronoun_swap' | 'statement_question' | 'politeness_only' | 'some_any_question' | 'shorter_not_wrong';
/** Why the "wrong" sentence is probably acceptable English (so it must not be labelled wrong), or null when it has a form error.
 *  Form errors pass: a missing, extra or wrong small word, a wrong ending, a misspelling, a capital or full stop, word order, an over-regular past. */
export function pairProblem(right: string, wrong: string): PairProblem | null {
  if (bare(right) === bare(wrong)) return 'same';
  const r = words(right); const w = words(wrong);
  if (!r.length || !w.length) return null;
  const removed = minus(r, w); const added = minus(w, r);
  if (!removed.length && !added.length) return null; // capitals, punctuation or word order: a form point
  if (NEG(r) !== NEG(w)) return 'negation_swap';
  if (removed.some((x) => JOINERS.has(x)) && added.some((x) => JOINERS.has(x))) return 'joining_word_swap';
  if (removed.length === 1 && added.length === 1 && PRONOUNS.some((g) => g.includes(removed[0]) && g.includes(added[0]))) return 'pronoun_swap';
  if (/\?\s*["”]?$/.test(wrong.trim()) && AUX_START.test(bare(right)) && !AUX_START.test(bare(wrong)) && !/^(what|where|when|who|why|how|which)\b/i.test(bare(wrong))
    && added.every((x) => removed.some((y) => sameWord(x, y)))) return 'statement_question';
  if ((/\bplease\b|^(can|could|may) i\b/i.test(bare(right)) || /\?\s*["”]?$/.test(right.trim())) && /^(give me|i want|i need)\b/i.test(bare(wrong))) return 'politeness_only';
  if (/\?\s*["”]?$/.test(wrong.trim()) && removed.length === 1 && added.length === 1 && [removed[0], added[0]].sort().join() === 'any,some') return 'some_any_question';
  const content = (xs: string[]) => xs.filter((x) => !FUNCTION.has(x));
  const newWords = content(added).filter((x) => !content(removed).some((y) => sameWord(x, y)) && isWord(x));
  if (newWords.length && content(removed).some((y) => !content(added).some((x) => sameWord(x, y)))) return 'meaning_swap';
  if (!added.length && removed.length >= 3) return 'shorter_not_wrong';
  return null;
}

export interface FoundPair { right: string; wrong: string; wrongSpan: [number, number]; rightLabel: [number, number] }
const PAIR = /\b(Right|Correct)\s*:\s*\**["“]?(.+?)["”]?\**\s*[,;]?\s+(?:and\s+)?\b(?:Wrong|Incorrect|Not)\s*:\s*\**["“]?(.+?)["”]?\**(?=\s*(?:\(|\n|$)|(?<=[.!?])\s+(?=[A-Z(]))/g;
/** Right/wrong pairs written as "Right: X ... Wrong: Y" (quotes and bold allowed). */
export function findPairs(text: string): FoundPair[] {
  const out: FoundPair[] = [];
  for (const m of text.matchAll(PAIR)) {
    const start = m.index ?? 0; const full = m[0];
    const wStart = start + full.search(/\b(?:Wrong|Incorrect|Not)\s*:/);
    out.push({ right: m[2].trim(), wrong: m[3].trim(), wrongSpan: [wStart, start + full.length], rightLabel: [start, start + m[1].length + full.slice(m[1].length).indexOf(':') + 1] });
  }
  return out;
}
/** The guard: a pair whose wrong sentence is not wrong English loses that sentence (and a bracketed note right after it); "Right:" becomes "Example:". */
export function removeFalseWrongs(text: string): { text: string; removed: PairProblem[] } {
  const bad = findPairs(text).map((p) => ({ p, why: pairProblem(p.right, p.wrong) })).filter((x) => x.why);
  let out = text;
  for (const { p } of [...bad].reverse()) {
    let [s, e] = p.wrongSpan;
    const note = out.slice(e).match(/^\s*\([^)]*\)\.?/);
    if (note) e += note[0].length;
    out = `${out.slice(0, s).trimEnd()}${out.slice(e)}`;
    out = `${out.slice(0, p.rightLabel[0])}Example:${out.slice(p.rightLabel[1])}`;
  }
  return { text: out.replace(/[ \t]{2,}/g, ' '), removed: bad.map((x) => x.why!) };
}
/** One line for every prompt that asks for a right/wrong pair. */
export const PAIR_RULE = 'Any right/wrong pair: the wrong sentence must be incorrect English because of the form being taught (a missing or wrong small word, ending, spelling or word order). Never label a correct sentence with a different meaning as wrong. For a word-meaning or joining-word point (which word fits), give no pair: say which word fits and why.';
