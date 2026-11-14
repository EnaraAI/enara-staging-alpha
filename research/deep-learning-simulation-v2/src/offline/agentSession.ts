// Agent-driven multi-turn session helper (NO API). An agent plays student and tutor by running these commands; the REAL ENARA engine renders the tutor
// instructions each turn and the REAL reply guards are applied to the tutor's reply. Conditions: A = current ENARA (no switches), B = ENARA with the new
// switches (all + closing + selfCheck + clarity), C = plain AI tutor (same prompt text as the research's generic tutor).
// Usage: tsx agentSession.ts init <file> <studentIdx> <outcomeId> <A|B|C> | student <file> | learner <file> <text> | tutor <file> | reply <file> <textFile> | show <file>
import { readFileSync, writeFileSync } from 'fs';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, rulesToIntroduce } from '../../../../backend/src/services/languageTeachingContext';
import { evaluateAgainstKey } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards } from '../../../../backend/src/services/languageTurnPipeline';
import { loadBenchmark } from '../orchestrator/run';
import { makeStudent, blockStart, studentPersona } from '../students/population';
import { lessonText, practiceList } from '../conditions/types';
import { planFor } from './clarityStudy';

const ENV_B = 'all,closing,selfCheck,clarity';
const ENV_D = `${ENV_B},hints`;
// Clarity study arms (reuse: A0 = D, P = C). E = A0 + the 23-method teaching plan + arbitration; F = E + ruleFirst + shortRecap; G = F + socraticOff (research only).
const ENV_E = `${ENV_D},arbitration`; const ENV_F = `${ENV_E},ruleFirst,shortRecap`; const ENV_G = `${ENV_F},socraticOff`;
const ENV_OF: Record<string, string> = { A: '', B: ENV_B, C: '', D: ENV_D, E: ENV_E, F: ENV_F, G: ENV_G };
const WITH_PLAN = new Set(['E', 'F', 'G']); // D = B plus the hint-variety / early-explanation fixes (closing loop fix is in the engine for B and D alike)
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const [cmd, file, a3, a4, a5] = process.argv.slice(2);
const load = () => JSON.parse(readFileSync(file, 'utf8')); const save = (s: unknown) => writeFileSync(file, JSON.stringify(s, null, 1));
const bm = loadBenchmark();

function history(turns: { learner: string; tutor?: string }[], items: { id: string; prompt: string; acceptedAnswers: string[] }[], o: any) {
  const hist: any[] = []; let active: string | undefined; let misses = 0;
  for (const t of turns) {
    hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break;
    const prev = items.find((x) => x.id === active);
    const verdict = prev ? (evaluateAgainstKey(t.learner, prev as never) ? 'CORRECT' : 'INCORRECT') : 'NOT_EVALUATED'; if (verdict === 'INCORRECT') misses++;
    const shown = [...items].reverse().find((it) => norm(t.tutor!).includes(norm(it.prompt).replace(/^(complete|correct the verb|choose)\s*/, ''))); if (shown) active = shown.id;
    hist.push({ role: 'assistant', content: t.tutor, languageTurn: { assessment: { verdict, relevance: prev ? 'ACTIVE_ITEM' : 'NO_ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, ...(active ? { activeItem: { id: `lesson:${active}`, source: 'lesson', lessonItemId: active } } : {}), hintLevel: Math.min(6, Math.max(1, misses)), ...(t.rulesIntroduced?.length ? { rulesIntroduced: t.rulesIntroduced } : {}) } });
  }
  return hist;
}
function langCtx(s: any, o: any) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.cond] ?? '';
  const last = s.turns[s.turns.length - 1]; const message = last.learner; const prior = s.turns.slice(0, -1);
  const hist = history(prior, o.lesson.spec.items, o); const lesson = { title: o.lesson.title, spec: o.lesson.spec };
  const signals = detectTurnSignals(message, hist, lesson);
  const moves = selectLanguageMoves({ band: levelBand(o.cefr), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: o.cefr, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = closingOn() || ENV_OF[s.cond].includes('hints') ? researchSignals(hist, signals, o.lesson.spec) : undefined;
  const planPrimary = WITH_PLAN.has(s.cond) ? planFor(s.studentIdx, o).plan.primary : undefined;
  const ruleFirst = ENV_OF[s.cond].includes('ruleFirst') ? rulesToIntroduce(hist, signals, o.lesson.spec) : undefined;
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: o.lesson.title, spec: o.lesson.spec }, signals, moves, ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as { prompt: string; research?: unknown; ruleFirst?: { criteria: number[] } };
}
if (cmd === 'init') {
  const idx = Number(a3); const o = bm.find((x) => x.id === a4)!; const cond = a5 as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  const st = makeStudent(idx, 'enara-agent-sim-1'); const start = blockStart(st, o.area, o.id, o.misconceptions.length, o.difficulty); const mis = o.misconceptions[start.heldMisconceptionIdx] ?? null;
  save({ cond, studentIdx: idx, outcomeId: o.id, persona: studentPersona(st, { cefr: o.cefr, area: o.area, heldMisconception: mis, knowsAlready: start.knowsAlready }), turns: [] }); console.log('ok');
} else {
  const s = load(); const o = bm.find((x) => x.id === s.outcomeId)!;
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.cond] ?? ''; // set first: the plan text is arbitrated only when `arbitration` is on
  const dlg = () => s.turns.map((t: any) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
  if (cmd === 'student') console.log(`LEARNER CARD (this is all the learner knows about themselves):\n${s.persona}\n\nLesson topic the tutor is teaching: ${o.lesson.title}.\n\nCONVERSATION SO FAR:\n${s.turns.length ? dlg() : '(none yet: you speak first; greet the tutor and say what you want to practise)'}\n\nWrite the learner's next message only.`);
  else if (cmd === 'learner') { s.turns.push({ learner: a3 }); save(s); console.log('recorded'); }
  else if (cmd === 'tutor') {
    if (s.cond === 'C') console.log(`You are a friendly English tutor. Help the student learn the lesson below through conversation. Keep replies short and in simple English.\n\n${lessonText(o)}\n\nPractice exercises you may use:\n${practiceList(o)}\n\nCONVERSATION SO FAR:\n${dlg()}\n\nWrite the tutor's next reply only.`);
    else { const plan = WITH_PLAN.has(s.cond) ? `${planFor(s.studentIdx, o).text}\n\n` : ''; console.log(`You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next). Do NOT write an [[assess ...]] marker.\n\n${plan}${langCtx(s, o).prompt}\n\nCONVERSATION SO FAR:\n${dlg()}\n\nWrite the tutor's next reply only.`); }
  } else if (cmd === 'reply') {
    let text = readFileSync(a3, 'utf8').trim(); let removed = 0;
    if (s.cond !== 'C') { const g = applyReplyGuards(langCtx(s, o) as never, text, s.turns[s.turns.length - 1].learner); text = g.text; removed = g.removed; }
    const lastT = s.turns[s.turns.length - 1]; lastT.tutor = text; if (removed) lastT.guardRemoved = removed;
    if (s.cond !== 'C') { const ctx = langCtx(s, o); if (ctx.ruleFirst?.criteria.length) lastT.rulesIntroduced = ctx.ruleFirst.criteria; }
    lastT.method = WITH_PLAN.has(s.cond) ? planFor(s.studentIdx, o).method : (s.cond === 'C' ? 'plain' : 'language-engine-only'); save(s); console.log(`recorded (turn ${s.turns.length}${removed ? `, guard removed ${removed} line(s)` : ''})`);
  } else if (cmd === 'show') console.log(dlg());
}
