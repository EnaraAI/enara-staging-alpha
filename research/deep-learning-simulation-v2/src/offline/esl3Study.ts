// ESL stage-3 CONFIRMATORY run (pre-registered: config/agent_sim_esl3/PROTOCOL.md). SIMULATION ONLY. Copy of esl2Study.ts: same simulator, same engine glue; new learners/seeds, arms P and LE only, 2 replications.
// ESL stage-2 comparison (Part 3). SIMULATION ONLY. NO API. Tutors are agents; learners are the rule-based simulator (learnerSim.ts); a blind judge agent labels each tutor turn.
// Arms: P plain tutor; A0 = wrongAnswer,closing,selfCheck,clarity,hints,strandLog (+ the 23-method plan from the fixed record); LE = A0 + levelExplicit; LEM = LE + memory.
// Two sessions per learner (rounds 1-5 = session 1, rounds 6-10 = session 2, one simulated day later). The knowledge state carries over; the engine's cross-session
// learner profile carries over in every ENARA arm exactly as production records it (error codes always; beliefs/what-worked/opening review only with `memory`).
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/esl2Study.ts <cmd> ...
// Commands: init <dir> | tprompts <dir> <cell> | tapply <dir> <cell> <answers.json> | jprep <dir> <round> | japply <dir> <round> | status <dir> | post <dir> | rateprep <dir> <out> | tags <dir> <out>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks, type LanguageTeachingContext,
} from '../../../../backend/src/services/languageTeachingContext';
import { evaluateAgainstKey } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { applyTurn, summarizeProfile, applyTurnV2, summarizeProfileV2, type ProfileV2 } from '../../../../backend/src/services/learnerLanguageProfile';
import { LESSONS, type Form } from './eslFixtures';
import { initialState, learnerReply, applyEvents, judgeCase, writeJudgeBatches, readJudge, postTest, sha, type KState, type Production, type JudgeEvent, type NextTask } from './learnerSim';

type Arm = 'P' | 'A0' | 'LE' | 'LEM';
const ARMS: Arm[] = ['P', 'LE'];
const REPS = [1, 2] as const;
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
const ENV_OF: Record<Arm, string> = { P: '', A0: BASE, LE: `${BASE},levelExplicit`, LEM: `${BASE},levelExplicit,memory` };
const TURNS_PER_SESSION = 5; const ROUNDS = 2 * TURNS_PER_SESSION; const DAY = 86_400_000; const T0 = Date.parse('2026-11-16T09:00:00Z');
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
const TOPIC: Record<Form, string> = { articles: 'a, an and the', copula: 'am, is and are', thirdS: 'he, she and it with -s' };

interface Learner { idx: number; form: Form; band: 'A1' | 'A2' | 'B2'; status: string; primary: 'W1' | 'W2' }
// 60 NEW learners (ids 100-159, never used in ESL1/ESL2): 24 A1, 24 A2, 12 B2 (no-harm check). Forms rotate evenly within each band.
export const LEARNERS: Learner[] = Array.from({ length: 60 }, (_, i) => {
  const idx = 100 + i; const band = i < 24 ? 'A1' : i < 48 ? 'A2' : 'B2'; const k = i % 12; const forms: Form[] = ['articles', 'copula', 'thirdS'];
  return { idx, form: forms[k % 3], band, status: band === 'B2' ? 'proficient' : k < 6 ? 'not_assessed' : 'emerging', primary: (Math.floor(k / 3) % 2 === 0 ? 'W1' : 'W2') as 'W1' | 'W2' };
});
const L_OF = (idx: number): Learner => LEARNERS[idx - 100];
interface Turn { session: 1 | 2; learner: string; production: Production; tutor?: string; raw?: string; [k: string]: unknown }
interface Sess { arm: Arm; rep: number; learnerIdx: number; seed: string; state: KState; start: KState; entries: any[]; v2: ProfileV2; turns: Turn[]; stateAfterS1?: KState }

