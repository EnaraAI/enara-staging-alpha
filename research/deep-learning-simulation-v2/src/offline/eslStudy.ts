// ESL stage-1 agent study (change A, `levelExplicit`). SIMULATION ONLY. NO API: AI agents play student, tutor, post-test taker, scorer and rater, in separate contexts.
// The REAL ENARA engine renders the tutor instructions each turn and the REAL reply guards run on every ENARA reply. Arms: P plain tutor; A0 current best
// (wrongAnswer,closing,selfCheck,clarity,hints); ARB = A0 + the 23-method teaching plan + arbitration; LE = A0 + the plan + levelExplicit (arbitration forced on).
// Run from the backend directory:  npx tsx ../research/deep-learning-simulation-v2/src/offline/eslStudy.ts <command> ...
// Commands: ready | dry | init <dir> | cells <dir> | prompts <dir> <cellId> <student|tutor> | apply <dir> <cellId> <student|tutor> <answers.json> | status <dir> | show <file>
//           freeze <configDir> | postprep <dir> <outDir> | postscore <outDir> | freeprep <outDir> <pass> | freescore <outDir> | rateprep <dir> <outDir> <pass> | tags <dir> <out.json>
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, closingOn, ruleFirstDecision, explicitFirst,
  askedForRule, askedNewExample, taskInvitation, type LanguageTeachingContext,
} from '../../../../backend/src/services/languageTeachingContext';
import { evaluateAgainstKey } from '../../../../backend/src/services/languageLearningState';
import { applyReplyGuards, arbitratePedagogy } from '../../../../backend/src/services/languageTurnPipeline';
import { engineV2 } from '../../../../backend/src/services/engineV2';
import { strandOfMoves } from '../../../../backend/src/services/strandLog';
import { selectTeachingPlan, belowB1, type PlanInput } from '../../../../backend/src/services/pedagogyPolicy';
import { planLines, STATUS_WORDS } from '../../../../backend/src/services/learningContext';
import { makeStudent, studentPersona, itemBehaviour } from '../students/population';
import { scoreItem } from '../benchmark/scoring';
import { FORMS, LESSONS, STUDENTS, SEED, ARMS, L1_PROFILE, FREE_RUBRIC, postItems, type Arm, type Form, type Band, type EslStudent } from './eslFixtures';

