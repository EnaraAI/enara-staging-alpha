// SIMULATION ONLY. NO API. planner2 study (PLN2) runner (pre-registered: config/agent_sim_pln2/PROTOCOL.md; commands: config/agent_sim_pln2/RUNBOOK.md).
// Built from esl6Study.ts (same engine glue, rule-based learner, event judging R1-R7 via esl6_forget.py, F1 v2, Latin-square outcome assessment scored by
// the real deterministic grader, grader recheck) with these changes:
//   - Arms: OFF = the ESL6 LE env exactly; P2 = the same env + ",planner2". One replication. No P+ arm.
//   - Learners: 4 groups x 12 = 48 (ids 2000-2047): TASK (adults, B1 label, goal work/exam/daily, developing, A2 state with a fossilised wrong belief),
//     TTT (teens, A2: 8 mostly known / developing, 4 A2-start / emerging), LAD (children 6-8, A1 / Pre-A1), KIDPPP (children 9-12, A1/A2). The trusted age band
//     (staff-set) reaches the language engine in BOTH arms; only the planner differs.
//   - P2 prompt = the live learningContext path: PlanInput (+ ageBand), planner signals, progressFromHistory(stored language-turn verdicts),
//     quickCheckSignals, planLesson, planLines + shapeLines(stage); in the quick check (S4q) the language context drops QUICK_CHECK_DROPPED moves,
//     skips ruleFirst and appends QUICK_CHECK_LINE (as buildLanguageTeachingContext); 2+ in-session Arabic-transfer diagnoses add the l1_transfer
//     misconception (as learningContext).
//   - Fit judging (fitprep / fitapply): one arm-blind case per finished session with the group's rubric; 12 cases per batch; a 10% re-judged sample.
//   - Event-judge agreement: a 10% sample of all rounds' cases (one agreeprep after the last round).
// The engine sees only what a real tutor sees (learner messages, lesson data, course level, objective status, staff-set age band, birth-date age, goal,
// ENARA's own stored record); never the simulator state (promptcheck enforces it before every round).
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/pln2Study.ts <cmd> ...
// Commands: hashcheck | overlap <dir> | init <dir> | tprompts <dir> <cell> | promptcheck <dir> | tapply <dir> <cell> <answers.json> | status <dir>
//           | jprep <dir> <round> | japply <dir> <round> | agreeprep <dir> | agreescore <dir> | f1 <dir> 7 | assess <dir> <pre|imm|del> | post <dir>
//           | tags <dir> | recheckprep <dir> | recheckscore <dir> | fitprep <dir> | fitapply <dir> | plans <dir>
//           dry-run only (refused unless <dir>/DRY_RUN exists): dryreply <dir> <round> | dryjudge <dir> <round> | dryagree <dir> | dryscore <dir> | dryfit <dir>
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks,
  esl5Adjust, knownKey, independentSuccessItem, QUICK_CHECK_DROPPED, QUICK_CHECK_LINE, type LanguageTeachingContext, type TrustedAgeBand,
} from '../../../../backend/src/services/languageTeachingContext';
import { stripAssessmentMarkers, isFailure, L1_TRANSFER_CODES } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy, completeLanguageTurn } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput, type TeachingPlan } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { QUICK_CHECK_PLAN_LINE, quickCheckActive, planLesson, progressFromHistory, quickCheckSignals, reviewOpener, shapeLines, stageNow, levelRank, type LessonPlan, type PlannerSignals, type StageProgress, type Goal } from '../../../../backend/src/services/lessonPlanner';
import { applyTurn, summarizeProfile, applyLiveErrors, applyKnownPoints, liveErrorTypes, type Esl5Record } from '../../../../backend/src/services/learnerLanguageProfile';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { graderV2On } from '../../../../backend/src/services/graderV2';
import { LESSONS6, OUTCOME_IDS } from './esl6Fixtures';
import { createHash } from 'crypto';

