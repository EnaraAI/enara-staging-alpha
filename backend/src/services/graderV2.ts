// SIMULATION ONLY · DRAFT. graderV2: the five answer-key fixes from
// research/assessment-validation/a1a2/REPORT.md §3. One switch, default OFF:
// ENARA_ENGINE_V2 must name "graderV2" (named-only, never part of "all"; see
// engineV2.ts). With it OFF every caller keeps its previous code path and
// output. Pure functions, no I/O, no model calls.
//   1. normalised matching (case, final/inner punctuation, spaces, curly quotes,
//      contractions both ways), except where matchingNote makes case or
//      punctuation the target (capitals-full-stops, days-months)
//   2. several accepted answers (correctAnswer + acceptedAnswers; note lines skipped)
//   3. choice items: option letter = option text = sentence with the gap filled
//   4. deterministic target-form scorer 0/1/2 (docs/SCORING_RUBRIC.md §2.3/2.4)
//   5. targetFormMissing(): guard for the meaning check
import { engineV2 } from './engineV2';

export const graderV2On = (): boolean => engineV2('graderV2');

export type Sensitivity = 'none' | 'case_punct' | 'day_month';

export interface KeyItem {
  type?: string;
  prompt?: string;
  text?: string;
  options?: string[];
  correctAnswer?: string | number | null;
  answerKey?: string;
  acceptedAnswers?: string[];
  matchingNote?: string;
  acceptedAnswersNote?: string;
  id?: string;
}

export interface TargetFormItem extends KeyItem {
  targetForm?: string;
  targetForms?: string[];
  rubric?: unknown;
  scoringNote?: string;
  scoring?: string;
}

const DAYS_MONTHS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);

export function sensitivityOf(item: Pick<KeyItem, 'matchingNote' | 'acceptedAnswersNote'> | undefined): Sensitivity {
  const note = `${item?.matchingNote ?? ''} ${item?.acceptedAnswersNote ?? ''}`.toLowerCase();
  if (/case- and punctuation-sensitive|case and punctuation sensitive/.test(note)) return 'case_punct';
  if (/case-sensitive for the day\/month|day\/month word is case-sensitive/.test(note)) return 'day_month';
  return 'none';
}

