// planner2e fix 1 (owner: high priority): a "Wrong:" example must really be wrong English. A pair whose wrong sentence only swaps meaning
// words ("A teacher works at a hospital", "I drink milk") or joining words ("small and it is clean") is good English: labelling it wrong
// teaches something false. This module finds right/wrong pairs in a reply and flags those, deterministically (no model call).
// A form error (a missing or extra small word, a wrong ending, a spelling slip, a word-order change, an over-regular past) passes.

import { ADULT_WORDS } from './kidsWordList';
import { detectLiveError } from './languageLearningState';
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
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // two letters swapped ("pne")
  }
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
const DICT = new Set(ADULT_WORDS.map((w) => w.toLowerCase()));
const DICT_LIST = [...DICT];
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

export type PairProblem = 'misspelling_shown' | 'same' | 'both_comparatives_ok' | 'meaning_swap' | 'joining_word_swap' | 'negation_swap' | 'pronoun_swap' | 'statement_question' | 'politeness_only' | 'some_any_question' | 'shorter_not_wrong';
/** Why the "wrong" sentence is probably acceptable English (so it must not be labelled wrong), or null when it has a form error.
 *  Form errors pass: a missing, extra or wrong small word, a wrong ending, a misspelling, a capital or full stop, word order, an over-regular past. */
