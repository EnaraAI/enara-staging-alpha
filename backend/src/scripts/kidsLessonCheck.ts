// kidsPack lesson checker. Usage (from backend/): npx tsx src/scripts/kidsLessonCheck.ts <lessons.json> [...more]
// Every lesson: ids unique; outcomeIds are real Pre A1 can-dos; lesson words are Starters words; story, chant and command
// words are Starters words (or numbers 1-20, names); line lengths; one action per command; picture cards are Starters nouns.
import { readFileSync } from 'fs';
import path from 'path';
import { checkLesson, inList, loadKidsPack, starterTokens, type LadLesson } from '../services/kidsPack';

const d = loadKidsPack();
if (!d) { console.error('no kids pack data'); process.exit(2); }
const tokens = starterTokens(d.words, [...d.numbers, ...d.names]);
const outcomes = new Set(d.outcomes.map((o) => o.id));
// A1-linked lessons (data/kids/prea1/A1_LINK.json): a lesson may also list an A1 course objective, and then use that objective's few extra words.
const a1 = (JSON.parse(readFileSync(path.join(__dirname, '../../../data/kids/prea1/A1_LINK.json'), 'utf8')) as { outcomes: Record<string, { extraWords?: string[] }> }).outcomes;
const a1Extra = (l: LadLesson) => l.outcomeIds.flatMap((o) => a1[o]?.extraWords ?? []);
const nouns = new Set(d.words.filter((w) => w.pos.includes('n') && !w.name).flatMap((w) => [w.word, ...(w.forms ?? [])]).map((x) => x.toLowerCase().replace(/\s+/g, '-')));
// Content rule (owner, 20 Nov): lesson lines never reuse a test-item sentence (assessment items and course lesson items, 3+ words).
const nrm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const itemSentences = ['ITEM_SENTENCES_TESTS.json', 'ITEM_SENTENCES_COURSE.json'].flatMap((f) => { try { return JSON.parse(readFileSync(path.join(__dirname, '../../../data/kids/prea1', f), 'utf8')) as string[]; } catch { return []; } }).map(nrm).filter((x) => x.split(' ').length >= 3);
export const reusesItem = (line: string): string | undefined => { const l = nrm(line); return itemSentences.find((x) => l === x || ` ${l} `.includes(` ${x} `) || (l.split(' ').length >= 4 && ` ${x} `.includes(` ${l} `))); };
let bad = 0;
const ids = new Set<string>();
for (const file of process.argv.slice(2)) {
  const lessons = JSON.parse(readFileSync(file, 'utf8')) as LadLesson[];
  for (const l of lessons) {
    const extra = a1Extra(l); const lt = new Set([...tokens, ...extra]);
    const p = checkLesson(l, d.words, [...d.numbers, ...d.names, ...extra]);
    if (ids.has(l.id)) p.push('duplicate id');
    ids.add(l.id);
    for (const o of l.outcomeIds) if (!outcomes.has(o) && !a1[o]) p.push(`unknown outcome ${o}`);
    if (!l.outcomeIds.includes('PREA1-04')) p.push('every listen-and-do lesson must include PREA1-04 (follow simple instructions)');
    for (const w of l.words) if (!w.split(/\s+/).every((t) => inList(t, lt))) p.push(`lesson word "${w}" is not a Starters word`);
    if (l.words.length < 4 || l.words.length > 8) p.push(`${l.words.length} lesson words (4-8)`);
    // review round 1: every lesson word is practised (in the story or chant), and at least half of them in the story
    const has = (lines: string[], w: string) => lines.some((x) => x.toLowerCase().split(/[^a-z'-]+/).some((t) => t && inList(t, new Set(w.toLowerCase().split('/').flatMap((f) => [f, f.split(/\s+/).pop()!])))));
    for (const w of l.words) if (!has([...l.story, ...l.chant], w)) p.push(`lesson word "${w}" is not in the story or chant`);
    if (l.words.filter((w) => has(l.story, w)).length * 2 < l.words.length) p.push('fewer than half of the lesson words are in the story');
    for (const c of l.cards ?? []) if (!nouns.has(c.replace(/^card:/, ''))) p.push(`card "${c}" is not a Starters noun`);
    for (const line of [...l.story, ...l.chant, ...l.commands]) { const hit = reusesItem(line); if (hit) p.push(`line "${line}" reuses a test-item sentence ("${hit}")`); }
    if (p.length) { bad += p.length; console.log(`${file} ${l.id}:\n  ${p.join('\n  ')}`); }
  }
}
console.log(bad ? `FAIL: ${bad} problems` : `OK: ${ids.size} lessons`);
process.exit(bad ? 1 : 0);
