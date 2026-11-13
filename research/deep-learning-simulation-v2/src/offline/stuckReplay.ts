// Offline prompt replay (no API): at points where the learner is stuck in Experiment 5b transcripts, render the REAL engine prompt under old settings
// and under the new switches. History evidence is RECONSTRUCTED (the stored transcripts keep only the dialogue): the open item is the lesson item whose
// prompt the tutor last showed, and an earlier learner turn counts as a recorded miss unless it matches the answer key. This is an approximation.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn } from '../../../../backend/src/services/languageTeachingContext';
import { evaluateAgainstKey } from '../../../../backend/src/services/languageLearningState';
import { loadBenchmark } from '../orchestrator/run';
import { Rng } from '../util/rng';

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const [runDir, outDir, nStr] = process.argv.slice(2); const N = Number(nStr ?? 16);
const bm = loadBenchmark(); const rows = readFileSync(path.join(runDir, 'raw/blocks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ENGINE_NEW = 'all,closing,selfCheck,clarity';
const cands: any[] = [];
for (const r of rows) {
  if (r.result.condition !== 'A' || r.result.status !== 'ok') continue;
  const o = bm.find((x) => x.id === r.result.outcomeId); if (!o) continue; const turns = r.teaching.turns as { learner: string; tutor: string }[];
  const items = o.lesson.spec.items;
  for (let k = 3; k < turns.length && k <= 4; k++) { // stuck point: learner's 4th or 5th message
    const hist: any[] = []; let active: string | undefined; let misses = 0;
    for (let i = 0; i < k; i++) {
      hist.push({ role: 'user', content: turns[i].learner });
      const shown = [...items].reverse().find((it) => norm(turns[i].tutor).includes(norm(it.prompt).replace(/^(complete|correct the verb|choose)\s*/, '')));
      const prevActive = active; if (shown) active = shown.id;
      const it = items.find((x) => x.id === prevActive);
      const verdict = it ? (evaluateAgainstKey(turns[i].learner, it) ? 'CORRECT' : 'INCORRECT') : 'NOT_EVALUATED'; if (verdict === 'INCORRECT') misses++;
      hist.push({ role: 'assistant', content: turns[i].tutor, languageTurn: { assessment: { verdict, relevance: it ? 'ACTIVE_ITEM' : 'NO_ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, ...(active ? { activeItem: { id: `lesson:${active}`, source: 'lesson', lessonItemId: active } } : {}), hintLevel: Math.min(6, Math.max(1, misses)) } });
    }
    if (misses >= 2 && active) cands.push({ id: `${r.result.blockId}@${k}`, o, turns, k, hist });
  }
}
const rng = Rng.of('stuck-replay-20261117'); const order = rng.shuffle(cands); cands.splice(0, cands.length, ...order);
const seen = new Set<string>(); const pick: any[] = []; for (const c of cands) { const key = c.o.area; const n = [...seen].filter((s) => s.startsWith(key)).length; if (n < Math.ceil(N / 6)) { seen.add(`${key}${pick.length}`); pick.push(c); } if (pick.length >= N) break; }
mkdirSync(outDir, { recursive: true }); const out: any[] = [];
for (const c of pick) {
  const message = c.turns[c.k].learner; const spec = c.o.lesson.spec; const lesson = { title: c.o.lesson.title, spec };
  const render = (env: string) => {
    process.env.ENARA_ENGINE_V2 = env;
    const signals = detectTurnSignals(message, c.hist, lesson);
    const moves = selectLanguageMoves({ band: levelBand(c.o.cefr), targetLanguage: 'English', lessonStatus: 'structured', signals });
    const learner = deriveLearnerContext({ courseLevel: c.o.cefr, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
    const research = closingOn() ? researchSignals(c.hist, signals, spec) : undefined;
    return renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: lesson.title, spec }, signals, moves, ...(research ? { research } : {}) } as never);
  };
  const oldP = render(''), newP = render(ENGINE_NEW);
  out.push({ id: c.id, area: c.o.area, outcome: c.o.id, title: c.o.lesson.title, objective: c.o.lesson.objective, dialogue: c.turns.slice(0, c.k).map((t: any) => ({ student: t.learner, tutor: t.tutor })), message, promptOld: oldP, promptNew: newP, promptsDiffer: oldP !== newP });
}
writeFileSync(path.join(outDir, 'cases.json'), JSON.stringify(out, null, 1));
console.log('cases', out.length, 'prompts differ in', out.filter((x) => x.promptsDiffer).length, 'candidates', cands.length);
