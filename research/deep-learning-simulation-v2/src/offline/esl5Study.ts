// SIMULATION ONLY. NO API. ESL stage-5 CONFIRMATORY run (pre-registered: config/agent_sim_esl5/PROTOCOL.md). Copy of esl4Study.ts (same simulator, same
// P+ baseline, same engine glue) with: 120 NEW learners (108 explicit-first + 12 B2, ids 500-619, seeds "esl5|..."), arm LE = ESL4's A0+LE plus the `esl5`
// bundle (liveError, releaseAfterTwo, reviewOpen, fadeKnown, ownSentence), ENARA's stored learner record persisted between turns and sessions with the
// backend's own record code, judges on config/agent_sim_esl5/LEARNING_RULES.md, early-leak / answer-release / stuck-run tags, agreement scored by session.
// The engine sees only what a real tutor sees: the learner's messages, the lesson data, the course level / objective record, and ENARA's own stored
// record (entries, liveErrors, knownPoints) built from its own turn evidence. It never reads the simulator's knowledge state, beliefs or seeds.
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/esl5Study.ts <cmd> ...
// Commands: overlap <dir> | init <dir> | tprompts <dir> <cell> | tapply <dir> <cell> <answers.json> | jprep <dir> <round> | japply <dir> <round> | status <dir>
//           | post <dir> | tags <dir> <out> | rateprep <dir> <out> | agreeprep <dir> <round> | agreescore <dir> | fidprep <dir> | promptcheck <dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks,
  esl5Adjust, knownKey, independentSuccessItem, type LanguageTeachingContext,
} from '../../../../backend/src/services/languageTeachingContext';
import { evaluateAgainstKey, isSuccess, isFailure } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy, completeLanguageTurn } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { applyTurn, summarizeProfile, applyLiveErrors, applyKnownPoints, liveErrorTypes, type Esl5Record } from '../../../../backend/src/services/learnerLanguageProfile';
import { LESSONS, postItems, FORMS, type Form } from './eslFixtures';
import { initialState, learnerReply, applyEvents, judgeCase, writeJudgeBatches, readJudge, postTest, sha, rand, BELIEF_TEXT, POST_PROBES, type KState, type Production, type JudgeEvent, type NextTask } from './learnerSim';

type Arm = 'PP' | 'LE';
const ARMS: Arm[] = ['PP', 'LE'];
const ROOT = path.join(__dirname, '../..');
const PPLUS_FILE = path.join(ROOT, 'config/agent_sim_esl4/PPLUS_PROMPT.txt');
const PPLUS_SHA = 'e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472';
const PPLUS = readFileSync(PPLUS_FILE, 'utf8').trim();
const REPS = [1, 2] as const;
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
// LE = ESL4's A0+LE env plus the esl5 bundle. `closing` is already in BASE, so reviewOpen's closing item runs with no extra switch (shortRecap NOT added).
export const ENV_OF: Record<Arm, string> = { PP: '', LE: `${BASE},levelExplicit,esl5` };
const TURNS_PER_SESSION = 5; const ROUNDS = 2 * TURNS_PER_SESSION; const DAY = 86_400_000; const T0 = Date.parse('2027-01-11T09:00:00Z');
const LESSON_ID = 'lsn';
const NS = 'esl5';
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
const TOPIC: Record<Form, string> = { articles: 'a, an and the', copula: 'am, is and are', thirdS: 'he, she and it with -s' };

interface Learner { idx: number; form: Form; band: 'A1' | 'A2' | 'B2'; status: string; primary: 'W1' | 'W2' }
// 120 NEW learners (ids 500-619): 54 A1 (500-553), 54 A2 (554-607), 12 B2 (608-619, no-harm check). Forms rotate within each band; primary belief alternates in blocks of 3.
export const LEARNERS: Learner[] = Array.from({ length: 120 }, (_, i) => {
  const idx = 500 + i; const band = i < 54 ? 'A1' : i < 108 ? 'A2' : 'B2'; const k = i % 12; const forms: Form[] = ['articles', 'copula', 'thirdS'];
  return { idx, form: forms[i % 3], band, status: band === 'B2' ? 'proficient' : k < 6 ? 'not_assessed' : 'emerging', primary: (Math.floor(k / 3) % 2 === 0 ? 'W1' : 'W2') as 'W1' | 'W2' };
});
const L_OF = (idx: number): Learner => LEARNERS[idx - 500];
const seedOf = (idx: number, rep: number) => `${NS}|L${idx}|rep${rep}`;

