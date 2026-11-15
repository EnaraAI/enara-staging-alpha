import { afterEach, describe, expect, it } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, ruleFirstDecision, turnEvidence, hasTwoAsks, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { hintInstruction, type HistoryTurn } from '../src/services/languageLearningState';

// Fixes made before the ESL stage-2 study: (1) the levelExplicit rule line also fires on the first explanation turn; (2) level-2 hints ask for a NEW contrast pair;
// (3) the two-asks detector does not count "Tell me the rule in your own words" as a task.
const SPEC: LanguageSpec = { objectives: ['Third person -s'], successCriteria: ['Adds -s or -es after he, she and it', 'Uses do/does in questions'], items: [
  { id: 'i1', prompt: 'My cousin ___ (watch) a film on Fridays.', acceptedAnswers: ['watches'], targetForms: ['watches'], criteria: [1] }] };
const LESSON = { title: 'Routines', spec: SPEC };
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
function build(message: string, history: HistoryTurn[], level: string, status?: string) {
  const signals = detectTurnSignals(message, history, LESSON);
  const band = levelBand(level); const moves = selectLanguageMoves({ band, targetLanguage: 'English', lessonStatus: 'structured', signals, masteryStatus: status });
  const learner = deriveLearnerContext({ courseLevel: level, courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const d = ruleFirstDecision({ band: learner.proficiency.band, masteryStatus: status, history, signals, spec: SPEC, moves });
  const ctx = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'l', title: 'Routines', spec: SPEC }, signals, moves, ...(d.ruleFirst ? { ruleFirst: d.ruleFirst } : {}), ...(d.explicit !== undefined ? { explicitFirst: d.explicit } : {}) } as Omit<LanguageTeachingContext, 'prompt'>;
  return { ctx, moves, prompt: renderLanguageContextPrompt(ctx) };
}
const RULE_LINE = "First time this lesson's rule comes up";

describe('fix 1: rule line on the first explanation turn', () => {
  it('an explicit-first learner who only asks to practise gets an explanation turn with the rule line, once', () => {
    process.env.ENARA_ENGINE_V2 = 'levelExplicit'; const b = build('Hello, I want to practise this topic.', [], 'A2', 'not_assessed');
    expect(b.moves.map((m) => m.id)).toContain('short_explanation'); expect(b.ctx.ruleFirst?.criteria).toEqual([1]); expect(b.prompt).toContain(RULE_LINE);
    const ev = turnEvidence({ ...b.ctx, prompt: b.prompt } as LanguageTeachingContext, 'o'); expect(ev.rulesIntroduced).toEqual([1]);
    const again = build('Can you explain more?', [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Rule...', languageTurn: ev as never }], 'A2', 'not_assessed');
    expect(again.prompt).not.toContain(RULE_LINE);
  });
  it('switch off, or a questioning-first learner: no rule line on the explanation turn', () => {
    delete process.env.ENARA_ENGINE_V2; expect(build('Hello, I want to practise this topic.', [], 'A2', 'not_assessed').prompt).not.toContain(RULE_LINE);
    process.env.ENARA_ENGINE_V2 = 'levelExplicit'; expect(build('Hello, I want to practise this topic.', [], 'B2', 'proficient').prompt).not.toContain(RULE_LINE);
  });
});

describe('fix 2: level-2 hints ask for a new contrast pair', () => {
  it('the explicit level-2 hint asks for a pair different from every pair already used; other levels unchanged', () => {
    const t = hintInstruction(2, { explicit: true }); expect(t).toContain('a NEW short right-versus-wrong contrast pair'); expect(t).toContain('different from every pair already used in this chat');
    expect(hintInstruction(2, {})).not.toContain('NEW short'); expect(hintInstruction(3, { explicit: true })).toBe(hintInstruction(3, {}));
  });
});

describe('fix 3: two-asks detector', () => {
  it('"Tell me the rule in your own words" alone is one ask, not two', () => {
    expect(hasTwoAsks('Yes, "an" is right. Well done!\n\nTell me the rule in your own words.')).toBe(false);
    expect(hasTwoAsks('Good. Now write one new example of your own.')).toBe(false);
  });
  it('a closing ask plus a separate task is two asks; a task alone is not', () => {
    expect(hasTwoAsks('Tell me the rule in your own words. Then write a, an or the: I saw ___ owl.')).toBe(true);
    expect(hasTwoAsks('Good. Tell me the rule in your own words. Also, which is right: a apple or an apple?')).toBe(true);
    expect(hasTwoAsks('Write a, an or the: I saw ___ owl.')).toBe(false);
  });
});
