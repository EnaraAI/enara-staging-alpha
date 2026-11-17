// SIMULATION ONLY. NO API. ESL stage-6 CONFIRMATORY runner (pre-registered: config/agent_sim_esl6/PROTOCOL.md). Built from esl5Study.ts (same P+ baseline, same
// engine glue, same cells/judge/agreement/rating/fidelity mechanics) with: 192 NEW learners (180 explicit-first, ids 700-879, 6 per outcome; 12 B2, ids 880-891),
// 30 A1-A2 form outcomes (lessons: esl6Fixtures.ts; beliefs: LEARNING_RULES §1b via esl6_outcomes.py), arm LE = ESL5 LE + graderV2 with the production
// [[assess ...]] parser (stripAssessmentMarkers -> completeLanguageTurn/finalizeLanguageTurn), forgetting rule F1 v2 between sessions and before the delayed test
// (esl6_forget.py, called through one python3 process per command), and the outcome assessment (pre / immediate / delayed, Latin-square forms) answered
// deterministically from ITEM_BELIEF_MAP.json + WRONG_ANSWERS.json and scored by the REAL deterministic grader (gradeAnswers, ENARA_ENGINE_V2=graderV2, model
// path off), with a fixed-seed 10% grader recheck sample.
// The engine sees only what a real tutor sees: the learner's messages, the lesson data, the course level / objective record, and ENARA's own stored record. It
// never reads the simulator's knowledge state, beliefs, seeds, the item-belief map or the assessment answers (promptcheck enforces it before every round).
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/esl6Study.ts <cmd> ...
// Commands: hashcheck | answercheck | overlap <dir> | init <dir> | tprompts <dir> <cell> | promptcheck <dir> | tapply <dir> <cell> <answers.json> | status <dir>
//           | jprep <dir> <round> | japply <dir> <round> | f1 <dir> <2|7> | assess <dir> <pre|imm|del> | post <dir> | tags <dir> <out> | agreeprep <dir> <round>
//           | agreescore <dir> | recheckprep <dir> | recheckscore <dir> | rateprep <dir> <out> | fidprep <dir>
//           dry-run only (refused unless <dir>/DRY_RUN exists): dryreply <dir> <round> | dryjudge <dir> <round> | dryagree <dir> <round> | dryscore <dir>
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks,
  esl5Adjust, knownKey, independentSuccessItem, type LanguageTeachingContext,
} from '../../../../backend/src/services/languageTeachingContext';
import { stripAssessmentMarkers, isFailure } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy, completeLanguageTurn } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { applyTurn, summarizeProfile, applyLiveErrors, applyKnownPoints, liveErrorTypes, type Esl5Record } from '../../../../backend/src/services/learnerLanguageProfile';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { graderV2On, normaliseV2, sensitivityOf } from '../../../../backend/src/services/graderV2';
import { LESSONS6, OUTCOME_IDS } from './esl6Fixtures';
import { createHash } from 'crypto';

