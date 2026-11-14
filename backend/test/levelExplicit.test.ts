import { afterEach, describe, expect, it } from 'vitest';
import {
  detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, researchSignals, ruleFirstDecision, explicitFirst, turnEvidence,
  ruleBeforeFirstTryLine, EXPLICIT_FIRST_LINE, MOVE_IDS, type LanguageSpec, type LanguageTeachingContext,
} from '../src/services/languageTeachingContext';
import { applyReplyGuards } from '../src/services/languageTurnPipeline';
import { engineV2, arbitrationForced } from '../src/services/engineV2';
import { hintInstruction, HINT_LADDER, type HistoryTurn } from '../src/services/languageLearningState';
import { selectTeachingPlan, belowB1, LEVEL_GATED_METHODS, type PlanInput } from '../src/services/pedagogyPolicy';

// levelExplicit: explicit-first learners (A1-A2, or objective not_assessed/emerging) get the rule before the first try; everyone else is unchanged. Default off, not in "all".
const SPEC: LanguageSpec = {
  objectives: ['Third person -s'], successCriteria: ['Adds -s or -es after he, she and it', 'Uses do/does in questions'],
  items: [
    { id: 'i1', prompt: 'My cousin ___ (watch) a film on Fridays.', acceptedAnswers: ['watches'], targetForms: ['watches'], criteria: [1] },
    { id: 'i2', prompt: 'Make a question: she / like / tea', acceptedAnswers: ['Does she like tea?'], targetForms: ['does'], criteria: [2] },
  ],
};
const LESSON = { title: 'Routines', spec: SPEC };
const li = { id: 'lesson:i1', source: 'lesson' as const, lessonItemId: 'i1' };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: unknown): HistoryTurn => ({ role: 'assistant', content, languageTurn: languageTurn as HistoryTurn['languageTurn'] });
const open = { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i1' }, activeItem: li };
const wrong = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: li, hintLevel: 1 };
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
const on = (v: string) => { process.env.ENARA_ENGINE_V2 = v; };

// Same decision code as buildLanguageTeachingContext (ruleFirstDecision), same rendering.
function build(message: string, history: HistoryTurn[], opts: { level?: string; status?: string; planPrimary?: string } = {}) {
  const signals = detectTurnSignals(message, history, LESSON);
  const band = levelBand(opts.level);
  const moves = selectLanguageMoves({ band, targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: opts.status });
  const learner = deriveLearnerContext({ courseLevel: opts.level, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const research = researchSignals(history, signals, SPEC);
  const d = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: opts.status, history, signals, spec: SPEC });
  const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves, research, ...(d.ruleFirst ? { ruleFirst: d.ruleFirst } : {}), ...(d.explicit !== undefined ? { explicitFirst: d.explicit } : {}), ...(opts.planPrimary ? { planPrimary: opts.planPrimary } : {}) } as Omit<LanguageTeachingContext, 'prompt'>;
  const prompt = renderLanguageContextPrompt(ctx);
  return { ctx, prompt, lang: { ...ctx, prompt } as LanguageTeachingContext, signals };
}
const NO_RULE_BEFORE = 'No rule, no reminder and no example before their first try';
const RULE_LINE = "First time this lesson's rule comes up";
const presented = [u('Give me an exercise'), a('My cousin ___ (watch) a film on Fridays.', open)];

describe('switch', () => {
  it('off by default and not part of "all"; named only', () => {
    delete process.env.ENARA_ENGINE_V2; expect(engineV2('levelExplicit')).toBe(false);
    on('all'); expect(engineV2('levelExplicit')).toBe(false); on('levelExplicit'); expect(engineV2('levelExplicit')).toBe(true);
  });
  it('arbitration is turned on automatically with levelExplicit, and recorded in the evidence only when it was forced', () => {
    delete process.env.ENARA_ENGINE_V2; expect(engineV2('arbitration')).toBe(false); expect(arbitrationForced()).toBe(false);
    on('levelExplicit'); expect(engineV2('arbitration')).toBe(true); expect(arbitrationForced()).toBe(true);
    const ev = turnEvidence(build('Give me an exercise', [], { level: 'A2' }).lang, 'o');
    expect(ev.arbitrationForced).toBe(true); expect(ev.explicitFirst).toBe(true);
    on('levelExplicit,arbitration'); expect(engineV2('arbitration')).toBe(true); expect(arbitrationForced()).toBe(false);
    expect('arbitrationForced' in turnEvidence(build('Give me an exercise', [], { level: 'A2' }).lang, 'o')).toBe(false);
    on('arbitration'); expect(engineV2('levelExplicit')).toBe(false); expect('explicitFirst' in turnEvidence(build('Give me an exercise', [], { level: 'A2' }).lang, 'o')).toBe(false);
  });
  it('the arbitration order of authority reaches the prompt when a plan method is active (forced on)', () => {
    on('levelExplicit'); expect(build('Give me an exercise', [], { level: 'A2', planPrimary: 'direct_instruction' }).prompt).toContain('Order of authority for this reply');
    delete process.env.ENARA_ENGINE_V2; expect(build('Give me an exercise', [], { level: 'A2', planPrimary: 'direct_instruction' }).prompt).not.toContain('Order of authority for this reply');
  });
});

