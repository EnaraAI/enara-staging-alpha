// Mishkat (owner go, 23 Nov 2026): 140 NEW synthetic learner answers per language to fill the spread grid (mostly longer essays).
// Written by DeepSeek on lms-test via llm-compare; no rubric in view. Arabic: Modern Standard Arabic (fusha) only; weak answers may
// contain occasional colloquial slips, never an answer written in colloquial on purpose. Output is model-marked dev data only.
import { writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://lms-test.enara.app';
const TOKEN = process.env.LMSTEST_MAINTENANCE_TOKEN;
const SUBJECTS = ['language', 'science', 'humanities', 'listening'];
const AGES = { en: ['A1-A2', 'B1', 'B2'], ar: ['grades 4-5', 'grades 6-7', 'grades 8-9'] };
const BANDS = ['weak', 'mid', 'strong'];
// 140 slots: essays 40-100 words (30), essays 100-250 (70), short answers <15 (15), short 15-40 (25)
const SLOTS = [...Array(30).fill(['essay', '40-100']), ...Array(70).fill(['essay', '100-250']), ...Array(15).fill(['short_answer', '5-15']), ...Array(25).fill(['short_answer', '15-40'])];
function cells(lang) {
  return SLOTS.map(([type, len], i) => ({ id: `mk-${lang}-${String(i + 1).padStart(3, '0')}`, lang, subject: SUBJECTS[i % 4], age: AGES[lang][Math.floor(i / 4) % 3], band: BANDS[Math.floor(i / 12) % 3], type, length: len }));
}
const BAND_TEXT = { weak: 'a weak learner: many mistakes, simple words, may answer only part of the question', mid: 'an average learner: some mistakes, mostly on the question', strong: 'a strong learner for this age: few mistakes, answers the whole question clearly' };
function system(lang) {
  return 'You write realistic test data: questions a teacher would set and answers that school learners would really write. ' +
    (lang === 'ar'
      ? 'Everything is in Modern Standard Arabic (fusha): questions and answers. Every answer is written in fusha, also the weak ones: a weak learner makes fusha mistakes (hamza, taa marbuta, alef maqsura, agreement, case endings, simple sentences), and AT MOST one or two colloquial (Egyptian) words slip into the whole answer. Never write sentences in colloquial (no عشان، مش، ده، دلوقتي، حاجة، كتير، بنعمل، هنروح, etc. beyond one or two slips). Context: Egyptian schools (grades 4-9). '
      : 'Everything is in English, written by Egyptian learners of English (CEFR A1-B2): their mistakes are typical of Arabic speakers learning English. ') +
    'Each answer must have exactly the requested length in words and match the requested learner level. Questions must be self-contained (no recording or text needed to understand them; for listening and humanities, phrase the question so that it names its topic). ' +
    'Reply with JSON only: {"items":[{"id":"...","stem":"the question","answer":"the learner\'s answer"}]}';
}
function user(batch) {
  return 'Write one question and one learner answer for each of these:\n' + batch.map((c) => `- id ${c.id}: subject ${c.subject}; learner level ${c.age}; ${c.type === 'essay' ? 'an essay question' : 'a short-answer question'}; answer length ${c.length} words; written by ${BAND_TEXT[c.band]}.`).join('\n');
}
async function call(sys, msg) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${SITE}/api/maintenance/llm-compare`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ system: sys, messages: [{ role: 'user', content: msg }], max_tokens: 2000 }), signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (r && r.status === 200) { const j = await r.json(); if (j.ok) return j.text; }
    await new Promise((x) => setTimeout(x, 5000 * (i + 1)));
  }
  return null;
}
const parse = (t) => { try { const s = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1); return JSON.parse(s).items ?? []; } catch { return []; } };
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
mkdirSync('out', { recursive: true });
const report = {};
const REGEN = process.env.REGEN ? Object.fromEntries(process.env.REGEN.split(';').map((x) => { const [l, ids] = x.split(':'); return [l, new Set(ids.split(','))]; })) : null;
for (const lang of REGEN ? Object.keys(REGEN) : ['en', 'ar']) {
  const todo = cells(lang).filter((c) => !REGEN || REGEN[lang].has(c.id)); const done = [];
  const per = 3; let calls = 0;
  for (let k = 0; k < 3 && todo.length; k++) { // up to 3 passes for missing ids
    const batches = []; for (let i = 0; i < todo.length; i += per) batches.push(todo.slice(i, i + per));
    let b = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (b < batches.length) {
        const batch = batches[b++]; calls++;
        const t = await call(system(lang), user(batch));
        for (const it of t ? parse(t) : []) {
          const c = batch.find((x) => x.id === it.id);
          if (!c || typeof it.stem !== 'string' || typeof it.answer !== 'string' || !it.answer.trim()) continue;
          const [lo, hi] = c.length.split('-').map(Number); const w = words(it.answer);
          if (w < lo * 0.7 || w > hi * 1.3) continue; // length must be close to the request
          done.push({ ...c, stem: it.stem.trim(), answer: it.answer.trim(), words: w, origin: 'new', writer: 'deepseek', source: 'model-marked' });
        }
      }
    }));
    const have = new Set(done.map((d) => d.id)); todo.splice(0, todo.length, ...todo.filter((c) => !have.has(c.id)));
    console.log(lang, 'pass', k + 1, 'have', done.length, 'missing', todo.length);
  }
  done.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(`out/${REGEN ? 'regen' : 'new'}-${lang}.json`, JSON.stringify(done, null, 1));
  report[lang] = { written: done.length, missing: todo.map((c) => c.id), calls };
}
writeFileSync('out/report.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
