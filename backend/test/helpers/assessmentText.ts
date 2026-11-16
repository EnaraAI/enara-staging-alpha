import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Shared helpers for the assessment novelty / separation / forms checks.
// Reads files only; no provider call, no network.

export const ROOT = path.resolve(__dirname, '../../..');
export const OUTCOMES_DIR = path.join(ROOT, 'data/assessments/outcomes');
export const PLACEMENT_FILE = path.join(ROOT, 'data/assessments/placement/placement.json');

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic instruction phrases that may legitimately appear anywhere.
// Matched against the normalized shingle / sentence (substring match).
export const GENERIC_ALLOWLIST = [
  'write one sentence about',
  'write two sentences about',
  'write a sentence about',
  'write the correct form of the verb',
  'fill the gap with am is or are',
  'fill the gap with a or an',
  'fill the gap with',
  'choose the correct word',
  'choose the correct answer',
  'complete the sentence',
  'fill in the gap',
  'use the word',
  'start with i',
  'in the morning',
  'at the weekend',
  'every day',
  'what time is it',
  'how are you',
  'nice to meet you',
  'can i have a',
  'i would like a',
  'thank you very much',
].map(normalize);

// Instruction frames (the part of a prompt that tells the learner what form to
// use). They are cut out of the text before shingling, so only the content
// around them is checked.
export const INSTRUCTION_FRAMES = [
  'use a or an',
  'use am is or are',
  'use is or are',
  'use there is or there are',
  'use can or can t',
  'use and but or because',
  'use much or many',
  'use some or any',
  'use my your his or her',
  'use the past simple',
  'use going to',
  'start with i',
  'start with did',
  'write one sentence about',
  'write two sentences about',
  'write a sentence about',
  'write the correct form of the verb',
  'fill the gap with am is or are',
  'fill the gap with a or an',
  'fill the gap with',
].map(normalize);

export function isAllowlisted(normText: string): boolean {
  return GENERIC_ALLOWLIST.includes(normText) || INSTRUCTION_FRAMES.includes(normText);
}

/** Normalized text split into chunks with instruction frames removed. */
export function contentChunks(text: string): string[] {
  let t = ` ${normalize(text)} `;
  for (const f of INSTRUCTION_FRAMES) t = t.split(` ${f} `).join(' | ');
  return t.split('|').map((c) => c.trim()).filter(Boolean);
}

export interface ItemText {
  itemId: string;
  file: string;
  field: string;
  text: string;
}

const NOTE_PREFIXES = ['matching note', 'model answer'];

export function outcomeFiles(): string[] {
  return readdirSync(OUTCOMES_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(OUTCOMES_DIR, f));
}

export function loadJson(file: string): any {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Prompts, answer keys and accepted answers of every assessment item. */
export function assessmentTexts(): ItemText[] {
  const out: ItemText[] = [];
  const push = (itemId: string, file: string, field: string, v: unknown) => {
    if (typeof v !== 'string' || !v.trim()) return;
    if (NOTE_PREFIXES.some((p) => normalize(v).startsWith(p))) return;
    out.push({ itemId, file: path.relative(ROOT, file), field, text: v });
  };
  for (const f of outcomeFiles()) {
    const d = loadJson(f);
    for (const items of Object.values<any[]>(d.forms ?? {})) {
      for (const it of items) {
        push(it.id, f, 'prompt', it.prompt);
        push(it.id, f, 'answerKey', it.answerKey);
        for (const a of it.acceptedAnswers ?? []) push(it.id, f, 'acceptedAnswers', a);
      }
    }
  }
  const p = loadJson(PLACEMENT_FILE);
  for (const it of p.items ?? []) {
    push(it.id, PLACEMENT_FILE, 'prompt', it.prompt);
    push(it.id, PLACEMENT_FILE, 'correctAnswer', it.correctAnswer);
    push(it.id, PLACEMENT_FILE, 'modelAnswer', it.modelAnswer);
    for (const a of it.acceptedAnswers ?? []) push(it.id, PLACEMENT_FILE, 'acceptedAnswers', a);
  }
  return out;
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalize)
    .filter((s) => s.split(' ').length >= 4);
}

