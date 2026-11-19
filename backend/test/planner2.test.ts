import { afterEach, describe, expect, it } from 'vitest';
import { planWithTrace, selectTeachingPlan, METHOD_RULES, type PlanInput } from '../src/services/pedagogyPolicy';
import { STRATEGIES, validateComposition } from '../src/services/strategyRegistry';
import {
  METHOD_TABLE, SHAPE_RULES, SHAPE_STAGES, allowedMain, chooseShape, stageMachine, levelRank, methodGateOk, planLesson, progressFromHistory, quickCheckSignals, reviewOpener, shapeLines, stageNow,
  type LessonShape, type PlannerSignals,
} from '../src/services/lessonPlanner';
import { engineV2 } from '../src/services/engineV2';
import { planGrid, PLAN_ENVS, hashOf } from './helpers/planGrid';

const saved = process.env.ENARA_ENGINE_V2;
afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
const withEnv = <T>(env: string, f: () => T): T => { const s = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = env; try { return f(); } finally { process.env.ENARA_ENGINE_V2 = s; } };

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  objectiveId: 'o1', masteryStatus: 'not_assessed', evidenceStrength: 'none', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [],
  recentResults: [], triedWithoutImprovement: [], ...over,
});
const adult = (over: Partial<PlannerSignals> = {}): PlannerSignals => ({ ageBand: 'adult', level: 'A2', ...over });
const ESL = 'esl5,levelExplicit,teach2';

// ---------------------------------------------------------------------------------------------------------------
// 1. Off-parity: with planner2 off, ped-v2 gives exactly the plans it gave before the rule-table refactor.
// Hashes taken from selectTeachingPlan at origin/claude/tutor-teaching edbbe3ce (before this change) over the seeded
// grid (6,000 inputs) under each switch set. If you change ped-v2 on purpose, update the hash and say why in the commit.
const BASELINE: Record<string, string> = {
  '': '697a8f4f99dc409124fcf6215d20fc2a317598b3cc055a0f6b49991b51a36783',
  levelExplicit: '540d7d77455544a4a7b8d851837d53c503fc667e791734f18417b05d11874df9',
  methodSelect: '6fe565a9a48e056caf4b828d7567874e36f94ebcf9ab552de8e1e0b2825d1f30',
  teach2: '6fe565a9a48e056caf4b828d7567874e36f94ebcf9ab552de8e1e0b2825d1f30',
  'levelExplicit,methodSelect': 'eda646570bd15102077e2614401a973263dce770d1e1b521580428dd52a48540',
  'esl5,levelExplicit,teach2': 'eda646570bd15102077e2614401a973263dce770d1e1b521580428dd52a48540',
  all: '697a8f4f99dc409124fcf6215d20fc2a317598b3cc055a0f6b49991b51a36783',
};