// ESL5 post-test sentences: one NEW sentence per frozen probe slot (POST_PROBES), testing the same wrong beliefs (LEARNING_RULES 4a). Scoring is the frozen
// generator postTest(state, seed); the sentences document what each probe stands for and are checked for overlap with ESL1-4 and the validation cases.
export const POST_ITEMS_ESL5: Record<Form, { id: string; prompt: string; answer?: string }[]> = {
  articles: [
    { id: 'c1', prompt: 'Write a word if one is needed: My cousin bought ___ umbrella yesterday.', answer: 'an' },
    { id: 'c2', prompt: 'Write a word if one is needed: Our neighbour is ___ baker.', answer: 'a' },
    { id: 'c3', prompt: 'Write a word if one is needed: Karim drives ___ taxi in Giza.', answer: 'a' },
    { id: 'c4', prompt: 'Write a word if one is needed: Mona wants ___ envelope for her letter.', answer: 'an' },
    { id: 'f1', prompt: 'Write two sentences about a shop near your home.' },
    { id: 'f2', prompt: 'Write two sentences about a present you got last year.' },
  ],
  copula: [
    { id: 'c1', prompt: 'Write a word if one is needed: The mangoes ___ sweet this summer.', answer: 'are' },
    { id: 'c2', prompt: 'Write a word if one is needed: Our classroom ___ very quiet this morning.', answer: 'is' },
    { id: 'c3', prompt: 'Write a word if one is needed: I ___ from Alexandria.', answer: 'am' },
    { id: 'c4', prompt: 'Write a word if one is needed: My cousins ___ at the market now.', answer: 'are' },
    { id: 'f1', prompt: 'Write two sentences about your neighbours and how they are today.' },
    { id: 'f2', prompt: 'Write two sentences about a room in your home and what it is like.' },
  ],
  thirdS: [
    { id: 'c1', prompt: 'Write the correct form: My grandfather ___ (read) the newspaper after breakfast.', answer: 'reads' },
    { id: 'c2', prompt: 'Write the correct form: Laila ___ (fix) old radios in her shop.', answer: 'fixes' },
    { id: 'c3', prompt: 'Write the correct form: The baby ___ (carry) a small toy everywhere.', answer: 'carries' },
    { id: 'c4', prompt: 'Write the correct form: Our cat ___ (sleep) on the sofa.', answer: 'sleeps' },
    { id: 'f1', prompt: 'Write two sentences about what your neighbour does after work.' },
    { id: 'f2', prompt: 'Write two sentences about a cousin and what he or she does on Fridays.' },
  ],
};

interface Turn { session: 1 | 2; learner: string; production: Production; tutor?: string; raw?: string; ev5?: Record<string, unknown>; [k: string]: unknown }
// rec = ENARA's stored learner record (LearnerLanguageProfile fields the engine reads): error entries, liveErrors, knownPoints. Never simulator state.
interface Rec { entries: any[]; liveErrors: Record<string, { seen: number; lastCorrect?: boolean }>; knownPoints: Record<string, number> }
interface Sess { arm: Arm; rep: number; learnerIdx: number; seed: string; state: KState; start: KState; rec: Rec; turns: Turn[]; stateAfterS1?: KState; recAfterS1?: Rec }

