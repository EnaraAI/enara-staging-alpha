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
    .replace(/\b(it|that|there|here|what|where|who|how)'s\b/gi, '$1 is')
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
  if (!isChoice(item)) return false;
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
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
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
const DOUBLE = new Set(['sit', 'run', 'swim', 'get', 'put', 'stop', 'shop', 'plan', 'begin', 'cut', 'hit', 'jog', 'travel']);
const EDROP = new Set(['write', 'make', 'take', 'come', 'have', 'ride', 'dance', 'drive', 'leave', 'live', 'smile', 'use']);
const ADJ_DOUBLE = new Set(['big', 'hot', 'fat', 'thin', 'wet', 'sad']);
const IRREG_COMP = new Set(['better', 'worse', 'further', 'farther']);
const BAD_COMP = new Set(['gooder', 'badder', 'more better', 'more bigger']);
const PREP_TIME = { at: /^(\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight|night|oclock|half|quarter)/, on: new Set([...DAYS_MONTHS].slice(0, 7).concat(['weekend', 'friday', 'birthday', 'monday'])), in: new Set([...DAYS_MONTHS].slice(7).concat(['summer', 'winter', 'spring', 'autumn', 'morning', 'afternoon', 'evening', 'december'])) } as const;

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

// Score of a grammar form, per docs/SCORING_RUBRIC.md; null = form not handled here.
const GRAMMAR: [RegExp, (c: Ctx) => TFScore][] = [
  [/there is/, ({ w }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      if (w[i] !== 'there' || !BE.has(w[i + 1])) { if (/^(ther|thier|their)$/.test(w[i]) && BE.has(w[i + 1])) bad += 0.5; continue; }
      const next = w[i + 2] ?? '';
      const plural = NUMS.has(next) || (/s$/.test(w[i + 3] ?? next) && !['a', 'an', 'one'].includes(next) && !UNCOUNT.has(w[i + 3] ?? next));
      if ((w[i + 1] === 'is' && plural && NUMS.has(next)) || (w[i + 1] === 'are' && ['a', 'an', 'one'].includes(next))) bad += 1; else ok += 1;
    }
    if (!ok) return bad === 0.5 ? 1 : 0;
    return bad ? 1 : 2;
  }],
  [/am \/ is \/ are after|^am \/ is \/ are/, ({ w }) => {
    const i = w.findIndex((x) => BE.has(x) || x === 'be');
    if (i < 0) return 0;
    const subj = w[i - 1];
    if (subj && SUBJ_BE[subj] && SUBJ_BE[subj] !== w[i]) return 0;
    if (w[i] === 'be') return 0;
    if (subj && /s$/.test(subj) && !['is', 'his', 'this', 'bus'].includes(subj) && w[i] === 'is' && w[i - 2] !== 'my') return 1;
    return 2;
  }],
  [/can \/ can't/, ({ w, raw }) => {
    if (/\bcann'?t\b|\bcann\b|\bcanot\b/i.test(raw)) return 1;
    const i = w.indexOf('can');
    if (i < 0) return 0;
    const v = w[i + 1] === 'not' ? w[i + 2] : w[i + 1];
    if (!v || v === 'to' || (/[^s]s$/.test(v) && v.length > 3 && !['is', 'was', 'dress', 'swims'].includes(v))) return 0;
    return 2;
  }],
  [/regular verb \+ -ed/, ({ w }) => {
    if (w.some((x) => OVERREG.has(x))) return 0;
    if (w.some((x) => /[^aeiou]yed$/.test(x) && x.length > 4)) return 1;
    return w.some((x) => /[a-z]{2,}ed$/.test(x) && !['need', 'feed', 'bed', 'red', 'shed', 'seed', 'speed'].includes(x)) ? 2 : 0;
  }],
  [/irregular past/, ({ w }) => {
    if (w.some((x) => OVERREG.has(x))) return 0;
    if (w.some((x) => [...PASTS].some((p) => x === `${p}ed` || x === `${p}d`))) return 1;
    return w.some((x) => PASTS.has(x) && x !== 'read' && x !== 'put' && x !== 'cut') ? 2 : 0;
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
    for (let i = 0; i < w.length; i++) {
      const third = ['he', 'she', 'it'].includes(w[i]) || (w[i - 1] === 'my' && !/s$/.test(w[i])) || (i === 0 && /^[A-Z]/.test(orig[0] ?? '') && w[0] !== 'i' && w[0] !== 'my');
      if (!third) continue;
      let j = i + 1;
      if (FREQ.has(w[j])) j++;
      const v = w[j];
      if (!v || BE.has(v) || v === 'can') continue;
      if (/(ch|sh|x|ss)s$/.test(v) || v === 'gos' || v === 'dos') return 1;
      if (/s$/.test(v)) return 2;
      return 0;
    }
    return 0;
  }],
  [/adjective-er/, ({ s, w }) => {
    if ([...BAD_COMP].some((b) => ` ${s} `.includes(` ${b} `))) return 0;
    const t = w.indexOf('than');
    if (t < 1) return 0;
    const adj = w[t - 1];
    if (w[t - 2] === 'more') return 2;
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
  [/^some \(positive/, ({ w, s }) => {
    const neg = /\bnot\b|\bno\b|\bnever\b/.test(s) || /\?$/.test(s);
    if (w.includes('some')) return neg && !/^(would|can|could) /.test(s) ? 0 : 2;
    if (w.includes('any')) return neg || /^(do|does|did|have|has|is|are) /.test(s) ? 2 : 0;
    return 0;
  }],
  [/much \+ uncountable/, ({ w }) => {
    let ok = 0, bad = 0;
    for (let i = 0; i < w.length - 1; i++) {
      const n = w[i + 1];
      if (w[i] === 'much') (UNCOUNT.has(n) || !/s$/.test(n) ? ok++ : bad++);
      if (w[i] === 'many') (/s$|people|children|men|women/.test(n) && !UNCOUNT.has(n) ? ok++ : bad++);
    }
    if (!ok) return 0;
    return bad ? 1 : 2;
  }],
  [/before the main verb/, ({ w }) => {
    const i = w.findIndex((x) => FREQ.has(x));
    if (i < 0) return 0;
    if (i === w.length - 1) return 0;
    if (BE.has(w[i - 1] ?? '') || ['was', 'were'].includes(w[i - 1] ?? '')) return 2;
    if (i === 0 || BE.has(w[i + 1] ?? '')) return 0;
    return 2;
  }],
  [/possessive adjective/, ({ w }) => (w.some((x) => ['his', 'her', 'our', 'their', 'my', 'your', 'its'].includes(x)) ? 2 : 0)],
  [/^the \+ noun/, ({ w }) => (w.includes('the') ? 2 : 0)],
  [/and \/ but \/ because/, ({ w }) => {
    const i = w.findIndex((x) => ['and', 'but', 'because'].includes(x));
    return i > 0 && i < w.length - 1 ? 2 : 0;
  }],
  [/make vs do/, ({ w }) => (w.some((x) => /^(make|makes|made|making|do|does|did|doing)$/.test(x)) ? 2 : 0)],
  [/capital at sentence start/, ({ raw }) => {
    const t = straightQuotes(raw).trim();
    let faults = 0;
    if (!/^[A-Z]/.test(t)) faults++;
    if (/(^|\s)i(\s|$|')/.test(t)) faults++;
    if (!/[.!?]$/.test(t)) faults++;
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
  return c.w.some((x) => keys.some((k) => !k.includes(' ') && nearMiss(x, k))) ? 1 : 0;
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
  const sens = sensitivityOf(item);
  const rule = GRAMMAR.find(([re]) => re.test(tf));
  if (!rule && sens !== 'case_punct' && acceptedKeys(item).some((k) => k.includes(' ') && normaliseV2(k, sens) === normaliseV2(raw, sens))) return 2;
  if (rule) return rule[1](c);
  return vocabScore(c);
}

/** Fix 5. true = the item requires a target form and the answer does not show it; null = cannot tell. */
export function targetFormMissing(item: TargetFormItem, answer: string): boolean | null {
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
