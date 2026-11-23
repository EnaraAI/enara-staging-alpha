// Rules-first grading, layer 1 (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.1): code checks that run before the model. Pure, no I/O.
// runRules gives
//   - findings: what code saw, with the learner's exact words as evidence (passed to the model as facts it must not contradict);
//   - decided: the criteria code scores, ONLY where the rule is certain. Everything else goes to the model.
// Rules in this PR:
//   - blank / punctuation only, wrong script, copied question → every criterion 0, no model call;
//   - checklist points (science, humanities, listening): point_N = 1 when its key words all appear, in order, close together inside
//     ONE sentence, with no negation, "or", opposite or extra number/day that could change the meaning. A miss is never 0 by code
//     (paraphrases exist): it goes to the model;
//   - science units: the item's expected number stated with a unit that converts (1), or stated bare with no unit anywhere (0);
//   - length and structure (sentence count against the task, a very short essay): findings only;
//   - spelling (rules/spelling.ts, Hunspell word lists in backend/assets/dictionaries): language items get spelling and capital
//     findings, and mechanics is DECIDED only far from the level boundaries (thresholds checked on the bench); other written answers
//     get the findings only. Spoken answers are never spelling-checked (a transcript is not the learner's writing);
//   - colloquial Arabic (Egyptian, a high-precision word list): a finding for grammar_accuracy, never a decision (the bench has no
//     answer that would let us check a decision; the model applies the owner rule "mostly colloquial = lowest grammar level").
// Error codes from code findings (spelling, capitalisation, hamza_spelling) are added to the grade's error codes.
import { splitMathAnswer, type OpenItem } from '../graders/domains';
import { convert, normalizeNumberText, unitName } from '../graders/closed/numeric';
import { westernDigits } from '../../text/ar';
import { spellChecker, type SpellChecker } from '../../text/dictionaries';
import { dialectReport, mechanicsDecision, spellingReport, type SpellingReport, type DialectReport } from './spelling';
import { ARABIC, LATIN, fold, isFact, isNegation, isOr, isStop, letterWords, oppositesOf, sameWord, sentences, tokens, type Token } from './text';

export type RuleId = 'blank' | 'wrong_script' | 'copied_stem' | 'point_phrase' | 'units_stated' | 'units_missing' | 'sentence_count' | 'too_short'
  | 'spelling' | 'capitalisation' | 'mechanics_spelling' | 'colloquial';
export interface Finding { criterion?: string; value?: number | string; evidence: string; ruleId: RuleId }
export interface Decision { points: number; ruleId: RuleId; reason: string; evidence?: string }
/** errorCodes: codes code found with certainty (language items only), added to the grade's error codes. */
export interface RulesResult { findings: Finding[]; decided: Record<string, Decision>; allDecided: boolean; errorCodes?: string[] }
/** Where the rules get a spelling dictionary (tests pass their own; default: the shipped Hunspell files, loaded once). */
export interface RulesOptions { spell?: (language: string) => SpellChecker | null }
export interface RuleCriterion { id: string; maxPoints: number }

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The learner's text the rules read (maths: the steps and the final answer). */
export function answerTextOf(item: Pick<OpenItem, 'domain'>, answer: unknown): string {
  if (item.domain === 'math') { const m = splitMathAnswer(answer); return `${m.steps}\n${m.final}`.trim(); }
  return typeof answer === 'string' ? answer : answer === null || answer === undefined ? '' : String(answer);
}

// ---------------------------------------------------------------------------------------------------------------- generic rules
/** A rule that makes the whole answer worth 0 (blank, wrong script, copied question), or null. */
export function wholeAnswerZero(item: Pick<OpenItem, 'stem' | 'language' | 'domain'>, text: string): { ruleId: RuleId; reason: string; evidence: string } | null {
  if (!/[\p{L}\p{N}]/u.test(text)) return { ruleId: 'blank', reason: 'no answer written', evidence: text.trim() };
  // Wrong script: three or more words and not one letter in the item's script. Numbers-only and a lone term (H2O, CO2) are not this.
  const ar = item.language.startsWith('ar');
  if (ar && !ARABIC.test(text) && letterWords(text, LATIN) >= 3) return { ruleId: 'wrong_script', reason: 'answer not written in Arabic', evidence: clip(text.trim()) };
  if (!ar && !LATIN.test(text) && letterWords(text, ARABIC) >= 3) return { ruleId: 'wrong_script', reason: 'answer not written in English', evidence: clip(text.trim()) };
  if (copiedStem(item, text)) return { ruleId: 'copied_stem', reason: 'answer repeats the question', evidence: clip(text.trim()) };
  return null;
}