const ROOT = path.resolve(__dirname, '../..');
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
const ENV_OF: Record<Arm, string> = { P: '', A0: BASE, ARB: `${BASE},arbitration`, LE: `${BASE},levelExplicit` };
const WITH_PLAN = new Set<Arm>(['ARB', 'LE']);
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rngShuffle = <T>(arr: T[], seed: string): T[] => { // deterministic shuffle (seeded hash sort)
  return [...arr].map((x, i) => ({ x, k: sha(`${seed}|${i}`) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.x);
};

// ------------------------------------------------------------------------------------------------------------------------------------------ students
const studentOf = (idx: number) => STUDENTS[idx];
function personaOf(es: EslStudent): string {
  const st = { ...makeStudent(es.idx, SEED), cefr: es.band as never };
  const p = L1_PROFILE[es.form][es.variant];
  const held = es.status === 'proficient' ? null : { description: `${p.description}. This comes from Arabic`, exampleWrong: p.example };
  const base = studentPersona(st, { cefr: es.band, area: 'grammar', heldMisconception: held, knowsAlready: es.status === 'proficient' });
  const extra = es.status === 'proficient'
    ? `You know this point well. Once in a while (not often) you slip because you type quickly and make the typical Arabic-speaker error: ${p.description}. For example you might write: "${p.example}".`
    : `Your typical errors come from Arabic: ${p.description}. In your own sentences you make this kind of error until a lesson really changes how you write.`;
  return `${base} ${extra}`;
}

// ------------------------------------------------------------------------------------------------------------------------------------------ plan (23-method teaching plan from a fixed record)
function planOf(es: EslStudent, arm: Arm) {
  process.env.ENARA_ENGINE_V2 = ENV_OF[arm];
  const status = es.status;
  const grade = es.band === 'A1' ? 4 : es.band === 'A2' ? 9 : 18;
  const input: PlanInput = {
    objectiveId: `ESL-${es.form}`, masteryStatus: status, masteryEstimate: status === 'proficient' ? 0.8 : status === 'emerging' ? 0.3 : 0.1, evidenceStrength: status === 'not_assessed' ? 'none' : 'moderate',
    weakPrerequisiteIds: [], misconceptions: status === 'proficient' ? [] : [{ id: 'm1', category: 'procedural_error', status: 'confirmed' }], supportingEvidenceIds: ['seed'], recentResults: [],
    triedWithoutImprovement: [], gradeLevel: grade, subject: 'Grammar', relatedSecureObjectives: 0, belowB1: belowB1(es.band),
  };
  const plan = selectTeachingPlan(input);
  const lines = [
    'Learning focus for this conversation (from the school\'s learning records; use it, don\'t recite it):',
    `- Target objective: ESL-${es.form} "${LESSONS[es.form].objective}". Status: ${STATUS_WORDS[status]}.`,
    ...planLines(plan, undefined, status),
    '- Assessment integrity: never give the answers to the student\'s assessment or quick-check questions. If they paste one, teach the method with a different example.',
    '- When they seem ready, suggest a quick check to confirm (practice with you does not count as proof of understanding).',
  ];
  const text = arbitratePedagogy(lines.join('\n'), true) ?? lines.join('\n');
  return { plan, text, method: { primary: plan.primary, supporting: plan.supporting, reinforcement: plan.reinforcement ?? null, reasonCodes: plan.reasonCodes } };
}

// ------------------------------------------------------------------------------------------------------------------------------------------ engine context for one tutor turn
interface Turn { learner: string; tutor?: string; raw?: string; [k: string]: unknown }
interface Session { arm: Arm; studentIdx: number; band: Band; form: Form; status: string; persona: string; turns: Turn[] }
function history(turns: Turn[], items: { id: string; prompt: string; acceptedAnswers: string[]; criteria?: number[] }[]) {
  const hist: any[] = []; let active: string | undefined; let misses = 0;
  for (const t of turns) {
    hist.push({ role: 'user', content: t.learner }); if (t.tutor === undefined) break;
    const prev = items.find((x) => x.id === active);
    const ok = prev ? Boolean(evaluateAgainstKey(t.learner, prev as never)) : false;
    const verdict = prev ? (ok ? 'CORRECT' : 'INCORRECT') : 'NOT_EVALUATED'; if (verdict === 'INCORRECT') misses++;
    const shown = [...items].reverse().find((it) => norm(t.tutor!).includes(norm(it.prompt).replace(/\s*answer with only the (missing word|verb)\s*$/, '').slice(0, 40)));
    if (shown) active = shown.id;
    hist.push({
      role: 'assistant', content: t.tutor,
      languageTurn: {
        assessment: { verdict, relevance: prev ? 'ACTIVE_ITEM' : 'NO_ACTIVE_ITEM', criteria: ok && prev?.criteria ? prev.criteria : [], next: 'SAME_ITEM', source: 'tutor_assessment' },
        ...(active ? { activeItem: { id: `lesson:${active}`, source: 'lesson', lessonItemId: active } } : {}), hintLevel: Math.min(6, Math.max(1, misses)),
        ...((t.rulesIntroduced as number[] | undefined)?.length ? { rulesIntroduced: t.rulesIntroduced } : {}), ...(t.closingAsk ? { closingAsk: t.closingAsk } : {}),
      },
    });
  }
  return hist;
}
function langCtx(s: Session, envOverride?: string) {
  process.env.ENARA_ENGINE_V2 = envOverride ?? ENV_OF[s.arm];
  const lesson0 = LESSONS[s.form]; const last = s.turns[s.turns.length - 1]; const message = last.learner; const prior = s.turns.slice(0, -1);
  const hist = history(prior, lesson0.spec.items); const lesson = { title: lesson0.title, spec: lesson0.spec };
  const signals = detectTurnSignals(message, hist, lesson);
  const moves = selectLanguageMoves({ band: levelBand(s.band), targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: s.status });
  const learner = deriveLearnerContext({ courseLevel: s.band, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message], objectiveStatus: s.status });
  const research = closingOn() || engineV2('hints') ? researchSignals(hist, signals, lesson0.spec) : undefined;
  const planPrimary = WITH_PLAN.has(s.arm) && envOverride === undefined ? planOf(studentOf(s.studentIdx), s.arm).plan.primary : undefined;
  const { explicit, ruleFirst } = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: s.status, history: hist, signals, spec: lesson0.spec });
  const base = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: lesson0.title, spec: lesson0.spec }, signals, moves, ...(research ? { research } : {}), ...(planPrimary ? { planPrimary } : {}), ...(ruleFirst ? { ruleFirst } : {}), ...(explicit !== undefined ? { explicitFirst: explicit } : {}) } as never;
  return { ...(base as object), prompt: renderLanguageContextPrompt(base) } as never as LanguageTeachingContext;
}