const straightQuotes = (t: string) => t.replace(/[‘’‛`´]/g, "'").replace(/[“”„]/g, '"');

// Contractions to full forms, case-insensitive (missing apostrophe in common ones too: cant, dont).
export function expandContractionsV2(t: string): string {
  return straightQuotes(t)
    .replace(/\bcan'?t\b/gi, 'can not').replace(/\bcannot\b/gi, 'can not')
    .replace(/\bwon't\b/gi, 'will not').replace(/\bshan't\b/gi, 'shall not')
    .replace(/\b(do|does|did|is|are|was|were|have|has|had|could|would|should|must|need)n'?t\b/gi, '$1 not')
    .replace(/n't\b/gi, ' not')
    .replace(/\bi'm\b|\bim\b/gi, 'i am')
    .replace(/\b(it|that|there|here|what|where|who|how|he|she)'s\b/gi, '$1 is')
    // Round-4 fix: apostrophe-less forms that are not other words (theres, thats, whats, hes, shes, youre, theyre).
    // "its" is ambiguous (possessive) and is handled per item in matchKeyV2; "were", "ill", "wont", "lets" are words.
    .replace(/\b(there|that|what|where|who|he|she)s\b/gi, '$1 is')
    .replace(/\b(you|they)re\b/gi, '$1 are')
    .replace(/\blet's\b/gi, 'let us')
    .replace(/\b(i|you|he|she|we|they)'d like\b/gi, '$1 would like')
    .replace(/\b(\w+)'re\b/gi, '$1 are').replace(/\b(\w+)'ve\b/gi, '$1 have').replace(/\b(\w+)'ll\b/gi, '$1 will');
}

export function normaliseV2(t: string, sens: Sensitivity = 'none'): string {
  if (sens === 'case_punct') return straightQuotes(String(t)).replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
  const s = expandContractionsV2(String(t))
    .replace(/o'?\s?clock/gi, 'oclock')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (sens === 'day_month') return s.split(' ').map((w) => (DAYS_MONTHS.has(w.toLowerCase()) ? w : w.toLowerCase())).join(' ');
  return s.toLowerCase();
}

// Rubric rule 6: lines in acceptedAnswers that are notes are not answers.
const NOTE_LINE = /^(case[- ]|model answer|ignore |accept |any |\(any order|e\.g\.|note:)|insensitive;|sensitive;/i;
export function acceptedKeys(item: KeyItem): string[] {
  const raw = [item.correctAnswer, item.answerKey, ...(item.acceptedAnswers ?? [])]
    .filter((x) => x !== undefined && x !== null && String(x).trim() !== '')
    .map((x) => String(x));
  return [...new Set(raw.filter((x) => !NOTE_LINE.test(x.trim())))];
}

// Options: the question's own list, else "(a) X (b) Y" or "(x / y / z)" in the prompt.
export function choiceOptions(item: KeyItem): string[] {
  if (item.options?.length) return item.options.map(String);
  const p = String(item.prompt ?? item.text ?? '');
  const lettered = [...p.matchAll(/\(([a-h])\)\s*([^()]*?)(?=\s*\([a-h]\)|$)/gi)].map((m) => m[2].trim());
  if (lettered.length >= 2) return lettered;
  const group = /\(([^()]*\/[^()]*)\)/.exec(p);
  return group ? group[1].split('/').map((x) => x.trim()).filter(Boolean) : [];
}

const isChoice = (item: KeyItem) => {
  const t = String(item.type ?? '').toLowerCase();
  if (/choice|true-false/.test(t)) return true;
  return !t && /^\s*(choose|which is correct)/i.test(String(item.prompt ?? ''));
};

const tokens = (s: string) => s.split(' ').filter(Boolean);
function containsSpan(hay: string[], needle: string[], from: number, to: number) {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, k) => hay[i + k] === w) && i <= from && i + needle.length >= to) return true;
  }
  return false;
}

// The prompt sentence with the gap (or the option group) filled with `option`, and where the option sits.
function filledSentence(item: KeyItem, option: string, sens: Sensitivity) {
  let p = String(item.prompt ?? item.text ?? '');
  if (/\([a-h]\)/i.test(p)) return null;
  p = p.replace(/^[^:]*:\s*/, '').replace(/\([^()]*\/[^()]*\)/, '\u0001').replace(/_{2,}/, '\u0001');
  if (!p.includes('\u0001')) return null;
  const [before, after] = p.split('\u0001');
  const b = tokens(normaliseV2(before, sens));
  const o = tokens(normaliseV2(option, sens));
  return { words: [...b, ...o, ...tokens(normaliseV2(after, sens))], from: b.length, to: b.length + o.length };
}

// Round-4 fix: a gap answer that repeats words the prompt already shows before the gap ("I'm reading" after "I ___").
function gapWithSubject(item: KeyItem, a: string, nkeys: string[], sens: Sensitivity): boolean {
  const p = String(item.prompt ?? item.text ?? '').replace(/^[^:]*:\s*/, '');
  const m = /^(.*?)_{2,}/.exec(p);
  if (!m) return false;
  const before = tokens(normaliseV2(m[1], sens));
  const ans = tokens(a);
  for (const k of nkeys) {
    const kt = tokens(k);
    const n = ans.length - kt.length;
    if (n < 1 || n > before.length || n > 3) continue;
    if (kt.every((x, i) => ans[n + i] === x) && ans.slice(0, n).every((x, i) => x === before[before.length - n + i])) return true;
  }
  return false;
}

// Round-8 fix (pattern A): a gap answer that also repeats words the sentence shows right AFTER the gap, or on both
// sides ("an old" for "___ old bicycle", "at half past nine"). Only words already in the sentence, at most 3 extra,
// in the sentence's own order; the gap itself must still match an accepted answer exactly.
function gapWithContext(item: KeyItem, a: string, nkeys: string[], sens: Sensitivity): boolean {
  const p = String(item.prompt ?? item.text ?? '').replace(/^[^:]*:\s*/, '');
  const m = /^(.*?)_{2,}(.*)$/.exec(p);
  if (!m) return false;
  const before = tokens(normaliseV2(m[1], sens));
  const after = tokens(normaliseV2(m[2], sens));
  const ans = tokens(a);
  for (const k of nkeys) {
    const kt = tokens(k);
    for (let nb = 0; nb <= Math.min(3, before.length); nb++) {
      for (let na = 1; na <= Math.min(3 - nb, after.length); na++) {
        const cand = [...before.slice(before.length - nb), ...kt, ...after.slice(0, na)];
        if (cand.length === ans.length && cand.every((x, i) => x === ans[i])) return true;
      }
    }
  }
  return false;
}

// Round-8 fix (pattern B): prepositions a rater treats as a harmless change OUTSIDE the corrected target.
const PREP = new Set(['in', 'on', 'at', 'for', 'to', 'from', 'with', 'by', 'into']);
// Time prepositions are rule-bound (on Monday, in May, at 7): a swap in front of a time word is a real error.
const TIME_WORD = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|morning|afternoon|evening|night|weekend|summer|winter|spring|autumn|noon|midnight|\d.*|half|quarter)$/;

const isErrorCorrection = (item: KeyItem) => /error.?correction/i.test(String(item.type ?? '')) || /\b(correct|fix) the (mistake|error)|find and correct/i.test(String(item.prompt ?? item.text ?? ''));
const FUNC = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'am', 'and', 'for', 'very', 'my', 'it']);
const slipOf = (x: string, k: string) => x !== k && Math.min(x.length, k.length) >= 3 && (lev(x, k) <= (k.length >= 7 ? 2 : 1) || (x.length >= 4 && k.length >= 4 && x.slice(0, 3) === k.slice(0, 3) && Math.abs(x.length - k.length) <= 2));
/** Token edit script from a to b: ['=',i,j] | ['s',i,j] | ['d',i,-1] (a[i] dropped) | ['i',-1,j] (b[j] added). */
function align(a: string[], b: string[]) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops: [string, number, number][] = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { ops.push([a[i - 1] === b[j - 1] ? '=' : 's', i - 1, j - 1]); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push(['d', i - 1, -1]); i--; }
    else { ops.push(['i', -1, j - 1]); j--; }
  }
  return ops.reverse();
}
/**
 * Round-4 fix (rubric §2.2): error correction is scored on the target only. The target is the part of the key that
 * differs from the prompt's wrong sentence (for a deletion, the key words on both sides of it), plus nearby key
 * words named in the item's targetForm ("than" in a comparative). Credit when every target word is right, none of the
 * removed wrong words is still there, and the rest differs from the key by at most two slips (a misspelt or
 * mis-inflected word, or a dropped/added small word).
 */
function errorCorrectionTarget(item: KeyItem & { targetForm?: string }, a: string, sens: Sensitivity): boolean {
  if (!isErrorCorrection(item)) return false;
  const p = String(item.prompt ?? item.text ?? '');
  const wrongSrc = p.includes(':') ? p.slice(p.lastIndexOf(':') + 1) : '';
  const E = tokens(normaliseV2(wrongSrc, sens));
  if (E.length < 2) return false;
  const A = tokens(a);
  // targetForm words widen the target only when targetForm describes the form; a copy of a key sentence does not.
  const tfNorm = normaliseV2(String(item.targetForm ?? ''));
  const tfWords = new Set(acceptedKeys(item).some((k) => normaliseV2(k) === tfNorm) ? [] : tokens(tfNorm));
  for (const key of acceptedKeys(item)) {
    const K = tokens(normaliseV2(key, sens));
    if (K.length < 2 || Math.abs(K.length - E.length) > 3) continue;
    const ek = align(E, K);
    const target = new Set<number>();
    const removed = new Set<string>();
    ek.forEach(([op, i, j], n) => {
      if (op === 's' || op === 'i') target.add(j);
      if (op === 's' || op === 'd') removed.add(E[i]);
      if (op === 'd') { // deletion: the key words around it are the target
        const prev = ek.slice(0, n).reverse().find((o) => o[2] >= 0), next = ek.slice(n + 1).find((o) => o[2] >= 0);
        if (prev) target.add(prev[2]);
        if (next) target.add(next[2]);
      }
    });
    if (!target.size) continue;
    for (const j of [...target]) for (let k = Math.max(0, j - 2); k <= Math.min(K.length - 1, j + 2); k++) if (tfWords.has(K[k]) && !FUNC.has(K[k])) target.add(k);
    for (const x of K) removed.delete(x);
    if (A.some((x) => removed.has(x))) continue;
    let slips = 0, ok = true;
    const ops = align(A, K);
    ops.forEach(([op, i, j], n) => {
      if (op === '=') return;
      if (j >= 0 && target.has(j)) { ok = false; return; }
      if (op === 'd') { // an added word next to the target changes the target
        const prev = ops.slice(0, n).reverse().find((o) => o[2] >= 0), next = ops.slice(n + 1).find((o) => o[2] >= 0);
        if ((prev && target.has(prev[2]) && next && target.has(next[2])) || !FUNC.has(A[i])) { ok = false; return; }
      }
      if (op === 'i' && !FUNC.has(K[j])) { ok = false; return; }
      // Round-8 fix (pattern B): one preposition swapped for another outside the target ("in the market" for
      // "at the market") is a slip; a preposition inside the target is still checked above and stays wrong.
      const nextWord = K[j + 1] === 'the' ? K[j + 2] : K[j + 1]; // look past "the" (at the weekend)
      const harmlessPrep = sens === 'none' && PREP.has(A[i]) && PREP.has(K[j]) && !TIME_WORD.test(nextWord ?? '');
      if (op === 's' && !slipOf(A[i], K[j]) && !harmlessPrep) { ok = false; return; }
      slips++;
    });
    // At least 70% of the key's words must be unchanged, so a rewrite never passes as "slips".
    const same = ops.filter(([op]) => op === '=').length;
    if (ok && slips <= 2 && same >= Math.ceil(0.7 * K.length)) return true;
  }
  return false;
}

// Option B2 (error-correction check, switch ENARA_EC_CHECK=on, off by default; needs graderV2 ON). For error-
// correction items that are not case/spelling-sensitive, any answer that is not an exact key match is decided by the
// target-aware error-correction check (gradingProposals.evaluateErrorCorrection), which can also overturn credit the
// rules gave leniently. Exact key matches, case/spelling-sensitive items and every other item type are unchanged.
export const ecCheckOn = (): boolean => graderV2On() && String(process.env.ENARA_EC_CHECK ?? '').trim().toLowerCase() === 'on';
export const isErrorCorrectionItem = (item: KeyItem): boolean => isErrorCorrection(item);
/** True when the answer equals an accepted key after the item's own normalisation (no leniency rules). */
export function exactKeyMatch(item: KeyItem, answer: string | number | undefined | null): boolean {
  if (answer === undefined || answer === null) return false;
  const sens = sensitivityOf(item);
  const a = normaliseV2(String(answer), sens);
  return Boolean(a) && acceptedKeys(item).some((k) => normaliseV2(k, sens) === a);
}
export function useErrorCorrectionCheck(item: KeyItem, answer: string | undefined | null): boolean {
  return ecCheckOn() && isErrorCorrection(item) && sensitivityOf(item) === 'none' && Boolean(String(answer ?? '').trim()) && !exactKeyMatch(item, answer);
}

const LETTER = /^\s*\(?\s*([a-h])\s*(?:\)|\.|:|\s*$)\s*(.*)$/i;

// Fixes 1-3. True when the answer matches an accepted answer.
export function matchKeyV2(item: KeyItem, answer: string | number | undefined | null): boolean {
  if (answer === undefined || answer === null) return false;
  const sens = sensitivityOf(item);
  const keys = acceptedKeys(item);
  if (!keys.length) return false;
  const a = normaliseV2(String(answer), sens);
  if (!a) return false;
  const nkeys = keys.map((k) => normaliseV2(k, sens));
  if (nkeys.includes(a)) return true;
  // Round-4 fix: "its" for "it's" counts only where every key reads "it is" there and no key has possessive "its".
  if (sens !== 'case_punct' && /\bits\b/.test(a) && !nkeys.some((k) => /\bits\b/.test(k)) && nkeys.includes(a.replace(/\bits\b/g, 'it is'))) return true;
  if (!isChoice(item)) {
    if (sens === 'case_punct') return false;
    return gapWithSubject(item, a, nkeys, sens) || gapWithContext(item, a, nkeys, sens) || errorCorrectionTarget(item, a, sens);
  }
  const options = choiceOptions(item);
  if (!options.length) return false;
  const letterOf = (k: string) => (/^\(?[a-h]\)?\.?$/i.test(k.trim()) ? k.trim().replace(/[().]/g, '').toLowerCase() : null);
  const correctIdx = options.map((o, i) => (nkeys.includes(normaliseV2(o, sens)) || keys.some((k) => letterOf(k) === String.fromCharCode(97 + i)) ? i : -1)).filter((i) => i >= 0);
  if (!correctIdx.length) return false;
  // A bare letter that is itself an option's text ("a" in "a / an") is that text, not a letter.
  const isOptionText = options.some((o) => normaliseV2(o, sens) === a);
  const m = LETTER.exec(String(answer));
  if (m && !isOptionText) {
    const idx = m[1].toLowerCase().charCodeAt(0) - 97;
    if (!correctIdx.includes(idx)) return false;
    const rest = m[2].trim();
    return !rest || normaliseV2(rest, sens) === normaliseV2(options[idx], sens) || nkeys.includes(normaliseV2(rest, sens));
  }
  if (isOptionText) return correctIdx.some((i) => normaliseV2(options[i], sens) === a);
  // The gap filled: "an umbrella" for option "an" in "There is (a / an) umbrella ...".
  const ans = tokens(a);
  return correctIdx.some((i) => {
    const f = filledSentence(item, options[i], sens);
    return Boolean(f && ans.length > f.to - f.from && containsSpan(f.words, ans, f.from, f.to));
  });
}

// ---------------------------------------------------------------------------
// Fix 4: deterministic target-form scorer for free sentences (0/1/2).

export type TFScore = 0 | 1 | 2;

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    // Round-3 fix: a swapped pair of letters (quite/quiet, becuase) is one slip.
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
const nearMiss = (w: string, k: string) => w !== k && k.length >= 4 && lev(w, k) <= (k.length >= 7 ? 2 : 1);

const IRREGULAR: Record<string, string> = { go: 'went', have: 'had', see: 'saw', buy: 'bought', eat: 'ate', come: 'came', do: 'did', get: 'got', make: 'made', take: 'took', write: 'wrote', meet: 'met', give: 'gave', drink: 'drank', run: 'ran', sleep: 'slept', find: 'found', leave: 'left', say: 'said', tell: 'told', think: 'thought', sit: 'sat', swim: 'swam', fly: 'flew', drive: 'drove', begin: 'began', break: 'broke', choose: 'chose', forget: 'forgot', know: 'knew', lose: 'lost', pay: 'paid', sell: 'sold', send: 'sent', spend: 'spent', stand: 'stood', teach: 'taught', wake: 'woke', wear: 'wore', win: 'won', feel: 'felt', keep: 'kept', hear: 'heard', bring: 'brought', catch: 'caught', ride: 'rode', sing: 'sang', speak: 'spoke', become: 'became', build: 'built', fall: 'fell', grow: 'grew', hold: 'held', read: 'read', put: 'put', cut: 'cut' };
const PASTS = new Set(Object.values(IRREGULAR));
const OVERREG = new Set(Object.keys(IRREGULAR).flatMap((b) => [`${b}ed`, `${b.replace(/e$/, '')}ed`]).filter((w) => !PASTS.has(w)));
const UNCOUNT = new Set(['water', 'money', 'time', 'milk', 'sugar', 'rice', 'homework', 'information', 'bread', 'juice', 'tea', 'coffee', 'food', 'work', 'traffic', 'furniture', 'news', 'advice', 'luggage', 'cheese', 'meat', 'oil', 'salt', 'fun', 'noise', 'space', 'snow', 'rain']);
const FREQ = new Set(['always', 'usually', 'often', 'sometimes', 'never', 'rarely', 'seldom']);
const BE = new Set(['am', 'is', 'are']);
const SUBJ_BE: Record<string, string> = { i: 'am', he: 'is', she: 'is', it: 'is', we: 'are', you: 'are', they: 'are' };
const NUMS = new Set(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'many', 'some', 'lots', 'several']);
// Round-3 fixes: common regular verbs (base form), auxiliaries and number words, for slip and clause checks.
const REG = new Set(['watch', 'play', 'clean', 'walk', 'cook', 'visit', 'wash', 'talk', 'listen', 'open', 'help', 'start', 'finish', 'want', 'call', 'live', 'like', 'study', 'work', 'stay', 'travel', 'stop', 'plan', 'wait', 'look', 'ask', 'need', 'use', 'love', 'dance', 'move', 'try', 'cry', 'carry', 'jump', 'paint', 'rain', 'miss', 'fix', 'enjoy', 'return', 'arrive', 'close', 'decide', 'hate', 'hope', 'practise', 'practice', 'learn', 'show', 'borrow', 'change', 'phone', 'check', 'answer', 'climb', 'repair', 'push', 'pull', 'smile', 'shop', 'chat', 'drop', 'rob', 'jog', 'hug', 'clap', 'correct', 'collect', 'invite', 'remember', 'film', 'order', 'park', 'post', 'type', 'brush', 'kick', 'pass', 'paint', 'pray', 'fill', 'iron', 'tidy', 'marry', 'worry', 'hurry', 'copy', 'reply', 'text', 'email', 'print', 'turn', 'share', 'save', 'bake', 'fry', 'boil', 'mend', 'cycle', 'skate', 'ski', 'surf', 'swim', 'read', 'write', 'sleep', 'drive', 'ride', 'dance', 'sing', 'run', 'go', 'come', 'eat', 'drink', 'see', 'meet', 'buy', 'get', 'make', 'do', 'have', 'take', 'give', 'speak', 'teach', 'sit', 'wear', 'fly', 'know', 'think', 'feel', 'win', 'lose', 'send', 'spend', 'sell', 'bring', 'build', 'catch', 'grow', 'hear', 'keep', 'leave', 'pay', 'say', 'tell', 'stand', 'wake', 'find', 'begin', 'break', 'choose', 'forget', 'put', 'cut']);
const DOUBLE_REG = new Set(['stop', 'plan', 'shop', 'chat', 'drop', 'rob', 'jog', 'hug', 'clap', 'travel']);
const AUX = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'must', 'may', 'might', 'shall']);
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'quarter', 'half', 'twenty', 'thirty', 'forty', 'fifty'];
const DET = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'some', 'this', 'that', 'these', 'those']);
/** A word that can be a verb form: auxiliary, a known verb, or a known verb + s/es/ed/ing. */
const verbish = (x: string) => {
  if (AUX.has(x) || REG.has(x) || PASTS.has(x)) return true;
  const stems = [x.replace(/ies$/, 'y'), x.replace(/es$/, ''), x.replace(/s$/, ''), x.replace(/ied$/, 'y'), x.replace(/ed$/, ''), x.replace(/d$/, ''), x.replace(/ing$/, ''), x.replace(/ing$/, 'e'), x.replace(/(.)\1(ed|ing)$/, '$1')];
  return stems.some((st) => st !== x && REG.has(st)) || (/(ed|ing)$/.test(x) && x.length > 5);
};
const DOUBLE = new Set(['sit', 'run', 'swim', 'get', 'put', 'stop', 'shop', 'plan', 'begin', 'cut', 'hit', 'jog', 'travel']);
const EDROP = new Set(['write', 'make', 'take', 'come', 'have', 'ride', 'dance', 'drive', 'leave', 'live', 'smile', 'use']);
const ADJ_DOUBLE = new Set(['big', 'hot', 'fat', 'thin', 'wet', 'sad']);
// Round-6 fix: irregular plurals (no -s) and irregular third-person forms (do/go/have/be).
const IRREG_PL = new Set(['children', 'men', 'women', 'people', 'teeth', 'feet', 'mice']);
const IRREG_3SG = new Set(['does', 'goes', 'has', 'is']);
const BASE_3SG_WRONG = new Set(['do', 'have', 'are']);
const IRREG_COMP = new Set(['better', 'worse', 'further', 'farther']);
const BAD_COMP = new Set(['gooder', 'badder', 'more better', 'more bigger']);
const PREP_TIME = { at: /^(\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight|night|oclock|half|quarter)/, on: new Set([...DAYS_MONTHS].slice(0, 7).concat(['weekend', 'friday', 'birthday', 'monday'])), in: new Set([...DAYS_MONTHS].slice(7).concat(['summer', 'winter', 'spring', 'autumn', 'morning', 'afternoon', 'evening', 'december'])) } as const;

/** One syllable, or two syllables ending in -y (big, new, long, easy, happy): takes -er, not "more". */
function shortAdj(x: string) {
  const v = (x.replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length;
  return v <= 1 || (v === 2 && /[^aeiou]y$/.test(x));
}
const LEX: [RegExp, string[]][] = [
  [/classroom/, ['pen', 'pencil', 'rubber', 'eraser', 'ruler', 'book', 'notebook', 'board', 'clock', 'map', 'poster', 'desk', 'chair', 'bag', 'sharpener', 'calculator', 'scissors', 'glue', 'paper', 'window', 'door', 'calendar', 'picture']],
  [/clothing/, ['jeans', 't-shirt', 'tshirt', 'shirt', 'dress', 'skirt', 'jacket', 'coat', 'shoes', 'trainers', 'hat', 'scarf', 'jumper', 'sweater', 'trousers', 'shorts', 'socks', 'abaya', 'hijab', 'boots', 'tracksuit', 'hoodie']],
  [/size/, ['small', 'medium', 'large', 'extra large', 'xl']],
  [/day name/, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']],
  [/month name/, ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']],
  [/fruit/, ['apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'mango', 'mangoes', 'grapes', 'strawberry', 'strawberries', 'watermelon', 'pear', 'peach', 'lemon', 'dates', 'figs', 'melon', 'guava', 'pineapple']],
  [/drink/, ['tea', 'coffee', 'milk', 'water', 'juice', 'lemonade', 'cola', 'hot chocolate']],
  [/room/, ['kitchen', 'bedroom', 'bathroom', 'living room', 'dining room', 'garden', 'balcony', 'hall', 'garage', 'office']],
  [/hair adjective/, ['long', 'short', 'curly', 'straight', 'wavy', 'black', 'brown', 'blonde', 'grey', 'gray', 'red', 'dark', 'fair']],
  [/number in words/, ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred']],
];

interface Ctx { item: TargetFormItem; raw: string; w: string[]; s: string }

// Round-3 fix: make/do collocations (rubric: wrong verb with the noun = 0).
const MAKE_N = ['bed', 'beds', 'cake', 'cakes', 'call', 'mistake', 'mistakes', 'mess', 'plan', 'plans', 'tea', 'coffee', 'noise', 'friend', 'friends', 'breakfast', 'lunch', 'dinner', 'sandwich', 'sandwiches', 'decision', 'money', 'list', 'progress', 'appointment', 'promise', 'choice', 'joke', 'speech', 'wish', 'food', 'meal', 'soup', 'salad', 'pizza', 'bread', 'juice', 'phone', 'mistake'];
const DO_N = ['homework', 'exercise', 'exercises', 'dishes', 'shopping', 'washing', 'test', 'cleaning', 'sport', 'sports', 'job', 'housework', 'ironing', 'laundry', 'work', 'best', 'business', 'research', 'yoga', 'karate', 'course', 'exam', 'favour', 'favor', 'cooking', 'washing up', 'project', 'gardening', 'hair', 'nails', 'maths', 'math', 'chores', 'quiz', 'puzzle', 'crossword'];
const MAKE_V = /^(make|makes|made|making)$/, DO_V = /^(do|does|did|doing)$/;
const SKIP_NP = new Set([...DET, 'lot', 'lots', 'of', 'big', 'little', 'small', 'new', 'nice', 'good', 'great', 'bad', 'loud', 'some', 'any', 'every', 'english', 'maths', 'math', 'science', 'arabic', 'morning', 'quick', 'delicious', 'phone']);
/** (verb, head noun) pairs for make/do; "do" as an auxiliary (do not, do you, does she like) is skipped. */
function collocations(w: string[]): ['make' | 'do', string][] {
  const out: ['make' | 'do', string][] = [];
  for (let i = 0; i < w.length; i++) {
    const verb = MAKE_V.test(w[i]) ? 'make' : DO_V.test(w[i]) ? 'do' : null;
    if (!verb) continue;
    let j = i + 1;
    if (verb === 'do' && (w[j] === 'not' || ['i', 'you', 'he', 'she', 'it', 'we', 'they'].includes(w[j]) || (REG.has(w[j]) && !DO_N.includes(w[j])))) continue;
    if (w[j] === 'the' && w[j + 1] === 'washing' && w[j + 2] === 'up') { out.push([verb, 'washing up']); continue; }
    // the noun: the last word of the noun phrase before a preposition/adverb ("a phone call", "the beds on Saturday")
    let noun = '';
    for (; j < w.length && j < i + 5; j++) {
      if (['on', 'in', 'at', 'for', 'with', 'after', 'before', 'every', 'and', 'but', 'because', 'to', 'today', 'tonight', 'now'].includes(w[j])) break;
      if (MAKE_N.includes(w[j]) || DO_N.includes(w[j])) noun = w[j];
      else if (!SKIP_NP.has(w[j]) && !noun) noun = w[j];
    }
    if (noun) out.push([verb, noun]);
  }
  return out;
}

// Round-3 fix: word order (S + V + O + place/time at the end; adjective before noun). No fallback.
const PRON = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const PLACE_TIME_START = new Set(['in', 'at', 'on', 'after', 'before', 'every', 'from', 'near', 'with', 'by']);
const TIME_ADV = new Set(['early', 'late', 'every', 'today', 'tonight', 'tomorrow', 'yesterday', 'now', 'home', 'there', 'here', 'later', 'soon', 'outside', 'downstairs', 'upstairs']);
const ADJ_AFTER = new Set(['red', 'blue', 'green', 'black', 'white', 'yellow', 'big', 'small', 'new', 'old', 'hot', 'cold', 'nice', 'good', 'long', 'short', 'beautiful', 'delicious', 'fresh', 'sweet', 'strong']);
function wordOrder({ w, item }: Ctx): TFScore {
  if (w.length < 3) return 0;
  // fronted place/time ("In the evening I drink tea.") is not at the end
  if (PLACE_TIME_START.has(w[0]) || TIME_ADV.has(w[0])) return 0;
  // subject first (pronoun, determiner + noun, or a name), then the verb
  let v = 1;
  if (!PRON.has(w[0])) { v = DET.has(w[0]) ? 2 : 1; while (v < Math.min(w.length, 4) && !verbish(w[v])) v++; }
  while (v < w.length - 1 && (FREQ.has(w[v]) || w[v] === 'not' || w[v] === 'going' || (w[v] === 'to' && w[v - 1] === 'going') || (AUX.has(w[v]) && verbish(w[v + 1])))) v++;
  if (v >= w.length || !verbish(w[v])) return 0; // object or nothing where the verb should be ("I tea drink")
  let faults = 0;
  const after = w.slice(v + 1);
  // place/time between the verb and its object ("I drink in the evening tea")
  if (PLACE_TIME_START.has(after[0] ?? '')) {
    let e = 1;
    if (DET.has(after[e] ?? '')) e++;
    e++;
    if (e < after.length && !PLACE_TIME_START.has(after[e]) && !TIME_ADV.has(after[e])) faults++;
  }
  // adjective after its noun ("a car red")
  for (let i = 0; i < w.length - 2; i++) if (DET.has(w[i]) && !ADJ_AFTER.has(w[i + 1]) && !verbish(w[i + 1]) && ADJ_AFTER.has(w[i + 2]) && !AUX.has(w[i + 3] ?? '') && w[i + 3] !== 'and') faults++;
  // the prompt asks for place/time at the end and there is none
  const hasEnd = after.some((x) => PLACE_TIME_START.has(x)) || TIME_ADV.has(w[w.length - 1]);
  if (/at the end/i.test(String(item.prompt ?? '')) && !hasEnd) faults++;
  return faults === 0 ? 2 : faults === 1 ? 1 : 0;
}

// Round-4 fix: his/her must agree with the owner. The owner is the nearest gendered noun or known first name before
// it. A his/her whose owner is a name of unknown gender cannot be checked: null (not decided; the caller keeps its path).
const MALE = new Set(['he', 'him', 'man', 'boy', 'father', 'dad', 'brother', 'son', 'uncle', 'grandfather', 'grandpa', 'husband', 'nephew', 'mr', 'king', 'ahmed', 'ahmad', 'mohamed', 'mohammed', 'muhammad', 'ali', 'omar', 'umar', 'khaled', 'khalid', 'hassan', 'hussein', 'youssef', 'yusuf', 'ibrahim', 'mahmoud', 'mustafa', 'karim', 'kareem', 'tarek', 'tariq', 'hamza', 'adam', 'sami', 'samir', 'nabil', 'walid', 'fadi', 'majid', 'saeed', 'saleh', 'faisal', 'john', 'tom', 'david', 'james', 'peter', 'mark', 'paul', 'jack', 'sam']);
const FEMALE = new Set(['she', 'woman', 'girl', 'mother', 'mum', 'mom', 'sister', 'daughter', 'aunt', 'grandmother', 'grandma', 'wife', 'niece', 'mrs', 'ms', 'miss', 'queen', 'fatima', 'fatma', 'aisha', 'aysha', 'mariam', 'maryam', 'mona', 'noor', 'nour', 'huda', 'hoda', 'layla', 'leila', 'laila', 'sara', 'sarah', 'salma', 'amira', 'yasmin', 'yasmine', 'rania', 'dina', 'reem', 'hana', 'hanan', 'nadia', 'zainab', 'zeinab', 'khadija', 'asma', 'lina', 'rana', 'mai', 'nada', 'samira', 'mary', 'anna', 'emma', 'lucy', 'kate', 'jane', 'lisa']);
function possessives({ w, raw }: Ctx): TFScore | null {
  if (!w.some((x) => ['his', 'her', 'our', 'their', 'my', 'your', 'its'].includes(x))) return 0;
  const orig = straightQuotes(raw).replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  let ok = 0, bad = 0, unknown = 0, other = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'his' && w[i] !== 'her') { if (['our', 'their', 'my', 'your', 'its'].includes(w[i])) other++; continue; }
    let owner: 'm' | 'f' | '?' | null = null;
    for (let k = i - 1; k >= 0 && owner === null; k--) {
      if (MALE.has(w[k])) owner = 'm';
      else if (FEMALE.has(w[k])) owner = 'f';
      else if (k > 0 && /^[A-Z]/.test(orig[k] ?? '') && orig[k] !== 'I' && !DAYS_MONTHS.has(w[k])) owner = '?';
    }
    if (owner === null && w[i] === 'her' && i > 0 && verbish(w[i - 1])) { other++; continue; } // object "her" (I call her)
    if (owner === '?') unknown++;
    else if (owner === null || (owner === 'm') === (w[i] === 'his')) ok++;
    else bad++;
  }
  if (bad) return ok ? 1 : 0;
  if (unknown) return ok ? 2 : null;
  return ok || other ? 2 : 0;
}

// Round-3 fix: clock times written out; the number word is part of the form ("elevn o'clock" = slip, digits = not in words).
function clockTime({ w }: Ctx): TFScore {
  let ok = 0, slip = 0, found = 0;
  for (let i = 0; i < w.length; i++) {
    let num: string | undefined;
    if (w[i] === 'oclock') num = w[i - 1];
    else if ((w[i] === 'past' || w[i] === 'to') && i > 0 && (NUM_WORDS.some((n) => n === w[i - 1] || nearMiss(w[i - 1], n)) || /^(quarter|half|five|ten|twenty)/.test(w[i - 1]))) num = w[i + 1];
    else if (w[i] === 'half' && w[i + 1] === 'past') continue;
    else continue;
    found++;
    const n = num ?? '';
    if (NUM_WORDS.includes(n) || /^(twenty|thirty|forty|fifty)-?\w*$/.test(n) || n === 'midnight' || n === 'noon') ok++;
    else if (/^\d/.test(n)) continue;
    else if (NUM_WORDS.some((k) => nearMiss(n, k) || (k.length === 3 && lev(n, k) === 1 && n.length >= 3))) slip++;
  }
  if (!found) return 0;
  if (!ok) return slip ? 1 : 0;
  return slip ? 1 : 2;
}

/** Round-4 fix: base-form verbs in a joined clause ("... and wash the car", "... and I buy") in a past sentence. */
function secondClauseBase(w: string[]) {
  let n = 0;
  for (let i = 1; i < w.length; i++) {
    if (!['and', 'then', 'but'].includes(w[i - 1]) && !(PRON.has(w[i - 1]) && ['and', 'then', 'but'].includes(w[i - 2] ?? ''))) continue;
    const x = w[i];
    if (REG.has(x) && !PASTS.has(x) && !AUX.has(x)) n++;
  }
  return n;
}

// Round-7 fix: be forms incl. past; the head noun of a subject with a preposition phrase / relative clause.
const BE_ALL = new Set(['am', 'is', 'are', 'was', 'were']);
const DET_SG = new Set(['a', 'an', 'the', 'my', 'his', 'her', 'this', 'that', 'your', 'our', 'their', 'its']);
const NOT_SUBJ = new Set(['there', 'here', 'what', 'where', 'who', 'which', 'how', 'why', 'when', 'that', 'these', 'those', 'both', 'all', 'today', 'tomorrow', 'yesterday', 'now', 'it', 'not']);
const SUBJ_PREP = new Set(['in', 'on', 'at', 'with', 'of', 'from', 'near', 'for', 'by', 'behind', 'under', 'without', 'who', 'that', 'which', 'whose']);
const QUANT_OF = new Set(['lot', 'lots', 'some', 'all', 'most', 'many', 'both', 'plenty', 'couple', 'number', 'half', 'none', 'any', 'kind', 'type']);
const CLAUSE_BREAK = new Set(['and', 'but', 'because', 'so', 'when', 'if', 'or', 'then']);
function subjectHead(w: string[], i: number): number {
  const prev = w[i - 1] ?? '';
  if (i < 2 || SUBJ_BE[prev] || PRON.has(prev) || SUBJ_PREP.has(prev) || NOT_SUBJ.has(prev)) return i - 1;
  let start = 0;
  for (let k = i - 2; k >= 0; k--) {
    if (BE_ALL.has(w[k]) || CLAUSE_BREAK.has(w[k]) || (verbish(w[k]) && !DET.has(w[k - 1] ?? '') && !SUBJ_PREP.has(w[k]))) { start = k + 1; break; }
  }
  for (let p = start + 1; p < i - 1; p++) {
    if (!SUBJ_PREP.has(w[p])) continue;
    const h = w[p - 1];
    if (SUBJ_PREP.has(h) || DET.has(h) || PRON.has(h) || (w[p] === 'of' && QUANT_OF.has(h))) return i - 1;
    return p - 1;
  }
  return i - 1;
}
// Round-7 fix: verbs joined to a third-person clause by and/then/or/but (no new subject) are checked too.
const NOUNISH = new Set(['work', 'rain', 'film', 'park', 'text', 'email', 'shop', 'plan', 'order', 'post', 'type', 'phone', 'dance', 'help', 'love', 'ski', 'surf', 'swim', 'cut', 'drink', 'run', 'walk', 'call', 'change', 'answer', 'check']);
function joinedVerbs3sg(w: string[], from: number): { ok: number; bad: number } {
  let ok = 0, bad = 0;
  for (let k = from; k < w.length - 1; k++) {
    if (PRON.has(w[k]) || w[k] === 'because' || w[k] === 'when' || w[k] === 'if') break;
    if (!['and', 'then', 'or', 'but'].includes(w[k])) continue;
    let v = w[k + 1];
    if (v === 'then') v = w[k + 2] ?? '';
    if (FREQ.has(v)) v = w[w.indexOf(v, k + 1) + 1] ?? '';
    if (!v || PRON.has(v) || DET.has(v) || NOUNISH.has(v)) continue;
    if (IRREG_3SG.has(v)) ok++;
    else if (BASE_3SG_WRONG.has(v) || (REG.has(v) && !/s$/.test(v))) bad++;
    else if (/s$/.test(v) && (REG.has(v.slice(0, -1)) || REG.has(v.slice(0, -2)) || REG.has(v.replace(/ies$/, 'y')))) ok++;
  }
  return { ok, bad };
}

/** Round-7 fix: the number of target slots in the item's key(s) (a key with "there is" and "there are" = 2). */
function keySlots(item: TargetFormItem, re: RegExp): number {
  return Math.max(0, ...acceptedKeys(item).map((k) => (normaliseV2(k).match(re) ?? []).length));
}
// Score of a grammar form, per docs/SCORING_RUBRIC.md; null = form not handled here.
const GRAMMAR: [RegExp, (c: Ctx) => TFScore | null][] = [
  [/there is/, ({ w, item }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      if (w[i] !== 'there' || !BE.has(w[i + 1])) { if (/^(ther|thier|their)$/.test(w[i]) && BE.has(w[i + 1])) bad += 0.5; continue; }
      const next = w[i + 2] ?? '';
      const plural = NUMS.has(next) || (/s$/.test(w[i + 3] ?? next) && !['a', 'an', 'one'].includes(next) && !UNCOUNT.has(w[i + 3] ?? next));
      if ((w[i + 1] === 'is' && plural && NUMS.has(next)) || (w[i + 1] === 'are' && ['a', 'an', 'one'].includes(next))) bad += 1; else ok += 1;
    }
    if (!ok) return bad === 0.5 ? 1 : 0;
    // Round-7 fix (rubric §2.4): a key with two there-is/are slots needs both; one right and one missing/wrong = 1.
    if (!bad && ok < keySlots(item, /\bthere (is|are)\b/g)) return 1;
    return bad ? 1 : 2;
  }],
  [/am \/ is \/ are after|^am \/ is \/ are/, ({ w, raw }) => {
    // Round-3 fix: every be form is checked against its subject, including plural and "X and Y" subjects.
    // Round-7 fix: was/were are checked too; a name or singular noun + are/were is wrong (+ is/was right);
    // the subject is the head noun before a preposition phrase or relative clause (The people in my town are).
    const orig = straightQuotes(raw).replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
    let ok = 0, bad = 0, seenBe = false;
    for (let i = 0; i < w.length; i++) {
      if (!BE_ALL.has(w[i]) && w[i] !== 'be') continue;
      const compound = !seenBe && w.slice(0, i).includes('and');
      seenBe = true;
      if (w[i] === 'be') { bad++; continue; }
      const sp = subjectHead(w, i);
      const subj = w[sp];
      const past = w[i] === 'was' || w[i] === 'were';
      if (subj && SUBJ_BE[subj]) {
        const want = past ? (['we', 'you', 'they'].includes(subj) ? 'were' : 'was') : SUBJ_BE[subj];
        if (want === w[i]) ok++; else bad++;
        continue;
      }
      const plural = compound || IRREG_PL.has(subj ?? '') || (subj && /[^s']s$/.test(subj) && !['his', 'this', 'bus', 'news', 'maths', 'physics', 'class', 'glass'].includes(subj));
      const pluralBe = w[i] === 'are' || w[i] === 'were';
      const singular = !plural && !!subj && !NOT_SUBJ.has(subj) && !/s$/.test(subj) && !DET.has(subj) && (
        (DET_SG.has(w[sp - 1] ?? '')) || MALE.has(subj) || FEMALE.has(subj) || (sp > 0 && /^[A-Z]/.test(orig[sp] ?? '')) || (sp === 0 && /^[A-Z]/.test(orig[0] ?? '')));
      if (plural && !pluralBe) bad++;
      else if (singular && pluralBe) bad++;
      else ok++;
    }
    if (!ok) return 0;
    return bad ? 1 : 2;
  }],
  [/can \/ can't/, ({ w, raw }) => {
    if (/\bcann'?t\b|\bcann\b|\bcanot\b/i.test(raw)) return 1;
    const i = w.indexOf('can');
    if (i < 0) return 0;
    const v = w[i + 1] === 'not' ? w[i + 2] : w[i + 1];
    if (!v) return 0;
    // Round-3 fix (rubric §6 clarification): a wrong form after a correct "can" (can to swim, can swims, can swimming) is a slip.
    if (v === 'to' || /ing$/.test(v) && v.length > 4 || (/[^s]s$/.test(v) && v.length > 3 && !['is', 'was', 'dress'].includes(v))) return 1;
    return 2;
  }],
  [/regular verb \+ -ed/, ({ w }) => {
    if (w.some((x) => OVERREG.has(x))) return w.some((x) => PASTS.has(x) && !['read', 'put', 'cut'].includes(x)) ? 1 : 0;
    // Round-3 fix: every past form is checked; a recognisable -ed with one spelling slip is 1.
    let ok = 0, slip = 0;
    for (const x of w) {
      if (/[^aeiou]yed$/.test(x) && x.length > 4) slip++; // studyed
      else if (/[aeiou]{2}([b-df-hj-np-tv-z])\1ed$/.test(x)) slip++; // cleanned: no doubling after two vowels
      else if ([...DOUBLE_REG].some((d) => x === `${d}ed`)) slip++; // stoped
      else if (/d$/.test(x) && !/ed$/.test(x) && REG.has(x.slice(0, -1)) && !/e$/.test(x.slice(0, -1))) slip++; // watchd
      else if (/[a-z]{2,}ed$/.test(x) && !['need', 'feed', 'bed', 'red', 'shed', 'seed', 'speed'].includes(x)) ok++;
    }
    slip += secondClauseBase(w);
    if (!ok) return slip ? 1 : 0;
    return slip ? 1 : 2;
  }],
  [/irregular past/, ({ w }) => {
    // Rubric rule 4: an over-regularised form (goed, buyed) is wrong (0); next to a right irregular past it is
    // "right in one place, wrong in another" (tf1). Round-4 fix: a base verb in the second clause is also checked.
    const right = w.some((x) => PASTS.has(x) && x !== 'read' && x !== 'put' && x !== 'cut');
    if (w.some((x) => OVERREG.has(x))) return right ? 1 : 0;
    if (w.some((x) => [...PASTS].some((p) => x === `${p}ed` || x === `${p}d`))) return 1;
    if (!right) return 0;
    return secondClauseBase(w) ? 1 : 2;
  }],
  [/did \+ subject/, ({ w }) => {
    const i = w.indexOf('did');
    if (i < 0) return 0;
    const v = w[i + 2];
    if (!v) return 0;
    return /ed$/.test(v) || PASTS.has(v) ? 1 : 2;
  }],
  [/verb-ing/, ({ w }) => {
    for (let i = 0; i < w.length - 1; i++) {
      if (!BE.has(w[i])) continue;
      const v = w[i + 1] === 'not' ? w[i + 2] ?? '' : w[i + 1];
      if (!/ing$/.test(v) || v.length < 5) continue;
      const stem = v.slice(0, -3);
      if ([...DOUBLE].some((d) => stem === d && d.length <= 4) || [...EDROP].some((e) => stem === e || stem === `${e.slice(0, -1)}${e.slice(-2, -1)}`)) return 1;
      if (/(.)\1$/.test(stem) && [...EDROP].some((e) => stem.slice(0, -1) === e.slice(0, -1))) return 1;
      const subj = w[i - 1];
      return subj && SUBJ_BE[subj] && SUBJ_BE[subj] !== w[i] ? 0 : 2;
    }
    // Round-3 fix: right auxiliary, verb without -ing (is study, are play) = attempted with one slip.
    for (let i = 0; i < w.length - 1; i++) {
      if (!BE.has(w[i])) continue;
      const v = w[i + 1] === 'not' ? w[i + 2] ?? '' : w[i + 1];
      if (REG.has(v) || REG.has(v.replace(/s$/, ''))) return 1;
    }
    return 0;
  }],
  [/going to/, ({ w }) => {
    const i = w.findIndex((x, k) => x === 'going' && w[k + 1] === 'to');
    if (i < 0 || !BE.has(w[i - 1] ?? '')) return 0;
    const v = w[i + 2];
    if (!v) return 0;
    return /(ed|ing)$/.test(v) || (/[^s]s$/.test(v) && v.length > 3) ? 1 : 2;
  }],
  [/he\/she\/it \+ verb-s/, ({ w, raw }) => {
    const orig = straightQuotes(raw).replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
    let ok = 0, slip = 0, bad = 0;
    for (let i = 0; i < w.length; i++) {
      const third = ['he', 'she', 'it'].includes(w[i]) || (w[i - 1] === 'my' && !/s$/.test(w[i])) || (i === 0 && /^[A-Z]/.test(orig[0] ?? '') && w[0] !== 'i' && w[0] !== 'my');
      if (!third) continue;
      let j = i + 1;
      if (FREQ.has(w[j])) j++;
      const v = w[j];
      // Round-6 fix: does/goes/has/is are right third-person forms; do/have/are after he/she/it (not in a question) are wrong.
      // "is" counts only as the copula (She is a teacher), not as an auxiliary (is play, is playing).
      // Round-7 fix: every verb joined to this clause (has ... and go) is checked, not only the first.
      const joined = joinedVerbs3sg(w, j + 1);
      ok += joined.ok; bad += joined.bad;
      if (v && IRREG_3SG.has(v) && !(v === 'is' && verbish(w[j + 1] ?? '') && !AUX.has(w[j + 1] ?? ''))) { ok++; continue; }
      if (v && BASE_3SG_WRONG.has(v) && !AUX.has(w[i - 1] ?? '')) { bad++; continue; }
      if (!v || BE.has(v) || AUX.has(v) || DET.has(v) || ['and', 'or', 'but', 'who', 'that', 'not', 'to', 'too', 'also'].includes(v)) continue;
      // Round-3 fix: every he/she/it clause is checked (right in one place, wrong in another = 1).
      if (/(ch|sh|x|ss)s$/.test(v) || v === 'gos' || v === 'dos' || /[^aeiou]ys$/.test(v)) slip++;
      else if (/es$/.test(v) && REG.has(v.slice(0, -2)) && !REG.has(v.slice(0, -1)) && !/(ch|sh|x|ss|s|z|o)$/.test(v.slice(0, -2))) slip++; // visites
      else if (/s$/.test(v)) ok++;
      else if (verbish(v)) bad++;
    }
    if (!ok) return slip ? 1 : 0;
    return slip || bad ? 1 : 2;
  }],
  [/adjective-er/, ({ s, w }) => {
    if ([...BAD_COMP].some((b) => ` ${s} `.includes(` ${b} `))) return 0;
    const t = w.indexOf('than');
    if (t < 1) return 0;
    const adj = w[t - 1];
    // Round-4 fix: "more" + short adjective (one syllable, or two ending in -y) = wrong form; more + -er = double comparative.
    if (w[t - 2] === 'more') return /er$/.test(adj) && adj.length > 4 ? 0 : shortAdj(adj) ? 0 : 2;
    if (IRREG_COMP.has(adj)) return 2;
    if (!/er$/.test(adj)) return 0;
    const base = adj.slice(0, -2);
    if (ADJ_DOUBLE.has(base) || /[^aeiou]yer$/.test(adj)) return 1;
    return 2;
  }],
  [/can i have|i would like/, ({ s }) => {
    const form = /\b(can i have|could i have|may i have|i would like)\b/.test(s);
    if (!form) return 0;
    return /\bplease\b/.test(s) ? 2 : 1;
  }],
  [/at \+ time/, ({ w }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      const p = w[i], n = w[i + 1] === 'the' ? w[i + 2] ?? '' : w[i + 1];
      const kind = PREP_TIME.at.test(n) ? 'at' : PREP_TIME.on.has(n) || /^\d+(st|nd|rd|th)?$/.test(n) && DAYS_MONTHS.has(w[i + 2] ?? '') ? 'on' : PREP_TIME.in.has(n) ? 'in' : null;
      if (!kind || !['at', 'on', 'in'].includes(p)) continue;
      if (p === kind) ok++; else bad++;
    }
    if (!ok) return 0;
    return bad ? 1 : 2;
  }],
  [/a \/ an \+/, ({ w }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      if (w[i] !== 'a' && w[i] !== 'an') continue;
      const n = w[i + 1];
      const vowel = /^(hour|honest|honou?r|heir)/.test(n) || (/^[aeiou]/.test(n) && !/^(uni|use|usu|euro|one|once|ewe)/.test(n));
      if ((w[i] === 'an') === vowel) ok++; else bad++;
    }
    if (!ok) return 0;
    return bad ? 1 : 2;
  }],
  [/^some \(positive/, ({ w, s, raw }) => {
    // Round-4 fix: the question mark is read from the raw answer (normalisation removes it); a yes/no question opening
    // with do/does/did/have/has/is/are counts too. Offers and requests (would/could/can/may ...) keep "some".
    const question = /\?\s*$/.test(raw) || /^(do|does|did|have|has|is|are|was|were) /.test(s);
    const neg = /\bnot\b|\bno\b|\bnever\b/.test(s) || question;
    if (w.includes('some')) return neg && !/^(would|can|could|may|shall) /.test(s) ? 0 : 2;
    if (w.includes('any')) return neg || /^(do|does|did|have|has|is|are) /.test(s) ? 2 : 0;
    return 0;
  }],
  [/much \+ uncountable/, ({ w }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      const n = w[i + 1];
      if (w[i] === 'much') (UNCOUNT.has(n) || !/s$/.test(n) ? ok++ : bad++);
      if (w[i] === 'many') ((/s$|people|children|men|women/.test(n) || IRREG_PL.has(n)) && !UNCOUNT.has(n) ? ok++ : bad++);
    }
    if (!ok) return 0;
    return bad ? 1 : 2;
  }],
  [/before the main verb/, ({ w }) => {
    const i = w.findIndex((x) => FREQ.has(x));
    if (i < 0) return 0;
    if (i === w.length - 1) return 0;
    // Round-3 fix: "don't never" (double negative) = the adverb attempted with one slip.
    if (w[i] === 'never' && (w[i - 1] === 'not' || w[i - 1] === 'no')) return 1;
    if (BE.has(w[i - 1] ?? '') || ['was', 'were'].includes(w[i - 1] ?? '')) return 2;
    if (i === 0 || BE.has(w[i + 1] ?? '')) return 0;
    // Round-4 fix: after an auxiliary (can, do not, will) is right; after a main verb ("I read sometimes stories") is wrong.
    const prev = w[i - 1] ?? '';
    if (!AUX.has(prev) && prev !== 'not' && !PRON.has(prev) && i > 1 && verbish(prev) && !DET.has(w[i - 2] ?? '') && (PRON.has(w[i - 2] ?? '') || w[i - 2] === 'not' || AUX.has(w[i - 2] ?? ''))) return 0;
    return 2;
  }],
  [/possessive adjective/, possessives],
  [/^the \+ noun/, ({ w }) => (w.includes('the') ? 2 : 0)],
  [/and \/ but \/ because/, ({ w }) => {
    const CONJ = ['and', 'but', 'because'];
    const i = w.findIndex((x) => CONJ.includes(x));
    if (i <= 0 || i >= w.length - 1) {
      // Round-3 fix: a misspelt conjunction joining two clauses (becuse, bcause) is a slip.
      const j = w.findIndex((x, k) => k > 0 && k < w.length - 1 && nearMiss(x, 'because'));
      return j > 0 && w.slice(j + 1).some(verbish) ? 1 : 0;
    }
    // Round-3 fix: the conjunction must join two clauses; "but not the money" (no verb after it) is 1.
    return w.slice(i + 1).some(verbish) && w[i + 1] !== 'not' ? 2 : 1;
  }],
  [/make vs do/, ({ w, item }) => {
    // Round-3 fix: the verb-noun pair is checked against the make/do collocations (and the item's accepted examples).
    const make = new Set(MAKE_N), dov = new Set(DO_N);
    for (const k of acceptedKeys(item)) {
      const t = tokens(normaliseV2(k));
      collocations(t).forEach(([verb, noun]) => (verb === 'make' ? make : dov).add(noun));
    }
    let ok = 0, bad = 0, seen = 0;
    for (const [verb, noun] of collocations(w)) {
      seen++;
      const right = verb === 'make' ? make : dov, wrong = verb === 'make' ? dov : make;
      if (right.has(noun)) ok++;
      else if (wrong.has(noun)) bad++;
    }
    if (!seen) return 0;
    if (bad) return ok ? 1 : 0;
    return 2;
  }],
  [/subject \+ verb \+ object/, wordOrder],
  [/^clock time/, clockTime],
  [/capital at sentence start/, ({ raw }) => {
    const t = straightQuotes(raw).trim();
    let faults = 0;
    if (!/^[A-Z]/.test(t)) faults++;
    if (/(^|\s)i(\s|$|')/.test(t)) faults++;
    if (!/[.!?]$/.test(t)) faults++;
    // Round-3 fix: titles before a name (Mr, Mrs, Ms, Dr) need a capital.
    if (/(^|\s)(mr|mrs|ms|miss|dr)\.?\s+[A-Z]/.test(t)) faults++;
    return faults === 0 ? 2 : faults === 1 ? 1 : 0;
  }],
];

function vocabScore(c: Ctx): TFScore | null {
  const tf = String(c.item.targetForm ?? '').toLowerCase();
  const lex = LEX.find(([re]) => re.test(tf))?.[1] ?? [];
  const literal = /^[a-z]+(\s*\/\s*[a-z]+)*$/.test(tf) ? tf.split('/').map((x) => x.trim()) : [];
  const accepted = acceptedKeys(c.item).filter((k) => !/\s.*\s/.test(k.trim())).map((k) => k.toLowerCase().replace(/[^\p{L}\s'-]/gu, '').trim());
  const keys = [...new Set([...lex, ...literal, ...accepted])].filter(Boolean);
  if (!keys.length) return null;
  const joined = ` ${c.w.join(' ')} `;
  const hit = keys.find((k) => joined.includes(` ${normaliseV2(k)} `));
  if (hit) {
    if (DAYS_MONTHS.has(hit)) return new RegExp(`\\b${hit[0].toUpperCase()}${hit.slice(1)}\\b`).test(c.raw) ? 2 : 1;
    return 2;
  }
  // Round-4 fix: a 3-letter target word misspelt by a doubled letter or a swap (wett, hott, wte) is a slip too.
  const shortSlip = (x: string, k: string) => k.length === 3 && x !== k && (x === k.replace(/(.)$/, '$1$1') || x === k.replace(/^(.)(.)/, '$1$2$2') || (x.length === 3 && lev(x, k) === 1 && [...x].sort().join('') === [...k].sort().join('')));
  return c.w.some((x) => keys.some((k) => !k.includes(' ') && (nearMiss(x, k) || shortSlip(x, k)))) ? 1 : 0;
}

const DONT_KNOW = /^(i (do not|dont) know|idk|no idea|not sure|\?+)$/;

/** Fix 4. 0/1/2 for the target form only; null = the item's form is not covered (caller keeps its current path). */
export function scoreTargetForm(item: TargetFormItem, answer: string | undefined | null): TFScore | null {
  const tf = String(item.targetForm ?? '').toLowerCase();
  const raw = String(answer ?? '').trim();
  const s = normaliseV2(raw);
  if (!s || DONT_KNOW.test(s)) return 0;
  const promptQuote = /'([^']{6,})'/.exec(String(item.prompt ?? ''))?.[1];
  if (promptQuote && normaliseV2(promptQuote) === s) return 0;
  const c: Ctx = { item, raw, w: tokens(s), s };
  // Round-3 fix: where the item asks for a sentence, a short answer with no verb ("My cousin.") is not one = 0.
  if (/\bsentence\b/i.test(String(item.prompt ?? item.text ?? '')) && c.w.length <= 4 && !c.w.some(verbish)) return 0;
  const sens = sensitivityOf(item);
  const rule = GRAMMAR.find(([re]) => re.test(tf));
  if (!rule && sens !== 'case_punct' && acceptedKeys(item).some((k) => k.includes(' ') && normaliseV2(k, sens) === normaliseV2(raw, sens))) return 2;
  if (rule) return rule[1](c);
  return vocabScore(c);
}

/**
 * Round-3 fix (guard extension), extended for production safety (round 5): an exact item whose target is
 * the written word itself. Decided from item data only:
 *   - an outcome/objective id with "-VO-" (vocabulary): the item id, objectiveIds, or rubric criterion
 *     objectiveIds (so a question with an objective id but no bank item is covered);
 *   - a case-/spelling-sensitive matchingNote (capitals-full-stops, days-months);
 *   - a single-word targetForm equal to a key.
 * Open responses (rubric) and 0/1/2 target-form items are never "word is the target".
 * With graderV2 ON these items skip the eval-v2 meaning check (needsAiEvaluation false, evaluateShortAnswer
 * makes no model call). Model path (eval-v2 meaning check and rubric): NOT VALIDATED until run with the API.
 */
export function spellingIsTarget(item: TargetFormItem & { objectiveIds?: string[] }): boolean {
  if (item.scoring === 'target_form_0_1_2') return false;
  if (item.type === 'open-response' || item.type === 'transfer' || item.type === 'free_production') return false;
  if (sensitivityOf(item) !== 'none') return true;
  if (/spelling-sensitive|spelling is (the target|scored)|capitals-full-stops|days-months/i.test(`${item.matchingNote ?? ''}`)) return true;
  const rubricIds = ((item.rubric as { criteria?: { objectiveIds?: string[] }[] } | undefined)?.criteria ?? []).flatMap((c) => c.objectiveIds ?? []);
  if ([item.id ?? '', ...(item.objectiveIds ?? []), ...rubricIds].some((x) => /-VO-/.test(x))) return true;
  const keys = acceptedKeys(item);
  if (!keys.length) return false;
  const tf = String(item.targetForm ?? '').trim().toLowerCase();
  return /^[\p{L}'-]+$/u.test(tf) && keys.some((k) => k.trim().toLowerCase() === tf);
}

/** Fix 5. true = the item requires a target form and the answer does not show it; null = cannot tell. */
export function targetFormMissing(item: TargetFormItem, answer: string): boolean | null {
  // Round-4 fix: an answer that matches the key after normalisation (theres, I'm reading, target-only correction) shows the form.
  if (matchKeyV2(item, answer)) return false;
  // Round-3 fix: when the written form is the target, only the key match shows it (no credit for "carot", lowercase "thursday").
  if (spellingIsTarget(item)) return !matchKeyV2(item, answer);
  const forms = (item.targetForms ?? []).map((f) => normaliseV2(f)).filter(Boolean);
  if (forms.length) {
    const a = ` ${normaliseV2(answer)} `;
    return !forms.some((f) => a.includes(` ${f} `));
  }
  if (!item.targetForm) return null;
  const s = scoreTargetForm(item, answer);
  return s === null ? null : s === 0;
}

/** Points for a target-form item (0/1/2 scaled to the question's maximum); null = not decided. */
export function targetFormPoints(item: TargetFormItem, answer: string, maxPoints: number): number | null {
  if (item.scoring !== 'target_form_0_1_2') return null;
  const s = scoreTargetForm(item, answer);
  return s === null ? null : (s / 2) * maxPoints;
}
