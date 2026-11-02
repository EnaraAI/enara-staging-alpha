// Text normalisation for keyword search in English and Arabic.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'be', 'it', 'this', 'that', 'with', 'as', 'by', 'at',
  'from', 'what', 'how', 'why', 'do', 'does', 'i', 'you', 'me', 'my', 'we', 'can', 'please', 'explain', 'tell', 'about',
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'ما', 'ماذا', 'كيف', 'هل', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'و', 'او', 'أو', 'ثم', 'مع', 'كل',
]);

export function normaliseArabic(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '') // diacritics, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// Version of the terms searchTerms produces. Passages stored with an older
// version are re-tokenised from their text before they are searched.
// 2: clock times become one term ("8:00 A.M." and "8 am" -> t0800, "6:00 P.M." -> t1800).
export const TERMS_VERSION = 2;

// "8:00 A.M.", "8 am", "6.30 p.m." and plain "14:05". Before v2 these split
// into "00"/"30" and dropped digits, so a question about a time could never
// match the passage that states it.
const CLOCK_MERIDIEM = /(?<![\p{L}\p{N}])(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b\.?/giu;
const CLOCK_24H = /(?<![\p{L}\p{N}:.])(\d{1,2}):(\d{2})(?![\p{N}]|:\d)/gu;
const pad = (n: number) => String(n).padStart(2, '0');
function clockTerms(text: string) {
  return text
    .replace(CLOCK_MERIDIEM, (m, h: string, mm: string | undefined, ap: string) => {
      const hour = Number(h), min = Number(mm ?? '0');
      if (hour < 1 || hour > 12 || min > 59) return m;
      return ` t${pad((hour % 12) + (ap.toLowerCase() === 'p' ? 12 : 0))}${pad(min)} `;
    })
    .replace(CLOCK_24H, (m, h: string, mm: string) => (Number(h) > 23 || Number(mm) > 59 ? m : ` t${pad(Number(h))}${mm} `));
}

export function searchTerms(text: string): string[] {
  const tokens = clockTerms(normaliseArabic(text.toLowerCase())).split(/[^\p{L}\p{N}]+/u);
  return tokens
    .map((t) => (t.startsWith('ال') && t.length > 4 ? t.slice(2) : t)) // Arabic definite article
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