function planOf(l: Learner, arm: Arm) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[arm];
  const input: PlanInput = { objectiveId: `ESL-${l.form}`, masteryStatus: l.status, masteryEstimate: l.status === 'proficient' ? 0.8 : l.status === 'emerging' ? 0.3 : 0.1, evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [], misconceptions: l.status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }], supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [], gradeLevel: l.band === 'A1' ? 4 : l.band === 'A2' ? 9 : 18, subject: 'Grammar', relatedSecureObjectives: 0, belowB1: belowB1(l.band) };
  const plan = selectTeachingPlan(input);
  const lines = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ESL-${l.form} "${LESSONS[l.form].objective}". Status: ${STATUS_WORDS[l.status]}.`, ...planLines(plan, undefined, l.status), '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  return { plan, text: arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n') };
}
const sessionTurns = (s: Sess) => { const cur = s.turns[s.turns.length - 1].session; return s.turns.filter((t) => t.session === cur); };
const shownItem = (tutor: string, form: Form) => [...LESSONS[form].spec.items].reverse().find((it) => norm(tutor).includes(norm(coreOf(it.prompt)).slice(0, 30)));
// The engine's history, as ESL4 rebuilt it from stored turns (verdict from the answer key), plus the ESL5 evidence the backend stored on each reply.
function history(turns: Turn[], form: Form) {
  const items = LESSONS[form].spec.items; const hist: any[] = []; let active: string | undefined; let misses = 0;
  for (const t of turns) {
    hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break;
    const prev = items.find((x) => x.id === active); const ok = prev ? Boolean(evaluateAgainstKey(t.learner, prev as never)) : false;
    const verdict = prev ? (ok ? 'CORRECT' : 'INCORRECT') : 'NOT_EVALUATED'; if (verdict === 'INCORRECT') misses++;
    const shown = shownItem(t.tutor!, form); if (shown) active = shown.id;
    hist.push({ role: 'assistant', content: t.tutor, languageTurn: { assessment: { verdict, relevance: prev ? 'ACTIVE_ITEM' : 'NO_ACTIVE_ITEM', criteria: ok && prev?.criteria ? prev.criteria : [], next: 'SAME_ITEM', source: 'tutor_assessment' }, ...(active ? { activeItem: { id: `lesson:${active}`, source: 'lesson', lessonItemId: active } } : {}), hintLevel: Math.min(6, Math.max(1, misses)), ...((t.rulesIntroduced as number[] | undefined)?.length ? { rulesIntroduced: t.rulesIntroduced } : {}), ...(t.closingAsk ? { closingAsk: t.closingAsk } : {}), ...(t.ev5 ?? {}) } });
  }
  return hist;
}
const nowOf = (s: Sess) => new Date(T0 + (s.turns[s.turns.length - 1].session - 1) * DAY + s.turns.length * 60_000);
/** What loadEsl5Record returns for this learner's stored record (backend liveErrorTypes on the stored fields). */
const esl5Record = (r: Rec): Esl5Record => ({ live: liveErrorTypes({ entries: r.entries, liveErrors: r.liveErrors }), knownPoints: { ...r.knownPoints } });
function langCtx(s: Sess) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const lesson0 = LESSONS[l.form]; const st = sessionTurns(s); const message = st[st.length - 1].learner;
  const hist = history(st.slice(0, -1), l.form); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const signals0 = detectTurnSignals(message, hist, lesson);
  const moves0 = selectLanguageMoves({ band: levelBand(l.band), targetLanguage: 'English', lessonStatus: 'structured', signals: signals0, masteryStatus: l.status });
  // ESL5 (reviewOpen, fadeKnown): ENARA's own stored record, read as buildLanguageTeachingContext does, then esl5Adjust (backend code).
  const record = engineV2('reviewOpen') || engineV2('fadeKnown') ? esl5Record(s.rec) : undefined;
  const { signals, moves } = esl5Adjust({ signals: signals0, moves: moves0, record, history: hist, lessonId: LESSON_ID });
  const learner = deriveLearnerContext({ courseLevel: l.band, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message], objectiveStatus: l.status });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec) : undefined;
  const planPrimary = planOf(l, s.arm).plan.primary; process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const { explicit, ruleFirst } = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: lesson0.spec, moves });
  const profile = summarizeProfile(s.rec.entries, nowOf(s));
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: LESSON_ID, title: lesson0.title, spec: lesson0.spec }, signals, moves, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(record ? { record } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => sessionTurns(s).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function enginePart(s: Sess): string { const l = L_OF(s.learnerIdx); return `${planOf(l, s.arm).text}\n\n${langCtx(s).prompt}`; }
function tutorPrompt(s: Sess): string {
  const l = L_OF(s.learnerIdx);
  if (s.arm === 'PP') { const L = LESSONS[l.form]; const sp = L.spec; return `${PPLUS}\n\nLearner level: ${l.band} (CEFR)\n\nLesson: ${L.title}. ${L.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}\n\nPractice exercises you may use:\n${sp.items.map((i, k) => `${k + 1}. ${i.prompt}`).join('\n')}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`; }
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next). Do NOT write an [[assess ...]] marker.\n\n${enginePart(s)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}
// Item bookkeeping shared by the leak, release and stuck tags (same for both arms; from text and the simulator's production facts, never shown to tutors).
// The simulator's "(I leave it empty, no word)" is the learner's genuine omission answer (W1 error), so it counts as an attempt; only "don't know"-type replies do not.
const DONT = /don'?t know|not sure/i;
function itemLedger(s: Sess) {
  const form = L_OF(s.learnerIdx).form; const st = sessionTurns(s); const fails: Record<string, number> = {}; const solved = new Set<string>(); const tried = new Set<string>(); let active: string | undefined;
  st.forEach((t, k) => {
    if (k >= 1 && active) { tried.add(active); const p = t.production; if (p.kind === 'blank' || p.kind === 'sentence') { if (p.correct) solved.add(active); else if (!DONT.test(t.learner)) fails[active] = (fails[active] ?? 0) + 1; } }
    if (t.tutor !== undefined && k < st.length - 1) { const sh = shownItem(t.tutor, form); if (sh) active = sh.id; }
  });
  return { fails, solved, tried, active };
}
function answersIn(s: Sess, text: string, skip: (id: string) => boolean): string[] {
  const items = LESSONS[L_OF(s.learnerIdx).form].spec.items; const nt = ` ${norm(text)} `; const out: string[] = [];
  for (const it of items) { if (skip(it.id)) continue; const core = coreOf(it.prompt); for (const a of it.acceptedAnswers) { const nf = norm(core.includes('___') ? core.replace('___', a) : a); if ((nf.length >= 8 && nt.includes(` ${nf} `)) || new RegExp(`\\b(the answer is|answer:|correct answer is)\\s*["'“]?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) { out.push(it.id); break; } } }
  return out;
}
// ESL4 leak (answer of a lesson item never tried) kept for continuity; ESL5 early leak = answer of an unsolved item with fewer than 2 genuine failed attempts.
function leakIn(s: Sess, text: string): number { const g = itemLedger(s); const tried = new Set(g.tried); if (g.active) tried.add(g.active); return answersIn(s, text, (id) => tried.has(id)).length; }
function earlyLeakIn(s: Sess, text: string): { early: number; late: number } {
  const g = itemLedger(s); const hit = answersIn(s, text, (id) => g.solved.has(id));
  return { early: hit.filter((id) => (g.fails[id] ?? 0) < 2).length, late: hit.filter((id) => (g.fails[id] ?? 0) >= 2).length };
}
const OWN_SENTENCE_SET = /\bwrite one sentence about\b/i; // same test as languageTurnPipeline (not exported there); completeLanguageTurn applies it
async function applyTutor(s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const text = raw.trim(); let final = text; let removed = 0; let closingAsk: string | undefined;
  const leakRaw = leakIn(s, text); const elRaw = earlyLeakIn(s, text);
  if (s.arm === 'LE') {
    const ctx = langCtx(s); const g = applyReplyGuards(ctx, text, last.learner); final = g.text; removed = g.removed; closingAsk = g.closingAsk;
    process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const l = L_OF(s.learnerIdx); const sig = ctx.signals as any; const now = nowOf(s);
    // The backend's own evidence for this reply (completeLanguageTurn without a DB: no institution/student id, so recordProfileTurn does not write);
    // the record update below is recordProfileTurn's body with the same pure helpers.
    const lt: any = await completeLanguageTurn({ language: ctx, reply: final, learnerText: last.learner, messageId: `${keyOf(s)}_t${s.turns.length}`, removed, ...(closingAsk ? { closingAsk: closingAsk as never } : {}), institutionId: '', studentId: '' });
    const ev5: Record<string, unknown> = {}; for (const k of ['liveError', 'answerReleased', 'reviewOpen', 'fadeCheck', 'fadeCheckAnswered', 'fadeFailed', 'ownSentence']) if (lt[k] !== undefined) ev5[k] = lt[k];
    // The answer key only confirms success; ESL4's history stands in for the tutor's (absent) marker with INCORRECT when a lesson item was answered and the
    // key did not accept it. The same stand-in is used here so the record and the history agree.
    const verdict = isSuccess(lt.assessment?.verdict) ? lt.assessment.verdict : sig.answeringCheck && sig.activeLessonItem ? 'INCORRECT' : lt.assessment?.verdict;
    const indep = independentSuccessItem(ctx, { assessment: { verdict } });
    const fadeFailed = engineV2('fadeKnown') && lt.fadeCheckAnswered?.length && isFailure(verdict) ? lt.fadeCheckAnswered : undefined;
    const o: any = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId: LESSON_ID, lessonTitle: LESSONS[l.form].title,
      ...(engineV2('liveError') ? { ...(sig.liveError ? { liveError: sig.liveError.code } : {}), ...(sig.liveTarget && isSuccess(verdict) ? { liveCorrect: sig.liveTarget } : {}) } : {}),
      ...(engineV2('fadeKnown') ? { knownInc: (indep?.criteria ?? []).map((c: number) => knownKey(LESSON_ID, c)), knownReset: ((fadeFailed as number[] | undefined) ?? []).map((c) => knownKey(LESSON_ID, c)) } : {}) };
    if (o.errorCode || o.independentSuccessOn) s.rec.entries = applyTurn(s.rec.entries, o);
    if (engineV2('liveError') && (o.liveError || o.liveCorrect)) s.rec.liveErrors = applyLiveErrors(s.rec.liveErrors as never, o) as Rec['liveErrors'];
    if (engineV2('fadeKnown') && (o.knownInc?.length || o.knownReset?.length)) s.rec.knownPoints = applyKnownPoints(s.rec.knownPoints, o);
    Object.assign(last, { moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.band), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ...(closingAsk ? { closingAsk } : {}), profileLines: (ctx as any).history?.length ?? 0, ev5, engineVerdict: verdict ?? null, recordLive: (ctx as any).record?.live ?? [] });
  }
  const el = earlyLeakIn(s, final);
  Object.assign(last, { tutor: final, ...(final !== text ? { raw: text } : {}), leakRaw, leakFinal: leakIn(s, final), earlyLeakRaw: elRaw.early, earlyLeakFinal: el.early, lateAnswerFinal: el.late, answerReleased: Boolean(last.ev5?.answerReleased), twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', twoAsksRaw: hasTwoAsks(text), ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- overlap check
function walk(dir: string, out: string[] = []) { for (const f of readdirSync(dir)) { const p = path.join(dir, f); const st = statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(json|md|txt|ts|py)$/.test(f)) out.push(p); } return out; }
function overlapCheck(studyDir: string) {
  const rep = path.join(ROOT, 'reports/exp4'); const own = path.resolve(studyDir);
  const files = walk(rep).filter((f) => !(path.resolve(f).startsWith(own + path.sep) && !path.resolve(f).includes(`${path.sep}validation${path.sep}`)));
  const ids = new Set<number>(); const seeds = new Set<string>(); let corpus = '';
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/"learnerIdx":\s*(\d+)/g)) ids.add(Number(m[1])); for (const m of t.matchAll(/"seed":\s*"([^"]+)"/g)) seeds.add(m[1]); corpus += ` ${norm(t)} `; }
  // ids/seeds defined in code but not always stored as learnerIdx (ESL1 students 0-17, ESL2 0-35, ESL3 100-159, ESL3 validation 200-211, ESL4 300-407, ESL5 validation 0-11)
  for (const [a, b] of [[0, 35], [100, 159], [200, 211], [300, 407]]) for (let i = a; i <= b; i++) ids.add(i);
  for (const f of ['src/offline/eslFixtures.ts', 'src/offline/learnerSim.ts', 'src/offline/esl5_valprep.py', 'src/offline/esl3Validate.ts']) corpus += ` ${norm(readFileSync(path.join(ROOT, f), 'utf8'))} `;
  for (const form of FORMS) for (const v of ['v1', 'v2'] as const) for (const b of ['A1', 'A2', 'B2'] as const) for (const it of postItems(form, b, v)) corpus += ` ${norm(it.prompt)} `;
  const myIds = LEARNERS.map((l) => l.idx); const mySeeds = LEARNERS.flatMap((l) => REPS.map((r) => seedOf(l.idx, r)));
  const idClash = myIds.filter((i) => ids.has(i)); const seedClash = mySeeds.filter((x) => seeds.has(x)); const nsClash = [...seeds].filter((x) => x.startsWith(`${NS}|`));
  const lessonText = ` ${FORMS.map((f) => LESSONS[f].spec.items.map((i) => norm(i.prompt)).join(' ')).join(' ')} `;
  const itemClash: string[] = [];
  for (const form of FORMS) for (const it of POST_ITEMS_ESL5[form]) {
    const core = coreOf(it.prompt); const variants = [norm(core.replace('___', ' ')), ...(it.answer ? [norm(core.replace('___', it.answer))] : [])];
    for (const v of variants) if (corpus.includes(` ${v} `) || lessonText.includes(` ${v} `)) itemClash.push(`${form}:${it.id}:"${v}"`);
  }
  const probesMatch = FORMS.every((f) => POST_PROBES[f].map((p) => p.id).join() === POST_ITEMS_ESL5[f].map((p) => p.id).join());
  const res = { _label: 'SIMULATION ONLY', filesScanned: files.length, priorLearnerIds: ids.size, priorSeeds: seeds.size, learnerIdClash: idClash, seedClash, namespaceClash: nsClash, postItemClash: itemClash, postSlotsMatchFrozenProbes: probesMatch, pass: !idClash.length && !seedClash.length && !nsClash.length && !itemClash.length && probesMatch };
  return res;
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'), (k, v) => (/At$/.test(k) && typeof v === 'string' ? new Date(v) : v));
function keyOf(s: { learnerIdx: number; arm: Arm; rep: number }) { return `s${s.learnerIdx}_${s.arm}_r${s.rep}`; }
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const opener = (l: Learner, session: 1 | 2): Turn => ({ session, learner: session === 1 ? `Hello! Can you give me an exercise on ${TOPIC[l.form]}?` : `Hello again! Can we practise ${TOPIC[l.form]} again today?`, production: { kind: 'none', text: '' } });
// 24 cells per round: arm x replication x 6 parts of 20 sessions (learner id mod 6).
const cells = () => ARMS.flatMap((arm) => REPS.flatMap((rep) => [0, 1, 2, 3, 4, 5].map((p) => ({ id: `${arm}${rep}${p}`, arm, keys: LEARNERS.filter((l) => l.idx % 6 === p).map((l) => keyOf({ learnerIdx: l.idx, arm, rep })) }))));
const caseId = (f: string, round: number) => `c${sha(`${NS}|${f}|${round}`).slice(0, 10)}`;
// Forbidden in the engine part of an LE prompt: anything from the simulator's state (belief labels, belief texts, strengths, seeds).
const FORBIDDEN = [/\b[WC][12]\b/, /strength/i, /KNOWLEDGE STATE/i, /\bprimary (wrong )?belief/i, /esl5\|L\d/, /Independent correct productions/i, ...FORMS.flatMap((f) => Object.values(BELIEF_TEXT[f]).map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')))];

async function main() {
  if (cmd === 'overlap') {
    const res = overlapCheck(a1); mkdirSync(a1, { recursive: true }); writeFileSync(path.join(a1, 'OVERLAP_CHECK.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  } else if (cmd === 'init') {
    const dir = a1;
    if (sha(readFileSync(PPLUS_FILE, 'utf8')) !== PPLUS_SHA) throw new Error('P+ prompt hash differs from ESL4 (e373018e...)');
    const ov = overlapCheck(dir); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, 'OVERLAP_CHECK.json'), JSON.stringify(ov, null, 1)); if (!ov.pass) throw new Error(`overlap check failed: ${JSON.stringify(ov)}`);
    mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
    for (const l of LEARNERS) for (const arm of ARMS) for (const rep of REPS) { const st = initialState(l.form, l.band, l.primary); const s: Sess = { arm, rep, learnerIdx: l.idx, seed: seedOf(l.idx, rep), state: st, start: st, rec: { entries: [], liveErrors: {}, knownPoints: {} }, turns: [opener(l, 1)] }; if (!existsSync(sf(dir, keyOf(s)))) save(dir, s); }
    writeFileSync(path.join(dir, 'cells.json'), JSON.stringify(cells(), null, 1)); writeFileSync(path.join(dir, 'POST_ITEMS.json'), JSON.stringify(POST_ITEMS_ESL5, null, 1));
    console.log('P+ hash ok; overlap check pass; sessions', LEARNERS.length * ARMS.length * REPS.length, 'cells', cells().length, 'env LE', ENV_OF.LE);
  } else if (cmd === 'tprompts') {
    const dir = a1; const cell = cells().find((c) => c.id === a2)!; let n = 0;
    for (const key of cell.keys) { const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined || s.turns.length > ROUNDS) continue; console.log(`\n########## SESSION ${key} ##########\n${tutorPrompt(s)}`); n++; }
    console.log(`\n(${n} session(s) need a tutor reply in this cell)`);
  } else if (cmd === 'promptcheck') {
    // dry check: the engine part of every pending LE prompt contains nothing from the simulator's state
    const dir = a1; let n = 0; const bad: string[] = []; const pp: string[] = [];
    for (const c of cells()) for (const key of c.keys) { const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; const full = tutorPrompt(s); const head = s.arm === 'LE' ? enginePart(s) : full.split('CONVERSATION SO FAR:')[0]; n++; for (const re of FORBIDDEN) if (re.test(head)) (s.arm === 'LE' ? bad : pp).push(`${key}:${re}`); }
    const res = { prompts: n, leFindings: bad, ppFindings: pp, pass: !bad.length && !pp.length }; writeFileSync(path.join(dir, `PROMPTCHECK_t${(load(dir, cells()[0].keys[0]).turns.length)}.json`), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  } else if (cmd === 'tapply') {
    const dir = a1; const cell = cells().find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0;
    for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; await applyTutor(s, t); save(dir, s); n++; }
    console.log('applied', n, 'of', cell.keys.length);
  } else if (cmd === 'jprep') {
    const dir = a1; const round = Number(a2); const cases: { id: string; text: string }[] = []; const keymap = path.join(dir, 'judge', `r${round}_KEY.json`); const km = existsSync(keymap) ? JSON.parse(readFileSync(keymap, 'utf8')) : {};
    for (const f of readdirSync(path.join(dir, 'sessions'))) {
      const s = load(dir, f.replace(/\.json$/, '')); const cur = s.turns[round - 1]; if (!cur?.tutor || cur.judgeInput) { if (cur && !cur.tutor) console.log('NO TUTOR REPLY', f); continue; }
      const prev = s.turns[round - 2]; const prevTutor = prev && prev.session === cur.session ? prev.tutor : undefined;
      cur.judgeInput = judgeCase(s.state, prevTutor, cur.production, cur.learner, cur.tutor); save(dir, s);
      cases.push({ id: caseId(f, round), text: cur.judgeInput as string }); km[caseId(f, round)] = f.replace(/\.json$/, '');
    }
    writeFileSync(keymap, JSON.stringify(km));
    const files = writeJudgeBatches(path.join(dir, 'judge'), `r${round}`, cases, 36, NS); writeFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), JSON.stringify(files, null, 1));
    console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'japply') {
    const dir = a1; const round = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
    let n = 0; let rej = 0;
    for (const [cid, j] of Object.entries(out)) {
      const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.events) continue;
      const r = applyEvents(s.state, j.events as JudgeEvent[], cur.production); Object.assign(cur, { stateBefore: s.state, events: j.events, next_task: j.next_task, applied: r.applied, rejected: r.rejected, stateAfter: r.state }); s.state = r.state; rej += r.rejected.length;
      if (round === TURNS_PER_SESSION) { s.stateAfterS1 = r.state; s.recAfterS1 = JSON.parse(JSON.stringify(s.rec)); s.turns.push(opener(L_OF(s.learnerIdx), 2)); }
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
    for (const f of readdirSync(path.join(dir, 'sessions'))) { const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx); const pt = postTest(s.state, s.seed); rows.push({ learner: l.idx, rep: s.rep, band: l.band, form: l.form, arm: s.arm, explicitFirst: l.band !== 'B2', rounds: s.turns.filter((t) => t.events).length, ...pt, items: pt.items.map((it) => ({ ...it, prompt: POST_ITEMS_ESL5[l.form].find((x) => x.id === it.id)?.prompt })), final: s.state.s, afterS1: s.stateAfterS1?.s ?? null, start: s.start.s }); }
    writeFileSync(path.join(dir, 'POST.json'), JSON.stringify(rows, null, 1)); console.log('post rows', rows.length);
  } else if (cmd === 'rateprep') {
    const dir = a1; const out = a2; mkdirSync(out, { recursive: true }); const labels = ['V', 'W']; /* pre-registered: one rater pass on replication 1, two tutors per case, 10 learners per batch */ const key: Record<string, any> = {};
    const order = [...LEARNERS].sort((a, b) => (sha(`${NS}r|${a.idx}`) < sha(`${NS}r|${b.idx}`) ? -1 : 1));
    for (let n = 0; n * 10 < order.length; n++) {
      const id = `rt${String(n + 1).padStart(2, '0')}`; let t = `Batch ${id}. Rate every case as described in the rater instructions (two tutors per case) and write the JSON to the file named in your task.\n`; key[id] = {};
      for (const l of order.slice(n * 10, n * 10 + 10)) {
        const arms = [...ARMS].sort((a, b) => (sha(`${NS}ra|${l.idx}|${a}`) < sha(`${NS}ra|${l.idx}|${b}`) ? -1 : 1)); const cid = `c${sha(`${NS}case|${l.idx}`).slice(0, 6)}`; key[id][cid] = { studentIdx: l.idx, labels: Object.fromEntries(arms.map((a, k) => [labels[k], a])) };
        t += `\n\n=========== CASE ${cid} ===========\nLearner: English learner in Egypt (first language Arabic). Lesson topic: ${LESSONS[l.form].title}. Two short lessons on two days.\n`;
        arms.forEach((a, k) => { const s = load(dir, `s${l.idx}_${a}_r1`); t += `\n----- TUTOR ${labels[k]} -----\n${s.turns.map((x) => `${x.session === 2 && s.turns.find((y) => y.session === 2) === x ? '(next day)\n' : ''}STUDENT: ${x.learner}\nTUTOR: ${x.tutor ?? ''}`).join('\n')}\n`; });
      }
      writeFileSync(path.join(out, `${id}.md`), t);
    }
    writeFileSync(path.join(out, 'KEY.json'), JSON.stringify(key, null, 1)); console.log('rater batches', Object.keys(key).length);
  } else if (cmd === 'tags') {
    // one row per tutored turn; stuck runs: >=3 consecutive learner answers in one session on the same task without a correct answer
    const dir = a1; const rows: any[] = []; const stuck: any[] = [];
    for (const f of readdirSync(path.join(dir, 'sessions'))) {
      const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx);
      s.turns.forEach((t, k) => { if (t.tutor === undefined) return; rows.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, band: l.band, turn: k + 1, session: t.session, moves: t.moves ?? [], strand: t.strand ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, earlyLeakRaw: t.earlyLeakRaw ?? 0, earlyLeakFinal: t.earlyLeakFinal ?? 0, lateAnswerFinal: t.lateAnswerFinal ?? 0, answerReleased: t.answerReleased ?? false, ev5: t.ev5 ?? {}, twoAsks: t.twoAsks ?? false, twoAsksRaw: t.twoAsksRaw ?? false, profileLines: t.profileLines ?? 0, production: t.production, events: t.events ?? null, next_task: t.next_task ?? null, applied: t.applied ?? [], rejected: t.rejected ?? [], stateBefore: t.stateBefore ?? null, stateAfter: t.stateAfter ?? null }); });
      for (const ses of [1, 2] as const) {
        const st = s.turns.filter((t) => t.session === ses); let runKey: string | undefined; let run = 0; let startTurn = 0;
        const flush = () => { if (run >= 3) stuck.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, band: l.band, session: ses, task: runKey, length: run, startTurn }); };
        for (let k = 1; k < st.length; k++) {
          const prevT = st[k - 1]; const p = st[k].production; if (prevT.tutor === undefined) break;
          const sh = shownItem(prevT.tutor, l.form); const nt = prevT.next_task as NextTask | undefined; const key = sh ? `item:${sh.id}` : nt && nt.kind !== 'none' ? `task:${nt.kind}:${norm(String(nt.correct ?? ''))}` : undefined;
          const answer = p.kind === 'blank' || p.kind === 'sentence';
          if (answer && key && !p.correct) { if (key === runKey) run++; else { flush(); runKey = key; run = 1; startTurn = s.turns.indexOf(st[k]) + 1; } }
          else { flush(); runKey = undefined; run = 0; }
        }
        flush();
      }
    }
    writeFileSync(a2, JSON.stringify(rows, null, 1)); writeFileSync(path.join(path.dirname(a2), 'STUCK.json'), JSON.stringify(stuck, null, 1)); console.log('turn rows', rows.length, 'stuck runs', stuck.length);
  } else if (cmd === 'agreeprep') {
    // judge agreement (pre-registered): a stable 20% sample of the judged cases of round a2, re-judged blind by a second judge on the identical input
    const dir = a1; const round = Number(a2); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')); const cases: { id: string; text: string }[] = []; const key: Record<string, string> = {};
    for (const [cid, sk] of Object.entries(km) as [string, string][]) { if (rand(`${NS}-agree`, cid) >= 0.2) continue; const s = load(dir, sk); const t = s.turns[round - 1]; if (!t.judgeInput) continue; const aid = `a${cid.slice(1)}`; cases.push({ id: aid, text: t.judgeInput as string }); key[aid] = `${sk}|${round}|${cid}`; }
    mkdirSync(path.join(dir, 'agree'), { recursive: true });
    const files = writeJudgeBatches(path.join(dir, 'agree'), `ag${round}`, cases, 36, `${NS}-agree`); writeFileSync(path.join(dir, 'agree', `ag${round}_FILES.json`), JSON.stringify(files, null, 1)); writeFileSync(path.join(dir, 'agree', `ag${round}_KEY.json`), JSON.stringify(key, null, 1));
    console.log('agreement cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'agreescore') {
    const dir = a1; const res: any = { _label: 'SIMULATION ONLY', rounds: {}, sessions: { 1: { cases: 0, same: 0 }, 2: { cases: 0, same: 0 } }, cases: 0, same: 0, missing: 0 };
    for (const f of readdirSync(path.join(dir, 'agree')).filter((x) => /^ag\d+_FILES\.json$/.test(x))) {
      const round = Number(f.match(/^ag(\d+)_/)![1]); const files = JSON.parse(readFileSync(path.join(dir, 'agree', f), 'utf8')); const key = JSON.parse(readFileSync(path.join(dir, 'agree', `ag${round}_KEY.json`), 'utf8'));
      const { out, missing } = readJudge(path.join(dir, 'agree'), files); let n = 0; let same = 0; const ses = round <= TURNS_PER_SESSION ? 1 : 2;
      for (const [aid, j2] of Object.entries(out) as [string, any][]) {
        const [sk] = key[aid].split('|'); const s = load(dir, sk); const t = s.turns[round - 1]; const prev = (t.stateBefore as KState) ?? (round === 1 ? s.start : (s.turns[round - 2].stateAfter as KState));
        const r1 = applyEvents(prev, (t.events ?? []) as JudgeEvent[], t.production); const r2 = applyEvents(prev, j2.events as JudgeEvent[], t.production); n++; if (JSON.stringify(r1.state) === JSON.stringify(r2.state)) same++;
      }
      res.rounds[round] = { session: ses, cases: n, same, agreement: n ? +(same / n).toFixed(4) : null, missing: missing.length }; res.cases += n; res.same += same; res.missing += missing.length; res.sessions[ses].cases += n; res.sessions[ses].same += same;
    }
    for (const k of [1, 2]) res.sessions[k].agreement = res.sessions[k].cases ? +(res.sessions[k].same / res.sessions[k].cases).toFixed(4) : null;
    res.agreement = res.cases ? +(res.same / res.cases).toFixed(4) : null;
    res.pass = res.missing === 0 && res.agreement !== null && res.agreement >= 0.85 && res.sessions[2].agreement !== null && res.sessions[2].agreement >= 0.85;
    writeFileSync(path.join(dir, 'JUDGE_AGREEMENT.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  } else if (cmd === 'fidprep') {
    // P+ fidelity (pre-registered, descriptive): a stable random 10% of P+ turns; a checker sees the conversation so far and the P+ reply
    const dir = a1; mkdirSync(path.join(dir, 'fidelity'), { recursive: true }); const items: { id: string; text: string }[] = [];
    for (const f of readdirSync(path.join(dir, 'sessions')).sort()) { const s = load(dir, f.replace(/\.json$/, '')); if (s.arm !== 'PP') continue; s.turns.forEach((t, k) => { const id = `f${sha(`${NS}fid|${f}|${k}`).slice(0, 10)}`; if (t.tutor === undefined || rand(`${NS}-fid`, id) >= 0.1) return; const before = s.turns.slice(0, k + 1).filter((x) => x.session === t.session); const conv = before.map((x, i) => `STUDENT: ${x.learner}${i < before.length - 1 ? `\nTUTOR: ${x.tutor ?? ''}` : ''}`).join('\n'); items.push({ id, text: `CONVERSATION SO FAR:\n${conv}\n\nTUTOR REPLY TO CHECK:\n${t.tutor}` }); }); }
    const per = 36; const batches: string[] = [];
    for (let b = 0; b * per < items.length; b++) { const id = `fd${String(b + 1).padStart(2, '0')}`; batches.push(id); writeFileSync(path.join(dir, 'fidelity', `${id}.md`), `Batch ${id}. Check every case with the fidelity instructions and write the JSON to the file named in your task.\n` + items.slice(b * per, b * per + per).map((x) => `\n\n=========== CASE ${x.id} ===========\n${x.text}`).join('')); }
    console.log('fidelity cases', items.length, batches.join(' '));
  } else {
    console.log('commands: overlap | init | tprompts | promptcheck | tapply | jprep | japply | status | post | tags | rateprep | agreeprep | agreescore | fidprep');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
