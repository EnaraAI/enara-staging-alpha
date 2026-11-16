// SIMULATION ONLY · DRAFT. graderV2 OFF = today's output on every path.
// The reference functions below are verbatim copies of the code before graderV2.
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
import { evaluateAgainstKey, type LessonItem } from '../src/services/languageLearningState';
import { scoreControlled, type PlacementItem } from '../src/services/assessment/placementEngine';
import type { IQuestion } from '../src/models/Assessment';

// --- reference (pre-graderV2) implementations ---
function refGradeAnswer(question: { correctAnswer?: string | number }, answer: string | number | undefined): boolean {
  if (answer === undefined || question.correctAnswer === undefined || question.correctAnswer === null) return false;
  return String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
}
const normAnswer = (t: string) => t.toLowerCase().replace(/\p{M}/gu, '').replace(/ـ/g, '').replace(/[’']/g, "'").replace(/o'?\s?clock/g, 'oclock').replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
const SPLIT = /\s*(?:—|–|-{2}|\bsorry\b,?|\bi mean\b,?|\bi meant\b,?|\boops\b,?|\bcorrection\b:?)\s*/i;
function expand(t: string) {
  return t.replace(/[’‘]/g, "'").replace(/\bcan't\b/gi, 'can not').replace(/\bcannot\b/gi, 'can not').replace(/\bwon't\b/gi, 'will not').replace(/\bshan't\b/gi, 'shall not')
    .replace(/n't\b/gi, ' not').replace(/\b(\w+)'re\b/gi, '$1 are').replace(/\b(\w+)'ve\b/gi, '$1 have').replace(/\b(\w+)'ll\b/gi, '$1 will').replace(/\bi'm\b/gi, 'i am');
}
function refEvaluate(answer: string, item: LessonItem | undefined, keyMatch: boolean) {
  if (!item?.acceptedAnswers?.length) return null;
  const nrm = keyMatch ? (x: string) => normAnswer(expand(x)) : normAnswer;
  const accepted = item.acceptedAnswers.map(nrm).filter(Boolean);
  if (accepted.includes(nrm(answer))) return 'CORRECT';
  const parts = answer.split(SPLIT).filter((p) => p && p.trim());
  if (parts.length > 1 && accepted.includes(nrm(parts[parts.length - 1]))) return 'CORRECT';
  return null;
}
const refNormalise = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '').trim();
const refScoreControlled = (item: PlacementItem, r: string) => [item.correctAnswer ?? '', ...(item.acceptedAnswers ?? [])].filter(Boolean).map(refNormalise).includes(refNormalise(r));

// --- representative inputs: the outcome bank, the placement bank, and fixtures from existing tests ---
const OUT = join(__dirname, '../../data/assessments/outcomes');
type BankItem = { id: string; type: string; prompt: string; answerKey: string; acceptedAnswers: string[]; matchingNote?: string; targetForm?: string; scoring?: string };
const bank: BankItem[] = readdirSync(OUT).filter((f) => f.endsWith('.json')).flatMap((f) => Object.values(JSON.parse(readFileSync(join(OUT, f), 'utf8')).forms ?? {}).flat() as BankItem[]);
const placement: PlacementItem[] = JSON.parse(readFileSync(join(__dirname, '../../data/assessments/placement/placement.json'), 'utf8')).items;
const variants = (s: string) => [s, s.toLowerCase(), s.toUpperCase(), `${s}.`, `  ${s}  `, s.replace(/[.!?]$/, ''), s.replace(/'/g, '’'), s.replace(/n't/g, ' not'), s.replace(/\bcannot\b/g, "can't"), `(b) ${s}`, 'b', 'a', 'B.', '', 'zzz', `${s} — sorry, ${s}`];
const answersFor = (it: { acceptedAnswers?: string[]; correctAnswer?: string; answerKey?: string }) =>
  [...new Set([it.correctAnswer, it.answerKey, ...(it.acceptedAnswers ?? [])].filter((x): x is string => typeof x === 'string').slice(0, 3).flatMap(variants))];
const FIXTURE_QS: IQuestion[] = [
  { id: 'q1', type: 'multiple-choice', text: '1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: '', points: 1 } as IQuestion,
  { id: 'q2', type: 'multiple-choice', text: 't', options: ['a', 'b'], correctAnswer: 'a', explanation: '', points: 1 } as IQuestion,
  { id: 'q3', type: 'true-false', text: 'The sun is a star.', correctAnswer: 'true', explanation: '' } as IQuestion,
  { id: 'q4', type: 'short-answer', text: 'Capital of France?', correctAnswer: 'Paris', explanation: '', points: 2 } as IQuestion,
  { id: 'q5', type: 'short-answer', text: 'n', correctAnswer: 4, explanation: '' } as IQuestion,
  { id: 'q6', type: 'open-response', text: 'Explain.', explanation: '', rubric: { criteria: [{ id: 'c', title: 'c', maxPoints: 2, levels: [{ id: 'l0', label: '0', points: 0 }, { id: 'l2', label: '2', points: 2 }] }] } } as IQuestion,
  // A bank free sentence carried on a question: OFF ignores targetForm/scoring/acceptedAnswers.
  { id: 'q7', type: 'short-answer', text: 'Correct it', correctAnswer: 'There is a small mosque in my village.', acceptedAnswers: ['In my village there is a small mosque.'], targetForm: 'there is', scoring: 'target_form_0_1_2', explanation: '' } as IQuestion,
];
const FIXTURE_ANSWERS = ['3/4', '3/4 ', 'a', 'A', 'b', 'True', 'true.', 'paris', 'Paris.', ' PARIS ', '4', '4.0', 'Because...', '', 'In my village there is a small mosque.', '(a)'];

let prev: string | undefined;
beforeEach(() => { prev = process.env.ENARA_ENGINE_V2; delete process.env.ENARA_ENGINE_V2; });
afterEach(() => { if (prev === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = prev; });

describe('graderV2 OFF: parity with the current grader', () => {
  it('gradeAnswer (assignments, assessments, diagnostics) on every bank item and fixture', () => {
    let n = 0;
    for (const it of bank) {
      const q = { ...it, text: it.prompt, correctAnswer: it.answerKey } as unknown as IQuestion;
      for (const a of answersFor(it)) { expect(gradeAnswer(q, a)).toBe(refGradeAnswer(q, a)); n++; }
    }
    for (const q of FIXTURE_QS) for (const a of [...FIXTURE_ANSWERS, undefined]) { expect(gradeAnswer(q, a)).toBe(refGradeAnswer(q, a)); n++; }
    expect(n).toBeGreaterThan(10000);
  });
  it('gradeAnswers (assignment submit) output is identical, incl. target-form items', () => {
    for (const a of FIXTURE_ANSWERS) {
      const out = gradeAnswers(FIXTURE_QS, Object.fromEntries(FIXTURE_QS.map((q) => [q.id, a])));
      FIXTURE_QS.forEach((q, i) => {
        const auto = q.type !== 'open-response';
        const ok = refGradeAnswer(q, a);
        if (auto) expect(out[i]).toMatchObject({ isCorrect: ok, points: ok ? (q.points ?? 1) : 0, method: 'rule', correctAnswer: q.correctAnswer });
        else expect(out[i]).toMatchObject({ isCorrect: false, points: a.trim() ? null : 0, needsReview: a.trim().length > 0 });
      });
      for (const g of out) if (g.questionId === 'q6' && a.trim()) expect(needsAiEvaluation(FIXTURE_QS[5], g)).toBe(true);
      const q7 = out.find((g) => g.questionId === 'q7')!;
      expect(needsAiEvaluation(FIXTURE_QS[6], q7)).toBe(Boolean(a.trim()) && !q7.isCorrect);
    }
  });
  it('evaluateAgainstKey (in-lesson exercises), with keyMatch off and on', () => {
    for (const keyMatch of [false, true]) {
      if (keyMatch) process.env.ENARA_ENGINE_V2 = 'keyMatch'; else delete process.env.ENARA_ENGINE_V2;
      for (const it of bank) {
        const li: LessonItem = { id: 'x', prompt: it.prompt, acceptedAnswers: it.acceptedAnswers, matchingNote: it.matchingNote };
        for (const a of answersFor(it)) expect(evaluateAgainstKey(a, li)).toBe(refEvaluate(a, li, keyMatch));
      }
    }
  });
  it('scoreControlled (placement) on the placement bank', () => {
    for (const it of placement.filter((i) => i.type !== 'open-response')) for (const a of answersFor(it)) expect(scoreControlled(it, a)).toBe(refScoreControlled(it, a));
  });
  it('short-answer meaning check: the model credit stands (no guard)', async () => {
    vi.mocked(askForJson).mockResolvedValueOnce({ value: { correct: true, scoreExplanation: 'Same meaning.', feedback: 'Good.', flags: [] }, model: 'm' } as never);
    const p = (await evaluateShortAnswer({ attempt: { id: 'a', institutionId: 'i', assignmentId: 's' } as never, question: FIXTURE_QS[6], answer: 'My village has a small mosque.', run: 1 })) as unknown as { points: number; flags: string[]; scoreExplanation: string };
    expect(p).toMatchObject({ points: 1, flags: [], scoreExplanation: 'Same meaning.' });
  });
});