// ------------------------------------------------------------------------------------------------------------------------------------------ prompts
const dlg = (s: Session) => s.turns.map((t) => `STUDENT: ${t.learner}${t.tutor !== undefined ? `\nTUTOR: ${t.tutor}` : ''}`).join('\n');
const lessonText = (f: Form) => { const l = LESSONS[f]; const sp = l.spec; return `Lesson: ${l.title}. ${l.objective}\nObjectives: ${sp.objectives.join('; ')}\nSuccess criteria: ${sp.successCriteria.join('; ')}\nVocabulary: ${sp.vocabulary.join(', ')}\nGrammar: ${sp.grammar.join('; ')}\nExamples: ${sp.examples.join(' / ')}`; };
const practiceList = (f: Form) => LESSONS[f].spec.items.map((i, k) => `${k + 1}. ${i.prompt}`).join('\n');
function studentPrompt(s: Session): string {
  return `LEARNER CARD (this is all the learner knows about themselves):\n${s.persona}\n\nLesson topic the tutor is teaching: ${LESSONS[s.form].title}.\n\nCONVERSATION SO FAR:\n${s.turns.length ? dlg(s) : '(none yet: you speak first; greet the tutor and ask for an exercise on this lesson topic)'}\n\nWrite the learner's next message only.`;
}
function tutorPrompt(s: Session): string {
  if (s.arm === 'P') return `You are a friendly English tutor. Help the student learn the lesson below through conversation. Keep replies short and in simple English.\n\n${lessonText(s.form)}\n\nPractice exercises you may use:\n${practiceList(s.form)}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
  const plan = WITH_PLAN.has(s.arm) ? `${planOf(studentOf(s.studentIdx), s.arm).text}\n\n` : '';
  return `You are the ENARA English tutor. Follow these teaching instructions exactly for this turn (they decide what you may reveal and what to do next). Do NOT write an [[assess ...]] marker.\n\n${plan}${langCtx(s).prompt}\n\nCONVERSATION SO FAR:\n${dlg(s)}\n\nWrite the tutor's next reply only.`;
}

// ------------------------------------------------------------------------------------------------------------------------------------------ tutor reply: guards + tags (tags only; the turn also keeps the synthetic dialogue text)
function applyTutorReply(s: Session, raw: string) {
  const last = s.turns[s.turns.length - 1]; const learnerText = last.learner; const text = raw.trim();
  const neutral = langCtx(s, ''); const leakRaw = applyReplyGuards(neutral, text, learnerText).removed; // answer-before-try detector on the raw reply (no switches)
  let final = text; let removed = 0; let closingAsk: string | undefined; let ctx: LanguageTeachingContext | undefined;
  if (s.arm !== 'P') { ctx = langCtx(s); const g = applyReplyGuards(ctx, text, learnerText); final = g.text; removed = g.removed; closingAsk = g.closingAsk; }
  const leakFinal = applyReplyGuards(neutral, final, learnerText).removed; // what still reaches the student
  last.tutor = final; if (final !== text) last.raw = text;
  last.leakRaw = leakRaw; last.leakFinal = leakFinal; if (removed) last.guardRemoved = removed;
  if (ctx) {
    process.env.ENARA_ENGINE_V2 = ENV_OF[s.arm];
    last.moves = ctx.moves.map((m) => m.id); last.strand = strandOfMoves(ctx.moves) ?? null;
    last.explicitFirst = explicitFirst(levelBand(s.band), s.status); last.levelExplicit = engineV2('levelExplicit');
    if (ctx.ruleFirst?.criteria.length) last.rulesIntroduced = ctx.ruleFirst.criteria;
    if (closingAsk) last.closingAsk = closingAsk;
    last.twoAsks = Boolean((askedForRule(final) || askedNewExample(final)) && taskInvitation(final) && closingAsk !== 'folded');
    if (WITH_PLAN.has(s.arm)) last.method = planOf(studentOf(s.studentIdx), s.arm).method;
    last.ruleLine = Boolean(ctx.ruleFirst?.criteria.length);
  } else { last.moves = []; last.strand = null; last.method = 'plain'; }
  return { removed, closingAsk };
}