// Copied from esl6Study.ts (same formulas and batch format). esl6Study.ts / learnerSim.ts are NOT imported: they run their own CLI on import.
interface Production { kind: 'blank' | 'sentence' | 'rule' | 'none'; correct?: boolean; fired?: 'W1' | 'W2'; text: string }
interface NextTask { kind: 'blank' | 'sentence' | 'rule' | 'none'; probes?: string[]; correct?: string; errors?: Record<string, string> }
interface JudgeEvent { rule: string; belief: string; quote?: string }
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rand = (...parts: (string | number)[]) => parseInt(sha(parts.join('|')).slice(0, 8), 16) / 2 ** 32;
function writeBatches(dir: string, tag: string, cases: { id: string; text: string }[], per: number, seed: string, head: (batch: string) => string) {
  const order = [...cases].map((c, i) => ({ c, k: sha(`${seed}|${tag}|${c.id}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.c);
  const files: { batch: string; ids: string[] }[] = [];
  for (let n = 0; n * per < order.length; n++) {
    const chunk = order.slice(n * per, (n + 1) * per); const batch = `${tag}_j${String(n + 1).padStart(2, '0')}`;
    writeFileSync(path.join(dir, `${batch}.md`), head(batch) + chunk.map((c) => `\n=========== CASE ${c.id} ===========\n${c.text}\n`).join(''));
    files.push({ batch, ids: chunk.map((c) => c.id) });
  }
  return files;
}
const judgeHead = (batch: string) => `Batch ${batch}. Judge every case with JUDGE_INSTRUCTIONS.md and LEARNING_RULES.md. Write {"batch":"${batch}","cases":{...}} to the file named in your task.\n`;
function readJudge<T = { events: JudgeEvent[]; next_task: NextTask; retrieval?: string[] }>(dir: string, files: { batch: string; ids: string[] }[]) {
  const out: Record<string, T> = {}; const missing: string[] = [];
  for (const f of files) {
    const p = path.join(dir, `${f.batch}.json`); if (!existsSync(p)) { missing.push(f.batch); continue; }
    const d = JSON.parse(readFileSync(p, 'utf8')) as { cases: Record<string, T> };
    for (const id of f.ids) if (d.cases?.[id]) out[id] = d.cases[id]; else missing.push(`${f.batch}:${id}`);
  }
  return { out, missing };
}

type Arm = 'OFF' | 'P2';
type Group = 'TASK' | 'TTT' | 'LAD' | 'KIDPPP';
type Time = 'pre' | 'imm' | 'del';
const ARMS: Arm[] = ['OFF', 'P2'];
const GROUPS: Group[] = ['TASK', 'TTT', 'LAD', 'KIDPPP'];
const TIMES: Time[] = ['pre', 'imm', 'del'];
const ROOT = path.join(__dirname, '../..');            // research/deep-learning-simulation-v2
const REPO = path.join(ROOT, '../..');                 // repository root
const CFG = path.join(ROOT, 'config/agent_sim_pln2');
const CFG6 = path.join(ROOT, 'config/agent_sim_esl6'); // learning rules, F1, item-belief map, wrong answers (used unchanged)
const REPS = [1] as const;
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
// OFF = the ESL6 LE env exactly; P2 = OFF + planner2.
export const ENV_OF: Record<Arm, string> = { OFF: `${BASE},levelExplicit,esl5,graderV2`, P2: `${BASE},levelExplicit,esl5,graderV2,planner2` };
const PRIMARY_TYPES = new Set(['gap_fill', 'controlled_gap_fill', 'multiple_choice', 'controlled_choice']);
const GRADER_ENV = 'graderV2';
const SESSIONS = 1; const TURNS_PER_SESSION = 7; /* amendment B: 7 rounds (TTT gets teaching turns after the quick check) */ const ROUNDS = SESSIONS * TURNS_PER_SESSION; const DAY = 86_400_000; const T0 = Date.parse('2027-04-05T09:00:00Z');
const DELAY_DAYS = 7;
const JUDGE_PER = 72; const FIT_PER = 12; const AGREE_SHARE = 0.1; const FIT_AGREE_SHARE = 0.1; const RECHECK_PER = 40; const SCORERS = ['s1']; /* amendment B: 1 recheck scorer (ESL6 recheck agreed 100%) */
const CELLS_PER_ARM = 3;                               // 3 cells of 16 sessions per arm -> 6 tutor task files per round
const LESSON_ID = 'lsn';
const NS = 'pln2';
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
const dirArg = (d: string) => path.resolve(d);

// ---------------------------------------------------------------------------------------------------------- python bridge (esl6_forget.py, esl6_outcomes.py; unchanged)
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

interface KState { form: string; band: 'A1' | 'A2' | 'B2'; primary: 'W1' | 'W2'; ws: ('W1' | 'W2')[]; s: Record<'W1' | 'W2' | 'C1' | 'C2', number>; indep: { C1: number; C2: number }; start: Record<string, number>; retr: { C1: number[]; C2: number[] }; afterF1: boolean; sec1?: string }
const EPS = 1e-9;
const pWrong = (w: number) => (w >= 1.5 - EPS ? 0.8 : w >= 0.5 - EPS ? 0.4 : 0.05);
const recallFloor = (c: number) => 0.4 * Math.max(0, 1 - c / 2);
const itemErrorProb = (k: KState, w: 'W1' | 'W2', floorOn = k.afterF1) => Math.max(pWrong(k.s[w]), floorOn ? recallFloor(k.s[PAIR[w] as 'C1' | 'C2']) : 0);

// ---------------------------------------------------------------------------------------------------------- learners (PROTOCOL §4)
interface Learner {
  idx: number; group: Group; outcome: string; level: string; stateBand: 'A1' | 'A2'; status: string; primary: 'W1' | 'W2'; seq: Record<Time, 'A' | 'B' | 'C'>;
  ageBand: 'child' | 'teen' | 'adult'; ageYears?: number; goal?: Goal;
  /** TTT "mostly known" learner: every wrong belief at 0 and every used correct belief at 1 (known but not secure) instead of the A2 band start. */
  knowsMost?: boolean;
}
const SEQS: Record<Time, 'A' | 'B' | 'C'>[] = [{ pre: 'A', imm: 'B', del: 'C' }, { pre: 'B', imm: 'C', del: 'A' }, { pre: 'C', imm: 'A', del: 'B' }];
const FIRST_ID = 2000;
const seeded = (xs: string[], salt: string) => [...xs].sort((a, b) => (sha(`${NS}|pick|${salt}|${a}`) < sha(`${NS}|pick|${salt}|${b}`) ? -1 : 1));
/** Outcome assignment (deterministic, seeded; every one of the 30 bank outcomes is used at least once). */
export function outcomePlan(): Record<Group, string[]> {
  const A1 = OUTCOME_IDS.filter((o) => /^EN-F-A1-/.test(o)); const A2 = OUTCOME_IDS.filter((o) => /^EN-F-A2-/.test(o));
  const a2form = A2.filter((o) => !/-VO-/.test(o)); const a2vo = A2.filter((o) => /-VO-/.test(o));
  const task = seeded(a2form, 'TASK');                                        // 11 GR + 1 FN: every A2 form outcome once (fossilised A2 errors)
  const ttt = seeded([...a2vo, ...seeded(a2form, 'TTT').slice(0, 8)], 'TTTo'); // 4 VO + 8 form outcomes
  const a1vo = A1.filter((o) => /-VO-/.test(o)); const a1gr = A1.filter((o) => !/-VO-/.test(o));
  const lad = seeded([...a1vo, ...seeded(a1gr, 'LAD').slice(0, 6)], 'LADo');   // 6 VO + 6 GR (A1)
  const a1rest = A1.filter((o) => !lad.includes(o)); const a2rest = A2.filter((o) => !ttt.includes(o));
  const kidA1 = [...a1rest, ...seeded(A1.filter((o) => !a1rest.includes(o)), 'KIDA1').slice(0, 6 - a1rest.length)];
  const kidA2 = [...a2rest, ...seeded(A2.filter((o) => !a2rest.includes(o)), 'KIDA2').slice(0, 6 - a2rest.length)];
  const kid = seeded(kidA1, 'KIDo1').flatMap((o, i) => [o, seeded(kidA2, 'KIDo2')[i]]); // A1, A2 alternating
  return { TASK: task, TTT: ttt, LAD: lad, KIDPPP: kid };
}
function buildLearners(): Learner[] {
  const O = outcomes(); const plan = outcomePlan(); const out: Learner[] = [];
  const goals: Goal[] = ['work', 'exam', 'daily'];
  GROUPS.forEach((g, gi) => plan[g].forEach((oid, p) => {
    const idx = FIRST_ID + 12 * gi + p; const two = O[oid].ws.length === 2; const a1 = /^EN-F-A1-/.test(oid);
    const base = { idx, group: g, outcome: oid, primary: (two && p % 2 === 1 ? 'W2' : 'W1') as 'W1' | 'W2', seq: SEQS[p % 3] };
    if (g === 'TASK') out.push({ ...base, level: 'B1', stateBand: 'A2', status: 'developing', ageBand: 'adult', goal: goals[p % 3] });
    // TTT: 8 "mostly known" learners (developing; expected to get >= 2 of 3 quick-check items right) and 4 with the A2 band start (emerging; a fossilised
    // wrong belief at 2, expected < 2 of 3), so both the TTT and the PPP-after-the-check branches occur (about 2/3 TTT).
    else if (g === 'TTT') out.push({ ...base, level: 'A2', stateBand: 'A2', status: p % 3 === 2 ? 'emerging' : 'developing', ageBand: 'teen', goal: 'school', ...(p % 3 === 2 ? {} : { knowsMost: true }) });
    else if (g === 'LAD') out.push({ ...base, level: p % 3 === 2 ? 'Pre-A1' : 'A1', stateBand: 'A1', status: p % 2 === 0 ? 'not_assessed' : 'emerging', ageBand: 'child', ageYears: 6 + (p % 3) });
    else out.push({ ...base, level: a1 ? 'A1' : 'A2', stateBand: a1 ? 'A1' : 'A2', status: p % 4 < 2 ? 'not_assessed' : 'emerging', ageBand: 'child', ageYears: 9 + (p % 4) });
  }));
  return out;
}
let LRN: Learner[] | undefined;
const LEARNERS = () => (LRN ??= buildLearners());
const L_OF = (idx: number): Learner => LEARNERS().find((l) => l.idx === idx)!;
const seedOf = (idx: number, rep: number) => `${NS}|L${idx}|rep${rep}`;
/** TTT "mostly known" start: no wrong belief (error 0.05 per probed item), every used correct belief at 1 (known, not secure: after F1 the recall floor
 *  gives 0.2 error per item until teaching or practice raises it to 2). Also the F1 floor (start strengths). */
function knowsMostStart(st: KState): KState {
  const s = { W1: 0, W2: 0, C1: 1, C2: st.ws.includes('W2') ? 1 : 0 };
  return { ...st, s: { ...s }, start: { ...s } };
}
/** Predicted quick-check split (descriptive, written at init): items answered on turns 2-4 from the start state, every Wk probed. */
function predictedQuickCheck(l: Learner, st: KState, rep: number) {
  let right = 0; for (const turn of [2, 3, 4]) if (!st.ws.some((w) => rand(seedOf(l.idx, rep), 'prod', turn, w) < itemErrorProb(st, w))) right++;
  return right;
}

// ---------------------------------------------------------------------------------------------------------- sessions
interface LangTurn { assessment?: any; activeItem?: any; hintLevel?: number; rulesIntroduced?: number[]; closingAsk?: string; diagnosis?: string; [k: string]: unknown }
interface PlannerTag { arm: Arm; primary: string; supporting: string[]; shape?: string; shapeRule?: string; methodRule?: string; stage?: string; quickCheck?: boolean; childSupports?: boolean; l1Diagnoses?: number; l1Misconception?: boolean; progress?: StageProgress; explanation?: string }
interface Turn { session: 1 | 2; learner: string; production: Production; tutor?: string; raw?: string; ev5?: Record<string, unknown>; lang?: LangTurn; judgeInput?: string; planner?: PlannerTag; [k: string]: unknown }
interface Rec { entries: any[]; liveErrors: Record<string, { seen: number; lastCorrect?: boolean }>; knownPoints: Record<string, number> }
interface AssessSummary { form: string; points: number; max: number; pct: number; free: number; items1to4: number; nulls: number; primary: number; primaryMax: number; ecRewrite: number; ecRewriteMax: number }
interface Sess { arm: Arm; rep: number; learnerIdx: number; group: Group; outcome: string; seed: string; state: KState; start: KState; rec: Rec; turns: Turn[]; stateEnd?: KState; stateDelayed?: KState; assess?: Partial<Record<Time, AssessSummary>> }
const keyOf = (s: { learnerIdx: number; arm: Arm; rep: number }) => `s${s.learnerIdx}_${s.arm}_r${s.rep}`;
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'), (k, v) => (/At$/.test(k) && typeof v === 'string' ? new Date(v) : v));
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const sessionFiles = (dir: string) => readdirSync(path.join(dir, 'sessions')).filter((f) => f.endsWith('.json')).sort();
const GOAL_WORDS: Record<string, string> = { work: 'I need English for my job.', exam: 'I have an English exam soon.', daily: 'I need English for daily life here.' };
/** First learner message (same in both arms). TASK learners state their goal, so an OFF tutor can also build a goal task. */
const opener = (l: Learner): Turn => {
  const t = outcomes()[l.outcome].topic;
  const text = l.group === 'TASK' ? `Hello! ${GOAL_WORDS[l.goal!]} Can we practise ${t}?` : l.ageBand === 'child' ? `Hi! Can we learn ${t} today?` : `Hello! Can you give me an exercise on ${t}?`;
  return { session: 1, learner: text, production: { kind: 'none', text: '' } };
};
// Cells: arm x 3 parts (learner id mod 3) = 6 cells per round of 16 sessions (4 per group).
const cells = () => ARMS.flatMap((arm) => Array.from({ length: CELLS_PER_ARM }, (_, p) => ({ id: `${arm}_${p + 1}`, arm, keys: LEARNERS().filter((l) => l.idx % CELLS_PER_ARM === p).map((l) => keyOf({ learnerIdx: l.idx, arm, rep: 1 })) })));
const caseId = (f: string, round: number) => `c${sha(`${NS}|${f}|${round}`).slice(0, 10)}`;

// ---------------------------------------------------------------------------------------------------------- engine glue
const lessonOf = (oid: string) => LESSONS6[oid];
/** Course level -> grade level, the ESL6 mapping (A1 4, A2 9, B1+ 18) with Pre-A1 as A1. Same in both arms. */
const gradeOf = (level: string) => { const r = levelRank(level) ?? 6; return r <= 1 ? 4 : r === 2 ? 9 : 18; };
/** PlanInput as ESL6 builds it, plus the trusted age band (both arms; ped-v2 reads ageBand only under methodSelect, which neither arm has). */
function planInput(l: Learner): PlanInput {
  return {
    objectiveId: l.outcome, masteryStatus: l.status,
    masteryEstimate: l.status === 'proficient' ? 0.8 : l.status === 'developing' ? 0.5 : l.status === 'emerging' ? 0.3 : 0.1,
    evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [],
    misconceptions: l.status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }],
    supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [], gradeLevel: gradeOf(l.level), subject: 'Grammar', relatedSecureObjectives: 0,
    belowB1: belowB1(l.level), ageBand: l.ageBand,
  };
}
/** Planner signals (from code: staff-set band, birth-date age, course level, learner goal). Same object in both arms; only P2 reads it. */
const signalsOf = (l: Learner): PlannerSignals => ({ ageBand: l.ageBand, ...(l.ageYears !== undefined ? { ageYears: l.ageYears } : {}), level: l.level, ...(l.goal ? { goal: l.goal } : {}) });
const trustedOf = (l: Learner): TrustedAgeBand => ({ band: l.ageBand, status: 'known', source: 'student_age_band' });
const sessionTurns = (s: Sess) => { const cur = s.turns[s.turns.length - 1].session; return s.turns.filter((t) => t.session === cur); };
const shownItem = (tutor: string, oid: string) => [...lessonOf(oid).spec.items].reverse().find((it) => norm(tutor).includes(norm(coreOf(it.prompt)).slice(0, 30)));
// The engine's history: ENARA's own stored evidence for each earlier reply of this session.
function history(turns: Turn[]) {
  const hist: any[] = [];
  for (const t of turns) { hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break; hist.push({ role: 'assistant', content: t.tutor, languageTurn: { ...(t.lang ?? {}), ...(t.ev5 ?? {}) } }); }
  return hist;
}
interface PlanOut { plan: TeachingPlan; text: string; lesson?: LessonPlan; stage?: string; quickCheck: boolean; progress?: StageProgress; l1: number; l1Added: boolean }
/** The "learning focus" block. OFF: exactly the ESL6 LE block. P2: the learningContext planner2 path (shape lines after the plan lines). */
function planOf(s: Sess): PlanOut {
  const l = L_OF(s.learnerIdx); process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const input = planInput(l);
  const head = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ${l.outcome} "${lessonOf(l.outcome).objective}". Status: ${STATUS_WORDS[l.status]}.`];
  const tail = ['- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  const wrap = (lines: string[]) => arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n');
  if (s.arm === 'OFF') { const plan = selectTeachingPlan(input); return { plan, text: wrap([...head, ...planLines(plan, undefined, l.status), ...tail]), quickCheck: false, l1: 0, l1Added: false }; }
  // P2 (learningContext.buildObjectiveContext, engineV2('planner2') block)
  const hist = history(sessionTurns(s).slice(0, -1)); const signals = signalsOf(l);
  const l1 = hist.flatMap((t) => { const code = t.role === 'assistant' ? (t.languageTurn as { diagnosis?: string } | null)?.diagnosis : undefined; return code && (L1_TRANSFER_CODES as string[]).includes(code) ? [code] : []; });
  let l1Added = false;
  if (l1.length >= 2 && !input.misconceptions.some((m) => m.category === 'l1_transfer')) { input.misconceptions = [{ id: `l1-session-${l.outcome}`, category: 'l1_transfer', status: 'suspected' }, ...input.misconceptions]; l1Added = true; }
  // amendment C: the code grade of the learner's message in this turn (tutor.controller -> currentKeyVerdict), as live.
  const stAll = sessionTurns(s); const lz = lessonOf(l.outcome);
  const currentVerdict = detectTurnSignals(stAll[stAll.length - 1].learner, hist, { title: lz.title, spec: lz.spec } as never).keyVerdict ?? null;
  const progress = progressFromHistory(hist, { verdict: currentVerdict });
  const op = reviewOpener(signals, input);
  const lesson = planLesson(input, { ...signals, ...quickCheckSignals(signals, progress, op) });
  const stage = stageNow(lesson, progress);
  return { plan: lesson.plan, text: wrap([...head, ...(quickCheckActive(lesson) ? [QUICK_CHECK_PLAN_LINE] : planLines(lesson.plan, undefined, l.status)), ...shapeLines(lesson, stage), ...tail]), lesson, stage, quickCheck: lesson.shapeRule === 'S4q', progress, l1: l1.length, l1Added };
}
const nowOf = (s: Sess) => new Date(T0 + s.turns.length * 60_000);
const esl5Record = (r: Rec): Esl5Record => ({ live: liveErrorTypes({ entries: r.entries, liveErrors: r.liveErrors }), knownPoints: { ...r.knownPoints } });
/** The language context (ESL6 glue) with the trusted age band in both arms and, in P2's quick check, buildLanguageTeachingContext's quickCheck branch. */
function langCtx(s: Sess, po: PlanOut = planOf(s)) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const lesson0 = lessonOf(l.outcome); const st = sessionTurns(s); const message = st[st.length - 1].learner;
  const hist = history(st.slice(0, -1)); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const signals0 = detectTurnSignals(message, hist, lesson as never);
  const moves0 = selectLanguageMoves({ band: levelBand(l.level), targetLanguage: 'English', lessonStatus: 'structured', signals: signals0, masteryStatus: l.status });
  const record = engineV2('reviewOpen') || engineV2('fadeKnown') ? esl5Record(s.rec) : undefined;
  const adjusted = esl5Adjust({ signals: signals0, moves: moves0, record, history: hist, lessonId: LESSON_ID });
  const quickCheck = po.quickCheck && engineV2('planner2');
  const signals = adjusted.signals;
  const moves = quickCheck ? adjusted.moves.filter((m) => !QUICK_CHECK_DROPPED.has(m.id)) : adjusted.moves;
  const learner = deriveLearnerContext({ courseLevel: l.level, courseLanguages: ['English'], adultSchool: false, trustedAgeBand: trustedOf(l), learnerMessages: [message], objectiveStatus: l.status });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec as never) : undefined;
  const planPrimary = po.plan.primary; process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const { explicit, ruleFirst } = quickCheck ? { explicit: undefined, ruleFirst: undefined } : ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: lesson0.spec as never, moves });
  const profile = summarizeProfile(s.rec.entries, nowOf(s));
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: LESSON_ID, title: lesson0.title, spec: lesson0.spec }, signals, moves, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(record ? { record } : {}) } as never;
  const prompt = renderLanguageContextPrompt(base);
  return { ...(base as object), ...(quickCheck ? { quickCheck: true } : {}), prompt: quickCheck ? `${prompt}\n\n${QUICK_CHECK_LINE}` : prompt } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => sessionTurns(s).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function enginePart(s: Sess): string { const po = planOf(s); return `${po.text}\n\n${langCtx(s, po).prompt}`; }
