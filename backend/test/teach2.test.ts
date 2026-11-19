import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RULE_BANK, checkEntry, ruleBankEntry } from '../src/services/ruleBank';
import {
  ageFit, criterionFor, exampleGuardHits, feedbackRung, pickModel, poolFromBankItems, poolFromLessonItems, ruleLinePostCheck, checkLessonData, BAND_REGISTER,
} from '../src/services/teachingQuality';
import { bankify, buildTeach2, resolveTrustedAgeBand, ruleFirstDecision, releaseAfter, registerLine, ageFromBirthDate } from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { selectTeachingPlan, LEVEL_GATED_METHODS, type PlanInput } from '../src/services/pedagogyPolicy';
import { GUIDE_METHODS } from '../src/services/strategyRegistry';

// TRACK 2 (teaching quality, SIMULATION-ONLY research context; these are deterministic unit tests, no API).
const ENV = process.env.ENARA_ENGINE_V2;
const on = (v: string) => { process.env.ENARA_ENGINE_V2 = v; };
afterEach(() => { process.env.ENARA_ENGINE_V2 = ENV; });

const REPO = path.join(__dirname, '../..');
const bankFile = (id: string) => JSON.parse(readFileSync(path.join(REPO, 'data/assessments/outcomes', `${id}.json`), 'utf8'));
const bankItems = (id: string) => Object.values<any[]>(bankFile(id).forms).flat();

// --------------------------------------------------------------------------------------------- §2 example guard
describe('example guard: a worked example never uses an item the learner will solve', () => {
  beforeEach(() => on('graderV2,exampleGuard'));
  const lesson = poolFromLessonItems([
    { id: 'g1', prompt: 'Complete: "___ three windows in my room."', acceptedAnswers: ['there are', 'There are'], targetForms: ['are'] },
    { id: 'g2', prompt: 'Complete: "___ a big table in the kitchen."', acceptedAnswers: ['there is', 'There is'], targetForms: ['is'] },
  ]);
  it('flags a later lesson item (its frame with its key)', () => {
    const h = exampleGuardHits('Look: There is a big table in the kitchen.\nNow you: "___ three windows in my room."', lesson);
    expect(h.map((x) => x.itemId)).toEqual(['g2']);
  });
  it('flags an assessment key (server-side pool, never in the prompt)', () => {
    const pool = poolFromBankItems(bankItems('EN-F-A2-VO-weather'));
    expect(exampleGuardHits('Example: There is snow on the cars. It is snowy.', pool).length).toBeGreaterThan(0);
  });
  it('flags the same answer in the same frame (Appendix B: "There are two chairs" before "___ three windows")', () => {
    const items = poolFromLessonItems([{ id: 'w', prompt: 'Complete: "___ two chairs in the room."', acceptedAnswers: ['There are'] }]);
    expect(exampleGuardHits('Watch: There are two chairs in the room.', items)).toHaveLength(1);
  });
  it('lets a contrasting example pass (the other form, a different scene)', () => {
    expect(exampleGuardHits('Watch: There is a frog in the pond. Now you: "___ three windows in my room."', lesson)).toHaveLength(0);
  });
  it('never flags the capital-letter task itself (prompt and key differ only in case: compared with case kept)', () => {
    const caps = poolFromLessonItems([{ id: 'p1', prompt: 'Rewrite correctly: "my brother likes tea"', acceptedAnswers: ['My brother likes tea.'] }]);
    expect(exampleGuardHits('Rewrite correctly: "my brother likes tea"', caps)).toHaveLength(0);
    expect(exampleGuardHits('Your turn. Copy it with a capital: my brother likes tea', caps)).toHaveLength(0);
    expect(exampleGuardHits('Like this: My brother likes tea.', caps)).toHaveLength(1);
  });
  it('flags a model that is a valid answer to an open item in the same scene, not one in a different scene', () => {
    const open = poolFromLessonItems([{ id: 'w1', prompt: 'Imagine a park. Write two sentences about what people are doing now.' }], 'am/is/are + verb-ing');
    expect(exampleGuardHits('Example: In the park, a girl is reading.', open)).toHaveLength(1);
    expect(exampleGuardHits('Example: At the zoo, a lion is sleeping.', open)).toHaveLength(0);
  });
  it('skips a labelled wrong example and quotes of the learner', () => {
    expect(exampleGuardHits('Wrong: There is a big table in the kitchen.', lesson)).toHaveLength(0);
    expect(exampleGuardHits('You wrote "There is a big table in the kitchen".', lesson, 'There is a big table in the kitchen')).toHaveLength(0);
  });
  it('applyReplyGuards removes a hit only with the switch on', () => {
    const ctx: any = { lesson: { status: 'structured', spec: { items: [] } }, signals: {}, moves: [], teach2: { pool: lesson } };
    const r = 'Look: There is a big table in the kitchen.\nNow you: "___ three windows in my room."';
    expect(applyReplyGuards(ctx, r, '').guardHits).toBe(1);
    on('');
    expect(applyReplyGuards(ctx, r, '').text).toBe(r);
  });
});