// ------------------------------------------------------------------------------------------------------------------------------------------ CLI
const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
const sessFile = (dir: string, idx: number, arm: Arm) => path.join(dir, 'sessions', `s${idx}_${arm}.json`);
const loadS = (f: string): Session => JSON.parse(readFileSync(f, 'utf8')); const saveS = (f: string, s: Session) => writeFileSync(f, JSON.stringify(s, null, 1));
interface Cell { id: string; arm: Arm; sessions: string[] }
const loadCells = (dir: string): Cell[] => JSON.parse(readFileSync(path.join(dir, 'cells.json'), 'utf8'));

if (cmd === 'ready') {
  // Step 0: every chosen lesson has successCriteria and items tagged with criteria; no post-test item is a lesson exercise.
  let bad = 0; const lessonPrompts = new Set<string>();
  for (const f of FORMS) {
    const sp = LESSONS[f].spec; const okC = sp.successCriteria.length >= 2; const okI = sp.items.every((i) => i.criteria?.length && i.criteria.every((c) => c >= 1 && c <= sp.successCriteria.length) && i.acceptedAnswers.length && i.targetForms?.length);
    const covered = sp.successCriteria.map((_, k) => sp.items.some((i) => i.criteria.includes(k + 1)));
    console.log(f, { criteria: sp.successCriteria.length, items: sp.items.length, allItemsTagged: okI, everyCriterionHasAnItem: covered.every(Boolean) }); if (!okC || !okI || !covered.every(Boolean)) bad++;
    sp.items.forEach((i) => lessonPrompts.add(norm(i.prompt)));
  }
  for (const es of STUDENTS) for (const v of ['v1', 'v2'] as const) for (const it of postItems(es.form, es.band, v)) if (lessonPrompts.has(norm(it.prompt))) { console.log('OVERLAP', it.id); bad++; }
  console.log(bad ? `NOT READY (${bad} problems)` : 'READY: every lesson has successCriteria and tagged items; no post-test item is a lesson exercise'); process.exit(bad ? 1 : 0);
} else if (cmd === 'dry') {
  // Step 0.3: build the language context for an A2 learner with levelExplicit on; the rule line must appear before the first try.
  let fail = 0;
  for (const form of FORMS) for (const first of ['Hello! I want to practise this lesson. Can you give me an exercise?', 'Hello, I want to practise this topic.']) {
    const es = STUDENTS.find((x) => x.band === 'A2' && x.form === form && x.status === 'not_assessed')!;
    const s: Session = { arm: 'LE', studentIdx: es.idx, band: 'A2', form, status: es.status, persona: '', turns: [{ learner: first }] };
    const ctx = langCtx(s); const p = ctx.prompt;
    const rule = p.includes("First time this lesson's rule comes up") && p.includes('This learner needs the rule before the first try');
    const present = Boolean(ctx.signals.presentLessonItem); const itemShown = p.includes('Lesson item to present now');
    const answerLeak = LESSONS[form].spec.items.some((i) => i.acceptedAnswers.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p) && i.acceptedAnswers[0].split(' ').length === 1 && !/^(a|an|the|is|am|are)$/i.test(a)));
    console.log(form, JSON.stringify(first.slice(0, 40)), { moves: ctx.moves.map((m) => m.id), presentLessonItem: present, ruleBeforeFirstTryLine: rule, itemLine: itemShown, explicitFirst: (ctx as any).explicitFirst, arbitration: engineV2('arbitration'), answerWordInPrompt: answerLeak });
    if (!rule && first.includes('exercise')) fail++; // required case: the learner asks for an exercise. The greeting-only opener is informational (the tutor explains first, no exercise is presented yet).
  }
  console.log(fail ? `DRY CHECK FAILED in ${fail} case(s)` : 'DRY CHECK PASSED'); process.exit(fail ? 1 : 0);
} else if (cmd === 'init') {
  const dir = a1; mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  for (const es of STUDENTS) for (const arm of ARMS) { const f = sessFile(dir, es.idx, arm); if (existsSync(f)) continue; saveS(f, { arm, studentIdx: es.idx, band: es.band, form: es.form, status: es.status, persona: personaOf(es), turns: [] }); }
  const cells: Cell[] = []; for (const arm of ARMS) for (const half of [0, 1]) cells.push({ id: `${arm}${half}`, arm, sessions: STUDENTS.filter((e) => e.idx % 2 === half).map((e) => `s${e.idx}_${arm}`) });
  writeFileSync(path.join(dir, 'cells.json'), JSON.stringify(cells, null, 1)); console.log('sessions', STUDENTS.length * ARMS.length, 'cells', cells.length);
} else if (cmd === 'prompts' || cmd === 'apply') {
  const dir = a1; const cell = loadCells(dir).find((c) => c.id === a2)!; const phase = a3 as 'student' | 'tutor';
  if (cmd === 'prompts') {
    let n = 0;
    for (const key of cell.sessions) {
      const s = loadS(path.join(dir, 'sessions', `${key}.json`)); const lastT = s.turns[s.turns.length - 1];
      const needStudent = s.turns.length < 6 && (s.turns.length === 0 || lastT.tutor !== undefined); const needTutor = s.turns.length > 0 && lastT.tutor === undefined;
      if ((phase === 'student' && needStudent) || (phase === 'tutor' && needTutor)) { console.log(`\n########## SESSION ${key} ##########\n${phase === 'student' ? studentPrompt(s) : tutorPrompt(s)}`); n++; }
    }
    console.log(`\n(${n} session(s) need a ${phase} message in this cell)`);
  } else {
    const ans = JSON.parse(readFileSync(a4, 'utf8')) as Record<string, string>; let n = 0; const msgs: string[] = [];
    for (const key of cell.sessions) {
      const f = path.join(dir, 'sessions', `${key}.json`); const s = loadS(f); const lastT = s.turns[s.turns.length - 1]; const text = ans[key]; if (text === undefined) continue;
      if (typeof text !== 'string' || !text.trim()) { msgs.push(`${key}: empty answer ignored`); continue; }
      if (phase === 'student') { if (s.turns.length >= 6 || (s.turns.length && lastT.tutor === undefined)) { msgs.push(`${key}: not waiting for a student message`); continue; } s.turns.push({ learner: text.trim() }); }
      else { if (!s.turns.length || lastT.tutor !== undefined) { msgs.push(`${key}: not waiting for a tutor reply`); continue; } applyTutorReply(s, text); }
      saveS(f, s); n++;
    }
    console.log(`applied ${n}`, msgs.join('; '));
  }
} else if (cmd === 'status') {
  const dir = a1; const cells = loadCells(dir); const out: Record<string, string> = {};
  for (const c of cells) { const turns = c.sessions.map((k) => { const s = loadS(path.join(dir, 'sessions', `${k}.json`)); return s.turns.filter((t) => t.tutor !== undefined).length + (s.turns.length && s.turns[s.turns.length - 1].tutor === undefined ? 0.5 : 0); }); out[c.id] = `min ${Math.min(...turns)} max ${Math.max(...turns)} (of 6)`; }
  console.log(JSON.stringify(out, null, 1));
} else if (cmd === 'freeze') {
  const cfg = a1; mkdirSync(cfg, { recursive: true });
  const students = STUDENTS.map((es) => ({ studentIdx: es.idx, band: es.band, form: es.form, status: es.status, v1: postItems(es.form, es.band, 'v1'), v2: postItems(es.form, es.band, 'v2') }));
  const body = JSON.stringify({ note: 'Frozen BEFORE any session of the ESL stage-1 study. Per student and form: v1 = post-test, v2 = parallel "consistency check" form (given after an unrelated filler task; it does not measure memory over days). 4 controlled + 2 free-production + 2 next-level items each. Controlled and next-level items are scored deterministically (exact match of the missing word, benchmark/scoring.ts); free-production items are scored by blind scorer agents with the rubric in `freeRubric`. No item appears in any lesson exercise (eslStudy.ts ready). Tutors never see these items.', freeRubric: FREE_RUBRIC, students }, null, 1);
  writeFileSync(path.join(cfg, 'POSTTEST_ITEMS.json'), body); writeFileSync(path.join(cfg, 'POSTTEST_ITEMS.sha256'), `${sha(body)}\n`); console.log('frozen', students.length, 'students, sha', sha(body).slice(0, 16));
} else if (cmd === 'show') { console.log(dlg(loadS(a1))); }
export { postItems, scoreItem, itemBehaviour, readdirSync, FREE_RUBRIC };