const tutorPrompt = (s: Sess) => `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next).\n\n${enginePart(s)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
// Item bookkeeping for the leak, release and stuck tags (as esl6Study.ts).
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
/** Descriptive quick-check heuristic (not the compliance measure): teaching, hint or correction words in a quick-check reply. */
const QC_TEACH = /\b(hint|remember|the rule|rule is|we use|you use|correct answer|should be|it should|the answer is|not quite|almost|try again|careful|look at)\b/i;
async function applyTutor(s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const written = raw.trim();
  // production order (tutor.controller): strip and parse the hidden marker, then the reply guards, then the turn evidence with the parsed marker.
  const marker = stripAssessmentMarkers(written); const text = marker.text;
  const po = planOf(s); const ctx = langCtx(s, po); const g = applyReplyGuards(ctx, text, last.learner); const final = g.text; const removed = g.removed; const closingAsk = g.closingAsk;
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const l = L_OF(s.learnerIdx); const sig = ctx.signals as any; const now = nowOf(s);
  const lt: any = await completeLanguageTurn({ language: ctx, reply: final, learnerText: last.learner, messageId: `${keyOf(s)}_t${s.turns.length}`, marker, removed, ...(closingAsk ? { closingAsk: closingAsk as never } : {}), institutionId: '', studentId: '' });
  const ev5: Record<string, unknown> = {}; for (const k of ['liveError', 'answerReleased', 'reviewOpen', 'fadeCheck', 'fadeCheckAnswered', 'fadeFailed', 'ownSentence']) if (lt[k] !== undefined) ev5[k] = lt[k];
  const verdict = lt.assessment?.verdict; const indep = independentSuccessItem(ctx, lt);
  const fadeFailed = engineV2('fadeKnown') && lt.fadeCheckAnswered?.length && isFailure(verdict) ? lt.fadeCheckAnswered : undefined;
  const o: any = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId: LESSON_ID, lessonTitle: lessonOf(l.outcome).title,
    ...(engineV2('liveError') ? { ...(sig.liveError ? { liveError: sig.liveError.code } : {}), ...(sig.liveTarget && lt.assessment && /^CORRECT/.test(String(verdict)) ? { liveCorrect: sig.liveTarget } : {}) } : {}),
    ...(engineV2('fadeKnown') ? { knownInc: (indep?.criteria ?? []).map((c: number) => knownKey(LESSON_ID, c)), knownReset: ((fadeFailed as number[] | undefined) ?? []).map((c) => knownKey(LESSON_ID, c)) } : {}) };
  if (o.errorCode || o.independentSuccessOn) s.rec.entries = applyTurn(s.rec.entries, o);
  if (engineV2('liveError') && (o.liveError || o.liveCorrect)) s.rec.liveErrors = applyLiveErrors(s.rec.liveErrors as never, o) as Rec['liveErrors'];
  if (engineV2('fadeKnown') && (o.knownInc?.length || o.knownReset?.length)) s.rec.knownPoints = applyKnownPoints(s.rec.knownPoints, o);
  // The stored language turn keeps the item diagnosis code (TutorMessage languageTurn.diagnosis), which learningContext reads for l1_transfer. Nothing in the
  // language engine reads it, so storing it in both arms leaves OFF's prompts as in ESL6.
  const lang: LangTurn = { assessment: lt.assessment, ...(lt.activeItem ? { activeItem: lt.activeItem } : {}), hintLevel: lt.hintLevel, ...(lt.rulesIntroduced?.length ? { rulesIntroduced: lt.rulesIntroduced } : {}), ...(closingAsk ? { closingAsk } : {}), ...(lt.diagnosis ? { diagnosis: lt.diagnosis } : {}) };
  const planner: PlannerTag = { arm: s.arm, primary: po.plan.primary, supporting: po.plan.supporting, ...(po.lesson ? { shape: po.lesson.shape, shapeRule: po.lesson.shapeRule, methodRule: po.lesson.methodRule, stage: po.stage, quickCheck: po.quickCheck, childSupports: po.lesson.childSupports, l1Diagnoses: po.l1, l1Misconception: po.l1Added, progress: po.progress, explanation: po.lesson.explanation } : {}) };
  Object.assign(last, { lang, planner, diagnosis: lt.diagnosis ?? null, markerStatus: lt.markerStatus ?? null, qualityFlags: lt.qualityFlags ?? [], moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.level), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ...(closingAsk ? { closingAsk } : {}), profileLines: (ctx as any).history?.length ?? 0, ev5, engineVerdict: verdict ?? null, recordLive: (ctx as any).record?.live ?? [], promptQuickCheck: Boolean((ctx as any).quickCheck) });
  const leakRaw = leakIn(s, text); const elRaw = earlyLeakIn(s, text); const el = earlyLeakIn(s, final);
  Object.assign(last, { tutor: final, ...(final !== written ? { raw: written } : {}), leakRaw, leakFinal: leakIn(s, final), earlyLeakRaw: elRaw.early, earlyLeakFinal: el.early, lateAnswerFinal: el.late, answerReleased: Boolean(last.ev5?.answerReleased), twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', twoAsksRaw: hasTwoAsks(text), qcTeachWords: QC_TEACH.test(final), ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- simulator side (LEARNING_RULES §1b, §2, §2a, §3a; ESL6 judge case text)
const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''));
const outcomeOfState = (k: KState) => Object.values(outcomes()).find((x) => x.key === k.form)!;
function stateText(k: KState): string {
  const o = outcomeOfState(k); const s = k.s;
  const lines = [`Target form: ${o.id} (${o.topic}). Learner level ${k.band}. First language Arabic.`, 'Session 1.'];
  for (const w of o.ws) lines.push(`${w} (wrong) strength ${fmt(s[w])}: ${o.W[w]}. Its error: ${o.E[w]}.`);
  for (const w of o.ws) { const c = PAIR[w] as 'C1' | 'C2'; lines.push(`${c} (correct) strength ${fmt(s[c])}: ${o.C[c]}. Independent correct productions so far: ${k.indep[c]}.`); }
  if (o.ws.length === 1) lines.push('This outcome has one wrong belief only (no W2, no C2).');
  return lines.join('\n');
}
function factLine(p: Production | undefined, k: KState): string {
  if (!p || p.kind === 'none' || p.kind === 'rule') return 'FACT: the last learner message did not produce the form (no exercise answer or sentence).';
  if (p.correct) return 'FACT: the last learner message produced the form CORRECTLY.';
  return `FACT: the last learner message contained the error of ${p.fired} (${outcomeOfState(k).E[p.fired!]}).`;
}
const stripArm = (t: string) => t.replace(/\[\[assess[^\]]*\]\]/gi, '').replace(/\bENARA\b/gi, 'the tutor').trim();
function judgeText(k: KState, prevTutor: string | undefined, last: Production | undefined, learnerMsg: string, tutor: string) {
  return `KNOWLEDGE STATE (before this tutor turn):\n${stateText(k)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n${prevTutor ? stripArm(prevTutor) : '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${learnerMsg}\n${factLine(last, k)}\n\nTUTOR TURN TO JUDGE:\n${stripArm(tutor)}`;
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

// ---------------------------------------------------------------------------------------------------------- assessment (ESL6 PROTOCOL §7, unchanged)
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
const IBM = () => JSON.parse(readFileSync(path.join(CFG6, 'ITEM_BELIEF_MAP.json'), 'utf8')).items as Record<string, { outcome: string; form: string; position: number; probes: string[]; key: string; keySource: string; note: string; graderBlind?: string }>;
const WRONG = () => JSON.parse(readFileSync(path.join(CFG6, 'WRONG_ANSWERS.json'), 'utf8')) as { items: Record<string, Record<string, string>>; graderBlind?: Record<string, string> };
function buildQuestion(it: BankItem): any {
  const tf = it.scoring === 'target_form_0_1_2'; const choice = /choice/.test(it.type);
  const q: any = { id: it.id, type: tf ? 'open-response' : choice ? 'multiple-choice' : 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, scoringNote: it.scoringNote, points: tf ? undefined : 1 };
  if (it.options) q.options = it.options; if (it.objectiveIds) q.objectiveIds = it.objectiveIds;
  if (tf) q.rubric = { criteria: [{ id: 'target_form', title: 'Target form', description: String(it.rubric ?? it.scoringNote ?? ''), maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0, description: 'target form missing or wrong' }, { id: 'l1', label: '1', points: 1, description: 'target form attempted with a minor slip' }, { id: 'l2', label: '2', points: 2, description: 'target form correct' }] }] };
  return q;
}
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
function answerItem(k: KState, seed: string, time: Time, itemId: string, map: ReturnType<typeof IBM>, wrong: ReturnType<typeof WRONG>) {
  const m = map[itemId]; const probes = m.probes.filter((p) => p === 'W1' || p === 'W2').sort() as ('W1' | 'W2')[];
  for (const w of probes) { const p = itemErrorProb(k, w, time !== 'pre' && k.afterF1); if (rand(seed, `assess-${time}`, itemId, w) < p) return { fired: w, answer: wrong.items[itemId][w], p }; }
  return { fired: null, answer: m.key, p: 0 };
}