// Yes/no and choice questions are answered by repeating their words ("Is salt water a mixture?" "Salt water is a mixture"): never copies.
const CHOICE = /^\s*(is|are|was|were|do|does|did|can|could|will|would|has|have|should|هل|أ)\b|\bor\b|\bwhich\b|\bأو\b|\bأي\b|\bأم\b/i;
/** The answer is the question again: every word of it is in the stem and it has at least 90% of the stem's words. */
export function copiedStem(item: Pick<OpenItem, 'stem' | 'domain'>, text: string): boolean {
  const range = sentenceRange(item.stem);
  if (CHOICE.test(range ? item.stem.replace(range.words, ' ') : item.stem)) return false;
  // Language items: compared as written (a learner correcting ة/ه, hamza or a verb form is not copying), elsewhere folded.
  const words = (s: string) => (item.domain === 'language'
    ? (s.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}]+|\d+/gu) ?? [])
    : tokens(s).filter((t) => !isStop(t)).map((t) => t.keys[0]));
  const a = new Set(words(text)); const q = new Set(words(item.stem));
  if (a.size < 3 || q.size < 3) return false;
  for (const w of a) if (!q.has(w)) return false;
  return a.size >= 0.9 * q.size;
}

// -------------------------------------------------------------------------------------------------------------- checklist points
interface PointKey { words: Token[][] /* each key word with its alternatives */; neg: boolean; or: boolean; facts: Set<string> }
const META_LEAD = new Set(['uses', 'use', 'gives', 'give', 'states', 'state', 'names', 'name', 'mentions', 'mention', 'explains', 'explain', 'describes', 'describe', 'identifies', 'identify', 'says', 'say', 'shows', 'show', 'lists', 'list', 'يذكر', 'اذكر', 'يستخدم', 'يستعمل', 'استخدام', 'يحدد', 'يوضح', 'وضح', 'يفسر', 'فسر', 'يشرح', 'اشرح', 'يعطي', 'يبين', 'يقول', 'يسمي'].map(fold));
const META_ANY = /\be\.?g\.|for example|\bexamples?\b|\bcorrect(ly)?\b|\breasons?\b|مثالا?|أمثلة|صحيح|سبب/i;

/** The key words of a point, or null when the point is a description of what to say (Uses ..., an example of each ...). */
export function pointKey(point: string): PointKey | null {
  const outside = point.replace(/\([^()]*\)/g, ' ');
  if (META_ANY.test(outside)) return null;
  const words: Token[][] = [];
  let neg = false; let or = false;
  const take = (s: string) => {
    for (const t of tokens(s)) {
      if (isNegation(t)) { neg = true; continue; }
      if (isOr(t)) { or = true; continue; }
      if (!isStop(t)) words.push([t]);
    }
  };
  let at = 0;
  for (const m of point.matchAll(/\(([^()]*)\)/g)) {
    take(point.slice(at, m.index));
    // A one-word bracket names the word before it another way ("rotates (spins)"): either counts. Longer brackets are left out.
    const inner = tokens(m[1]).filter((t) => !isStop(t));
    if (inner.length === 1 && words.length) words[words.length - 1].push(inner[0]);
    at = (m.index ?? 0) + m[0].length;
  }
  take(point.slice(at));
  if (!words.length || META_LEAD.has(words[0][0].norm)) return null;
  if (words.length < 2) return null;
  return { words, neg, or, facts: new Set(words.flat().filter(isFact).flatMap((t) => t.keys)) };
}

/** Where a point's key words appear in order in one sentence (the shortest stretch), or null. */
function findWindow(pk: PointKey, toks: Token[]): [number, number] | null {
  const hits = (i: number, k: number) => pk.words[k].some((w) => sameWord(w, toks[i]));
  let best: [number, number] | null = null;
  for (let i = 0; i < toks.length; i++) {
    if (!hits(i, 0)) continue;
    let j = i; let ok = true;
    for (let k = 1; k < pk.words.length; k++) {
      j++;
      while (j < toks.length && !hits(j, k)) j++;
      if (j >= toks.length) { ok = false; break; }
    }
    if (!ok) break;
    if (!best || j - i < best[1] - best[0]) best = [i, j];
  }
  // Close together: at most about one extra word per key word (keyword stuffing in a long sentence does not count).
  return best && best[1] - best[0] + 1 <= 2 * pk.words.length + 3 ? best : null;
}

