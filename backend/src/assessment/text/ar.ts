// Arabic text handling for the assessment engine and the tutor (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §2). One helper, so answer
// checks everywhere fold Arabic the same way. Display text is never changed: these functions are for COMPARING answers only.
//   - tashkeel (harakat, dagger alef) and tatweel are removed;
//   - أ إ آ ٱ → ا and ى → ي, always;
//   - ة → ه only when asked (an item flag in the assessment engine; always in the tutor's spelling check);
//   - ؤ → و and ئ → ي only when asked (the tutor's spelling check);
//   - Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9; the Arabic decimal mark ٫ → '.', the Arabic thousands mark ٬ → ','.

export const TASHKEEL = /[ً-ْٰـ]/g;
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
const LATIN_LETTER = /[A-Za-z]/;

export interface ArabicFold { taMarbuta?: boolean; hamzaSeats?: boolean }

/** Arabic text folded for comparison (see the header for what changes). */
export function normalizeArabic(s: string, opts: ArabicFold = {}): string {
  let t = s.replace(TASHKEEL, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');
  if (opts.taMarbuta) t = t.replace(/ة/g, 'ه');
  if (opts.hamzaSeats) t = t.replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  return t;
}

/** The tutor's spelling fold: every form learners often mix up (ة, hamza seats included). */
export const foldArabic = (s: string): string => normalizeArabic(s, { taMarbuta: true, hamzaSeats: true });

/** Arabic-Indic and Persian digits as 0-9, the Arabic decimal and thousands marks as '.' and ','. */
export const westernDigits = (s: string): string =>
  s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/٫/g, '.').replace(/٬/g, ',');

/** Which script a text is written in: 'ar', 'latin', 'mixed' (both, each at least 20% of the letters) or 'none'. */
export function scriptOf(text: string): 'ar' | 'latin' | 'mixed' | 'none' {
  let ar = 0; let la = 0;
  for (const ch of text) { if (ARABIC_LETTER.test(ch)) ar++; else if (LATIN_LETTER.test(ch)) la++; }
  const all = ar + la;
  if (!all) return 'none';
  if (ar / all >= 0.8) return 'ar';
  if (la / all >= 0.8) return 'latin';
  return 'mixed';
}

export interface AnswerFold extends ArabicFold { lang?: string }

/**
 * A short answer folded for comparison in either language: trimmed, spaces collapsed, Western digits, Latin lower-cased, Arabic folded,
 * surrounding punctuation (Latin and Arabic) removed. "Paris." and " paris " match; "المدرسة" and "المدرسه" match only with taMarbuta.
 */
export function normalizeAnswer(raw: unknown, opts: AnswerFold = {}): string {
  const s = westernDigits(String(raw ?? '')).normalize('NFC').toLowerCase();
  return normalizeArabic(s, opts)
    .replace(/[\s‏‎]+/g, ' ')
    .trim()
    .replace(/^[\s"'“”‘’«».,;:!?؟،؛()[\]-]+|[\s"'“”‘’«».,;:!?؟،؛()[\]-]+$/g, '')
    .trim();
}

/** Levenshtein distance, capped: returns cap + 1 as soon as the distance is known to be larger (cheap for long strings). */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}