// Copied from learnerSim.ts (same formulas and batch format). learnerSim.ts is NOT imported: it runs its own CLI on import, and its "agreeprep" /
// "agreescore" branches would also run (and write into <dir>/judge) when this runner is called with those command names.
interface Production { kind: 'blank' | 'sentence' | 'rule' | 'none'; correct?: boolean; fired?: 'W1' | 'W2'; text: string }
interface NextTask { kind: 'blank' | 'sentence' | 'rule' | 'none'; probes?: string[]; correct?: string; errors?: Record<string, string> }
interface JudgeEvent { rule: string; belief: string; quote?: string }
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rand = (...parts: (string | number)[]) => parseInt(sha(parts.join('|')).slice(0, 8), 16) / 2 ** 32;
function writeJudgeBatches(dir: string, tag: string, cases: { id: string; text: string }[], per: number, seed: string) {
  const order = [...cases].map((c, i) => ({ c, k: sha(`${seed}|${tag}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.c);
  const files: { batch: string; ids: string[] }[] = [];
  for (let n = 0; n * per < order.length; n++) {
    const chunk = order.slice(n * per, (n + 1) * per); const batch = `${tag}_j${String(n + 1).padStart(2, '0')}`;
    writeFileSync(path.join(dir, `${batch}.md`), `Batch ${batch}. Judge every case with JUDGE_INSTRUCTIONS.md and LEARNING_RULES.md. Write {"batch":"${batch}","cases":{...}} to the file named in your task.\n` + chunk.map((c) => `\n=========== CASE ${c.id} ===========\n${c.text}\n`).join(''));
    files.push({ batch, ids: chunk.map((c) => c.id) });
  }
  return files;
}
function readJudge(dir: string, files: { batch: string; ids: string[] }[]) {
  const out: Record<string, { events: JudgeEvent[]; next_task: NextTask; retrieval?: string[] }> = {}; const missing: string[] = [];
  for (const f of files) {
    const p = path.join(dir, `${f.batch}.json`); if (!existsSync(p)) { missing.push(f.batch); continue; }
    const d = JSON.parse(readFileSync(p, 'utf8')) as { cases: Record<string, { events: JudgeEvent[]; next_task: NextTask }> };
    for (const id of f.ids) if (d.cases?.[id]) out[id] = d.cases[id]; else missing.push(`${f.batch}:${id}`);
  }
  return { out, missing };
}

type Arm = 'PP' | 'LE';
type Time = 'pre' | 'imm' | 'del';
const ARMS: Arm[] = ['PP', 'LE'];
const TIMES: Time[] = ['pre', 'imm', 'del'];
const ROOT = path.join(__dirname, '../..');            // research/deep-learning-simulation-v2
const REPO = path.join(ROOT, '../..');                 // repository root
const CFG = path.join(ROOT, 'config/agent_sim_esl6');
const PPLUS_FILE = path.join(ROOT, 'config/agent_sim_esl4/PPLUS_PROMPT.txt');
const PPLUS_SHA = 'e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472';
const PPLUS = readFileSync(PPLUS_FILE, 'utf8').trim();
const REPS = [1, 2] as const;
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
// LE = ESL5 LE (A0 + levelExplicit + esl5 bundle) with graderV2 appended (DECISIONS 3). shortRecap is not used.
export const ENV_OF: Record<Arm, string> = { PP: '', LE: `${BASE},levelExplicit,esl5,graderV2` };
// DECISIONS 11 (option C, 2026-11-17): the primary outcome uses only these item types (positions 1-4 of each form,
// minus the 6 rewrite items of 2 outcomes); error correction (5-6) and rewrite are secondary.
const PRIMARY_TYPES = new Set(['gap_fill', 'controlled_gap_fill', 'multiple_choice', 'controlled_choice']);
const GRADER_ENV = 'graderV2';                          // assessment scoring (DECISIONS 1): deterministic path, model path off
const TURNS_PER_SESSION = 5; const ROUNDS = 2 * TURNS_PER_SESSION; const DAY = 86_400_000; const T0 = Date.parse('2027-03-01T09:00:00Z');
const GAP_DAYS = 2; const DELAY_DAYS = 7;
const LESSON_ID = 'lsn';                                // ESL5 stand-in (b), kept
const NS = 'esl6';
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
const dirArg = (d: string) => path.resolve(d);

// ---------------------------------------------------------------------------------------------------------- python bridge (esl6_forget.py, esl6_outcomes.py)
// One python3 process per command; -I so nothing from the cwd is imported. The F1 and event rules live only in esl6_forget.py (validated in ESL6 validation).
const PY = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'src/offline'))})
import esl6_forget as F
from esl6_outcomes import OUTCOMES
out = []
for op in json.load(sys.stdin):
    k = op['op']
    if k == 'outcomes': out.append([{x: o[x] for x in ('key', 'id', 'sec1', 'topic', 'ws', 'C', 'W', 'E')} for o in OUTCOMES])
    elif k == 'init': s = F.initial_state(op['form'], op['band'], op['primary'], op['ws']); s.update({'sec1': op['sec1']} if op.get('sec1') else {}); out.append(s)
    elif k == 'f1': out.append(F.f1_gap(op['state'], op['days']))
    elif k == 'apply':
        st, a, r = F.apply_events(op['state'], op['events'], op['last'], op['session'], op['retrieval']); out.append({'state': st, 'applied': a, 'rejected': r})
    elif k == 'cmp': out.append(F.comparable(op['state']))
    else: raise ValueError(k)
json.dump(out, sys.stdout)
`;
function py<T = any>(ops: object[]): T[] {
  if (!ops.length) return [];
  const r = spawnSync('python3', ['-I', '-c', PY], { input: JSON.stringify(ops), encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`python bridge failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
interface Outcome { key: string; id: string; sec1: string | null; topic: string; ws: ('W1' | 'W2')[]; C: Record<string, string>; W: Record<string, string>; E: Record<string, string> }
let OUTS: Record<string, Outcome> | undefined;
const outcomes = (): Record<string, Outcome> => (OUTS ??= Object.fromEntries((py<Outcome[]>([{ op: 'outcomes' }])[0]).map((o) => [o.id, o])));
const PAIR: Record<string, string> = { W1: 'C1', W2: 'C2', C1: 'W1', C2: 'W2' };

// ESL6 knowledge state (esl6_forget.py format)
interface KState { form: string; band: 'A1' | 'A2' | 'B2'; primary: 'W1' | 'W2'; ws: ('W1' | 'W2')[]; s: Record<'W1' | 'W2' | 'C1' | 'C2', number>; indep: { C1: number; C2: number }; start: Record<string, number>; retr: { C1: number[]; C2: number[] }; afterF1: boolean; sec1?: string }
// LEARNING_RULES §2 / §2a (same numbers as esl6_forget.p_wrong / recall_floor / item_error_prob; cross-checked in the dry run)
const EPS = 1e-9;
const pWrong = (w: number) => (w >= 1.5 - EPS ? 0.8 : w >= 0.5 - EPS ? 0.4 : 0.05);
const recallFloor = (c: number) => 0.4 * Math.max(0, 1 - c / 2);
const itemErrorProb = (k: KState, w: 'W1' | 'W2', floorOn = k.afterF1) => Math.max(pWrong(k.s[w]), floorOn ? recallFloor(k.s[PAIR[w] as 'C1' | 'C2']) : 0);

// ---------------------------------------------------------------------------------------------------------- learners (PROTOCOL §5)
interface Learner { idx: number; outcome: string; band: 'A1' | 'A2' | 'B2'; status: string; primary: 'W1' | 'W2'; seq: Record<Time, 'A' | 'B' | 'C'> }
const SEQS: Record<Time, 'A' | 'B' | 'C'>[] = [{ pre: 'A', imm: 'B', del: 'C' }, { pre: 'B', imm: 'C', del: 'A' }, { pre: 'C', imm: 'A', del: 'B' }];
const B2_OUTCOMES = ['EN-F-A1-GR-article-a-an', 'EN-F-A1-GR-can-ability', 'EN-F-A1-GR-prepositions-time', 'EN-F-A1-GR-word-order-svo', 'EN-F-A1-VO-family', 'EN-F-A1-VO-home-rooms',
  'EN-F-A2-GR-comparatives', 'EN-F-A2-GR-frequency-adverbs', 'EN-F-A2-GR-past-questions-did', 'EN-F-A2-GR-past-simple-regular', 'EN-F-A2-GR-third-person-s', 'EN-F-A2-VO-clothes-shopping'];
function buildLearners(): Learner[] {
  const out: Learner[] = []; const O = outcomes();
  OUTCOME_IDS.forEach((oid, b) => {
    const two = O[oid].ws.length === 2; const a1 = /^EN-F-A1-/.test(oid);
    for (let p = 0; p < 6; p++) out.push({ idx: 700 + 6 * b + p, outcome: oid, band: a1 && p < 3 ? 'A1' : 'A2', status: p < 3 ? 'not_assessed' : 'emerging', primary: two && [2, 4, 5].includes(p) ? 'W2' : 'W1', seq: SEQS[p % 3] });
  });
  B2_OUTCOMES.forEach((oid, i) => out.push({ idx: 880 + i, outcome: oid, band: 'B2', status: 'proficient', primary: 'W1', seq: SEQS[i % 3] }));
  return out;
}
let LRN: Learner[] | undefined;
const LEARNERS = () => (LRN ??= buildLearners());
const L_OF = (idx: number): Learner => LEARNERS().find((l) => l.idx === idx)!;
const seedOf = (idx: number, rep: number) => `${NS}|L${idx}|rep${rep}`;

// ---------------------------------------------------------------------------------------------------------- sessions
interface LangTurn { assessment?: any; activeItem?: any; hintLevel?: number; rulesIntroduced?: number[]; closingAsk?: string; [k: string]: unknown }
interface Turn { session: 1 | 2; learner: string; production: Production; tutor?: string; raw?: string; ev5?: Record<string, unknown>; lang?: LangTurn; judgeInput?: string; [k: string]: unknown }
interface Rec { entries: any[]; liveErrors: Record<string, { seen: number; lastCorrect?: boolean }>; knownPoints: Record<string, number> }
interface AssessSummary { form: string; points: number; max: number; pct: number; free: number; items1to4: number; nulls: number }
interface Sess { arm: Arm; rep: number; learnerIdx: number; outcome: string; seed: string; state: KState; start: KState; rec: Rec; turns: Turn[]; stateAfterS1?: KState; recAfterS1?: Rec; stateS2Start?: KState; stateEndS2?: KState; stateDelayed?: KState; assess?: Partial<Record<Time, AssessSummary>> }
const keyOf = (s: { learnerIdx: number; arm: Arm; rep: number }) => `s${s.learnerIdx}_${s.arm}_r${s.rep}`;
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'), (k, v) => (/At$/.test(k) && typeof v === 'string' ? new Date(v) : v));
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const sessionFiles = (dir: string) => readdirSync(path.join(dir, 'sessions')).filter((f) => f.endsWith('.json')).sort();
const opener = (l: Learner, session: 1 | 2): Turn => { const t = outcomes()[l.outcome].topic; return { session, learner: session === 1 ? `Hello! Can you give me an exercise on ${t}?` : `Hello again! Can we practise ${t} again today?`, production: { kind: 'none', text: '' } }; };
// 24 cells per round: arm x replication x 6 parts of 32 sessions (learner id mod 6).
const cells = () => ARMS.flatMap((arm) => REPS.flatMap((rep) => [0, 1, 2, 3, 4, 5].map((p) => ({ id: `${arm}${rep}${p}`, arm, keys: LEARNERS().filter((l) => l.idx % 6 === p).map((l) => keyOf({ learnerIdx: l.idx, arm, rep })) }))));
const caseId = (f: string, round: number) => `c${sha(`${NS}|${f}|${round}`).slice(0, 10)}`;

// ---------------------------------------------------------------------------------------------------------- engine glue (as esl5Study.ts)
const lessonOf = (oid: string) => LESSONS6[oid];
function planOf(l: Learner, arm: Arm) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[arm];
  const input: PlanInput = { objectiveId: l.outcome, masteryStatus: l.status, masteryEstimate: l.status === 'proficient' ? 0.8 : l.status === 'emerging' ? 0.3 : 0.1, evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [], misconceptions: l.status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }], supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [], gradeLevel: l.band === 'A1' ? 4 : l.band === 'A2' ? 9 : 18, subject: 'Grammar', relatedSecureObjectives: 0, belowB1: belowB1(l.band) };
  const plan = selectTeachingPlan(input);
  const lines = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ${l.outcome} "${lessonOf(l.outcome).objective}". Status: ${STATUS_WORDS[l.status]}.`, ...planLines(plan, undefined, l.status), '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  return { plan, text: arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n') };
}
const sessionTurns = (s: Sess) => { const cur = s.turns[s.turns.length - 1].session; return s.turns.filter((t) => t.session === cur); };
const shownItem = (tutor: string, oid: string) => [...lessonOf(oid).spec.items].reverse().find((it) => norm(tutor).includes(norm(coreOf(it.prompt)).slice(0, 30)));
// The engine's history: ENARA's own stored evidence for each earlier reply of this session (production marker parse, not the ESL5 key stand-in).
function history(turns: Turn[]) {
  const hist: any[] = [];
  for (const t of turns) { hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break; hist.push({ role: 'assistant', content: t.tutor, languageTurn: { ...(t.lang ?? {}), ...(t.ev5 ?? {}) } }); }
  return hist;
}
const nowOf = (s: Sess) => new Date(T0 + (s.turns[s.turns.length - 1].session - 1) * GAP_DAYS * DAY + s.turns.length * 60_000);
const esl5Record = (r: Rec): Esl5Record => ({ live: liveErrorTypes({ entries: r.entries, liveErrors: r.liveErrors }), knownPoints: { ...r.knownPoints } });
function langCtx(s: Sess) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const lesson0 = lessonOf(l.outcome); const st = sessionTurns(s); const message = st[st.length - 1].learner;
  const hist = history(st.slice(0, -1)); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const signals0 = detectTurnSignals(message, hist, lesson as never);
  const moves0 = selectLanguageMoves({ band: levelBand(l.band), targetLanguage: 'English', lessonStatus: 'structured', signals: signals0, masteryStatus: l.status });
  const record = engineV2('reviewOpen') || engineV2('fadeKnown') ? esl5Record(s.rec) : undefined;
  const { signals, moves } = esl5Adjust({ signals: signals0, moves: moves0, record, history: hist, lessonId: LESSON_ID });
  const learner = deriveLearnerContext({ courseLevel: l.band, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message], objectiveStatus: l.status });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec as never) : undefined;
  const planPrimary = planOf(l, s.arm).plan.primary; process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const { explicit, ruleFirst } = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: lesson0.spec as never, moves });
  const profile = summarizeProfile(s.rec.entries, nowOf(s));
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: LESSON_ID, title: lesson0.title, spec: lesson0.spec }, signals, moves, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(record ? { record } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => sessionTurns(s).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function enginePart(s: Sess): string { const l = L_OF(s.learnerIdx); return `${planOf(l, s.arm).text}\n\n${langCtx(s).prompt}`; }
function tutorPrompt(s: Sess): string {
  const l = L_OF(s.learnerIdx);
  if (s.arm === 'PP') { const L = lessonOf(l.outcome); const sp = L.spec; return `${PPLUS}\n\nLearner level: ${l.band} (CEFR)\n\nLesson: ${L.title}. ${L.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}\n\nPractice exercises you may use:\n${sp.items.map((i, k) => `${k + 1}. ${i.prompt}`).join('\n')}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`; }
  // ESL5 fix 1: the engine prompt asks for the hidden [[assess ...]] line; the ESL5 runner line forbidding it is removed.
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next).\n\n${enginePart(s)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}
// Item bookkeeping for the leak, release and stuck tags (same for both arms; from text and production facts, never shown to tutors). As esl5Study.ts.
const DONT = /don'?t know|not sure/i;
function itemLedger(s: Sess) {
  const oid = s.outcome; const st = sessionTurns(s); const fails: Record<string, number> = {}; const solved = new Set<string>(); const tried = new Set<string>(); let active: string | undefined;
  st.forEach((t, k) => {
    if (k >= 1 && active) { tried.add(active); const p = t.production; if (p.kind === 'blank' || p.kind === 'sentence') { if (p.correct) solved.add(active); else if (!DONT.test(t.learner)) fails[active] = (fails[active] ?? 0) + 1; } }
    if (t.tutor !== undefined && k < st.length - 1) { const sh = shownItem(t.tutor, oid); if (sh) active = sh.id; }
  });
  return { fails, solved, tried, active };
}
function answersIn(s: Sess, text: string, skip: (id: string) => boolean): string[] {
  const items = lessonOf(s.outcome).spec.items; const nt = ` ${norm(text)} `; const out: string[] = [];
  for (const it of items) { if (skip(it.id)) continue; const core = coreOf(it.prompt); for (const a of it.acceptedAnswers ?? []) { const nf = norm(core.includes('___') ? core.replace('___', a) : a); if ((nf.length >= 8 && nt.includes(` ${nf} `)) || new RegExp(`\\b(the answer is|answer:|correct answer is)\\s*["'“]?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) { out.push(it.id); break; } } }
  return out;
}
function leakIn(s: Sess, text: string): number { const g = itemLedger(s); const tried = new Set(g.tried); if (g.active) tried.add(g.active); return answersIn(s, text, (id) => tried.has(id)).length; }
function earlyLeakIn(s: Sess, text: string): { early: number; late: number } {
  const g = itemLedger(s); const hit = answersIn(s, text, (id) => g.solved.has(id));
  return { early: hit.filter((id) => (g.fails[id] ?? 0) < 2).length, late: hit.filter((id) => (g.fails[id] ?? 0) >= 2).length };
}
async function applyTutor(s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const written = raw.trim(); let text = written; let final = text; let removed = 0; let closingAsk: string | undefined;
  if (s.arm === 'LE') {
    // production order (tutor.controller): strip and parse the hidden marker, then the reply guards, then the turn evidence with the parsed marker.
    const marker = stripAssessmentMarkers(written); text = marker.text;
    const ctx = langCtx(s); const g = applyReplyGuards(ctx, text, last.learner); final = g.text; removed = g.removed; closingAsk = g.closingAsk;
    process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const l = L_OF(s.learnerIdx); const sig = ctx.signals as any; const now = nowOf(s);
    const lt: any = await completeLanguageTurn({ language: ctx, reply: final, learnerText: last.learner, messageId: `${keyOf(s)}_t${s.turns.length}`, marker, removed, ...(closingAsk ? { closingAsk: closingAsk as never } : {}), institutionId: '', studentId: '' });
    const ev5: Record<string, unknown> = {}; for (const k of ['liveError', 'answerReleased', 'reviewOpen', 'fadeCheck', 'fadeCheckAnswered', 'fadeFailed', 'ownSentence']) if (lt[k] !== undefined) ev5[k] = lt[k];
    // ENARA's stored record: recordProfileTurn's body with the same pure helpers (no DB), on the verdict the production pipeline stored.
    const verdict = lt.assessment?.verdict; const indep = independentSuccessItem(ctx, lt);
    const fadeFailed = engineV2('fadeKnown') && lt.fadeCheckAnswered?.length && isFailure(verdict) ? lt.fadeCheckAnswered : undefined;
    const o: any = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId: LESSON_ID, lessonTitle: lessonOf(l.outcome).title,
      ...(engineV2('liveError') ? { ...(sig.liveError ? { liveError: sig.liveError.code } : {}), ...(sig.liveTarget && lt.assessment && /^CORRECT/.test(String(verdict)) ? { liveCorrect: sig.liveTarget } : {}) } : {}),
      ...(engineV2('fadeKnown') ? { knownInc: (indep?.criteria ?? []).map((c: number) => knownKey(LESSON_ID, c)), knownReset: ((fadeFailed as number[] | undefined) ?? []).map((c) => knownKey(LESSON_ID, c)) } : {}) };
    if (o.errorCode || o.independentSuccessOn) s.rec.entries = applyTurn(s.rec.entries, o);
    if (engineV2('liveError') && (o.liveError || o.liveCorrect)) s.rec.liveErrors = applyLiveErrors(s.rec.liveErrors as never, o) as Rec['liveErrors'];
    if (engineV2('fadeKnown') && (o.knownInc?.length || o.knownReset?.length)) s.rec.knownPoints = applyKnownPoints(s.rec.knownPoints, o);
    const lang: LangTurn = { assessment: lt.assessment, ...(lt.activeItem ? { activeItem: lt.activeItem } : {}), hintLevel: lt.hintLevel, ...(lt.rulesIntroduced?.length ? { rulesIntroduced: lt.rulesIntroduced } : {}), ...(closingAsk ? { closingAsk } : {}) };
    Object.assign(last, { lang, markerStatus: lt.markerStatus ?? null, qualityFlags: lt.qualityFlags ?? [], moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.band), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ...(closingAsk ? { closingAsk } : {}), profileLines: (ctx as any).history?.length ?? 0, ev5, engineVerdict: verdict ?? null, recordLive: (ctx as any).record?.live ?? [] });
  }
  const leakRaw = leakIn(s, text); const elRaw = earlyLeakIn(s, text); const el = earlyLeakIn(s, final);
  Object.assign(last, { tutor: final, ...(final !== written ? { raw: written } : {}), leakRaw, leakFinal: leakIn(s, final), earlyLeakRaw: elRaw.early, earlyLeakFinal: el.early, lateAnswerFinal: el.late, answerReleased: Boolean(last.ev5?.answerReleased), twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', twoAsksRaw: hasTwoAsks(text), ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- simulator side (LEARNING_RULES §1b, §2, §2a, §3a; judge text as the validated ESL6 judge cases)
const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''));
function stateText(k: KState, session: 1 | 2, earlier?: string[]): string {
  const o = outcomeOfState(k); const s = k.s;
  const lines = [`Target form: ${o.id} (${o.topic}). Learner level ${k.band}. First language Arabic.`, `Session ${session}.` + (session === 2 ? ' This is 2 days after session 1; the forgetting rule has run, so strengths may be non-whole (LEARNING_RULES 2a, 6).' : '')];
  for (const w of o.ws) lines.push(`${w} (wrong) strength ${fmt(s[w])}: ${o.W[w]}. Its error: ${o.E[w]}.`);
  for (const w of o.ws) { const c = PAIR[w] as 'C1' | 'C2'; lines.push(`${c} (correct) strength ${fmt(s[c])}: ${o.C[c]}. Independent correct productions so far: ${k.indep[c]}.`); }
  if (o.ws.length === 1) lines.push('This outcome has one wrong belief only (no W2, no C2).');
  if (session === 2 && earlier?.length) lines.push('Items this learner answered in session 1: ' + earlier.map((e) => `"${e}"`).join(' | '));
  return lines.join('\n');
}
const outcomeOfState = (k: KState) => Object.values(outcomes()).find((x) => x.key === k.form)!;
function factLine(p: Production | undefined, k: KState): string {
  if (!p || p.kind === 'none' || p.kind === 'rule') return 'FACT: the last learner message did not produce the form (no exercise answer or sentence).';
  if (p.correct) return 'FACT: the last learner message produced the form CORRECTLY.';
  return `FACT: the last learner message contained the error of ${p.fired} (${outcomeOfState(k).E[p.fired!]}).`;
}
const stripArm = (t: string) => t.replace(/\[\[assess[^\]]*\]\]/gi, '').replace(/\bENARA\b/gi, 'the tutor').trim();
function judgeText(k: KState, session: 1 | 2, prevTutor: string | undefined, last: Production | undefined, learnerMsg: string, tutor: string, earlier?: string[]) {
  return `KNOWLEDGE STATE (before this tutor turn):\n${stateText(k, session, earlier)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n${prevTutor ? stripArm(prevTutor) : '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${learnerMsg}\n${factLine(last, k)}\n\nTUTOR TURN TO JUDGE:\n${stripArm(tutor)}`;
}
/** task line of a tutor turn (as esl5_leak_recount.item_of): last line with a gap, else the last non-empty line. */
function taskLine(tutor: string | undefined): string | undefined {
  const lines = (tutor ?? '').split('\n').map((x) => x.trim()).filter(Boolean); if (!lines.length) return undefined;
  const gap = lines.filter((x) => x.includes('___')); return (gap.length ? gap[gap.length - 1] : lines[lines.length - 1]).slice(0, 200);
}
/** session-1 items the learner answered (blank or sentence), shown to session-2 judges for the 5b retrieval / 4b new-item rulings. */
function earlierItems(s: Sess): string[] {
  const s1 = s.turns.filter((t) => t.session === 1); const out: string[] = [];
  for (let k = 1; k < s1.length; k++) { const p = s1[k].production; if (p.kind === 'blank' || p.kind === 'sentence') { const t = taskLine(s1[k - 1].tutor); if (t && !out.includes(t)) out.push(t); } }
  return out;
}
/** The learner's next message (LEARNING_RULES §2, §2a, §3a); dice as learnerSim.ts: rand(seed, 'prod', turn, Wk). */
function learnerReply(k: KState, task: NextTask | undefined, seed: string, turn: number): Production & { probes?: string[] } {
  const t = task ?? { kind: 'none' }; const o = outcomeOfState(k);
  if (t.kind === 'blank' || t.kind === 'sentence') {
    const probes = (t.probes ?? o.ws).filter((p) => (o.ws as string[]).includes(p)) as ('W1' | 'W2')[];
    for (const w of probes) if (rand(seed, 'prod', turn, w) < itemErrorProb(k, w)) { const txt = t.errors?.[w]; return { kind: t.kind, correct: false, fired: w, text: txt === undefined || txt === '' ? (t.kind === 'blank' ? '(I leave it empty, no word)' : String(t.correct ?? '')) : txt, probes }; }
    return { kind: t.kind, correct: true, text: String(t.correct ?? ''), probes };
  }
  if (t.kind === 'rule') return { kind: 'rule', text: k.s.C1 >= 2 ? `I think: ${o.C.C1}.` : `I think ${o.W.W1}.` };
  return { kind: 'none', text: 'OK. Can I have an exercise, please?' };
}

// ---------------------------------------------------------------------------------------------------------- assessment (PROTOCOL §7)
interface BankItem { id: string; type: string; prompt: string; answerKey: string; acceptedAnswers?: string[]; scoring: string; options?: string[]; matchingNote?: string; acceptedAnswersNote?: string; targetForm?: string; targetForms?: string[]; scoringNote?: string; rubric?: string; objectiveIds?: string[]; l1ErrorType?: string }
let BANK: Map<string, BankItem> | undefined; let FORMS_OF: Map<string, Record<string, BankItem[]>> | undefined;
function bank() {
  if (BANK) return { items: BANK, forms: FORMS_OF! };
  BANK = new Map(); FORMS_OF = new Map();
  for (const f of readdirSync(path.join(REPO, 'data/assessments/outcomes')).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(path.join(REPO, 'data/assessments/outcomes', f), 'utf8')); FORMS_OF.set(d.outcomeId, d.forms);
    for (const form of Object.values<BankItem[]>(d.forms)) for (const it of form) BANK.set(it.id, it);
  }
  return { items: BANK, forms: FORMS_OF };
}
const IBM = () => JSON.parse(readFileSync(path.join(CFG, 'ITEM_BELIEF_MAP.json'), 'utf8')).items as Record<string, { outcome: string; form: string; position: number; probes: string[]; key: string; keySource: string; note: string; graderBlind?: string }>;
const WRONG = () => JSON.parse(readFileSync(path.join(CFG, 'WRONG_ANSWERS.json'), 'utf8')) as { items: Record<string, Record<string, string>>; graderBlind?: Record<string, string> };
// The production question built from a bank item, exactly as the validated round-5 grader harness (research/assessment-validation/a1a2/round5/harness5.ts).
function buildQuestion(it: BankItem): any {
  const tf = it.scoring === 'target_form_0_1_2'; const choice = /choice/.test(it.type);
  const q: any = { id: it.id, type: tf ? 'open-response' : choice ? 'multiple-choice' : 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, scoringNote: it.scoringNote, points: tf ? undefined : 1 };
  if (it.options) q.options = it.options; if (it.objectiveIds) q.objectiveIds = it.objectiveIds;
  if (tf) q.rubric = { criteria: [{ id: 'target_form', title: 'Target form', description: String(it.rubric ?? it.scoringNote ?? ''), maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0, description: 'target form missing or wrong' }, { id: 'l1', label: '1', points: 1, description: 'target form attempted with a minor slip' }, { id: 'l2', label: '2', points: 2, description: 'target form correct' }] }] };
  return q;
}
/** Score one answer with the deterministic production grader (graderV2 ON, model path off). Gets only the item id and the answer string. null = no rule fits. */
export function scoreAnswer(itemId: string, answer: string): { points: number | null; max: number } {
  const prev = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = GRADER_ENV;
  try {
    if (!graderV2On()) throw new Error('graderV2 not on');
    const it = bank().items.get(itemId); if (!it) throw new Error(`no bank item ${itemId}`);
    const q = buildQuestion(it); const [r] = gradeAnswers([q], { [q.id]: answer }) as any[];
    if (it.scoring === 'target_form_0_1_2') return { points: r.method === 'rule' && r.points !== null ? r.points : null, max: 2 };
    return { points: r.isCorrect ? 1 : 0, max: 1 };
  } finally { process.env.ENARA_ENGINE_V2 = prev; }
}
/** Deterministic answer string for one item at one time (§7): each probed Wk fires with §2 (+§2a floor after an F1 interval); first firing in W1, W2 order. */
function answerItem(k: KState, seed: string, time: Time, itemId: string, map: ReturnType<typeof IBM>, wrong: ReturnType<typeof WRONG>) {
  const m = map[itemId]; const probes = m.probes.filter((p) => p === 'W1' || p === 'W2').sort() as ('W1' | 'W2')[];
  for (const w of probes) {
    const p = itemErrorProb(k, w, time !== 'pre' && k.afterF1);
    if (rand(seed, `assess-${time}`, itemId, w) < p) return { fired: w, answer: wrong.items[itemId][w], p };
  }
  return { fired: null, answer: m.key, p: 0 };
}

// ---------------------------------------------------------------------------------------------------------- frozen files, answer check, overlap check
function protocolHashes(): { file: string; sha: string }[] {
  const t = readFileSync(path.join(CFG, 'PROTOCOL.md'), 'utf8'); const sec = t.split('## 3.')[1]?.split('\n## ')[0] ?? '';
  return [...sec.matchAll(/^\|\s*`([^`]+)`[^|]*\|\s*`([0-9a-f]{64})`\s*\|/gm)].map((m) => ({ file: m[1], sha: m[2] }));
}
function fileHash(rel: string): string {
  if (rel.startsWith('data/assessments/outcomes/')) { const d = path.join(REPO, 'data/assessments/outcomes'); return sha(readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => readFileSync(path.join(d, f), 'utf8')).join('')); }
  const p = [path.join(REPO, rel), path.join(ROOT, rel)].find((x) => existsSync(x)); if (!p) throw new Error(`frozen file missing: ${rel}`);
  return sha(readFileSync(p, 'utf8'));
}
function hashCheck() {
  const rows = protocolHashes().map((r) => { const got = fileHash(r.file); return { ...r, got, ok: got === r.sha }; });
  return { rows: rows.length, mismatches: rows.filter((r) => !r.ok).map((r) => ({ file: r.file, protocol: r.sha, now: r.got })), pass: rows.length > 0 && rows.every((r) => r.ok) };
}
function answerCheck() {
  const map = IBM(); const wrong = WRONG(); const bad: any[] = []; const blind: any[] = []; let keys = 0; let wrongs = 0; const nullKeys: string[] = [];
  const ids = [...bank().items.keys()].filter((id) => map[id] !== undefined);
  for (const oid of OUTCOME_IDS) for (const f of ['A', 'B', 'C']) for (const it of bank().forms.get(oid)![f]) if (!map[it.id]) bad.push({ item: it.id, problem: 'not in ITEM_BELIEF_MAP' });
  for (const id of ids) {
    const m = map[id]; const k = scoreAnswer(id, m.key); keys++;
    if (k.points === null) nullKeys.push(id);
    if (k.points !== k.max) bad.push({ item: id, problem: 'key scores less than full', key: m.key, points: k.points, max: k.max });
    const probes = m.probes.filter((p) => p !== 'none');
    for (const w of probes) {
      const ans = wrong.items[id]?.[w]; if (ans === undefined) { bad.push({ item: id, problem: `no wrong string for ${w}` }); continue; }
      wrongs++; const r = scoreAnswer(id, ans);
      const it = bank().items.get(id)!; const sens = sensitivityOf(it); if (normaliseV2(ans, sens) === normaliseV2(m.key, sens)) bad.push({ item: id, belief: w, problem: 'wrong string equals the key', answer: ans });
      else if (r.points === null || r.points >= r.max) (m.graderBlind ? blind : bad).push({ item: id, belief: w, problem: r.points === null ? 'wrong string not scored (null)' : 'wrong string scores full', answer: ans, points: r.points, ...(m.graderBlind ? { why: m.graderBlind } : {}) });
    }
    for (const w of Object.keys(wrong.items[id] ?? {})) if (!probes.includes(w)) bad.push({ item: id, problem: `wrong string for unprobed ${w}` });
  }
  const none = ids.filter((id) => map[id].probes.includes('none')).length;
  return { _label: 'SIMULATION ONLY', items: ids.length, keysChecked: keys, wrongStringsChecked: wrongs, probeNone: none, failures: bad, graderBlind: blind, nullKeys, pass: ids.length === 810 && bad.length === 0 };
}
function walk(dir: string, out: string[] = []) { if (!existsSync(dir)) return out; for (const f of readdirSync(dir)) { const p = path.join(dir, f); const st = statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(json|md|txt|ts|py)$/.test(f)) out.push(p); } return out; }
function overlapCheck(studyDir: string) {
  const own = path.resolve(studyDir);
  const files = [...walk(path.join(ROOT, 'reports/exp4')), ...[1, 2, 3, 4, 5, 6].flatMap((n) => walk(path.join(ROOT, `config/agent_sim_esl${n}`))),
    ...['src/offline/eslFixtures.ts', 'src/offline/esl6Fixtures.ts', 'src/offline/learnerSim.ts', 'src/offline/esl5_valprep.py', 'src/offline/esl6_valprep.py', 'src/offline/esl3Validate.ts'].map((f) => path.join(ROOT, f))]
    .filter((f) => !(path.resolve(f).startsWith(own + path.sep) && !path.resolve(f).includes(`${path.sep}validation${path.sep}`)));
  const ids = new Set<number>(); const seeds = new Set<string>(); const strIds = new Set<string>();
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/"learnerIdx":\s*(\d+)/g)) ids.add(Number(m[1])); for (const m of t.matchAll(/"seed":\s*"([^"]+)"/g)) seeds.add(m[1]); for (const m of t.matchAll(/"(?:learner|id|learnerId)":\s*"([^"]+)"/g)) strIds.add(m[1]); }
  // ids defined in code, not always stored as learnerIdx (ESL1 0-17, ESL2 0-35, ESL3 100-159, ESL3 validation 200-211, ESL4 300-407, ESL5 500-619, ESL5 validation 0-11)
  for (const [a, b] of [[0, 35], [100, 159], [200, 211], [300, 407], [500, 619]]) for (let i = a; i <= b; i++) ids.add(i);
  const myIds = LEARNERS().map((l) => l.idx); const mySeeds = LEARNERS().flatMap((l) => REPS.map((r) => seedOf(l.idx, r)));
  const idClash = myIds.filter((i) => ids.has(i)); const seedClash = mySeeds.filter((x) => seeds.has(x)); const nsClash = [...seeds].filter((x) => x.startsWith(`${NS}|`));
  // ESL6 validation learners/cases (n00-n29, validation case ids) vs study ids/keys
  const valIds = [...strIds].filter((x) => /^n\d\d$/.test(x)); const studyKeys = new Set(LEARNERS().flatMap((l) => ARMS.flatMap((a) => REPS.map((r) => keyOf({ learnerIdx: l.idx, arm: a, rep: r })))));
  const valClash = [...strIds].filter((x) => studyKeys.has(x) || myIds.map(String).includes(x));
  // descriptive (reported, not a pass criterion in PROTOCOL §5): lesson practice items that are also bank items of the same outcome
  const lessonBank: string[] = [];
  for (const oid of OUTCOME_IDS) { const its = lessonOf(oid).spec.items.map((i) => norm(coreOf(i.prompt).replace(/_+/g, ' '))); for (const f of ['A', 'B', 'C']) for (const b of bank().forms.get(oid)![f]) { const nb = norm(coreOf(b.prompt).replace(/_+/g, ' ')); if (nb.length >= 12 && its.some((x) => x === nb)) lessonBank.push(`${b.id}`); } }
  return { _label: 'SIMULATION ONLY', filesScanned: files.length, priorLearnerIds: ids.size, priorSeeds: seeds.size, studyIds: `${Math.min(...myIds)}-${Math.max(...myIds)} (${myIds.length})`, learnerIdClash: idClash, seedClash, namespaceClash: nsClash, validationLearnerIds: valIds.length, validationClash: valClash, lessonItemsEqualToBankItems: lessonBank, pass: !idClash.length && !seedClash.length && !nsClash.length && !valClash.length };
}

// ---------------------------------------------------------------------------------------------------------- forbidden text in the LE engine part (promptcheck)
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function forbidden(): RegExp[] {
  const O = Object.values(outcomes()); const map = IBM(); const res: RegExp[] = [/\b[WC][12]\b/, /strength/i, /KNOWLEDGE STATE/i, /\bprimary (wrong )?belief/i, /esl6\|L\d/, /Independent correct productions/i, /ITEM_BELIEF|WRONG_ANSWERS/];
  for (const o of O) for (const t of [...Object.values(o.C), ...Object.values(o.W), ...Object.values(o.E)]) res.push(new RegExp(esc(t), 'i'));
  // assessment item prompts (the sentence of the prompt, >= 4 words) and keys of >= 3 words; lesson data of the learner's own lesson is exempt (both arms see it)
  for (const it of bank().items.values()) { if (!map[it.id]) continue; const c = coreOf(it.prompt).replace(/_+/g, '___').trim(); if (c.split(/\s+/).length >= 4) res.push(new RegExp(esc(c), 'i')); const k = map[it.id].key; if (k.split(/\s+/).length >= 3) res.push(new RegExp(esc(k), 'i')); }
  return res;
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
const needDry = (dir: string) => { if (!existsSync(path.join(dir, 'DRY_RUN'))) throw new Error(`${cmd} is a dry-run command: ${dir}/DRY_RUN missing`); };
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));

async function main() {
  if (cmd === 'hashcheck') { const r = hashCheck(); console.log(JSON.stringify(r, null, 1)); if (!r.pass) process.exit(1); }
  else if (cmd === 'answercheck') { const r = answerCheck(); write(path.join(CFG, 'ANSWERCHECK.json'), r); console.log(JSON.stringify({ ...r, failures: r.failures.slice(0, 20), graderBlind: r.graderBlind.length }, null, 1)); if (!r.pass) process.exit(1); }
  else if (cmd === 'overlap') { const dir = dirArg(a1); const res = overlapCheck(dir); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'OVERLAP_CHECK.json'), res); console.log(JSON.stringify(res)); }
  else if (cmd === 'init') {
    const dir = dirArg(a1); const dry = existsSync(path.join(dir, 'DRY_RUN'));
    if (sha(readFileSync(PPLUS_FILE, 'utf8')) !== PPLUS_SHA) throw new Error('P+ prompt hash differs from ESL4 (e373018e...)');
    const hc = hashCheck(); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'HASH_CHECK.json'), hc); if (!hc.pass) throw new Error(`frozen-file hash check failed: ${JSON.stringify(hc.mismatches)}`);
    const ac = answerCheck(); write(path.join(dir, 'ANSWERCHECK.json'), ac); if (!ac.pass && !dry) throw new Error(`answercheck failed (${ac.failures.length} failures): run answercheck, fix the data, commit, re-hash`);
    const ov = overlapCheck(dir); write(path.join(dir, 'OVERLAP_CHECK.json'), ov); if (!ov.pass) throw new Error(`overlap check failed: ${JSON.stringify(ov)}`);
    mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
    const O = outcomes(); const todo: { l: Learner; arm: Arm; rep: number }[] = [];
    for (const l of LEARNERS()) for (const arm of ARMS) for (const rep of REPS) if (!existsSync(sf(dir, keyOf({ learnerIdx: l.idx, arm, rep })))) todo.push({ l, arm, rep });
    const states = py<KState>(todo.map(({ l }) => ({ op: 'init', form: O[l.outcome].key, band: l.band, primary: l.primary, ws: O[l.outcome].ws, sec1: O[l.outcome].sec1 })));
    todo.forEach(({ l, arm, rep }, i) => { const st = states[i]; save(dir, { arm, rep, learnerIdx: l.idx, outcome: l.outcome, seed: seedOf(l.idx, rep), state: st, start: JSON.parse(JSON.stringify(st)), rec: { entries: [], liveErrors: {}, knownPoints: {} }, turns: [opener(l, 1)] }); });
    write(path.join(dir, 'cells.json'), cells()); write(path.join(dir, 'LEARNERS.json'), LEARNERS());
    const n = LEARNERS().length * ARMS.length * REPS.length;
    console.log(`P+ hash ok; frozen hashes ok (${hc.rows}); answercheck ${ac.pass ? 'pass' : `FAIL (${ac.failures.length}, dry run continues)`}; overlap pass; sessions ${n}; cells ${cells().length}; env LE ${ENV_OF.LE}`);
  } else if (cmd === 'tprompts') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2)!; let n = 0;
    for (const key of cell.keys) { const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined || s.turns.length > ROUNDS) continue; if (last.session === 2 && !s.stateS2Start) throw new Error(`${key}: run "f1 <dir> 2" before session 2`); console.log(`\n########## SESSION ${key} ##########\n${tutorPrompt(s)}`); n++; }
    console.log(`\n(${n} session(s) need a tutor reply in this cell)`);
  } else if (cmd === 'promptcheck') {
    const dir = dirArg(a1); const FORB = forbidden(); let n = 0; const bad: string[] = []; const pp: string[] = [];
    for (const c of cells()) for (const key of c.keys) {
      const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue;
      const full = tutorPrompt(s); let head = s.arm === 'LE' ? enginePart(s) : full.split('CONVERSATION SO FAR:')[0]; n++;
      const L = lessonOf(s.outcome); const own = [L.title, L.objective, ...Object.values(L.spec).flat().map((x: any) => (typeof x === 'string' ? x : x.prompt))].map(norm);
      for (const re of FORB) { const m = head.match(re); if (m && !own.some((x) => x.includes(norm(m[0])))) (s.arm === 'LE' ? bad : pp).push(`${key}:${re}`); }
    }
    const res = { prompts: n, leFindings: bad, ppFindings: pp, pass: !bad.length && !pp.length }; write(path.join(dir, `PROMPTCHECK_t${load(dir, cells()[0].keys[0]).turns.length}.json`), res); console.log(JSON.stringify({ ...res, leFindings: bad.slice(0, 10), ppFindings: pp.slice(0, 10) }));
    if (bad.length) process.exit(1);
  } else if (cmd === 'tapply') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0;
    for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; await applyTutor(s, t); save(dir, s); n++; }
    console.log('applied', n, 'of', cell.keys.length);
  } else if (cmd === 'jprep') {
    const dir = dirArg(a1); const round = Number(a2); const cases: { id: string; text: string }[] = []; const keymap = path.join(dir, 'judge', `r${round}_KEY.json`); const km = existsSync(keymap) ? JSON.parse(readFileSync(keymap, 'utf8')) : {};
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const cur = s.turns[round - 1]; if (!cur?.tutor || cur.judgeInput) { if (cur && !cur.tutor) console.log('NO TUTOR REPLY', f); continue; }
      if (cur.session === 2 && !s.stateS2Start) throw new Error(`${f}: run "f1 <dir> 2" before judging session 2`);
      const prev = s.turns[round - 2]; const prevTutor = prev && prev.session === cur.session ? prev.tutor : undefined;
      cur.judgeInput = judgeText(s.state, cur.session, prevTutor, cur.production, cur.learner, cur.tutor, cur.session === 2 ? earlierItems(s) : undefined); save(dir, s);
      cases.push({ id: caseId(f, round), text: cur.judgeInput }); km[caseId(f, round)] = f.replace(/\.json$/, '');
    }
    write(keymap, km);
    const files = writeJudgeBatches(path.join(dir, 'judge'), `r${round}`, cases, 36, NS); write(path.join(dir, 'judge', `r${round}_FILES.json`), files);
    console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'japply') {
    const dir = dirArg(a1); const round = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
    const todo: { cid: string; s: Sess; cur: Turn; j: any }[] = [];
    for (const [cid, j] of Object.entries(out)) { const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.events) continue; todo.push({ cid, s, cur, j }); }
    const res = py<{ state: KState; applied: string[]; rejected: string[] }>(todo.map(({ s, cur, j }) => ({ op: 'apply', state: s.state, events: j.events ?? [], last: cur.production, session: cur.session, retrieval: (j as any).retrieval ?? [] })));
    let rej = 0;
    todo.forEach(({ s, cur, j }, i) => {
      const r = res[i]; Object.assign(cur, { stateBefore: s.state, events: j.events ?? [], retrieval: (j as any).retrieval ?? [], next_task: j.next_task, applied: r.applied, rejected: r.rejected, stateAfter: r.state }); s.state = r.state; rej += r.rejected.length;
      if (round === TURNS_PER_SESSION) { s.stateAfterS1 = r.state; s.recAfterS1 = JSON.parse(JSON.stringify(s.rec)); s.turns.push(opener(L_OF(s.learnerIdx), 2)); }
      else if (round === ROUNDS) s.stateEndS2 = r.state;
      else { const p = learnerReply(s.state, j.next_task as NextTask, s.seed, round + 1); s.turns.push({ session: cur.session, learner: p.text, production: p }); }
      save(dir, s);
    });
    console.log('applied', todo.length, 'rejected events', rej);
  } else if (cmd === 'f1') {
    // F1 v2 (LEARNING_RULES §6, F1_PARAMS.json): 2 days after session 1 (before any session-2 judging), 7 days after session 2 (delayed test state).
    const dir = dirArg(a1); const days = Number(a2); if (days !== GAP_DAYS && days !== DELAY_DAYS) throw new Error('f1 days must be 2 or 7');
    const todo: Sess[] = [];
    for (const f of sessionFiles(dir)) { const s = load(dir, f.replace(/\.json$/, '')); if (days === GAP_DAYS && s.stateAfterS1 && !s.stateS2Start) todo.push(s); if (days === DELAY_DAYS && s.stateEndS2 && !s.stateDelayed) todo.push(s); }
    const notReady = sessionFiles(dir).length - todo.length - sessionFiles(dir).filter((f) => { const s = load(dir, f.replace(/\.json$/, '')); return days === GAP_DAYS ? s.stateS2Start : s.stateDelayed; }).length;
    if (notReady) throw new Error(`${notReady} session(s) not at the end of session ${days === GAP_DAYS ? 1 : 2}`);
    const res = py<KState>(todo.map((s) => ({ op: 'f1', state: days === GAP_DAYS ? s.stateAfterS1 : s.stateEndS2, days })));
    todo.forEach((s, i) => { if (days === GAP_DAYS) { s.state = res[i]; s.stateS2Start = res[i]; } else s.stateDelayed = res[i]; save(dir, s); });
    console.log(`F1 ${days} days applied to`, todo.length, 'sessions');
  } else if (cmd === 'assess') {
    const dir = dirArg(a1); const time = a2 as Time; if (!TIMES.includes(time)) throw new Error('time must be pre|imm|del');
    const map = IBM(); const wrong = WRONG(); const rows: any[] = []; let nulls = 0;
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx);
      const k = time === 'pre' ? s.start : time === 'imm' ? s.stateEndS2 : s.stateDelayed; if (!k) throw new Error(`${f}: no state for ${time} (imm needs round 10 judged; del needs f1 7)`);
      const form = l.seq[time]; const items = bank().forms.get(l.outcome)![form]; let pts = 0; let free = 0; let c14 = 0; let nul = 0;
      for (const it of items) {
        const a = answerItem(k, s.seed, time, it.id, map, wrong); const sc = scoreAnswer(it.id, a.answer); const p = sc.points ?? 0; if (sc.points === null) { nul++; nulls++; }
        pts += p; const pos = map[it.id].position; if (pos >= 7) free += p; if (pos <= 4 && p === sc.max) c14++;
        rows.push({ answerId: `a${sha(`${NS}|ans|${keyOf(s)}|${time}|${it.id}`).slice(0, 12)}`, session: keyOf(s), learner: s.learnerIdx, arm: s.arm, rep: s.rep, time, form, itemId: it.id, position: pos, scoring: it.scoring, probes: map[it.id].probes, fired: a.fired, answer: a.answer, points: sc.points, max: sc.max });
      }
      s.assess = { ...(s.assess ?? {}), [time]: { form, points: pts, max: 12, pct: pts / 12, free, items1to4: c14, nulls: nul } }; save(dir, s);
    }
    write(path.join(dir, `ASSESS_${time}.json`), rows); console.log(`assess ${time}: answers ${rows.length}, sessions ${rows.length / 9}, grader null ${nulls}`);
  } else if (cmd === 'post') {
    const dir = dirArg(a1); const rows: any[] = [];
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx); const type = l.outcome.split('-')[3];
      rows.push({ learner: l.idx, rep: s.rep, arm: s.arm, band: l.band, outcome: l.outcome, type, explicitFirst: l.band !== 'B2', seq: l.seq, rounds: s.turns.filter((t) => t.events).length, assess: s.assess ?? {}, start: s.start.s, afterS1: s.stateAfterS1?.s ?? null, s2Start: s.stateS2Start?.s ?? null, endS2: s.stateEndS2?.s ?? null, delayed: s.stateDelayed?.s ?? null, retr: s.stateEndS2?.retr ?? null });
    }
    write(path.join(dir, 'POST.json'), rows); console.log('post rows', rows.length);
  } else if (cmd === 'tags') {
    const dir = dirArg(a1); const rows: any[] = []; const stuck: any[] = [];
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx);
      s.turns.forEach((t, k) => { if (t.tutor === undefined) return; rows.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, band: l.band, outcome: l.outcome, turn: k + 1, session: t.session, moves: t.moves ?? [], strand: t.strand ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, markerStatus: t.markerStatus ?? null, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, earlyLeakRaw: t.earlyLeakRaw ?? 0, earlyLeakFinal: t.earlyLeakFinal ?? 0, lateAnswerFinal: t.lateAnswerFinal ?? 0, answerReleased: t.answerReleased ?? false, ev5: t.ev5 ?? {}, twoAsks: t.twoAsks ?? false, twoAsksRaw: t.twoAsksRaw ?? false, profileLines: t.profileLines ?? 0, production: t.production, events: t.events ?? null, retrieval: t.retrieval ?? [], next_task: t.next_task ?? null, applied: t.applied ?? [], rejected: t.rejected ?? [], stateBefore: t.stateBefore ?? null, stateAfter: t.stateAfter ?? null }); });
      for (const ses of [1, 2] as const) {
        const st = s.turns.filter((t) => t.session === ses); let runKey: string | undefined; let run = 0; let startTurn = 0;
        const flush = () => { if (run >= 3) stuck.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, band: l.band, session: ses, task: runKey, length: run, startTurn }); };
        for (let k = 1; k < st.length; k++) {
          const prevT = st[k - 1]; const p = st[k].production; if (prevT.tutor === undefined) break;
          const sh = shownItem(prevT.tutor, l.outcome); const nt = prevT.next_task as NextTask | undefined; const key = sh ? `item:${sh.id}` : nt && nt.kind !== 'none' ? `task:${nt.kind}:${norm(String(nt.correct ?? ''))}` : undefined;
          const answer = p.kind === 'blank' || p.kind === 'sentence';
          if (answer && key && !p.correct) { if (key === runKey) run++; else { flush(); runKey = key; run = 1; startTurn = s.turns.indexOf(st[k]) + 1; } }
          else { flush(); runKey = undefined; run = 0; }
        }
        flush();
      }
    }
    const out = a2 ? path.resolve(a2) : path.join(dir, 'TAGS.json'); write(out, rows); write(path.join(path.dirname(out), 'STUCK.json'), stuck); console.log('turn rows', rows.length, 'stuck runs', stuck.length);
  } else if (cmd === 'agreeprep') {
    const dir = dirArg(a1); const round = Number(a2); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')); const cases: { id: string; text: string }[] = []; const key: Record<string, string> = {};
    for (const [cid, sk] of Object.entries(km) as [string, string][]) { if (rand(`${NS}-agree`, cid) >= 0.2) continue; const s = load(dir, sk); const t = s.turns[round - 1]; if (!t.judgeInput) continue; const aid = `a${cid.slice(1)}`; cases.push({ id: aid, text: t.judgeInput }); key[aid] = `${sk}|${round}|${cid}`; }
    mkdirSync(path.join(dir, 'agree'), { recursive: true });
    const files = writeJudgeBatches(path.join(dir, 'agree'), `ag${round}`, cases, 36, `${NS}-agree`); write(path.join(dir, 'agree', `ag${round}_FILES.json`), files); write(path.join(dir, 'agree', `ag${round}_KEY.json`), key);
    console.log('agreement cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'agreescore') {
    const dir = dirArg(a1); const res: any = { _label: 'SIMULATION ONLY', rounds: {}, sessions: { 1: { cases: 0, same: 0 }, 2: { cases: 0, same: 0 } }, cases: 0, same: 0, missing: 0, comparedOn: 'strengths, independent counts and counted retrievals after applying each judge\'s events (esl6_forget.comparable)' };
    for (const f of readdirSync(path.join(dir, 'agree')).filter((x) => /^ag\d+_FILES\.json$/.test(x))) {
      const round = Number(f.match(/^ag(\d+)_/)![1]); const files = JSON.parse(readFileSync(path.join(dir, 'agree', f), 'utf8')); const key = JSON.parse(readFileSync(path.join(dir, 'agree', `ag${round}_KEY.json`), 'utf8'));
      const { out, missing } = readJudge(path.join(dir, 'agree'), files); const ses = round <= TURNS_PER_SESSION ? 1 : 2;
      const pairs = Object.entries(out).map(([aid, j2]) => { const [sk] = key[aid].split('|'); const s = load(dir, sk); const t = s.turns[round - 1]; return { t, j2: j2 as any }; });
      const ops = pairs.flatMap(({ t, j2 }) => [{ op: 'apply', state: t.stateBefore, events: t.events ?? [], last: t.production, session: t.session, retrieval: t.retrieval ?? [] }, { op: 'apply', state: t.stateBefore, events: j2.events ?? [], last: t.production, session: t.session, retrieval: j2.retrieval ?? [] }]);
      const r = py<{ state: KState }>(ops); const cmp = py<string>(r.map((x) => ({ op: 'cmp', state: x.state })));
      let same = 0; pairs.forEach((_, i) => { if (cmp[2 * i] === cmp[2 * i + 1]) same++; }); const n = pairs.length;
      res.rounds[round] = { session: ses, cases: n, same, agreement: n ? +(same / n).toFixed(4) : null, missing: missing.length }; res.cases += n; res.same += same; res.missing += missing.length; res.sessions[ses].cases += n; res.sessions[ses].same += same;
    }
    for (const k of [1, 2]) res.sessions[k].agreement = res.sessions[k].cases ? +(res.sessions[k].same / res.sessions[k].cases).toFixed(4) : null;
    res.agreement = res.cases ? +(res.same / res.cases).toFixed(4) : null;
    res.pass = res.missing === 0 && res.agreement !== null && res.agreement >= 0.85 && res.sessions[2].agreement !== null && res.sessions[2].agreement >= 0.85;
    write(path.join(dir, 'JUDGE_AGREEMENT.json'), res); console.log(JSON.stringify(res));
  } else if (cmd === 'recheckprep') {
    // DECISIONS 2 / PROTOCOL §10.5: 10% of all scored answers (all times, arms, learners, items), rand('esl6-recheck', answerId) < 0.1; 3 independent scorers,
    // rubric + item only, blind to arm, learner, time and grader score; each scorer gets its own order; 40 answers per batch.
    const dir = dirArg(a1); const all = TIMES.flatMap((t) => { const p = path.join(dir, `ASSESS_${t}.json`); if (!existsSync(p)) throw new Error(`missing ${p}`); return JSON.parse(readFileSync(p, 'utf8')) as any[]; });
    const sample = all.filter((r) => rand(`${NS}-recheck`, r.answerId) < 0.1); const key: Record<string, any> = {};
    for (const sc of ['s1', 's2', 's3']) {
      const d = path.join(dir, 'recheck', sc); mkdirSync(d, { recursive: true });
      const order = [...sample].sort((x, y) => (sha(`${NS}-recheck|${sc}|${x.answerId}`) < sha(`${NS}-recheck|${sc}|${y.answerId}`) ? -1 : 1));
      const files: { batch: string; ids: string[] }[] = [];
      for (let b = 0; b * 40 < order.length; b++) {
        const batch = `rc${String(b + 1).padStart(2, '0')}`; const chunk = order.slice(b * 40, b * 40 + 40);
        const txt = `Batch ${batch} (scorer ${sc}). Score every answer with docs/SCORING_RUBRIC.md and write {"batch":"${batch}","scores":{"<answer id>":<points>,...}} to the file named in your task.\n` + chunk.map((r) => { const it = bank().items.get(r.itemId)!; return `\n=========== ANSWER ${r.answerId} ===========\nITEM TYPE: ${it.type}\nSCORING: ${it.scoring === 'exact' ? 'exact (0 or 1 point)' : 'target form 0/1/2'}\nPROMPT: ${it.prompt}\nANSWER KEY: ${it.answerKey}\nACCEPTED ANSWERS: ${(it.acceptedAnswers ?? []).join(' | ')}\n${it.matchingNote ? `MATCHING NOTE: ${it.matchingNote}\n` : ''}${it.targetForm ? `TARGET FORM: ${it.targetForm}\n` : ''}${it.rubric ? `RUBRIC: ${it.rubric}\n` : ''}LEARNER ANSWER: ${r.answer === '' ? '(empty)' : r.answer}\n`; }).join('');
        writeFileSync(path.join(d, `${batch}.md`), txt); files.push({ batch, ids: chunk.map((r) => r.answerId) });
      }
      write(path.join(d, 'FILES.json'), files);
    }
    for (const r of sample) key[r.answerId] = { itemId: r.itemId, scoring: r.scoring, grader: r.points ?? 0, graderNull: r.points === null, max: r.max };
    write(path.join(dir, 'recheck', 'KEY.json'), key); console.log('recheck answers', sample.length, 'of', all.length, 'batches per scorer', Math.ceil(sample.length / 40));
  } else if (cmd === 'recheckscore') {
    const dir = dirArg(a1); const key = JSON.parse(readFileSync(path.join(dir, 'recheck', 'KEY.json'), 'utf8')) as Record<string, any>; const got: Record<string, Record<string, number>> = {}; const missing: string[] = [];
    for (const sc of ['s1', 's2', 's3']) { const files = JSON.parse(readFileSync(path.join(dir, 'recheck', sc, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[]; for (const f of files) { const p = path.join(dir, 'recheck', sc, `${f.batch}.json`); if (!existsSync(p)) { missing.push(`${sc}/${f.batch}`); continue; } const d = JSON.parse(readFileSync(p, 'utf8')); for (const id of f.ids) { const v = d.scores?.[id]; if (typeof v !== 'number') missing.push(`${sc}/${f.batch}:${id}`); else (got[id] ??= {})[sc] = v; } } }
    const ref = (v: number[]) => { const c: Record<number, number> = {}; v.forEach((x) => (c[x] = (c[x] ?? 0) + 1)); const m = Object.entries(c).find(([, n]) => n >= 2); return m ? Number(m[0]) : [...v].sort((a, b) => a - b)[1]; };
    const ex: { g: number; r: number }[] = []; const tf: { g: number; r: number }[] = []; const prim: { g: number; r: number }[] = [];
    for (const [id, k] of Object.entries(key)) { const v = got[id]; if (!v || Object.keys(v).length !== 3) continue; const r = ref([v.s1, v.s2, v.s3]); (k.scoring === 'exact' ? ex : tf).push({ g: k.grader, r }); if (k.scoring === 'exact' && PRIMARY_TYPES.has(bank().items.get(k.itemId)?.type ?? '')) prim.push({ g: k.grader, r }); }
    const qwk = (xs: { g: number; r: number }[]) => { const K = 3; const O = Array.from({ length: K }, () => Array(K).fill(0)); xs.forEach(({ g, r }) => O[g][r]++); const n = xs.length; if (!n) return null; const hg = O.map((row) => row.reduce((a, b) => a + b, 0)); const hr = [0, 1, 2].map((j) => O.reduce((a, row) => a + row[j], 0)); let num = 0; let den = 0; for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const w = (i - j) ** 2 / (K - 1) ** 2; num += w * O[i][j]; den += w * hg[i] * hr[j] / n; } return den === 0 ? 1 : +(1 - num / den).toFixed(4); };
    const agree = (xs: { g: number; r: number }[]) => (xs.length ? +(xs.filter((x) => x.g === x.r).length / xs.length).toFixed(4) : null);
    const exact = agree(ex); const primary = agree(prim); const q = qwk(tf);
    // DECISIONS 9 + 11: the guard is >=95% exact agreement on PRIMARY items only (gap-fill and choice items);
    // all-exact agreement (incl. error correction) and free-item QWK are reported, not guards.
    const res = { _label: 'SIMULATION ONLY', sampled: Object.keys(key).length, primaryItems: prim.length, primaryAgreement: primary, exactItems: ex.length, exactAgreement: exact, freeItems: tf.length, qwk: q, missing, guard: 'primary (gap-fill/choice) exact agreement >= 0.95', pass: !missing.length && primary !== null && primary >= 0.95 };
    write(path.join(dir, 'GRADER_RECHECK.json'), res); console.log(JSON.stringify({ ...res, missing: missing.length }));
  } else if (cmd === 'rateprep') {
    const dir = dirArg(a1); const out = path.resolve(a2 ?? path.join(dir, 'rate')); mkdirSync(out, { recursive: true }); const labels = ['V', 'W']; const key: Record<string, any> = {};
    const order = [...LEARNERS()].sort((a, b) => (sha(`${NS}r|${a.idx}`) < sha(`${NS}r|${b.idx}`) ? -1 : 1));
    for (let n = 0; n * 10 < order.length; n++) {
      const id = `rt${String(n + 1).padStart(2, '0')}`; let t = `Batch ${id}. Rate every case as described in the rater instructions (two tutors per case) and write the JSON to the file named in your task.\n`; key[id] = {};
      for (const l of order.slice(n * 10, n * 10 + 10)) {
        const arms = [...ARMS].sort((a, b) => (sha(`${NS}ra|${l.idx}|${a}`) < sha(`${NS}ra|${l.idx}|${b}`) ? -1 : 1)); const cid = `c${sha(`${NS}case|${l.idx}`).slice(0, 6)}`; key[id][cid] = { studentIdx: l.idx, labels: Object.fromEntries(arms.map((a, k) => [labels[k], a])) };
        t += `\n\n=========== CASE ${cid} ===========\nLearner: English learner in Egypt (first language Arabic). Lesson topic: ${lessonOf(l.outcome).title}. Two short lessons, two days apart.\n`;
        arms.forEach((a, k) => { const s = load(dir, `s${l.idx}_${a}_r1`); t += `\n----- TUTOR ${labels[k]} -----\n${s.turns.map((x) => `${x.session === 2 && s.turns.find((y) => y.session === 2) === x ? '(two days later)\n' : ''}STUDENT: ${x.learner}\nTUTOR: ${x.tutor ?? ''}`).join('\n')}\n`; });
      }
      writeFileSync(path.join(out, `${id}.md`), t);
    }
    write(path.join(out, 'KEY.json'), key); console.log('rater batches', Object.keys(key).length);
  } else if (cmd === 'fidprep') {
    const dir = dirArg(a1); mkdirSync(path.join(dir, 'fidelity'), { recursive: true }); const items: { id: string; text: string }[] = [];
    for (const f of sessionFiles(dir)) { const s = load(dir, f.replace(/\.json$/, '')); if (s.arm !== 'PP') continue; s.turns.forEach((t, k) => { const id = `f${sha(`${NS}fid|${f}|${k}`).slice(0, 10)}`; if (t.tutor === undefined || rand(`${NS}-fid`, id) >= 0.1) return; const before = s.turns.slice(0, k + 1).filter((x) => x.session === t.session); const conv = before.map((x, i) => `STUDENT: ${x.learner}${i < before.length - 1 ? `\nTUTOR: ${x.tutor ?? ''}` : ''}`).join('\n'); items.push({ id, text: `CONVERSATION SO FAR:\n${conv}\n\nTUTOR REPLY TO CHECK:\n${t.tutor}` }); }); }
    const per = 36; const batches: string[] = [];
    for (let b = 0; b * per < items.length; b++) { const id = `fd${String(b + 1).padStart(2, '0')}`; batches.push(id); writeFileSync(path.join(dir, 'fidelity', `${id}.md`), `Batch ${id}. Check every case with the fidelity instructions and write the JSON to the file named in your task.\n` + items.slice(b * per, b * per + per).map((x) => `\n\n=========== CASE ${x.id} ===========\n${x.text}`).join('')); }
    console.log('fidelity cases', items.length, batches.join(' '));
  } else if (cmd === 'status') {
    const dir = dirArg(a1); const c: Record<string, number> = {};
    for (const f of sessionFiles(dir)) { const s = load(dir, f.replace(/\.json$/, '')); const k = `${s.turns.filter((t) => t.tutor !== undefined).length} replies / ${s.turns.filter((t) => t.events).length} judged${s.stateS2Start ? ' / f1-2' : ''}${s.stateDelayed ? ' / f1-7' : ''}`; c[k] = (c[k] ?? 0) + 1; }
    console.log(JSON.stringify(c));
  }
  // ------------------------------------------------------------------------------------------------ dry-run helpers (no agents; refused outside a DRY_RUN dir)
  else if (cmd === 'dryreply') {
    // one scripted reply per pending session, written as per-cell answer files and applied with applyTutor exactly as tapply does
    const dir = dirArg(a1); needDry(dir); const round = Number(a2); let n = 0;
    for (const c of cells()) {
      const ans: Record<string, string> = {};
      for (const key of c.keys) {
        const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined) continue; const L = lessonOf(s.outcome); const it = L.spec.items[(round - 1) % Math.max(1, L.spec.items.length)];
        const task = it ? coreOf(it.prompt) : `Write one sentence about your day. Use ${outcomes()[s.outcome].topic}.`;
        ans[key] = `${s.arm === 'LE' ? '[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM]]\n' : ''}Good. ${L.spec.examples[0] ?? ''}\nNow you: ${task}`;
      }
      const p = path.join(dir, 'dry_answers', `${c.id}_r${round}.json`); mkdirSync(path.dirname(p), { recursive: true }); write(p, ans);
      // same path as tapply: applyTutor on every key of the cell answer file
      for (const [key, t] of Object.entries(ans)) { const s = load(dir, key); await applyTutor(s, t); save(dir, s); n++; }
    }
    console.log('dry replies applied', n);
  } else if (cmd === 'dryjudge' || cmd === 'dryagree') {
    // scripted judge output: R1 on W1 every turn, R3/R4 on tested beliefs when the production was correct, a blank next task probing every Wk,
    // retrieval on session-2 correct answers; dryagree writes the same for the agreement batches except it drops R4 on 1 case in 10 (to exercise disagreement)
    const dir = dirArg(a1); needDry(dir); const round = Number(a2); const sub = cmd === 'dryjudge' ? 'judge' : 'agree'; const tag = cmd === 'dryjudge' ? `r${round}` : `ag${round}`;
    const files = JSON.parse(readFileSync(path.join(dir, sub, `${tag}_FILES.json`), 'utf8')) as { batch: string; ids: string[] }[];
    const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')); const ak = cmd === 'dryagree' ? JSON.parse(readFileSync(path.join(dir, 'agree', `ag${round}_KEY.json`), 'utf8')) : {};
    for (const f of files) {
      const cases: Record<string, any> = {};
      for (const id of f.ids) {
        const sk = cmd === 'dryjudge' ? km[id] : ak[id].split('|')[0]; const s = load(dir, sk); const t = s.turns[round - 1]; const o = outcomes()[s.outcome];
        const ok = t.production.kind !== 'none' && t.production.correct; const cs = o.ws.map((w) => PAIR[w]);
        const ev = [{ rule: 'R1', belief: 'W1', quote: 'rule' }, ...(ok ? cs.flatMap((c) => [{ rule: 'R3', belief: c }, ...(cmd === 'dryagree' && rand('dryagree', id) < 0.1 ? [] : [{ rule: 'R4', belief: c }])]) : [])];
        cases[id] = { events: ev, retrieval: t.session === 2 && ok ? cs : [], next_task: { kind: 'blank', probes: o.ws, correct: `ok-${round}`, errors: Object.fromEntries(o.ws.map((w) => [w, `${w}-error-${round}`])) } };
      }
      write(path.join(dir, sub, `${f.batch}.json`), { batch: f.batch, cases });
    }
    console.log(`${cmd} wrote`, files.length, 'batches');
  } else if (cmd === 'dryscore') {
    // scripted recheck scorers: scorers 1 and 2 copy the grader, scorer 3 copies it except on 1 answer in 20 (exercises majority + QWK)
    const dir = dirArg(a1); needDry(dir); const all = new Map(TIMES.flatMap((t) => (JSON.parse(readFileSync(path.join(dir, `ASSESS_${t}.json`), 'utf8')) as any[]).map((r) => [r.answerId, r] as const)));
    for (const sc of ['s1', 's2', 's3']) { const files = JSON.parse(readFileSync(path.join(dir, 'recheck', sc, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[]; for (const f of files) write(path.join(dir, 'recheck', sc, `${f.batch}.json`), { batch: f.batch, scores: Object.fromEntries(f.ids.map((id) => { const r = all.get(id)!; const g = r.points ?? 0; return [id, sc === 's3' && rand('dryscore', id) < 0.05 ? (g === 0 ? 1 : 0) : g]; })) }); }
    console.log('dry scorer files written');
  } else {
    console.log('commands: hashcheck | answercheck | overlap | init | tprompts | promptcheck | tapply | status | jprep | japply | f1 | assess | post | tags | agreeprep | agreescore | recheckprep | recheckscore | rateprep | fidprep');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