/** Point found with certainty in one sentence: the sentence (exact words), else null. */
export function pointInAnswer(point: string, text: string, domain: OpenItem['domain']): string | null {
  const pk = pointKey(point);
  if (!pk) return null;
  const own = new Set(pk.words.flat().flatMap((t) => t.keys));
  for (const sentence of sentences(text)) {
    const toks = tokens(sentence);
    const w = findWindow(pk, toks);
    if (!w) continue;
    const win = toks.slice(w[0], w[1] + 1);
    // Meaning changers: a negation (unless the point has one too, right there), "or", the opposite of a key word next to it, and
    // (source and listening questions: the whole sentence; science: next to it) a number, day or month the point does not have.
    if (pk.neg ? !toks.slice(Math.max(0, w[0] - 3), w[1] + 1).some(isNegation) : toks.some(isNegation)) continue;
    if (!pk.or && toks.some(isOr)) continue;
    const opposite = new Set(pk.words.flat().flatMap(oppositesOf).filter((k) => !own.has(k)));
    if (win.some((t) => t.keys.some((k) => opposite.has(k)))) continue;
    const factScope = domain === 'science' ? win : toks;
    if (factScope.some((t) => isFact(t) && !t.keys.some((k) => pk.facts.has(k)))) continue;
    return sentence;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ science units
/** mathjs unit syntax for a learner's or the key's unit: km/h, g/cm^3, N/m^2, كم/ساعة → km/h. */
export function unitSyntax(u: string): string {
  return u.replace(/²/g, '2').replace(/³/g, '3').split('/').map((p) => unitName(p.trim()).replace(/^([A-Za-z]+)([23])$/, '$1^$2')).join('/');
}
const knownUnit = (u: string) => { try { return convert(1, unitSyntax(u), unitSyntax(u)) !== null && /[A-Za-z]/.test(unitSyntax(u)); } catch { return false; } };

/** The numbers with units the item expects: its final answer, else a point that ends "= <number> <unit>". */
export function expectedQuantities(item: Pick<OpenItem, 'final' | 'points'>): { value: number; unit: string }[] {
  if (item.final?.unit && Number.isFinite(Number(item.final.value))) return [{ value: Number(item.final.value), unit: item.final.unit }];
  const out: { value: number; unit: string }[] = [];
  for (const p of item.points ?? []) {
    const m = /=\s*(-?\d+(?:\.\d+)?)\s*([^\s\d()=][^\s()=]*)\s*(?:\([^()]*\))?\s*$/.exec(normalizeNumberText(westernDigits(p)));
    if (m && knownUnit(m[2])) out.push({ value: Number(m[1]), unit: m[2] });
  }
  return out;
}

const NUM_UNIT = /(?<![\d.])(-?\d+(?:\.\d+)?)(?![\d.]*\d)(\s*)([^\s\d.,;:!?،؛()=+\-*×÷−/]+[23]?(?:\/[^\s\d.,;:!?،؛()=+\-*×÷−/]+[23]?)?)?/g;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const SPELLED_RATE = /\bper\b|لكل|في الساعة|في الثانية|كل ساعة|every hour|each hour|an hour|a second/i;

/** Science units, only when certain: 1 = an expected number with a unit that converts; 0 = expected numbers stated bare, no unit anywhere. */
export function unitsDecision(item: Pick<OpenItem, 'final' | 'points' | 'language'>, text: string): { points: 0 | 1; evidence: string; reason: string } | null {
  const want = expectedQuantities(item);
  if (!want.length) return null;
  const t = normalizeNumberText(westernDigits(text), item.language);
  let good: string | null = null; let bare: string | null = null; let other = false;
  for (const m of t.matchAll(NUM_UNIT)) {
    const v = Number(m[1]);
    const q = want.find((w) => close(v, w.value));
    if (!q) continue;
    const u = m[3]?.trim();
    if (u && m[2].length <= 1) {
      let c: number | null = null;
      try { c = convert(v, unitSyntax(u), unitSyntax(q.unit)); } catch { c = null; }
      if (c !== null && close(c, q.value)) good ??= m[0].trim(); else other = true;
    } else if (!u && /^\s*([.,;:!?،؛)\n]|$)/.test(t.slice((m.index ?? 0) + m[0].length))) bare ??= m[0].trim();
    else other = true;
  }
  if (good && !other) return { points: 1, evidence: good, reason: `states ${good}` };
  if (good || other || !bare || SPELLED_RATE.test(t)) return null;
  // A bare number is 0 only when no word anywhere in the answer is a unit of the expected kind (a unit written apart from it).
  const anyUnit = (t.match(/[^\s\d.,;:!?،؛()=+\-*×÷−]+/g) ?? []).some((w) => want.some((q) => { try { return convert(1, unitSyntax(w), unitSyntax(q.unit)) !== null; } catch { return false; } }));
  return anyUnit ? null : { points: 0, evidence: bare, reason: `${bare} has no unit` };
}

// ---------------------------------------------------------------------------------------------------------- length and structure
const NUM_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
const AR_COUNT: [RegExp, number, number][] = [[/جملة أو جملتين/, 1, 2], [/جملتين أو ثلاث/, 2, 3], [/جملة واحدة/, 1, 1], [/جملتين/, 2, 2], [/ثلاث جمل/, 3, 3], [/أربع جمل/, 4, 4], [/خمس جمل/, 5, 5]];
/** The number of sentences the task asks for, with the stem's own words, or null. */
export function sentenceRange(stem: string): { lo: number; hi: number; words: string } | null {
  const s = westernDigits(stem);
  const n = (x: string) => (/^\d+$/.test(x) ? Number(x) : NUM_WORD[x.toLowerCase()]);
  const range = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|–|to|or)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+sentences\b/i.exec(s);
  if (range) return { lo: n(range[1]), hi: n(range[2]), words: range[0] };
  const one = /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i.exec(s);
  if (one) return { lo: n(one[1]), hi: n(one[1]), words: one[0] };
  const ar = /(\d+)\s*(?:-|–|إلى|الى)\s*(\d+)\s*جمل/.exec(s);
  if (ar) return { lo: Number(ar[1]), hi: Number(ar[2]), words: ar[0] };
  for (const [re, lo, hi] of AR_COUNT) { const m = re.exec(s); if (m) return { lo, hi, words: m[0] }; }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------------- entry
/** Runs every rule on one answer. `criteria` is the item's rubric (id and max points); `lang` the item's language. */
export function runRules(item: OpenItem, answer: unknown, criteria: RuleCriterion[], lang: string = item.language, opts: RulesOptions = {}): RulesResult {
  const text = answerTextOf(item, answer);
  const findings: Finding[] = [];
  const decided: Record<string, Decision> = {};
  const errorCodes = new Set<string>();
  const done = (): RulesResult => ({ findings, decided, allDecided: criteria.length > 0 && criteria.every((c) => decided[c.id] !== undefined), ...(errorCodes.size ? { errorCodes: [...errorCodes] } : {}) });

  const zero = wholeAnswerZero({ ...item, language: lang }, text);
  if (zero) {
    for (const c of criteria) decided[c.id] = { points: 0, ruleId: zero.ruleId, reason: zero.reason };
    findings.push({ ruleId: zero.ruleId, value: 0, evidence: zero.evidence });
    return done();
  }
  const has = (id: string) => criteria.find((c) => c.id === id);

  (item.points ?? []).forEach((p, i) => {
    const id = `point_${i + 1}`;
    if (has(id)?.maxPoints !== 1) return;
    const sentence = pointInAnswer(p, text, item.domain);
    if (!sentence) return;
    decided[id] = { points: 1, ruleId: 'point_phrase', reason: `point found: "${clip(sentence, 80)}"` };
    findings.push({ criterion: id, value: 1, evidence: sentence, ruleId: 'point_phrase' });
  });

  if (item.domain === 'science' && has('units')) {
    const u = unitsDecision({ ...item, language: lang }, text);
    if (u) {
      decided.units = { points: u.points, ruleId: u.points ? 'units_stated' : 'units_missing', reason: u.reason };
      findings.push({ criterion: 'units', value: u.points, evidence: u.evidence, ruleId: u.points ? 'units_stated' : 'units_missing' });
    }
  }

  // Findings only (the model judges what they mean for the criterion).
  const range = sentenceRange(item.stem);
  const count = sentences(text).length;
  const target = has('task_completion') ? 'task_completion' : has('structure') ? 'structure' : undefined;
  if (range && (count < range.lo || count > range.hi)) findings.push({ ...(target ? { criterion: target } : {}), ruleId: 'sentence_count', value: count, evidence: `${count} sentence(s); the task says "${range.words}"` });
  const words = (text.match(/[\p{L}\d]+/gu) ?? []).length;
  if (item.type === 'essay' && words < 20) findings.push({ ...(target ? { criterion: target } : {}), ruleId: 'too_short', value: words, evidence: clip(text.trim()) });

  // Spelling (written answers only; maths steps are symbols, not prose).
  if (item.domain !== 'math' && !item.spoken) {
    const spell = (opts.spell ?? spellChecker)(lang);
    const ctx = { stem: item.stem, source: item.source };
    const r = spellingReport(lang, text, spell, ctx);
    const language = item.domain === 'language';
    if (r) {
      findings.push(...spellingFindings(r, language && has('mechanics') ? 'mechanics' : undefined));
      if (language) {
        if (r.misspelled.some((m) => m.certain && m.kind !== 'hamza')) errorCodes.add('spelling');
        if (r.misspelled.some((m) => m.certain && m.kind === 'hamza')) errorCodes.add('hamza_spelling');
        if (r.capitals.length) errorCodes.add('capitalisation');
        const m = has('mechanics') ? mechanicsDecision(item.type, r) : null;
        if (m && m.points <= has('mechanics')!.maxPoints) decided.mechanics = { points: m.points, ruleId: 'mechanics_spelling', reason: m.reason, evidence: m.evidence };
      }
    }
    if (language && lang.startsWith('ar')) {
      const d = dialectReport(text, spell, ctx);
      const f = colloquialFinding(d, has('grammar_accuracy') ? 'grammar_accuracy' : undefined);
      if (f) findings.push(f);
    }
  }
  return done();
}

const KIND_TEXT: Record<string, string> = { spelling: 'spelling', hamza: 'hamza', taa_marbuta: 'taa marbuta (ة/ه)', alef_maqsura: 'alef maqsura (ى/ي)' };
/** The spelling report as findings for the model: "Code found 3 spelling errors: …" (the learner's words, with the corrected form). */
export function spellingFindings(r: SpellingReport, criterion?: string): Finding[] {
  const out: Finding[] = [];
  const c = criterion ? { criterion } : {};
  const certain = r.misspelled.filter((m) => m.certain);
  const unsure = r.misspelled.filter((m) => !m.certain);
  if (certain.length) {
    const kinds = [...new Set(certain.map((m) => m.kind))].map((k) => KIND_TEXT[k]).join(', ');
    out.push({ ...c, ruleId: 'spelling', value: certain.length, evidence: `Code found ${certain.length} spelling error(s) (${kinds}): ${certain.map((m) => (m.fix ? `${m.word} → ${m.fix} (${KIND_TEXT[m.kind]})` : m.word)).join(', ')}` });
  }
  if (unsure.length || r.doubtful.length) {
    const words = [...unsure.map((m) => (m.fix ? `${m.word} (${m.fix}?)` : m.word)), ...r.doubtful.map((d) => `${d.word} (${d.fix}?)`)];
    out.push({ ...c, ruleId: 'spelling', value: 0, evidence: `Not in the dictionary, may be a name, a place, a loanword or a misspelling (judge yourself): ${words.join(', ')}` });
  }
  if (r.capitals.length) {
    out.push({ ...c, ruleId: 'capitalisation', value: r.capitals.length, evidence: `Code found ${r.capitals.length} capital-letter error(s): ${r.capitals.map((x) => `${x.word} → ${x.fix}`).join(', ')}` });
  }
  return out;
}

/** Colloquial (Egyptian) words in an Arabic answer, as a finding for grammar_accuracy; null when there are none. */
export function colloquialFinding(d: DialectReport, criterion?: string): Finding | null {
  if (!d.colloquial.length) return null;
  const words = [...new Set(d.colloquial.map((c) => c.word))];
  return {
    ...(criterion ? { criterion } : {}), ruleId: 'colloquial', value: Math.round(d.share * 100) / 100,
    evidence: `Colloquial (not MSA) words in ${d.colloquialSentences} of ${d.sentences} sentence(s), ${d.colloquial.length} of ${d.words} words: ${words.join('، ')}`,
  };
}

