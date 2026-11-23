// Spelling dictionaries for the rules-first grader (docs/tutor/RULES_FIRST_GRADING_PLAN.md §2.1, §5). Loaded lazily, once per process,
// and cached. The Hunspell files ship UNMODIFIED in backend/assets/dictionaries/{en_US,ar}/ with their licence files (see NOTICE.md
// there); our own additions (school words, names) are in backend/assets/dictionaries/enara/allow-<lang>.txt, a file we own.
// When the files are missing (a deployment without the assets), spelling checks are simply off: no finding, no decision.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Hunspell, type WordStatus } from './hunspell';

export interface SpellChecker { lang: 'en' | 'ar'; check(word: string): WordStatus }

const FILES = { en: ['en_US/en_US.aff', 'en_US/en_US.dic'], ar: ['ar/ar.aff', 'ar/ar.dic'] } as const;

export function dictionariesDir(): string | null {
  const c = [join(__dirname, '../../../assets/dictionaries'), join(__dirname, '../../../../assets/dictionaries'), join(process.cwd(), 'assets/dictionaries'), join(process.cwd(), 'backend/assets/dictionaries')];
  return c.find((p) => existsSync(join(p, FILES.en[1]))) ?? null;
}

/** Our own allow-list (one word per line, '#' comments). Words are compared as written, tashkeel removed. */
export function readAllowList(lang: 'en' | 'ar', dir = dictionariesDir()): Set<string> {
  if (!dir) return new Set();
  const p = join(dir, 'enara', `allow-${lang}.txt`);
  if (!existsSync(p)) return new Set();
  return new Set(readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((w) => w.normalize('NFC').replace(/[ً-ْٰـ]/g, '')));
}

/** On the allow-list. Arabic: also with the attached prefixes (و ف ب ك ل and the article: والأتوبيس, بالأتوبيس). */
export function allowed(allow: Set<string>, word: string, lang: 'en' | 'ar'): boolean {
  if (!allow.size) return false;
  if (lang === 'en') return allow.has(word.toLowerCase());
  const w = word.normalize('NFC').replace(/[ً-ْٰـ]/g, '');
  if (allow.has(w) || allow.has(`ال${w}`)) return true;
  for (let k = 1; k <= 4 && k < w.length - 1; k++) {
    if (!/^(?:[وف]?[بكل]?)(?:ال)?$/.test(w.slice(0, k))) continue;
    const rest = w.slice(k);
    if (allow.has(rest) || allow.has(`ال${rest}`) || (rest.startsWith('ال') && allow.has(rest.slice(2)))) return true;
  }
  return false;
}

const cache = new Map<string, SpellChecker | null>();
export const loadStats: Record<string, { ms: number; entries: number }> = {};

/** The checker for a language ('en…' or 'ar…'), or null when the dictionary is not available. */
export function spellChecker(language: string): SpellChecker | null {
  const lang: 'en' | 'ar' = language.startsWith('ar') ? 'ar' : 'en';
  if (cache.has(lang)) return cache.get(lang)!;
  let sc: SpellChecker | null = null;
  try {
    const dir = dictionariesDir();
    if (dir && existsSync(join(dir, FILES[lang][1]))) {
      const t0 = Date.now();
      const h = new Hunspell(readFileSync(join(dir, FILES[lang][0]), 'utf8'), readFileSync(join(dir, FILES[lang][1]), 'utf8'));
      const allow = readAllowList(lang, dir);
      loadStats[lang] = { ms: Date.now() - t0, entries: h.size };
      sc = { lang, check: (w) => (allowed(allow, w, lang) ? 'ok' : h.check(w)) };
    }
  } catch { sc = null; }
  cache.set(lang, sc);
  return sc;
}

/** Tests only: forget the loaded checkers. */
export function resetSpellCheckers(): void { cache.clear(); }
