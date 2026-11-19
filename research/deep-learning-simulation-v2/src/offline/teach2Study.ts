// SIMULATION ONLY. NO API. TRACK 2 teaching check (TUTOR_TRACK2_TEACHING_PLAN.md, "How it's tested"), offline harness. Built from esl6Study.ts (same P+ baseline,
// same engine glue, same simulated learner rules and judge text) with: NEW learners and seeds (ids 1100-1279 main, 1300-1389 kids; namespace teach2), the
// TRACK 2 lessons (teach2Fixtures.ts: ESL6 lessons + the four approved data fixes), arm LE = ESL6 LE + the teach2 bundle (ruleBank, exampleGuard,
// feedbackLadder, methodSelect, kidsBand), turns 1-3 of session 1 only. ESL6 sessions, rounds and files are NOT read or written (overlap check refuses clashes).
//   M1: the teaching plan is re-selected EVERY turn from the session record (previous plan, ENARA's verdicts, methods tried without improvement); logged per turn.
//   M2: misconceptions come only from the learner's pre-test errors (ENARA's graded pre-test, form of the learner's sequence; error counts only, never beliefs).
//   Example guard: hits on the RAW reply are counted (both arms, same pool); LE gets the production fallback (sentence removed); PP is never changed.
//   Kids set: 30 outcomes x 3 age bands (child / teen / adult, from a staff-entered birth date: decision 4) x 3 turns, LE arm only; deterministic ageFit
//   readability checks + 3 age-fit judges per turn.
// Run from backend/:  npx tsx ../research/deep-learning-simulation-v2/src/offline/teach2Study.ts <cmd> <dir> ...
// Commands: datacheck | overlap <dir> | init <dir> <main|kids> | tprompts <dir> <cell> | cells <dir> | promptcheck <dir> | tapply <dir> <cell> <answers.json>
//           | jprep <dir> <round> | japply <dir> <round> | kprep <dir> <round> | kapply <dir> <round> | report <dir> [kidsDir]
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst, hasTwoAsks,
  esl5Adjust, independentSuccessItem, buildTeach2, successesThisSession, type LanguageTeachingContext,
} from '../../../../backend/src/services/languageTeachingContext';
import { stripAssessmentMarkers } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy, completeLanguageTurn, exampleGuardCheck } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { applyTurn, summarizeProfile, applyLiveErrors, applyKnownPoints, liveErrorTypes, type Esl5Record } from '../../../../backend/src/services/learnerLanguageProfile';
import { gradeAnswers } from '../../../../backend/src/services/grading';
import { graderV2On } from '../../../../backend/src/services/graderV2';
import { ruleBankEntry } from '../../../../backend/src/services/ruleBank';
import { ageFit, checkLessonData, exampleGuardHits, poolFromBankItems, poolFromLessonItems, type FitBand } from '../../../../backend/src/services/teachingQuality';
import { STRATEGY_BY_ID, GUIDE_METHODS } from '../../../../backend/src/services/strategyRegistry';
import { LESSONS_T2, OUTCOME_IDS, FIXED_OUTCOMES } from './teach2Fixtures';
import { LESSONS6 } from './esl6Fixtures';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rand = (...parts: (string | number)[]) => parseInt(sha(parts.join('|')).slice(0, 8), 16) / 2 ** 32;
type Arm = 'PP' | 'LE';
const ROOT = path.join(__dirname, '../..');
const REPO = path.join(ROOT, '../..');
const CFG6 = path.join(ROOT, 'config/agent_sim_esl6');
const PPLUS_FILE = path.join(ROOT, 'config/agent_sim_esl4/PPLUS_PROMPT.txt');
const PPLUS_SHA = 'e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472';
const PPLUS = readFileSync(PPLUS_FILE, 'utf8').trim();
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
// LE = the ESL6 LE arm + the TRACK 2 bundle. PP = the frozen P+ prompt (no engine).
export const ENV_OF: Record<Arm, string> = { PP: '', LE: `${BASE},levelExplicit,esl5,graderV2,teach2` };
const GRADER_ENV = 'graderV2';
const TURNS = 3; const DAY = 86_400_000; const T0 = Date.parse('2027-05-03T09:00:00Z');
const LESSON_ID = 'lsn';
const NS = 'teach2';
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const coreOf = (prompt: string) => prompt.replace(/\s*\(answer with only the (missing word|verb)\)\s*$/i, '').replace(/^[^:]*:\s*/, '');
const dirArg = (d: string) => path.resolve(d);
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));

// ---------------------------------------------------------------------------------------------------------- python bridge (ESL6 rules, unchanged)
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
    elif k == 'apply':
        st, a, r = F.apply_events(op['state'], op['events'], op['last'], op['session'], op['retrieval']); out.append({'state': st, 'applied': a, 'rejected': r})
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
const itemErrorProb = (k: KState, w: 'W1' | 'W2') => pWrong(k.s[w]);

// ---------------------------------------------------------------------------------------------------------- learners (NEW: not ESL6)
interface Learner { idx: number; set: 'main' | 'kids'; outcome: string; band: 'A1' | 'A2'; status: string; primary: 'W1' | 'W2'; preForm: 'A' | 'B' | 'C'; age?: FitBand }
const AGE_OF: Record<FitBand, { birthDate: string; grade: number }> = { child: { birthDate: '2016-09-10', grade: 5 }, teen: { birthDate: '2012-02-20', grade: 9 }, adult: { birthDate: '1996-04-02', grade: 18 } };
function buildLearners(): Learner[] {
  const out: Learner[] = []; const O = outcomes();
  OUTCOME_IDS.forEach((oid, b) => {
    const two = O[oid].ws.length === 2; const a1 = /^EN-F-A1-/.test(oid);
    // main: 6 per outcome (the ESL6 block-of-6 pattern: A1 for the first 3 of an A1 outcome; not_assessed / emerging; primary belief W2 on 2,4,5)
    for (let p = 0; p < 6; p++) out.push({ idx: 1100 + 6 * b + p, set: 'main', outcome: oid, band: a1 && p < 3 ? 'A1' : 'A2', status: p < 3 ? 'not_assessed' : 'emerging', primary: two && [2, 4, 5].includes(p) ? 'W2' : 'W1', preForm: (['A', 'B', 'C'] as const)[p % 3] });
    // kids: one learner per age band (A1 for A1 outcomes, else A2; not_assessed; primary W1)
    (['child', 'teen', 'adult'] as FitBand[]).forEach((age, k) => out.push({ idx: 1300 + 3 * b + k, set: 'kids', outcome: oid, band: a1 ? 'A1' : 'A2', status: 'not_assessed', primary: 'W1', preForm: (['A', 'B', 'C'] as const)[k], age }));
  });
  return out;
}
let LRN: Learner[] | undefined;
const LEARNERS = () => (LRN ??= buildLearners());
const L_OF = (idx: number): Learner => LEARNERS().find((l) => l.idx === idx)!;
const seedOf = (idx: number) => `${NS}|L${idx}`;

