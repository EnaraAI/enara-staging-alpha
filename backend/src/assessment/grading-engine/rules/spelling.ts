// Rules-first grading (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.1): spelling, capitals and colloquial Arabic, by code.
// Pure: the dictionary checker is passed in (text/dictionaries.ts loads the shipped Hunspell files once per process).
// What is never counted as a misspelling (false-positive guards):
//   - numbers and words with digits; very short words (English: 1-2 letters; Arabic: 1 letter);
//   - words that appear in the question or source text (the learner copies names and terms from there);
//   - English: words written with a capital (names: "Hurghada", "Ahmed") and all-capitals words (acronyms);
//   - Latin words inside an Arabic answer, Arabic words inside an English one;
//   - Arabic: colloquial words (they are a grammar matter: the dialect finding), and anything inside quotation marks;
//   - our own allow-list (backend/assets/dictionaries/enara/allow-<lang>.txt).
// A word is misspelled only when the dictionary does not know it in any form (the checker leans towards accepting).
import type { SpellChecker } from '../../text/dictionaries';

export type MisspellingKind = 'spelling' | 'hamza' | 'taa_marbuta' | 'alef_maqsura';
/** certain: the dictionary does not know the word and (Arabic) it has a known corrected form. Arabic words the dictionary does not know
 * at all are NOT certain (names, places, loanwords such as الأتوبيس): reported, never used for a decision. */
export interface Misspelling { word: string; kind: MisspellingKind; fix?: string; sentence: number; certain: boolean }
export type CapitalKind = 'sentence_start' | 'pronoun_i' | 'proper_noun';
export interface CapitalIssue { word: string; kind: CapitalKind; fix: string; sentence: number }
export interface SpellingReport {
  lang: 'en' | 'ar';
  words: number; // all words (letters only), checked or skipped
  sentences: number;
  misspelled: Misspelling[];
  capitals: CapitalIssue[];
  /** Arabic: words ending in ه whose ة form is also a word (محطه: "his landing place" or a misspelled محطة). Not counted; they only
   * stop code from deciding that an answer is free of errors. */
  doubtful: { word: string; fix: string; sentence: number }[];
  certainErrors: number; // certain misspellings + capital issues
  errorSentences: number; // sentences with at least one certain misspelling or capital issue
  per100: number; // certain misspellings and capital issues per 100 words
  clean: boolean; // nothing found at all (no misspelling of any kind, no capital issue, nothing doubtful)
  unknownNames: number; // English: capitalised words the dictionary does not know (names, or not: never counted as errors)
  endsWell: boolean; // the answer ends with . ! ? or ؟
}
export interface SpellingContext { stem?: string; source?: string }

const TASHKEEL = /[ً-ْٰـ]/g;
const AR_WORD = /[ء-غف-يٱ][ء-غف-ْٰٱـ]*/gu;
const EN_WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
const bare = (w: string) => w.normalize('NFC').replace(TASHKEEL, '');

/** Sentences as written, with where each starts (for the capital-at-sentence-start check). */
export function sentenceSpans(text: string): { text: string; start: number; afterStop: boolean }[] {
  const out: { text: string; start: number; afterStop: boolean }[] = [];
  const re = /[.!?؟]+(?=\s|$)|[;؛\n]+/g;
  let at = 0; let afterStop = true; let m: RegExpExecArray | null;
  const push = (end: number, stop: boolean) => {
    const raw = text.slice(at, end);
    const lead = raw.length - raw.trimStart().length;
    if (/[\p{L}\d]/u.test(raw)) out.push({ text: raw.trim(), start: at + lead, afterStop });
    afterStop = stop;
  };
  while ((m = re.exec(text))) {
    // "e.g." "i.e." "Mr." and decimals are not sentence ends.
    if (/^\./.test(m[0]) && /(?:\b(?:e\.g|i\.e|etc|mr|mrs|ms|dr|st|vs)|\d)$/i.test(text.slice(Math.max(0, m.index - 4), m.index))) continue;
    push(m.index, /[.!?؟]/.test(m[0]));
    at = m.index + m[0].length;
  }
  push(text.length, false);
  return out;
}

/** Text with everything inside quotation marks blanked out (same length, so positions hold). */
export function withoutQuotes(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|„[^“\n]*“/g, (q) => ' '.repeat(q.length));
}

