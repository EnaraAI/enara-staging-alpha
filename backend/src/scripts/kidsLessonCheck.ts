// kidsPack lesson checker. Usage (from backend/): npx tsx src/scripts/kidsLessonCheck.ts <lessons.json> [...more]
// Every lesson: ids unique; outcomeIds are real Pre A1 can-dos; lesson words are Starters words; story, chant and command
// words are Starters words (or numbers 1-20, names); line lengths; one action per command; picture cards are Starters nouns.
import { readFileSync } from 'fs';
import { checkLesson, inList, loadKidsPack, starterTokens, type LadLesson } from '../services/kidsPack';

const d = loadKidsPack();
if (!d) { console.error('no kids pack data'); process.exit(2); }
const tokens = starterTokens(d.words, [...d.numbers, ...d.names]);
const outcomes = new Set(d.outcomes.map((o) => o.id));
const nouns = new Set(d.words.filter((w) => w.pos.includes('n') && !w.name).flatMap((w) => [w.word, ...(w.forms ?? [])]).map((x) => x.toLowerCase().replace(/\s+/g, '-')));
let bad = 0;
const ids = new Set<string>();
for (const file of process.argv.slice(2)) {
  const lessons = JSON.parse(readFileSync(file, 'utf8')) as LadLesson[];
  for (const l of lessons) {
    const p = checkLesson(l, d.words, [...d.numbers, ...d.names]);
    if (ids.has(l.id)) p.push('duplicate id');
    ids.add(l.id);
    for (const o of l.outcomeIds) if (!outcomes.has(o)) p.push(`unknown outcome ${o}`);
    if (!l.outcomeIds.includes('PREA1-04')) p.push('every listen-and-do lesson must include PREA1-04 (follow simple instructions)');
    for (const w of l.words) if (!w.split(/\s+/).every((t) => inList(t, tokens))) p.push(`lesson word "${w}" is not a Starters word`);
    if (l.words.length < 4 || l.words.length > 8) p.push(`${l.words.length} lesson words (4-8)`);
    // review round 1: every lesson word is practised (in the story or chant), and at least half of them in the story
    const has = (lines: string[], w: string) => lines.some((x) => x.toLowerCase().split(/[^a-z'-]+/).some((t) => t && inList(t, new Set(w.toLowerCase().split('/').flatMap((f) => [f, f.split(/\s+/).pop()!])))));
    for (const w of l.words) if (!has([...l.story, ...l.chant], w)) p.push(`lesson word "${w}" is not in the story or chant`);
    if (l.words.filter((w) => has(l.story, w)).length * 2 < l.words.length) p.push('fewer than half of the lesson words are in the story');
    for (const c of l.cards ?? []) if (!nouns.has(c.replace(/^card:/, ''))) p.push(`card "${c}" is not a Starters noun`);
    if (p.length) { bad += p.length; console.log(`${file} ${l.id}:\n  ${p.join('\n  ')}`); }
  }
}
console.log(bad ? `FAIL: ${bad} problems` : `OK: ${ids.size} lessons`);
process.exit(bad ? 1 : 0);