export function shingles(text: string, n = 6): string[] {
  const out: string[] = [];
  for (const chunk of contentChunks(text)) {
    const w = chunk.split(' ').filter(Boolean);
    for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  }
  return out;
}

export function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.') || e === '__pycache__') continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

export interface Corpus {
  name: string;
  text: string; // normalized, padded with spaces
  grams: Set<string>; // every 6-word window of text
}

export function buildCorpus(files: string[]): Corpus[] {
  return files
    .filter((f) => existsSync(f))
    .map((f) => {
      const text = ` ${normalize(readFileSync(f, 'utf8'))} `;
      const w = text.trim().split(' ');
      const grams = new Set<string>();
      for (let i = 0; i + 6 <= w.length; i++) grams.add(w.slice(i, i + 6).join(' '));
      return { name: path.relative(ROOT, f), text, grams };
    });
}

/** English lesson fixtures named in docs/LEARNING_OUTCOMES.md PART 8. */
export function lessonFixtureFiles(): string[] {
  const lt = path.join(ROOT, 'docs/benchmarks/language-teaching');
  return [
    path.join(lt, '20261109T-ltb-v1.0/benchmark_cases.jsonl'),
    path.join(lt, '20261109-full-remediation/fixture_v2/fixture_v2_cases.jsonl'),
    path.join(lt, '20261112-outcome-sim-v1/outcome_cases.jsonl'),
    path.join(lt, '20261112-outcome-sim-v2/outcome_cases.jsonl'),
    path.join(lt, '20261112-skills-v1/skills_v1_cases.jsonl'),
    path.join(lt, '20261113-lo-experiment/lo_cases.jsonl'),
    ...walk(path.join(ROOT, 'backend/benchmarks'), ['.mjs', '.json', '.jsonl', '.ts']),
    path.join(ROOT, 'research/deep-learning-simulation-v2/src/offline/eslFixtures.ts'),
  ];
}

export function backendSrcFiles(): string[] {
  return walk(path.join(ROOT, 'backend/src'), ['.ts', '.json', '.md', '.txt']);
}

export function researchFiles(): string[] {
  const r = path.join(ROOT, 'research/deep-learning-simulation-v2');
  const exp4 = path.join(r, 'reports/exp4');
  const esl = readdirSync(exp4)
    .filter((d) => /^agent_sim_esl\d/.test(d))
    .flatMap((d) => walk(path.join(exp4, d), ['.json']).filter((f) => /POST|cases_new/.test(path.basename(f))));
  return [
    ...walk(path.join(r, 'src/offline'), ['.ts']),
    ...walk(path.join(r, 'benchmark'), ['.json', '.jsonl']),
    ...esl,
  ];
}

export interface Hit {
  item: ItemText;
  kind: 'sentence' | 'shingle';
  match: string;
  corpus: string;
}

export function findHits(items: ItemText[], corpora: Corpus[], opts: { sentences: boolean }): Hit[] {
  const hits: Hit[] = [];
  for (const item of items) {
    const probes: Array<['sentence' | 'shingle', string]> = [];
    if (opts.sentences) for (const s of sentences(item.text)) probes.push(['sentence', s]);
    for (const s of shingles(item.text)) probes.push(['shingle', s]);
    const seen = new Set<string>();
    for (const [kind, probe] of probes) {
      if (seen.has(probe) || isAllowlisted(probe)) continue;
      seen.add(probe);
      const c = kind === 'shingle'
        ? corpora.find((c) => c.grams.has(probe))
        : corpora.find((c) => c.text.includes(` ${probe} `));
      if (c) hits.push({ item, kind, match: probe, corpus: c.name });
    }
  }
  return hits;
}

export function formatHits(hits: Hit[]): string {
  return hits.map((h) => `${h.item.itemId} [${h.item.field}] ${h.kind} "${h.match}" in ${h.corpus}`).join('\n');
}
