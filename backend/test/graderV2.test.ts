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
import { graderV2On, matchKeyV2, scoreTargetForm, targetFormMissing, type TargetFormItem } from '../src/services/graderV2';
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
    expect(tf('A1-GR-can-ability-A-7', 'I can to swim.')).toBe(0);
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