describe('off-parity', () => {
  it('ped-v2 plans are byte-identical to before the refactor, for every switch set', () => {
    for (const env of PLAN_ENVS) expect(withEnv(env, () => hashOf(planGrid().map((i) => selectTeachingPlan(i)))), env).toBe(BASELINE[env]);
  });
  it('planWithTrace with no options is selectTeachingPlan', () => {
    withEnv(ESL, () => { for (const i of planGrid(500)) expect(planWithTrace(i).plan).toEqual(selectTeachingPlan(i)); });
  });
  it('planner2 is off unless named (not in "all", not in teach2 or esl5)', () => {
    for (const env of ['', 'all', 'teach2', 'esl5', 'all,teach2,esl5']) expect(withEnv(env, () => engineV2('planner2')), env).toBe(false);
    expect(withEnv('teach2,planner2', () => engineV2('planner2'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Table-driven: one case per row.

describe('shape rows', () => {
  const cases: [string, PlannerSignals, string, LessonShape, string][] = [
    ['Pre-A1 adult', { ageBand: 'adult', level: 'Pre-A1 Starters', ladContent: true }, 'not_assessed', 'LAD', 'S2a'],
    ['Pre-A1 adult, no listen-and-do content', { ageBand: 'adult', level: 'Pre-A1 Starters' }, 'not_assessed', 'PPP', 'S5'],
    ['Pre-A1 child age 11', { ageBand: 'child', ageYears: 11, level: 'pre-a1', ladContent: true }, 'not_assessed', 'LAD', 'S2a'],
    ['child 7 at A1', { ageBand: 'child', ageYears: 7, level: 'A1', ladContent: true }, 'not_assessed', 'LAD', 'S2b'],
    ['child 7 at A1, no listen-and-do content -> PPP + child supports', { ageBand: 'child', ageYears: 7, level: 'A1' }, 'not_assessed', 'PPP', 'S2c'],
    ['child 8 at A2', { ageBand: 'child', ageYears: 8, level: 'A2', ladContent: true }, 'developing', 'LAD', 'S2b'],
    ['child 9 at A1', { ageBand: 'child', ageYears: 9, level: 'A1' }, 'not_assessed', 'PPP', 'S2c'],
    ['child 12 at B1 with goal', { ageBand: 'child', ageYears: 12, level: 'B1', goal: 'exam' }, 'proficient', 'PPP', 'S2c'],
    ['child, age unknown, A1', { ageBand: 'child', level: 'A1' }, 'not_assessed', 'PPP', 'S2c'],
    ['adult B1 developing, goal work', adult({ level: 'B1', goal: 'work' }), 'developing', 'TASK', 'S3'],
    ['teen B2 mastered, goal daily', { ageBand: 'teen', level: 'B2', goal: 'daily' }, 'mastered', 'TASK', 'S3'],
    ['adult B1 emerging, goal work (not secure enough)', adult({ level: 'B1', goal: 'work', quickCheck: { right: 2, of: 3 } }), 'emerging', 'TTT', 'S4'],
    ['adult B1 developing, goal school (not a TASK goal)', adult({ level: 'B1', goal: 'school' }), 'developing', 'PPP', 'S5'],
    ['adult A2, quick check 2 of 3', adult({ quickCheck: { right: 2, of: 3 } }), 'not_assessed', 'TTT', 'S4'],
    ['teen A1, quick check 3 of 3', { ageBand: 'teen', level: 'A1', quickCheck: { right: 3, of: 3 } }, 'not_assessed', 'TTT', 'S4'],
    ['adult A2, quick check 1 of 3', adult({ quickCheck: { right: 1, of: 3 } }), 'not_assessed', 'PPP', 'S5'],
    ['adult A2, no quick check', adult(), 'emerging', 'PPP', 'S5'],
    ['age unknown, A2', { ageBand: 'unknown', level: 'A2', quickCheck: { right: 3, of: 3 } }, 'proficient', 'PPP', 'S6'],
    ['age unknown, no level', { ageBand: 'unknown' }, 'not_assessed', 'PPP', 'S6'],
  ];
  it.each(cases)('%s', (_n, s, mastery, shape, row) => {
    const r = chooseShape(s, mastery);
    expect([r.shape, r.id]).toEqual([shape, row]);
  });
  it('S1 adds the review opener without changing the shape', () => {
    expect(reviewOpener({ ageBand: 'adult', sessionNumber: 2, earlierErrors: true })).toBe(true);
    expect(reviewOpener({ ageBand: 'adult', sessionNumber: 2, earlierErrors: false })).toBe(false);
    expect(reviewOpener({ ageBand: 'adult', sessionNumber: 1, earlierErrors: true })).toBe(false);
    expect(reviewOpener({ ageBand: 'adult', reviewDue: true })).toBe(true);
    const lp = planLesson(base({ masteryStatus: 'emerging' }), adult({ sessionNumber: 3, earlierErrors: true }));
    expect([lp.shape, lp.opener, lp.startStage]).toEqual(['PPP', true, 'present']);
    expect(lp.plan.reasonCodes).toContain('OPENER:S1');
  });
});

describe('method rows', () => {
  // [name, input, signals, env, expected main method, expected row]
  const cases: [string, Partial<PlanInput>, PlannerSignals, string, string, string][] = [
    ['teacher-assigned project (teacher-only ★ allows it)', { teacherStrategyId: 'project_based', masteryStatus: 'mastered' }, adult({ level: 'B1', goal: 'work' }), ESL, 'project_based', 'M1_TEACHER'],
    ['weak prerequisite', { weakPrerequisiteIds: ['p1'], masteryStatus: 'emerging' }, adult(), ESL, 'prerequisite_remediation', 'M2_PREREQUISITE'],
    ['review opening (methodSelect)', { reviewOpening: true, masteryStatus: 'developing' }, adult({ sessionNumber: 2, earlierErrors: true }), ESL, 'retrieval_practice', 'M3_REVIEW_OPENING'],
    ['retention lapsed', { retention: { due: false, lapsed: true }, masteryStatus: 'proficient' }, adult(), ESL, 'retrieval_practice', 'M4_RETENTION_LAPSED'],
    ['switch after no improvement', { masteryStatus: 'emerging', previous: { primary: 'worked_example', newEvidenceSince: true, improved: false }, triedWithoutImprovement: ['worked_example'] }, adult(), ESL, 'guided_practice', 'M5_SWITCH'],
    ['persistent confirmed error, A2 (metacognitive A2+ ★)', { masteryStatus: 'developing', misconceptions: [{ id: 'm', category: 'procedural_error', status: 'confirmed' }], triedWithoutImprovement: ['worked_example'] }, adult({ level: 'A2' }), ESL, 'metacognitive', 'M6_PERSISTENT'],
    ['persistent confirmed error, A1: metacognitive gated, next row', { masteryStatus: 'developing', misconceptions: [{ id: 'm', category: 'procedural_error', status: 'confirmed' }], triedWithoutImprovement: ['worked_example'] }, adult({ level: 'A1' }), ESL, 'guided_practice', 'M7b_PROCEDURAL'],
    ['conceptual error', { masteryStatus: 'emerging', misconceptions: [{ id: 'm', category: 'conceptual_misunderstanding' }] }, adult(), ESL, 'analogy', 'M7a_CONCEPTUAL'],
    ['form error', { masteryStatus: 'emerging', misconceptions: [{ id: 'm', category: 'procedural_error' }] }, adult(), ESL, 'worked_example', 'M7b_PROCEDURAL'],
    ['misread task', { masteryStatus: 'developing', misconceptions: [{ id: 'm', category: 'misinterpretation' }] }, adult(), ESL, 'error_analysis', 'M7c_MISREAD'],
    ['A1-A2 novice, no error', { masteryStatus: 'not_assessed', belowB1: true }, adult(), ESL, 'direct_instruction', 'M8_NOVICE_EXPLICIT'],
    ['application gap at B1', { masteryStatus: 'developing', applicationGap: true }, adult({ level: 'B1' }), ESL, 'blooms_guided', 'M9_APPLICATION_GAP'],
    ['emerging', { masteryStatus: 'emerging' }, adult({ level: 'B1' }), '', 'direct_instruction', 'M10_BY_MASTERY'],
    ['developing', { masteryStatus: 'developing' }, adult(), '', 'scaffolding', 'M10_BY_MASTERY'],
    ['proficient', { masteryStatus: 'proficient', subject: 'Grammar' }, adult(), '', 'mastery_learning', 'M10_BY_MASTERY'],
    ['mastered', { masteryStatus: 'mastered' }, adult(), '', 'retrieval_practice', 'M10_BY_MASTERY'],
    ['no evidence', { masteryStatus: 'not_assessed' }, adult(), '', 'formative_feedback', 'M10_BY_MASTERY'],
    ['L1 transfer error -> Arabic contrast ★', { masteryStatus: 'emerging', misconceptions: [{ id: 'm', category: 'l1_transfer' }] }, adult(), ESL, 'analogy', 'P1_L1_CONTRAST'],
    ['TASK, mastered, exam at B2 -> case ★', { masteryStatus: 'mastered', gradeLevel: 18 }, adult({ level: 'B2', goal: 'exam' }), ESL, 'case_based', 'P2_TASK_CASE'],
    ['TASK, mastered, exam at B1 -> case gated (B2+ ★), falls to feedback', { masteryStatus: 'mastered', gradeLevel: 18 }, adult({ level: 'B1', goal: 'exam' }), ESL, 'formative_feedback', 'FALLBACK'],
    ['TASK, mastered, daily life -> problem ★', { masteryStatus: 'mastered', gradeLevel: 18 }, adult({ level: 'B1', goal: 'daily' }), ESL, 'problem_based', 'P3_TASK_PROBLEM'],
    ['TASK, proficient, discussion -> Socratic in language focus', { masteryStatus: 'proficient', subject: 'History', gradeLevel: 18 }, adult({ level: 'B1', goal: 'work' }), ESL, 'socratic_questioning', 'M10_BY_MASTERY'],
  ];
  it.each(cases)('%s', (_n, over, s, env, primary, row) => {
    const lp = withEnv(env, () => planLesson(base(over), s));
    expect([lp.plan.primary, lp.methodRule]).toEqual([primary, row]);
    expect(validateComposition(lp.plan)).toEqual([]);
  });
  it('a method with no stage in the shape is skipped and the next row applies (PPP: no Socratic)', () => {
    const lp = withEnv('', () => planLesson(base({ masteryStatus: 'proficient', subject: 'History', gradeLevel: 18 }), adult({ level: 'B2' })));
    expect(lp.shape).toBe('PPP');
    expect(lp.plan.primary).not.toBe('socratic_questioning');
    expect(lp.skipped.length).toBeGreaterThan(0);
  });
});

describe('★ gates', () => {
  it('elaborative and concept mapping only at B1+ (any role)', () => {
    expect(methodGateOk('elaborative_interrogation', adult({ level: 'A2' }))).toBe(false);
    expect(methodGateOk('elaborative_interrogation', adult({ level: 'B1' }))).toBe(true);
    expect(methodGateOk('concept_mapping', adult({ level: 'A2' }))).toBe(false);
    const lp = withEnv('', () => planLesson(base({ masteryStatus: 'proficient', subject: 'Grammar', relatedSecureObjectives: 0 }), adult({ level: 'A2' })));
    expect(lp.plan.primary).toBe('mastery_learning');
    expect(lp.plan.supporting).not.toContain('elaborative_interrogation');
    expect(lp.plan.reasonCodes).toContain('GATED:elaborative_interrogation');
  });
  it('unknown level = no level gate (today\'s behaviour)', () => {
    expect(methodGateOk('elaborative_interrogation', { ageBand: 'adult' })).toBe(true);
  });
  it('case-based only at B2+, project-based only when a teacher assigns it', () => {
    expect(methodGateOk('case_based', adult({ level: 'B1' }))).toBe(false);
    expect(methodGateOk('case_based', adult({ level: 'B2' }))).toBe(true);
    expect(methodGateOk('project_based', adult({ level: 'C1' }))).toBe(false);
    expect(methodGateOk('project_based', adult({ level: 'C1' }), 'project_based')).toBe(true);
  });
  it('metacognitive A2+; interleaving not under 9 when the age is known', () => {
    expect(methodGateOk('metacognitive', adult({ level: 'A1' }))).toBe(false);
    expect(methodGateOk('interleaving', { ageBand: 'child', ageYears: 8 })).toBe(false);
    expect(methodGateOk('interleaving', { ageBand: 'child', ageYears: 10 })).toBe(true);
  });
  it('children get scaffolding and a story or game frame; LAD gets a story', () => {
    const lad = withEnv(ESL, () => planLesson(base({ masteryStatus: 'not_assessed', belowB1: true, ageBand: 'child' }), { ageBand: 'child', ageYears: 7, level: 'A1', ladContent: true }));
    expect(lad.shape).toBe('LAD');
    expect(lad.plan.supporting).toEqual(expect.arrayContaining(['narrative_contextual']));
    expect(lad.childSupports).toBe(true);
    const ppp = withEnv(ESL, () => planLesson(base({ masteryStatus: 'developing', ageBand: 'child' }), { ageBand: 'child', ageYears: 10, level: 'A1' }));
    expect([ppp.shape, ppp.plan.primary]).toEqual(['PPP', 'scaffolding']);
    expect(ppp.plan.supporting.some((x) => x === 'gamification' || x === 'narrative_contextual')).toBe(true);
    const ppp2 = withEnv(ESL, () => planLesson(base({ masteryStatus: 'emerging', ageBand: 'child' }), { ageBand: 'child', ageYears: 11, level: 'A2' }));
    expect(ppp2.plan.supporting).toContain('scaffolding');
    expect(shapeLines(ppp2).join('\n')).toMatch(/Child learner/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Coverage: every signal combination gets exactly one shape row, every row is reachable, and the invariants hold.

const AGES: [PlannerSignals['ageBand'], number | undefined][] = [['child', undefined], ['child', 6], ['child', 8], ['child', 9], ['child', 12], ['teen', 15], ['adult', 30], ['unknown', undefined]];
const LEVELS = [undefined, 'Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1'];
const GOALS: PlannerSignals['goal'][] = [undefined, 'work', 'exam', 'daily', 'school'];
const CHECKS: PlannerSignals['quickCheck'][] = [undefined, { right: 0, of: 3 }, { right: 1, of: 3 }, { right: 2, of: 3 }, { right: 3, of: 3 }];
const MASTERY = ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'];
function* signalGrid(): Generator<[PlannerSignals, string]> {
  for (const [ageBand, ageYears] of AGES) for (const level of LEVELS) for (const goal of GOALS) for (const quickCheck of CHECKS) for (const m of MASTERY) for (const quickCheckPending of [false, true]) for (const ladContent of [false, true]) yield [{ ageBand, ageYears, level, goal, quickCheck, quickCheckPending, ladContent }, m];
}

describe('coverage', () => {
  it('every combination hits exactly one row (the first true one), every row is reached, invariants hold', () => {
    const reached = new Set<string>();
    let n = 0;
    for (const [s, m] of signalGrid()) {
      n++;
      const matches = SHAPE_RULES.filter((r) => r.test(s, m));
      expect(matches.length).toBeGreaterThan(0);
      const r = chooseShape(s, m);
      expect(r).toBe(matches[0]);
      reached.add(r.id);
      const lr = levelRank(s.level);
      // LAD exactly for Pre-A1, or a child known to be under 9
      expect(r.shape === 'LAD').toBe(Boolean(s.ladContent) && (lr === 0 || (s.ageBand === 'child' && s.ageYears !== undefined && s.ageYears < 9)));
      if (s.ageBand === 'child') expect(['LAD', 'PPP']).toContain(r.shape);
      if (r.shape === 'TTT') expect(r.id === 'S4q' ? s.quickCheckPending : s.quickCheck!.right * 3 >= s.quickCheck!.of * 2).toBe(true);
      if (r.shape === 'TASK') expect((lr ?? -1) >= 3 && ['work', 'exam', 'daily'].includes(s.goal ?? '')).toBe(true);
      if (s.ageBand === 'unknown') expect(r.shape).toBe(lr === 0 && s.ladContent ? 'LAD' : 'PPP');
    }
    expect(n).toBe(AGES.length * LEVELS.length * GOALS.length * CHECKS.length * MASTERY.length * 4);
    expect([...reached].sort()).toEqual(SHAPE_RULES.map((r) => r.id).sort());
  });

  it('every registry method has a row in the method table, and every table row is a registry method', () => {
    expect(Object.keys(METHOD_TABLE).sort()).toEqual(STRATEGIES.map((m) => m.id).sort());
  });

  it('over the seeded grid and all signals: main method fits the shape, gates hold, composition is valid', () => {
    const reachedRows = new Set<string>();
    const inputs = planGrid(1500);
    const sigs: PlannerSignals[] = [
      { ageBand: 'adult', level: 'A1' }, { ageBand: 'adult', level: 'B2', goal: 'work' }, { ageBand: 'teen', level: 'A2', quickCheck: { right: 2, of: 3 } },
      { ageBand: 'child', ageYears: 7, level: 'A1', ladContent: true }, { ageBand: 'child', ageYears: 7, level: 'A1' }, { ageBand: 'child', ageYears: 10, level: 'A2' }, { ageBand: 'unknown' }, { ageBand: 'adult', level: 'Pre-A1' },
      { ageBand: 'adult', level: 'B1', goal: 'daily' }, { ageBand: 'adult', level: 'C1', goal: 'exam' },
    ];
    for (const env of ['', ESL]) withEnv(env, () => {
      for (const i of inputs) for (const s of sigs) {
        const lp = planLesson(i, s);
        reachedRows.add(lp.methodRule);
        const p = lp.plan.primary;
        const ok = allowedMain(p, lp.shape, s, i.teacherStrategyId) || (lp.opener && p === 'retrieval_practice');
        expect(ok, `${p} in ${lp.shape}`).toBe(true);
        expect(validateComposition(lp.plan), JSON.stringify(lp.plan)).toEqual([]);
        for (const id of [...lp.plan.supporting, ...(lp.plan.reinforcement ? [lp.plan.reinforcement] : [])]) expect(methodGateOk(id, s, i.teacherStrategyId), id).toBe(true);
        if (p === 'project_based') expect(i.teacherStrategyId).toBe('project_based');
        // children always get scaffolding, unless the main method is scaffolding or the registry forbids the pair (e.g. a teacher's Project-Based withholds answers)
        const fits = validateComposition({ ...lp.plan, supporting: ['scaffolding'], reinforcement: undefined }).length === 0;
        if (lp.childSupports && p !== 'scaffolding' && fits) expect(lp.plan.supporting, JSON.stringify(lp.plan)).toContain('scaffolding');
        expect(lp.stages).toEqual(SHAPE_STAGES[lp.shape]);
        expect(lp.startStage).toBe(lp.stages[0]);
        expect(lp.stages).toContain(lp.methodStage);
        expect(lp.explanation.length).toBeGreaterThan(20);
      }
    });
    // every ped-v2 row is reachable through the planner (P1 needs an l1_transfer error, tested above)
    for (const r of METHOD_RULES) expect(reachedRows, r.id).toContain(r.id);
  });

  it('unchanged except ★: in PPP, when ped-v2\'s main method has a PPP stage and no gate, planner2 picks the same one', () => {
    for (const env of ['', ESL]) withEnv(env, () => {
      let same = 0;
      for (const i of planGrid(3000)) {
        const s: PlannerSignals = { ageBand: 'adult' }; // level unknown: no level gate
        const old = selectTeachingPlan(i);
        const lp = planLesson(i, s);
        expect(lp.shape).toBe('PPP');
        if (allowedMain(old.primary, 'PPP', s, i.teacherStrategyId)) {
          expect(lp.plan.primary).toBe(old.primary);
          same++;
        }
      }
      expect(same).toBeGreaterThan(1500);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Stages: code moves the stage on, forward only.

describe('stages', () => {
  it('planner2b: each shape moves only on graded evidence (ev[0] = the opening message)', () => {
    const o = 'none' as const;
    expect(stageMachine('PPP', [o])).toBe('present');
    expect(stageMachine('PPP', [o, 'bad'])).toBe('practise');
    expect(stageMachine('PPP', [o, 'ok', 'bad', 'ok'])).toBe('practise'); // not 2 in a row
    expect(stageMachine('PPP', [o, 'ok', 'ok'])).toBe('produce');
    expect(stageMachine('PPP', [o, 'ok', 'ok', 'none'])).toBe('check');
    expect(stageMachine('TTT', [o])).toBe('test');
    expect(stageMachine('TASK', [o])).toBe('pretask');
    expect(stageMachine('LAD', [o])).toBe('listen');
    expect(stageMachine('LAD', [o, 'ok', 'ok'])).toBe('chant');
  });
  it('progress comes from stored, code-graded verdicts; the stage follows it', () => {
    const t = (verdict?: string, ownSentence?: string) => ({ role: 'assistant', languageTurn: { ...(verdict ? { assessment: { verdict } } : {}), ...(ownSentence ? { ownSentence } : {}) } });
    const h = [{ role: 'user' }, t(), { role: 'user' }, t('INCORRECT'), { role: 'user' }, t('CORRECT'), { role: 'user' }, t('NOT_EVALUATED'), { role: 'user' }, t('CORRECT_WITH_EQUIVALENT_FORMULATION')];
    const p = progressFromHistory(h);
    expect([p.tries, p.right, p.ownSentenceDone]).toEqual([3, 2, false]);
    expect(p.events).toEqual(['none', 'bad', 'ok', 'none', 'ok', 'none']); // one per learner message (last = this turn, ungraded)
    expect(stageMachine('PPP', progressFromHistory([]).events!)).toBe('present');
    expect(progressFromHistory([{ role: 'user', languageTurn: { assessment: { verdict: 'CORRECT' } } }]).tries).toBe(0); // a learner turn never counts
  });
  it('without history (voice) no stage is claimed: start at the first stage', () => {
    const lp = planLesson(base({ masteryStatus: 'emerging' }), adult());
    const lines = shapeLines(lp).join('\n');
    expect(lines).toMatch(/Start with: Present/);
    expect(lines).not.toMatch(/This turn's stage/);
  });
  it('prompt lines name the shape and only the current stage', () => {
    const lp = planLesson(base({ masteryStatus: 'emerging' }), adult());
    const lines = shapeLines(lp, 'practise').join('\n');
    expect(lines).toMatch(/present, practise, produce/);
    expect(lines).toMatch(/This turn's stage: Practise/);
    expect(lines).not.toMatch(/This turn's stage: Present/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Golden traces: 20 fixed learner journeys; the whole decision (shape, rows, plan, explanation) is snapshotted.

const JOURNEYS: [string, Partial<PlanInput>[], PlannerSignals][] = [
  ['adult A1 beginner, 3 lessons', [{ masteryStatus: 'not_assessed', belowB1: true }, { masteryStatus: 'emerging', belowB1: true, misconceptions: [{ id: 'm', category: 'procedural_error' }] }, { masteryStatus: 'developing', belowB1: true }], adult({ level: 'A1' })],
  ['adult A2 who knows some (TTT)', [{ masteryStatus: 'not_assessed', belowB1: true }, { masteryStatus: 'proficient', belowB1: true, subject: 'Grammar' }], adult({ quickCheck: { right: 2, of: 3 } })],
  ['adult B1 with a work goal', [{ masteryStatus: 'developing' }, { masteryStatus: 'proficient', subject: 'English' }, { masteryStatus: 'mastered', gradeLevel: 18 }], adult({ level: 'B1', goal: 'work' })],
  ['adult B2 exam', [{ masteryStatus: 'proficient', subject: 'History', gradeLevel: 18 }, { masteryStatus: 'mastered', gradeLevel: 18 }], adult({ level: 'B2', goal: 'exam' })],
  ['teen A2 school goal', [{ masteryStatus: 'emerging', belowB1: true }, { masteryStatus: 'developing', belowB1: true, applicationGap: true }], { ageBand: 'teen', level: 'A2', goal: 'school' }],
  ['teen A1 3/3 quick check', [{ masteryStatus: 'not_assessed', belowB1: true }], { ageBand: 'teen', level: 'A1', quickCheck: { right: 3, of: 3 } }],
  ['child 6 Pre-A1', [{ masteryStatus: 'not_assessed', belowB1: true, ageBand: 'child' }, { masteryStatus: 'emerging', belowB1: true, ageBand: 'child' }], { ageBand: 'child', ageYears: 6, level: 'Pre-A1' }],
  ['child 8 A1', [{ masteryStatus: 'not_assessed', belowB1: true, ageBand: 'child' }, { masteryStatus: 'developing', belowB1: true, ageBand: 'child' }], { ageBand: 'child', ageYears: 8, level: 'A1' }],
  ['child 9 A1', [{ masteryStatus: 'emerging', belowB1: true, ageBand: 'child' }, { masteryStatus: 'proficient', belowB1: true, ageBand: 'child', subject: 'Grammar', formRightTwice: true }], { ageBand: 'child', ageYears: 9, level: 'A1' }],
  ['child 12 A2', [{ masteryStatus: 'developing', belowB1: true, ageBand: 'child', misconceptions: [{ id: 'm', category: 'conceptual_misunderstanding' }] }], { ageBand: 'child', ageYears: 12, level: 'A2' }],
  ['child, kids mode, age unknown', [{ masteryStatus: 'not_assessed', belowB1: true, ageBand: 'child' }], { ageBand: 'child', level: 'A1' }],
  ['adult Pre-A1 (LAD at any age)', [{ masteryStatus: 'not_assessed', belowB1: true }], { ageBand: 'adult', level: 'Pre-A1' }],
  ['second session with earlier errors', [{ masteryStatus: 'developing', belowB1: true, reviewOpening: true }], adult({ sessionNumber: 2, earlierErrors: true })],
  ['retention lapsed', [{ masteryStatus: 'proficient', retention: { due: true, lapsed: true } }], adult({ level: 'B1', reviewDue: true })],
  ['persistent error at A1', [{ masteryStatus: 'developing', belowB1: true, misconceptions: [{ id: 'm', category: 'procedural_error', status: 'confirmed' }], triedWithoutImprovement: ['worked_example'] }], adult({ level: 'A1' })],
  ['Arabic transfer error', [{ masteryStatus: 'emerging', belowB1: true, misconceptions: [{ id: 'm', category: 'l1_transfer' }] }], adult({ level: 'A2' })],
  ['weak prerequisite', [{ masteryStatus: 'emerging', weakPrerequisiteIds: ['p1'] }], adult()],
  ['teacher assigns project', [{ masteryStatus: 'mastered', teacherStrategyId: 'project_based' }], adult({ level: 'B1', goal: 'work' })],
  ['age unknown, no level', [{ masteryStatus: 'not_assessed' }, { masteryStatus: 'mastered', relatedSecureObjectives: 3 }], { ageBand: 'unknown' }],
  ['adult B1, no goal, proficient', [{ masteryStatus: 'proficient', subject: 'English', relatedSecureObjectives: 2 }], adult({ level: 'B1' })],
];

describe('golden traces', () => {
  it.each(JOURNEYS)('%s', (_n, steps, s) => {
    const trace = withEnv(ESL, () => steps.map((over) => {
      const lp = planLesson(base(over), s);
      return { shape: lp.shape, shapeRule: lp.shapeRule, opener: lp.opener, startStage: lp.startStage, methodStage: lp.methodStage, childSupports: lp.childSupports, methodRule: lp.methodRule, skipped: lp.skipped, primary: lp.plan.primary, supporting: lp.plan.supporting, reinforcement: lp.plan.reinforcement ?? null, reasons: lp.plan.reasonCodes, explanation: lp.explanation };
    }));
    expect(trace).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Live signals: quick check, goal, birth date, Arabic-transfer errors.
import { detectL1Transfer, diagnoseError, L1_TRANSFER_CODES } from '../src/services/languageLearningState';
import { parseBirthDate, parseGoal } from '../src/services/learnerSignals';
import { QUICK_CHECK_DROPPED, QUICK_CHECK_LINE } from '../src/services/languageTeachingContext';

describe('quick check', () => {
  const g = (verdict: string) => ({ role: 'assistant', languageTurn: { assessment: { verdict } } });
  it('teens and adults (not Pre-A1, no review opener) open with a pending check; children and voice never', () => {
    const p0 = progressFromHistory([]);
    expect(quickCheckSignals(adult(), p0, false)).toEqual({ quickCheckPending: true });
    expect(quickCheckSignals({ ageBand: 'teen', level: 'B1' }, p0, false)).toEqual({ quickCheckPending: true });
    expect(quickCheckSignals({ ageBand: 'child', ageYears: 10, level: 'A1' }, p0, false)).toEqual({});
    expect(quickCheckSignals(adult({ level: 'Pre-A1' }), p0, false)).toEqual({});
    expect(quickCheckSignals(adult(), p0, true)).toEqual({});
    expect(quickCheckSignals(adult(), undefined, false)).toEqual({}); // voice: no history
  });
  it('a TASK learner skips the quick check (S3 comes first)', () => {
    const s = adult({ level: 'B1', goal: 'work' });
    const lp = planLesson(base({ masteryStatus: 'developing' }), { ...s, ...quickCheckSignals(s, progressFromHistory([]), false) });
    expect(lp.shape).toBe('TASK');
  });
  it('the prompt never lets the tutor ask the age', () => {
    expect(shapeLines(planLesson(base(), adult())).join('\n')).toMatch(/Never ask the learner their age/);
  });
});

describe('goal and birth date input', () => {
  it('goal: only work, exam, daily, school', () => {
    for (const g of ['work', 'exam', 'daily', 'school']) expect(parseGoal(g)).toBe(g);
    for (const g of ['Work', 'travel', '', null, 3]) expect(() => parseGoal(g)).toThrow();
  });
  it('birth date: YYYY-MM-DD, age 3-100', () => {
    const now = new Date('2026-11-19T00:00:00Z');
    expect(parseBirthDate('2018-05-01', now).toISOString()).toBe('2018-05-01T00:00:00.000Z');
    for (const d of ['2025-01-01', '1900-01-01', '01/05/2018', '2018-13-01', 'x', 20180501]) expect(() => parseBirthDate(d, now)).toThrow();
  });
});

describe('Arabic-transfer errors (l1_transfer)', () => {
  const yes: [string, string][] = [
    ['She teacher.', 'copula_omitted'], ['He is doctor.', 'article_omitted'], ['He going to school now.', 'progressive_no_be'],
    ['I am agree with you.', 'be_with_base_verb'], ['My brother he works in a bank.', 'subject_doubled'],
    ['This is the book that I read it.', 'resumptive_pronoun'], ['I have 25 years.', 'age_with_have'],
  ];
  const no = ['She is a teacher.', 'He is going to school now.', 'I agree with you.', 'My brother works in a bank.', 'This is the book that I read.', 'I am 25 years old.', 'I have lived here for 5 years.', 'Nothing happened.', 'Good morning everyone.'];
  it.each(yes)('finds: %s', (text, code) => { expect(detectL1Transfer(text)?.code).toBe(code); });
  it.each(no.map((x) => [x]))('silent: %s', (text) => { expect(detectL1Transfer(text)).toBeNull(); });
  it('every code is an Arabic-transfer code with a cue that names no answer word', () => {
    for (const [t] of yes) {
      const d = detectL1Transfer(t)!;
      expect(L1_TRANSFER_CODES).toContain(d.code);
      expect(d.cue).not.toMatch(/\b(is|am|are|a|an|the)\b/);
    }
  });
  it('the item diagnosis uses it only with planner2 (off: unchanged)', () => {
    const item = { id: 'i', prompt: 'Write a sentence about your brother.', acceptedAnswers: ['My brother works in a bank.'], targetForms: ['works'] } as never;
    expect(withEnv('', () => diagnoseError('My brother he works in a bank.', item))?.code).not.toBe('subject_doubled');
    expect(withEnv('planner2', () => diagnoseError('My brother he works in a bank.', item))?.code).toBe('subject_doubled');
  });
  it('two in-session Arabic-transfer errors make the plan contrast with Arabic', () => {
    const lp = withEnv(ESL, () => planLesson(base({ masteryStatus: 'emerging', belowB1: true, misconceptions: [{ id: 'l1', category: 'l1_transfer', status: 'suspected' }] }), adult()));
    expect([lp.plan.primary, lp.methodRule]).toEqual(['analogy', 'P1_L1_CONTRAST']);
    expect(shapeLines(lp).join('\n')).toMatch(/Contrast the English form with how Arabic says it/);
  });
});

describe('fixes from the harness build', () => {
  const g = (verdict?: string) => ({ role: 'assistant', languageTurn: verdict ? { assessment: { verdict } } : {} });
  const u = { role: 'user' };
  it('children and other no-check lessons are not reset at the 4th graded answer', () => {
    const h = [u, g('CORRECT'), u, g('CORRECT'), u, g('CORRECT'), u, g('INCORRECT')];
    const p = progressFromHistory(h);
    const kid = planLesson(base({ masteryStatus: 'emerging' }), { ageBand: 'child', ageYears: 10, level: 'A1' });
    expect(kid.quickCheckUsed).toBe(false);
    expect(stageNow(kid, p)).toBe('check'); // 2 right in a row -> produce -> check (no reset to present)
    const lad = planLesson(base({ masteryStatus: 'emerging' }), { ageBand: 'child', ageYears: 7, level: 'A1', ladContent: true });
    expect(stageNow(lad, p)).toBe('check');
  });
  it('TASK moves on: pre-task, task (2 role-play answers), focus on an error, then one repeat', () => {
    const s = adult({ level: 'B1', goal: 'work' });
    const lp = planLesson(base({ masteryStatus: 'developing' }), s);
    expect(stageNow(lp, progressFromHistory([]))).toBe('pretask');
    expect(stageNow(lp, progressFromHistory([u, g()]))).toBe('task');
    expect(stageNow(lp, progressFromHistory([u, g(), u, g()]))).toBe('task');
    expect(stageNow(lp, progressFromHistory([u, g(), u, g(), u, g('INCORRECT')]))).toBe('focus');
    expect(stageNow(lp, progressFromHistory([u, g(), u, g(), u, g('INCORRECT'), u, g()]))).toBe('focus');
    // this turn's answer (the fix) is right -> this reply repeats the task
    expect(stageNow(lp, progressFromHistory([u, g(), u, g(), u, g('INCORRECT'), u, g()], { verdict: 'CORRECT' }))).toBe('repeat');
  });
  it('the quick check closes after 4 learner answers even if fewer than 3 could be graded', () => {
    const p = progressFromHistory([u, g('CORRECT'), u, g(), u, g(), u, g()]);
    expect(p.quickCheck).toEqual({ right: 1, of: 1 });
    const lp = planLesson(base({ masteryStatus: 'emerging' }), { ...adult(), ...quickCheckSignals(adult(), p, false) });
    expect([lp.shape, lp.shapeRule, stageNow(lp, p)]).toEqual(['TTT', 'S4', 'teach']);
    const p0 = progressFromHistory([u, g(), u, g(), u, g(), u, g()]);
    const lp0 = planLesson(base({ masteryStatus: 'emerging' }), { ...adult(), ...quickCheckSignals(adult(), p0, false) });
    expect([lp0.shape, lp0.shapeRule]).toEqual(['PPP', 'S5']);
  });
});

describe('pln2 deviation 1: present/listen last for the opening reply only', () => {
  const u = { role: 'user' }; const a = { role: 'assistant', languageTurn: {} };
  it('no graded answer yet: present, then practise; listen, then do', () => {
    expect(stageMachine('PPP', progressFromHistory([]).events!)).toBe('present');
    expect(stageMachine('PPP', progressFromHistory([u, a]).events!)).toBe('practise');
    expect(stageMachine('LAD', progressFromHistory([]).events!)).toBe('listen');
    expect(stageMachine('LAD', progressFromHistory([u, a]).events!)).toBe('do');
  });
});

describe('pln2 amendment C: the quick check is one step', () => {
  const u = { role: 'user' }; const a = (verdict?: string) => ({ role: 'assistant', languageTurn: verdict ? { assessment: { verdict } } : {} });
  const qc = (hist: { role: string }[], current?: string) => {
    const p = progressFromHistory(hist, { verdict: current ?? null });
    const lp = planLesson(base({ masteryStatus: 'emerging', belowB1: true }), { ...adult(), ...quickCheckSignals(adult(), p, false) });
    return { p, lp, stage: stageNow(lp, p) };
  };
  it('reply 1 is the check (no teaching); reply 2 already teaches, decided on the answer graded in that same turn', () => {
    const r1 = qc([]);
    expect([r1.lp.shapeRule, r1.stage]).toEqual(['S4q', 'test']);
    const right = qc([u, a()], 'CORRECT');
    expect([right.lp.shape, right.lp.shapeRule, right.stage]).toEqual(['TTT', 'S4', 'teach']);
    const wrong = qc([u, a()], 'INCORRECT');
    expect([wrong.lp.shape, wrong.lp.shapeRule, wrong.stage]).toEqual(['PPP', 'S5', 'present']);
    const ungraded = qc([u, a()], null as never);
    expect([ungraded.lp.shape, ungraded.lp.shapeRule]).toEqual(['PPP', 'S5']);
  });
  it('the run bug: a teen is never still in the check on reply 3 or 4', () => {
    for (const v of ['CORRECT', 'INCORRECT', undefined]) {
      expect(qc([u, a(), u, a(v)], 'INCORRECT').lp.shapeRule).not.toBe('S4q');
      expect(qc([u, a(), u, a(v), u, a('CORRECT')]).lp.shapeRule).not.toBe('S4q');
    }
  });
  it('TTT moves on to the re-test after a right answer following the check', () => {
    const r = qc([u, a(), u, a('CORRECT')], 'CORRECT');
    expect([r.lp.shape, r.stage]).toEqual(['TTT', 'retest']);
  });
  it('check prompts: one exercise, no teaching in that reply, method replaced, overrides the rest', async () => {
    const m = await import('../src/services/lessonPlanner');
    const lp = qc([]).lp;
    expect(m.quickCheckActive(lp)).toBe(true);
    expect(shapeLines(lp, 'test').join('\n')).toMatch(/one short exercise/);
    expect(m.QUICK_CHECK_PLAN_LINE).toMatch(/one-item quick check/);
    expect(QUICK_CHECK_LINE).toMatch(/ONE short exercise/);
    expect(QUICK_CHECK_LINE).toMatch(/overrides any instruction above/);
    for (const mv of ['corrective_feedback_retry', 'scaffold_hint', 'answer_with_reasoning', 'short_explanation']) expect(QUICK_CHECK_DROPPED.has(mv as never)).toBe(true);
  });
});

describe('planner2b: move on only on evidence; on errors go back to teaching', () => {
  const o = 'none' as const;
  it('PPP/LAD check is ONE step: right -> done; wrong -> targeted practice (1 right) -> check again', () => {
    const toCheck = [o, 'ok', 'ok', 'none'] as const;
    expect(stageMachine('PPP', [...toCheck, 'ok'])).toBe('done');
    expect(stageMachine('PPP', [...toCheck, 'bad'])).toBe('practise');
    expect(stageMachine('PPP', [...toCheck, 'bad', 'ok'])).toBe('check');
    expect(stageMachine('PPP', [...toCheck, 'bad', 'ok', 'ok'])).toBe('done');
    expect(stageMachine('PPP', [...toCheck, 'none', 'none'])).toBe('check'); // ungraded: stays, never moves on a count
    expect(stageMachine('PPP', [...toCheck, 'ok', 'bad'])).toBe('done'); // done is the end of this lesson's point
    expect(stageMachine('LAD', [...toCheck, 'bad'])).toBe('do');
    expect(stageMachine('LAD', [...toCheck, 'ok'])).toBe('done');
  });
  it('TTT: teach until right, retest; a wrong retest goes back to teach', () => {
    expect(stageMachine('TTT', [o, 'bad'])).toBe('teach');
    expect(stageMachine('TTT', [o, 'ok', 'none'])).toBe('teach');
    expect(stageMachine('TTT', [o, 'ok', 'ok'])).toBe('retest');
    expect(stageMachine('TTT', [o, 'ok', 'ok', 'bad'])).toBe('teach');
    expect(stageMachine('TTT', [o, 'ok', 'ok', 'ok'])).toBe('done');
  });
  it('TASK: errors -> focus before any repeat; at most one repeat; no errors -> done', () => {
    const task = (a: 'ok' | 'bad' | 'none', b: 'ok' | 'bad' | 'none', c: 'ok' | 'bad' | 'none') => [o, a, b, c] as ('ok' | 'bad' | 'none')[];
    expect(stageMachine('TASK', task('none', 'none', 'none'))).toBe('done');
    expect(stageMachine('TASK', task('none', 'bad', 'none'))).toBe('focus');
    expect(stageMachine('TASK', [...task('none', 'bad', 'none'), 'none'])).toBe('focus'); // stays until the fix is right
    expect(stageMachine('TASK', [...task('none', 'bad', 'none'), 'ok'])).toBe('repeat');
    expect(stageMachine('TASK', [...task('none', 'bad', 'none'), 'ok', 'ok'])).toBe('done');
    expect(stageMachine('TASK', [...task('none', 'bad', 'none'), 'ok', 'bad'])).toBe('focus');
    expect(stageMachine('TASK', [...task('none', 'bad', 'none'), 'ok', 'bad', 'ok'])).toBe('done'); // no second repeat
  });
  it('TASK (planner2c): two wrong answers in a row inside the task end it early -> focus (PLN2b stuck learner s2001)', () => {
    // s2001: "I get up always at seven." three times; the task held the learner for 3 messages before teaching.
    expect(stageMachine('TASK', [o, 'bad'])).toBe('task'); // one error: the task goes on
    expect(stageMachine('TASK', [o, 'bad', 'bad'])).toBe('focus'); // second error in a row: teach now, not on turn 3
    expect(stageMachine('TASK', [o, 'bad', 'bad', 'bad'])).toBe('focus'); // stays in focus until the fix is right
    expect(stageMachine('TASK', [o, 'bad', 'bad', 'ok'])).toBe('repeat');
    expect(stageMachine('TASK', [o, 'bad', 'ok'])).toBe('task'); // not in a row: the task goes on
    expect(stageMachine('TASK', [o, 'bad', 'ok', 'bad'])).toBe('focus'); // ends at 3 messages with errors, as before
    expect(stageMachine('TASK', [o, 'ok', 'none', 'none'])).toBe('done');
  });
  it('planner2c: a task sentence is graded only after the reply, so the same wrong sentence sent again counts as wrong now', () => {
    const wrong = { assessment: { verdict: 'INCORRECT' } };
    const hist = [
      { role: 'user', content: 'Hello! I have an exam. Can we practise always and usually?' },
      { role: 'assistant', content: 'Tell me about your morning.', languageTurn: { assessment: { verdict: 'NOT_EVALUATED' } } },
      { role: 'user', content: 'I get up always at seven.' },
      { role: 'assistant', content: 'Nice. And after that?', languageTurn: wrong },
    ];
    const rep = progressFromHistory(hist, { verdict: null, message: 'I get up always at seven.' });
    expect(rep.events).toEqual(['none', 'bad', 'bad']);
    expect(stageMachine('TASK', rep.events!)).toBe('focus'); // teach now, one reply earlier than before
    const other = progressFromHistory(hist, { verdict: null, message: 'Then I drink coffee.' });
    expect(other.events).toEqual(['none', 'bad', 'none']); // a new sentence is not graded yet
    expect(stageMachine('TASK', other.events!)).toBe('task');
    const afterRight = progressFromHistory([...hist.slice(0, 3), { role: 'assistant', content: 'Good.', languageTurn: { assessment: { verdict: 'CORRECT' } } }], { verdict: null, message: 'I get up always at seven.' });
    expect(afterRight.events).toEqual(['none', 'ok', 'none']); // only a repeat of a WRONG answer counts
  });
  it('a diagnosed error counts as an error even without a wrong verdict', () => {
    const h = [{ role: 'user' }, { role: 'assistant', languageTurn: { diagnosis: 'copula_omitted' } }];
    expect(progressFromHistory(h).events).toEqual(['bad', 'none']);
  });
  it('without listen-and-do content an under-9 gets PPP with child supports', () => {
    const lp = planLesson(base({ masteryStatus: 'emerging' }), { ageBand: 'child', ageYears: 7, level: 'A1' });
    expect([lp.shape, lp.shapeRule, lp.childSupports]).toEqual(['PPP', 'S2c', true]);
  });
});

describe('planner2b: rule statements fade only on evidence', () => {
  it('right-in-a-row streak and last-wrong come from this session (stored verdicts + this turn)', async () => {
    const m = await import('../src/services/languageTeachingContext');
    const a = (verdict: string) => ({ role: 'assistant', languageTurn: { assessment: { verdict } } });
    const h = [{ role: 'user' }, a('CORRECT'), { role: 'user' }, a('INCORRECT'), { role: 'user' }, a('CORRECT')];
    expect(m.sessionRightStreak(h)).toBe(1);
    expect(m.sessionRightStreak(h, 'CORRECT')).toBe(2);
    expect(m.lastGradedWrong(h, 'INCORRECT')).toBe(true);
    expect(m.lastGradedWrong(h)).toBe(false);
  });
  it('after an error the rule is stated again (planner2 on); off: once per session as before', async () => {
    const m = await import('../src/services/languageTeachingContext');
    const spec = { successCriteria: ['Adds -s after he/she/it'] };
    const hist = [{ role: 'user' }, { role: 'assistant', languageTurn: { rulesIntroduced: [1], assessment: { verdict: 'INCORRECT' } } }];
    const sig = { answeringCheck: true, activeLessonItem: { criteria: [1] }, keyVerdict: 'INCORRECT' };
    expect(withEnv('', () => m.rulesToIntroduce(hist, sig, spec))).toBeUndefined();
    expect(withEnv('planner2', () => m.rulesToIntroduce(hist, sig, spec))?.criteria).toEqual([1]);
    expect(withEnv('planner2', () => m.rulesToIntroduce(hist, { ...sig, keyVerdict: 'CORRECT' }, spec))).toBeUndefined();
  });
});
