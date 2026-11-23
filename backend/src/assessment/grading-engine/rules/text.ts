// Rules-first grading (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.1): text helpers for the rules. Pure, no I/O.
// Every comparison runs on folded text: Western digits, lower case, English contractions expanded (graderV2), Arabic folded with
// ar.ts (tashkeel, alef forms, ى, ة → ه, hamza seats), so "مَدْرَسَةٌ" and "مدرسه" compare equal. Evidence shown to people is
// always the learner's own words (the sentence as written), never the folded form.
import { foldArabic, westernDigits } from '../../text/ar';
import { expandContractionsV2 } from '../../../services/graderV2';

export const fold = (s: string): string => foldArabic(expandContractionsV2(westernDigits(String(s ?? '')).normalize('NFC')).toLowerCase());

const f = (words: string) => new Set(words.split(/\s+/).filter(Boolean).map(fold));
// Function words: never keywords. Negations, "or" and comparatives are NOT here: they change the meaning (see index.ts).
export const STOP = f(`a an the of in on at to for by with from into onto and is are was were be been being am it its this that these those
  which who whom whose what when where why how as so such their there they them he she his her hers we our you your i my me us also very
  can could will would shall should may might must do does did has have had just then than about because
  o s if each every some any both either one's own per
  في من الي علي عن ان هذا هذه ذلك تلك هولاء التي الذي الذين اللذان اللتان هو هي هم هما نحن انا انت قد كان كانت يكون تكون كل بين عند مع
  كما اي اذا لان حتي ايضا ثم خلال حيث لكي كي التي فيه فيها منه منها به بها له لها عليه عليها اليه اليها هناك هنا`);
export const NEGATION = f('no not never without none nothing nor neither لا لم لن ليس ليست ليسوا غير بدون دون ما مش مفيش ولا ولم');
export const OR = f('or او ام');
// Answers that carry a number, day or month the point does not have are not certain (listening and source questions: a misheard
// time or date contradicts the source even when every key word is there).
export const FACT_WORDS = f(`zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
  eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million half quarter first second third fourth
  fifth sixth seventh eighth ninth tenth monday tuesday wednesday thursday friday saturday sunday january february march april june july
  august september october november december
  صفر واحد واحده اثنان اثنين اثنتان ثلاث ثلاثه اربع اربعه خمس خمسه ست سته سبع سبعه ثمان ثماني ثمانيه تسع تسعه عشر عشره عشرون عشرين
  ثلاثون ثلاثين اربعون اربعين خمسون خمسين ستون ستين سبعون سبعين ثمانون ثمانين تسعون تسعين مائه مئه الف مليون نصف ربع ثلث الاول الثاني
  الثالث الرابع الخامس السبت الاحد الاثنين الثلاثاء الاربعاء الخميس الجمعه يناير فبراير مارس ابريل مايو يونيو يوليو اغسطس سبتمبر
  اكتوبر نوفمبر ديسمبر`);
// Opposites: a point's key words next to the opposite of one of them (in the same stretch of words) are not certain.
const OPPOSITES: [string, string][] = [
  ['physical', 'chemical'], ['sink', 'float'], ['greater', 'less'], ['greater', 'smaller'], ['more', 'less'], ['more', 'fewer'],
  ['bigger', 'smaller'], ['larger', 'smaller'], ['increase', 'decrease'], ['rise', 'fall'], ['faster', 'slower'], ['higher', 'lower'],
  ['hot', 'cold'], ['warm', 'cold'], ['good', 'poor'], ['good', 'bad'], ['north', 'south'], ['east', 'west'], ['day', 'night'],
  ['before', 'after'], ['inside', 'outside'], ['absorb', 'release'], ['gain', 'lose'], ['dominant', 'recessive'], ['conductor', 'insulator'],
  ['فيزيايي', 'كيميايي'], ['يغوص', 'يطفو'], ['اكبر', 'اصغر'], ['اكثر', 'اقل'], ['يزيد', 'يقل'], ['زياده', 'نقص'], ['ارتفاع', 'انخفاض'],
  ['حار', 'بارد'], ['شمال', 'جنوب'], ['شرق', 'غرب'], ['نهار', 'ليل'], ['سايده', 'متنحيه'], ['سايد', 'متنحي'], ['موصل', 'عازل'],
  ['اسرع', 'ابطا'], ['اعلي', 'ادني'], ['قبل', 'بعد'],
];