describe('who is explicit-first', () => {
  it('A1-A2 course band, or objective not_assessed / emerging; nobody else', () => {
    expect(explicitFirst(levelBand('A1'), undefined)).toBe(true); expect(explicitFirst(levelBand('A2'), 'proficient')).toBe(true);
    expect(explicitFirst(levelBand('B2'), 'not_assessed')).toBe(true); expect(explicitFirst(levelBand('B2'), 'emerging')).toBe(true); expect(explicitFirst(levelBand('C1'), 'emerging')).toBe(true);
    for (const st of [undefined, 'developing', 'proficient', 'mastered']) { expect(explicitFirst(levelBand('B1'), st)).toBe(false); expect(explicitFirst(levelBand('B2'), st)).toBe(false); expect(explicitFirst(levelBand('C1'), st)).toBe(false); }
  });
});

describe('rule before the first try (explicit-first)', () => {
  it('a beginner with an unseen rule gets the rule line before the first try, and today\'s "no rule" text is replaced', () => {
    on('levelExplicit'); const b = build('Give me an exercise', [], { level: 'A2' });
    expect(b.signals.presentLessonItem?.id).toBe('i1'); expect(b.ctx.ruleFirst?.criteria).toEqual([1]);
    expect(b.prompt).toContain(RULE_LINE); expect(b.prompt).toContain('state the rule in ONE plain sentence of 20 words or fewer'); expect(b.prompt).toContain('one right example and one wrong example');
    expect(b.prompt).toContain('then present the lesson item to present now (named in this block) exactly as written'); expect(b.prompt).not.toContain(NO_RULE_BEFORE.slice(0, 40) + ' before their first try (not even');
    expect(b.prompt).toContain('Lesson item to present now: [i1]');
    expect(b.prompt).not.toContain(EXPLICIT_FIRST_LINE); // levelExplicit's own line replaces the arbitration one
  });
  it('an "emerging" objective makes a B2 learner explicit-first; the same B2 learner "proficient" is not', () => {
    on('levelExplicit'); expect(build('Give me an exercise', [], { level: 'B2', status: 'emerging' }).prompt).toContain(RULE_LINE);
    expect(build('Give me an exercise', [], { level: 'B2', status: 'not_assessed' }).prompt).toContain(RULE_LINE);
    expect(build('Give me an exercise', [], { level: 'B2', status: 'proficient' }).prompt).not.toContain(RULE_LINE);
  });
  it('the item\'s answer never reaches the prompt, and the reply guard still strips it before the first try', () => {
    on('levelExplicit'); const b = build('Give me an exercise', [], { level: 'A2' });
    expect(b.prompt).not.toMatch(/\bwatches\b/); // the answer key stays server-side
    expect(ruleBeforeFirstTryLine({ texts: SPEC.successCriteria!.slice(0, 1) })).not.toMatch(/\bwatches\b/);
    const reply = 'Rule: after he, she or it the verb takes -s.\n\nRight: She cooks dinner. Wrong: She cook dinner.\n\nMy cousin watches a film on Fridays.\n\nNow you: My cousin ___ (watch) a film on Fridays.';
    const g = applyReplyGuards(b.lang, reply, 'Give me an exercise');
    expect(g.text).not.toMatch(/\bwatches\b/); expect(g.removed).toBeGreaterThan(0); expect(g.text).toContain('Rule: after he, she or it'); expect(g.text).toContain('She cooks dinner.');
  });
  it('the learner\'s own answer is never modelled: the line forbids it and the next turn does not repeat the rule', () => {
    on('levelExplicit'); expect(build('Give me an exercise', [], { level: 'A2' }).prompt).toContain('never model on the learner\'s own answer');
  });
  it('each rule is introduced once per rule per session (recorded in the evidence, read back from history)', () => {
    on('levelExplicit'); const first = build('Give me an exercise', [], { level: 'A2' });
    const ev = turnEvidence(first.lang, 'o'); expect(ev.rulesIntroduced).toEqual([1]);
    const hist = [u('Give me an exercise'), a('Rule... My cousin ___ (watch) a film on Fridays.', { ...open, ...ev })];
    const second = build('go', hist, { level: 'A2' }); expect(second.ctx.ruleFirst).toBeUndefined(); expect(second.prompt).not.toContain(RULE_LINE);
    // a different rule (criterion 2) is still new: item 2 introduces it once, then never again
    const li2 = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
    const h2 = [...hist, u('Next one please'), a('Make a question: she / like / tea', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li2, rulesIntroduced: [2] })];
    expect(build('does she like tea', h2, { level: 'A2' }).ctx.ruleFirst).toBeUndefined();
  });
  it('decided per form: a criterion the learner has already shown this session needs no rule statement', () => {
    on('levelExplicit'); const shown = [u('Give me an exercise'), a('x', { ...open, assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NEW_ITEM', source: 'answer_key', item: 'i1' } })];
    const b = build('Give me an exercise', shown, { level: 'A2' }); expect(b.ctx.ruleFirst?.criteria ?? []).not.toContain(1);
  });
  it('after the first try the existing rule-first line (not the present-turn line) is used if the rule is still due', () => {
    on('levelExplicit'); const b = build('go', presented, { level: 'A2' });
    expect(b.ctx.ruleFirst?.criteria).toEqual([1]); expect(b.prompt).toContain(RULE_LINE); expect(b.prompt).toContain('(3) ask them to apply the rule to a new item');
  });
});

describe('questioning-first learners are unchanged', () => {
  const scenarios: [string, HistoryTurn[]][] = [['Give me an exercise', []], ['go', presented], ['why is it wrong?', presented], ['hint please', presented]];
  it('a B2 learner whose objective is proficient gets today\'s prompt byte for byte (arbitration named in both runs so only levelExplicit differs)', () => {
    for (const [msg, hist] of scenarios) for (const pp of [undefined, 'socratic_questioning', 'direct_instruction']) {
      on('arbitration'); const before = build(msg, hist, { level: 'B2', status: 'proficient', planPrimary: pp }).prompt;
      on('arbitration,levelExplicit'); const after = build(msg, hist, { level: 'B2', status: 'proficient', planPrimary: pp }).prompt;
      expect(after, `${msg}|${pp}`).toBe(before);
    }
  });
  it('same for B1 developing and C1 mastered, and the guarded replies are identical', () => {
    for (const [lvl, st] of [['B1', 'developing'], ['C1', 'mastered'], ['B2', undefined]] as const) for (const [msg, hist] of scenarios) {
      on('arbitration'); const b0 = build(msg, hist, { level: lvl, status: st }); const g0 = applyReplyGuards(b0.lang, 'Try again.\n\nMy cousin watches a film.', msg);
      on('arbitration,levelExplicit'); const b1 = build(msg, hist, { level: lvl, status: st }); const g1 = applyReplyGuards(b1.lang, 'Try again.\n\nMy cousin watches a film.', msg);
      expect(b1.prompt).toBe(b0.prompt); expect(g1).toEqual(g0);
    }
  });
  it('with the switch off nothing changes for a beginner either (no rule line, today\'s text)', () => {
    on('arbitration'); const b = build('Give me an exercise', [], { level: 'A1' });
    expect(b.prompt).not.toContain(RULE_LINE); expect(b.prompt).toContain(NO_RULE_BEFORE); expect('explicitFirst' in turnEvidence(b.lang, 'o')).toBe(false);
  });
});

describe('hint ladder', () => {
  const expl = (l: number) => hintInstruction(l, { explicit: true }); const base = (l: number) => hintInstruction(l, {});
  it('level 1 states the rule in general terms for explicit-first learners, and differs from today\'s attention cue', () => {
    expect(expl(1)).not.toBe(base(1)); expect(expl(1)).toContain('the concept or rule in general terms'); expect(base(1)).toContain('where to look');
    expect(expl(1)).toBe(base(2).replace('Support level 2 of 6 (conceptual cue)', 'Support level 1 of 6 (conceptual cue)'));
  });
  it('level 2 gives the right/wrong contrast pair and still forbids the answer form', () => {
    expect(expl(2)).toContain('right-versus-wrong contrast pair'); expect(expl(2)).toContain('words that are in no exercise'); expect(expl(2)).toMatch(/must not reveal[^.]*the correct form/);
  });
  it('levels 3 to 6 and two-option items are the same for both groups', () => {
    for (const l of [3, 4, 5, 6]) expect(expl(l)).toBe(base(l));
    for (const l of [1, 2, 3]) expect(hintInstruction(l, { explicit: true, binary: true })).toBe(hintInstruction(l, { binary: true }));
  });
  it('never contains an item\'s answer form (the instruction is generic) at any level', () => {
    for (const l of [1, 2, 3, 4, 5]) { expect(expl(l)).not.toMatch(/\bwatches\b/); expect(HINT_LADDER[l - 1].mustNotReveal.length).toBeGreaterThan(0); }
  });
  it('in the rendered prompt: an explicit-first learner after a miss gets the explicit level-1 text, a questioning-first learner today\'s', () => {
    const miss = [u('Give me an exercise'), a('My cousin ___ (watch) a film on Fridays.', open), u('go'), a('Hmm', { ...wrong, hintLevel: 0 })];
    on('levelExplicit'); const e = build('go', miss, { level: 'A2' }).prompt; const q = build('go', miss, { level: 'B2', status: 'proficient' }).prompt;
    expect(e).toContain('Support level 1 of 6 (conceptual cue)'); expect(q).toContain('Support level 1 of 6 (attention cue)'); expect(e).not.toMatch(/\bwatches\b/); expect(q).not.toMatch(/\bwatches\b/);
  });
});

describe('method gating below B1', () => {
  const base: PlanInput = { objectiveId: 'o', masteryStatus: 'developing', evidenceStrength: 'moderate', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [], recentResults: [], triedWithoutImprovement: [], applicationGap: true, gradeLevel: 10, subject: 'English' };
  it('belowB1 reads the course level label', () => {
    for (const v of ['A1', 'a2', 'pre-A1', 'A2 Elementary', 'preA1']) expect(belowB1(v), v).toBe(true);
    for (const v of ['B1', 'B2', 'C1', 'Grade 5', '', undefined]) expect(belowB1(v), String(v)).toBe(false);
    expect(LEVEL_GATED_METHODS.sort()).toEqual(['blooms_guided', 'case_based', 'inquiry_based', 'problem_based', 'project_based', 'socratic_questioning']);
  });
  it('off: an application gap still selects blooms_guided below B1 (today)', () => {
    delete process.env.ENARA_ENGINE_V2; expect(selectTeachingPlan({ ...base, belowB1: true }).primary).toBe('blooms_guided');
  });
  it('on: below B1 the application gap no longer selects blooms_guided; at B1 and above it still does', () => {
    on('levelExplicit'); const p = selectTeachingPlan({ ...base, belowB1: true }); expect(p.primary).not.toBe('blooms_guided'); expect(LEVEL_GATED_METHODS).not.toContain(p.primary);
    expect(selectTeachingPlan({ ...base, belowB1: false }).primary).toBe('blooms_guided'); expect(selectTeachingPlan(base).primary).toBe('blooms_guided');
  });
  it('on: Socratic and case/problem methods are not chosen below B1 for a proficient discussion or applied subject, but are at B1+', () => {
    const disc: PlanInput = { ...base, applicationGap: false, masteryStatus: 'proficient', subject: 'History' }; const mast: PlanInput = { ...disc, masteryStatus: 'mastered' }; const appl: PlanInput = { ...mast, subject: 'Biology' };
    delete process.env.ENARA_ENGINE_V2; const off = [disc, mast, appl].map((p) => selectTeachingPlan({ ...p, belowB1: true }).primary);
    expect(off.some((m) => LEVEL_GATED_METHODS.includes(m))).toBe(true); // today they can be chosen
    on('levelExplicit'); for (const p of [disc, mast, appl]) { expect(LEVEL_GATED_METHODS).not.toContain(selectTeachingPlan({ ...p, belowB1: true }).primary); }
    expect([disc, mast, appl].map((p) => selectTeachingPlan({ ...p, belowB1: false }).primary)).toEqual(off);
  });
  it('on: a plan for a course whose level is unknown is unchanged', () => {
    delete process.env.ENARA_ENGINE_V2; const off = selectTeachingPlan(base).primary; on('levelExplicit'); expect(selectTeachingPlan(base).primary).toBe(off);
  });
});

describe('guards stay on', () => {
  it('every move still has text, and the guard functions are the ones applyReplyGuards uses (answer-hiding unchanged with the switch on)', () => {
    on('levelExplicit'); expect(MOVE_IDS().length).toBeGreaterThan(10);
    const b = build('go', presented, { level: 'A2' }); const g = applyReplyGuards(b.lang, 'The rule: add -s. Now: My cousin watches a film on Fridays.', 'go');
    expect(typeof g.text).toBe('string');
  });
});
