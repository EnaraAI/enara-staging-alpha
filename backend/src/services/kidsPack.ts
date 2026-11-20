// kidsPack (Enara Kids, step 3): Pre-A1 Starters outcomes, words and listen-and-do (LAD) lesson content.
// Data lives in data/kids/prea1/ and is built from the official Cambridge Pre A1 Starters word list and Can Do statements by
// scripts/kids/import_starters.py. Until those files exist the pack is inactive (no invented word list).
// Code decides the content of each LAD stage; the model only says it in a child-friendly way.
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { engineV2 } from './engineV2';
import type { Stage } from './lessonPlanner';

export interface StartersWord { word: string; pos: string[]; forms?: string[]; note?: string; use?: string; name?: boolean; topic?: string }
export interface PreA1Outcome { id: string; skill: 'listening' | 'reading' | 'writing' | 'speaking'; canDo: string; source: string }
export interface LadLesson {
  id: string;
  outcomeIds: string[];
  topic: string;
  /** Written for one A1 objective (A1_LINK.json): matched by outcome id only, never by a title word. */
  linkOnly?: boolean;
  words: string[];
  /** 4-6 short lines, every word from the Starters list or the lesson words. */
  story: string[];
  /** 4-8 short chant lines. */
  chant: string[];
  /** Listen-and-do commands, one action each ("Point to the cat."). */
  commands: string[];
  /** Picture-card ids for tap/drag tasks in the Kids app. */
  cards?: string[];
}
export interface PreA1Outcome2 { id: string; canDo: string; skill: string; examples: string[]; source: string }
export interface KidsPackData { words: StartersWord[]; outcomes: PreA1Outcome2[]; lessons: LadLesson[]; numbers: string[]; names: string[]; source: Record<string, unknown> }

const DATA_DIR = path.resolve(__dirname, '../../../data/kids/prea1');
let cache: KidsPackData | null | undefined;
/** The pack's data, or null when it has not been imported yet. */
export function loadKidsPack(dir = DATA_DIR): KidsPackData | null {
  if (cache !== undefined && dir === DATA_DIR) return cache;
  const f = (n: string) => path.join(dir, n);
  const ok = ['WORDS.json', 'OUTCOMES.json', 'SOURCE.json'].every((n) => existsSync(f(n)));
  const j = (n: string, d: unknown) => (existsSync(f(n)) ? JSON.parse(readFileSync(f(n), 'utf8')) : d);
  const data: KidsPackData | null = ok
    ? { words: j('WORDS.json', []), outcomes: j('OUTCOMES.json', []), lessons: j('LESSONS.json', []), numbers: j('NUMBERS.json', { numbers: [] }).numbers, names: j('NAMES.json', []), source: j('SOURCE.json', {}) }
    : null;
  if (dir === DATA_DIR) cache = data;
  return data;
}
export const kidsPackOn = (): boolean => engineV2('kidsPack') && engineV2('planner2');
/** planner2b ladContent signal: listen-and-do runs only when a reviewed kids-pack lesson exists for this objective (by outcome id, else topic). */
export function ladContentFor(objectiveCode?: string, title?: string): boolean {
  if (!kidsPackOn()) return false;
  const d = loadKidsPack();
  return Boolean(d && lessonFor(d, objectiveCode, title));
}

