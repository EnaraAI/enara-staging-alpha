// SIMULATION ONLY. NO API. ESL7-journey runner (pre-registered: config/agent_sim_esl7/PROTOCOL.md).
// Built from pln2Study.ts (engine glue, planner2 learning focus, rule-based learner, event judging R1-R7 via esl6_forget.py, F1 v2, fit judging) and
// esl6Study.ts (the P+ arm: ESL4 P+ prompt, no engine; session-2 judge text) with these changes:
//   - Arms: BASE = today's engine (ENV_OF.BASE), NEW = BASE + the LIT_REVIEW_GAP_PLAN switches, PP = the ESL6 P+ prompt. Tests: graderV2 on for every arm.
//   - Outcomes: the 30 ESL6 outcomes (esl6_outcomes.py) + the 6 new course outcomes (esl7_outcomes_new.py), unless the run folder has ESL6_ONLY.
//   - Learners: 2 outcomes of their own level each, every outcome used by exactly 4 learners (pairing seeded 'esl7'), ids from 7000, age bands in rotation.
//   - Journey: two tracks per learner and arm (s{idx}_{arm}_o1 / _o2), 2 sessions each; o1 days 0 and 7, o2 days 2 and 14; 5 tutor turns per session;
//     rounds 1-5 o1S1, 6-10 o2S1, 11-15 o1S2, 16-20 o2S2. F1 from the last contact before the next session and before each test.
//   - Memory (BASE, NEW): memory/m{idx}_{arm}.json, run with the deployed pure functions (errorsToWorkOn.ts, learnerMemory.ts) under the arm's env.
//   - Tests: pre = A (day 0), imm = B (after S1), wk1 = C (7 days after S1, after F1), wk4 = A (day 28, after F1). Free items (target_form_0_1_2 with a null
//     rule score, and every rubric_0_3 writing item) go to the scorer queue (scoreprep / scoreapply; Opus scorer agents), never to a model call from code.
//   - Measures: tags per track, fit per journey (teacher_accept, age_fit), mastery on wk4, CEFR estimate (placementEngine.simulate) at pre and wk4.
// The engine sees only what a real tutor sees; promptcheck enforces it before every round.
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/esl7Study.ts <cmd> <dir> ...
// Commands: init <dir> [--esl6-only] | overlap <dir> | answercheck <dir> | status <dir> | plans <dir> | tprompts <dir> <cell> [round] | promptcheck <dir>
//           | tapply <dir> <cell> <answers.json> | jprep <dir> <round> | japply <dir> <round> | f1 <dir> | assess <dir> <pre|imm|wk1|wk4>
//           | scoreprep <dir> <time> | scoreapply <dir> <time> | meminit <dir> | post <dir> | tags <dir> | agreeprep <dir> | agreescore <dir>
//           | fitprep <dir> | fitapply <dir> | analyze <dir>
//           dry-run only (refused unless <dir>/DRY_RUN exists): dryreply <dir> <round> | dryjudge <dir> <round> | dryagree <dir> | dryscore <dir> <time> | dryfit <dir>
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks,
  esl5Adjust, knownKey, independentSuccessItem, lengthTarget, resolveTrustedAgeBand, ageFromBirthDate, LANGUAGE_CONTEXT_VERSION,
  QUICK_CHECK_DROPPED, QUICK_CHECK_LINE, LAD_STEP_DROPPED, LAD_STEP_LINE, TASK_STEP_DROPPED, TASK_STEP_LINE, type LanguageTeachingContext, type TrustedAgeBand,
} from '../../../../backend/src/services/languageTeachingContext';
import { stripAssessmentMarkers, isFailure, L1_TRANSFER_CODES } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy, completeLanguageTurn } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { belowB1, type PlanInput, type TeachingPlan } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { QUICK_CHECK_PLAN_LINE, quickCheckActive, planLesson, progressFromHistory, quickCheckSignals, reviewOpener, shapeLines, stageNow, levelRank, type LessonPlan, type PlannerSignals, type StageProgress } from '../../../../backend/src/services/lessonPlanner';
import { kidsPackOn, ladContentFor, ladLines, lessonFor, loadKidsPack } from '../../../../backend/src/services/kidsPack';
import { applyTurn, summarizeProfile, applyLiveErrors, applyKnownPoints, liveErrorTypes, errorTypeLabel, type Esl5Record } from '../../../../backend/src/services/learnerLanguageProfile';
import { applyOutcome, scheduleWrong, reviewDue, prioritize, briefLines, trustedWrong, removeExamItems, answerWrong, WORK_ON_MAX, SPACED_DAYS } from '../../../../backend/src/services/errorsToWorkOn';
import { lastSessionLine, learnerBrief, summarizeTurns, habitsSummary, habitsLines, type MsgLike } from '../../../../backend/src/services/learnerMemory';
import { simulate, type PlacementBank, type PlacementItem } from '../../../../backend/src/services/assessment/placementEngine';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { graderV2On, normaliseV2, sensitivityOf } from '../../../../backend/src/services/graderV2';
import { LESSONS6, type Esl6Lesson } from './esl6Fixtures';
import { createHash } from 'crypto';

// Copied from pln2Study.ts / esl6Study.ts (same formulas and batch format). Neither is imported: they run their own CLI on import.
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

type Arm = 'BASE' | 'NEW' | 'PP';
type Time = 'pre' | 'imm' | 'wk1' | 'wk4';
type AgeGroup = 'u9' | '9-12' | 'teen' | 'adult';
const ARMS: Arm[] = ['BASE', 'NEW', 'PP'];
const ENGINE_ARMS: Arm[] = ['BASE', 'NEW'];
const TIMES: Time[] = ['pre', 'imm', 'wk1', 'wk4'];
const FORM_OF: Record<Time, 'A' | 'B' | 'C'> = { pre: 'A', imm: 'B', wk1: 'C', wk4: 'A' };
const ROOT = path.join(__dirname, '../..');            // research/deep-learning-simulation-v2
const REPO = path.join(ROOT, '../..');                 // repository root
const CFG = path.join(ROOT, 'config/agent_sim_esl7');
const CFG6 = path.join(ROOT, 'config/agent_sim_esl6'); // learning rules, F1, item-belief map, wrong answers (merged with the ESL7 *_NEW files)
const NEW_PY = path.join(ROOT, 'src/offline/esl7_outcomes_new.py');
const PPLUS_FILE = path.join(ROOT, 'config/agent_sim_esl4/PPLUS_PROMPT.txt');
const PPLUS_SHA = 'e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472';
const PPLUS = readFileSync(PPLUS_FILE, 'utf8').trim();
const BASE_ENV = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,planner2,workOn,sessionMemory,learnerProfile,whatWorks';
export const ENV_OF: Record<Arm, string> = { BASE: BASE_ENV, NEW: `${BASE_ENV},workOnTrusted,oneTaskMethod,spacedReview,ruleOnWrong,switchMove,spellingPattern,l1Lexical,childShort`, PP: '' };
const GRADER_ENV = 'graderV2';                          // test scoring, every arm (deterministic path; model path never called)
const TURNS = 5; const ROUNDS = 20; const DAY = 86_400_000; const T0 = Date.parse('2027-05-03T09:00:00Z');
/** Track (outcome 1 / 2) -> days of its session 1 and session 2 (PROTOCOL §4). */
const DAYS: Record<1 | 2, [number, number]> = { 1: [0, 7], 2: [2, 14] };
const WK4_DAY = 28; const WK1_AFTER = 7;
/** Round slots: rounds 1-5 o1S1, 6-10 o2S1, 11-15 o1S2, 16-20 o2S2. */
const SLOTS: { track: 1 | 2; session: 1 | 2 }[] = [{ track: 1, session: 1 }, { track: 2, session: 1 }, { track: 1, session: 2 }, { track: 2, session: 2 }];
const slotOf = (round: number) => SLOTS[Math.floor((round - 1) / TURNS)];
const localOf = (round: number) => { const sl = slotOf(round); return (sl.session - 1) * TURNS + ((round - 1) % TURNS); };
const roundOf = (track: 1 | 2, local: number) => { const session = local < TURNS ? 1 : 2; const k = SLOTS.findIndex((x) => x.track === track && x.session === session); return k * TURNS + (local % TURNS) + 1; };
const JUDGE_PER = 72; const FIT_PER = 12; const SCORE_PER = 40; const AGREE_SHARE = 0.1; const FIT_AGREE_SHARE = 0.1; const CELL_MAX = 24;
const NS = 'esl7';
const FIRST_ID = 7000;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
/** ESL6_ONLY marker in the run folder: the 30 ESL6 outcomes only (used when the new outcome files are not there yet). */
let ONLY6 = false;
const dirArg = (d: string) => { const r = path.resolve(d); ONLY6 = existsSync(path.join(r, 'ESL6_ONLY')); return r; };

// ---------------------------------------------------------------------------------------------------------- python bridge (esl6_forget.py, esl6_outcomes.py + esl7_outcomes_new.py)
const PY = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'src/offline'))})
import esl6_forget as F
from esl6_outcomes import OUTCOMES
out = []
for op in json.load(sys.stdin):
    k = op['op']
    if k == 'outcomes':
        L = list(OUTCOMES)
        if op.get('new'):
            from esl7_outcomes_new import OUTCOMES_NEW
            L += list(OUTCOMES_NEW)
        out.append([{x: o[x] for x in ('key', 'id', 'sec1', 'topic', 'ws', 'C', 'W', 'E')} for o in L])
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
const outcomes = (): Record<string, Outcome> => {
  if (OUTS) return OUTS;
  if (!ONLY6 && !existsSync(NEW_PY)) throw new Error(`${NEW_PY} missing: create it, or run with an ESL6_ONLY marker (init <dir> --esl6-only)`);
  return (OUTS = Object.fromEntries((py<Outcome[]>([{ op: 'outcomes', new: !ONLY6 }])[0]).map((o) => [o.id, o])));
};
const PAIR: Record<string, string> = { W1: 'C1', W2: 'C2', C1: 'W1', C2: 'W2' };

interface KState { form: string; band: 'A1' | 'A2' | 'B2'; primary: 'W1' | 'W2'; ws: ('W1' | 'W2')[]; s: Record<'W1' | 'W2' | 'C1' | 'C2', number>; indep: { C1: number; C2: number }; start: Record<string, number>; retr: { C1: number[]; C2: number[] }; afterF1: boolean; sec1?: string }
const EPS = 1e-9;
const pWrong = (w: number) => (w >= 1.5 - EPS ? 0.8 : w >= 0.5 - EPS ? 0.4 : 0.05);
const recallFloor = (c: number) => 0.4 * Math.max(0, 1 - c / 2);
const itemErrorProb = (k: KState, w: 'W1' | 'W2', floorOn = k.afterF1) => Math.max(pWrong(k.s[w]), floorOn ? recallFloor(k.s[PAIR[w] as 'C1' | 'C2']) : 0);

// ---------------------------------------------------------------------------------------------------------- lessons (ESL6 + LESSONS_NEW.json)
type Lesson = Pick<Esl6Lesson, 'outcomeId' | 'title' | 'objective' | 'spec'>;
let LNEW: Record<string, Lesson> | undefined;
// Amendment D: the engine sends only an item's prompt to the model, so a reading or dialogue text must be inside the prompt,
// as a course author would write it. LESSONS_NEW.json kept it in a separate "material" field (rounds 1-7: not shown in BASE/NEW).
function withMaterial(it: any) {
  if (!it?.material) return it;
  // Question first, then the text: the engine caps an item prompt at 300 characters (cleanItems), so a long text loses its end, not the question.
  const prompt = `${String(it.prompt).trim()} Text: "${String(it.material).trim()}"`.slice(0, 300); // the live cap (cleanItems), applied here because the harness builds lessons directly
  const { material: _m, ...rest } = it; return { ...rest, prompt, question: it.prompt }; // question: the original line, for the harness's own item matching
}

function lessonsNew(): Record<string, Lesson> {
  if (LNEW) return LNEW;
  const p = path.join(CFG, 'LESSONS_NEW.json'); if (!existsSync(p)) return (LNEW = {});
  const d = JSON.parse(readFileSync(p, 'utf8')); const list: any[] = Array.isArray(d) ? d : Array.isArray(d.lessons) ? d.lessons : Object.values(d.lessons ?? d);
  return (LNEW = Object.fromEntries(list.map((l) => [l.outcomeId, { outcomeId: l.outcomeId, title: l.title, objective: l.objective ?? l.spec?.objectives?.[0] ?? l.title, spec: { objectives: [], successCriteria: [], vocabulary: [], grammar: [], functions: [], skills: [], examples: [], items: [], ...l.spec, items: (l.spec?.items ?? []).map(withMaterial) } }])));
}
const L6M: Record<string, Lesson> = {};
const lessonOf = (oid: string): Lesson => {
  const six = LESSONS6[oid];
  if (six) return (L6M[oid] ??= { ...six, spec: { ...six.spec, items: (six.spec?.items ?? []).map(withMaterial) } } as Lesson);
  const l = lessonsNew()[oid]; if (!l) throw new Error(`no lesson for ${oid}`); return l;
};
const lessonIdOf = (oid: string) => `lsn-${oid}`;    // one lesson id per outcome (ESL5 record keys and sessionMemory "answered items" stay per outcome)