const contextWords = (ctx: SpellingContext, lang: 'en' | 'ar'): Set<string> => {
  const s = `${ctx.stem ?? ''}\n${ctx.source ?? ''}`;
  return new Set((s.match(lang === 'ar' ? AR_WORD : EN_WORD) ?? []).map((w) => (lang === 'ar' ? bare(w) : w.toLowerCase())));
};

// ------------------------------------------------------------------------------------------------------------------------ English
const PRONOUN_I = /^i(?:['’](?:m|ve|ll|d))?$/;
// en_US is an American list; learners here are taught British spelling. A word whose American form the dictionary knows is right.
const BRITISH: [RegExp, string][] = [[/our(s|ed|ing|ite|ites|ful|able)?$/, 'or$1'], [/(?<=[^aeiou])re(s|d)?$/, 'er$1'], [/is(e|es|ed|ing|ation|ations)$/, 'iz$1'], [/ys(e|es|ed|ing)$/, 'yz$1'],
  [/ll(ed|ing|er|ers)$/, 'l$1'], [/ogue(s)?$/, 'og$1'], [/ence(s)?$/, 'ense$1'], [/ae/, 'e'], [/oe/, 'e'], [/^practis/, 'practic'], [/^cos(y|ier|iest)$/, 'coz$1'], [/^grey/, 'gray'], [/^tyre/, 'tire'], [/^programme/, 'program'], [/^jewellery$/, 'jewelry']];
const americanForms = (w: string) => BRITISH.filter(([re]) => re.test(w)).map(([re, to]) => w.replace(re, to));
/** A hyphenated word or a British spelling of a word the dictionary knows. */
const knownOtherwise = (w: string, checker: SpellChecker) =>
  (w.includes('-') && w.split('-').every((p) => !p || checker.check(p) !== 'bad')) || americanForms(w.toLowerCase()).some((a) => checker.check(a) === 'ok');
/** English spelling and capitals. */
export function englishSpelling(text: string, checker: SpellChecker | null, ctx: SpellingContext = {}): SpellingReport {
  const known = contextWords(ctx, 'en');
  const spans = sentenceSpans(withoutQuotes(text));
  const misspelled: Misspelling[] = []; const capitals: CapitalIssue[] = [];
  let words = 0; let unknownNames = 0;
  spans.forEach((sp, si) => {
    const toks = [...sp.text.matchAll(EN_WORD)];
    toks.forEach((m, ti) => {
      const w = m[0];
      words++;
      const first = ti === 0 && m.index === sp.text.search(/[\p{L}\d]/u);
      if (PRONOUN_I.test(w)) { capitals.push({ word: w, kind: 'pronoun_i', fix: `I${w.slice(1)}`, sentence: si }); return; }
      if (first && sp.afterStop && /^[a-z]/.test(w)) capitals.push({ word: w, kind: 'sentence_start', fix: w[0].toUpperCase() + w.slice(1), sentence: si });
      if (!checker || w.length < 3 || known.has(w.toLowerCase())) return;
      if (/(?:^|-)[A-Z]/.test(w)) { if (w.length >= 3 && !first && checker.check(w.replace(/’/g, "'")) === 'bad' && !knownOtherwise(w, checker)) unknownNames++; return; }
      // A word that is only capitalised in the stem (a name) is still that name here.
      const st = checker.check(w.replace(/’/g, "'"));
      // A name written in lower case (cairo → Cairo); a 3-letter one (rom: ROM? room?) is more likely a misspelling.
      if (st === 'case' && w.length >= 4) { if (!first) capitals.push({ word: w, kind: 'proper_noun', fix: w[0].toUpperCase() + w.slice(1), sentence: si }); return; }
      if (st !== 'ok' && !knownOtherwise(w, checker)) misspelled.push({ word: w, kind: 'spelling', sentence: si, certain: true });
    });
  });
  return { ...report('en', words, spans.length, misspelled, capitals, [], text), unknownNames };
}

// ------------------------------------------------------------------------------------------------------------------------- Arabic
// Spelling variants learners mix up. A misspelled word whose variant the dictionary knows is named by its kind.
const HAMZA_SWAPS: [string, string[]][] = [['ا', ['أ', 'إ', 'آ']], ['أ', ['ا', 'إ', 'آ', 'ؤ', 'ئ', 'ء']], ['إ', ['ا', 'أ']], ['آ', ['ا', 'أ']], ['و', ['ؤ']], ['ؤ', ['ئ', 'ء', 'و']], ['ي', ['ئ']], ['ئ', ['ء', 'ؤ', 'ي']], ['ء', ['ئ', 'ؤ', 'أ']]];
/** Single-letter variants of an Arabic word, by kind (hamza seats, ة/ه at the end, ى/ي at the end, a dropped final hamza). */
export function arabicVariants(w: string): { form: string; kind: Exclude<MisspellingKind, 'spelling'> }[] {
  const out: { form: string; kind: Exclude<MisspellingKind, 'spelling'> }[] = [];
  const last = w.length - 1;
  // Taa marbuta and alef maqsura: only the last letter. (ة written for ه is rare and ambiguous: not tried.)
  if (w[last] === 'ه') out.push({ form: `${w.slice(0, last)}ة`, kind: 'taa_marbuta' });
  if (w[last] === 'ي') out.push({ form: `${w.slice(0, last)}ى`, kind: 'alef_maqsura' });
  if (w[last] === 'ى') out.push({ form: `${w.slice(0, last)}ي`, kind: 'alef_maqsura' }, { form: `${w.slice(0, last)}ا`, kind: 'alef_maqsura' });
  if (w[last] === 'ا') out.push({ form: `${w.slice(0, last)}ى`, kind: 'alef_maqsura' });
  // The alef of the article (ال، وال، بال، فبال …) never takes a hamza.
  const art = /^([وف]?[بكل]?)ال(?=..)/.exec(w);
  const skip = art ? art[1].length : -1;
  for (let i = 0; i < w.length; i++) {
    if (i === skip) continue;
    for (const [from, tos] of HAMZA_SWAPS) if (w[i] === from) for (const to of tos) out.push({ form: w.slice(0, i) + to + w.slice(i + 1), kind: 'hamza' });
  }
  if (/[اوي]$/.test(w)) out.push({ form: `${w}ء`, kind: 'hamza' }); // شي → شيء، سما → سماء
  return out;
}
const HAMZA_LETTERS = /[أإآؤئء]/;
// The usual forms of common words whose hamza is often left out (two dictionary forms would fit; this is the one meant).
const COMMON_FIX: Record<string, string> = { الى: 'إلى', الي: 'إلى', ان: 'أن', انا: 'أنا', اذا: 'إذا', او: 'أو', لان: 'لأن', الا: 'إلا', انه: 'أنه', انها: 'أنها', لانه: 'لأنه', لانها: 'لأنها', اول: 'أول', اي: 'أي', ايضا: 'أيضا', امام: 'أمام', اخرى: 'أخرى', اكثر: 'أكثر' };

/** Arabic spelling (colloquial words are left to the dialect finding). */
export function arabicSpelling(text: string, checker: SpellChecker | null, ctx: SpellingContext = {}): SpellingReport {
  const known = contextWords(ctx, 'ar');
  const spans = sentenceSpans(withoutQuotes(text));
  const misspelled: Misspelling[] = []; const doubtful: SpellingReport['doubtful'] = [];
  let words = 0;
  spans.forEach((sp, si) => {
    for (const m of sp.text.matchAll(AR_WORD)) {
      const w = bare(m[0]);
      if (!w) continue;
      words++;
      if (!checker || w.length < 2 || known.has(w) || colloquialWord(w, checker)) continue;
      if (checker.check(w) !== 'bad') {
        // محطه (a word: "his landing place") may be a misspelled محطة. With the article (السنه) it cannot be a pronoun: certain.
        if (w.endsWith('ه') && w.length >= 4 && checker.check(`${w.slice(0, -1)}ة`) === 'ok') {
          if (/^([وف]?[بكل]?)ال(?=..)/.test(w) && !/لله$/.test(w)) misspelled.push({ word: m[0], kind: 'taa_marbuta', fix: `${w.slice(0, -1)}ة`, sentence: si, certain: true });
          // Without the article: doubtful only when the word without its ه is not a word (عليه، لأنه، شكله: a pronoun, fine).
          else if (checker.check(w.slice(0, -1)) === 'bad') doubtful.push({ word: m[0], fix: `${w.slice(0, -1)}ة`, sentence: si });
        }
        continue;
      }
      const common = COMMON_FIX[w];
      const v = common ? { form: common, kind: 'hamza' as const } : arabicVariants(w).find((x) => checker.check(x.form) === 'ok');
      // A word that already has a hamza and is "fixed" by moving it to another seat (الأهرامات → الإهرامات) is more likely a gap in
      // the dictionary than a learner's error: reported, not certain.
      const seatOnly = v?.kind === 'hamza' && HAMZA_LETTERS.test(w) && [...w].filter((c, i) => c !== v.form[i]).every((c) => HAMZA_LETTERS.test(c));
      misspelled.push({ word: m[0], kind: v?.kind ?? 'spelling', ...(v ? { fix: v.form } : {}), sentence: si, certain: Boolean(v) && !seatOnly });
    }
  });
  return report('ar', words, spans.length, misspelled, [], doubtful, text);
}

function report(lang: 'en' | 'ar', words: number, sentences: number, misspelled: Misspelling[], capitals: CapitalIssue[], doubtful: SpellingReport['doubtful'], text: string): SpellingReport {
  const certain = misspelled.filter((m) => m.certain);
  const errorSentences = new Set([...certain, ...capitals].map((x) => x.sentence)).size;
  const certainErrors = certain.length + capitals.length;
  return {
    lang, words, sentences, misspelled, capitals, doubtful, certainErrors, errorSentences,
    per100: words ? Math.round((certainErrors / words) * 1000) / 10 : 0, clean: !misspelled.length && !capitals.length && !doubtful.length,
    unknownNames: 0, endsWell: /[.!?؟]["'”’»)]*\s*$/.test(text),
  };
}

/** Spelling report for an answer in the item's language (null for spoken answers: a transcript is not the learner's writing). */
export function spellingReport(language: string, text: string, checker: SpellChecker | null, ctx: SpellingContext = {}, spoken = false): SpellingReport | null {
  if (spoken || !checker) return null;
  return language.startsWith('ar') ? arabicSpelling(text, checker, ctx) : englishSpelling(text, checker, ctx);
}

// --------------------------------------------------------------------------------------------------------------------- mechanics
// The language rubric's mechanics criterion (rubrics/templates.ts). Short answers (0-1): 0 = errors make it hard to read, 1 = easy to
// read even with some errors. Essays (0-2): 0 = errors in most sentences and some words hard to recognise, 1 = errors in several
// sentences, 2 = errors in only a few. Code decides ONLY far from the level boundaries; thresholds were set on half of the language
// bench and checked on the other half (npm run bench:rules). Punctuation inside sentences is not checked by code: the model judges it
// whenever code does not decide.
export interface MechanicsThresholds {
  shortMaxPer100: number; // short answer → 1 when (all misspellings + capital issues + unknown names) per 100 words is at most this
  essayMinWords2: number; // essay → 2 needs at least this many words …
  essayMaxErrors2: number; // … at most this many certain errors, all in one sentence, nothing uncertain, and (English) a final stop
  essayRatio1: number; // essay → 1 when at least this share of sentences has a certain error …
  essayMinErrorSentences1: number; // … in at least this many sentences, every error certain (recognisable words: not level 0)
  essayMaxEnglishSpelling1: number; // … and (English) at most this many misspelled words (capital errors keep words recognisable)
}
export const MECHANICS: MechanicsThresholds = { shortMaxPer100: 20, essayMinWords2: 30, essayMaxErrors2: 1, essayRatio1: 0.5, essayMinErrorSentences1: 2, essayMaxEnglishSpelling1: 2 };

export interface MechanicsDecision { points: number; reason: string; evidence: string }
const listWords = (r: SpellingReport, n = 8) => {
  const all = [...r.misspelled.map((m) => (m.fix ? `${m.word} → ${m.fix}` : m.word)), ...r.capitals.map((c) => `${c.word} → ${c.fix}`)];
  return all.length ? `${all.slice(0, n).join(', ')}${all.length > n ? ', …' : ''}` : 'none';
};
/** Mechanics by code, or null (the model decides). */
export function mechanicsDecision(type: 'short_answer' | 'essay' | string, r: SpellingReport, t: MechanicsThresholds = MECHANICS): MechanicsDecision | null {
  if (!r.words) return null;
  const uncertain = r.misspelled.some((m) => !m.certain) || r.doubtful.length > 0;
  const errs = `${r.certainErrors} spelling/capital error(s) in ${r.errorSentences} of ${r.sentences} sentence(s)`;
  if (type === 'short_answer') {
    const rate = ((r.misspelled.length + r.capitals.length + r.unknownNames) / r.words) * 100;
    if (rate <= t.shortMaxPer100) return { points: 1, reason: `easy to read: ${errs} (${listWords(r)})`, evidence: listWords(r) };
    return null;
  }
  if (type !== 'essay' || uncertain) return null;
  if (r.words >= t.essayMinWords2 && r.certainErrors <= t.essayMaxErrors2 && r.errorSentences <= 1 && (r.lang === 'ar' || r.endsWell)) {
    return { points: 2, reason: `errors in at most one sentence: ${errs} (${listWords(r)})`, evidence: listWords(r) };
  }
  const spelling = r.misspelled.length;
  if (r.sentences >= 3 && r.errorSentences >= t.essayMinErrorSentences1 && r.errorSentences / r.sentences >= t.essayRatio1 && (r.lang === 'ar' || spelling <= t.essayMaxEnglishSpelling1)) {
    return { points: 1, reason: `errors in several sentences, words still recognisable: ${errs} (${listWords(r)})`, evidence: listWords(r) };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------- colloquial Arabic
// High-precision Egyptian colloquial words: words that are (almost) never Modern Standard Arabic in a learner's answer. Compared after
// removing tashkeel, with ة/ه and ى/ي folded; a leading و (and) is allowed. Ambiguous words (بس، زي، حلو، قوي، دول، هما، خلاص، بقى،
// حاجة، سوا، بفضل) are left out on purpose.
const fold = (w: string) => bare(w).replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const COLLOQUIAL = new Set(`عشان علشان عشانك مش مفيش مافيش ده دي دلوقتي دلوقت بتاع بتاعه بتاعة بتاعتي بتاعي بتاعنا بتاعك بتاعهم بتوع
  ازاي إزاي فين ليه كده كدا عايز عايزة عايزين عاوز عاوزة عاوزين اللي ايه إيه امبارح إمبارح النهارده النهاردة كمان اوي أوي كتير كتيرة
  شوية شويه تاني تانية تانيين اتنين إتنين تلاتة تلات تلاته احنا إحنا انتو إنتو انتوا لسه لسة بردو برضه برضو ابويا أبويا اخويا أخويا
  معايا معاها معاه معاهم كويس كويسة كويسين بعدين اوضة أوضة مايه مية المية الميه شايف شايفة شايفين باين باينة التاني التانية كهربا بحب بحبه بحبها بحبهم بيها`.split(/\s+/).filter(Boolean).map(fold));
const COLLOQUIAL_PREFIX = /^[بهح](?=[يتنا])/;

/** Is this one word colloquial? A listed word, or a verb with the colloquial بـ / هـ / حـ prefix (بيلعب، هنروح) that the dictionary does
 * not know while it knows the verb without the prefix (يلعب، نروح). "بيت" and "بنات" are words: never colloquial. */
export function colloquialWord(word: string, checker: SpellChecker | null): boolean {
  const w = fold(word);
  if (COLLOQUIAL.has(w) || (w.startsWith('و') && w.length >= 3 && COLLOQUIAL.has(w.slice(1)))) return true;
  if (!checker) return false;
  const v = w.startsWith('و') && w.length > 5 ? bare(word).slice(1) : bare(word);
  if (!COLLOQUIAL_PREFIX.test(v) || v.length < 4) return false;
  return checker.check(v) === 'bad' && checker.check(v.slice(1)) === 'ok';
}

export interface DialectReport { words: number; colloquial: { word: string; sentence: number }[]; sentences: number; colloquialSentences: number; share: number }
/** Colloquial words in an Arabic answer (outside quotation marks, not copied from the question or source). */
export function dialectReport(text: string, checker: SpellChecker | null, ctx: SpellingContext = {}): DialectReport {
  const known = new Set([...contextWords(ctx, 'ar')].map(fold));
  const spans = sentenceSpans(withoutQuotes(text));
  const colloquial: { word: string; sentence: number }[] = [];
  let words = 0;
  spans.forEach((sp, si) => {
    for (const m of sp.text.matchAll(AR_WORD)) {
      const w = bare(m[0]);
      if (!w) continue;
      words++;
      if (!known.has(fold(w)) && colloquialWord(w, checker)) colloquial.push({ word: m[0], sentence: si });
    }
  });
  const colloquialSentences = new Set(colloquial.map((c) => c.sentence)).size;
  return { words, colloquial, sentences: spans.length, colloquialSentences, share: words ? colloquial.length / words : 0 };
}