export interface Token { raw: string; norm: string; keys: string[] }

const AR_LETTER = /[ء-ي]/;
/** Light Arabic stem: the article and its prepositions, one conjunction, a few plural and pronoun endings, final ه (ة). */
function stemAr(t: string): string {
  let s = t;
  if (/^[وف]/.test(s) && s.length > 4) s = s.slice(1);
  const art = /^(?:[بكل]?ال|لل)/.exec(s);
  if (art && s.length - art[0].length >= 2) s = s.slice(art[0].length);
  const end = /(?:هما|ها|هم|ات|ون|ين)$/.exec(s);
  if (end && s.length - end[0].length >= 3) s = s.slice(0, -end[0].length);
  if (s.endsWith('ه') && s.length >= 4) s = s.slice(0, -1);
  return s;
}
/** Light English stem (both sides get the same one, so forms of one word meet: forms / formed / forming → form). */
function stemEn(t: string): string {
  let s = t;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(?:ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
/** The forms a word may be compared by: its stem, and (Arabic) its stem without a one-letter prefix (و ف ب ل ك). */
export function keysOf(norm: string): string[] {
  if (/^\d/.test(norm) || norm.length < 2 && !AR_LETTER.test(norm)) return [norm];
  if (!AR_LETTER.test(norm)) return [stemEn(norm)];
  const k = [stemAr(norm)];
  if (/^[وفبلك]/.test(norm) && norm.length >= 4) k.push(stemAr(norm.slice(1)));
  return [...new Set(k)];
}
export const sameWord = (a: Token, b: Token): boolean => a.keys.some((k) => b.keys.includes(k));

// Operators are words of a formula: "mass ÷ volume" is not "mass × volume".
const OPS: [RegExp, string][] = [[/÷|(?<=\s|^|[\p{L}\d])\/(?=\s|[\p{L}\d])|\bdivided by\b|مقسوم[ةه]? علي/gu, ' ÷ '], [/×|\*|\bmultiplied by\b/gu, ' × ']];

/** Words, numbers and the two operators of a text, folded. */
export function tokens(text: string): Token[] {
  let s = fold(text);
  for (const [re, op] of OPS) s = s.replace(re, op);
  return [...s.matchAll(/\p{L}+|\d+(?:\.\d+)?|[÷×]/gu)].map((m) => ({ raw: m[0], norm: m[0], keys: keysOf(m[0]) }));
}
export const isStop = (t: Token) => STOP.has(t.norm);
export const isNegation = (t: Token) => NEGATION.has(t.norm);
export const isOr = (t: Token) => OR.has(t.norm);
export const isFact = (t: Token) => /^\d/.test(t.norm) || FACT_WORDS.has(t.norm) || t.keys.some((k) => FACT_WORDS.has(k));
const OPP = OPPOSITES.map(([a, b]) => [keysOf(fold(a)), keysOf(fold(b))] as const);
/** The opposites of a word (by stem). */
export function oppositesOf(t: Token): string[] {
  const out: string[] = [];
  for (const [a, b] of OPP) {
    if (t.keys.some((k) => a.includes(k))) out.push(...b);
    if (t.keys.some((k) => b.includes(k))) out.push(...a);
  }
  return out;
}

/** Sentences as written (a '.' between digits is a decimal mark, not an end). */
export function sentences(text: string): string[] {
  return String(text ?? '').split(/(?<!\d)[.!?؟;؛\n]+|[.!?؟;؛\n]+(?!\d)/).map((s) => s.trim()).filter((s) => /[\p{L}\d]/u.test(s));
}

export const LATIN = /[A-Za-z]/;
export const ARABIC = /[ء-ي]/;
export const letterWords = (text: string, re: RegExp): number => (String(text).match(/[\p{L}]{2,}/gu) ?? []).filter((w) => re.test(w)).length;