// ---------------------------------------------------------------------------------------------------------- frozen files, overlap check
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
// A folder with a DRY_RUN marker (a scripted dry run, git-ignored) is skipped: its seeds are this study's own namespace by design.
function walk(dir: string, out: string[] = []) { if (!existsSync(dir) || existsSync(path.join(dir, 'DRY_RUN'))) return out; for (const f of readdirSync(dir)) { const p = path.join(dir, f); const st = statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(json|md|txt|ts|py)$/.test(f)) out.push(p); } return out; }
function overlapCheck(studyDir: string) {
  const own = path.resolve(studyDir);
  const files = [...walk(path.join(ROOT, 'reports/exp4')), ...[1, 2, 3, 4, 5, 6].flatMap((n) => walk(path.join(ROOT, `config/agent_sim_esl${n}`)))].filter((f) => !path.resolve(f).startsWith(own + path.sep));
  const ids = new Set<number>(); const seeds = new Set<string>();
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/"learnerIdx":\s*(\d+)/g)) ids.add(Number(m[1])); for (const m of t.matchAll(/"seed":\s*"([^"]+)"/g)) seeds.add(m[1]); }
  // ids defined in code (ESL1 0-17, ESL2 0-35, ESL3 100-159, ESL3 validation 200-211, ESL4 300-407, ESL5 500-619, ESL6 700-991, teach2 1100-1799 reserved)
  for (const [a, b] of [[0, 35], [100, 159], [200, 211], [300, 407], [500, 619], [700, 991], [1100, 1799]]) for (let i = a; i <= b; i++) ids.add(i);
  const myIds = LEARNERS().map((l) => l.idx); const mySeeds = LEARNERS().flatMap((l) => REPS.map((r) => seedOf(l.idx, r)));
  const idClash = myIds.filter((i) => ids.has(i)); const seedClash = mySeeds.filter((x) => seeds.has(x)); const nsClash = [...seeds].filter((x) => x.startsWith(`${NS}|`));
  return { _label: 'SIMULATION ONLY', filesScanned: files.length, priorLearnerIds: ids.size, priorSeeds: seeds.size, studyIds: `${Math.min(...myIds)}-${Math.max(...myIds)} (${myIds.length})`, learnerIdClash: idClash, seedClash, namespaceClash: nsClash, pass: !idClash.length && !seedClash.length && !nsClash.length };
}
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function forbidden(): RegExp[] {
  const O = Object.values(outcomes()); const map = IBM(); const res: RegExp[] = [/\b[WC][12]\b/, /strength/i, /KNOWLEDGE STATE/i, /\bprimary (wrong )?belief/i, /pln2\|L\d/, /Independent correct productions/i, /ITEM_BELIEF|WRONG_ANSWERS/, /\b(TASK|TTT|LAD|KIDPPP) group\b/];
  for (const o of O) for (const t of [...Object.values(o.C), ...Object.values(o.W), ...Object.values(o.E)]) res.push(new RegExp(esc(t), 'i'));
  for (const it of bank().items.values()) { if (!map[it.id]) continue; const c = coreOf(it.prompt).replace(/_+/g, '___').trim(); if (c.split(/\s+/).length >= 4) res.push(new RegExp(esc(c), 'i')); const k = map[it.id].key; if (k.split(/\s+/).length >= 3) res.push(new RegExp(esc(k), 'i')); }
  return res;
}

