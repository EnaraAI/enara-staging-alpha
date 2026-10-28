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

export function searchTerms(text: string): string[] {
  const tokens = normaliseArabic(text.toLowerCase()).split(/[^\p{L}\p{N}]+/u);
  return tokens
    .map((t) => (t.startsWith('ال') && t.length > 4 ? t.slice(2) : t)) // Arabic definite article
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