const norm = (w: string) => w.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z'-]/g, '');
/** Base form for the word-list check (plural -s/-es, -ing, -ed, 's). Conservative: only strips when the base is listed. */
export function inList(word: string, list: Set<string>): boolean {
  const w = norm(word);
  if (!w || list.has(w)) return true;
  const cands = [w.replace(/'s$/, ''), w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ed$/, ''), w.replace(/d$/, '')];
  return cands.some((c) => c.length > 1 && list.has(c));
}

/** The word list gives base forms only (be, have, do, can); Pre A1 Starters grammar uses their present/past forms and short forms. */
export const STARTERS_GRAMMAR_FORMS = ['am', 'is', 'are', "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "isn't", "aren't", "'m", "'s", "'re", 'has', "hasn't", "haven't", "i've", 'does', "doesn't", "don't", "can't", "let's", "what's", "where's", "who's", "that's", "there's"];
/** Every single word the Starters list allows: headwords, their forms, the words of multi-word entries, numbers 1-20, names. */
export function starterTokens(words: StartersWord[], extra: string[] = []): Set<string> {
  return new Set([...words.flatMap((w) => [w.word, ...(w.forms ?? [])]), ...STARTERS_GRAMMAR_FORMS, ...extra].flatMap((x) => x.split(/[\s/]+/)).map(norm).filter(Boolean));
}
/** Check a lesson's content: every story/chant/command word is a Starters word or a lesson word; lines short; one action per command. */
export function checkLesson(lesson: LadLesson, words: StartersWord[], extra: string[] = []): string[] {
  const list = new Set([...starterTokens(words, extra), ...lesson.words.map(norm)]);
  const problems: string[] = [];
  const lines = [...lesson.story.map((l) => ['story', l]), ...lesson.chant.map((l) => ['chant', l]), ...lesson.commands.map((l) => ['command', l])] as [string, string][];
  for (const [kind, line] of lines) {
    const toks = line.split(/\s+/).map(norm).filter(Boolean);
    const off = toks.filter((t) => !inList(t, list));
    if (off.length) problems.push(`${kind} "${line}": not in the Starters list or lesson words: ${off.join(', ')}`);
    if (toks.length > (kind === 'command' ? 8 : 10)) problems.push(`${kind} "${line}": ${toks.length} words (max ${kind === 'command' ? 8 : 10})`);
    if (kind === 'command' && /\b(and|then)\b/i.test(line)) problems.push(`command "${line}": more than one action`);
  }
  if (lesson.story.length < 4 || lesson.story.length > 6) problems.push(`story has ${lesson.story.length} lines (4-6)`);
  if (lesson.chant.length < 4 || lesson.chant.length > 8) problems.push(`chant has ${lesson.chant.length} lines (4-8)`);
  if (lesson.commands.length < 4) problems.push(`only ${lesson.commands.length} commands (at least 4)`);
  return problems;
}

/** The lesson for an objective: by outcome id, else by topic word in the objective title. */
export function lessonFor(data: KidsPackData, objectiveCode?: string, title?: string): LadLesson | undefined {
  return data.lessons.find((l) => objectiveCode && l.outcomeIds.includes(objectiveCode))
    // linkOnly lessons (written for one A1 objective, topics like "an", "the", "can") match by outcome id only, never by a title word.
    ?? data.lessons.find((l) => !l.linkOnly && title && new RegExp(`\\b${l.topic}\\b`, 'i').test(title));
}

/** Prompt lines for one LAD stage with the lesson's content (code picks the content; the model says it). */
export function ladLines(lesson: LadLesson | undefined, stage: Stage, step = 0): string[] {
  const head = '- Enara Kids, listen and do: at most 3 short sentences per reply; one action at a time; praise effort; never say "wrong".';
  if (!lesson) return [head, '- No kids lesson content for this objective yet: use simple words about the lesson topic.'];
  const pick = <T>(xs: T[]) => xs[step % xs.length];
  switch (stage) {
    case 'listen':
      return [head, `- Stage Listen: tell this story slowly, line by line, then ask the child to listen for the word "${pick(lesson.words)}":`, ...lesson.story.map((l) => `  ${l}`)];
    case 'do':
      return [head, `- Stage Do: give this one instruction and wait (the child taps, points or says it): "${pick(lesson.commands)}"`, '- If the child does it, praise the effort and give the next one; if not, say the word again slowly and show the picture.'];
    case 'chant':
      return [head, '- Stage Chant: say this chant together, two lines at a time:', ...lesson.chant.map((l) => `  ${l}`)];
    default:
      return [head, `- Stage Check: one last instruction on your own: "${pick(lesson.commands.slice().reverse())}". Then say goodbye with a sticker.`];
  }
}