// ---------------------------------------------------------------------------------------------------------- assessment bank (pre-test and the guard pool; server-side only)
interface BankItem { id: string; type: string; prompt: string; answerKey: string; acceptedAnswers?: string[]; scoring: string; options?: string[]; matchingNote?: string; acceptedAnswersNote?: string; targetForm?: string; targetForms?: string[]; scoringNote?: string; rubric?: string; objectiveIds?: string[] }
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
const bankItemsOf = (oid: string): BankItem[] => Object.values(bank().forms.get(oid) ?? {}).flat();
const IBM = () => JSON.parse(readFileSync(path.join(CFG6, 'ITEM_BELIEF_MAP.json'), 'utf8')).items as Record<string, { outcome: string; form: string; position: number; probes: string[]; key: string }>;
const WRONG = () => JSON.parse(readFileSync(path.join(CFG6, 'WRONG_ANSWERS.json'), 'utf8')) as { items: Record<string, Record<string, string>> };
function buildQuestion(it: BankItem): any {
  const tf = it.scoring === 'target_form_0_1_2'; const choice = /choice/.test(it.type);
  const q: any = { id: it.id, type: tf ? 'open-response' : choice ? 'multiple-choice' : 'short-answer', text: it.prompt, prompt: it.prompt, correctAnswer: it.answerKey, answerKey: it.answerKey, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote, acceptedAnswersNote: it.acceptedAnswersNote, targetForm: it.targetForm, targetForms: it.targetForms, scoring: it.scoring, scoringNote: it.scoringNote, points: tf ? undefined : 1 };
  if (it.options) q.options = it.options; if (it.objectiveIds) q.objectiveIds = it.objectiveIds;
  if (tf) q.rubric = { criteria: [{ id: 'target_form', title: 'Target form', description: String(it.rubric ?? it.scoringNote ?? ''), maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0 }, { id: 'l1', label: '1', points: 1 }, { id: 'l2', label: '2', points: 2 }] }] };
  return q;
}
function scoreAnswer(itemId: string, answer: string): { points: number | null; max: number } {
  const prev = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = GRADER_ENV;
  try {
    if (!graderV2On()) throw new Error('graderV2 not on');
    const it = bank().items.get(itemId)!; const q = buildQuestion(it); const [r] = gradeAnswers([q], { [q.id]: answer }) as any[];
    if (it.scoring === 'target_form_0_1_2') return { points: r.method === 'rule' && r.points !== null ? r.points : null, max: 2 };
    return { points: r.isCorrect ? 1 : 0, max: 1 };
  } finally { process.env.ENARA_ENGINE_V2 = prev; }
}

// ---------------------------------------------------------------------------------------------------------- sessions
interface Production { kind: 'blank' | 'sentence' | 'rule' | 'none'; correct?: boolean; fired?: 'W1' | 'W2'; text: string }
interface NextTask { kind: 'blank' | 'sentence' | 'rule' | 'none'; probes?: string[]; correct?: string; errors?: Record<string, string> }
interface Turn { learner: string; production: Production; tutor?: string; raw?: string; [k: string]: any }
interface Rec { entries: any[]; liveErrors: Record<string, { seen: number; lastCorrect?: boolean }>; knownPoints: Record<string, number> }
interface PlanLog { primary: string; supporting: string[]; reinforcement?: string; modifiers: string[]; reasonCodes: string[] }
interface Sess { set: 'main' | 'kids'; arm: Arm; learnerIdx: number; outcome: string; seed: string; state: KState; start: KState; rec: Rec; pre: { form: string; wrong: number; points: number; max: number }; turns: Turn[] }
const keyOf = (s: { learnerIdx: number; arm: Arm }) => `t${s.learnerIdx}_${s.arm}`;
const sf = (dir: string, key: string) => path.join(dir, 'sessions', `${key}.json`);
const load = (dir: string, key: string): Sess => JSON.parse(readFileSync(sf(dir, key), 'utf8'));
const save = (dir: string, s: Sess) => writeFileSync(sf(dir, keyOf(s)), JSON.stringify(s, null, 1));
const sessionFiles = (dir: string) => readdirSync(path.join(dir, 'sessions')).filter((f) => f.endsWith('.json')).sort();
const lessonOf = (oid: string) => LESSONS_T2[oid];
const opener = (l: Learner): Turn => ({ learner: `Hello! Can you give me an exercise on ${outcomes()[l.outcome].topic}?`, production: { kind: 'none', text: '' } });
function setOf(dir: string): 'main' | 'kids' { return JSON.parse(readFileSync(path.join(dir, 'SET.json'), 'utf8')).set; }
// cells: main = 6 cells of 60 (arm x learner id mod 3); kids = 2 cells of 45
function cells(dir: string): { id: string; keys: string[] }[] {
  if (setOf(dir) === 'kids') { const ks = LEARNERS().filter((l) => l.set === 'kids').map((l) => keyOf({ learnerIdx: l.idx, arm: 'LE' })); return [{ id: 'K1', keys: ks.slice(0, 45) }, { id: 'K2', keys: ks.slice(45) }]; }
  return (['PP', 'LE'] as Arm[]).flatMap((arm) => [0, 1, 2].map((p) => ({ id: `${arm}${p}`, keys: LEARNERS().filter((l) => l.set === 'main' && l.idx % 3 === p).map((l) => keyOf({ learnerIdx: l.idx, arm })) })));
}

