// Which language the student wants, from what they said. Ported from the
// Enara avatar adapter: an explicit request wins, then Arabic script, then
// Franco-Arabic / dialect / greeting words typed or transcribed in Latin letters.

export type AvatarLanguage = 'english' | 'arabic';

const ARABIC_SWITCH_PHRASES = [
  'in arabic', 'respond in arabic', 'answer in arabic', 'explain in arabic', 'speak arabic',
  'switch to arabic', 'use arabic', 'باللغة العربية', 'بالعربي', 'بالعربية', 'كلمني عربي',
  'رد بالعربي', 'تكلم عربي',
];

const ENGLISH_SWITCH_PHRASES = [
  'in english', 'respond in english', 'answer in english', 'explain in english', 'speak english',
  'switch to english', 'use english', 'بالانجليزي', 'بالإنجليزية', 'كلمني انجليزي', 'رد بالانجليزي',
];

const FRANCO_NUMBER_CONTEXT =
  /\b(ya3ni|ya3ny|3ayiz|3arif|3andi|3alshan|ba3d|b3d|2ana|2enta|7aga|7abibi|sa7|msh|knt|m3|3l|3n)\b/i;

const ARABIC_DIALECT_WORDS = new Set([
  'ya3ni', 'ya3ny', 'ezay', 'leih', 'leh', 'mafish', 'mafesh', 'yalla', 'khalas', 'delwa2ty',
  'ba3dein', 'b3deen', '3alshan', '3shan', '3andi', '3ndi', '3ayiz', 'mumkin', 'momken', 'lazim',
  'mesh', 'msh', 'keda', 'zay', 'meen', 'fein', 'tamam', 'tayeb', 'howa', 'hiya', 'ihna', '7aga',
  'awy', 'ana', 'enta', 'enti', 'bas', 'law', 'wala', 'ma3lesh', 'shu', 'shou', 'kif', 'wein',
  'wayn', 'baddi', 'baddak', 'halla2', 'ktir', 'shlon', 'shlonk', 'laish', 'abee', 'abi', 'agdar',
  'zain', 'esh', 'wayed', 'wach', 'bghit', 'kifash', 'wakha', 'mzyan', 'bzzaf', 'daba', 'makaynsh',
]);

const PHONETIC_PATTERNS = [
  /\binsh[ae]ll?[ae]h\b/i,
  /\bwall?[ae]h\b/i,
  /\bhab[ie]b[it]?[ia]?\b/i,
  /\b(marh?aba|ahlan|salam)\b/i,
  /\b(shukran|shoukran)\b/i,
  /\b(aiwa|aywa)\b/i,
  /\bmumk[iy]n\b/i,
];

export function detectLanguage(text: string): { language: AvatarLanguage; source: string } {
  const lower = text.toLowerCase().trim();
  if (!lower) return { language: 'english', source: 'empty' };

  const arabicPhrase = ARABIC_SWITCH_PHRASES.find((p) => lower.includes(p));
  if (arabicPhrase) return { language: 'arabic', source: 'explicit' };
  const englishPhrase = ENGLISH_SWITCH_PHRASES.find((p) => lower.includes(p));
  if (englishPhrase) return { language: 'english', source: 'explicit' };

  const arabicChars = (text.match(/[؀-ۿ]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars && arabicChars / totalChars > 0.1) return { language: 'arabic', source: 'arabic_script' };

  if (FRANCO_NUMBER_CONTEXT.test(lower)) return { language: 'arabic', source: 'franco_arabic' };
  const words = lower.match(/[^\s.,!?;:]+/g) || [];
  if (words.some((w) => ARABIC_DIALECT_WORDS.has(w))) return { language: 'arabic', source: 'dialect_words' };
  if (PHONETIC_PATTERNS.some((p) => p.test(lower))) return { language: 'arabic', source: 'phonetic' };

  return { language: 'english', source: 'default' };
}

// The voice to switch to after this turn, or null to keep the current one.
// An English-voice call only hears English well, so weak Arabic signals count
// there; an Arabic-voice call switches back only on a clear English turn.
export function detectLanguageSwitch(text: string, current: AvatarLanguage): AvatarLanguage | null {
  const { language, source } = detectLanguage(text);
  if (language === current) return null;
  if (language === 'english') {
    const latinWords = (text.match(/[A-Za-z]{2,}/g) || []).length;
    return source === 'explicit' || latinWords >= 3 ? 'english' : null;
  }
  return 'arabic';
}
