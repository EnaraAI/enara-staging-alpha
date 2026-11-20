import { afterEach, describe, expect, it } from 'vitest';
import { spellingSlip, spellingPatternLine, lexicalTransfer, lexicalL1Line } from '../src/services/tutorWritingFixes';
import { planLesson, SWITCH_ORDER, type PlannerSignals } from '../src/services/lessonPlanner';
import type { PlanInput } from '../src/services/pedagogyPolicy';
import { lengthTarget, CHILD_SHORT_LINE, UNDER9_LENGTH, KIDS_PACK_CHILD_LENGTH } from '../src/services/languageTeachingContext';
import { trimChildReply } from '../src/services/languageTurnPipeline';

// LIT_REVIEW_GAP_PLAN 3.3 switchMove, 3.6 spellingPattern, 3.7 l1Lexical (English only), owner decision 2 childShort.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('spellingPattern: "biger" gets the doubling pattern on another word, never the misspelling', () => {
  it('finds missed doubling, not correct words or silent-e words', () => {
    expect(spellingSlip('My new office is biger than my old office.')).toMatchObject({ kind: 'doubling', wrong: 'biger', base: 'big', right: 'bigger' });
    expect(spellingSlip('thiner')).toMatchObject({ kind: 'doubling', right: 'thinner' });
    for (const ok of ['bigger', 'thinner', 'She hoped to win.', 'I am riding a bike.', 'We opened the door.', 'later', 'faster', 'slower']) expect([ok, spellingSlip(ok)]).toEqual([ok, null]);
  });
  it('finds a near miss of a lesson word ("mather" for "mother")', () => {
    expect(spellingSlip('This is my mather.', ['mother', 'father'])).toMatchObject({ kind: 'letters', wrong: 'mather', right: 'mother' });
  });
  it('the line shows another word split to show the pattern, never "biger", never the item answer', () => {
    const line = spellingPatternLine(spellingSlip('biger')!, ['hotter']);
    expect(line).not.toMatch(/biger/);
    expect(line).not.toMatch(/bi-gg-er|ho-tt-er/);
    expect(line).toMatch(/"[a-z]+-([a-z])\1-(er|ed|ing)"/);
  });
});

describe('l1Lexical: "my woman" is named as "wife", in English only', () => {
  it('recognises the known swaps', () => {
    expect(lexicalTransfer('This is my woman.')).toMatchObject({ right: 'wife', evidence: 'my woman' });
    expect(lexicalTransfer("This is my brother's woman.")?.right).toBe('wife');
    expect(lexicalTransfer('Please open the light.')?.right).toBe('turn on / turn off');
    expect(lexicalTransfer('My teacher learned me English.')?.right).toBe('teach');
    for (const ok of ['A woman is waiting for the train.', 'Open the window.', 'This is my wife.', 'My little brother is five.']) expect([ok, lexicalTransfer(ok)]).toEqual([ok, null]);
  });
  it('the line is English only (no Arabic script) and gives the right word', () => {
    const line = lexicalL1Line(lexicalTransfer('This is my woman.')!);
    expect(line).toMatch(/"wife"/);
    expect(line).toMatch(/in English only/);
    expect(/[؀-ۿ]/.test(line)).toBe(false);
  });
});

describe('switchMove: the same error twice changes the main method, again on each repeat', () => {
  const input: PlanInput = { objectiveId: 'o1', masteryStatus: 'developing', evidenceStrength: 'none', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [], recentResults: [], triedWithoutImprovement: [] } as unknown as PlanInput;
  const sig = (count?: number): PlannerSignals => ({ ageBand: 'adult', level: 'A2', ...(count ? { repeatedError: { code: 'missing_third_person_s', count } } : {}) });
  it('switch on: count 2 and count 3 give different main methods from the switch order', () => {
    process.env.ENARA_ENGINE_V2 = 'planner2,switchMove';
    const a = planLesson(input, sig(2)).plan; const b = planLesson(input, sig(3)).plan;
    expect(SWITCH_ORDER).toContain(a.primary); expect(SWITCH_ORDER).toContain(b.primary);
    expect(a.primary).not.toBe(b.primary);
    expect(a.reasonCodes.some((r) => r.startsWith('SWITCH_MOVE:missing_third_person_s:2'))).toBe(true);
  });
  it('switch off: no change', () => {
    process.env.ENARA_ENGINE_V2 = 'planner2';
    expect(planLesson(input, sig(2)).plan.reasonCodes.some((r) => r.startsWith('SWITCH_MOVE'))).toBe(false);
  });
});

describe('childShort', () => {
  const child = { status: 'known', value: 'child', source: 'student_birth_date' } as const;
  it('under 9: 3 short sentences plus a task; 9-12: the kids-pack table; off: unchanged', () => {
    process.env.ENARA_ENGINE_V2 = 'childShort';
    expect(lengthTarget(child as never, 'A2', 7).maxWords).toBe(UNDER9_LENGTH[1]);
    expect(lengthTarget(child as never, 'A1', 10)).toMatchObject({ targetWords: KIDS_PACK_CHILD_LENGTH.a1[0], maxWords: KIDS_PACK_CHILD_LENGTH.a1[1] });
    expect(lengthTarget(child as never, 'A2', 10).maxWords).toBe(65);
    expect(CHILD_SHORT_LINE).toMatch(/at most 3 sentences, each of at most 12 words, plus one task/);
    process.env.ENARA_ENGINE_V2 = '';
    expect(lengthTarget(child as never, 'A2', 7).maxWords).toBe(90);
  });
  it('the trim keeps the feedback line and the task, and drops long middle sentences', () => {
    const long = 'Yes, "This is my sister." is right. A family word names a person who belongs to your own family and lives with you or near you. Brothers and sisters are family. Grandparents are family too. Your turn. Write: This is my ___ (your mother\'s mother).';
    const r = trimChildReply(long);
    expect(r.removed).toBeGreaterThan(0);
    expect(r.text.startsWith('Yes, "This is my sister." is right.')).toBe(true);
    expect(r.text).toContain('Your turn.');
    expect(r.text).toContain('___');
    expect(r.text).not.toContain('lives with you or near you');
    expect(trimChildReply('Good. Your turn: This is my ___.')).toEqual({ text: 'Good. Your turn: This is my ___.', removed: 0 });
  });
});