// ---------------------------------------------------------------------------------------------------------- engine glue (as esl6Study.ts, plus M1/M2 and the teach2 context)
const history = (turns: Turn[]) => { const h: any[] = []; for (const t of turns) { h.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break; h.push({ role: 'assistant', content: t.tutor, languageTurn: { ...(t.lang ?? {}), ...(t.ev5 ?? {}) } }); } return h; };
const nowOf = (s: Sess) => new Date(T0 + s.turns.length * 60_000);
const esl5Record = (r: Rec): Esl5Record => ({ live: liveErrorTypes({ entries: r.entries, liveErrors: r.liveErrors }), knownPoints: { ...r.knownPoints } });
const isOk = (v: unknown) => /^CORRECT/.test(String(v ?? ''));
const isBad = (v: unknown) => /^(INCORRECT|PARTIALLY)/.test(String(v ?? ''));
/** M1 + M2: the plan input rebuilt from the session record for THIS turn. Only ENARA's own data: status, pre-test error count, its verdicts, earlier plans. */
function planInput(s: Sess): PlanInput {
  const l = L_OF(s.learnerIdx); const done = s.turns.filter((t) => t.tutor !== undefined);
  const verdicts = done.map((t) => t.engineVerdict).filter((v) => isOk(v) || isBad(v));
  const prev = done.length ? (done[done.length - 1].plan as PlanLog | undefined) : undefined;
  const lastV = done.length ? done[done.length - 1].engineVerdict : undefined;
  const tried = new Set<string>();
  done.forEach((t, k) => { const nextV = done[k + 1]?.engineVerdict; if (t.plan && isBad(nextV)) tried.add((t.plan as PlanLog).primary); });
  const age = l.age;
  return {
    objectiveId: l.outcome, masteryStatus: l.status, masteryEstimate: l.status === 'emerging' ? 0.3 : 0.1, evidenceStrength: l.status === 'not_assessed' ? 'none' : 'moderate', weakPrerequisiteIds: [],
    // M2: a misconception only from the learner's own pre-test errors (2+ wrong items = confirmed, 1 = suspected), never from the simulator
    misconceptions: s.pre.wrong >= 2 ? [{ id: 'pre', category: 'procedural_error', status: 'confirmed' }] : s.pre.wrong === 1 ? [{ id: 'pre', category: 'procedural_error', status: 'suspected' }] : [],
    supportingEvidenceIds: ['pretest'], recentResults: [...verdicts].reverse().map((v) => (isOk(v) ? 'correct' : 'incorrect')),
    ...(prev ? { previous: { primary: prev.primary, newEvidenceSince: isOk(lastV) || isBad(lastV), ...(isOk(lastV) || isBad(lastV) ? { improved: isOk(lastV) } : {}) } } : {}),
    triedWithoutImprovement: [...tried],
    gradeLevel: age ? AGE_OF[age].grade : l.band === 'A1' ? 4 : 9, subject: /-VO-/.test(l.outcome) ? 'Vocabulary' : 'Grammar', relatedSecureObjectives: 0, belowB1: belowB1(l.band),
    ...(age ? { ageBand: age } : {}), ...(/-VO-/.test(l.outcome) ? { vocabulary: true } : {}),
    ...(successesThisSession(history(s.turns.slice(0, -1)), undefined) >= 2 ? { formRightTwice: true } : {}),
  };
}
function planOf(s: Sess) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm]; const l = L_OF(s.learnerIdx);
  const plan = selectTeachingPlan(planInput(s));
  const lines = ['Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):', `- Target objective: ${l.outcome} "${lessonOf(l.outcome).objective}". Status: ${STATUS_WORDS[l.status]}.`, ...planLines(plan, undefined, l.status), '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.', '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).'];
  return { plan, text: arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n') };
}
function langCtx(s: Sess, envArm: Arm = s.arm) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[envArm];
  const l = L_OF(s.learnerIdx); const L = lessonOf(l.outcome); const message = s.turns[s.turns.length - 1].learner;
  const hist = history(s.turns.slice(0, -1)); const lesson = { title: L.title, spec: L.spec };
  const signals0 = detectTurnSignals(message, hist, lesson as never);
  const moves0 = selectLanguageMoves({ band: levelBand(l.band), targetLanguage: 'English', lessonStatus: 'structured', signals: signals0, masteryStatus: l.status });
  const record = engineV2('reviewOpen') || engineV2('fadeKnown') ? esl5Record(s.rec) : undefined;
  const { signals, moves } = esl5Adjust({ signals: signals0, moves: moves0, record, history: hist, lessonId: LESSON_ID });
  const trusted = l.age ? { band: l.age, status: 'known' as const, source: 'student_birth_date' as const } : undefined;
  const learner = deriveLearnerContext({ courseLevel: l.band, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message], objectiveStatus: l.status, ...(trusted ? { trustedAgeBand: trusted } : {}) });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, L.spec as never) : undefined;
  const planPrimary = envArm === 'LE' ? planOf(s).plan.primary : undefined; process.env.ENARA_ENGINE_V2 = ENV_OF[envArm];
  const lessonCtx = { status: 'structured' as const, lessonId: LESSON_ID, title: L.title, spec: L.spec };
  const teach2 = buildTeach2({ signals, lesson: lessonCtx as never, moves, learner }, { objectiveId: l.outcome, assessmentItems: bankItemsOf(l.outcome), history: hist });
  const { explicit, ruleFirst } = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: l.status, history: hist, signals, spec: L.spec as never, moves, entry: ruleBankEntry(teach2?.entryId) });
  const profile = summarizeProfile(s.rec.entries, nowOf(s));
  const base = { version: 'ltc-v1', learner, lesson: lessonCtx, signals, moves, ...(profile.length ? { history: profile } : {}), ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}), ...(record ? { record } : {}), ...(teach2 ? { teach2 } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as LanguageTeachingContext;
}
const dlg = (s: Sess) => s.turns.map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
function enginePart(s: Sess): string { return `${planOf(s).text}\n\n${langCtx(s).prompt}`; }
function tutorPrompt(s: Sess): string {
  const l = L_OF(s.learnerIdx);
  if (s.arm === 'PP') { const L = lessonOf(l.outcome); const sp = L.spec; return `${PPLUS}\n\nLearner level: ${l.band} (CEFR)\n\nLesson: ${L.title}. ${L.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}\n\nPractice exercises you may use:\n${(sp.items ?? []).map((i, k) => `${k + 1}. ${i.prompt}`).join('\n')}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`; }
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next).\n\n${enginePart(s)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}
// "shown in advance" counter (FIXED, plan §2): an item whose prompt already contains its answer except for case/punctuation (the capitals item) is compared
// with case kept, so the tutor presenting the task is not a hit. Same counter for both arms.
const shownItem = (tutor: string, oid: string) => [...(lessonOf(oid).spec.items ?? [])].reverse().find((it) => norm(tutor).includes(norm(coreOf(it.prompt)).slice(0, 30)));
function itemLedger(s: Sess) {
  const solved = new Set<string>(); const tried = new Set<string>(); let active: string | undefined;
  s.turns.forEach((t, k) => {
    if (k >= 1 && active) { tried.add(active); if ((t.production.kind === 'blank' || t.production.kind === 'sentence') && t.production.correct) solved.add(active); }
    if (t.tutor !== undefined && k < s.turns.length - 1) { const sh = shownItem(t.tutor, s.outcome); if (sh) active = sh.id; }
  });
  return { solved, tried, active };
}
export function answersIn(items: { id: string; prompt: string; acceptedAnswers?: string[] }[], text: string, skip: (id: string) => boolean): string[] {
  const nt = ` ${norm(text)} `; const out: string[] = [];
  for (const it of items) {
    if (skip(it.id)) continue; const core = coreOf(it.prompt).replace(/^["“]|["”]$/g, '');
    for (const a of it.acceptedAnswers ?? []) {
      const caseOnly = norm(a) === norm(core); // the prompt shows the answer's words: only the case-kept answer counts
      const hit = caseOnly ? text.includes(a.replace(/[.!?]+$/, '')) : (() => { const nf = norm(core.includes('___') ? core.replace('___', a) : a); return (nf.length >= 8 && nt.includes(` ${nf} `)) || new RegExp(`\\b(the answer is|answer:|correct answer is)\\s*["'“]?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text); })();
      if (hit) { out.push(it.id); break; }
    }
  }
  return out;
}
async function applyTutor(s: Sess, raw: string) {
  const last = s.turns[s.turns.length - 1]; const written = raw.trim(); let text = written; let final = text; let removed = 0; let closingAsk: string | undefined;
  // the guard pool (same for both arms; LE's own context, server-side) and the raw hits
  const poolCtx = langCtx(s, 'LE'); const marker0 = stripAssessmentMarkers(written);
  const rawHits = exampleGuardHits(marker0.text, poolCtx.teach2?.pool ?? [], last.learner, poolCtx.teach2?.confirmed ?? []);
  const g0 = itemLedger(s); const early = answersIn(lessonOf(s.outcome).spec.items ?? [], marker0.text, (id) => g0.solved.has(id) || g0.tried.has(id) || id === g0.active);
  if (s.arm === 'LE') {
    const marker = marker0; text = marker.text;
    const ctx = langCtx(s); const plan = planOf(s).plan; process.env.ENARA_ENGINE_V2 = ENV_OF.LE;
    const hits = exampleGuardCheck(ctx, text, last.learner);
    const g = applyReplyGuards(ctx, text, last.learner); final = g.text; removed = g.removed; closingAsk = g.closingAsk;
    const l = L_OF(s.learnerIdx); const sig = ctx.signals as any; const now = nowOf(s);
    const lt: any = await completeLanguageTurn({ language: ctx, reply: final, learnerText: last.learner, messageId: `${keyOf(s)}_t${s.turns.length}`, marker, removed, ...(closingAsk ? { closingAsk: closingAsk as never } : {}), institutionId: '', studentId: '', guardHits: hits.length, regenerated: false, ...(g.postCheck ? { postCheck: g.postCheck } : {}) });
    const ev5: Record<string, unknown> = {}; for (const k of ['liveError', 'answerReleased', 'reviewOpen', 'fadeCheck', 'fadeCheckAnswered', 'fadeFailed', 'ownSentence']) if (lt[k] !== undefined) ev5[k] = lt[k];
    const verdict = lt.assessment?.verdict; const indep = independentSuccessItem(ctx, lt);
    const o: any = { errorCode: sig.diagnosis?.code, independentSuccessOn: indep, now, lessonId: LESSON_ID, lessonTitle: lessonOf(l.outcome).title, ...(engineV2('liveError') ? { ...(sig.liveError ? { liveError: sig.liveError.code } : {}), ...(sig.liveTarget && lt.assessment && /^CORRECT/.test(String(verdict)) ? { liveCorrect: sig.liveTarget } : {}) } : {}) };
    if (o.errorCode || o.independentSuccessOn) s.rec.entries = applyTurn(s.rec.entries, o);
    if (engineV2('liveError') && (o.liveError || o.liveCorrect)) s.rec.liveErrors = applyLiveErrors(s.rec.liveErrors as never, o) as Rec['liveErrors'];
    const lang = { assessment: lt.assessment, ...(lt.activeItem ? { activeItem: lt.activeItem } : {}), hintLevel: lt.hintLevel, ...(lt.rulesIntroduced?.length ? { rulesIntroduced: lt.rulesIntroduced } : {}), ...(closingAsk ? { closingAsk } : {}) };
    const planLog: PlanLog = { primary: plan.primary, supporting: plan.supporting, reinforcement: plan.reinforcement, modifiers: plan.modifiers, reasonCodes: plan.reasonCodes };
    Object.assign(last, { lang, markerStatus: lt.markerStatus ?? null, qualityFlags: lt.qualityFlags ?? [], moves: ctx.moves.map((m) => m.id), strand: strandOfMoves(ctx.moves) ?? null, explicitFirst: explicitFirst(levelBand(l.band), l.status), ruleLine: Boolean(ctx.ruleFirst?.criteria.length), ...(ctx.ruleFirst?.criteria.length ? { rulesIntroduced: ctx.ruleFirst.criteria } : {}), ev5, engineVerdict: verdict ?? null, plan: planLog, teach2: lt.teach2 ?? null, postCheck: lt.postCheck ?? [], engineHits: hits.map((h) => ({ item: h.itemId, source: h.source, why: h.why })) });
    void s.rec.knownPoints; void applyKnownPoints;
  }
  Object.assign(last, { tutor: final, ...(final !== written ? { raw: written } : {}), guardHitsRaw: rawHits.length, guardRaw: rawHits.map((h) => ({ item: h.itemId, source: h.source, why: h.why, sentence: h.sentence })), shownEarlyRaw: early.length, twoAsks: hasTwoAsks(final) && closingAsk !== 'folded', ...(removed ? { guardRemoved: removed } : {}) });
}

// ---------------------------------------------------------------------------------------------------------- simulated learner and judge text (ESL6, unchanged)
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
const judgeText = (k: KState, prevTutor: string | undefined, last: Production | undefined, learnerMsg: string, tutor: string) =>
  `KNOWLEDGE STATE (before this tutor turn):\n${stateText(k)}\n\nPREVIOUS TUTOR TURN (the task set before the learner's message):\n${prevTutor ? stripArm(prevTutor) : '(none: this is the start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${learnerMsg}\n${factLine(last, k)}\n\nTUTOR TURN TO JUDGE:\n${stripArm(tutor)}`;
function learnerReply(k: KState, task: NextTask | undefined, seed: string, turn: number): Production {
  const t = task ?? { kind: 'none' }; const o = outcomeOfState(k);
  if (t.kind === 'blank' || t.kind === 'sentence') {
    const probes = (t.probes ?? o.ws).filter((p) => (o.ws as string[]).includes(p)) as ('W1' | 'W2')[];
    for (const w of probes) if (rand(seed, 'prod', turn, w) < itemErrorProb(k, w)) { const txt = t.errors?.[w]; return { kind: t.kind, correct: false, fired: w, text: txt === undefined || txt === '' ? (t.kind === 'blank' ? '(I leave it empty, no word)' : String(t.correct ?? '')) : txt }; }
    return { kind: t.kind, correct: true, text: String(t.correct ?? '') };
  }
  if (t.kind === 'rule') return { kind: 'rule', text: k.s.C1 >= 2 ? `I think: ${o.C.C1}.` : `I think ${o.W.W1}.` };
  return { kind: 'none', text: 'OK. Can I have an exercise, please?' };
}
function writeBatches(dir: string, tag: string, cases: { id: string; text: string }[], per: number, head: string) {
  const order = [...cases].map((c, i) => ({ c, k: sha(`${NS}|${tag}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.c);
  const files: { batch: string; ids: string[] }[] = [];
  for (let n = 0; n * per < order.length; n++) {
    const chunk = order.slice(n * per, (n + 1) * per); const batch = `${tag}_j${String(n + 1).padStart(2, '0')}`;
    writeFileSync(path.join(dir, `${batch}.md`), `SIMULATION ONLY. Batch ${batch}. ${head} Write {"batch":"${batch}","cases":{...}} to the file named in your task.\n` + chunk.map((c) => `\n=========== CASE ${c.id} ===========\n${c.text}\n`).join(''));
    files.push({ batch, ids: chunk.map((c) => c.id) });
  }
  return files;
}
function readBatches(dir: string, files: { batch: string; ids: string[] }[]) {
  const out: Record<string, any> = {}; const missing: string[] = [];
  for (const f of files) { const p = path.join(dir, `${f.batch}.json`); if (!existsSync(p)) { missing.push(f.batch); continue; } const d = JSON.parse(readFileSync(p, 'utf8')); for (const id of f.ids) if (d.cases?.[id]) out[id] = d.cases[id]; else missing.push(`${f.batch}:${id}`); }
  return { out, missing };
}
const caseId = (f: string, round: number, tag = 'j') => `c${sha(`${NS}|${tag}|${f}|${round}`).slice(0, 10)}`;

// ---------------------------------------------------------------------------------------------------------- checks
function walk(d: string, out: string[] = []) { if (!existsSync(d)) return out; for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(json|md|txt|ts|py)$/.test(f)) out.push(p); } return out; }
function overlapCheck(own: string) {
  const files = [...walk(path.join(ROOT, 'reports/exp4')), ...[1, 2, 3, 4, 5, 6].flatMap((n) => walk(path.join(ROOT, `config/agent_sim_esl${n}`)))].filter((f) => !path.resolve(f).startsWith(path.resolve(own) + path.sep) && !/[\\/]teach2[\\/]/.test(f));
  const ids = new Set<number>(); const seeds = new Set<string>();
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/"learnerIdx":\s*(\d+)/g)) ids.add(Number(m[1])); for (const m of t.matchAll(/"seed":\s*"([^"]+)"/g)) seeds.add(m[1]); }
  for (const [a, b] of [[0, 35], [100, 159], [200, 211], [300, 407], [500, 619], [700, 991]]) for (let i = a; i <= b; i++) ids.add(i);
  const mine = LEARNERS().map((l) => l.idx); const clash = mine.filter((i) => ids.has(i)); const seedClash = mine.map(seedOf).filter((x) => seeds.has(x)) ; const ns = [...seeds].filter((x) => x.startsWith(`${NS}|`));
  return { _label: 'SIMULATION ONLY', filesScanned: files.length, priorIds: ids.size, ids: `${Math.min(...mine)}-${Math.max(...mine)} (${mine.length})`, idClash: clash, seedClash, namespaceClash: ns, pass: !clash.length && !seedClash.length && !ns.length };
}
function dataCheck() {
  process.env.ENARA_ENGINE_V2 = 'graderV2,teach2';
  const rows = OUTCOME_IDS.map((oid) => {
    const before = checkLessonData(oid, LESSONS6[oid].spec as never).map((f) => f.problem); const after = checkLessonData(oid, LESSONS_T2[oid].spec as never).map((f) => f.problem);
    const pool = poolFromBankItems(bankItemsOf(oid));
    const itemHits = (LESSONS_T2[oid].spec.items ?? []).flatMap((it) => (it.acceptedAnswers ?? []).flatMap((a) => exampleGuardHits(coreOf(it.prompt).includes('___') ? coreOf(it.prompt).replace('___', a) : a, pool).map((h) => `${it.id}->${h.itemId}`)));
    return { outcome: oid, fixed: FIXED_OUTCOMES.includes(oid), before, after, lessonItemsCompletingBankItems: [...new Set(itemHits)] };
  });
  return { _label: 'SIMULATION ONLY', rows, stillFlagged: rows.filter((r) => r.after.length).map((r) => ({ outcome: r.outcome, problems: r.after })), fixedOk: rows.filter((r) => r.fixed).every((r) => !r.after.length && !r.lessonItemsCompletingBankItems.length) };
}
function forbidden(): RegExp[] {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res: RegExp[] = [/\b[WC][12]\b/, /strength/i, /KNOWLEDGE STATE/i, /\bprimary (wrong )?belief/i, /teach2\|L\d/, /Independent correct productions/i, /ITEM_BELIEF|WRONG_ANSWERS/];
  for (const o of Object.values(outcomes())) for (const t of [...Object.values(o.C), ...Object.values(o.W), ...Object.values(o.E)]) res.push(new RegExp(esc(t), 'i'));
  for (const it of bank().items.values()) { const c = coreOf(it.prompt).replace(/_+/g, '___').trim(); if (c.split(/\s+/).length >= 4) res.push(new RegExp(esc(c), 'i')); const k = String(it.answerKey ?? ''); if (k.split(/\s+/).length >= 3 && !/^e\.g\./.test(k)) res.push(new RegExp(esc(k), 'i')); }
  return res;
}

// ---------------------------------------------------------------------------------------------------------- report
const pct = (a: number, b: number) => (b ? +(100 * a / b).toFixed(2) : null);
function report(dir: string, kidsDir?: string) {
  const res: any = { _label: 'SIMULATION ONLY', main: {}, kids: null, methods: {} };
  const arms: Record<Arm, { turns: number; R: Record<string, number>; r5Turns: number; r6Turns: number; guardRaw: number; guardTurns: number; shownEarly: number }> = { PP: { turns: 0, R: {}, r5Turns: 0, r6Turns: 0, guardRaw: 0, guardTurns: 0, shownEarly: 0 }, LE: { turns: 0, R: {}, r5Turns: 0, r6Turns: 0, guardRaw: 0, guardTurns: 0, shownEarly: 0 } };
  const mt: Record<string, { primary: number; supporting: number; reinforcement: number; modifier: number; sessions: Set<string> }> = {};
  const touch = (m: string) => (mt[m] ??= { primary: 0, supporting: 0, reinforcement: 0, modifier: 0, sessions: new Set() });
  const moves: Record<string, number> = {}; const rungs: Record<string, number> = {}; const tmpl: Record<string, number> = {}; let interleave = 0; let kidsFrame = 0; let switches = 0; let postCheck = 0; const reasons: Record<string, number> = {};
  const r5List: any[] = []; const r6List: any[] = []; const guardList: any[] = [];
  for (const f of sessionFiles(dir)) {
    const s = load(dir, f.replace(/\.json$/, '')); const A = arms[s.arm];
    s.turns.forEach((t, k) => {
      if (t.tutor === undefined || !t.events) return; A.turns++;
      const rs = (t.events as any[]).map((e) => e.rule); for (const r of rs) A.R[r] = (A.R[r] ?? 0) + 1;
      if (rs.includes('R5')) { A.r5Turns++; r5List.push({ key: keyOf(s), turn: k + 1, outcome: s.outcome, quote: (t.events as any[]).find((e) => e.rule === 'R5')?.quote }); }
      if (rs.includes('R6')) { A.r6Turns++; r6List.push({ key: keyOf(s), turn: k + 1, outcome: s.outcome, events: (t.events as any[]).filter((e) => e.rule === 'R6') }); }
      A.guardRaw += t.guardHitsRaw ?? 0; if (t.guardHitsRaw) { A.guardTurns++; guardList.push({ key: keyOf(s), turn: k + 1, hits: t.guardRaw }); } A.shownEarly += t.shownEarlyRaw ? 1 : 0;
      if (s.arm === 'LE') {
        const p = t.plan as PlanLog; if (p) {
          touch(p.primary).primary++; touch(p.primary).sessions.add(keyOf(s)); for (const x of p.supporting) { touch(x).supporting++; touch(x).sessions.add(keyOf(s)); } if (p.reinforcement) { touch(p.reinforcement).reinforcement++; touch(p.reinforcement).sessions.add(keyOf(s)); } for (const x of p.modifiers) { touch(x).modifier++; touch(x).sessions.add(keyOf(s)); }
          for (const r of p.reasonCodes) reasons[r] = (reasons[r] ?? 0) + 1;
          const prev = s.turns[k - 1]?.plan as PlanLog | undefined; if (prev && prev.primary !== p.primary) switches++;
        }
        for (const m of t.moves ?? []) moves[m] = (moves[m] ?? 0) + 1;
        if (t.teach2?.rung) rungs[t.teach2.rung] = (rungs[t.teach2.rung] ?? 0) + 1; if (t.teach2?.template) tmpl[t.teach2.template] = (tmpl[t.teach2.template] ?? 0) + 1; if (t.teach2?.interleave) interleave++; if (t.teach2?.kidsFrame) kidsFrame++; if (t.postCheck?.length) postCheck++;
      }
    });
  }
  for (const a of ['PP', 'LE'] as Arm[]) { const A = arms[a]; res.main[a] = { turns: A.turns, events: A.R, R5events: A.R.R5 ?? 0, R5turns: A.r5Turns, R5turnPct: pct(A.r5Turns, A.turns), R6events: A.R.R6 ?? 0, R6turns: A.r6Turns, R1R2perTurn: A.turns ? +(((A.R.R1 ?? 0) + (A.R.R2 ?? 0)) / A.turns).toFixed(3) : null, guardHitsRaw: A.guardRaw, guardTurns: A.guardTurns, shownInAdvanceTurns: A.shownEarly }; }
  const LE = res.main.LE; const PP = res.main.PP;
  res.bars = { r5: { pass: LE.R5events <= PP.R5events && LE.R5turnPct <= 1, le: LE.R5events, pp: PP.R5events, leTurnPct: LE.R5turnPct }, r6: { pass: LE.R6events === 0, le: LE.R6events }, guard: { pass: LE.guardHitsRaw === 0, le: LE.guardHitsRaw, pp: PP.guardHitsRaw }, r1r2: { pass: LE.R1R2perTurn >= 0.84, le: LE.R1R2perTurn, round1: 0.84 } };
  res.methods = { turns: LE.turns, perMethod: Object.fromEntries([...GUIDE_METHODS.map((m) => m.id), ...Object.keys(mt).filter((x) => !GUIDE_METHODS.some((m) => m.id === x))].map((id) => { const v = mt[id]; return [id, v ? { name: STRATEGY_BY_ID.get(id)?.name, primary: v.primary, supporting: v.supporting, reinforcement: v.reinforcement, modifier: v.modifier, sessions: v.sessions.size } : { name: STRATEGY_BY_ID.get(id)?.name, primary: 0, supporting: 0, reinforcement: 0, modifier: 0, sessions: 0 }]; })), planSwitchesWithinSession: switches, reasonCodes: reasons, engineMoves: moves, feedbackRungs: rungs, ruleTemplates: tmpl, interleaveTurns: interleave, kidsFrameTurns: kidsFrame, postCheckTurns: postCheck };
  res.lists = { r5: r5List, r6: r6List, guard: guardList };
  if (kidsDir) {
    let n = 0; let within = 0; let fits = 0; let judged = 0; const flags: Record<string, number> = {}; const byBand: Record<string, { n: number; within: number; fits: number }> = {};
    for (const f of sessionFiles(kidsDir)) {
      const s = load(kidsDir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx); const B = (byBand[l.age!] ??= { n: 0, within: 0, fits: 0 });
      for (const t of s.turns) { if (t.tutor === undefined) continue; n++; B.n++; if (t.ageFit?.within) { within++; B.within++; } for (const x of t.ageFit?.flags ?? []) flags[x] = (flags[x] ?? 0) + 1; if (t.fitVotes) { judged++; if (t.fits) { fits++; B.fits++; } } }
    }
    res.kids = { turns: n, withinLimits: within, withinPct: pct(within, n), judged, fits, fitsPct: pct(fits, judged), flags, byBand };
    res.bars.kids = { pass: (res.kids.withinPct ?? 0) >= 95 && (res.kids.fitsPct ?? 0) >= 90, withinPct: res.kids.withinPct, fitsPct: res.kids.fitsPct };
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------- CLI
const [cmd, a1, a2, a3] = process.argv.slice(2);
async function main() {
  if (cmd === 'datacheck') { const r = dataCheck(); console.log(JSON.stringify(r, null, 1)); if (a1) write(path.resolve(a1), r); }
  else if (cmd === 'overlap') { const r = overlapCheck(dirArg(a1)); console.log(JSON.stringify(r)); }
  else if (cmd === 'init') {
    const dir = dirArg(a1); const set = a2 as 'main' | 'kids'; if (set !== 'main' && set !== 'kids') throw new Error('init <dir> <main|kids>');
    if (sha(readFileSync(PPLUS_FILE, 'utf8')) !== PPLUS_SHA) throw new Error('P+ prompt hash differs');
    const ov = overlapCheck(dir); if (!ov.pass) throw new Error(`overlap check failed: ${JSON.stringify(ov)}`);
    mkdirSync(path.join(dir, 'sessions'), { recursive: true }); mkdirSync(path.join(dir, 'judge'), { recursive: true }); write(path.join(dir, 'SET.json'), { set, _label: 'SIMULATION ONLY' }); write(path.join(dir, 'OVERLAP_CHECK.json'), ov);
    const O = outcomes(); const map = IBM(); const wrong = WRONG(); const ls = LEARNERS().filter((l) => l.set === set); const arms: Arm[] = set === 'kids' ? ['LE'] : ['PP', 'LE'];
    const states = py<KState>(ls.map((l) => ({ op: 'init', form: O[l.outcome].key, band: l.band, primary: l.primary, ws: O[l.outcome].ws, sec1: O[l.outcome].sec1 })));
    const preRows: any[] = [];
    ls.forEach((l, i) => {
      // M2: ENARA's pre-test (the learner's own form), answered by the ESL6 rules and scored by the real grader; only the wrong-item count reaches the engine
      const k = states[i]; let wrongN = 0; let pts = 0; let max = 0;
      for (const it of bank().forms.get(l.outcome)![l.preForm]) {
        const m = map[it.id]; const probes = m.probes.filter((p) => p === 'W1' || p === 'W2').sort() as ('W1' | 'W2')[];
        let ans = m.key; for (const w of probes) if (rand(seedOf(l.idx), 'pre', it.id, w) < itemErrorProb(k, w)) { ans = wrong.items[it.id][w]; break; }
        const sc = scoreAnswer(it.id, ans); pts += sc.points ?? 0; max += sc.max; if ((sc.points ?? 0) < sc.max) wrongN++;
        preRows.push({ learner: l.idx, item: it.id, answer: ans, points: sc.points, max: sc.max });
      }
      for (const arm of arms) save(dir, { set, arm, learnerIdx: l.idx, outcome: l.outcome, seed: seedOf(l.idx), state: k, start: JSON.parse(JSON.stringify(k)), rec: { entries: [], liveErrors: {}, knownPoints: {} }, pre: { form: l.preForm, wrong: wrongN, points: pts, max }, turns: [opener(l)] });
    });
    write(path.join(dir, 'PRETEST.json'), preRows); write(path.join(dir, 'cells.json'), cells(dir)); write(path.join(dir, 'LEARNERS.json'), ls);
    console.log(`init ${set}: learners ${ls.length}, sessions ${ls.length * arms.length}, cells ${cells(dir).map((c) => `${c.id}(${c.keys.length})`).join(' ')}, env LE ${ENV_OF.LE}`);
  } else if (cmd === 'cells') { console.log(cells(dirArg(a1)).map((c) => c.id).join(' ')); }
  else if (cmd === 'tprompts') {
    const dir = dirArg(a1); const cell = cells(dir).find((c) => c.id === a2)!; let n = 0; let out = '';
    for (const key of cell.keys) { const s = load(dir, key); const last = s.turns[s.turns.length - 1]; if (last.tutor !== undefined || s.turns.length > TURNS) continue; out += `\n########## SESSION ${key} ##########\n${tutorPrompt(s)}\n`; n++; }
    out += `\n(${n} session(s) need a tutor reply in this cell)\n`;
    if (a3) writeFileSync(path.resolve(a3), out); else process.stdout.write(out);
    if (a3) console.log(`${n} prompts -> ${a3}`);
  } else if (cmd === 'promptcheck') {
    const dir = dirArg(a1); const FORB = forbidden(); let n = 0; const bad: string[] = [];
    for (const c of cells(dir)) for (const key of c.keys) {
      const s = load(dir, key); if (s.arm !== 'LE' || s.turns[s.turns.length - 1].tutor !== undefined) continue; const head = enginePart(s); n++;
      const L = lessonOf(s.outcome); const own = [L.title, L.objective, ...Object.values(L.spec).flat().map((x: any) => (typeof x === 'string' ? x : x.prompt))].map(norm);
      for (const re of FORB) { const m = head.match(re); if (m && !own.some((x) => x.includes(norm(m[0])))) bad.push(`${key}:${re}`); }
    }
    const res = { prompts: n, leFindings: bad, pass: !bad.length }; write(path.join(dir, `PROMPTCHECK_t${load(dir, cells(dir)[0].keys[0]).turns.length}.json`), res); console.log(JSON.stringify({ ...res, leFindings: bad.slice(0, 10) })); if (bad.length) process.exit(1);
  } else if (cmd === 'tapply') {
    const dir = dirArg(a1); const cell = cells(dir).find((c) => c.id === a2)!; const ans = JSON.parse(readFileSync(a3, 'utf8')) as Record<string, string>; let n = 0;
    for (const key of cell.keys) { const t = ans[key]; if (typeof t !== 'string' || !t.trim()) continue; const s = load(dir, key); if (s.turns[s.turns.length - 1].tutor !== undefined) continue; await applyTutor(s, t); if (s.set === 'kids') { const l = L_OF(s.learnerIdx); const L = lessonOf(l.outcome).spec; s.turns[s.turns.length - 1].ageFit = ageFit(s.turns[s.turns.length - 1].tutor!, l.age!, [...(L.vocabulary ?? []), ...(L.examples ?? []), ...(L.items ?? []).map((i) => i.prompt), ...(L.grammar ?? [])], (L.grammar ?? []).flatMap((g) => g.split(/[^A-Za-z]+/))); } save(dir, s); n++; }
    console.log('applied', n, 'of', cell.keys.length);
  } else if (cmd === 'jprep') {
    const dir = dirArg(a1); const round = Number(a2); const cases: { id: string; text: string }[] = []; const km: Record<string, string> = {};
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const cur = s.turns[round - 1]; if (!cur?.tutor) { if (cur) console.log('NO TUTOR REPLY', f); continue; } if (cur.events) continue;
      cur.judgeInput = judgeText(s.state, s.turns[round - 2]?.tutor, cur.production, cur.learner, cur.tutor); save(dir, s);
      cases.push({ id: caseId(f, round), text: cur.judgeInput }); km[caseId(f, round)] = f.replace(/\.json$/, '');
    }
    write(path.join(dir, 'judge', `r${round}_KEY.json`), km);
    const files = writeBatches(path.join(dir, 'judge'), `r${round}`, cases, 60, 'Judge every case with JUDGE_INSTRUCTIONS.md and LEARNING_RULES.md.'); write(path.join(dir, 'judge', `r${round}_FILES.json`), files);
    console.log('judge cases', cases.length, files.map((x) => x.batch).join(' '));
  } else if (cmd === 'japply') {
    const dir = dirArg(a1); const round = Number(a2); const files = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_FILES.json`), 'utf8')); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8'));
    const { out, missing } = readBatches(path.join(dir, 'judge'), files); if (missing.length) { console.log('MISSING', missing.join(' ')); process.exit(1); }
    const todo: { s: Sess; cur: Turn; j: any }[] = []; for (const [cid, j] of Object.entries(out)) { const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.events) continue; todo.push({ s, cur, j }); }
    const r = py<{ state: KState; applied: string[]; rejected: string[] }>(todo.map(({ s, cur, j }) => ({ op: 'apply', state: s.state, events: j.events ?? [], last: cur.production, session: 1, retrieval: [] })));
    let rej = 0;
    todo.forEach(({ s, cur, j }, i) => { Object.assign(cur, { stateBefore: s.state, events: j.events ?? [], next_task: j.next_task, applied: r[i].applied, rejected: r[i].rejected, stateAfter: r[i].state }); s.state = r[i].state; rej += r[i].rejected.length; if (round < TURNS) { const p = learnerReply(s.state, j.next_task, s.seed, round + 1); s.turns.push({ learner: p.text, production: p }); } save(dir, s); });
    console.log('applied', todo.length, 'rejected events', rej);
  } else if (cmd === 'kprep') {
    // kids: 3 independent age-fit judges per turn (k1, k2, k3); judge k1 also writes the next_task (ESL6 format) the simulated learner answers
    const dir = dirArg(a1); const round = Number(a2); const cases: { id: string; text: string }[] = []; const km: Record<string, string> = {};
    for (const f of sessionFiles(dir)) {
      const s = load(dir, f.replace(/\.json$/, '')); const l = L_OF(s.learnerIdx); const cur = s.turns[round - 1]; if (!cur?.tutor || cur.fitVotes) continue; const o = outcomes()[l.outcome];
      const text = `LEARNER: age band ${l.age} (${l.age === 'child' ? 'under 13' : l.age === 'teen' ? '13-17' : '18 or older'}), English level ${l.band}, first language Arabic.\nLESSON: ${lessonOf(l.outcome).title} (${o.topic}). Lesson words: ${(lessonOf(l.outcome).spec.vocabulary ?? []).join(', ')}.\n\nPREVIOUS TUTOR TURN:\n${s.turns[round - 2]?.tutor ? stripArm(s.turns[round - 2].tutor!) : '(none: start of the lesson)'}\n\nLEARNER'S LAST MESSAGE:\n${cur.learner}\n\nTUTOR TURN TO RATE:\n${stripArm(cur.tutor)}`;
      cases.push({ id: caseId(f, round, 'k'), text }); km[caseId(f, round, 'k')] = f.replace(/\.json$/, '');
    }
    for (const j of ['k1', 'k2', 'k3']) { const d = path.join(dir, 'judge', j); mkdirSync(d, { recursive: true }); const files = writeBatches(d, `r${round}${j}`, cases, 90, `Rate every case with KIDS_FIT_TASK.md.`); write(path.join(d, `r${round}_FILES.json`), files); }
    write(path.join(dir, 'judge', `r${round}_KEY.json`), km); console.log('kids cases', cases.length);
  } else if (cmd === 'kapply') {
    const dir = dirArg(a1); const round = Number(a2); const km = JSON.parse(readFileSync(path.join(dir, 'judge', `r${round}_KEY.json`), 'utf8')); const votes: Record<string, any[]> = {};
    for (const j of ['k1', 'k2', 'k3']) { const d = path.join(dir, 'judge', j); const { out, missing } = readBatches(d, JSON.parse(readFileSync(path.join(d, `r${round}_FILES.json`), 'utf8'))); if (missing.length) { console.log('MISSING', j, missing.join(' ')); process.exit(1); } for (const [cid, v] of Object.entries(out)) (votes[cid] ??= []).push({ judge: j, ...v }); }
    let n = 0;
    for (const [cid, vs] of Object.entries(votes)) {
      const s = load(dir, km[cid]); const cur = s.turns[round - 1]; if (cur.fitVotes) continue; const yes = vs.filter((v) => v.fits === true).length;
      Object.assign(cur, { fitVotes: vs.map((v) => ({ judge: v.judge, fits: v.fits, why: v.why ?? '' })), fits: yes >= 2 });
      const nt = vs.find((v) => v.judge === 'k1')?.next_task; cur.next_task = nt ?? null;
      if (round < TURNS) { const p = learnerReply(s.state, nt, s.seed, round + 1); s.turns.push({ learner: p.text, production: p }); }
      save(dir, s); n++;
    }
    console.log('kids applied', n);
  } else if (cmd === 'report') {
    const r = report(dirArg(a1), a2 ? dirArg(a2) : undefined); write(path.join(dirArg(a1), 'REPORT.json'), r); console.log(JSON.stringify({ main: r.main, bars: r.bars, kids: r.kids }, null, 1));
  } else console.log('commands: datacheck | overlap | init | cells | tprompts | promptcheck | tapply | jprep | japply | kprep | kapply | report');
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
