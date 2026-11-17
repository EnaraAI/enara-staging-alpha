// SIMULATION ONLY · DRAFT. graderV2 ON: the five fixes (research/assessment-validation/a1a2/REPORT.md §3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

vi.mock('../src/services/aiJson', () => ({ askForJson: vi.fn(), isAiConfigured: () => true }));
vi.mock('../src/models/GradingProposal', () => ({ GradingProposal: { create: vi.fn(async (doc: unknown) => doc) } }));

import { askForJson } from '../src/services/aiJson';
import { gradeAnswer } from '../src/services/assessmentSecurity';
import { gradeAnswers } from '../src/services/grading';
import { needsAiEvaluation } from '../src/services/autoGrading';
import { evaluateShortAnswer } from '../src/services/gradingProposals';
import { evaluateAgainstKey } from '../src/services/languageLearningState';
import { scoreControlled } from '../src/services/assessment/placementEngine';
import { graderV2On, matchKeyV2, scoreTargetForm, spellingIsTarget, targetFormMissing, type TargetFormItem } from '../src/services/graderV2';
import type { IQuestion } from '../src/models/Assessment';

const DIR = join(__dirname, '../../data/assessments/outcomes');
const BANK = new Map<string, TargetFormItem>();
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const items of Object.values(d.forms ?? {}) as TargetFormItem[][]) for (const it of items) BANK.set(it.id!.replace('EN-F-', ''), it);
}
const item = (id: string) => {
  const it = BANK.get(id);
  if (!it) throw new Error(`no item ${id}`);
  return it;
};
const key = (id: string, a: string) => matchKeyV2(item(id), a);
const tf = (id: string, a: string) => scoreTargetForm(item(id), a);

