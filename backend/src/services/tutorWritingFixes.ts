// LIT_REVIEW_GAP_PLAN 3.6 and 3.7 (owner "go" 20 Nov 2026): spelling slips shown as a pattern (spellingPattern) and known Arabic-transfer
// word swaps named with the right English word (l1Lexical, English only: ENGLISH_ONLY_RULE stays). Pure, deterministic, codes and short
// evidence only; nothing here is stored.
import { isWord, misspellingOf } from './pairCheck';

export type SpellingSlip = { kind: 'doubling'; wrong: string; base: string; right: string } | { kind: 'letters'; wrong: string; right: string };
const VOWELS = /[aeiou]/g;
/** A spelling slip in the learner's text: a missed doubled consonant ("biger", "thiner", "stoped"), or a near miss of a lesson word ("mather"). */
export function spellingSlip(text: string, lessonWords: string[] = [], knownWords: string[] = []): SpellingSlip | null {
  const words = text.toLowerCase().replace(/[’]/g, "'").match(/[a-z]+/g) ?? [];
  // Words the lesson itself uses (title, objectives, grammar, examples) are real words even when the small dictionary lacks them
  // (ESL7 round 6: "object" in "subject + verb + object" was flagged as a slip of "subject").
  const known = new Set(knownWords.flatMap((x) => x.toLowerCase().match(/[a-z]+/g) ?? []));
  for (const w of words) {
    // One-syllable base ending in consonant-vowel-consonant (not w, x, y): the consonant doubles before -er, -est, -ed, -ing.
    const m = /^([a-z]*[^aeiou][aeiou])([b-df-hj-np-tv-z])(er|est|ed|ing)$/.exec(w);
    if (m && !['w', 'x', 'y'].includes(m[2])) {
      const base = m[1] + m[2];
      if ((base.match(VOWELS) ?? []).length === 1 && isWord(base) && !isWord(`${base}e`)) { // not a silent-e word (hoped, riding, later)
        const right = `${base}${m[2]}${m[3]}`;
        if (w !== right) return { kind: 'doubling', wrong: w, base, right };
      }
    }
    // A real word in any form ("lives", "went") is never a slip, even when it is close to a lesson word ("liked").
    const near = isWord(w) || known.has(w) ? undefined : lessonWords.map((x) => x.toLowerCase()).find((x) => /^[a-z]+$/.test(x) && x !== w && misspellingOf(w, x));
    if (near) return { kind: 'letters', wrong: w, right: near };
  }
  return null;
}
const DOUBLING_EXAMPLES = [['hot', 'ho-tt-er'], ['sad', 'sa-dd-er'], ['thin', 'thi-nn-er'], ['big', 'bi-gg-er'], ['stop', 'sto-pp-ed'], ['run', 'ru-nn-ing']] as const;
/** The prompt line: the pattern on ANOTHER word, never the misspelling and never the open item's answer. */
export function spellingPatternLine(slip: SpellingSlip, avoid: string[] = []): string {
  if (slip.kind === 'doubling') {
    const bad = new Set([slip.base, ...avoid.map((a) => a.toLowerCase())]);
    const ex = DOUBLING_EXAMPLES.find(([b, split]) => !bad.has(b) && !bad.has(split.replace(/-/g, '')))?.[1] ?? 'ho-tt-er';
    return `Their answer has a spelling slip: a short word with one vowel before its last consonant doubles that consonant before -er, -est, -ed or -ing. Show this on ANOTHER word, split so the pattern is visible ("${ex}"), never their misspelled word and never the answer to the open item; then ask them to write their word again.`;
  }
  return 'Their answer has a spelling slip in a word from this lesson. Do not write their misspelled word. Say which part of the word to check (for example "the letter after m"), then ask them to write it again. Show the full right spelling only after their second try.';
}

/** Known Arabic-transfer word swaps (the rule bank's usual errors for Arabic speakers), with an English-only explanation. */
export const L1_LEXICON: { re: RegExp; right: string; why: string }[] = [
  { re: /\b(?:my|his|your|our|their|brother's|uncle's|father's|friend's|cousin's)\s+woman\b/i, right: 'wife', why: 'In English, the woman someone is married to is their "wife"; "woman" means any adult female.' },
  { re: /\b(?:my|her|your|our|their|sister's|aunt's|mother's|friend's|cousin's)\s+man\b/i, right: 'husband', why: 'In English, the man someone is married to is their "husband"; "man" means any adult male.' },
  { re: /\b(?:open|opened|opens|close|closed|closes)\s+the\s+(?:light|lights|lamp|tv|television|radio|fan)\b/i, right: 'turn on / turn off', why: 'In English we "turn on" or "turn off" a light or a machine; we open and close doors and windows.' },
  { re: /\b(?:my|his|her|your)\s+small\s+(?:brother|sister)\b/i, right: 'younger', why: 'For age, English says "younger brother" or "younger sister"; "small" is about size.' },
  { re: /\b(?:learn|learns|learned|learnt)\s+(?:me|him|her|us|them)\b/i, right: 'teach', why: 'In English, the person who gives the lesson "teaches" someone; the person who gets it "learns".' },
];
export function lexicalTransfer(text: string): { evidence: string; right: string; why: string } | null {
  for (const e of L1_LEXICON) { const m = e.re.exec(text); if (m) return { evidence: m[0], right: e.right, why: e.why }; }
  return null;
}
export const lexicalL1Line = (t: { evidence: string; why: string }): string =>
  `They wrote "${t.evidence.replace(/["<>]/g, '')}", a word choice carried over from Arabic. ${t.why} Tell them this in English only, in one short line, then ask them to write the sentence again with the right word.`;