// ---------------------------------------------------------------------------------------------------------- error codes (LEARNING_RULES 1b, NEW_LEARNING_RULES; fallback outcomes.json l1ErrorTypes)
let CODES: Record<string, Partial<Record<'W1' | 'W2', string>>> | undefined;
function errorCodes() {
  if (CODES) return CODES; CODES = {};
  const l1 = new Map(((JSON.parse(readFileSync(path.join(REPO, 'data/outcomes/outcomes.json'), 'utf8')).outcomes ?? []) as { id: string; l1ErrorTypes?: string[] }[]).map((o) => [o.id, o.l1ErrorTypes ?? []]));
  for (const f of [path.join(CFG6, 'LEARNING_RULES.md'), path.join(CFG, 'NEW_LEARNING_RULES.md')]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\|\s*\d+\s*\|\s*(EN-[A-Z]-[^\s|]+)\s*\|/); if (!m) continue; const c: Partial<Record<'W1' | 'W2', string>> = {}; for (const x of line.matchAll(/W([12]) `([a-z0-9_]+)`/g)) c[`W${x[1]}` as 'W1' | 'W2'] ??= x[2]; CODES[m[1]] = c; }
  }
  for (const o of Object.values(outcomes())) { const c = (CODES[o.id] ??= {}); const list = l1.get(o.id) ?? []; for (const [i, w] of (['W1', 'W2'] as const).entries()) if (o.ws.includes(w) && !c[w]) c[w] = list.find((x) => !Object.values(c).includes(x)) ?? list[i] ?? 'unknown'; }
  return CODES;
}
const codeOf = (oid: string, w: string | null | undefined) => (w ? errorCodes()[oid]?.[w as 'W1' | 'W2'] : undefined) ?? 'unknown';
const skillOf = (oid: string) => oid.split('-')[3];  // GR / VO / FN / RD / WR

// ---------------------------------------------------------------------------------------------------------- learners (PROTOCOL §4)
interface Learner { idx: number; outcomes: [string, string]; level: 'A1' | 'A2'; status: string; primary: 'W1'; ageGroup: AgeGroup; ageBand: 'child' | 'teen' | 'adult'; ageYears?: number; birthDate?: string }
const seeded = (xs: string[], salt: string) => [...xs].sort((a, b) => (sha(`${NS}|pick|${salt}|${a}`) < sha(`${NS}|pick|${salt}|${b}`) ? -1 : 1));
/** Pairs of the level's outcomes: each outcome 4 times, shuffled with seed 'esl7', paired in order; a pair with the same outcome twice swaps with a later pair. */
export function pairsOf(ids: string[], level: string): [string, string][] {
  const slots = seeded(ids.flatMap((o) => [0, 1, 2, 3].map((c) => `${o}#${c}`)), `esl7|${level}`).map((x) => x.split('#')[0]);
  const pairs: [string, string][] = []; for (let i = 0; i + 1 < slots.length; i += 2) pairs.push([slots[i], slots[i + 1]]);
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] !== pairs[i][1]) continue;
    const j = [...pairs.keys()].find((k) => k !== i && pairs[k][0] !== pairs[i][1] && pairs[k][1] !== pairs[i][1] && pairs[k][1] !== pairs[i][0]);
    if (j === undefined) throw new Error(`pairing failed at ${level}`);
    [pairs[i][1], pairs[j][1]] = [pairs[j][1], pairs[i][1]];
  }
  return pairs;
}
function buildLearners(): Learner[] {
  const ids = Object.keys(outcomes()).sort(); const out: Learner[] = []; const groups: AgeGroup[] = ['u9', '9-12', 'teen', 'adult']; const seen: Record<AgeGroup, number> = { u9: 0, '9-12': 0, teen: 0, adult: 0 };
  const all = (['A1', 'A2'] as const).flatMap((lv) => pairsOf(ids.filter((o) => o.split('-')[2] === lv), lv).map((p) => ({ lv, p })));
  all.forEach(({ lv, p }, i) => {
    const g = groups[i % 4]; const n = seen[g]++;
    const ageYears = g === 'u9' ? 6 + (n % 3) : g === '9-12' ? 9 + (n % 4) : undefined;
    // staff-entered birth date: ageYears on every simulated day (born 120 days after the start date's anniversary would be: birthday 4 months before T0)
    const birthDate = ageYears !== undefined ? new Date(Date.UTC(new Date(T0).getUTCFullYear() - ageYears, new Date(T0).getUTCMonth() - 4, 15)).toISOString() : undefined;
    out.push({ idx: FIRST_ID + i, outcomes: p, level: lv, status: 'emerging', primary: 'W1', ageGroup: g, ageBand: g === 'teen' ? 'teen' : g === 'adult' ? 'adult' : 'child', ...(ageYears !== undefined ? { ageYears, birthDate } : {}) });
  });
  return out;
}
let LRN: Learner[] | undefined;
const LEARNERS = () => (LRN ??= buildLearners());
const L_OF = (idx: number): Learner => LEARNERS().find((l) => l.idx === idx)!;
const seedOf = (idx: number, track: 1 | 2) => `${NS}|L${idx}|o${track}`;

// ---------------------------------------------------------------------------------------------------------- tracks
interface LangTurn { assessment?: any; activeItem?: any; hintLevel?: number; rulesIntroduced?: number[]; closingAsk?: string; diagnosis?: string; answeringCheck?: boolean; moves?: string[]; [k: string]: unknown }
interface Turn { session: 1 | 2; learner: string; production: Production; tutor?: string; raw?: string; ev5?: Record<string, unknown>; lang?: LangTurn; judgeInput?: string; [k: string]: unknown }
interface Rec { entries: any[]; liveErrors: Record<string, { seen: number; lastCorrect?: boolean }>; knownPoints: Record<string, number> }
interface AssessSummary { form: string; points: number; max: number; pct: number; pending: number; items: number; fullItems: number; nulls: number; criteria?: Record<string, number>[] }
interface Sess { arm: Arm; learnerIdx: number; track: 1 | 2; outcome: string; seed: string; state: KState; start: KState; turns: Turn[]; stateAfterS1?: KState; stateWk1?: KState; stateS2Start?: KState; stateEndS2?: KState; stateWk4?: KState; assess?: Partial<Record<Time, AssessSummary>> }
const keyOf = (s: { learnerIdx: number; arm: Arm; track: 1 | 2 }) => `s${s.learnerIdx}_${s.arm}_o${s.track}`;
const reviver = (k: string, v: unknown) => (/At$/.test(k) && typeof v === 'string' ? new Date(v) : v);
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'), reviver);
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const sessionFiles = (dir: string) => readdirSync(path.join(dir, 'sessions')).filter((f) => f.endsWith('.json')).sort();
const sessDay = (s: Pick<Sess, 'track'>, session: 1 | 2) => DAYS[s.track][session - 1];
const opener = (l: Learner, oid: string, session: 1 | 2): Turn => {
  const t = outcomes()[oid].topic; const kid = l.ageBand === 'child';
  const text = session === 1 ? (kid ? `Hi! Can we learn ${t} today?` : `Hello! Can you give me an exercise on ${t}?`) : kid ? `Hi again! Can we practise ${t} again today?` : `Hello again! Can we practise ${t} again today?`;
  return { session, learner: text, production: { kind: 'none', text: '' } };
};
/** The global round of a track's pending (unanswered) turn, or undefined when the track is done or waiting for its judge. */
const pendingRound = (s: Sess) => { const last = s.turns[s.turns.length - 1]; return last.tutor === undefined && s.turns.length <= 2 * TURNS ? roundOf(s.track, s.turns.length - 1) : undefined; };
// Cells: arm x parts of <= 24 learners (both tracks listed; one of them is due in a round) -> 24 sessions per cell per round.
const cells = () => { const L = LEARNERS(); const parts = Math.ceil(L.length / CELL_MAX); return ARMS.flatMap((arm) => Array.from({ length: parts }, (_, p) => ({ id: `${arm}_${p + 1}`, arm, keys: L.filter((_, i) => i % parts === p).flatMap((l) => ([1, 2] as const).map((track) => keyOf({ learnerIdx: l.idx, arm, track }))) }))); };
const caseId = (f: string, round: number) => `c${sha(`${NS}|${f}|${round}`).slice(0, 10)}`;
const currentRound = (dir: string) => { let r = Infinity; for (const f of sessionFiles(dir)) { const p = pendingRound(load(dir, f.replace(/\.json$/, ''))); if (p !== undefined && p < r) r = p; } return r === Infinity ? undefined : r; };

// ---------------------------------------------------------------------------------------------------------- memory (PROTOCOL §5; deployed pure functions)
interface Row { id: string; objectiveId: string; errorCode: string; errorLabel?: string; sources: { itemId: string; prompt: string; at: Date }[]; occurrences: number; firstSeenAt: Date; lastSeenAt: Date; status: 'open' | 'resolved' | 'dismissed'; rightStreak: number; countedKeys: string[]; statusHistory: any[]; resolvedAt?: Date; lastWrongAt?: Date; nextReviewAt?: Date; reviewStep?: number; finalCheckAt?: Date }
interface Mem { learnerIdx: number; arm: Arm; createdAt: Date; rows: Row[]; rec: Rec; log: any[] }
const memFile = (dir: string, idx: number, arm: Arm) => path.join(dir, 'memory', `m${idx}_${arm}.json`);
const loadMem = (dir: string, idx: number, arm: Arm): Mem | undefined => (existsSync(memFile(dir, idx, arm)) ? JSON.parse(readFileSync(memFile(dir, idx, arm), 'utf8'), reviver) : undefined);
const saveMem = (dir: string, m: Mem) => writeFileSync(memFile(dir, m.learnerIdx, m.arm), JSON.stringify(m, null, 1));
const PRE_AT = new Date(T0 - 30 * 60_000);             // the pre-test: day 0, before the first session; released at once
const sessionKey = (s: Sess, session: 1 | 2) => `${keyOf(s)}_S${session}`;
/** syncErrors' rules on one released attempt (the pre-test), with the harness's own rows. */
function memFromPre(m: Mem, oid: string, answers: { itemId: string; prompt: string; q: any; points: number; max: number; method: string; answer: string; fired: string | null }[]) {
  const when = PRE_AT; const key = `attempt:pre-${m.learnerIdx}`;
  for (const a of answers) {
    const ans = { points: a.points, maxPoints: a.max, method: a.method, studentAnswer: a.answer };
    if (answerWrong(ans) && engineV2('workOnTrusted') && !trustedWrong(a.q, ans, { graderV2: true })) continue; // tests are scored with graderV2 on (GRADER_ENV)
    const open = m.rows.filter((e) => e.objectiveId === oid && e.status !== 'dismissed');
    if (answerWrong(ans)) {
      const errorCode = codeOf(oid, a.fired); const src = { itemId: a.itemId, prompt: a.prompt, at: when };
      const row = open.find((e) => e.errorCode === errorCode);
      for (const e of open.filter((x) => x !== row)) applyOutcome(e as never, { right: false, key, at: when, by: 'system' });
      if (row) {
        if (!row.sources.some((x) => x.itemId === a.itemId)) { row.sources.push(src); row.occurrences += 1; }
        applyOutcome(row as never, { right: false, key, at: new Date(when.getTime() + 1), by: 'system' });
      } else {
        m.rows.push({ id: `ewo_${sha(`${NS}|${m.learnerIdx}|${m.arm}|${oid}|${errorCode}`).slice(0, 12)}`, objectiveId: oid, errorCode, sources: [src], occurrences: 1, firstSeenAt: when, lastSeenAt: when, status: 'open', rightStreak: 0, countedKeys: [], statusHistory: [{ at: when, by: 'system', to: 'open', reason: 'released_assessment' }], ...(engineV2('spacedReview') ? { lastWrongAt: when, reviewStep: 0, nextReviewAt: new Date(when.getTime() + SPACED_DAYS[0] * DAY) } : {}) });
      }
    } else for (const e of open) applyOutcome(e as never, { right: true, key, at: when, by: 'system' });
  }
}
/** The previous session of the journey (calendar order), for the last-session line and the habits rollup. */
function journeyOrder(): { track: 1 | 2; session: 1 | 2; day: number }[] { return SLOTS.map((x) => ({ ...x, day: DAYS[x.track][x.session - 1] })); }
function msgsOf(s: Sess, session: 1 | 2): MsgLike[] {
  const day = sessDay(s, session); const out: MsgLike[] = [];
  s.turns.filter((t) => t.session === session).forEach((t, k) => {
    const at = new Date(T0 + day * DAY + (k + 1) * 60_000);
    out.push({ role: 'user', timestamp: at });
    if (t.tutor !== undefined) out.push({ role: 'ai', timestamp: new Date(at.getTime() + 30_000), meta: { languageTurn: { ...(t.lang ?? {}), lessonId: lessonIdOf(s.outcome) }, teaching: { objectiveId: s.outcome, primary: (t.planner as any)?.primary } } });
  });
  return out;
}
interface Brief { lines: string[]; items: { id: string }[]; guardTexts: string[]; reviewOpening: boolean; lastLine?: string; habits?: string[] }
function briefFor(dir: string, s: Sess, mem: Mem, now: Date): Brief {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const st = sessionTurns(s); const firstTurn = !st.some((t) => t.tutor !== undefined); const cur = st[0].session;
  // workOn: only this outcome's rows (PROTOCOL §5 limit); BASE all open rows, NEW (spacedReview) the due rows (eligibleErrors).
  const rows = mem.rows.filter((r) => r.objectiveId === s.outcome).filter((r) => (engineV2('spacedReview') ? (r.status === 'open' || r.status === 'resolved') && reviewDue(r as never, now) : r.status === 'open'));
  const top = prioritize(rows as never[], new Map(), l.ageBand === 'child' ? WORK_ON_MAX.child : WORK_ON_MAX.other) as unknown as Row[];
  const items = top.map((r) => ({ id: r.id, objectiveId: r.objectiveId, code: r.objectiveId, title: lessonOf(r.objectiveId).objective, errorCode: r.errorCode, errorLabel: r.errorLabel, occurrences: r.occurrences, status: r.status }));
  const workOn = items.length ? briefLines(items) : [];
  const memLines: string[] = []; let lastLine: string | undefined; let habits: string[] = [];
  if (firstTurn) {
    const order = journeyOrder(); const k = order.findIndex((x) => x.track === s.track && x.session === cur);
    if (k > 0) {
      const prev = order[k - 1]; const ps = load(dir, keyOf({ learnerIdx: s.learnerIdx, arm: s.arm, track: prev.track }));
      const sum = summarizeTurns(msgsOf(ps, prev.session));
      if (sum) { lastLine = lastSessionLine(sum as never, lessonOf(ps.outcome).objective, now, (c) => errorTypeLabel(c) || c.replace(/_/g, ' ')); memLines.push(lastLine); }
      // learnerProfile: the habits rollup of the earlier sessions (one row per earlier session day); "back after N days" when the gap is 7+.
      habits = habitsLines(habitsSummary(order.slice(0, k).map((x) => ({ day: new Date(T0 + x.day * DAY), sessions: 1, minutes: 6, firstHourUtc: new Date(T0).getUTCHours() })), now));
      memLines.push(...habits);
    }
  }
  const lines = engineV2('sessionMemory') ? learnerBrief([workOn, memLines]) : [...workOn, ...memLines];
  const guardTexts = top.flatMap((r) => r.sources.map((x) => x.prompt));
  return { lines, items, guardTexts, reviewOpening: firstTurn && (items.length > 0 || habits.length > 0), ...(lastLine ? { lastLine } : {}), ...(habits.length ? { habits } : {}) };
}