function planOf(l: Learner, arm: Arm) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[arm];
  const input: PlanInput = { objectiveId: `ESL-${l.form}`, masteryStatus: l.status, masteryEstimate: l.status === 'proficient' ? 0.8 : l.status === 'emerging' ? 0.3 : 0.1, evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [], misconceptions: l.status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }], supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [], gradeLevel: l.band === 'A1' ? 4 : l.band === 'A2' ? 9 : 18, subject: 'Grammar', relatedSecureObjectives: 0, belowB1: belowB1(l.band) };
  const plan = selectTeachingPlan(input);
  const lines = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ESL-${l.form} "${LESSONS[l.form].objective}". Status: ${STATUS_WORDS[l.status]}.`, ...planLines(plan, undefined, l.status), '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  return { plan, text: arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n') };
}
const sessionTurns = (s: Sess) => { const cur = s.turns[s.turns.length - 1].session; return s.turns.filter((t) => t.session === cur); };
function history(turns: Turn[], form: Form) {
  const items = LESSONS[form].spec.items; const hist: any[] = []; let active: string | undefined; let misses = 0;
  for (const t of turns) {
    hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break;
    const prev = items.find((x) => x.id === active); const ok = prev ? Boolean(evaluateAgainstKey(t.learner, prev as never)) : false;
    const verdict = prev ? (ok ? 'CORRECT' : 'INCORRECT') : 'NOT_EVALUATED'; if (verdict === 'INCORRECT') misses++;
    const shown = [...items].reverse().find((it) => norm(t.tutor!).includes(norm(coreOf(it.prompt)).slice(0, 30))); if (shown) active = shown.id;
    hist.push({ role: 'assistant', content: t.tutor, languageTurn: { assessment: { verdict, relevance: prev ? 'ACTIVE_ITEM' : 'NO_ACTIVE_ITEM', criteria: ok && prev?.criteria ? prev.criteria : [], next: 'SAME_ITEM', source: 'tutor_assessment' }, ...(active ? { activeItem: { id: `lesson:${active}`, source: 'lesson', lessonItemId: active } } : {}), hintLevel: Math.min(6, Math.max(1, misses)), ...((t.rulesIntroduced as number[] | undefined)?.length ? { rulesIntroduced: t.rulesIntroduced } : {}), ...(t.closingAsk ? { closingAsk: t.closingAsk } : {}) } });
  }
  return hist;
}
const nowOf = (s: Sess) => new Date(T0 + (s.turns[s.turns.length - 1].session - 1) * DAY + s.turns.length * 60_000);
function langCtx(s: Sess, envOverride?: string) {
  process.env.ENARA_ENGINE_V2 = envOverride ?? ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const lesson0 = LESSONS[l.form]; const st = sessionTurns(s); const message = st[st.length - 1].learner;
  const hist = history(st.slice(0, -1), l.form); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const signals = detectTurnSignals(message, hist, lesson);
  const moves = selectLanguageMoves({ band: levelBand(l.band), targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: l.status });
  const learner = deriveLearnerContext({ courseLevel: l.band, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message], objectiveStatus: l.status });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec) : undefined;
  const planPrimary = envOverride === undefined && s.arm !== 'P' ? planOf(l, s.arm).plan.primary : undefined;
  const { explicit, ruleFirst } = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: lesson0.spec, moves });
  // cross-session learner profile, as production loads it (loadProfileLines): error-code lines always, v2 lines only with `memory`
  const now = nowOf(s); const opening = !hist.some((h: any) => h.role === 'user');
  const profile = envOverride === undefined && s.arm !== 'P' ? [...summarizeProfile(s.entries, now), ...(engineV2('memory') ? summarizeProfileV2(s.v2, { now, opening: opening && st.length === 1 }) : [])] : [];
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: lesson0.title, spec: lesson0.spec }, signals, moves, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => sessionTurns(s).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function tutorPrompt(s: Sess): string {
  const l = L_OF(s.learnerIdx);
  if (s.arm === 'P') { const L = LESSONS[l.form]; const sp = L.spec; return `You are a friendly English tutor. Help the student learn the lesson below through conversation. Keep replies short and in simple English.\n\nLesson: ${L.title}. ${L.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}\n\nPractice exercises you may use:\n${sp.items.map((i, k) => `${k + 1}. ${i.prompt}`).join('\n')}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`; }
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next). Do NOT write an [[assess ...]] marker.\n\n${planOf(l, s.arm).text}\n\n${langCtx(s).prompt}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}
function leakIn(s: Sess, text: string): number {
  const items = LESSONS[L_OF(s.learnerIdx).form].spec.items; const st = sessionTurns(s); const tried = new Set<string>(); let active: string | undefined;
  st.forEach((t, k) => { if (k >= 1 && active) tried.add(active); if (t.tutor !== undefined && k < st.length - 1) { const sh = [...items].reverse().find((it) => norm(t.tutor!).includes(norm(coreOf(it.prompt)).slice(0, 30))); if (sh) active = sh.id; } });
  if (active) tried.add(active); const nt = ` ${norm(text)} `; let n = 0;
  for (const it of items) { if (tried.has(it.id)) continue; const core = coreOf(it.prompt); for (const a of it.acceptedAnswers) { const nf = norm(core.includes('___') ? core.replace('___', a) : a); if ((nf.length >= 8 && nt.includes(` ${nf} `)) || new RegExp(`\\b(the answer is|answer:|correct answer is)\\s*["'“]?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) { n++; break; } } }
  return n;
}
function applyTutor(s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const text = raw.trim(); let final = text; let removed = 0; let closingAsk: string | undefined;
  const leakRaw = leakIn(s, text);
  if (s.arm !== 'P') {
    const ctx = langCtx(s); const g = applyReplyGuards(ctx, text, last.learner); final = g.text; removed = g.removed; closingAsk = g.closingAsk;
    process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const l = L_OF(s.learnerIdx);
    Object.assign(last, { moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.band), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ...(closingAsk ? { closingAsk } : {}), profileLines: (ctx as any).history?.length ?? 0 });
    // record the turn into the cross-session profile, as completeLanguageTurn/recordProfileTurn do (error code from the engine's diagnosis; independent success on a key-correct first answer)
    const sig = ctx.signals as any; const item = sig.activeLessonItem; const now = nowOf(s);
    const indep = sig.keyVerdict === 'CORRECT' && (sig.learning?.hintTurnsOnItem ?? 0) === 0 && item ? item : undefined;
    const o = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId: 'lsn', lessonTitle: LESSONS[l.form].title };
    if (o.errorCode || o.independentSuccessOn) s.entries = applyTurn(s.entries, o as never);
    if (engineV2('memory') && o.independentSuccessOn) s.v2 = applyTurnV2(s.v2, o as never);
  }
  Object.assign(last, { tutor: final, ...(final !== text ? { raw: text } : {}), leakRaw, leakFinal: leakIn(s, final), twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', twoAsksRaw: hasTwoAsks(text), ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'), (k, v) => (/At$/.test(k) && typeof v === 'string' ? new Date(v) : v));
