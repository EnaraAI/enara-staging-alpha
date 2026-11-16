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
    // Round-3 fix: every be form is checked against its subject, including plural and "X and Y" subjects.
    let ok = 0, bad = 0, seenBe = false;
    for (let i = 0; i < w.length; i++) {
      if (!BE.has(w[i]) && w[i] !== 'be') continue;
      const subj = w[i - 1];
      const compound = !seenBe && w.slice(0, i).includes('and');
      seenBe = true;
      if (w[i] === 'be') { bad++; continue; }
      if (subj && SUBJ_BE[subj]) { if (SUBJ_BE[subj] === w[i]) ok++; else bad++; continue; }
      const plural = compound || (subj && /[^s']s$/.test(subj) && !['his', 'this', 'bus', 'news', 'maths', 'physics', 'class', 'glass'].includes(subj));
      if (plural && w[i] !== 'are') bad++;
      else if (!plural && subj && !compound && w[i] === 'are' && w[i - 2] !== undefined && ['a', 'an', 'my', 'the', 'his', 'her', 'this'].includes(w[i - 2]) && !/s$/.test(subj)) bad++;
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
    if (w.some((x) => OVERREG.has(x))) return 0;
    // Round-3 fix: every past form is checked; a recognisable -ed with one spelling slip is 1.
    let ok = 0, slip = 0;
    for (const x of w) {
      if (/[^aeiou]yed$/.test(x) && x.length > 4) slip++; // studyed
      else if (/[aeiou]{2}([b-df-hj-np-tv-z])\1ed$/.test(x)) slip++; // cleanned: no doubling after two vowels
      else if ([...DOUBLE_REG].some((d) => x === `${d}ed`)) slip++; // stoped
      else if (/d$/.test(x) && !/ed$/.test(x) && REG.has(x.slice(0, -1)) && !/e$/.test(x.slice(0, -1))) slip++; // watchd
      else if (/[a-z]{2,}ed$/.test(x) && !['need', 'feed', 'bed', 'red', 'shed', 'seed', 'speed'].includes(x)) ok++;
    }
    if (!ok) return slip ? 1 : 0;
    return slip ? 1 : 2;
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
    // Round-3 fix: "don't never" (double negative) = the adverb attempted with one slip.
    if (w[i] === 'never' && (w[i - 1] === 'not' || w[i - 1] === 'no')) return 1;
    if (BE.has(w[i - 1] ?? '') || ['was', 'were'].includes(w[i - 1] ?? '')) return 2;
    if (i === 0 || BE.has(w[i + 1] ?? '')) return 0;
    return 2;
  }],
  [/possessive adjective/, ({ w }) => (w.some((x) => ['his', 'her', 'our', 'their', 'my', 'your', 'its'].includes(x)) ? 2 : 0)],
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
  // Round-3 fix: where the item asks for a sentence, a short answer with no verb ("My cousin.") is not one = 0.
  if (/\bsentence\b/i.test(String(item.prompt ?? item.text ?? '')) && c.w.length <= 4 && !c.w.some(verbish)) return 0;
  const sens = sensitivityOf(item);
  const rule = GRAMMAR.find(([re]) => re.test(tf));
  if (!rule && sens !== 'case_punct' && acceptedKeys(item).some((k) => k.includes(' ') && normaliseV2(k, sens) === normaliseV2(raw, sens))) return 2;
  if (rule) return rule[1](c);
  return vocabScore(c);
}

/**
 * Round-3 fix (guard extension): an exact item whose target is the written form itself — case- or
 * spelling-sensitive matchingNote (capitals, days/months) or a vocabulary item keyed by single words.
 */
export function spellingIsTarget(item: TargetFormItem & { objectiveIds?: string[] }): boolean {
  if (item.scoring === 'target_form_0_1_2') return false;
  if (sensitivityOf(item) !== 'none') return true;
  if (/spelling-sensitive|spelling is (the target|scored)/i.test(`${item.matchingNote ?? ''}`)) return true;
  const keys = acceptedKeys(item);
  if (!keys.length) return false;
  const single = keys.every((k) => /^[\p{L}'-]+$/u.test(k.trim()));
  const vocab = [item.id ?? '', ...(item.objectiveIds ?? [])].some((x) => /-VO-/.test(x));
  const tfWord = /^[\p{L}'-]+$/u.test(String(item.targetForm ?? '').trim()) && keys.some((k) => k.trim().toLowerCase() === String(item.targetForm).trim().toLowerCase());
  return single && (vocab || tfWord);
}

/** Fix 5. true = the item requires a target form and the answer does not show it; null = cannot tell. */
export function targetFormMissing(item: TargetFormItem, answer: string): boolean | null {
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