export function pairProblem(right: string, wrong: string): PairProblem | null {
  if (bare(right) === bare(wrong)) return 'same';
  const r = words(right); const w = words(wrong);
  if (!r.length || !w.length) return null;
  const removed = minus(r, w); const added = minus(w, r);
  if (!removed.length && !added.length) return null; // capitals, punctuation or word order: a form point
  // planner2f (owner): never show a misspelling as an example, not even as the "wrong" one. An over-regular past ("swimmed") is grammar, not spelling.
  if (added.some((x) => removed.some((y) => misspellingOf(x, y)))) return 'misspelling_shown';
  if (bothComparativesOk(removed, added)) return 'both_comparatives_ok';
  if (NEG(r) !== NEG(w)) return 'negation_swap';
  if (removed.some((x) => JOINERS.has(x)) && added.some((x) => JOINERS.has(x))) return 'joining_word_swap';
  if (removed.length === 1 && added.length === 1 && PRONOUNS.some((g) => g.includes(removed[0]) && g.includes(added[0]))) return 'pronoun_swap';
  if (/\?\s*["”]?$/.test(right.trim()) && AUX_START.test(bare(right)) && !AUX_START.test(bare(wrong)) && !/^(what|where|when|who|why|how|which)\b/i.test(bare(wrong))
    && added.every((x) => removed.some((y) => sameWord(x, y)))) return 'statement_question';
  if ((/\bplease\b|^(can|could|may) i\b/i.test(bare(right)) || /\?\s*["”]?$/.test(right.trim())) && /^(give me|i want|i need)\b/i.test(bare(wrong))) return 'politeness_only';
  if (/\?\s*["”]?$/.test(wrong.trim()) && removed.length === 1 && added.length === 1 && [removed[0], added[0]].sort().join() === 'any,some') return 'some_any_question';
  const content = (xs: string[]) => xs.filter((x) => !FUNCTION.has(x));
  const newWords = content(added).filter((x) => !content(removed).some((y) => sameWord(x, y)) && isWord(x));
  if (newWords.length && content(removed).some((y) => !content(added).some((x) => sameWord(x, y)))) return 'meaning_swap';
  if (!added.length && removed.length >= 3) return 'shorter_not_wrong';
  return null;
}

/** PLN2h (Opus pair check): adjectives that take both "-er" and "more" ("redder" / "more red", "quieter" / "more quiet"): a swap between the two is not an error. */
const BOTH_COMPARATIVES = new Set('red clever quiet simple narrow gentle polite common pleasant friendly lively likely shallow cruel handsome stupid subtle'.split(' '));
const erOf = (a: string) => [a + 'er', a + 'r', a.replace(/y$/, 'ier'), a + a.slice(-1) + 'er'];
function bothComparativesOk(removed: string[], added: string[]): boolean {
  const swap = (er: string[], more: string[]) => er.length === 1 && more.length === 2 && more.includes('more')
    && [...BOTH_COMPARATIVES].some((a) => erOf(a).includes(er[0]) && more.includes(a));
  return swap(removed, added) || swap(added, removed);
}

/** planner2f: `x` is a misspelling of `y`: not itself a word on the list, close in spelling (two letters at most), and not an ending of y (-s, -ed, -ing,
 *  -er, -y ...), an irregular form or an over-regular past ("swimmed" is grammar, not spelling). Small words never count. */
export function misspellingOf(x: string, y: string): boolean {
  const a = x.toLowerCase(); const b = y.toLowerCase();
  if (a === b || a.length < 2 || b.length < 3 || FUNCTION.has(a) || FUNCTION.has(b) || DICT.has(a) || familyOf.has(a) || overRegular(a) !== undefined) return false;
  if (a.startsWith(b) && /^(s|es|d|ed|ing|r|er|est|y|ly|ies|ier|iest)$/.test(a.slice(b.length))) return false;
  if (b.startsWith(a) && /^(s|es|d|ed|ing|r|er|est|y|ly)$/.test(b.slice(a.length))) return false;
  return lev(a, b) <= (Math.min(a.length, b.length) <= 4 ? 1 : 2);
}
/** Kept for callers: a word that is a near miss of a known word (used only next to that word). */
export function nearMiss(w: string): boolean { const x = w.toLowerCase(); return !DICT.has(x) && DICT_LIST.some((d) => misspellingOf(x, d)); }
/** Uncountable or no-article nouns that may start a sentence bare ("Water is cold.", "Lunch is ready."). */
const BARE_OK = new Set('water milk rice bread juice tea coffee food music homework money weather lunch breakfast dinner school home work time life love english arabic maths math science art history football tennis sport sports breakfast today tomorrow yesterday tonight everyone everybody someone nobody nothing something everything mum dad mom grandma grandpa'.split(' '));
const START_VERBS = new Set('is was has had can will likes loves lives eats drinks runs jumps sleeps sits swims goes looks plays sings flies works makes wants needs'.split(' '));
export type ModelProblem = 'bare_noun_start' | 'article_omitted';
/** planner2f (owner): a model ("Right:" / "Example:") sentence must be correct English. Conservative, clear patterns only: a bare singular noun
 *  starting the sentence ("Pig is big."), or a missing a/an/the after a verb ("He is doctor."). */
export function modelProblem(sentence: string): ModelProblem | null {
  const t = sentence.trim().replace(/^["“*]+|["”*]+$/g, '');
  const toks = t.match(/[A-Za-z][A-Za-z']*/g) ?? [];
  const first = toks[0]?.toLowerCase() ?? ''; const second = toks[1]?.toLowerCase() ?? '';
  if (first && /^[A-Z]/.test(toks[0] ?? '') && START_VERBS.has(second) && DICT.has(first) && !FUNCTION.has(first) && !BARE_OK.has(first) && !/(s|ing)$/.test(first) && toks.length <= 8) return 'bare_noun_start';
  // A possessive 's ("my brother's bike") is not "is": the article check is skipped then.
  return !/[a-z]'s\s/i.test(t) && detectLiveError(t)?.code === 'article_omitted' ? 'article_omitted' : null;
}
/** "Pig is big." -> "The pig is big." (the only automatic repair; anything else is removed). */
export const fixBareNounStart = (s: string): string => s.replace(/^(\s*["“*]*)([A-Z])([a-z]+)/, (_m, q: string, a: string, b: string) => `${q}The ${a.toLowerCase()}${b}`);

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
export function removeFalseWrongs(text: string): { text: string; removed: (PairProblem | ModelProblem | 'model_fixed')[] } {
  // planner2f: first the "Right:" models (fix "Pig is big." -> "The pig is big."; remove a pair whose right model is not correct English).
  const notes: (ModelProblem | 'model_fixed')[] = [];
  let pre = text;
  for (const p of [...findPairs(text)].reverse()) {
    const why = modelProblem(p.right);
    if (!why) continue;
    const start = p.rightLabel[0]; let end = p.wrongSpan[1];
    const note = pre.slice(end).match(/^\s*\([^)]*\)\.?/); if (note) end += note[0].length;
    if (why === 'bare_noun_start') { const fixed = fixBareNounStart(p.right); pre = `${pre.slice(0, start)}${pre.slice(start, end).replace(p.right, fixed)}${pre.slice(end)}`; notes.push('model_fixed'); }
    else { pre = `${pre.slice(0, start).trimEnd()} ${pre.slice(end).trimStart()}`; notes.push(why); }
  }
  // Example lines outside pairs.
  pre = pre.replace(/\b(Example|For example|Look|Model)\s*:\s*([^.!?\n]+[.!?])/g, (m, lab: string, sent: string) => {
    const why = modelProblem(sent); if (!why) return m;
    if (why === 'bare_noun_start') { notes.push('model_fixed'); return `${lab}: ${fixBareNounStart(sent.trim())}`; }
    notes.push(why); return '';
  });
  const bad = findPairs(pre).map((p) => ({ p, why: pairProblem(p.right, p.wrong) })).filter((x) => x.why);
  let out = pre;
  for (const { p } of [...bad].reverse()) {
    let [s, e] = p.wrongSpan;
    const note = out.slice(e).match(/^\s*\([^)]*\)\.?/);
    if (note) e += note[0].length;
    out = `${out.slice(0, s).trimEnd()}${out.slice(e)}`;
    out = `${out.slice(0, p.rightLabel[0])}Example:${out.slice(p.rightLabel[1])}`;
  }
  return { text: out.replace(/[ \t]{2,}/g, ' '), removed: [...notes, ...bad.map((x) => x.why!)] };
}
/** One line for every prompt that asks for a right/wrong pair. */
export const PAIR_RULE = 'Every example you show (right sentences and models) must be correct English, with a, an or the where English needs one ("The pig is big", not "Pig is big"). Never write a misspelled word as an example, not even as a wrong one. Any right/wrong pair: the wrong sentence must be incorrect English because of the form being taught (a missing or wrong small word, ending or word order). Never label a correct sentence with a different meaning as wrong. For a word-meaning or joining-word point (which word fits), give no pair: say which word fits and why.';