const keyOf = (s: { learnerIdx: number; arm: Arm; rep: number }) => `s${s.learnerIdx}_${s.arm}_r${s.rep}`;
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const opener = (l: Learner, session: 1 | 2): Turn => ({ session, learner: session === 1 ? `Hello! Can you give me an exercise on ${TOPIC[l.form]}?` : `Hello again! Can we practise ${TOPIC[l.form]} again today?`, production: { kind: 'none', text: '' } });
// 12 cells per round: arm x replication x 3 parts of 20 sessions.
const cells = () => ARMS.flatMap((arm) => REPS.flatMap((rep) => [0, 1, 2].map((p) => ({ id: `${arm}${rep}${p}`, arm, keys: LEARNERS.filter((l) => l.idx % 3 === p).map((l) => keyOf({ learnerIdx: l.idx, arm, rep })) }))));
if (cmd === 'init') {
  const dir = a1; mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
  for (const l of LEARNERS) for (const arm of ARMS) for (const rep of REPS) { const st = initialState(l.form, l.band, l.primary); const s: Sess = { arm, rep, learnerIdx: l.idx, seed: `esl3|L${l.idx}|rep${rep}`, state: st, start: st, entries: [], v2: { beliefs: [], worked: [] }, turns: [opener(l, 1)] }; if (!existsSync(sf(dir, keyOf(s)))) save(dir, s); }
  writeFileSync(path.join(dir, 'cells.json'), JSON.stringify(cells(), null, 1)); console.log('sessions', LEARNERS.length * ARMS.length * REPS.length, 'cells', cells().length);
} else if (cmd === 'tprompts') {
  const dir = a1; const cell = cells().find((c) => c.id === a2)!; let n = 0;
  for (const key of cell.keys) { const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined || s.turns.length > ROUNDS) continue; console.log(`\n########## SESSION ${key} ##########\n${tutorPrompt(s)}`); n++; }
  console.log(`\n(${n} session(s) need a tutor reply in this cell)`);
} else if (cmd === 'tapply') {
  const dir = a1; const cell = cells().find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0;
  for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; applyTutor(s, t); save(dir, s); n++; }
  console.log('applied', n);
} else if (cmd === 'jprep') {
  const dir = a1; const round = Number(a2); const cases: { id: string; text: string }[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) {
    const s = load(dir, f.replace(/\.json$/, '')); const cur = s.turns[round - 1]; if (!cur?.tutor || cur.judgeInput) { if (cur && !cur.tutor) console.log('NO TUTOR REPLY', f); continue; }
    const prev = s.turns[round - 2]; const prevTutor = prev && prev.session === cur.session ? prev.tutor : undefined;
    cur.judgeInput = judgeCase(s.state, prevTutor, cur.production, cur.learner, cur.tutor); save(dir, s);
    cases.push({ id: `c${sha(`esl3|${f}|${round}`).slice(0, 10)}`, text: cur.judgeInput as string });
    const keymap = path.join(dir, 'judge', `r${round}_KEY.json`); const km = existsSync(keymap) ? JSON.parse(readFileSync(keymap, 'utf8')) : {}; km[`c${sha(`esl3|${f}|${round}`).slice(0, 10)}`] = f.replace(/\.json$/, ''); writeFileSync(keymap, JSON.stringify(km));
  }
  const files = writeJudgeBatches(path.join(dir, 'judge'), `r${round}`, cases, 36); writeFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), JSON.stringify(files, null, 1));
  console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
} else if (cmd === 'japply') {
  const dir = a1; const round = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
  const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
  let n = 0; let rej = 0;
  for (const [cid, j] of Object.entries(out)) {
    const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.events) continue;
    const r = applyEvents(s.state, j.events as JudgeEvent[], cur.production); Object.assign(cur, { events: j.events, next_task: j.next_task, applied: r.applied, rejected: r.rejected, stateAfter: r.state }); s.state = r.state; rej += r.rejected.length;
    if (round === TURNS_PER_SESSION) { s.stateAfterS1 = r.state; s.turns.push(opener(L_OF(s.learnerIdx), 2)); }
    else if (round < ROUNDS) { const p = learnerReply(s.state, j.next_task as NextTask, s.seed, round + 1); s.turns.push({ session: cur.session, learner: p.text, production: p }); }
    save(dir, s); n++;
  }
  console.log('applied', n, 'rejected events', rej);
} else if (cmd === 'status') {
  const dir = a1; const c: Record<string, number> = {};
  for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = load(dir, f.replace(/\.json$/, '')); const k = `${s.turns.filter((t) => t.tutor !== undefined).length} replies / ${s.turns.filter((t) => t.events).length} judged`; c[k] = (c[k] ?? 0) + 1; }
  console.log(JSON.stringify(c));
} else if (cmd === 'post') {
  const dir = a1; const rows: any[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx); rows.push({ learner: l.idx, rep: s.rep, band: l.band, form: l.form, arm: s.arm, explicitFirst: l.band !== 'B2', ...postTest(s.state, s.seed), final: s.state.s, afterS1: s.stateAfterS1?.s ?? null, start: s.start.s }); }
  writeFileSync(path.join(dir, 'POST.json'), JSON.stringify(rows, null, 1)); console.log('post rows', rows.length);
} else if (cmd === 'rateprep') {
  const dir = a1; const out = a2; mkdirSync(out, { recursive: true }); const labels = ['V', 'W']; /* pre-registered: one rater pass on replication 1, two tutors per case, 10 learners per batch */ const key: Record<string, any> = {};
  const order = [...LEARNERS].sort((a, b) => (sha(`esl3r|${a.idx}`) < sha(`esl3r|${b.idx}`) ? -1 : 1));
  for (let n = 0; n * 10 < order.length; n++) {
    const id = `rt${String(n + 1).padStart(2, '0')}`; let t = `Batch ${id}. Rate every case as described in the rater instructions (two tutors per case) and write the JSON to the file named in your task.\n`; key[id] = {};
    for (const l of order.slice(n * 10, n * 10 + 10)) {
      const arms = [...ARMS].sort((a, b) => (sha(`esl3ra|${l.idx}|${a}`) < sha(`esl3ra|${l.idx}|${b}`) ? -1 : 1)); const cid = `c${sha(`esl3case|${l.idx}`).slice(0, 6)}`; key[id][cid] = { studentIdx: l.idx, labels: Object.fromEntries(arms.map((a, k) => [labels[k], a])) };
      t += `\n\n=========== CASE ${cid} ===========\nLearner: English learner in Egypt (first language Arabic). Lesson topic: ${LESSONS[l.form].title}. Two short lessons on two days.\n`;
      arms.forEach((a, k) => { const s = load(dir, `s${l.idx}_${a}_r1`); t += `\n----- TUTOR ${labels[k]} -----\n${s.turns.map((x) => `${x.session === 2 && s.turns.find((y) => y.session === 2) === x ? '(next day)\n' : ''}STUDENT: ${x.learner}\nTUTOR: ${x.tutor ?? ''}`).join('\n')}\n`; });
    }
    writeFileSync(path.join(out, `${id}.md`), t);
  }
  writeFileSync(path.join(out, 'KEY.json'), JSON.stringify(key, null, 1)); console.log('rater batches', Object.keys(key).length);
} else if (cmd === 'tags') {
  const dir = a1; const rows: any[] = [];
  for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = load(dir, f.replace(/\.json$/, '')); s.turns.forEach((t, k) => rows.push({ learner: s.learnerIdx, arm: s.arm, band: L_OF(s.learnerIdx).band, turn: k + 1, session: t.session, moves: t.moves ?? [], strand: t.strand ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, twoAsks: t.twoAsks ?? false, profileLines: t.profileLines ?? 0, applied: t.applied ?? [], rejected: t.rejected ?? [], twoAsksRaw: t.twoAsksRaw ?? false, stateAfter: t.stateAfter ?? null })); }
  writeFileSync(a2, JSON.stringify(rows, null, 1)); console.log('turn rows', rows.length);
}
