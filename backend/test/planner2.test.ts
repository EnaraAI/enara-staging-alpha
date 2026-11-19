import { afterEach, describe, expect, it } from 'vitest';
import { planWithTrace, selectTeachingPlan, METHOD_RULES, type PlanInput } from '../src/services/pedagogyPolicy';
import { STRATEGIES, validateComposition } from '../src/services/strategyRegistry';
import {
  METHOD_TABLE, SHAPE_RULES, SHAPE_STAGES, allowedMain, chooseShape, currentStage, levelRank, methodGateOk, planLesson, progressFromHistory, reviewOpener, shapeLines,
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
    ['Pre-A1 adult', { ageBand: 'adult', level: 'Pre-A1 Starters' }, 'not_assessed', 'LAD', 'S2a'],
    ['Pre-A1 child age 11', { ageBand: 'child', ageYears: 11, level: 'pre-a1' }, 'not_assessed', 'LAD', 'S2a'],
    ['child 7 at A1', { ageBand: 'child', ageYears: 7, level: 'A1' }, 'not_assessed', 'LAD', 'S2b'],
    ['child 8 at A2', { ageBand: 'child', ageYears: 8, level: 'A2' }, 'developing', 'LAD', 'S2b'],
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
    const lad = withEnv(ESL, () => planLesson(base({ masteryStatus: 'not_assessed', belowB1: true, ageBand: 'child' }), { ageBand: 'child', ageYears: 7, level: 'A1' }));
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
  for (const [ageBand, ageYears] of AGES) for (const level of LEVELS) for (const goal of GOALS) for (const quickCheck of CHECKS) for (const m of MASTERY) yield [{ ageBand, ageYears, level, goal, quickCheck }, m];
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
      expect(r.shape === 'LAD').toBe(lr === 0 || (s.ageBand === 'child' && s.ageYears !== undefined && s.ageYears < 9));
      if (s.ageBand === 'child') expect(['LAD', 'PPP']).toContain(r.shape);
      if (r.shape === 'TTT') expect(s.quickCheck!.right * 3 >= s.quickCheck!.of * 2).toBe(true);
      if (r.shape === 'TASK') expect((lr ?? -1) >= 3 && ['work', 'exam', 'daily'].includes(s.goal ?? '')).toBe(true);
      if (s.ageBand === 'unknown') expect(r.shape).toBe(lr === 0 ? 'LAD' : 'PPP');
    }
    expect(n).toBe(AGES.length * LEVELS.length * GOALS.length * CHECKS.length * MASTERY.length);
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
      { ageBand: 'child', ageYears: 7, level: 'A1' }, { ageBand: 'child', ageYears: 10, level: 'A2' }, { ageBand: 'unknown' }, { ageBand: 'adult', level: 'Pre-A1' },
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
  it('PPP, TTT, TASK and LAD move forward from progress', () => {
    expect(currentStage('PPP', { tries: 0, right: 0 })).toBe('present');
    expect(currentStage('PPP', { tries: 2, right: 1 })).toBe('practise');
    expect(currentStage('PPP', { tries: 3, right: 2 })).toBe('produce');
    expect(currentStage('PPP', { tries: 4, right: 3, ownSentenceDone: true })).toBe('check');
    expect(currentStage('TTT', { tries: 2, right: 2 })).toBe('test');
    expect(currentStage('TTT', { tries: 3, right: 2, rightAfterTest: 0 })).toBe('teach');
    expect(currentStage('TTT', { tries: 5, right: 3, rightAfterTest: 1 })).toBe('retest');
    expect(currentStage('TASK', { tries: 0, right: 0 })).toBe('pretask');
    expect(currentStage('TASK', { tries: 0, right: 0, opened: true })).toBe('task');
    expect(currentStage('TASK', { tries: 1, right: 0, opened: true, taskDone: true })).toBe('focus');
    expect(currentStage('TASK', { tries: 2, right: 1, opened: true, taskDone: true, rightAfterTest: 1 })).toBe('repeat');
    expect(currentStage('LAD', { tries: 0, right: 0 })).toBe('listen');
    expect(currentStage('LAD', { tries: 1, right: 1 })).toBe('do');
    expect(currentStage('LAD', { tries: 2, right: 2 })).toBe('chant');
    expect(currentStage('LAD', { tries: 3, right: 2, ownSentenceDone: true })).toBe('check');
  });
  it('progress comes from stored, code-graded verdicts; the stage follows it', () => {
    const t = (verdict?: string, ownSentence?: string) => ({ role: 'assistant', languageTurn: { ...(verdict ? { assessment: { verdict } } : {}), ...(ownSentence ? { ownSentence } : {}) } });
    const h = [{ role: 'user' }, t(), { role: 'user' }, t('INCORRECT'), { role: 'user' }, t('CORRECT'), { role: 'user' }, t('NOT_EVALUATED'), { role: 'user' }, t('CORRECT_WITH_EQUIVALENT_FORMULATION')];
    const p = progressFromHistory(h);
    expect([p.tries, p.right, p.ownSentenceDone]).toEqual([3, 2, false]);
    expect(currentStage('PPP', p)).toBe('produce');
    expect(currentStage('PPP', progressFromHistory([...h, t(undefined, 'feedback')]))).toBe('check');
    expect(currentStage('PPP', progressFromHistory([]))).toBe('present');
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