// --------------------------------------------------------------------------------------------- §3 rule bank
describe('rule bank: one checked entry per outcome, the only source of rule text', () => {
  beforeEach(() => on('graderV2,ruleBank,exampleGuard'));
  const outcomeIds = readdirSync(path.join(REPO, 'data/assessments/outcomes')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  it('covers exactly the 33 outcomes', () => {
    expect(outcomeIds).toHaveLength(33);
    expect(RULE_BANK.map((e) => e.id).sort()).toEqual(outcomeIds);
  });
  it.each(RULE_BANK.map((e) => [e.id, e] as const))('%s passes the static checks (rule <= 20 words, a real pair, distinct models)', (_id, e) => {
    expect(checkEntry(e)).toEqual([]);
  });
  it.each(RULE_BANK.map((e) => [e.id, e] as const))('%s: pair and worked examples answer none of its assessment items', (id, e) => {
    const pool = poolFromBankItems(bankItems(id));
    for (const s of [e.right, ...e.models.map((m) => m.sentence)]) expect(exampleGuardHits(s, pool), s).toEqual([]);
  });
  it('picks the contrasting worked example (the task needs "are" -> model "is")', () => {
    const e = ruleBankEntry('EN-F-A1-GR-there-is-are')!;
    expect(pickModel(e, [], ['there are'])?.form).toBe('there is');
    expect(pickModel(e, [], ['there is'])?.form).toBe('there are');
    const s3 = ruleBankEntry('EN-F-A2-GR-third-person-s')!;
    expect(pickModel(s3, [], ['plays'])?.form).toBe('-es');
    expect(pickModel(s3, [], ['watches'])?.form).toBe('-s');
  });
});

describe('criterion choice: the criterion that matches the outcome, never a blind "criterion 1"', () => {
  beforeEach(() => on('ruleBank,levelExplicit'));
  it('frequency adverbs -> the adverb-position criterion (2), not -s (1)', () => {
    expect(criterionFor(['Adds -s/-es for he/she/it', 'Puts always/usually/sometimes/never before the main verb'], ruleBankEntry('EN-F-A2-GR-frequency-adverbs'))).toBe(2);
  });
  it('past questions with did -> criterion 3 (A3: the fallback took criterion 1, "-ed")', () => {
    expect(criterionFor(['Uses -ed for regular verbs', 'Uses went, had, saw, ate correctly', 'Asks questions with did'], ruleBankEntry('EN-F-A2-GR-past-questions-did'))).toBe(3);
  });
  it('the first-explanation rule line takes the matched criterion and the bank rule text', () => {
    const spec = { successCriteria: ['Uses -ed for regular verbs', 'Uses went, had, saw, ate correctly', 'Asks questions with did'] };
    const d = ruleFirstDecision({ band: 'intermediate', masteryStatus: 'emerging', history: [], signals: {}, spec, moves: [{ id: 'short_explanation' }], entry: ruleBankEntry('EN-F-A2-GR-past-questions-did') });
    expect(d.ruleFirst?.criteria).toEqual([3]);
    expect(d.ruleFirst?.texts).toEqual([ruleBankEntry('EN-F-A2-GR-past-questions-did')!.rule]);
    on('levelExplicit');
    expect(ruleFirstDecision({ band: 'intermediate', masteryStatus: 'emerging', history: [], signals: {}, spec, moves: [{ id: 'short_explanation' }] }).ruleFirst?.criteria).toEqual([1]); // switch off: unchanged
  });
});

describe('lesson data check (every item has criteria; one item tests the outcome)', () => {
  it('flags the frequency-adverbs lesson before the fix and passes after', () => {
    const before = { successCriteria: ['Adds -s/-es for he/she/it', 'Puts always/usually/sometimes/never before the main verb'], items: [{ id: 'x1' }, { id: 'x2' }] };
    expect(checkLessonData('EN-F-A2-GR-frequency-adverbs', before).map((f) => f.problem)).toEqual(['item_without_criteria', 'no_item_tests_outcome']);
    const after = { ...before, items: [{ id: 'x1', criteria: [2] }, { id: 'x2', criteria: [1, 2] }] };
    expect(checkLessonData('EN-F-A2-GR-frequency-adverbs', after)).toEqual([]);
  });
  it('flags a lesson with no items', () => {
    expect(checkLessonData('EN-F-A2-GR-some-any', { successCriteria: ['Uses some and any'], items: [] }).map((f) => f.problem)).toContain('no_items');
  });
});

describe('vocabulary template and post-check', () => {
  beforeEach(() => on('ruleBank,levelExplicit'));
  const line = 'First time this lesson\'s rule comes up ("x"). In this reply, inside the teaching method above: (1) state the rule in ONE plain sentence of 20 words or fewer, no grammar jargon, through the pair; (2) give one right example and one wrong example as plain sentences (not a list), made of words that appear in no lesson exercise; (3) ask them to apply the rule.';
  it('a vocabulary outcome gets meaning-from-a-clue, spelling, use, and only the real confusion as contrast', () => {
    const out = bankify(line, { teach2: { entryId: 'EN-F-A2-VO-weather', pool: [] } });
    expect(out).toMatch(/vocabulary template/);
    expect(out).toContain('"It is stormy." Wrong: "It is storm."');
    expect(out).not.toMatch(/give one right example and one wrong example/);
    expect(out).toContain('(3) ask them to apply the rule.');
  });
  it('a grammar outcome gets the bank rule and pair', () => {
    const out = bankify(line, { teach2: { entryId: 'EN-F-A2-GR-some-any', pool: [], model: { form: 'any', sentence: 'The robot doesn\'t need any oil.' } } });
    expect(out).toContain(ruleBankEntry('EN-F-A2-GR-some-any')!.rule);
    expect(out).toContain('The robot doesn\'t need any oil.');
  });
  it('switch off: the line is unchanged', () => { on('levelExplicit'); expect(bankify(line, { teach2: { entryId: 'EN-F-A2-VO-weather', pool: [] } })).toBe(line); });
  it('post-check: identical right/wrong pair (A6) and a vocabulary example with no target word (A7)', () => {
    expect(ruleLinePostCheck('The rule: read the clue. Right: Put on a coat. Wrong: Put on a coat. Your turn.', ruleBankEntry('EN-F-A2-VO-weather')).problems).toEqual(['pair_identical', 'no_target_word']);
    expect(ruleLinePostCheck('Right: It is stormy. Wrong: It is storm.', ruleBankEntry('EN-F-A2-VO-weather')).problems).toEqual([]);
  });
  it('applyReplyGuards drops an identical wrong example', () => {
    const ctx: any = { lesson: { status: 'structured', spec: { items: [] } }, signals: {}, moves: [], teach2: { entryId: 'EN-F-A2-GR-some-any', pool: [] } };
    const g = applyReplyGuards(ctx, 'Right: I have some tea. Wrong: I have some tea. Now try one.', '');
    expect(g.postCheck).toEqual(['pair_identical']);
    expect(g.text).not.toMatch(/Wrong/);
  });
});

// --------------------------------------------------------------------------------------------- §4 methods
describe('M3 corrective-feedback ladder', () => {
  it('elicitation, then a metalinguistic clue, explicit correction only after two failed prompts', () => {
    expect([0, 1, 2, 3, 4].map(feedbackRung)).toEqual([undefined, 'elicitation', 'metalinguistic', 'explicit', 'explicit']);
  });
  it('moves the answer release from the 2nd to the 3rd genuine failed attempt only with the switch on', () => {
    on('esl5'); expect(releaseAfter()).toBe(2);
    on('esl5,feedbackLadder'); expect(releaseAfter()).toBe(3);
  });
  it('the rung is in the turn state', () => {
    on('feedbackLadder');
    const t = buildTeach2({ signals: { answeringCheck: true, genuineFailedAttempts: 2 } as any, lesson: { status: 'structured', spec: { items: [] } } as any, moves: [], learner: { ageBand: { status: 'unknown' } } as any }, {});
    expect(t?.rung).toBe('metalinguistic');
  });
});

const base: PlanInput = { objectiveId: 'o', masteryStatus: 'not_assessed', evidenceStrength: 'none', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [], recentResults: [], triedWithoutImprovement: [] };
describe('methodSelect (M2, M4, M5, M7)', () => {
  beforeEach(() => on('levelExplicit,methodSelect'));
  it('M2: an A1-A2 novice with no diagnosed error gets direct instruction; a pre-test error keeps worked examples', () => {
    expect(selectTeachingPlan({ ...base, belowB1: true, gradeLevel: 9 }).primary).toBe('direct_instruction');
    expect(selectTeachingPlan({ ...base, belowB1: true, gradeLevel: 9, misconceptions: [{ id: 'm', category: 'procedural_error', status: 'confirmed' }] }).primary).toBe('worked_example');
    on('levelExplicit');
    expect(selectTeachingPlan({ ...base, belowB1: true, gradeLevel: 9 }).primary).toBe('formative_feedback'); // switch off: unchanged
  });
  it('M4: a later-session opening is retrieval with spacing', () => {
    const p = selectTeachingPlan({ ...base, masteryStatus: 'emerging', reviewOpening: true, gradeLevel: 9 });
    expect([p.primary, p.reinforcement]).toEqual(['retrieval_practice', 'spaced_repetition']);
  });
  it('M5: a form right twice adds interleaving', () => {
    expect(selectTeachingPlan({ ...base, belowB1: true, gradeLevel: 9, formRightTwice: true }).reinforcement).toBe('interleaving');
  });
  it('M7: under 13 adds a story or game frame as support, never as primary', () => {
    const p = selectTeachingPlan({ ...base, belowB1: true, gradeLevel: 4, ageBand: 'child' });
    expect(p.primary).toBe('direct_instruction');
    expect(p.supporting).toContain('narrative_contextual');
    expect(selectTeachingPlan({ ...base, masteryStatus: 'mastered', gradeLevel: 4, ageBand: 'child' }).supporting).toContain('gamification');
  });
});

describe('M8 method coverage: every one of the 23 methods is reachable, or teacher-only / gated below B1 with a reason', () => {
  const TEACHER_ONLY: Record<string, string> = { project_based: 'no evidence signal selects a multi-session project; a teacher assigns it' };
  it('a grid of learner states reaches every other method', () => {
    on('levelExplicit,methodSelect');
    const seen = new Set<string>();
    const statuses = ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'];
    const cats = [[], [{ id: 'm', category: 'procedural_error', status: 'confirmed' }], [{ id: 'm', category: 'conceptual_misunderstanding', status: 'confirmed' }], [{ id: 'm', category: 'misinterpretation' }]];
    for (const masteryStatus of statuses) for (const misconceptions of cats) for (const subject of [undefined, 'Grammar', 'History', 'Biology']) for (const gradeLevel of [undefined, 4, 12]) for (const related of [0, 1, 3]) for (const extra of [{}, { disengaged: true }, { ageBand: 'child' as const }, { formRightTwice: true }, { reviewOpening: true }, { applicationGap: true }, { retention: { due: true, lapsed: false } }, { retention: { due: false, lapsed: true } }, { triedWithoutImprovement: ['worked_example'] }, { belowB1: true }]) {
      const p = selectTeachingPlan({ ...base, masteryStatus, misconceptions: misconceptions as any, subject, gradeLevel, relatedSecureObjectives: related, ...(extra as any), triedWithoutImprovement: (extra as any).triedWithoutImprovement ?? [] });
      for (const m of [p.primary, ...p.supporting, p.reinforcement, ...p.modifiers]) if (m) seen.add(m);
    }
    const missing = GUIDE_METHODS.map((m) => m.id).filter((id) => !seen.has(id) && !TEACHER_ONLY[id]);
    expect(missing).toEqual([]);
    expect(GUIDE_METHODS).toHaveLength(23);
    expect(selectTeachingPlan({ ...base, teacherStrategyId: 'project_based' }).primary).toBe('project_based');
  });
  it('below B1 (levelExplicit), the six gated methods are never the primary', () => {
    on('levelExplicit,methodSelect');
    for (const masteryStatus of ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered']) for (const subject of ['History', 'Biology', 'Grammar']) {
      const p = selectTeachingPlan({ ...base, masteryStatus, subject, gradeLevel: 12, belowB1: true, applicationGap: true, relatedSecureObjectives: 3 });
      expect(LEVEL_GATED_METHODS).not.toContain(p.primary);
    }
  });
});

// --------------------------------------------------------------------------------------------- §5 kids language
describe('age band from a birth date or Enara Kids mode (owner decision 4)', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  it('only with kidsBand on, and only when no band is set', () => {
    on('kidsBand');
    expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2016-05-01', now }).band).toBe('child');
    expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2011-05-01', now }).band).toBe('teen');
    expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2000-05-01', now }).band).toBe('adult');
    expect(resolveTrustedAgeBand({}, undefined, undefined, { uiMode: 'kids', now }).source).toBe('kids_mode');
    expect(resolveTrustedAgeBand({}, 'teen', undefined, { birthDate: '2016-05-01', now }).band).toBe('teen'); // staff band wins
    expect(resolveTrustedAgeBand({ adultLearners: true }, undefined, undefined, { uiMode: 'kids', now }).band).toBe('adult');
    on('');
    expect(resolveTrustedAgeBand({}, undefined, undefined, { birthDate: '2016-05-01', uiMode: 'kids', now }).band).toBe('unknown');
  });
  it('13th birthday boundary and invalid dates', () => {
    expect(ageFromBirthDate('2013-11-19', now)).toBe(13);
    expect(ageFromBirthDate('2013-11-20', now)).toBe(12);
    expect(ageFromBirthDate('2030-01-01', now)).toBeUndefined();
    expect(ageFromBirthDate('not a date', now)).toBeUndefined();
  });
  it('register: praise effort or strategy, never ability; child register only with the switch', () => {
    on('kidsBand');
    expect(registerLine('child')).toBe(BAND_REGISTER.child);
    expect(BAND_REGISTER.child).toMatch(/never their ability/);
    on('');
    expect(registerLine('child')).not.toBe(BAND_REGISTER.child);
  });
});

describe('ageFit: deterministic band limits', () => {
  it('a short warm child message passes', () => {
    const f = ageFit('Not yet! Look at the word "she". She plays. Now you: My cat ___ (sleep) a lot.', 'child', ['sleep']);
    expect(f.flags).toEqual([]);
  });
  it('flags long sentences, two instructions, a bare "Wrong", ability praise and idioms for a child', () => {
    const f = ageFit('Wrong. You are so clever, it is a piece of cake when you remember that the verb after he or she always needs an ending in the present simple tense. Write the answer. Then write another sentence.', 'child');
    expect(f.flags).toEqual(expect.arrayContaining(['sentence_too_long', 'too_many_instructions', 'bare_wrong', 'ability_praise', 'idiom', 'grammar_label_not_taught']));
  });
  it('adult limits are looser', () => {
    expect(ageFit('Good effort. After he, she or it, the verb takes an ending, so we write "works". Try this one: My aunt ___ (live) in Tanta.', 'adult', ['live']).within).toBe(true);
  });
});