// ---------------------------------------------------------------------------------------------------------- engine glue (pln2 P2 path + memory)
const gradeOf = (level: string) => { const r = levelRank(level) ?? 6; return r <= 1 ? 4 : r === 2 ? 9 : 18; };
function planInput(l: Learner, oid: string): PlanInput {
  return {
    objectiveId: oid, masteryStatus: l.status,
    masteryEstimate: l.status === 'proficient' ? 0.8 : l.status === 'developing' ? 0.5 : l.status === 'emerging' ? 0.3 : 0.1,
    evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [],
    misconceptions: l.status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }],
    supportingEvidenceIds: ['seed'], recentResults: [], triedWithoutImprovement: [], gradeLevel: gradeOf(l.level), subject: 'Grammar', relatedSecureObjectives: 0,
    belowB1: belowB1(l.level), ageBand: l.ageBand,
  };
}
const nowOf = (s: Sess) => new Date(T0 + sessDay(s, s.turns[s.turns.length - 1].session) * DAY + sessionTurns(s).length * 60_000);
/** Trusted age band as loadTrustedAgeBand resolves it: children from the staff birth date (so childShort gets the years), others from the staff-set band. */
const trustedOf = (l: Learner, now: Date): TrustedAgeBand => (l.birthDate ? resolveTrustedAgeBand(undefined, undefined, undefined, { birthDate: l.birthDate, now }) : resolveTrustedAgeBand(undefined, l.ageBand));
const sessionTurns = (s: Sess) => { const cur = s.turns[s.turns.length - 1].session; return s.turns.filter((t) => t.session === cur); };
const shownItem = (tutor: string, oid: string) => [...lessonOf(oid).spec.items].reverse().find((it) => norm(tutor).includes(norm(coreOf((it as { question?: string }).question ?? it.prompt)).slice(0, 30)));
function history(turns: Turn[]) {
  const hist: any[] = [];
  for (const t of turns) { hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break; hist.push({ role: 'assistant', content: t.tutor, languageTurn: { ...(t.lang ?? {}), ...(t.ev5 ?? {}) } }); }
  return hist;
}
interface PlanOut { plan: TeachingPlan; text: string; lesson?: LessonPlan; stage?: string; quickCheck: boolean; progress?: StageProgress; l1: number; l1Added: boolean; brief: Brief; repeatedError?: { code: string; count: number } }
/** The "learning focus" block: learningContext.buildObjectiveContext with planner2 and the learner brief (workOn + sessionMemory) where learningContext puts it. */
function planOf(dir: string, s: Sess, mem: Mem): PlanOut {
  const l = L_OF(s.learnerIdx); process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const now = nowOf(s); const oid = s.outcome; const lz = lessonOf(oid);
  const input = planInput(l, oid);
  const brief = briefFor(dir, s, mem, now); process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  if (brief.reviewOpening) input.reviewOpening = true;
  const head = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ${oid} "${lz.objective}". Status: ${STATUS_WORDS[l.status]}.`];
  const tail = ['- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  const wrap = (lines: string[]) => arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n');
  const st = sessionTurns(s); const hist = history(st.slice(0, -1));
  const signals: PlannerSignals = { ageBand: l.ageBand, ...(l.birthDate ? { ageYears: ageFromBirthDate(l.birthDate, now) } : {}), level: l.level, ...(ladContentFor(oid, lz.title) ? { ladContent: true } : {}) };
  const l1 = hist.flatMap((t) => { const code = t.role === 'assistant' ? (t.languageTurn as { diagnosis?: string } | null)?.diagnosis : undefined; return code && (L1_TRANSFER_CODES as string[]).includes(code) ? [code] : []; });
  let l1Added = false;
  if (l1.length >= 2 && !input.misconceptions.some((m) => m.category === 'l1_transfer')) { input.misconceptions = [{ id: `l1-session-${oid}`, category: 'l1_transfer', status: 'suspected' }, ...input.misconceptions]; l1Added = true; }
  // switchMove: the session's most repeated error code (codes only), as learningContext.
  const codes = hist.flatMap((t) => { const lt = t.role === 'assistant' ? (t.languageTurn as { diagnosis?: string; liveError?: string } | null) : undefined; const c = lt?.diagnosis ?? lt?.liveError; return c ? [c] : []; });
  const tally = new Map<string, number>(); for (const c of codes) tally.set(c, (tally.get(c) ?? 0) + 1);
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]; if (top && top[1] >= 2) signals.repeatedError = { code: top[0], count: top[1] };
  const currentVerdict = detectTurnSignals(st[st.length - 1].learner, hist, { title: lz.title, spec: lz.spec } as never).keyVerdict ?? null;
  const progress = progressFromHistory(hist, { verdict: currentVerdict, message: st[st.length - 1].learner });
  const op = reviewOpener(signals, input);
  const lesson = planLesson(input, { ...signals, ...quickCheckSignals(signals, progress, op) });
  const stage = stageNow(lesson, progress);
  const text = wrap([...head, ...brief.lines, ...(quickCheckActive(lesson) ? [QUICK_CHECK_PLAN_LINE] : planLines(lesson.plan, undefined, l.status)), ...shapeLines(lesson, stage), ...(lesson.shape === 'LAD' && kidsPackOn() ? ladLines((() => { const d = loadKidsPack(); return d ? lessonFor(d, oid, lz.title) : undefined; })(), stage, progress.tries ?? 0) : []), ...tail]);
  return { plan: lesson.plan, text, lesson, stage, quickCheck: lesson.shapeRule === 'S4q', progress, l1: l1.length, l1Added, brief, ...(signals.repeatedError ? { repeatedError: signals.repeatedError } : {}) };
}
const esl5Record = (r: Rec): Esl5Record => ({ live: liveErrorTypes({ entries: r.entries, liveErrors: r.liveErrors }), knownPoints: { ...r.knownPoints } });
/** sessionMemory: lesson items answered in this outcome's earlier session (never offered again as "next"). */
function priorAnswered(s: Sess): string[] { const cur = s.turns[s.turns.length - 1].session; if (cur === 1 || !engineV2('sessionMemory')) return []; return summarizeTurns(msgsOf(s, 1))?.answeredItemIds ?? []; }
/** buildLanguageTeachingContext with the harness's own record. */
function langCtx(s: Sess, mem: Mem, po: PlanOut) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const l = L_OF(s.learnerIdx); const lesson0 = lessonOf(s.outcome); const st = sessionTurns(s); const message = st[st.length - 1].learner; const now = nowOf(s); const lessonId = lessonIdOf(s.outcome);
  const hist = history(st.slice(0, -1)); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const learner = deriveLearnerContext({ courseLevel: l.level, courseLanguages: ['English'], adultSchool: false, trustedAgeBand: trustedOf(l, now), learnerMessages: [...hist.filter((h) => h.role === 'user').map((h) => h.content), message], objectiveStatus: l.status });
  const signals0 = detectTurnSignals(message, hist, lesson as never, undefined, { child: learner.ageBand.status === 'known' && learner.ageBand.value === 'child', priorAnswered: priorAnswered(s) });
  const moves0 = selectLanguageMoves({ band: learner.proficiency.band, targetLanguage: 'English', lessonStatus: 'structured', signals: signals0, masteryStatus: l.status });
  const record = engineV2('reviewOpen') || engineV2('fadeKnown') ? esl5Record(mem.rec) : undefined;
  const adjusted = esl5Adjust({ signals: signals0, moves: moves0, record, history: hist, lessonId });
  const quickCheck = po.quickCheck && engineV2('planner2');
  const signals = adjusted.signals;
  const ladStep = !quickCheck && engineV2('planner2') && engineV2('kidsPack') && po.lesson?.shape === 'LAD' && ['listen', 'do', 'chant'].includes(String(po.stage)) && ladContentFor(s.outcome, lesson0.title);
  const taskStep = !quickCheck && !ladStep && engineV2('planner2') && po.lesson?.shape === 'TASK' && ['repeat', 'done'].includes(String(po.stage));
  const moves = quickCheck ? adjusted.moves.filter((m) => !QUICK_CHECK_DROPPED.has(m.id)) : ladStep ? adjusted.moves.filter((m) => !LAD_STEP_DROPPED.has(m.id)) : taskStep ? adjusted.moves.filter((m) => !TASK_STEP_DROPPED.has(m.id)) : adjusted.moves;
  const base0 = lengthTarget(learner.ageBand, learner.proficiency.value, learner.ageYears);
  const clarifyOnly = moves.some((m) => m.id === 'clarify_goal') && !moves.some((m) => ['short_explanation', 'comprehension_check', 'redirect_to_lesson'].includes(m.id));
  const length = clarifyOnly ? { targetWords: Math.min(base0.targetWords, 40), maxWords: Math.min(base0.maxWords, 60), basis: `${base0.basis}:clarify` } : base0;
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec as never) : undefined;
  const prevTurn = [...hist].reverse().find((h) => h.role === 'assistant')?.languageTurn as { moves?: string[] } | undefined;
  const planPrimary = po.plan.primary; process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
  const { explicit, ruleFirst } = quickCheck ? { explicit: undefined, ruleFirst: undefined } : ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: lesson0.spec as never, moves, record, lessonId } as never);
  const profile = summarizeProfile(mem.rec.entries, now);
  const base = { version: LANGUAGE_CONTEXT_VERSION, learner, lesson: { status: 'structured', lessonId, title: lesson0.title, spec: lesson0.spec }, signals, moves, length, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(prevTurn?.moves?.length ? { prevMoves: prevTurn.moves } : {}), ...(planPrimary ? { planPrimary } : {}), ...(record ? { record } : {}) } as never;
  const prompt = renderLanguageContextPrompt(base);
  const tail = quickCheck ? QUICK_CHECK_LINE : ladStep ? LAD_STEP_LINE : taskStep ? TASK_STEP_LINE : '';
  return { ...(base as object), ...(quickCheck ? { quickCheck: true } : {}), ...(ladStep ? { ladStep: true } : {}), ...(taskStep ? { taskStep: true } : {}), prompt: tail ? `${prompt}\n\n${tail}` : prompt } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => sessionTurns(s).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function needMem(dir: string, s: Sess): Mem { const m = loadMem(dir, s.learnerIdx, s.arm); if (!m) throw new Error(`${keyOf(s)}: no memory file (run "meminit" after the pre-test is fully scored)`); return m; }
function enginePart(dir: string, s: Sess): string { const mem = needMem(dir, s); const po = planOf(dir, s, mem); return `${po.text}\n\n${langCtx(s, mem, po).prompt}`; }
function tutorPrompt(dir: string, s: Sess): string {
  const l = L_OF(s.learnerIdx);
  if (s.arm === 'PP') {
    // ESL6 P+ (unchanged): lesson data plus this session's conversation; a new chat each session. Reading lessons: the item's text is shown with it.
    const L = lessonOf(s.outcome); const sp = L.spec;
    return `${PPLUS}\n\nLearner level: ${l.level} (CEFR)\n\nLesson: ${L.title}. ${L.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}\n\nPractice exercises you may use:\n${sp.items.map((i: any, k: number) => `${k + 1}. ${i.prompt}${i.material ? ` Text: "${i.material}"` : ''}`).join('\n')}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
  }
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next).\n\n${enginePart(dir, s)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}
// Item bookkeeping for the leak, release and stuck tags (as pln2Study.ts; per session).
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
  for (const it of items) { if (skip(it.id)) continue; const core = coreOf(it.prompt); for (const a of it.acceptedAnswers ?? []) { const nf = norm(core.includes('___') ? core.replace('___', a) : a);
    if (!core.includes('___') && nf === norm(core)) { if (text.includes(a.trim())) { out.push(it.id); break; } continue; } if ((nf.length >= 8 && nt.includes(` ${nf} `)) || new RegExp(`\\b(the answer is|answer:|correct answer is)\\s*["'“]?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) { out.push(it.id); break; } } }
  return out;
}
function withoutEcho(s: Sess, text: string): string { const st = sessionTurns(s); const own = String(st[st.length - 1]?.learner ?? '').trim().replace(/[.!?]+$/, ''); if (own.split(/\s+/).length < 3) return text; const re = new RegExp(own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi'); return text.replace(re, ' '); }
function leakIn(s: Sess, text0: string): number { const text = withoutEcho(s, text0); const g = itemLedger(s); const tried = new Set(g.tried); if (g.active) tried.add(g.active); return answersIn(s, text, (id) => tried.has(id)).length; }
function earlyLeakIn(s: Sess, text0: string): { early: number; late: number } {
  const text = withoutEcho(s, text0); const g = itemLedger(s); const hit = answersIn(s, text, (id) => g.solved.has(id));
  return { early: hit.filter((id) => (g.fails[id] ?? 0) < 2).length, late: hit.filter((id) => (g.fails[id] ?? 0) >= 2).length };
}
async function applyTutor(dir: string, s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const written = raw.trim(); let text = written; let final = text; let removed = 0; let closingAsk: string | undefined;
  if (s.arm !== 'PP') {
    const mem = needMem(dir, s);
    // production order (tutor.controller): strip and parse the hidden marker, then the reply guards, the workOn exam-item guard, then the turn evidence.
    const marker = stripAssessmentMarkers(written); text = marker.text;
    const po = planOf(dir, s, mem); const ctx = langCtx(s, mem, po); const g = applyReplyGuards(ctx, text, last.learner); final = g.text; removed = g.removed; closingAsk = g.closingAsk;
    process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
    if (po.brief.guardTexts.length) { const ex = removeExamItems(final, po.brief.guardTexts); if (ex.removed) { final = ex.text; removed += ex.removed; } }
    const l = L_OF(s.learnerIdx); const sig = ctx.signals as any; const now = nowOf(s); const lessonId = lessonIdOf(s.outcome);
    const lt: any = await completeLanguageTurn({ language: ctx, objectiveId: s.outcome, reply: final, learnerText: last.learner, messageId: `${keyOf(s)}_t${s.turns.length}`, marker, removed, ...(closingAsk ? { closingAsk: closingAsk as never } : {}), institutionId: '', studentId: '' });
    const ev5: Record<string, unknown> = {}; for (const k of ['liveError', 'answerReleased', 'reviewOpen', 'fadeCheck', 'fadeCheckAnswered', 'fadeFailed', 'ownSentence']) if (lt[k] !== undefined) ev5[k] = lt[k];
    const verdict = lt.assessment?.verdict; const indep = independentSuccessItem(ctx, lt);
    const fadeFailed = engineV2('fadeKnown') && lt.fadeCheckAnswered?.length && isFailure(verdict) ? lt.fadeCheckAnswered : undefined;
    // ENARA's stored learner record (recordProfileTurn's body with the same pure helpers; one record per learner, kept in the memory file).
    const o: any = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId, lessonTitle: lessonOf(s.outcome).title,
      ...(engineV2('liveError') ? { ...(sig.liveError ? { liveError: sig.liveError.code } : {}), ...(sig.liveTarget && lt.assessment && /^CORRECT/.test(String(verdict)) ? { liveCorrect: sig.liveTarget } : {}) } : {}),
      ...(engineV2('fadeKnown') ? { knownInc: (indep?.criteria ?? []).map((c: number) => knownKey(lessonId, c)), knownReset: ((fadeFailed as number[] | undefined) ?? []).map((c) => knownKey(lessonId, c)) } : {}) };
    if (o.errorCode || o.independentSuccessOn) mem.rec.entries = applyTurn(mem.rec.entries, o);
    if (engineV2('liveError') && (o.liveError || o.liveCorrect)) mem.rec.liveErrors = applyLiveErrors(mem.rec.liveErrors as never, o) as Rec['liveErrors'];
    if (engineV2('fadeKnown') && (o.knownInc?.length || o.knownReset?.length)) mem.rec.knownPoints = applyKnownPoints(mem.rec.knownPoints, o);
    // workOn (tutor.controller): a graded answer on the objective counts once per session (independent right, or wrong); an answer to a listed error's practice item.
    const right = Boolean(verdict && independentSuccessItem(ctx, { assessment: { verdict } }));
    const wrong = Boolean(sig.answeringCheck && (verdict === 'INCORRECT' || verdict === 'PARTIALLY_CORRECT'));
    const key = `session:${sessionKey(s, last.session)}`; const memEv: any[] = [];
    if (right || wrong) for (const e of mem.rows.filter((r) => r.objectiveId === s.outcome && r.status !== 'dismissed')) if (applyOutcome(e as never, { right, key, at: now, by: 'tutor' })) memEv.push({ row: e.id, right, at: now, via: 'objective' });
    const prevT = sessionTurns(s).slice(0, -1).reverse().find((t) => t.tutor !== undefined);
    if (prevT?.workOnErrorId && sig.answeringCheck && verdict && verdict !== 'NOT_EVALUATED' && verdict !== 'AMBIGUOUS') {
      const ok = verdict === 'CORRECT' || verdict === 'CORRECT_WITH_EQUIVALENT_FORMULATION'; const e = mem.rows.find((r) => r.id === prevT.workOnErrorId);
      const r2 = ok && prevT.workOnHint === 0 && !(lt.hintLevel ?? 0);
      if (e && applyOutcome(e as never, { right: r2, key, at: now, by: 'tutor' })) memEv.push({ row: e.id, right: r2, at: now, via: 'focus' });
    }
    const focus = (marker.assessment as { focus?: number } | null | undefined)?.focus; const errorId = focus ? po.brief.items[focus - 1]?.id : undefined;
    if (memEv.length) mem.log.push({ track: keyOf(s), turn: s.turns.length, events: memEv });
    saveMem(dir, mem);
    const lang: LangTurn = { assessment: lt.assessment, ...(lt.activeItem ? { activeItem: lt.activeItem } : {}), hintLevel: lt.hintLevel, ...(lt.rulesIntroduced?.length ? { rulesIntroduced: lt.rulesIntroduced } : {}), ...(closingAsk ? { closingAsk } : {}), ...(lt.diagnosis ? { diagnosis: lt.diagnosis } : {}), answeringCheck: Boolean(lt.answeringCheck), moves: lt.moves ?? [] };
    const planner = { arm: s.arm, primary: po.plan.primary, supporting: po.plan.supporting, ...(po.lesson ? { shape: po.lesson.shape, shapeRule: po.lesson.shapeRule, methodRule: po.lesson.methodRule, stage: po.stage, quickCheck: po.quickCheck, childSupports: po.lesson.childSupports, l1Diagnoses: po.l1, l1Misconception: po.l1Added, progress: po.progress, explanation: po.lesson.explanation } : {}), ...(po.repeatedError ? { repeatedError: po.repeatedError } : {}) };
    Object.assign(last, { lang, planner, brief: { lines: po.brief.lines.length, items: po.brief.items.map((x) => x.id), lastSession: Boolean(po.brief.lastLine), habits: Boolean(po.brief.habits) }, ...(errorId ? { workOnErrorId: errorId, workOnHint: lt.hintLevel ?? 0 } : {}), memEvents: memEv.length, diagnosis: lt.diagnosis ?? null, markerStatus: lt.markerStatus ?? null, qualityFlags: lt.qualityFlags ?? [], moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.level), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ...(closingAsk ? { closingAsk } : {}), profileLines: (ctx as any).history?.length ?? 0, ev5, engineVerdict: verdict ?? null, recordLive: (ctx as any).record?.live ?? [], promptQuickCheck: Boolean((ctx as any).quickCheck) });
  }
  const leakRaw = leakIn(s, text); const elRaw = earlyLeakIn(s, text); const el = earlyLeakIn(s, final);
  Object.assign(last, { tutor: final, ...(final !== written ? { raw: written } : {}), leakRaw, leakFinal: leakIn(s, final), earlyLeakRaw: elRaw.early, earlyLeakFinal: el.early, lateAnswerFinal: el.late, answerReleased: Boolean(last.ev5?.answerReleased), twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', twoAsksRaw: hasTwoAsks(text), ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- simulator side (LEARNING_RULES §1b, §2, §2a, §3a; ESL6 judge case text with sessions)
const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''));
const outcomeOfState = (k: KState) => Object.values(outcomes()).find((x) => x.key === k.form)!;
/** esl6Study stateText; the session-2 line names this track's gap (7 or 12 days) instead of ESL6's 2. */
function stateText(k: KState, session: 1 | 2, earlier?: string[], gapDays = 2): string {
  const o = outcomeOfState(k); const s = k.s;
  const lines = [`Target form: ${o.id} (${o.topic}). Learner level ${k.band}. First language Arabic.`, `Session ${session}.` + (session === 2 ? ` This is ${gapDays} days after session 1; the forgetting rule has run, so strengths may be non-whole (LEARNING_RULES 2a, 6).` : '')];
  for (const w of o.ws) lines.push(`${w} (wrong) strength ${fmt(s[w])}: ${o.W[w]}. Its error: ${o.E[w]}.`);
  for (const w of o.ws) { const c = PAIR[w] as 'C1' | 'C2'; lines.push(`${c} (correct) strength ${fmt(s[c])}: ${o.C[c]}. Independent correct productions so far: ${k.indep[c]}.`); }
  if (o.ws.length === 1) lines.push('This outcome has one wrong belief only (no W2, no C2).');
  if (session === 2 && earlier?.length) lines.push('Items this learner answered in session 1: ' + earlier.map((e) => `"${e}"`).join(' | '));
  return lines.join('\n');
}
function factLine(p: Production | undefined, k: KState): string {
  if (!p || p.kind === 'none' || p.kind === 'rule') return 'FACT: the last learner message did not produce the form (no exercise answer or sentence).';
  if (p.correct) return 'FACT: the last learner message produced the form CORRECTLY.';
  return `FACT: the last learner message contained the error of ${p.fired} (${outcomeOfState(k).E[p.fired!]}).`;
}
const stripArm = (t: string) => t.replace(/\[\[assess[^\]]*\]\]/gi, '').replace(/\bENARA\b/gi, 'the tutor').trim();
function judgeText(k: KState, session: 1 | 2, prevTutor: string | undefined, last: Production | undefined, learnerMsg: string, tutor: string, earlier?: string[], gapDays?: number) {
  return `KNOWLEDGE STATE (before this tutor turn):\n${stateText(k, session, earlier, gapDays)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n${prevTutor ? stripArm(prevTutor) : '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${learnerMsg}\n${factLine(last, k)}\n\nTUTOR TURN TO JUDGE:\n${stripArm(tutor)}`;
}
function taskLine(tutor: string | undefined): string | undefined {
  const lines = (tutor ?? '').split('\n').map((x) => x.trim()).filter(Boolean); if (!lines.length) return undefined;
  const gap = lines.filter((x) => x.includes('___')); return (gap.length ? gap[gap.length - 1] : lines[lines.length - 1]).slice(0, 200);
}
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

// ---------------------------------------------------------------------------------------------------------- assessment (ESL6 §7 answering; merged maps; free items to the scorer queue)
interface BankItem { id: string; type: string; prompt: string; answerKey: string; acceptedAnswers?: string[]; scoring: string; options?: string[] | Record<string, string>; matchingNote?: string; acceptedAnswersNote?: string; targetForm?: string; targetForms?: string[]; scoringNote?: string; rubric?: string | Record<string, Record<string, string>>; maxPoints?: number; objectiveIds?: string[]; l1ErrorType?: string }
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
type MapRow = { outcome: string; form: string; position: number; probes: string[]; key: string; keySource: string; note: string; graderBlind?: string };
let IBM_: Record<string, MapRow> | undefined; let WRONG_: { items: Record<string, Record<string, string>>; graderBlind?: Record<string, string> } | undefined;
const IBM = () => (IBM_ ??= Object.assign({}, JSON.parse(readFileSync(path.join(CFG6, 'ITEM_BELIEF_MAP.json'), 'utf8')).items, existsSync(path.join(CFG, 'ITEM_BELIEF_MAP_NEW.json')) ? JSON.parse(readFileSync(path.join(CFG, 'ITEM_BELIEF_MAP_NEW.json'), 'utf8')).items : {}));
const WRONG = () => (WRONG_ ??= (() => { const a = JSON.parse(readFileSync(path.join(CFG6, 'WRONG_ANSWERS.json'), 'utf8')); const p = path.join(CFG, 'WRONG_ANSWERS_NEW.json'); const b = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { items: {} }; return { items: { ...a.items, ...b.items }, graderBlind: { ...(a.graderBlind ?? {}), ...(b.graderBlind ?? {}) } }; })());
const isRubric = (it: BankItem) => it.scoring === 'rubric_0_3';
const isTF = (it: BankItem) => it.scoring === 'target_form_0_1_2';
/** rubric_0_3 criteria (ids) of a writing item: the keys of its rubric object, else 2 criteria (maxPoints 6). */
const criteriaOf = (it: BankItem): string[] => (it.rubric && typeof it.rubric === 'object' ? Object.entries(it.rubric).filter(([, v]) => v && typeof v === 'object').map(([k]) => k) : Array.from({ length: Math.round((it.maxPoints ?? 6) / 3) }, (_, i) => `c${i + 1}`));
/** rubric_0_3 notes (string-valued rubric keys such as errorCount / mastery), shown to scorers. */
const rubricNotes = (it: BankItem): string[] => (it.rubric && typeof it.rubric === 'object' ? Object.entries(it.rubric).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}: ${v}`) : []);
const maxOf = (it: BankItem) => (isRubric(it) ? it.maxPoints ?? 3 * criteriaOf(it).length : isTF(it) ? 2 : 1);
function buildQuestion(it: BankItem): any {
  const tf = isTF(it) || isRubric(it); const choice = /choice/.test(it.type);
  const q: any = { id: it.id, type: tf ? 'open-response' : choice ? 'multiple-choice' : 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, scoringNote: it.scoringNote, points: tf ? undefined : 1 };
  if (it.options) q.options = Array.isArray(it.options) ? it.options : Object.entries(it.options).map(([k, v]) => `(${k}) ${v}`); if (it.objectiveIds) q.objectiveIds = it.objectiveIds;
  if (isTF(it)) q.rubric = { criteria: [{ id: 'target_form', title: 'Target form', description: String(it.rubric ?? it.scoringNote ?? ''), maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0, description: 'target form missing or wrong' }, { id: 'l1', label: '1', points: 1, description: 'target form attempted with a minor slip' }, { id: 'l2', label: '2', points: 2, description: 'target form correct' }] }] };
  if (isRubric(it)) q.rubric = { criteria: criteriaOf(it).map((c) => ({ id: c, title: c, maxPoints: 3, levels: [0, 1, 2, 3].map((p) => ({ id: `l${p}`, label: String(p), points: p, description: (it.rubric as any)?.[c]?.[String(p)] ?? '' })) })) };
  return q;
}
/** Score one answer with the deterministic production grader (graderV2 ON, model path off). null = no rule fits (target form) or a writing item: the scorer queue. */
export function scoreAnswer(itemId: string, answer: string): { points: number | null; max: number } {
  const it = bank().items.get(itemId); if (!it) throw new Error(`no bank item ${itemId}`);
  if (isRubric(it)) return { points: null, max: maxOf(it) };   // writing: the model path in ENARA -> the scorer queue here
  const prev = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = GRADER_ENV;
  try {
    if (!graderV2On()) throw new Error('graderV2 not on');
    const q = buildQuestion(it); const [r] = gradeAnswers([q], { [q.id]: answer }) as any[];
    if (isTF(it)) return { points: r.method === 'rule' && r.points !== null ? r.points : null, max: 2 };
    return { points: r.isCorrect ? 1 : 0, max: 1 };
  } finally { process.env.ENARA_ENGINE_V2 = prev; }
}
function answerItem(k: KState, seed: string, time: string, itemId: string, map: ReturnType<typeof IBM>, wrong: ReturnType<typeof WRONG>) {
  const m = map[itemId]; const probes = m.probes.filter((p) => p === 'W1' || p === 'W2').sort() as ('W1' | 'W2')[];
  for (const w of probes) { const p = itemErrorProb(k, w, time !== 'pre' && k.afterF1); if (rand(seed, `assess-${time}`, itemId, w) < p) return { fired: w, answer: wrong.items[itemId][w], p }; }
  return { fired: null, answer: m.key, p: 0 };
}
interface ARow { answerId: string; session: string; learner: number; arm: Arm; track: 1 | 2; outcome: string; time: Time; form: string; itemId: string; position: number; type: string; scoring: string; probes: string[]; fired: string | null; answer: string; points: number | null; max: number; method: 'rule' | 'pending' | 'scorer'; criteria?: Record<string, number> }
const stateAt = (s: Sess, t: Time) => (t === 'pre' ? s.start : t === 'imm' ? s.stateAfterS1 : t === 'wk1' ? s.stateWk1 : s.stateWk4);
function summarize(rows: ARow[]): AssessSummary {
  const points = rows.reduce((a, r) => a + (r.points ?? 0), 0); const max = rows.reduce((a, r) => a + r.max, 0);
  return { form: rows[0]?.form ?? '', points, max, pct: max ? points / max : 0, pending: rows.filter((r) => r.method === 'pending').length, items: rows.length, fullItems: rows.filter((r) => r.points === r.max).length, nulls: rows.filter((r) => r.method !== 'rule').length, ...(rows.some((r) => r.criteria) ? { criteria: rows.filter((r) => r.criteria).map((r) => r.criteria!) } : {}) };
}
const assessFile = (dir: string, t: Time) => path.join(dir, `ASSESS_${t}.json`);
const readAssess = (dir: string, t: Time): ARow[] => (existsSync(assessFile(dir, t)) ? JSON.parse(readFileSync(assessFile(dir, t), 'utf8')) : []);
function resummarize(dir: string, t: Time, rows: ARow[]) {
  const by = new Map<string, ARow[]>(); for (const r of rows) { const a = by.get(r.session) ?? []; a.push(r); by.set(r.session, a); }
  for (const [key, rs] of by) { const s = load(dir, key); s.assess = { ...(s.assess ?? {}), [t]: summarize(rs) }; save(dir, s); }
}
/** Mastery on the 4-week test (PROTOCOL §6): form outcomes >= 80% of points; reading 4 of 5 items; functions 4 of 5 at full points; writing level 2+ on every criterion. */
function mastery(oid: string, sum: AssessSummary | undefined): boolean | null {
  if (!sum || sum.pending) return null;
  const sk = skillOf(oid); const course = /^EN-C-/.test(oid);
  if (!course) return sum.points >= 0.8 * sum.max - 1e-9;
  if (sk === 'RD' || sk === 'FN') return sum.fullItems >= Math.ceil(0.8 * sum.items);
  if (sk === 'WR') return (sum.criteria ?? []).length > 0 && (sum.criteria ?? []).every((c) => Object.values(c).every((v) => v >= 2));
  return sum.points >= 0.8 * sum.max - 1e-9;
}
/** Every bank item of the study's outcomes: in the merged map, the key scores full, each wrong string scores less (free items: reported only). */
function answerCheck() {
  const map = IBM(); const wrong = WRONG(); const bad: any[] = []; const blind: any[] = []; const free: string[] = []; let keys = 0; let wrongs = 0;
  for (const oid of Object.keys(outcomes())) { const forms = bank().forms.get(oid); if (!forms) { bad.push({ outcome: oid, problem: 'no item bank' }); continue; } for (const f of ['A', 'B', 'C']) for (const it of forms[f] ?? []) {
    const m = map[it.id]; if (!m) { bad.push({ item: it.id, problem: 'not in item-belief map' }); continue; }
    const k = scoreAnswer(it.id, m.key); keys++; if (k.points === null) { free.push(it.id); } else if (k.points !== k.max) bad.push({ item: it.id, problem: 'key scores less than full', key: m.key, points: k.points, max: k.max });
    for (const w of m.probes.filter((p) => p !== 'none')) {
      const ans = wrong.items[it.id]?.[w]; if (ans === undefined) { bad.push({ item: it.id, problem: `no wrong string for ${w}` }); continue; }
      wrongs++; const r = scoreAnswer(it.id, ans); if (r.points === null) continue; const sens = sensitivityOf(it as never);
      if (normaliseV2(ans, sens) === normaliseV2(m.key, sens)) bad.push({ item: it.id, belief: w, problem: 'wrong string equals the key', answer: ans });
      else if (r.points >= r.max) (m.graderBlind ? blind : bad).push({ item: it.id, belief: w, problem: 'wrong string scores full', answer: ans });
    }
  } }
  return { _label: 'SIMULATION ONLY', outcomes: Object.keys(outcomes()).length, keysChecked: keys, wrongStringsChecked: wrongs, freeItemsToScorer: free.length, failures: bad, graderBlind: blind, pass: bad.length === 0 };
}

// ---------------------------------------------------------------------------------------------------------- CEFR estimate (placementEngine.simulate; PROTOCOL §7)
const PLACEMENT = () => JSON.parse(readFileSync(path.join(REPO, 'data/assessments/placement/placement.json'), 'utf8')) as PlacementBank & { items: (PlacementItem & { options?: string[] })[] };
const LEVEL_NUM: Record<string, number> = { 'pre-A1': 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
function cefrOf(l: Learner, states: Record<string, { k: KState; seed: string }>, time: 'pre' | 'wk4') {
  const bankP = PLACEMENT(); const map = IBM(); const wrong = WRONG(); const prev = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = GRADER_ENV;
  const wrongResp = (it: PlacementItem & { options?: string[] }) => (it.options ?? []).find((o) => norm(o) !== norm(String(it.correctAnswer ?? '')) && !(it.acceptedAnswers ?? []).some((a) => norm(a) === norm(o))) ?? 'zzz';
  try {
    const r = simulate(bankP, (it) => {
      const own = it.outcomeIds.find((o) => states[o]); let ok: boolean;
      if (own) { const { k, seed } = states[own]; ok = map[it.id] && wrong.items[it.id] ? answerItem(k, seed, time, it.id, map, wrong).fired === null : k.s.C1 >= 2; }
      else { const p = it.level === 'A1' ? (l.level === 'A1' ? 0.6 : 0.8) : it.level === 'A2' ? (l.level === 'A1' ? 0.3 : 0.6) : 0.1; ok = rand(`${NS}|plc|L${l.idx}|${it.id}`) < p; }
      return ok ? String(it.correctAnswer ?? it.acceptedAnswers?.[0] ?? '') : wrongResp(it as never);
    });
    return { level: r.overall.level, confidence: r.overall.confidence, itemsUsed: r.itemsUsed, stopReason: r.stopReason };
  } finally { process.env.ENARA_ENGINE_V2 = prev; }
}

// ---------------------------------------------------------------------------------------------------------- overlap check, forbidden text
function walk(dir: string, out: string[] = []) { if (!existsSync(dir) || existsSync(path.join(dir, 'DRY_RUN'))) return out; for (const f of readdirSync(dir)) { const p = path.join(dir, f); const st = statSync(p); if (st.isDirectory()) walk(p, out); else if (/\.(json|md|txt|ts|py)$/.test(f)) out.push(p); } return out; }
function overlapCheck(studyDir: string) {
  const own = path.resolve(studyDir);
  const files = [...walk(path.join(ROOT, 'reports/exp4')), ...[1, 2, 3, 4, 5, 6].flatMap((n) => walk(path.join(ROOT, `config/agent_sim_esl${n}`)))].filter((f) => !path.resolve(f).startsWith(own + path.sep));
  const ids = new Set<number>(); const seeds = new Set<string>();
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/"learnerIdx":\s*(\d+)/g)) ids.add(Number(m[1])); for (const m of t.matchAll(/"seed":\s*"([^"]+)"/g)) seeds.add(m[1]); }
  for (const [a, b] of [[0, 35], [100, 159], [200, 211], [300, 407], [500, 619], [700, 991], [1100, 1799], [2000, 2099]]) for (let i = a; i <= b; i++) ids.add(i);
  const myIds = LEARNERS().map((l) => l.idx); const mySeeds = LEARNERS().flatMap((l) => [seedOf(l.idx, 1), seedOf(l.idx, 2)]);
  const idClash = myIds.filter((i) => ids.has(i)); const seedClash = mySeeds.filter((x) => seeds.has(x)); const nsClash = [...seeds].filter((x) => x.startsWith(`${NS}|`));
  return { _label: 'SIMULATION ONLY', filesScanned: files.length, priorLearnerIds: ids.size, priorSeeds: seeds.size, studyIds: `${Math.min(...myIds)}-${Math.max(...myIds)} (${myIds.length})`, learnerIdClash: idClash, seedClash, namespaceClash: nsClash, pass: !idClash.length && !seedClash.length && !nsClash.length };
}
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function forbidden(): RegExp[] {
  const O = Object.values(outcomes()); const map = IBM(); const res: RegExp[] = [/\b[WC][12]\b/, /strength/i, /KNOWLEDGE STATE/i, /\bprimary (wrong )?belief/i, /esl7\|L\d/, /Independent correct productions/i, /ITEM_BELIEF|WRONG_ANSWERS/];
  for (const o of O) for (const t of [...Object.values(o.C), ...Object.values(o.W), ...Object.values(o.E)]) res.push(new RegExp(esc(t), 'i'));
  for (const it of bank().items.values()) { if (!map[it.id]) continue; const c = coreOf(it.prompt).replace(/_+/g, '___').trim(); if (c.split(/\s+/).length >= 4) res.push(new RegExp(esc(c.slice(0, 200)), 'i')); const k = map[it.id].key; if (k.split(/\s+/).length >= 3) res.push(new RegExp(esc(k), 'i')); }
  return res;
}

// ---------------------------------------------------------------------------------------------------------- fit judging (PROTOCOL §7: one arm-blind case per journey)
export const COMMON_ITEMS = [
  { key: 'age_fit', text: 'Age fit: the language, length, topics and tone suit the learner\'s age.' },
  { key: 'teacher_accept', text: 'Would a qualified ESL teacher accept these lessons as reasonable lessons for this learner?' },
];
const fitItems = () => COMMON_ITEMS;
function learnerLine(l: Learner): string {
  const who = l.ageBand === 'adult' ? 'Adult learner' : l.ageBand === 'teen' ? 'Teenage learner (secondary school)' : `Child aged ${l.ageYears}`;
  return `${who} in Egypt (first language Arabic); course level ${l.level}.`;
}
const fitCaseId = (idx: number, arm: Arm) => `f${sha(`${NS}|fit|${idx}|${arm}`).slice(0, 10)}`;
function fitCaseText(dir: string, l: Learner, arm: Arm): string {
  const tr = ([1, 2] as const).map((track) => load(dir, keyOf({ learnerIdx: l.idx, arm, track })));
  const rubric = fitItems().map((x) => `- ${x.key}: ${x.text}`).join('\n');
  const parts = journeyOrder().map((x, i) => { const s = tr[x.track - 1]; const L = lessonOf(s.outcome); const conv = s.turns.filter((t) => t.session === x.session).map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${stripArm(t.tutor)}` : ''}`).join('\n'); return `----- LESSON ${i + 1} (day ${x.day}): ${L.title}. ${L.objective} -----\n${conv}`; });
  return `LEARNER: ${learnerLine(l)}\n\nRUBRIC (score each item 0, 1 or 2 over the whole journey, with a one-line reason):\n${rubric}\n\nTRANSCRIPTS (four short lessons over two weeks, two topics; each lesson is cut after its last tutor turn):\n${parts.join('\n\n')}`;
}
const fitHead = (batch: string) => `Batch ${batch}. Score every case with FIT_INSTRUCTIONS.md: each rubric item of the case 0, 1 or 2 with a one-line reason. Write {"batch":"${batch}","cases":{"<case id>":{"items":{"<item key>":{"score":0,"reason":"..."}, ...}}, ...}} to the file named in your task.\n`;
interface FitCase { items: Record<string, { score: number; reason?: string }> }
function readFit(dir: string, files: { batch: string; ids: string[] }[]) {
  const { out, missing } = readJudge<FitCase>(dir, files); const bad: string[] = []; const ok: Record<string, FitCase> = {};
  for (const [id, c] of Object.entries(out)) { const got = c?.items ?? {}; const wrong = fitItems().map((x) => x.key).filter((k) => ![0, 1, 2].includes(got[k]?.score as number)); if (wrong.length) bad.push(`${id}:${wrong.join('+')}`); else ok[id] = c; }
  return { out: ok, missing, bad };
}

// ---------------------------------------------------------------------------------------------------------- scorer queue (free items)
const uidOf = (r: Pick<ARow, 'itemId' | 'answer'>) => `u${sha(`${NS}-score|${r.itemId}|${r.answer}`).slice(0, 12)}`;
function scoreText(uid: string, itemId: string, answer: string): string {
  const it = bank().items.get(itemId)!;
  const rubric = isRubric(it) ? `SCORING: rubric 0-3 per criterion (${criteriaOf(it).join(', ')}); max ${maxOf(it)}\nRUBRIC:\n${criteriaOf(it).map((c) => `  ${c}: ${[0, 1, 2, 3].map((p) => `${p} = ${(it.rubric as any)?.[c]?.[String(p)] ?? ''}`).join('; ')}`).join('\n')}\n${rubricNotes(it).map((x) => `  NOTE ${x}\n`).join('')}` : `SCORING: target form 0/1/2\n${it.targetForm ? `TARGET FORM: ${it.targetForm}\n` : ''}${it.rubric ? `RUBRIC: ${it.rubric}\n` : ''}`;
  return `\n=========== ANSWER ${uid} ===========\nITEM TYPE: ${it.type}\n${rubric}PROMPT: ${it.prompt}\nMODEL ANSWER: ${it.answerKey}\nOTHER GOOD ANSWERS: ${(it.acceptedAnswers ?? []).join(' | ')}\nLEARNER ANSWER: ${answer === '' ? '(empty)' : answer}\n`;
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
const needDry = (dir: string) => { if (!existsSync(path.join(dir, 'DRY_RUN'))) throw new Error(`${cmd} is a dry-run command: ${dir}/DRY_RUN missing`); };
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
const allSessions = (dir: string) => sessionFiles(dir).map((f) => load(dir, f.replace(/\.json$/, '')));
const asTime = (t: string): Time => { if (!TIMES.includes(t as Time)) throw new Error('time must be pre|imm|wk1|wk4'); return t as Time; };

/** F1 for every track that has reached a point where a later state is due (idempotent): S2 start, wk1 and wk4 states. */
function runF1(dir: string, only?: Sess[]): number {
  const todo: { s: Sess; field: 'stateWk1' | 'stateS2Start' | 'stateWk4'; from: KState; days: number }[] = [];
  for (const s of only ?? allSessions(dir)) {
    const [d1, d2] = DAYS[s.track];
    if (s.stateAfterS1 && !s.stateWk1) todo.push({ s, field: 'stateWk1', from: s.stateAfterS1, days: WK1_AFTER });
    if (s.stateAfterS1 && !s.stateS2Start) todo.push({ s, field: 'stateS2Start', from: s.stateAfterS1, days: d2 - d1 });
    if (s.stateEndS2 && !s.stateWk4) todo.push({ s, field: 'stateWk4', from: s.stateEndS2, days: WK4_DAY - d2 });
  }
  const res = py<KState>(todo.map((x) => ({ op: 'f1', state: x.from, days: x.days })));
  todo.forEach((x, i) => { (x.s as any)[x.field] = res[i]; if (x.field === 'stateS2Start' && x.s.turns[x.s.turns.length - 1].session === 2 && !x.s.turns.some((t) => t.session === 2 && t.tutor !== undefined)) x.s.state = res[i]; });
  for (const s of new Set(todo.map((x) => x.s))) save(dir, s);
  return todo.length;
}
function meminit(dir: string): number {
  const pre = readAssess(dir, 'pre'); if (!pre.length) throw new Error('no ASSESS_pre.json: run "assess <dir> pre" first');
  if (pre.some((r) => r.method === 'pending')) throw new Error(`pre-test not fully scored (${pre.filter((r) => r.method === 'pending').length} free answers pending): scoreprep / scoreapply pre`);
  mkdirSync(path.join(dir, 'memory'), { recursive: true }); let n = 0;
  for (const l of LEARNERS()) for (const arm of ENGINE_ARMS) {
    if (loadMem(dir, l.idx, arm)) continue;
    process.env.ENARA_ENGINE_V2 = ENV_OF[arm];
    const m: Mem = { learnerIdx: l.idx, arm, createdAt: PRE_AT, rows: [], rec: { entries: [], liveErrors: {}, knownPoints: {} }, log: [] };
    for (const track of [1, 2] as const) {
      const key = keyOf({ learnerIdx: l.idx, arm, track }); const rows = pre.filter((r) => r.session === key).sort((a, b) => a.position - b.position);
      memFromPre(m, l.outcomes[track - 1], rows.map((r) => { const it = bank().items.get(r.itemId)!; return { itemId: r.itemId, prompt: it.prompt, q: buildQuestion(it), points: r.points ?? 0, max: r.max, method: r.method === 'rule' ? 'rule' : 'ai', answer: r.answer, fired: r.fired }; }));
    }
    m.log.push({ at: PRE_AT, event: 'pre-test released', rows: m.rows.length }); saveMem(dir, m); n++;
  }
  return n;
}

async function main() {
  if (cmd === 'overlap') { const dir = dirArg(a1); const res = overlapCheck(dir); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'OVERLAP_CHECK.json'), res); console.log(JSON.stringify(res)); }
  else if (cmd === 'answercheck') { const dir = dirArg(a1); const r = answerCheck(); mkdirSync(dir, { recursive: true }); write(path.join(dir, 'ANSWERCHECK.json'), r); console.log(JSON.stringify({ ...r, failures: r.failures.slice(0, 20), graderBlind: r.graderBlind.length })); if (!r.pass) process.exit(1); }
  else if (cmd === 'init') {
    const dir = path.resolve(a1); mkdirSync(dir, { recursive: true }); if (a2 === '--esl6-only') writeFileSync(path.join(dir, 'ESL6_ONLY'), 'The 30 ESL6 outcomes only (the new outcome files were not there at init).\n'); dirArg(dir);
    const dry = existsSync(path.join(dir, 'DRY_RUN'));
    if (sha(readFileSync(PPLUS_FILE, 'utf8')) !== PPLUS_SHA) throw new Error('P+ prompt hash differs from ESL4 (e373018e...)');
    const ac = answerCheck(); write(path.join(dir, 'ANSWERCHECK.json'), ac); if (!ac.pass && !dry) throw new Error(`answercheck failed (${ac.failures.length} failures)`);
    const ov = overlapCheck(dir); write(path.join(dir, 'OVERLAP_CHECK.json'), ov); if (!ov.pass) throw new Error(`overlap check failed: ${JSON.stringify(ov)}`);
    for (const oid of Object.keys(outcomes())) { lessonOf(oid); if (!bank().forms.get(oid)) throw new Error(`no item bank for ${oid}`); }
    mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true });
    const O = outcomes(); const todo: { l: Learner; arm: Arm; track: 1 | 2 }[] = [];
    for (const l of LEARNERS()) for (const arm of ARMS) for (const track of [1, 2] as const) if (!existsSync(sf(dir, keyOf({ learnerIdx: l.idx, arm, track })))) todo.push({ l, arm, track });
    const states = py<KState>(todo.map(({ l, track }) => { const o = O[l.outcomes[track - 1]]; return { op: 'init', form: o.key, band: l.level, primary: l.primary, ws: o.ws, sec1: o.sec1 }; }));
    todo.forEach(({ l, arm, track }, i) => { const st = states[i]; const oid = l.outcomes[track - 1]; save(dir, { arm, learnerIdx: l.idx, track, outcome: oid, seed: seedOf(l.idx, track), state: st, start: JSON.parse(JSON.stringify(st)), turns: [opener(l, oid, 1)] }); });
    const use: Record<string, number> = {}; for (const l of LEARNERS()) for (const o of l.outcomes) use[o] = (use[o] ?? 0) + 1;
    write(path.join(dir, 'cells.json'), cells()); write(path.join(dir, 'LEARNERS.json'), { _label: 'SIMULATION ONLY', outcomes: Object.keys(O).length, esl6Only: ONLY6, learners: LEARNERS(), outcomeUse: use, env: ENV_OF, calendar: { DAYS, WK1_AFTER, WK4_DAY, rounds: SLOTS } });
    const ages: Record<string, number> = {}; for (const l of LEARNERS()) ages[l.ageGroup] = (ages[l.ageGroup] ?? 0) + 1;
    console.log(`P+ hash ok; answercheck ${ac.pass ? 'pass' : `FAIL (${ac.failures.length}${dry ? ', dry run continues' : ''})`}; overlap pass; outcomes ${Object.keys(O).length}${ONLY6 ? ' (ESL6 only)' : ''}; learners ${LEARNERS().length} (${JSON.stringify(ages)}); uses per outcome ${[...new Set(Object.values(use))].join('/')}; track files ${LEARNERS().length * ARMS.length * 2}; cells ${cells().length} of ${cells()[0].keys.length / 2} learners`);
  } else if (cmd === 'plans') {
    const dir = dirArg(a1); const c: Record<string, number> = {};
    for (const s of allSessions(dir)) { if (s.arm === 'PP' || pendingRound(s) === undefined) continue; const po = planOf(dir, s, needMem(dir, s)); const k = `${s.arm} ${L_OF(s.learnerIdx).ageGroup} ${po.lesson ? `${po.lesson.shape}/${po.lesson.shapeRule}/${po.stage}${po.quickCheck ? '/QC' : ''}` : '-'} ${po.plan.primary} brief=${po.brief.items.length}`; c[k] = (c[k] ?? 0) + 1; }
    console.log(JSON.stringify(c, null, 1));
  } else if (cmd === 'tprompts') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2); if (!cell) throw new Error(`no cell ${a2}; cells: ${cells().map((c) => c.id).join(' ')}`);
    const round = a3 ? Number(a3) : currentRound(dir); if (round === undefined) { console.log('(no session needs a tutor reply)'); return; } let n = 0;
    for (const key of cell.keys) { const s = load(dir, key); if (pendingRound(s) !== round) continue; console.log(`\n########## SESSION ${key} ##########\n${tutorPrompt(dir, s)}`); n++; }
    console.log(`\n(${n} session(s) need a tutor reply in this cell, round ${round})`);
  } else if (cmd === 'promptcheck') {
    const dir = dirArg(a1); const FORB = forbidden(); const round = currentRound(dir); let n = 0; const bad: string[] = []; const pp: string[] = [];
    for (const s of allSessions(dir)) {
      if (round === undefined || pendingRound(s) !== round) continue;
      const head = s.arm === 'PP' ? tutorPrompt(dir, s).split('CONVERSATION SO FAR:')[0] : enginePart(dir, s); n++;
      const L = lessonOf(s.outcome); const own = [L.title, L.objective, ...Object.values(L.spec).flat().flatMap((x: any) => (typeof x === 'string' ? [x] : [x.prompt, x.material ?? '']))].map(norm);
      for (const re of FORB) { const m = head.match(re); if (m && !own.some((x) => x.includes(norm(m[0])))) (s.arm === 'PP' ? pp : bad).push(`${keyOf(s)}:${re}`); }
    }
    const res = { round, prompts: n, engineFindings: bad, ppFindings: pp, pass: !bad.length }; write(path.join(dir, `PROMPTCHECK_r${round}.json`), res); console.log(JSON.stringify({ ...res, engineFindings: bad.slice(0, 10), ppFindings: pp.slice(0, 10) }));
    if (bad.length) process.exit(1);
  } else if (cmd === 'tapply') {
    const dir = dirArg(a1); const cell = cells().find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0; const round = currentRound(dir);
    for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (pendingRound(s) === undefined || pendingRound(s) !== round) continue; await applyTutor(dir, s, t); save(dir, s); n++; }
    console.log('applied', n, 'of', cell.keys.length / 2);
  } else if (cmd === 'jprep') {
    const dir = dirArg(a1); const round = Number(a2); const sl = slotOf(round); const li = localOf(round); const cases: { id: string; text: string }[] = []; const keymap = path.join(dir, 'judge', `r${round}_KEY.json`); const km = existsSync(keymap) ? JSON.parse(readFileSync(keymap, 'utf8')) : {};
    for (const f of sessionFiles(dir)) {
      const key = f.replace(/\.json$/, ''); const s = load(dir, key); if (s.track !== sl.track) continue; const cur = s.turns[li]; if (!cur?.tutor || cur.judgeInput) { if (!cur || !cur.tutor) console.log('NO TUTOR REPLY', f); continue; }
      const prev = s.turns[li - 1]; const prevTutor = prev && prev.session === cur.session ? prev.tutor : undefined; const [d1, d2] = DAYS[s.track];
      cur.judgeInput = judgeText(s.state, cur.session, prevTutor, cur.production, cur.learner, cur.tutor, cur.session === 2 ? earlierItems(s) : undefined, d2 - d1); save(dir, s);
      cases.push({ id: caseId(f, round), text: cur.judgeInput }); km[caseId(f, round)] = key;
    }
    write(keymap, km);
    const files = writeBatches(path.join(dir, 'judge'), `r${round}`, cases, JUDGE_PER, NS, judgeHead); write(path.join(dir, 'judge', `r${round}_FILES.json`), files);
    console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'japply') {
    const dir = dirArg(a1); const round = Number(a2); const li = localOf(round); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
    const todo: { s: Sess; cur: Turn; j: any }[] = [];
    for (const [cid, j] of Object.entries(out)) { const s = load(dir, km[cid]); const cur = s.turns[li]; if (cur.events) continue; todo.push({ s, cur, j }); }
    const res = py<{ state: KState; applied: string[]; rejected: string[] }>(todo.map(({ s, cur, j }) => ({ op: 'apply', state: s.state, events: j.events ?? [], last: cur.production, session: cur.session, retrieval: j.retrieval ?? [] })));
    let rej = 0; const ended: Sess[] = [];
    todo.forEach(({ s, cur, j }, i) => {
      const r = res[i]; Object.assign(cur, { stateBefore: s.state, events: j.events ?? [], retrieval: j.retrieval ?? [], next_task: j.next_task, applied: r.applied, rejected: r.rejected, stateAfter: r.state }); s.state = r.state; rej += r.rejected.length;
      if (li === TURNS - 1) { s.stateAfterS1 = r.state; s.turns.push(opener(L_OF(s.learnerIdx), s.outcome, 2)); ended.push(s); }
      else if (li === 2 * TURNS - 1) { s.stateEndS2 = r.state; ended.push(s); }
      else { const p = learnerReply(s.state, j.next_task as NextTask, s.seed, li + 2); s.turns.push({ session: cur.session, learner: p.text, production: p }); }
      save(dir, s);
    });
    const f1n = runF1(dir, ended); // F1 from the last contact: the next session's start state and the wk1 / wk4 test states
    console.log('applied', todo.length, 'rejected events', rej, ended.length ? `; sessions ended ${ended.length}, F1 states ${f1n}` : '');
  } else if (cmd === 'f1') {
    const dir = dirArg(a1); console.log('F1 states added', runF1(dir));
  } else if (cmd === 'assess') {
    const dir = dirArg(a1); const time = asTime(a2); const map = IBM(); const wrong = WRONG(); const rows: ARow[] = []; let pending = 0;
    for (const s of allSessions(dir)) {
      const k = stateAt(s, time); if (!k) throw new Error(`${keyOf(s)}: no state for ${time} (imm/wk1 need session 1 judged; wk4 needs session 2 judged)`);
      const form = FORM_OF[time]; const items = bank().forms.get(s.outcome)![form];
      for (const it of items) {
        const m = map[it.id]; if (!m) throw new Error(`${it.id} not in the item-belief map`);
        const a = answerItem(k, s.seed, time, it.id, map, wrong); const sc = scoreAnswer(it.id, a.answer); if (sc.points === null) pending++;
        rows.push({ answerId: `a${sha(`${NS}|ans|${keyOf(s)}|${time}|${it.id}`).slice(0, 12)}`, session: keyOf(s), learner: s.learnerIdx, arm: s.arm, track: s.track, outcome: s.outcome, time, form, itemId: it.id, position: m.position, type: it.type, scoring: it.scoring, probes: m.probes, fired: a.fired, answer: a.answer, points: sc.points, max: sc.max, method: sc.points === null ? 'pending' : 'rule' });
      }
    }
    write(assessFile(dir, time), rows); resummarize(dir, time, rows);
    let mem = ''; if (time === 'pre' && !pending) mem = `; memory files ${meminit(dir)}`;
    console.log(`assess ${time}: answers ${rows.length}, tracks ${new Set(rows.map((r) => r.session)).size}, free answers to the scorer queue ${pending}${mem}`);
  } else if (cmd === 'scoreprep') {
    const dir = dirArg(a1); const time = asTime(a2); const rows = readAssess(dir, time).filter((r) => r.method === 'pending');
    const uniq = [...new Map(rows.map((r) => [uidOf(r), r] as const)).entries()]; const sub = path.join(dir, 'score', time); mkdirSync(sub, { recursive: true });
    const order = uniq.sort((x, y) => (sha(`${NS}-score|${x[0]}`) < sha(`${NS}-score|${y[0]}`) ? -1 : 1)); const files: { batch: string; ids: string[] }[] = [];
    for (let b = 0; b * SCORE_PER < order.length; b++) {
      const batch = `sc_${time}_j${String(b + 1).padStart(2, '0')}`; const chunk = order.slice(b * SCORE_PER, (b + 1) * SCORE_PER);
      writeFileSync(path.join(sub, `${batch}.md`), `Batch ${batch}. Score every answer with docs/SCORING_RUBRIC.md and the item's rubric. Write {"batch":"${batch}","scores":{"<answer id>": <points 0-2 for a target-form item> | {"criteria":{"<criterion>":<0-3>, ...}} for a rubric item, ...}} to the file named in your task.\n` + chunk.map(([u, r]) => scoreText(u, r.itemId, r.answer)).join(''));
      files.push({ batch, ids: chunk.map(([u]) => u) });
    }
    write(path.join(sub, 'FILES.json'), files); write(path.join(sub, 'KEY.json'), Object.fromEntries(order.map(([u, r]) => [u, { itemId: r.itemId, scoring: r.scoring }])));
    console.log(`scorer queue ${time}: pending answers ${rows.length}, distinct item+answer pairs ${uniq.length}, batches ${files.map((f) => f.batch).join(' ') || '(none)'}`);
  } else if (cmd === 'scoreapply') {
    const dir = dirArg(a1); const time = asTime(a2); const sub = path.join(dir, 'score', time); const files = existsSync(path.join(sub, 'FILES.json')) ? JSON.parse(readFileSync(path.join(sub, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[] : [];
    const got: Record<string, any> = {}; const missing: string[] = []; const bad: string[] = [];
    for (const f of files) { const p = path.join(sub, `${f.batch}.json`); if (!existsSync(p)) { missing.push(f.batch); continue; } const d = JSON.parse(readFileSync(p, 'utf8')); for (const id of f.ids) { if (d.scores?.[id] === undefined) missing.push(`${f.batch}:${id}`); else got[id] = d.scores[id]; } }
    const rows = readAssess(dir, time); let n = 0;
    for (const r of rows) {
      if (r.method !== 'pending') continue; const v = got[uidOf(r)]; if (v === undefined) continue; const it = bank().items.get(r.itemId)!;
      if (isRubric(it)) { const c = v?.criteria ?? v; const ids = criteriaOf(it); if (!c || typeof c !== 'object' || !ids.every((k) => [0, 1, 2, 3].includes(c[k]))) { bad.push(uidOf(r)); continue; } r.criteria = Object.fromEntries(ids.map((k) => [k, c[k]])); r.points = ids.reduce((a, k) => a + c[k], 0); }
      else { if (![0, 1, 2].includes(v)) { bad.push(uidOf(r)); continue; } r.points = v; }
      r.method = 'scorer'; n++;
    }
    write(assessFile(dir, time), rows); resummarize(dir, time, rows); const left = rows.filter((r) => r.method === 'pending').length;
    let mem = ''; if (time === 'pre' && !left) mem = `; memory files ${meminit(dir)}`;
    console.log(`scores applied ${n}; still pending ${left}; missing ${missing.length}; bad ${bad.length}${mem}`); if (missing.length || bad.length) { console.log('MISSING', missing.slice(0, 20).join(' '), 'BAD', bad.slice(0, 20).join(' ')); process.exit(1); }
  } else if (cmd === 'meminit') {
    const dir = dirArg(a1); console.log('memory files created', meminit(dir));
  } else if (cmd === 'post') {
    const dir = dirArg(a1); const rows: any[] = []; const cefr: any[] = []; const byKey = new Map(allSessions(dir).map((s) => [keyOf(s), s] as const));
    const refs = new Map(((JSON.parse(readFileSync(path.join(REPO, 'data/outcomes/outcomes.json'), 'utf8')).outcomes ?? []) as { id: string; reference?: string }[]).map((o) => [o.id, o.reference ?? null]));
    for (const l of LEARNERS()) for (const arm of ARMS) {
      const tr = ([1, 2] as const).map((track) => byKey.get(keyOf({ learnerIdx: l.idx, arm, track }))!);
      const st = (t: 'pre' | 'wk4') => Object.fromEntries(tr.map((s) => [s.outcome, { k: (t === 'pre' ? s.start : s.stateWk4)!, seed: s.seed }]));
      const cPre = cefrOf(l, st('pre'), 'pre'); const cWk4 = tr.every((s) => s.stateWk4) ? cefrOf(l, st('wk4'), 'wk4') : null;
      const move = cWk4 && cPre.level && cWk4.level ? LEVEL_NUM[cWk4.level] - LEVEL_NUM[cPre.level] : null;
      cefr.push({ learner: l.idx, arm, level: l.level, ageGroup: l.ageGroup, pre: cPre, wk4: cWk4, move });
      for (const s of tr) {
        const a = s.assess ?? {}; const pct = (t: Time) => (a[t] && !a[t]!.pending ? a[t]!.pct : null);
        rows.push({ learner: l.idx, arm, track: s.track, outcome: s.outcome, skill: skillOf(s.outcome), level: l.level, ageGroup: l.ageGroup, ageBand: l.ageBand, ageYears: l.ageYears ?? null, pre: pct('pre'), imm: pct('imm'), wk1: pct('wk1'), wk4: pct('wk4'), assess: a, mastery: mastery(s.outcome, a.wk4), cefrPre: cPre.level, cefrWk4: cWk4?.level ?? null, cefrMove: move, reference: refs.get(s.outcome) ?? null, rounds: s.turns.filter((t) => t.events).length, start: s.start.s, afterS1: s.stateAfterS1?.s ?? null, endS2: s.stateEndS2?.s ?? null, wk4State: s.stateWk4?.s ?? null });
      }
    }
    write(path.join(dir, 'POST.json'), rows); write(path.join(dir, 'CEFR.json'), cefr);
    console.log('post rows', rows.length, 'cefr rows', cefr.length, 'missing wk4', rows.filter((r) => r.wk4 === null).length);
  } else if (cmd === 'tags') {
    const dir = dirArg(a1); const rows: any[] = []; const stuck: any[] = []; const indep: any[] = [];
    for (const s of allSessions(dir)) {
      const l = L_OF(s.learnerIdx); const base = { learner: s.learnerIdx, arm: s.arm, track: s.track, outcome: s.outcome, skill: skillOf(s.outcome), level: l.level, ageGroup: l.ageGroup };
      s.turns.forEach((t, k) => { if (t.tutor === undefined) return; rows.push({ ...base, turn: k + 1, session: t.session, round: roundOf(s.track, k), planner: t.planner ?? null, brief: t.brief ?? null, memEvents: t.memEvents ?? 0, diagnosis: t.diagnosis ?? null, verdict: t.engineVerdict ?? null, moves: t.moves ?? [], strand: t.strand ?? null, ruleLine: t.ruleLine ?? null, closingAsk: t.closingAsk ?? null, markerStatus: t.markerStatus ?? null, leakRaw: t.leakRaw ?? 0, leakFinal: t.leakFinal ?? 0, earlyLeakRaw: t.earlyLeakRaw ?? 0, earlyLeakFinal: t.earlyLeakFinal ?? 0, lateAnswerFinal: t.lateAnswerFinal ?? 0, answerReleased: t.answerReleased ?? false, ev5: t.ev5 ?? {}, twoAsks: t.twoAsks ?? false, twoAsksRaw: t.twoAsksRaw ?? false, guardRemoved: t.guardRemoved ?? 0, words: (t.tutor ?? '').split(/\s+/).filter(Boolean).length, production: t.production, events: t.events ?? null, applied: t.applied ?? [], rejected: t.rejected ?? [] }); });
      for (const ses of [1, 2] as const) {
        const st = s.turns.filter((t) => t.session === ses); let runKey: string | undefined; let run = 0; let startTurn = 0;
        const flush = () => { if (run >= 3) stuck.push({ ...base, session: ses, task: runKey, length: run, startTurn }); };
        for (let k = 1; k < st.length; k++) {
          const prevT = st[k - 1]; const p = st[k].production; if (prevT.tutor === undefined) break;
          const sh = shownItem(prevT.tutor, s.outcome); const nt = prevT.next_task as NextTask | undefined; const key = sh ? `item:${sh.id}` : nt && nt.kind !== 'none' ? `task:${nt.kind}:${norm(String(nt.correct ?? ''))}` : undefined;
          const answer = p.kind === 'blank' || p.kind === 'sentence';
          if (answer && key && !p.correct) { if (key === runKey) run++; else { flush(); runKey = key; run = 1; startTurn = s.turns.indexOf(st[k]) + 1; } } else { flush(); runKey = undefined; run = 0; }
        }
        flush();
        const seen = new Set<string>(); let indepNew = 0; let firstTries = 0;
        for (let k = 1; k < st.length; k++) {
          const prevT = st[k - 1]; const p = st[k].production; if (prevT.tutor === undefined) break;
          const sh = shownItem(prevT.tutor, s.outcome); const nt = prevT.next_task as NextTask | undefined; const key = sh ? `item:${sh.id}` : nt && nt.kind !== 'none' ? `task:${nt.kind}:${norm(String(nt.correct ?? ''))}` : undefined;
          if (!key || !(p.kind === 'blank' || p.kind === 'sentence') || seen.has(key)) { if (key) seen.add(key); continue; }
          seen.add(key); firstTries++;
          const target = nt && nt.correct ? norm(String(nt.correct)) : '';
          const shown = ((prevT.leakFinal as number | undefined) ?? 0) > 0 || (!sh && target.split(' ').length >= 3 && ` ${norm(prevT.tutor)} `.includes(` ${target} `));
          if (p.correct && !shown) indepNew++;
        }
        indep.push({ ...base, session: ses, firstTries, indepNew });
      }
    }
    write(path.join(dir, 'TAGS.json'), rows); write(path.join(dir, 'STUCK.json'), stuck); write(path.join(dir, 'INDEP.json'), indep); console.log('turn rows', rows.length, 'stuck runs', stuck.length);
  } else if (cmd === 'agreeprep') {
    const dir = dirArg(a1); const cases: { id: string; text: string }[] = []; const key: Record<string, string> = {};
    for (let round = 1; round <= ROUNDS; round++) {
      const p = path.join(dir, 'judge', `r${round}_KEY.json`); if (!existsSync(p)) throw new Error(`round ${round} not judged`); const li = localOf(round);
      for (const [cid, sk] of Object.entries(JSON.parse(readFileSync(p, 'utf8'))) as [string, string][]) { if (rand(`${NS}-agree`, cid) >= AGREE_SHARE) continue; const t = load(dir, sk).turns[li]; if (!t.judgeInput || !t.events) throw new Error(`${sk} round ${round}: not applied`); const aid = `a${cid.slice(1)}`; cases.push({ id: aid, text: t.judgeInput }); key[aid] = `${sk}|${round}|${cid}`; }
    }
    mkdirSync(path.join(dir, 'agree'), { recursive: true });
    const files = writeBatches(path.join(dir, 'agree'), 'ag', cases, JUDGE_PER, `${NS}-agree`, judgeHead); write(path.join(dir, 'agree', 'ag_FILES.json'), files); write(path.join(dir, 'agree', 'ag_KEY.json'), key);
    console.log('agreement cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'agreescore') {
    const dir = dirArg(a1); const files = JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_FILES.json'), 'utf8')); const key = JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_KEY.json'), 'utf8'));
    const { out, missing } = readJudge(path.join(dir, 'agree'), files);
    const pairs = Object.entries(out).map(([aid, j2]) => { const [sk, r] = key[aid].split('|'); const t = load(dir, sk).turns[localOf(Number(r))]; return { round: Number(r), t, j2: j2 as any }; });
    const ops = pairs.flatMap(({ t, j2 }) => [{ op: 'apply', state: t.stateBefore, events: t.events ?? [], last: t.production, session: t.session, retrieval: t.retrieval ?? [] }, { op: 'apply', state: t.stateBefore, events: j2.events ?? [], last: t.production, session: t.session, retrieval: j2.retrieval ?? [] }]);
    const r = py<{ state: KState }>(ops); const cmp = py<string>(r.map((x) => ({ op: 'cmp', state: x.state })));
    const res: any = { _label: 'SIMULATION ONLY', rounds: {}, cases: pairs.length, same: 0, missing: missing.length, comparedOn: 'strengths, independent counts and counted retrievals after applying each judge\'s events (esl6_forget.comparable)' };
    pairs.forEach((p, i) => { const x = (res.rounds[p.round] ??= { cases: 0, same: 0 }); x.cases++; if (cmp[2 * i] === cmp[2 * i + 1]) { x.same++; res.same++; } });
    res.agreement = res.cases ? +(res.same / res.cases).toFixed(4) : null; res.pass = res.missing === 0 && res.agreement !== null && res.agreement >= 0.85;
    write(path.join(dir, 'JUDGE_AGREEMENT.json'), res); console.log(JSON.stringify({ ...res, rounds: undefined }));
  } else if (cmd === 'fitprep') {
    const dir = dirArg(a1); const cases: { id: string; text: string }[] = []; const key: Record<string, any> = {}; const again: { id: string; text: string }[] = []; const akey: Record<string, any> = {};
    for (const l of LEARNERS()) for (const arm of ARMS) {
      for (const track of [1, 2] as const) { const s = load(dir, keyOf({ learnerIdx: l.idx, arm, track })); if (s.turns.filter((t) => t.tutor !== undefined).length < 2 * TURNS) throw new Error(`${keyOf(s)}: journey not finished`); }
      const id = fitCaseId(l.idx, arm); const text = fitCaseText(dir, l, arm); cases.push({ id, text }); key[id] = { learner: l.idx, arm, ageGroup: l.ageGroup, level: l.level };
      if (rand(`${NS}-fitagree`, id) < FIT_AGREE_SHARE) { const gid = `g${id.slice(1)}`; again.push({ id: gid, text }); akey[gid] = { ...key[id], of: id }; }
    }
    for (const [sub, cs, k, tag] of [['fit', cases, key, 'fit'], ['fitagree', again, akey, 'fag']] as const) {
      mkdirSync(path.join(dir, sub), { recursive: true }); const files = writeBatches(path.join(dir, sub), tag, cs as any, FIT_PER, `${NS}-${sub}`, fitHead);
      write(path.join(dir, sub, 'FILES.json'), files); write(path.join(dir, sub, 'KEY.json'), k); console.log(sub, 'cases', cs.length, 'batches', files.length);
    }
  } else if (cmd === 'fitapply') {
    const dir = dirArg(a1); const key = JSON.parse(readFileSync(path.join(dir, 'fit', 'KEY.json'), 'utf8')); const akey = JSON.parse(readFileSync(path.join(dir, 'fitagree', 'KEY.json'), 'utf8'));
    const main = readFit(path.join(dir, 'fit'), JSON.parse(readFileSync(path.join(dir, 'fit', 'FILES.json'), 'utf8')));
    const ag = readFit(path.join(dir, 'fitagree'), JSON.parse(readFileSync(path.join(dir, 'fitagree', 'FILES.json'), 'utf8')));
    if (main.missing.length || main.bad.length || ag.missing.length || ag.bad.length) { console.log('MISSING', [...main.missing, ...ag.missing].join(' '), 'BAD', [...main.bad, ...ag.bad].join(' ')); process.exit(1); }
    const rows = Object.entries(main.out).map(([id, c]) => ({ id, ...key[id], items: Object.fromEntries(fitItems().map((x) => [x.key, c.items[x.key].score])), reasons: Object.fromEntries(fitItems().map((x) => [x.key, c.items[x.key].reason ?? ''])) }));
    let n = 0; let same = 0; let within1 = 0;
    for (const [gid, c] of Object.entries(ag.out)) { const m = main.out[akey[gid].of]; for (const x of fitItems()) { const d = Math.abs(c.items[x.key].score - m.items[x.key].score); n++; if (d === 0) same++; if (d <= 1) within1++; } }
    write(path.join(dir, 'FIT.json'), rows);
    const res = { _label: 'SIMULATION ONLY', cases: Object.keys(ag.out).length, itemScores: n, exact: same, agreement: n ? +(same / n).toFixed(4) : null, within1: n ? +(within1 / n).toFixed(4) : null, rule: 'exact agreement on rubric item scores >= 0.85', pass: n > 0 && same / n >= 0.85 };
    write(path.join(dir, 'FIT_AGREEMENT.json'), res); console.log('fit rows', rows.length, JSON.stringify(res));
  } else if (cmd === 'analyze') {
    const dir = dirArg(a1); const r = spawnSync('python3', ['-I', path.join(ROOT, 'src/offline/esl7_analyze.py'), dir], { encoding: 'utf8' }); process.stdout.write(r.stdout); if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
  } else if (cmd === 'status') {
    const dir = dirArg(a1); const c: Record<string, number> = {};
    for (const s of allSessions(dir)) { const k = `${s.arm} o${s.track}: ${s.turns.filter((t) => t.tutor !== undefined).length} replies / ${s.turns.filter((t) => t.events).length} judged${s.stateWk1 ? ' / wk1' : ''}${s.stateWk4 ? ' / wk4' : ''} / tests ${TIMES.filter((t) => s.assess?.[t] && !s.assess[t]!.pending).join(',') || '-'}`; c[k] = (c[k] ?? 0) + 1; }
    const mem = existsSync(path.join(dir, 'memory')) ? readdirSync(path.join(dir, 'memory')).length : 0;
    console.log(JSON.stringify({ currentRound: currentRound(dir) ?? 'none pending', memoryFiles: mem, tracks: c }, null, 1));
  }
  // ------------------------------------------------------------------------------------------------ dry-run helpers (no agents; refused outside a DRY_RUN dir)
  else if (cmd === 'dryreply') {
    const dir = dirArg(a1); needDry(dir); const round = Number(a2); if (currentRound(dir) !== round) throw new Error(`current round is ${currentRound(dir)}, not ${round}`); let n = 0;
    for (const c of cells()) {
      const ans: Record<string, string> = {};
      for (const key of c.keys) {
        const s = load(dir, key); if (pendingRound(s) !== round) continue; const L = lessonOf(s.outcome); const it = L.spec.items[(round - 1) % Math.max(1, L.spec.items.length)];
        const task = it ? `${coreOf(it.prompt)}${(it as any).material ? ` Text: ${(it as any).material}` : ''}` : `Write one sentence about your day. Use ${outcomes()[s.outcome].topic}.`; const p = s.turns[s.turns.length - 1].production;
        const v = p.kind === 'blank' || p.kind === 'sentence' ? (p.correct ? 'CORRECT relevance=ACTIVE_ITEM' : 'INCORRECT relevance=ACTIVE_ITEM') : 'NOT_EVALUATED relevance=NO_ACTIVE_ITEM';
        ans[key] = `${s.arm === 'PP' ? '' : `[[assess verdict=${v} next=NEW_ITEM${round % 2 ? ' focus=1' : ''}]]\n`}${p.kind === 'none' ? 'Good.' : 'Thanks, noted.'} ${L.spec.examples[0] ?? ''}\nNow you: ${task}`;
      }
      const p = path.join(dir, 'dry_answers', `${c.id}_r${round}.json`); mkdirSync(path.dirname(p), { recursive: true }); write(p, ans);
      for (const [key, t] of Object.entries(ans)) { const s = load(dir, key); await applyTutor(dir, s, t); save(dir, s); n++; }
    }
    console.log('dry replies applied', n);
  } else if (cmd === 'dryjudge' || cmd === 'dryagree') {
    const dir = dirArg(a1); needDry(dir); const sub = cmd === 'dryjudge' ? 'judge' : 'agree'; const round = Number(a2);
    const files = JSON.parse(readFileSync(path.join(dir, sub, cmd === 'dryjudge' ? `r${round}_FILES.json` : 'ag_FILES.json'), 'utf8')) as { batch: string; ids: string[] }[];
    const km = cmd === 'dryjudge' ? JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')) : JSON.parse(readFileSync(path.join(dir, 'agree', 'ag_KEY.json'), 'utf8'));
    for (const f of files) {
      const cases: Record<string, any> = {};
      for (const id of f.ids) {
        const [sk, r] = cmd === 'dryjudge' ? [km[id], round] : [km[id].split('|')[0], Number(km[id].split('|')[1])]; const s = load(dir, sk); const t = s.turns[localOf(r)]; const o = outcomes()[s.outcome];
        const ok = t.production.kind !== 'none' && t.production.correct; const cs = o.ws.map((w) => PAIR[w]); const it = shownItem(t.tutor ?? '', s.outcome);
        const ev = [{ rule: 'R1', belief: 'W1', quote: 'rule' }, ...(ok ? cs.flatMap((c) => [{ rule: 'R3', belief: c }, ...(cmd === 'dryagree' && rand('dryagree', id) < 0.1 ? [] : [{ rule: 'R4', belief: c }])]) : [])];
        cases[id] = { events: ev, retrieval: t.session === 2 && ok ? cs : [], next_task: { kind: 'blank', probes: o.ws, correct: it?.acceptedAnswers?.[0] ?? `ok-${r}`, errors: Object.fromEntries(o.ws.map((w) => [w, `${w.toLowerCase()}wrongword`])) } };
      }
      write(path.join(dir, sub, `${f.batch}.json`), { batch: f.batch, cases });
    }
    console.log(`${cmd} wrote`, files.length, 'batches');
  } else if (cmd === 'dryscore') {
    // scripted scorer: the model answer scores full, anything else 0 (target form) or 1 per criterion (rubric)
    const dir = dirArg(a1); needDry(dir); const time = asTime(a2); const sub = path.join(dir, 'score', time); if (!existsSync(path.join(sub, 'FILES.json'))) { console.log('no scorer batches'); return; }
    const files = JSON.parse(readFileSync(path.join(sub, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[]; const key = JSON.parse(readFileSync(path.join(sub, 'KEY.json'), 'utf8'));
    const ansOf = new Map(readAssess(dir, time).map((r) => [uidOf(r), r.answer] as const));
    for (const f of files) write(path.join(sub, `${f.batch}.json`), { batch: f.batch, scores: Object.fromEntries(f.ids.map((u) => { const it = bank().items.get(key[u].itemId)!; const full = norm(ansOf.get(u) ?? '') === norm(IBM()[it.id].key); return [u, isRubric(it) ? { criteria: Object.fromEntries(criteriaOf(it).map((c) => [c, full ? 3 : 1])) } : full ? 2 : 0]; })) });
    console.log('dry scorer files written', files.length);
  } else if (cmd === 'dryfit') {
    const dir = dirArg(a1); needDry(dir);
    for (const sub of ['fit', 'fitagree'] as const) {
      const key = JSON.parse(readFileSync(path.join(dir, sub, 'KEY.json'), 'utf8')); const files = JSON.parse(readFileSync(path.join(dir, sub, 'FILES.json'), 'utf8')) as { batch: string; ids: string[] }[];
      for (const f of files) write(path.join(dir, sub, `${f.batch}.json`), { batch: f.batch, cases: Object.fromEntries(f.ids.map((id) => { const base = sub === 'fit' ? id : key[id].of; return [id, { items: Object.fromEntries(fitItems().map((x) => { let v = Math.floor(rand('dryfit', base, x.key) * 3); if (sub === 'fitagree' && rand('dryfitagree', id, x.key) < 0.1) v = (v + 1) % 3; return [x.key, { score: v, reason: 'dry run' }]; })) }]; })) });
    }
    console.log('dry fit files written');
  } else {
    console.log('commands: init | overlap | answercheck | status | plans | tprompts | promptcheck | tapply | jprep | japply | f1 | assess | scoreprep | scoreapply | meminit | post | tags | agreeprep | agreescore | fitprep | fitapply | analyze | dryreply | dryjudge | dryagree | dryscore | dryfit');
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
