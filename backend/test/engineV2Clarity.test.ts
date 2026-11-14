import { afterEach, describe, expect, it } from 'vitest';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, rulesToIntroduce, isClosingTurn,
  turnEvidence, ruleFirstLine, CLOSING_RECAP, SHORT_RECAP, EXAMPLE_CHECK, type LanguageSpec, type LanguageTeachingContext,
} from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { engineV2 } from '../src/services/engineV2';
import { hintInstruction, type HistoryTurn } from '../src/services/languageLearningState';
import { selectTeachingPlan } from '../src/services/pedagogyPolicy';

// Clarity switches: ruleFirst, shortRecap, socraticOff. All default off, named-only (not part of "all"); socraticOff is research-only.
const SPEC: LanguageSpec = {
  objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses in with months'], grammar: ['in/on/at'],
  items: [
    { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
    { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [2] },
    { id: 'i3', prompt: 'Join with but: The bus is cheap. It is slow.', acceptedAnswers: ['The bus is cheap but it is slow'], targetForms: ['but'], criteria: [2] },
  ],
};
const LESSON = { title: 'Time prepositions', spec: SPEC };
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li };
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 };
const presented = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', open)];
const saved = { v2: process.env.ENARA_ENGINE_V2, env: process.env.NODE_ENV };
afterEach(() => { for (const [k, v] of [['ENARA_ENGINE_V2', saved.v2], ['NODE_ENV', saved.env]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

function build(message: string, history: HistoryTurn[], planPrimary?: string) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = researchSignals(history, signals, SPEC);
  const ruleFirst = engineV2('ruleFirst') ? rulesToIntroduce(history, signals, SPEC) : undefined;
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, research, ...(ruleFirst ? { ruleFirst } : {}), ...(planPrimary ? { planPrimary } : {}) };
  return { ctx, prompt: renderLanguageContextPrompt(ctx), signals, research };
}
const RF = "First time this lesson's rule comes up";

describe('switches', () => {
  it('ruleFirst, shortRecap and socraticOff are off by default and not part of "all"', () => {
    delete process.env.ENARA_ENGINE_V2; for (const f of ['ruleFirst', 'shortRecap', 'socraticOff'] as const) expect(engineV2(f)).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all'; for (const f of ['ruleFirst', 'shortRecap', 'socraticOff'] as const) expect(engineV2(f)).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'ruleFirst,shortRecap,socraticOff'; for (const f of ['ruleFirst', 'shortRecap', 'socraticOff'] as const) expect(engineV2(f)).toBe(true);
  });
  it('socraticOff is ignored in production even when named', () => {
    process.env.ENARA_ENGINE_V2 = 'socraticOff'; process.env.NODE_ENV = 'production';
    expect(engineV2('socraticOff')).toBe(false);
    process.env.NODE_ENV = 'test'; expect(engineV2('socraticOff')).toBe(true);
  });
});

describe('ruleFirst', () => {
  it('fires on the first attempt on an item, not on the turn that only presents the exercise, and only once per rule', () => {
    process.env.ENARA_ENGINE_V2 = 'ruleFirst';
    expect(build('Give me an exercise', []).prompt).not.toContain(RF);
    const first = build('on April', presented); expect(first.prompt).toContain(RF); expect(first.ctx.ruleFirst?.criteria).toEqual([2]);
    // after a stored turn that introduced criterion 2, the same rule is not introduced again (even on later misses or hint requests)
    const introduced = [...presented, u('on April'), a('Rule: months take in. Right: in July. Wrong: on July. Try: ___ Monday.', { ...wrong, rulesIntroduced: [2] })];
    expect(build('at April', introduced).prompt).not.toContain(RF);
    expect(build('can I have a hint?', introduced).prompt).not.toContain(RF);
    // a different rule (criterion 1) is still introduced on its first exposure
    const i1 = { id: 'lesson:i1', source: 'lesson' as const, lessonItemId: 'i1' };
    const other = [...introduced, u('ok'), a('Write in, on or at: My train leaves ___ 5 o\'clock.', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i1' }, activeItem: i1 })];
    const second = build('in 5 o\'clock', other); expect(second.prompt).toContain(RF); expect(second.ctx.ruleFirst?.criteria).toEqual([1]);
  });
  it('is off by default and the introduction is recorded in the turn evidence only when it fired', () => {
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', presented).prompt).not.toContain(RF);
    process.env.ENARA_ENGINE_V2 = 'ruleFirst';
    const on = build('on April', presented); const ev = turnEvidence({ ...on.ctx, prompt: on.prompt } as LanguageTeachingContext);
    expect(ev.rulesIntroduced).toEqual([2]);
    expect(turnEvidence({ ...build('Give me an exercise', []).ctx, prompt: '' } as LanguageTeachingContext).rulesIntroduced).toBeUndefined();
  });
  it('does not change which teaching method is selected, and the line is styled by the selected method', () => {
    const plan = { objectiveId: 'o', masteryStatus: 'emerging', evidenceStrength: 'moderate', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: ['e'], recentResults: [], triedWithoutImprovement: [] };
    const inputs = [plan, { ...plan, masteryStatus: 'developing' }, { ...plan, masteryStatus: 'proficient', gradeLevel: 10, subject: 'History' }, { ...plan, misconceptions: [{ id: 'm', category: 'conceptual_misunderstanding', status: 'confirmed' }] }];
    delete process.env.ENARA_ENGINE_V2; const off = inputs.map((i) => selectTeachingPlan(i as never).primary);
    process.env.ENARA_ENGINE_V2 = 'all,arbitration,ruleFirst,shortRecap,clarity,hints,closing,selfCheck'; const on = inputs.map((i) => selectTeachingPlan(i as never).primary);
    expect(on).toEqual(off);
    for (const pm of ['worked_example', 'socratic_questioning', 'analogy', 'scaffolding']) { const r = build('on April', presented, pm); expect(r.ctx.planPrimary).toBe(pm); expect(r.prompt).toContain(RF); }
    expect(ruleFirstLine({ texts: ['x'] }, 'worked_example')).toContain('worked example');
    expect(ruleFirstLine({ texts: ['x'] }, 'analogy')).toContain('everyday comparison');
    expect(ruleFirstLine({ texts: ['x'] }, 'socratic_questioning')).toContain('right/wrong pair');
    expect(ruleFirstLine({ texts: ['x'] }, 'worked_example')).toContain('inside the teaching method above');
    expect(ruleFirstLine({ texts: ['x'] })).toMatch(/20 words or fewer/);
  });
});

describe('shortRecap', () => {
  const late = [...presented, u('on April'), a('Think about the month.', wrong), u('at April'), a('Look at the word.', wrong), u('on April'), a('Still the month.', wrong), u('at April'), a('Again.', wrong)];
  it('closing turn uses the short recap (rule in one line + one new example), not the own-words ask', () => {
    process.env.ENARA_ENGINE_V2 = 'shortRecap';
    const l = build('on April', late); expect(isClosingTurn(l.research!)).toBe(true);
    expect(l.prompt).toContain(SHORT_RECAP); expect(l.prompt).not.toContain(CLOSING_RECAP);
    delete process.env.ENARA_ENGINE_V2; expect(build('on April', late).prompt).not.toContain(SHORT_RECAP);
    process.env.ENARA_ENGINE_V2 = 'closing'; expect(build('on April', late).prompt).toContain(CLOSING_RECAP);
  });
  it('happens at most once: the engine appends the ask once, then the example check takes over', () => {
    process.env.ENARA_ENGINE_V2 = 'shortRecap';
    const l = build('on April', late); const lang = { ...l.ctx, prompt: l.prompt } as LanguageTeachingContext;
    const out = applyReplyGuards(lang, 'The rule: months take in.', 'on April').text; expect(out).toMatch(/Now write one new example of your own\.$/);
    expect(applyReplyGuards(lang, out, 'on April').text.match(/new example of your own/g)).toHaveLength(1);
    const asked = [...late, u('Months take in.'), a(out)];
    const after = build('I was born in May.', asked);
    expect(isClosingTurn(after.research!)).toBe(false); expect(after.prompt).not.toContain(SHORT_RECAP); expect(after.prompt).toContain(EXAMPLE_CHECK);
    const l2 = { ...after.ctx, prompt: after.prompt } as LanguageTeachingContext;
    expect(applyReplyGuards(l2, 'Remember: in May is right.', 'I was born in May.').text).not.toMatch(/new example of your own/);
    const e = build('on April', presented); expect(applyReplyGuards({ ...e.ctx, prompt: e.prompt } as LanguageTeachingContext, 'Try again.', 'on April').text).toBe('Try again.');
  });
});

describe('socraticOff (research only)', () => {
  const MOVE_RULE = /No rule, no reminder and no example before their first try/;
  it('removes only the "no rule before the first try" instructions in research mode', () => {
    delete process.env.ENARA_ENGINE_V2; const base = build('Give me an exercise', []).prompt; expect(base).toMatch(MOVE_RULE);
    expect(hintInstruction(1)).toMatch(/must not reveal the rule/);
    process.env.ENARA_ENGINE_V2 = 'socraticOff'; process.env.NODE_ENV = 'test';
    const off = build('Give me an exercise', []).prompt; expect(off).not.toMatch(MOVE_RULE); expect(off).toContain('target form'); expect(off).toMatch(/present the lesson item given below exactly as written/);
    const h1 = hintInstruction(1); expect(h1).toMatch(/rule in general terms/); expect(h1).toMatch(/must not reveal the correct form/);
    expect(hintInstruction(2)).toBe((delete process.env.ENARA_ENGINE_V2, hintInstruction(2))); // other levels are untouched
  });
  it('has no effect in production mode', () => {
    delete process.env.ENARA_ENGINE_V2; const base = build('Give me an exercise', []).prompt; const baseHint = hintInstruction(1);
    process.env.ENARA_ENGINE_V2 = 'socraticOff'; process.env.NODE_ENV = 'production';
    expect(build('Give me an exercise', []).prompt).toBe(base); expect(hintInstruction(1)).toBe(baseHint);
  });
});

describe('none of the new switches leak the answer to the item being asked', () => {
  const ALL = 'ruleFirst,shortRecap,socraticOff,closing,clarity,hints,selfCheck,wrongAnswer,belief';
  it('prompts built with every switch on never contain the accepted answer sentence or an instruction to write it', () => {
    process.env.ENARA_ENGINE_V2 = ALL; process.env.NODE_ENV = 'test';
    const i3 = { id: 'lesson:i3', source: 'lesson' as const, lessonItemId: 'i3' };
    const ask3 = a('Join with but: The bus is cheap. It is slow.', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i3' }, activeItem: i3 });
    const miss = a('Which word joins two different ideas?', { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: i3, hintLevel: 1 });
    const histories: [string, HistoryTurn[]][] = [
      ['Give me an exercise', []], ['The bus is cheap and it is slow', [u('Give me an exercise'), ask3]], ['The bus is cheap, it is slow', [u('Give me an exercise'), ask3, u('The bus is cheap and slow'), miss]],
      ['Just tell me the answer', [u('Give me an exercise'), ask3]], ['Why is it wrong?', [u('Give me an exercise'), ask3, u('The bus is cheap and slow'), miss]],
    ];
    for (const [msg, h] of histories) for (const pm of [undefined, 'worked_example', 'socratic_questioning']) {
      const { prompt } = build(msg, h, pm);
      expect(prompt).not.toContain('The bus is cheap but it is slow'); expect(prompt).not.toMatch(/\bbut it is slow\b/i);
    }
  });
  it('every instruction line the switches add carries an explicit never-write-the-answer limit', () => {
    expect(ruleFirstLine({ texts: ['x'] })).toMatch(/Never write the answer to the exercise you are asking about/); expect(ruleFirstLine({ texts: ['x'] })).toMatch(/never show its target form/);
    expect(SHORT_RECAP).toMatch(/never write a completed answer to an open exercise/); expect(EXAMPLE_CHECK).toMatch(/correct only the wrong part/);
  });
  it('the reply guard still removes a pre-attempt reply that contains the answer form of the presented item (switches on)', () => {
    process.env.ENARA_ENGINE_V2 = ALL;
    const spec2: LanguageSpec = { objectives: ['Third person -s'], successCriteria: ['Adds -s with he/she/it'], grammar: ['present simple'], items: [{ id: 'q1', prompt: 'Correct the verb: "My cousin ___ (go) to the gym on Fridays."', acceptedAnswers: ['goes'], targetForms: ['goes'], criteria: [1] }] };
    const lesson2 = { title: 'Present simple', spec: spec2 };
    const signals = detectTurnSignals('Give me an exercise', [], lesson2);
    const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
    const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: ['Give me an exercise'] });
    const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'l2', title: lesson2.title, spec: spec2 }, signals, moves, research: researchSignals([], signals, spec2), prompt: '' } as LanguageTeachingContext;
    expect(signals.presentLessonItem?.id).toBe('q1');
    const out = applyReplyGuards(ctx, 'Here is your exercise.\n\n- I **go** → She **goes**\n\nCorrect the verb: "My cousin ___ (go) to the gym on Fridays."', 'Give me an exercise');
    expect(out.removed).toBeGreaterThan(0); expect(out.text).not.toMatch(/\bgoes\b/);
  });
});