let prev: string | undefined;
beforeEach(() => { prev = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = 'graderV2'; });
afterEach(() => { if (prev === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = prev; });

describe('switch', () => {
  it('is named-only: off by default and not turned on by "all"', () => {
    delete process.env.ENARA_ENGINE_V2;
    expect(graderV2On()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(graderV2On()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'keyMatch,graderV2';
    expect(graderV2On()).toBe(true);
  });
});

describe('fix 1: normalised matching', () => {
  const q = (correctAnswer: string, extra: Partial<IQuestion> = {}) => ({ id: 'q', type: 'short-answer', text: 't', correctAnswer, ...extra }) as IQuestion;
  it('ignores case, final punctuation, extra spaces, curly apostrophes and quotes', () => {
    expect(gradeAnswer(q('There is'), 'there is.')).toBe(true);
    expect(gradeAnswer(q('There is a park.'), '  There   is a park ')).toBe(true);
    expect(gradeAnswer(q("It's my bag."), 'It’s my bag')).toBe(true);
    expect(gradeAnswer(q('He said "hello".'), 'He said “hello”')).toBe(true);
  });
  it('treats contractions and full forms as equal, both ways', () => {
    expect(gradeAnswer(q("can't"), 'cannot')).toBe(true);
    expect(gradeAnswer(q("can't"), 'can not')).toBe(true);
    expect(gradeAnswer(q('cannot'), "can't")).toBe(true);
    expect(gradeAnswer(q("I don't like fish."), 'I do not like fish')).toBe(true);
    expect(gradeAnswer(q('I am a nurse.'), "I'm a nurse.")).toBe(true);
    expect(gradeAnswer(q('It is cold.'), "it's cold")).toBe(true);
    expect(gradeAnswer(q("They're here."), 'They are here.')).toBe(true);
    expect(gradeAnswer(q("I'd like a tea, please."), 'I would like a tea please')).toBe(true);
    expect(gradeAnswer(q('Fish cannot live without water'), "Fish cant live without water")).toBe(true);
  });
  it('still rejects a wrong answer', () => {
    expect(gradeAnswer(q('There are'), 'There is')).toBe(false);
    expect(gradeAnswer(q('an'), 'a')).toBe(false);
    expect(gradeAnswer(q('studied'), 'studyed')).toBe(false);
  });
  it('capitals-full-stops items stay case- and punctuation-sensitive', () => {
    expect(key('A1-GR-capitals-full-stops-A-3', 'Ahmed lives in Cairo.')).toBe(true);
    expect(key('A1-GR-capitals-full-stops-A-3', 'Ahmed   lives in Cairo. ')).toBe(true); // extra spaces only
    expect(key('A1-GR-capitals-full-stops-A-3', 'ahmed lives in cairo.')).toBe(false); // differs only in case: case is the target
    expect(key('A1-GR-capitals-full-stops-A-3', 'AHMED LIVES IN CAIRO.')).toBe(false);
    expect(key('A1-GR-capitals-full-stops-A-3', 'Ahmed lives in Cairo')).toBe(false); // missing full stop
  });
  it('days-months items need the capital on the day/month word', () => {
    expect(key('A1-VO-days-months-A-1', 'Tuesday.')).toBe(true);
    expect(key('A1-VO-days-months-A-1', 'tuesday')).toBe(false);
    expect(key('A1-VO-days-months-A-1', 'TUESDAY')).toBe(false);
  });
  it('applies in the lesson key (in-lesson exercises) and placement', () => {
    const lesson = { id: 'i1', prompt: 'Make it negative: She likes tea.', acceptedAnswers: ["She doesn't like tea."] };
    expect(evaluateAgainstKey('she does not like tea', lesson)).toBe('CORRECT');
    expect(evaluateAgainstKey('She doesnt like tea!', lesson)).toBe('CORRECT');
    expect(evaluateAgainstKey('She not like tea', lesson)).toBeNull();
    expect(evaluateAgainstKey('She no like tea — sorry, she does not like tea', lesson)).toBe('CORRECT');
    const caps = { id: 'i2', prompt: 'Rewrite: ahmed lives in cairo', acceptedAnswers: ['Ahmed lives in Cairo.'], matchingNote: item('A1-GR-capitals-full-stops-A-3').matchingNote };
    expect(evaluateAgainstKey('ahmed lives in cairo', caps)).toBeNull();
    expect(scoreControlled({ id: 'p', level: 'A1', skill: 'grammar', type: 'short-answer', prompt: 'x', correctAnswer: "isn't", points: 1, outcomeIds: [], reference: '' }, 'is not.')).toBe(true);
  });
});

describe('fix 2: several accepted answers (assignment grader too)', () => {
  const pos = { id: 'q1', type: 'short-answer', text: 'Correct the mistake: In my village have a small mosque.', correctAnswer: 'There is a small mosque in my village.', acceptedAnswers: item('A1-GR-there-is-are-A-6').acceptedAnswers, explanation: '', points: 1 } as IQuestion;
  it('any accepted answer scores', () => {
    expect(gradeAnswer(pos, 'In my village, there is a small mosque.')).toBe(true);
    expect(gradeAnswer(pos, "In my village there's a small mosque")).toBe(true);
    const [g] = gradeAnswers([pos], { q1: 'In my village, there is a small mosque.' });
    expect(g).toMatchObject({ isCorrect: true, points: 1, method: 'rule' });
  });
  it('note lines inside acceptedAnswers are not answers', () => {
    const q = { ...pos, acceptedAnswers: ['Case-insensitive; ignore final punctuation and extra spaces.'] } as IQuestion;
    expect(gradeAnswer(q, 'Case-insensitive; ignore final punctuation and extra spaces.')).toBe(false);
  });
});

describe('fix 3: option letter = option text', () => {
  const mc = { id: 'm', type: 'multiple-choice', text: 'Pick one', options: ['Give me a bag.', 'Can I have a bag, please?', 'I want a bag.'], correctAnswer: 'Can I have a bag, please?', explanation: '' } as IQuestion;
  it('accepts b, B, b), (b), B. and the text', () => {
    for (const a of ['b', 'B', 'b)', '(b)', 'B.', '(b) Can I have a bag, please?', 'can i have a bag please']) expect(gradeAnswer(mc, a)).toBe(true);
    for (const a of ['a', '(c)', 'I want a bag.', '(a) Can I have a bag, please?']) expect(gradeAnswer(mc, a)).toBe(false);
  });
  it('bank items: letter key, prompt options, and the gap filled', () => {
    expect(key('A2-FN-polite-requests-A-3', '(b) Can I have a bag, please?')).toBe(true);
    expect(key('A2-FN-polite-requests-A-3', 'Can I have a bag, please?')).toBe(true);
    expect(key('A2-FN-polite-requests-A-3', 'a')).toBe(false);
    expect(key('A1-GR-article-a-an-A-4', 'an umbrella')).toBe(true);
    expect(key('A1-GR-article-a-an-A-4', 'a umbrella')).toBe(false);
    expect(key('A1-GR-article-a-an-A-4', 'umbrella')).toBe(false);
    // "a" for options (a / an) is the article, not option letter a
    expect(key('A1-GR-article-a-an-A-4', 'a')).toBe(false);
    expect(key('A1-GR-article-a-an-A-4', 'b')).toBe(true);
  });
  it('capitals choice: the letter is case-insensitive, the text is not', () => {
    expect(key('A1-GR-capitals-full-stops-A-1', 'B')).toBe(true);
    expect(key('A1-GR-capitals-full-stops-A-1', 'My name is Yara.')).toBe(true);
    expect(key('A1-GR-capitals-full-stops-A-1', 'my name is Yara.')).toBe(false);
  });
});

describe('fix 4: target-form scorer 0/1/2 (docs/SCORING_RUBRIC.md §3 examples)', () => {
  it('free sentences', () => {
    expect(tf('A2-GR-third-person-s-A-7', 'My teacher checks our homework every day.')).toBe(2);
    expect(tf('A2-GR-third-person-s-A-7', 'my teacher give us homeworks every day')).toBe(0);
    expect(tf('A1-GR-copula-be-A-8', 'My grandfather he is very old.')).toBe(2);
    expect(tf('A2-GR-present-continuous-A-7', 'My brother is siting on the sofa.')).toBe(1);
    expect(tf('A2-GR-some-any-A-7', "I haven't got some pens in my bag.")).toBe(0);
  });
  it('transfer', () => {
    expect(tf('A2-GR-third-person-s-A-7', 'He catches the bus at seven.')).toBe(2);
    expect(tf('A2-GR-third-person-s-A-7', 'Omar catchs the bus at 7')).toBe(1);
    expect(tf('A1-GR-there-is-are-A-9', 'There is one pool and there are 2 restaurant.')).toBe(2);
    expect(tf('A1-GR-prepositions-time-A-9', 'Art club is in Tuesday at 4 in October.')).toBe(1);
    expect(tf('A2-FN-polite-requests-A-9', 'Give me one more towel.')).toBe(0);
  });
  it('ignores slips in other words, not in the target form', () => {
    expect(tf('A2-GR-third-person-s-A-8', 'My mother visits her grandmothers on fridy.')).toBe(2);
    expect(tf('A1-GR-copula-be-A-7', 'It is very bussy and hot.')).toBe(2);
    expect(tf('A2-GR-comparatives-A-7', 'Cairo is biger than Ismailia.')).toBe(1);
    expect(tf('A2-GR-comparatives-A-7', 'Cairo is bigger than Ismailia.')).toBe(2);
    expect(tf('A2-GR-past-simple-irregular-A-7', 'I goed to Alexandria.')).toBe(0);
    expect(tf('A2-GR-past-simple-irregular-A-7', 'I went to Alexandria with my cusin.')).toBe(2);
    expect(tf('A1-GR-can-ability-A-7', 'I can to swim.')).toBe(1); // round-3 fix: wrong form after a correct can = slip (rubric §6)
    expect(tf('A1-GR-can-ability-A-8', "I cann't drive.")).toBe(1);
    expect(tf('A2-GR-going-to-A-7', 'I going to cook.')).toBe(0);
    expect(tf('A2-GR-going-to-A-7', "I'm going to cook dinner.")).toBe(2);
  });
  it('avoiding the form scores 0; blank / I don\'t know / prompt copy score 0', () => {
    expect(tf('A1-GR-there-is-are-A-7', 'My village has a small mosque.')).toBe(0);
    expect(tf('A1-GR-there-is-are-A-7', "I don't know")).toBe(0);
    expect(tf('A1-GR-there-is-are-A-7', '')).toBe(0);
  });
  it('case-sensitive targets: capitals free sentence and day names', () => {
    expect(tf('A1-GR-capitals-full-stops-A-7', 'I live in Damietta.')).toBe(2);
    expect(tf('A1-GR-capitals-full-stops-A-7', 'I live in Damietta')).toBe(1);
    expect(tf('A1-GR-capitals-full-stops-A-7', 'i live in Damietta')).toBe(0);
    expect(tf('A1-VO-days-months-A-7', 'My favourite day is Friday.')).toBe(2);
    expect(tf('A1-VO-days-months-A-7', 'my favourite day is friday')).toBe(1);
  });
  it('vocabulary: field word 2, misspelt 1, none 0', () => {
    expect(tf('A1-VO-family-A-7', 'My grandfather is very kind.')).toBe(2);
    expect(tf('A1-VO-family-A-7', 'My grandfathr is kind.')).toBe(1);
    expect(tf('A1-VO-family-A-7', 'My dad is kind.')).toBe(0);
  });
  it('assignment grader scores target-form items by rule and skips the model', () => {
    const it0 = item('A1-GR-there-is-are-A-7');
    const q = { id: 'f1', type: 'open-response', text: it0.prompt, explanation: '', targetForm: it0.targetForm, scoring: 'target_form_0_1_2', rubric: { criteria: [{ id: 'tf', title: 'Target form', maxPoints: 2, levels: [{ id: 'tf0', label: '0', points: 0 }, { id: 'tf1', label: '1', points: 1 }, { id: 'tf2', label: '2', points: 2 }] }] } } as IQuestion;
    const [g] = gradeAnswers([q], { f1: 'There is a bakary in my street' });
    expect(g).toMatchObject({ points: 2, maxPoints: 2, method: 'rule', isCorrect: true });
    expect(needsAiEvaluation(q, g as never)).toBe(false);
    const [h] = gradeAnswers([q], { f1: 'My street has a bakery.' });
    expect(h).toMatchObject({ points: 0, method: 'rule' });
  });
});

describe('fix 5: meaning-check guard', () => {
  const q = { id: 's1', type: 'short-answer', text: 'Correct the mistake: In my village have a small mosque.', correctAnswer: 'There is a small mosque in my village.', targetForm: 'there is + singular/uncountable; there are + plural', explanation: '', points: 1 } as IQuestion;
  const attempt = { id: 'a1', institutionId: 'i1', assignmentId: 'as1' } as never;
  it('the model cannot credit an answer that avoids the target form', async () => {
    vi.mocked(askForJson).mockResolvedValueOnce({ value: { correct: true, scoreExplanation: 'Same meaning.', feedback: 'Good.', flags: [] }, model: 'm' } as never);
    const p = (await evaluateShortAnswer({ attempt, question: q, answer: 'My village has a small mosque.', run: 1 })) as unknown as { points: number; flags: string[] };
    expect(p.points).toBe(0);
    expect(p.flags).toContain('target_form_missing');
    expect(targetFormMissing(q, 'My village has a small mosque.')).toBe(true);
  });
  it('a model credit that keeps the target form stands', async () => {
    vi.mocked(askForJson).mockResolvedValueOnce({ value: { correct: true, scoreExplanation: 'ok', feedback: 'Good.', flags: [] }, model: 'm' } as never);
    const p = (await evaluateShortAnswer({ attempt, question: q, answer: 'A small mosque, there is one in my village.', run: 1 })) as unknown as { points: number };
    expect(p.points).toBe(1);
  });
  it('lesson targetForms: presence check', () => {
    expect(targetFormMissing({ targetForms: ['goes'] }, 'She go to school')).toBe(true);
    expect(targetFormMissing({ targetForms: ['goes'] }, 'She goes to school')).toBe(false);
    expect(targetFormMissing({}, 'anything')).toBeNull();
  });
});

describe('round-3 fixes (new examples, not round-3 answers)', () => {
  it('1. partial credit: target form attempted with one slip = 1', () => {
    expect(tf('A1-GR-can-ability-A-8', 'My sister can cooks rice.')).toBe(1);
    expect(tf('A1-GR-can-ability-A-8', 'My sister can cooking rice.')).toBe(1);
    expect(tf('A1-GR-can-ability-A-8', 'My sister can cook rice.')).toBe(2);
    expect(tf('A2-GR-past-simple-regular-A-7', 'On Monday I playd football.')).toBe(1);
    expect(tf('A2-GR-past-simple-regular-A-7', 'On Monday I played football.')).toBe(2);
    expect(tf('A2-GR-present-continuous-A-7', 'My uncle is work in the garden.')).toBe(1);
    expect(tf('A2-GR-present-continuous-A-7', 'My uncle working in the garden.')).toBe(0);
    expect(tf('A1-VO-common-adjectives-C-7', 'My street is very quiet.')).toBe(2);
    expect(tf('A1-VO-common-adjectives-C-7', 'My street is very queit.')).toBe(1);
    expect(tf('A2-GR-conjunctions-C-8', 'I stay home becase it is raining.')).toBe(1);
  });
  it('2. every occurrence of the form is checked', () => {
    expect(tf('A2-GR-third-person-s-A-7', 'My brother cooks dinner and he wash the plates.')).toBe(1);
    expect(tf('A2-GR-third-person-s-A-7', 'My brother cooks dinner and he washes the plates.')).toBe(2);
    expect(tf('A2-GR-third-person-s-A-7', 'My aunt cookes fish on Fridays.')).toBe(1);
    expect(tf('A1-GR-copula-be-C-8', 'My uncle and my aunt is teachers.')).toBe(0);
    expect(tf('A1-GR-copula-be-C-8', 'My cousins is very noisy.')).toBe(0);
    expect(tf('A1-GR-copula-be-C-8', 'My uncle and my aunt are teachers.')).toBe(2);
    expect(tf('A2-GR-past-simple-regular-A-7', 'Yesterday we opened the windows and we cleanned the floor.')).toBe(1);
    expect(tf('A2-GR-past-simple-regular-A-7', 'Last week I stoped smoking.')).toBe(1);
    expect(tf('A1-VO-numbers-time-C-7', 'I wake up at sevn o\'clock.')).toBe(1);
    expect(tf('A1-VO-numbers-time-C-7', 'I wake up at seven o\'clock.')).toBe(2);
    expect(tf('A1-VO-numbers-time-C-7', 'I wake up at half past six.')).toBe(2);
    expect(tf('A2-GR-frequency-adverbs-C-8', "My father doesn't never drink coffee.")).toBe(1);
    expect(tf('A2-GR-frequency-adverbs-C-8', 'My father never drinks coffee.')).toBe(2);
    expect(tf('A1-GR-capitals-full-stops-C-8', 'My teacher is mr Karim.')).toBe(1);
    expect(tf('A2-GR-conjunctions-C-8', 'I like cooking but not the washing.')).toBe(1);
    expect(tf('A2-GR-conjunctions-C-8', 'I like cooking but I hate the washing.')).toBe(2);
  });
  it('3. a non-sentence answer scores 0 where a sentence is required', () => {
    expect(tf('A1-VO-family-C-8', 'Her cousin Laila.')).toBe(0);
    expect(tf('A1-VO-family-C-8', 'My cousin lives in Amman.')).toBe(2);
  });
  it('4. make/do: the verb-noun pair is checked', () => {
    expect(tf('A2-VO-make-do-B-9', 'Salma makes the ironing on Sunday.')).toBe(0);
    expect(tf('A2-VO-make-do-B-9', 'Salma does the ironing on Sunday.')).toBe(2);
    expect(tf('A2-VO-make-do-B-9', 'Omar does dinner on Sunday.')).toBe(0);
    expect(tf('A2-VO-make-do-B-7', 'We made a big mess in the kitchen.')).toBe(2);
    expect(tf('A2-VO-make-do-B-7', 'We did a big mess and made some tea.')).toBe(1);
  });
  it('5. word order has a rule (no fallback)', () => {
    expect(tf('A1-GR-word-order-svo-B-9', 'I see you at the station at nine.')).toBe(2);
    expect(tf('A1-GR-word-order-svo-A-8', 'At school I play basketball.')).toBe(0);
    expect(tf('A1-GR-word-order-svo-A-8', 'I basketball play at school.')).toBe(0);
    expect(tf('A1-GR-word-order-svo-A-8', 'I play at school basketball.')).toBe(1);
    expect(tf('A1-GR-word-order-svo-A-8', 'I play basketball at school.')).toBe(2);
    expect(tf('A1-GR-word-order-svo-A-7', 'I eat bread.')).toBe(1);
  });
  it('6. guard: no meaning-check credit when the written form is the target', async () => {
    expect(spellingIsTarget(item('A1-VO-food-drink-C-2'))).toBe(true);
    expect(targetFormMissing(item('A1-VO-food-drink-C-2'), 'carrots')).toBe(true);
    expect(targetFormMissing(item('A1-VO-food-drink-C-2'), 'carrot')).toBe(false);
    expect(targetFormMissing(item('A1-VO-numbers-time-A-2'), 'fourtey')).toBe(true);
    expect(targetFormMissing(item('A1-VO-family-B-1'), 'grand pa')).toBe(true);
    expect(targetFormMissing(item('A1-VO-family-B-1'), 'grandpa')).toBe(false);
    // days-months A-9 is a transfer item, now scored 0/1/2 (round-4 data fix): an all-capitals day is 1, not missing
    expect(targetFormMissing(item('A1-VO-days-months-A-9'), 'THURSDAY')).toBe(false);
    expect(scoreTargetForm(item('A1-VO-days-months-A-9'), 'THURSDAY')).toBe(1);
    expect(targetFormMissing(item('A1-VO-days-months-C-5'), 'School starts again in september')).toBe(true);
    expect(targetFormMissing(item('A1-GR-capitals-full-stops-A-3'), 'Ahmed lives in cairo.')).toBe(true);
    const q = { id: 'v1', type: 'short-answer', text: 'Write one word: an orange vegetable', correctAnswer: 'carrot', objectiveIds: ['EN-F-A1-VO-food-drink'], explanation: '', points: 1 } as IQuestion;
    vi.mocked(askForJson).mockClear();
    const p = (await evaluateShortAnswer({ attempt: { id: 'a', institutionId: 'i', assignmentId: 's' } as never, question: q, answer: 'carrott', run: 1 })) as unknown as { points: number };
    expect(p.points).toBe(0);
    expect(askForJson).not.toHaveBeenCalled(); // production safety: no model call for word-target items
    // a grammar error-correction item keeps the meaning check
    expect(spellingIsTarget(item('A2-GR-third-person-s-A-5'))).toBe(false);
  });
});

describe('round-4 fixes (new examples, not round-4 answers)', () => {
  const gap = (prompt: string, keys: string[], extra: Partial<TargetFormItem> = {}): TargetFormItem => ({ type: 'gap_fill', prompt, answerKey: keys[0], acceptedAnswers: keys, matchingNote: 'Case-insensitive; ignore final punctuation and extra spaces.', scoring: 'exact', ...extra });
  const free = (targetForm: string, prompt = 'Write one sentence.', acceptedAnswers: string[] = []): TargetFormItem => ({ type: 'free_production', prompt, targetForm, acceptedAnswers, scoring: 'target_form_0_1_2' });
  it('1. apostrophe-less contractions match; "its" only where unambiguous; the guard follows', () => {
    const it1 = gap("Complete: ___ a lot of cars on our street.", ["That's", 'That is']);
    expect(matchKeyV2(it1, 'thats')).toBe(true);
    expect(matchKeyV2(gap('Complete: ___ my teacher.', ["She's"]), 'shes')).toBe(true);
    expect(matchKeyV2(gap('Complete: We ___ like fish.', ["don't"]), 'dont')).toBe(true);
    expect(matchKeyV2(gap('Complete: He ___ at home.', ["isn't"]), 'isnt')).toBe(true);
    expect(matchKeyV2(gap('Complete: ___ very cold today.', ["It's"]), 'its')).toBe(true);
    expect(matchKeyV2(gap('Complete: The dog wants ___ food.', ['its']), 'it is')).toBe(false);
    expect(matchKeyV2({ ...gap('Write the word:', ["they're"]), matchingNote: 'Case- and punctuation-sensitive.' }, 'theyre')).toBe(false);
    expect(targetFormMissing({ ...it1, id: 'X-VO-x', targetForm: 'that' }, 'thats')).toBe(false);
  });
  it('2. error correction: target-only, slips outside the target ignored', () => {
    const ec = (prompt: string, key: string, targetForm = ''): TargetFormItem => ({ type: 'error_correction', prompt, answerKey: key, acceptedAnswers: [key], targetForm, scoring: 'exact' });
    const a = ec('Find and correct the mistake. Rewrite the sentence: My sistr works in a hospital.', 'My sister works in a hospital.');
    expect(matchKeyV2(a, 'My sister work in a hospital.')).toBe(true);
    expect(matchKeyV2(a, 'My sister works in hospital.')).toBe(true);
    expect(matchKeyV2(a, 'My sistr works in a hospital.')).toBe(false);
    expect(matchKeyV2(a, 'My sistar works in a hospital.')).toBe(false);
    expect(matchKeyV2(a, 'My brother works in a hospital.')).toBe(false);
    const c = ec('Fix the mistake: My bag is more heavier than yours.', 'My bag is heavier than yours.', 'adjective-er / more + adjective + than');
    expect(matchKeyV2(c, 'My bag is heavier than your.')).toBe(true);
    expect(matchKeyV2(c, 'My bag is heavier then yours.')).toBe(false); // than is part of the comparative target
    expect(matchKeyV2(c, 'My bag is more heavier than yours.')).toBe(false);
    expect(matchKeyV2(c, 'My bag is heavyer than yours.')).toBe(false);
  });
  it('3. a gap answer that repeats the subject shown before the gap', () => {
    const g = gap('Write the present continuous: She ___ (cook) dinner now.', ['is cooking', "'s cooking"]);
    expect(matchKeyV2(g, "She's cooking")).toBe(true);
    expect(matchKeyV2(g, 'she is cooking')).toBe(true);
    expect(matchKeyV2(g, 'He is cooking')).toBe(false);
    expect(matchKeyV2(g, 'She cooking')).toBe(false);
  });
  it('4. comparatives: more + short adjective = 0, more + -er = 0, more + long adjective = 2', () => {
    const tf = 'adjective-er / more + adjective + than';
    expect(scoreTargetForm(free(tf), 'My street is more quiet than yours... no, more old than yours.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'Summer is more hot than winter.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'This test is more easy than the last one.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'My phone is more smaller than yours.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'This book is more interesting than that one.')).toBe(2);
    expect(scoreTargetForm(free(tf), 'Summer is hotter than winter.')).toBe(2);
  });
  it('5. frequency adverbs: position after a main verb = 0', () => {
    const tf = 'always/usually/sometimes/never before the main verb';
    expect(scoreTargetForm(free(tf), 'We eat usually fish on Friday.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'We usually eat fish on Friday.')).toBe(2);
    expect(scoreTargetForm(free(tf), 'She is always late.')).toBe(2);
    expect(scoreTargetForm(free(tf), "I can't always sleep well.")).toBe(2);
  });
  it('6. some in a yes/no question = 0; offers/requests keep some', () => {
    const tf = 'some (positive), any (negative and questions)';
    expect(scoreTargetForm(free(tf), 'Have you got some stamps?')).toBe(0);
    expect(scoreTargetForm(free(tf), 'Is there some milk in the fridge?')).toBe(0);
    expect(scoreTargetForm(free(tf), 'Would you like some juice?')).toBe(2);
    expect(scoreTargetForm(free(tf), 'Is there any milk?')).toBe(2);
  });
  it('7./8. past simple: every verb checked; over-regularised alone 0, next to a right past 1', () => {
    expect(scoreTargetForm(free('regular verb + -ed'), 'We visited my aunt and play football.')).toBe(1);
    expect(scoreTargetForm(free('regular verb + -ed'), 'We visited my aunt and played football.')).toBe(2);
    expect(scoreTargetForm(free('irregular past'), 'I went to the market and I eat a sandwich.')).toBe(1);
    expect(scoreTargetForm(free('irregular past'), 'I went to the market and I eated a sandwich.')).toBe(1);
    expect(scoreTargetForm(free('irregular past'), 'Yesterday I eated a sandwich.')).toBe(0);
    expect(scoreTargetForm(free('irregular past'), 'I went to the market and ate a sandwich.')).toBe(2);
  });
  it('9. possessives: his/her checked against the owner; unknown name gender is not decided', () => {
    const tf = 'possessive adjective agreeing with the owner (his/her/our/their)';
    expect(scoreTargetForm(free(tf), 'My sister lost his keys.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'My sister lost her keys.')).toBe(2);
    expect(scoreTargetForm(free(tf), 'Omar washes her car on Friday.')).toBe(0);
    expect(scoreTargetForm(free(tf), 'My friend Zorin likes his bike.')).toBeNull();
    expect(scoreTargetForm(free(tf), 'Her bag is red.')).toBe(2);
  });
  it('10. a misspelt 3-letter target word in a free sentence = 1', () => {
    const v = free('hot', "Write one sentence. Use 'hot'.", ['hot']);
    expect(scoreTargetForm({ ...v, id: 'X-VO-weather-1' }, 'The soup is hott.')).toBe(1);
    expect(scoreTargetForm({ ...v, id: 'X-VO-weather-1' }, 'The soup is hot.')).toBe(2);
    expect(scoreTargetForm({ ...v, id: 'X-VO-weather-1' }, 'The soup is good.')).toBe(0);
  });
  it('bank data: targetForm matches the prompt; transfer items use 0/1/2', () => {
    expect(item('A1-VO-food-drink-C-5').targetForm).toBe('pepper');
    expect(item('A2-VO-jobs-workplaces-B-5').targetForm).toBe('driver');
    expect(item('A2-VO-appearance-B-1').targetForm).toBe('thin');
    for (const it of BANK.values()) if (it.type === 'transfer') expect(it.scoring).toBe('target_form_0_1_2');
  });
});

describe('production safety: no meaning check for word-target items (new examples)', () => {
  const attempt = { id: 'ps-a', institutionId: 'ps-i', assignmentId: 'ps-s' } as never;
  const short = (extra: Partial<IQuestion>) => ({ id: 'ps1', type: 'short-answer', text: 'Write one word.', explanation: '', points: 1, ...extra }) as IQuestion;
  const route = (q: IQuestion, answer: string) => { const [g] = gradeAnswers([q], { [q.id]: answer }); return { g, ai: needsAiEvaluation(q, g as never) }; };
  it('vocabulary exact miss: no model call, deterministic score kept', async () => {
    const q = short({ text: 'Write one word: a yellow fruit', correctAnswer: 'banana', objectiveIds: ['EN-F-A1-VO-food-drink'] });
    const { g, ai } = route(q, 'bananna');
    expect(g).toMatchObject({ points: 0, isCorrect: false, method: 'rule' });
    expect(ai).toBe(false);
    vi.mocked(askForJson).mockClear();
    const p = (await evaluateShortAnswer({ attempt, question: q, answer: 'bananna', run: 1 })) as unknown as { points: number };
    expect(p.points).toBe(0);
    expect(askForJson).not.toHaveBeenCalled();
    // single-word targetForm equal to the key, no objective id
    expect(route(short({ correctAnswer: 'kitchen', targetForm: 'kitchen' }), 'kichen').ai).toBe(false);
  });
  it('days-months / capitals exact miss: no model call', () => {
    const dm = short({ text: 'Write the month after May.', correctAnswer: 'June', matchingNote: 'days-months: the day/month word is case-sensitive' });
    expect(route(dm, 'june').ai).toBe(false);
    const cap = short({ text: 'Write the sentence correctly: my name is sara', correctAnswer: 'My name is Sara.', matchingNote: 'capitals-full-stops: case- and punctuation-sensitive' });
    const r = route(cap, 'my name is Sara.');
    expect(r.g).toMatchObject({ points: 0, method: 'rule' });
    expect(r.ai).toBe(false);
  });
  it('grammar short-answer miss: still routed to the model', () => {
    const q = short({ text: 'Correct the mistake: He go to work by bus.', correctAnswer: 'He goes to work by bus.', objectiveIds: ['EN-F-A2-GR-third-person-s'] });
    expect(route(q, 'He travels to work by bus.').ai).toBe(true);
  });
  it('open response: still routed to the rubric', () => {
    const q = { id: 'ps2', type: 'open-response', text: 'Describe your kitchen.', explanation: '', objectiveIds: ['EN-F-A1-VO-home-rooms'], rubric: { criteria: [{ id: 'c', title: 'Content', maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0 }, { id: 'l2', label: '2', points: 2 }] }] } } as IQuestion;
    expect(needsAiEvaluation(q, { questionId: 'ps2', studentAnswer: 'My kitchen is small and white.' } as never)).toBe(true);
  });
  it('graderV2 OFF: routing unchanged (word-target miss still goes to the model)', async () => {
    delete process.env.ENARA_ENGINE_V2;
    const q = short({ correctAnswer: 'banana', objectiveIds: ['EN-F-A1-VO-food-drink'] });
    expect(route(q, 'bananna').ai).toBe(true);
    vi.mocked(askForJson).mockClear();
    vi.mocked(askForJson).mockResolvedValueOnce({ value: { correct: true, scoreExplanation: 'Spelling slip.', feedback: 'Good.', flags: [] }, model: 'm' } as never);
    const p = (await evaluateShortAnswer({ attempt, question: q, answer: 'bananna', run: 1 })) as unknown as { points: number };
    expect(askForJson).toHaveBeenCalledTimes(1);
    expect(p.points).toBe(1);
  });
});

describe('round-6 fix: irregular forms (new examples, not bank or earlier rounds)', () => {
  const g = (targetForm: string) => ({ targetForm, scoring: 'target_form_0_1_2', prompt: 'Write a sentence.' }) as TargetFormItem;
  const TP = g('he/she/it + verb-s/-es'), MM = g('much + uncountable noun; many + plural countable noun'), BE = g('am / is / are after the subject');
  it('third-person: does (C-9 key) = 2, do = 0', () => {
    expect(tf('A2-GR-third-person-s-C-9', 'Karim does his homework at home.')).toBe(2);
    expect(tf('A2-GR-third-person-s-C-9', 'Karim do his homework')).toBe(0);
  });
  it('third-person: has = 2, have = 0', () => {
    expect(scoreTargetForm(TP, 'My cousin has a small garden.')).toBe(2);
    expect(scoreTargetForm(TP, 'My cousin have a small garden.')).toBe(0);
  });
  it('third-person: copula is = 2; is + base verb still 0; question unaffected', () => {
    expect(scoreTargetForm(TP, 'My teacher is very kind.')).toBe(2);
    expect(scoreTargetForm(TP, 'She is cook dinner.')).toBe(0);
    expect(scoreTargetForm(TP, 'Does he have a bike?')).toBe(0);
  });
  it('much/many: irregular plurals teeth, feet, mice = 2; uncountable after many still wrong', () => {
    expect(scoreTargetForm(MM, 'The baby has many teeth now.')).toBe(2);
    expect(scoreTargetForm(MM, 'A spider has many feet.')).toBe(2);
    expect(scoreTargetForm(MM, 'We found many rice in the box.')).toBe(0);
  });
  it('copula: irregular plural subject + are = 2; + is = 0', () => {
    expect(scoreTargetForm(BE, 'The women are at the market.')).toBe(2);
    expect(scoreTargetForm(BE, 'The children is in the garden.')).toBe(0);
  });
});

describe('round-7 fix: every verb, be agreement, head noun, two-slot items', () => {
  const g = (targetForm: string) => ({ targetForm, scoring: 'target_form_0_1_2', prompt: 'Write a sentence.' }) as TargetFormItem;
  const TP = g('he/she/it + verb-s/-es'), BE = g('am / is / are after the subject');
  it('round-6 reference sentences', () => {
    expect(tf('A2-GR-third-person-s-A-8', 'My father has a big breakfast and go to the mosque.')).toBe(1);
    expect(tf('A1-GR-copula-be-B-8', 'Huda are very good at maths.')).toBe(0);
    expect(tf('A1-GR-copula-be-B-7', 'The people in my town are very friendly.')).toBe(2);
    expect(tf('A1-GR-there-is-are-A-9', 'There is a pool and two restaurants.')).toBe(1);
  });
  it('fix 1: every verb is checked', () => {
    expect(scoreTargetForm(TP, 'My aunt cooks lunch and cleans the kitchen.')).toBe(2);
    expect(scoreTargetForm(TP, 'My aunt cooks lunch and clean the kitchen.')).toBe(1);
  });
  it('fix 2: singular subject + to be', () => {
    expect(scoreTargetForm(BE, 'Samir is in the library.')).toBe(2);
    expect(scoreTargetForm(BE, 'Samir are in the library.')).toBe(0);
    expect(scoreTargetForm(BE, 'My sister was at home yesterday.')).toBe(2);
    expect(scoreTargetForm(BE, 'My sister were at home yesterday.')).toBe(0);
  });
  it('fix 3: words between subject and verb', () => {
    expect(scoreTargetForm(BE, 'The books on my desk are new.')).toBe(2);
    expect(scoreTargetForm(BE, 'The boy with the dogs are my cousin.')).toBe(0);
  });
  it('fix 4: two-slot transfer item', () => {
    expect(tf('A1-GR-there-is-are-B-9', 'There is a lake and there are three cafes.')).toBe(2);
    expect(tf('A1-GR-there-is-are-C-9', 'There is a cinema and two lifts.')).toBe(1);
  });
});

describe('round-8 fix: gap answers with following words, harmless preposition swaps in corrections', () => {
  it('pattern A: a gap answer that repeats the next words of the sentence (round-7 items)', () => {
    expect(key('A1-GR-article-a-an-A-1', 'an old')).toBe(true);
    expect(key('A1-GR-article-the-B-3', 'The restaurant')).toBe(true);
    expect(key('A1-GR-prepositions-time-A-1', 'at half past nine')).toBe(true);
  });
  it('pattern A guards: wrong gap word, unrelated extra word, or words out of order stay wrong', () => {
    expect(key('A1-GR-article-a-an-A-1', 'a old')).toBe(false);
    expect(key('A1-GR-article-a-an-A-1', 'an new')).toBe(false);
    expect(key('A1-GR-article-a-an-A-1', 'old an')).toBe(false);
    expect(key('A1-GR-prepositions-time-A-1', 'in half past nine')).toBe(false);
    expect(key('A1-GR-prepositions-time-A-1', 'at half past nine o clock today')).toBe(false); // more than 3 extra / not in sentence
  });
  it('pattern B: target fixed, one harmless preposition elsewhere changed (round-7 items)', () => {
    expect(key('A1-GR-word-order-svo-A-6', 'Adel bought a black bag in the market.')).toBe(true);
    expect(key('A2-GR-past-simple-irregular-C-5', 'Last month my cousin wrote a long letter for me.')).toBe(true);
    expect(key('A2-GR-some-any-A-6', 'I bought some eggs from the shop.')).toBe(true);
  });
  it('pattern B guards: target still wrong, preposition IS the target, or a rewrite stay wrong', () => {
    expect(key('A1-GR-word-order-svo-A-6', 'Adel bought a bag black in the market.')).toBe(false);
    expect(key('A2-GR-some-any-A-6', 'I bought any eggs from the shop.')).toBe(false);
    expect(key('A1-GR-prepositions-time-A-5', 'The exam is at Sunday morning.')).toBe(false);
    expect(key('A1-GR-prepositions-time-A-5', 'The exam is on Sunday morning.')).toBe(true);
    expect(key('A2-GR-some-any-A-6', 'Yesterday we got some eggs from a market.')).toBe(false);
  });
  it('spelling and capital-letter items are unchanged (earlier failure mode stays fixed)', () => {
    expect(key('A1-VO-days-months-A-5', 'My birthday is in February.')).toBe(true);
    expect(key('A1-VO-days-months-A-5', 'My birthday is in february.')).toBe(false);
    expect(key('A1-VO-days-months-A-5', 'My birthday is in Febuary.')).toBe(false);
    expect(key('A1-VO-days-months-B-5', 'The holiday starts on August.')).toBe(false); // case-sensitive item: no swap leniency
  });
});

describe('option B2: error-correction check (ENARA_EC_CHECK, off by default)', () => {
  const EC = 'A1-GR-word-order-svo-A-6'; // Fix the mistake: Adel bought a bag black at the market.
  const ans = (studentAnswer: string, isCorrect: boolean) => ({ questionId: 'q', studentAnswer, isCorrect, points: isCorrect ? 1 : 0 }) as never;
  const q = () => { const it: any = item(EC); return { ...it, type: 'short-answer', text: it.prompt, correctAnswer: it.answerKey, points: 1 } as never; };
  afterEach(() => { delete process.env.ENARA_EC_CHECK; });

  it('off (default): production behaviour is unchanged', () => {
    expect(needsAiEvaluation(q(), ans('Adel bought a black bag in the market.', true))).toBe(false);
  });
  it('on: exact key match never calls the model; any other answer does, even one the rules credited', async () => {
    process.env.ENARA_EC_CHECK = 'on';
    const { useErrorCorrectionCheck, exactKeyMatch } = await import('../src/services/graderV2');
    expect(exactKeyMatch(item(EC), 'adel bought a black bag at the market')).toBe(true);
    expect(needsAiEvaluation(q(), ans('Adel bought a black bag at the market.', true))).toBe(false);
    expect(needsAiEvaluation(q(), ans('Adel bought a black bag in the market.', true))).toBe(true);
    expect(needsAiEvaluation(q(), ans('Adel bought a bag black at the market.', false))).toBe(true);
    expect(useErrorCorrectionCheck(item('A1-VO-days-months-A-5'), 'My birthday is in february.')).toBe(false); // case-sensitive: key only
    expect(useErrorCorrectionCheck(item('A1-GR-article-a-an-A-1'), 'an old')).toBe(false); // not error correction
  });
  it('on: the check uses the error-correction prompt and its verdict replaces the rules score', async () => {
    process.env.ENARA_EC_CHECK = 'on';
    vi.mocked(askForJson).mockClear();
    vi.mocked(askForJson).mockResolvedValueOnce({ value: { correct: false, scoreExplanation: 'New mistake in the corrected part.', feedback: 'Check the verb.', flags: [] }, model: 'm' } as never);
    const e: any = await evaluateShortAnswer({ attempt: { id: 'a', institutionId: 'i' } as never, question: q(), answer: 'Adel bought a black bag in the market.', run: 1 });
    expect(vi.mocked(askForJson).mock.calls[0][0].system).toMatch(/error-correction item/);
    expect(e.points).toBe(0);
    expect(e.flags).toContain('error_correction_check');
  });
});