// ---------------------------------------------------------------------------------------------------------- fit judging (PROTOCOL §7)
export const RUBRICS: Record<Group, { key: string; text: string }[]> = {
  TASK: [
    { key: 'task_goal', text: 'A real-life task tied to the learner\'s stated goal happens (for example a short role-play at work, an exam-style task, or a daily-life situation), not only isolated exercises.' },
    { key: 'feedback_after_task', text: 'Language feedback comes AFTER the learner has done the task, and it is on one or two errors only (not a list of everything).' },
    { key: 'task_repeat', text: 'The task is repeated or extended so that the learner uses the fix.' },
  ],
  TTT: [
    { key: 'test_first_clean', text: 'The first three exercises are given with no teaching, hints, corrections or answers (only a neutral acknowledgement between them).' },
    { key: 'teach_targets_gaps', text: 'After those three, the teaching targets only what the learner got wrong (not a full lesson on what they already knew).' },
    { key: 'retest_end', text: 'The lesson ends with a re-test item (a new item on the same form, after the teaching).' },
  ],
  LAD: [
    { key: 'story_chant', text: 'A short story or chant that uses the target words is given.' },
    { key: 'listen_do_steps', text: 'Listen-and-do style instructions (point, tap, say, draw, show) are given one at a time.' },
    { key: 'child_tone', text: 'Length and tone fit a young child: very short messages, praise for effort, the word "wrong" (or similar blame) is never used.' },
  ],
  KIDPPP: [
    { key: 'short_sentences', text: 'Very short sentences throughout.' },
    { key: 'one_instruction', text: 'One instruction per message.' },
    { key: 'praise_effort', text: 'Praise for effort (not only for right answers).' },
    { key: 'game_story', text: 'A small game or story frame is used.' },
    { key: 'ppp_order', text: 'A clear present -> practise -> produce order (the form is shown first, then controlled practice, then the learner makes their own sentence).' },
  ],
};
export const COMMON_ITEMS = [
  { key: 'age_fit', text: 'Age fit: the language, length, topics and tone suit the learner\'s age.' },
  { key: 'teacher_accept', text: 'Would a qualified ESL teacher accept this lesson as a reasonable lesson for this learner?' },
];
const fitItems = (g: Group) => [...RUBRICS[g], ...COMMON_ITEMS];
function learnerLine(l: Learner): string {
  const who = l.ageBand === 'adult' ? 'Adult learner' : l.ageBand === 'teen' ? 'Teenage learner (secondary school)' : `Child aged ${l.ageYears}`;
  const goal = l.group === 'TASK' ? `; learning goal: ${l.goal === 'daily' ? 'daily life' : l.goal}` : '';
  return `${who} in Egypt (first language Arabic); course level ${l.level}${goal}.`;
}
const fitCaseId = (key: string) => `f${sha(`${NS}|fit|${key}`).slice(0, 10)}`;
function fitCaseText(s: Sess): string {
  const l = L_OF(s.learnerIdx); const L = lessonOf(l.outcome);
  const rubric = fitItems(l.group).map((x) => `- ${x.key}: ${x.text}`).join('\n');
  const conv = s.turns.map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${stripArm(t.tutor)}` : ''}`).join('\n');
  return `LEARNER: ${learnerLine(l)}\nLESSON: ${L.title}. ${L.objective}\n\nRUBRIC (score each item 0, 1 or 2, with a one-line reason):\n${rubric}\n\nTRANSCRIPT (one short lesson, ${s.turns.filter((t) => t.tutor !== undefined).length} tutor turns; the lesson is cut after the last tutor turn):\n${conv}`;
}
const fitHead = (batch: string) => `Batch ${batch}. Score every case with FIT_INSTRUCTIONS.md: each rubric item of the case 0, 1 or 2 with a one-line reason. Write {"batch":"${batch}","cases":{"<case id>":{"items":{"<item key>":{"score":0,"reason":"..."}, ...}}, ...}} to the file named in your task.\n`;
interface FitCase { items: Record<string, { score: number; reason?: string }> }
function readFit(dir: string, files: { batch: string; ids: string[] }[], groupOf: (id: string) => Group) {
  const { out, missing } = readJudge<FitCase>(dir, files); const bad: string[] = []; const ok: Record<string, FitCase> = {};
  for (const [id, c] of Object.entries(out)) {
    const need = fitItems(groupOf(id)).map((x) => x.key); const got = c?.items ?? {};
    const wrong = need.filter((k) => ![0, 1, 2].includes(got[k]?.score as number));
    if (wrong.length) bad.push(`${id}:${wrong.join('+')}`); else ok[id] = c;
  }
  return { out: ok, missing, bad };
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
const needDry = (dir: string) => { if (!existsSync(path.join(dir, 'DRY_RUN'))) throw new Error(`${cmd} is a dry-run command: ${dir}/DRY_RUN missing`); };
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
const allSessions = (dir: string) => sessionFiles(dir).map((f) => load(dir, f.replace(/\.json$/, '')));

async function main() {
  if (cmd === 'hashcheck') { const r = hashCheck(); console.log(JSON.stringify(r, null, 1)); if (!r.pass) process.exit(1); }
  else if (cmd === 'overlap') { const dir = dirArg(a1); const res = overlapCheck(dir); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'OVERLAP_CHECK.json'), res); console.log(JSON.stringify(res)); }
  else if (cmd === 'init') {
    const dir = dirArg(a1);
    const hc = hashCheck(); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'HASH_CHECK.json'), hc); if (!hc.pass) throw new Error(`frozen-file hash check failed: ${JSON.stringify(hc.mismatches)}`);
    const ov = overlapCheck(dir); write(path.join(dir, 'OVERLAP_CHECK.json'), ov); if (!ov.pass) throw new Error(`overlap check failed: ${JSON.stringify(ov)}`);
    mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
    const O = outcomes(); const todo: { l: Learner; arm: Arm; rep: number }[] = [];
    for (const l of LEARNERS()) for (const arm of ARMS) for (const rep of REPS) if (!existsSync(sf(dir, keyOf({ learnerIdx: l.idx, arm, rep })))) todo.push({ l, arm, rep });
    const states = py<KState>(todo.map(({ l }) => ({ op: 'init', form: O[l.outcome].key, band: l.stateBand, primary: l.primary, ws: O[l.outcome].ws, sec1: O[l.outcome].sec1 })));
    todo.forEach(({ l, arm, rep }, i) => { const st = l.knowsMost ? knowsMostStart(states[i]) : states[i]; save(dir, { arm, rep, learnerIdx: l.idx, group: l.group, outcome: l.outcome, seed: seedOf(l.idx, rep), state: st, start: JSON.parse(JSON.stringify(st)), rec: { entries: [], liveErrors: {}, knownPoints: {} }, turns: [opener(l)] }); });
    // descriptive: the quick-check split the start state predicts (TTT), if every quick-check item probes every wrong belief and nothing changes the state
    const pred = LEARNERS().filter((l) => l.group === 'TTT').map((l) => ({ idx: l.idx, right: predictedQuickCheck(l, load(dir, keyOf({ learnerIdx: l.idx, arm: 'P2', rep: 1 })).start, 1) }));
    write(path.join(dir, 'cells.json'), cells()); write(path.join(dir, 'LEARNERS.json'), { _label: 'SIMULATION ONLY', learners: LEARNERS(), outcomePlan: outcomePlan(), predictedQuickCheck: { learners: pred, twoOrMore: pred.filter((p) => p.right >= 2).length, of: pred.length } });
    console.log(`frozen hashes ok (${hc.rows}); overlap pass; learners ${LEARNERS().length}; sessions ${LEARNERS().length * ARMS.length * REPS.length}; cells ${cells().length} of ${cells()[0].keys.length}; env OFF ${ENV_OF.OFF}; P2 ${ENV_OF.P2}; predicted TTT quick check >= 2 of 3: ${pred.filter((p) => p.right >= 2).length} of ${pred.length}`);
  } else if (cmd === 'plans') {
    // the plan each session's NEXT prompt gets (no writes)
    const dir = dirArg(a1); const c: Record<string, number> = {};
    for (const s of allSessions(dir)) { const po = planOf(s); const k = `${s.arm} ${s.group} ${po.lesson ? `${po.lesson.shape}/${po.lesson.shapeRule}/${po.stage}${po.quickCheck ? '/QC' : ''}` : '-'} ${po.plan.primary}`; c[k] = (c[k] ?? 0) + 1; }
    console.log(JSON.stringify(c, null, 1));
  } else if (cmd === 'tprompts') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2); if (!cell) throw new Error(`no cell ${a2}; cells: ${cells().map((c) => c.id).join(' ')}`); let n = 0;
    for (const key of cell.keys) { const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined || s.turns.length > ROUNDS) continue; console.log(`\n########## SESSION ${key} ##########\n${tutorPrompt(s)}`); n++; }
    console.log(`\n(${n} session(s) need a tutor reply in this cell)`);
  } else if (cmd === 'promptcheck') {
    const dir = dirArg(a1); const FORB = forbidden(); let n = 0; const bad: string[] = [];
    for (const c of cells()) for (const key of c.keys) {
      const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue;
      const head = enginePart(s); n++;
      const L = lessonOf(s.outcome); const own = [L.title, L.objective, ...Object.values(L.spec).flat().map((x: any) => (typeof x === 'string' ? x : x.prompt))].map(norm);
      for (const re of FORB) { const m = head.match(re); if (m && !own.some((x) => x.includes(norm(m[0])))) bad.push(`${key}:${re}`); }
    }
    const res = { prompts: n, findings: bad, pass: !bad.length }; write(path.join(dir, `PROMPTCHECK_t${load(dir, cells()[0].keys[0]).turns.length}.json`), res); console.log(JSON.stringify({ ...res, findings: bad.slice(0, 10) }));
    if (bad.length) process.exit(1);
  } else if (cmd === 'tapply') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0;
    for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; await applyTutor(s, t); save(dir, s); n++; }
    console.log('applied', n, 'of', cell.keys.length);
  } else if (cmd === 'jprep') {
    const dir = dirArg(a1); const round = Number(a2); const cases: { id: string; text: string }[] = []; const keymap = path.join(dir, 'judge', `r${round}_KEY.json`); const km = existsSync(keymap) ? JSON.parse(readFileSync(keymap, 'utf8')) : {};
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const cur = s.turns[round - 1]; if (!cur?.tutor || cur.judgeInput) { if (cur && !cur.tutor) console.log('NO TUTOR REPLY', f); continue; }
      const prev = s.turns[round - 2]; cur.judgeInput = judgeText(s.state, prev?.tutor, cur.production, cur.learner, cur.tutor); save(dir, s);
      cases.push({ id: caseId(f, round), text: cur.judgeInput }); km[caseId(f, round)] = f.replace(/\.json$/, '');
    }
    write(keymap, km);
    const files = writeBatches(path.join(dir, 'judge'), `r${round}`, cases, JUDGE_PER, NS, judgeHead); write(path.join(dir, 'judge', `r${round}_FILES.json`), files);
    console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'japply') {
    const dir = dirArg(a1); const round = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
    const todo: { cid: string; s: Sess; cur: Turn; j: any }[] = [];
    for (const [cid, j] of Object.entries(out)) { const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.events) continue; todo.push({ cid, s, cur, j }); }
    const res = py<{ state: KState; applied: string[]; rejected: string[] }>(todo.map(({ s, cur, j }) => ({ op: 'apply', state: s.state, events: j.events ?? [], last: cur.production, session: 1, retrieval: j.retrieval ?? [] })));
    let rej = 0;
    todo.forEach(({ s, cur, j }, i) => {
      const r = res[i]; Object.assign(cur, { stateBefore: s.state, events: j.events ?? [], retrieval: j.retrieval ?? [], next_task: j.next_task, applied: r.applied, rejected: r.rejected, stateAfter: r.state }); s.state = r.state; rej += r.rejected.length;
      if (round === ROUNDS) s.stateEnd = r.state;
      else { const p = learnerReply(s.state, j.next_task as NextTask, s.seed, round + 1); s.turns.push({ session: 1, learner: p.text, production: p }); }
      save(dir, s);
    });
    console.log('applied', todo.length, 'rejected events', rej);
  } else if (cmd === 'f1') {
    const dir = dirArg(a1); const days = Number(a2); if (days !== DELAY_DAYS) throw new Error('one session: f1 days must be 7 (before the delayed test)');
    const all = allSessions(dir); const notReady = all.filter((s) => !s.stateEnd).length; if (notReady) throw new Error(`${notReady} session(s) not judged through round ${ROUNDS}`);
    const todo = all.filter((s) => !s.stateDelayed); const res = py<KState>(todo.map((s) => ({ op: 'f1', state: s.stateEnd, days })));
    todo.forEach((s, i) => { s.stateDelayed = res[i]; save(dir, s); });
    console.log(`F1 ${days} days applied to`, todo.length, 'sessions');
  } else if (cmd === 'assess') {
    const dir = dirArg(a1); const time = a2 as Time; if (!TIMES.includes(time)) throw new Error('time must be pre|imm|del');
    const map = IBM(); const wrong = WRONG(); const rows: any[] = []; let nulls = 0;
    for (const s of allSessions(dir)) {
      const l = L_OF(s.learnerIdx);
      const k = time === 'pre' ? s.start : time === 'imm' ? s.stateEnd : s.stateDelayed; if (!k) throw new Error(`${keyOf(s)}: no state for ${time} (imm needs round ${ROUNDS} judged; del needs f1 7)`);
      const form = l.seq[time]; const items = bank().forms.get(l.outcome)![form]; let pts = 0; let free = 0; let c14 = 0; let nul = 0; let prim = 0; let primMax = 0; let ecr = 0; let ecrMax = 0;
      for (const it of items) {
        const a = answerItem(k, s.seed, time, it.id, map, wrong); const sc = scoreAnswer(it.id, a.answer); const p = sc.points ?? 0; if (sc.points === null) { nul++; nulls++; }
        pts += p; const pos = map[it.id].position; if (pos >= 7) free += p; if (pos <= 4 && p === sc.max) c14++;
        if (PRIMARY_TYPES.has(it.type)) { prim += p; primMax += sc.max; } else if (it.type === 'error_correction' || it.type === 'rewrite') { ecr += p; ecrMax += sc.max; }
        rows.push({ answerId: `a${sha(`${NS}|ans|${keyOf(s)}|${time}|${it.id}`).slice(0, 12)}`, session: keyOf(s), learner: s.learnerIdx, group: s.group, arm: s.arm, rep: s.rep, time, form, itemId: it.id, position: pos, scoring: it.scoring, probes: map[it.id].probes, fired: a.fired, answer: a.answer, points: sc.points, max: sc.max });
      }
      s.assess = { ...(s.assess ?? {}), [time]: { form, points: pts, max: 12, pct: pts / 12, free, items1to4: c14, nulls: nul, primary: prim, primaryMax: primMax, ecRewrite: ecr, ecRewriteMax: ecrMax } }; save(dir, s);
    }
    write(path.join(dir, `ASSESS_${time}.json`), rows); console.log(`assess ${time}: answers ${rows.length}, sessions ${rows.length / 9}, grader null ${nulls}`);
  } else if (cmd === 'post') {
    const dir = dirArg(a1); const rows: any[] = [];
    for (const s of allSessions(dir)) { const l = L_OF(s.learnerIdx); rows.push({ learner: l.idx, rep: s.rep, arm: s.arm, group: l.group, level: l.level, ageBand: l.ageBand, ageYears: l.ageYears ?? null, goal: l.goal ?? null, status: l.status, outcome: l.outcome, type: l.outcome.split('-')[3], seq: l.seq, rounds: s.turns.filter((t) => t.events).length, assess: s.assess ?? {}, start: s.start.s, end: s.stateEnd?.s ?? null, delayed: s.stateDelayed?.s ?? null }); }
    write(path.join(dir, 'POST.json'), rows); console.log('post rows', rows.length);
  } else if (cmd === 'tags') {
    const dir = dirArg(a1); const rows: any[] = []; const stuck: any[] = [];
    for (const s of allSessions(dir)) {
      const l = L_OF(s.learnerIdx);
      s.turns.forEach((t, k) => { if (t.tutor === undefined) return; rows.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, group: l.group, level: l.level, outcome: l.outcome, turn: k + 1, planner: t.planner ?? null, promptQuickCheck: t.promptQuickCheck ?? false, diagnosis: t.diagnosis ?? null, verdict: t.engineVerdict ?? null, moves: t.moves ?? [], strand: t.strand ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, markerStatus: t.markerStatus ?? null, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, earlyLeakRaw: t.earlyLeakRaw ?? 0, earlyLeakFinal: t.earlyLeakFinal ?? 0, lateAnswerFinal: t.lateAnswerFinal ?? 0, answerReleased: t.answerReleased ?? false, qcTeachWords: t.qcTeachWords ?? false, ev5: t.ev5 ?? {}, twoAsks: t.twoAsks ?? false, twoAsksRaw: t.twoAsksRaw ?? false, words: (t.tutor ?? '').split(/\s+/).filter(Boolean).length, production: t.production, events: t.events ?? null, applied: t.applied ?? [], rejected: t.rejected ?? [] }); });
      const st = s.turns; let runKey: string | undefined; let run = 0; let startTurn = 0;
      const flush = () => { if (run >= 3) stuck.push({ learner: s.learnerIdx, rep: s.rep, arm: s.arm, group: l.group, task: runKey, length: run, startTurn }); };
      for (let k = 1; k < st.length; k++) {
        const prevT = st[k - 1]; const p = st[k].production; if (prevT.tutor === undefined) break;
        const sh = shownItem(prevT.tutor, l.outcome); const nt = prevT.next_task as NextTask | undefined; const key = sh ? `item:${sh.id}` : nt && nt.kind !== 'none' ? `task:${nt.kind}:${norm(String(nt.correct ?? ''))}` : undefined;
        const answer = p.kind === 'blank' || p.kind === 'sentence';
        if (answer && key && !p.correct) { if (key === runKey) run++; else { flush(); runKey = key; run = 1; startTurn = k + 1; } } else { flush(); runKey = undefined; run = 0; }
      }
      flush();
    }
    write(path.join(dir, 'TAGS.json'), rows); write(path.join(dir, 'STUCK.json'), stuck); console.log('turn rows', rows.length, 'stuck runs', stuck.length);
  } else if (cmd === 'agreeprep') {
    // 10% of all event-judge cases of all rounds (rand('pln2-agree', caseId) < 0.1), judged again blind, batches of 72; run after round 5's japply.
    const dir = dirArg(a1); const cases: { id: string; text: string }[] = []; const key: Record<string, string> = {};
    for (let round = 1; round <= ROUNDS; round++) {
      const p = path.join(dir, 'judge', `r${round}_KEY.json`); if (!existsSync(p)) throw new Error(`round ${round} not judged`);
      for (const [cid, sk] of Object.entries(JSON.parse(readFileSync(p, 'utf8'))) as [string, string][]) { if (rand(`${NS}-agree`, cid) >= AGREE_SHARE) continue; const t = load(dir, sk).turns[round - 1]; if (!t.judgeInput || !t.events) throw new Error(`${sk} round ${round}: not applied`); const aid = `a${cid.slice(1)}`; cases.push({ id: aid, text: t.judgeInput }); key[aid] = `${sk}|${round}|${cid}`; }
    }
    mkdirSync(path.join(dir, 'agree'), { recursive: true });
    const files = writeBatches(path.join(dir, 'agree'), 'ag', cases, JUDGE_PER, `${NS}-agree`, judgeHead); write(path.join(dir, 'agree', 'ag_FILES.json'), files); write(path.join(dir, 'agree', 'ag_KEY.json'), key);
    console.log('agreement cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'agreescore') {
    const dir = dirArg(a1); const files = JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_FILES.json'), 'utf8')); const key = JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_KEY.json'), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'agree'), files);
    const pairs = Object.entries(out).map(([aid, j2]) => { const [sk, r] = key[aid].split('|'); const t = load(dir, sk).turns[Number(r) - 1]; return { round: Number(r), t, j2: j2 as any }; });
    const ops = pairs.flatMap(({ t, j2 }) => [{ op: 'apply', state: t.stateBefore, events: t.events ?? [], last: t.production, session: 1, retrieval: t.retrieval ?? [] }, { op: 'apply', state: t.stateBefore, events: j2.events ?? [], last: t.production, session: 1, retrieval: j2.retrieval ?? [] }]);
    const r = py<{ state: KState }>(ops); const cmp = py<string>(r.map((x) => ({ op: 'cmp', state: x.state })));
    const res: any = { _label: 'SIMULATION ONLY', rounds: {}, cases: pairs.length, same: 0, missing: missing.length, comparedOn: 'strengths, independent counts and counted retrievals after applying each judge\'s events (esl6_forget.comparable)' };
    pairs.forEach((p, i) => { const x = (res.rounds[p.round] ??= { cases: 0, same: 0 }); x.cases++; if (cmp[2 * i] === cmp[2 * i + 1]) { x.same++; res.same++; } });
    res.agreement = res.cases ? +(res.same / res.cases).toFixed(4) : null; res.pass = res.missing === 0 && res.agreement !== null && res.agreement >= 0.85;
    write(path.join(dir, 'JUDGE_AGREEMENT.json'), res); console.log(JSON.stringify(res));
  } else if (cmd === 'recheckprep') {
    // as ESL6 (DECISIONS 2, amendment A2): 10% of all scored answers, distinct (item, answer) pairs scored once per scorer, 3 scorers, 40 per batch
    const dir = dirArg(a1); const all = TIMES.flatMap((t) => { const p = path.join(dir, `ASSESS_${t}.json`); if (!existsSync(p)) throw new Error(`missing ${p}`); return JSON.parse(readFileSync(p, 'utf8')) as any[]; });
    const sample = all.filter((r) => rand(`${NS}-recheck`, r.answerId) < 0.1); const key: Record<string, any> = {};
    const uidOf = (r: any) => `u${sha(`${NS}-recheck-pair|${r.itemId}|${r.answer}`).slice(0, 12)}`;
    const uniq = [...new Map(sample.map((r) => [uidOf(r), { ...r, answerId: uidOf(r) }] as const)).values()];
    for (const sc of SCORERS) {
      const d = path.join(dir, 'recheck', sc); mkdirSync(d, { recursive: true });
      const order = [...uniq].sort((x, y) => (sha(`${NS}-recheck|${sc}|${x.answerId}`) < sha(`${NS}-recheck|${sc}|${y.answerId}`) ? -1 : 1));
      const files: { batch: string; ids: string[] }[] = [];
      for (let b = 0; b * RECHECK_PER < order.length; b++) {
        const batch = `rc${String(b + 1).padStart(2, '0')}`; const chunk = order.slice(b * RECHECK_PER, b * RECHECK_PER + RECHECK_PER);
        const txt = `Batch ${batch} (scorer ${sc}). Score every answer with docs/SCORING_RUBRIC.md and write {"batch":"${batch}","scores":{"<answer id>":<points>,...}} to the file named in your task.\n` + chunk.map((r) => { const it = bank().items.get(r.itemId)!; return `\n=========== ANSWER ${r.answerId} ===========\nITEM TYPE: ${it.type}\nSCORING: ${it.scoring === 'exact' ? 'exact (0 or 1 point)' : 'target form 0/1/2'}\nPROMPT: ${it.prompt}\nANSWER KEY: ${it.answerKey}\nACCEPTED ANSWERS: ${(it.acceptedAnswers ?? []).join(' | ')}\n${it.matchingNote ? `MATCHING NOTE: ${it.matchingNote}\n` : ''}${it.targetForm ? `TARGET FORM: ${it.targetForm}\n` : ''}${it.rubric ? `RUBRIC: ${it.rubric}\n` : ''}LEARNER ANSWER: ${r.answer === '' ? '(empty)' : r.answer}\n`; }).join('');
        writeFileSync(path.join(d, `${batch}.md`), txt); files.push({ batch, ids: chunk.map((r) => r.answerId) });
      }
      write(path.join(d, 'FILES.json'), files);
    }
    for (const r of sample) key[r.answerId] = { itemId: r.itemId, scoring: r.scoring, grader: r.points ?? 0, graderNull: r.points === null, max: r.max, uid: uidOf(r) };
    write(path.join(dir, 'recheck', 'KEY.json'), key); console.log('recheck answers', sample.length, 'of', all.length, 'distinct item+answer pairs', uniq.length, 'batches per scorer', Math.ceil(uniq.length / RECHECK_PER));
  } else if (cmd === 'recheckscore') {
    const dir = dirArg(a1); const key = JSON.parse(readFileSync(path.join(dir, 'recheck', 'KEY.json'), 'utf8')) as Record<string, any>; const got: Record<string, Record<string, number>> = {}; const missing: string[] = [];
    for (const sc of SCORERS) { const files = JSON.parse(readFileSync(path.join(dir, 'recheck', sc, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[]; for (const f of files) { const p = path.join(dir, 'recheck', sc, `${f.batch}.json`); if (!existsSync(p)) { missing.push(`${sc}/${f.batch}`); continue; } const d = JSON.parse(readFileSync(p, 'utf8')); for (const id of f.ids) { const v = d.scores?.[id]; if (typeof v !== 'number') missing.push(`${sc}/${f.batch}:${id}`); else (got[id] ??= {})[sc] = v; } } }
    const ref = (v: number[]) => { const c: Record<number, number> = {}; v.forEach((x) => (c[x] = (c[x] ?? 0) + 1)); const m = Object.entries(c).find(([, n]) => n >= 2); return m ? Number(m[0]) : [...v].sort((a, b) => a - b)[1]; };
    const prim: { g: number; r: number }[] = []; const ex: { g: number; r: number }[] = []; const tf: { g: number; r: number }[] = [];
    for (const [id, k] of Object.entries(key)) { const v = got[k.uid ?? id]; if (!v || Object.keys(v).length !== SCORERS.length) continue; const r = SCORERS.length === 1 ? v.s1 : ref(SCORERS.map((x) => v[x])); (k.scoring === 'exact' ? ex : tf).push({ g: k.grader, r }); if (k.scoring === 'exact' && PRIMARY_TYPES.has(bank().items.get(k.itemId)?.type ?? '')) prim.push({ g: k.grader, r }); }
    const agree = (xs: { g: number; r: number }[]) => (xs.length ? +(xs.filter((x) => x.g === x.r).length / xs.length).toFixed(4) : null);
    const res = { _label: 'SIMULATION ONLY', sampled: Object.keys(key).length, primaryItems: prim.length, primaryAgreement: agree(prim), exactItems: ex.length, exactAgreement: agree(ex), freeItems: tf.length, freeExactAgreement: agree(tf), missing, guard: 'primary (gap-fill/choice) exact agreement >= 0.95 (ESL6 guard; reported, not a PLN2 pass rule)', pass: !missing.length && (agree(prim) ?? 0) >= 0.95 };
    write(path.join(dir, 'GRADER_RECHECK.json'), res); console.log(JSON.stringify({ ...res, missing: missing.length }));
  } else if (cmd === 'fitprep') {
    // PROTOCOL §7: one arm-blind case per finished session, the group's rubric; 12 per batch; a 10% re-judged sample in its own folder.
    const dir = dirArg(a1); const cases: { id: string; text: string }[] = []; const key: Record<string, any> = {}; const again: { id: string; text: string }[] = []; const akey: Record<string, any> = {};
    for (const s of allSessions(dir)) {
      if (s.turns.filter((t) => t.tutor !== undefined).length < ROUNDS) throw new Error(`${keyOf(s)}: session not finished (${ROUNDS} tutor turns)`);
      const id = fitCaseId(keyOf(s)); const text = fitCaseText(s); cases.push({ id, text }); key[id] = { session: keyOf(s), arm: s.arm, group: s.group, learner: s.learnerIdx };
      if (rand(`${NS}-fitagree`, id) < FIT_AGREE_SHARE) { const gid = `g${id.slice(1)}`; again.push({ id: gid, text }); akey[gid] = { ...key[id], of: id }; }
    }
    for (const [sub, cs, k, tag] of [['fit', cases, key, 'fit'], ['fitagree', again, akey, 'fag']] as const) {
      mkdirSync(path.join(dir, sub), { recursive: true }); const files = writeBatches(path.join(dir, sub), tag, cs as any, FIT_PER, `${NS}-${sub}`, fitHead);
      write(path.join(dir, sub, 'FILES.json'), files); write(path.join(dir, sub, 'KEY.json'), k); console.log(sub, 'cases', cs.length, files.map((x) => x.batch).join(' '));
    }
  } else if (cmd === 'fitapply') {
    const dir = dirArg(a1); const key = JSON.parse(readFileSync(path.join(dir, 'fit', 'KEY.json'), 'utf8')); const akey = JSON.parse(readFileSync(path.join(dir, 'fitagree', 'KEY.json'), 'utf8'));
    const main = readFit(path.join(dir, 'fit'), JSON.parse(readFileSync(path.join(dir, 'fit', 'FILES.json'), 'utf8')), (id) => key[id].group);
    const ag = readFit(path.join(dir, 'fitagree'), JSON.parse(readFileSync(path.join(dir, 'fitagree', 'FILES.json'), 'utf8')), (id) => akey[id].group);
    if (main.missing.length || main.bad.length || ag.missing.length || ag.bad.length) { console.log('MISSING', [...main.missing, ...ag.missing].join(' '), 'BAD', [...main.bad, ...ag.bad].join(' ')); process.exit(1); }
    const rows = Object.entries(main.out).map(([id, c]) => ({ id, ...key[id], items: Object.fromEntries(fitItems(key[id].group).map((x) => [x.key, c.items[x.key].score])), reasons: Object.fromEntries(fitItems(key[id].group).map((x) => [x.key, c.items[x.key].reason ?? ''])) }));
    let n = 0; let same = 0; let within1 = 0; const perGroup: Record<string, { n: number; same: number }> = {};
    for (const [gid, c] of Object.entries(ag.out)) { const k = akey[gid]; const m = main.out[k.of]; for (const x of fitItems(k.group)) { const d = Math.abs(c.items[x.key].score - m.items[x.key].score); n++; if (d === 0) same++; if (d <= 1) within1++; const pg = (perGroup[k.group] ??= { n: 0, same: 0 }); pg.n++; if (d === 0) pg.same++; } }
    write(path.join(dir, 'FIT.json'), rows);
    const res = { _label: 'SIMULATION ONLY', cases: Object.keys(ag.out).length, itemScores: n, exact: same, agreement: n ? +(same / n).toFixed(4) : null, within1: n ? +(within1 / n).toFixed(4) : null, perGroup, rule: 'exact agreement on rubric item scores >= 0.85', pass: n > 0 && same / n >= 0.85 };
    write(path.join(dir, 'FIT_AGREEMENT.json'), res); console.log('fit rows', rows.length, JSON.stringify(res));
  } else if (cmd === 'status') {
    const dir = dirArg(a1); const c: Record<string, number> = {};
    for (const s of allSessions(dir)) { const k = `${s.turns.filter((t) => t.tutor !== undefined).length} replies / ${s.turns.filter((t) => t.events).length} judged${s.stateDelayed ? ' / f1-7' : ''}`; c[k] = (c[k] ?? 0) + 1; }
    console.log(JSON.stringify(c));
  }
  // ------------------------------------------------------------------------------------------------ dry-run helpers (no agents; refused outside a DRY_RUN dir)
  else if (cmd === 'dryreply') {
    // one scripted reply per pending session, written as per-cell answer files and applied with applyTutor exactly as tapply does. The marker grades the
    // learner's last production (as a tutor would), so the code-graded verdicts, the quick check and the stages move as in a real run.
    const dir = dirArg(a1); needDry(dir); const round = Number(a2); let n = 0;
    for (const c of cells()) {
      const ans: Record<string, string> = {};
      for (const key of c.keys) {
        const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined) continue; const L = lessonOf(s.outcome); const it = L.spec.items[(round - 1) % Math.max(1, L.spec.items.length)];
        const task = it ? coreOf(it.prompt) : `Write one sentence about your day. Use ${outcomes()[s.outcome].topic}.`; const p = last.production;
        const v = p.kind === 'blank' || p.kind === 'sentence' ? (p.correct ? 'CORRECT relevance=ACTIVE_ITEM' : 'INCORRECT relevance=ACTIVE_ITEM') : 'NOT_EVALUATED relevance=NO_ACTIVE_ITEM';
        ans[key] = `[[assess verdict=${v} next=NEW_ITEM]]\n${p.kind === 'none' ? 'Good.' : 'Thanks, noted.'} ${L.spec.examples[0] ?? ''}\nNow you: ${task}`;
      }
      const p = path.join(dir, 'dry_answers', `${c.id}_r${round}.json`); mkdirSync(path.dirname(p), { recursive: true }); write(p, ans);
      for (const [key, t] of Object.entries(ans)) { const s = load(dir, key); await applyTutor(s, t); save(dir, s); n++; }
    }
    console.log('dry replies applied', n);
  } else if (cmd === 'dryjudge' || cmd === 'dryagree') {
    // scripted judge output: R1 on W1 every turn, R3/R4 on tested beliefs when the production was correct; the next task is the lesson item the turn showed
    // (its first accepted answer as "correct", a fixed wrong string per Wk); dryagree drops R4 on 1 case in 10 (to exercise disagreement)
    const dir = dirArg(a1); needDry(dir); const sub = cmd === 'dryjudge' ? 'judge' : 'agree'; const round = Number(a2);
    const files = JSON.parse(readFileSync(path.join(dir, sub, cmd === 'dryjudge' ? `r${round}_FILES.json` : 'ag_FILES.json'), 'utf8')) as { batch: string; ids: string[] }[];
    const km = cmd === 'dryjudge' ? JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')) : JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_KEY.json'), 'utf8'));
    for (const f of files) {
      const cases: Record<string, any> = {};
      for (const id of f.ids) {
        const [sk, r] = cmd === 'dryjudge' ? [km[id], round] : [km[id].split('|')[0], Number(km[id].split('|')[1])]; const s = load(dir, sk); const t = s.turns[r - 1]; const o = outcomes()[s.outcome];
        const ok = t.production.kind !== 'none' && t.production.correct; const cs = o.ws.map((w) => PAIR[w]); const it = shownItem(t.tutor ?? '', s.outcome);
        const ev = [{ rule: 'R1', belief: 'W1', quote: 'rule' }, ...(ok ? cs.flatMap((c) => [{ rule: 'R3', belief: c }, ...(cmd === 'dryagree' && rand('dryagree', id) < 0.1 ? [] : [{ rule: 'R4', belief: c }])]) : [])];
        cases[id] = { events: ev, retrieval: [], next_task: { kind: 'blank', probes: o.ws, correct: it?.acceptedAnswers?.[0] ?? `ok-${r}`, errors: Object.fromEntries(o.ws.map((w) => [w, `${w.toLowerCase()}wrongword`])) } };
      }
      write(path.join(dir, sub, `${f.batch}.json`), { batch: f.batch, cases });
    }
    console.log(`${cmd} wrote`, files.length, 'batches');
  } else if (cmd === 'dryscore') {
    const dir = dirArg(a1); needDry(dir);
    const byU = new Map(Object.values(JSON.parse(readFileSync(path.join(dir, 'recheck', 'KEY.json'), 'utf8')) as any[]).map((k) => [k.uid, { points: k.grader }] as const));
    for (const sc of SCORERS) { const files = JSON.parse(readFileSync(path.join(dir, 'recheck', sc, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[]; for (const f of files) write(path.join(dir, 'recheck', sc, `${f.batch}.json`), { batch: f.batch, scores: Object.fromEntries(f.ids.map((id) => { const g = byU.get(id)!.points ?? 0; return [id, sc === 's3' && rand('dryscore', id) < 0.05 ? (g === 0 ? 1 : 0) : g]; })) }); }
    console.log('dry scorer files written');
  } else if (cmd === 'dryfit') {
    // scripted fit judges: a hash-based score per item (arm-blind); the agreement judge copies it except 1 item score in 10
    const dir = dirArg(a1); needDry(dir);
    for (const [sub, keyName] of [['fit', 'KEY.json'], ['fitagree', 'KEY.json']] as const) {
      const key = JSON.parse(readFileSync(path.join(dir, sub, keyName), 'utf8')); const files = JSON.parse(readFileSync(path.join(dir, sub, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[];
      for (const f of files) write(path.join(dir, sub, `${f.batch}.json`), { batch: f.batch, cases: Object.fromEntries(f.ids.map((id) => { const base = sub === 'fit' ? id : key[id].of; return [id, { items: Object.fromEntries(fitItems(key[id].group).map((x) => { let v = Math.floor(rand('dryfit', base, x.key) * 3); if (sub === 'fitagree' && rand('dryfitagree', id, x.key) < 0.1) v = (v + 1) % 3; return [x.key, { score: v, reason: 'dry run' }]; })) }]; })) });
    }
    console.log('dry fit files written');
  } else {
    console.log('commands: hashcheck | overlap | init | plans | tprompts | promptcheck | tapply | status | jprep | japply | agreeprep | agreescore | f1 | assess | post | tags | recheckprep | recheckscore | fitprep | fitapply | dry*');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
