import { describe, expect, it } from 'vitest';
import { u, a, open, wrong, withEnv, build } from './esl5Helpers';
import type { HistoryTurn } from '../src/services/languageLearningState';

// ESL5 conflict scan: the full language prompt for every combination of levelExplicit and the five esl5 sub-switches (liveError, releaseAfterTwo,
// reviewOpen, fadeKnown, ownSentence; all five = the esl5 bundle), on top of the ESL5 LE base switches, across the situations the ESL5 agents met.
// Each pair below is two instructions that cannot both be followed in one reply. See docs/ESL5_INSTRUCTION_FIXES.md.
const BASE = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog';
const SUB = ['liveError', 'releaseAfterTwo', 'reviewOpen', 'fadeKnown', 'ownSentence'];
export const ENVS: string[] = [];
for (const le of [false, true]) for (let m = 0; m < 32; m += 1) ENVS.push([BASE, ...(le ? ['levelExplicit'] : []), ...SUB.filter((_, k) => m & (1 << k))].join(','));
const REC = { live: ['article_omitted'], knownPoints: {}, introduced: ['lsn:1', 'lsn:2'] };
const P = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))];
const W1 = [...P, u('a'), a('Look at the first sound. Try again.', wrong('a1'))];
const PRE4 = [u('hi'), a('Hello! Ready?'), u('yes'), a('Hi.'), u('ok'), a('Complete: I saw ___ apple.', open('a1'))];
const OWN = [u('hi'), a('Complete: He is ___ doctor.', open('a2')), u('a'), a('Correct! Now: I saw ___ apple.', { assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'a1' }, activeItem: { id: 'lesson:a1', source: 'lesson', lessonItemId: 'a1' } })];
export const SITUATIONS: Record<string, { msg: string; hist: HistoryTurn[]; record?: typeof REC }> = {
  firstTurn: { msg: 'Give me an exercise', hist: [] },
  wrongAnswer: { msg: 'a', hist: P },
  hintRequest: { msg: 'hint please', hist: P },
  release: { msg: 'the', hist: W1 },
  closingWrong: { msg: 'a', hist: [...PRE4, u('fine'), a('Complete: I saw ___ apple.', open('a1'))] },
  closingRight: { msg: 'an', hist: [...PRE4, u('fine'), a('Complete: I saw ___ apple.', open('a1'))] },
  closingRelease: { msg: 'the', hist: [u('hi'), a('Hello! Ready?'), u('yes'), a('Complete: I saw ___ apple.', open('a1')), u('a'), a('Look at the first sound. Try again.', wrong('a1')), u('ok'), a('Try: I saw ___ apple.', wrong('a1'))] },
  session2Opening: { msg: 'Hello again! Can we practise a, an and the again today?', hist: [], record: REC },
  ownSentence: { msg: 'an', hist: OWN },
};
// Contradictory instruction pairs (A, B): a prompt that matches both asks for two things that cannot both be done.
export const PAIRS: [string, RegExp, RegExp][] = [
  ['give the answer + never reveal it', /state the answer to this item/, /never write a completed answer to an open exercise|never show an answer before they try[^.]*this item|Do not give the answer yet/],
  ['marker: write + do not write', /Start your reply with one hidden line/, /do not (write|add)[^.\n]*\[\[assess|no hidden marker/i],
  ['rule before first try + no rule before first try', /First time this lesson's rule comes up|rule before their first try: state/, /No rule, no explanation and no example before it/],
  ['recall from memory + state the rule first', /answer from memory/, /First time this lesson's rule comes up/],
  ['closing new item + closing rule recap', /give ONE new item in a new situation/, /end by asking: "Tell me the rule in your own words\."|Now write one new example of your own/],
  ['two tasks: own sentence + closing item', /Write one sentence about a person you know/, /point to close the lesson unit/],
  ['two tasks: own sentence + release item', /Write one sentence about a person you know/, /ONE new item on the same point/],
  ['two tasks: recall item + lesson item', /give ONE short recall item/, /Lesson item to present now/],
  ['release + retry the same item', /Do not ask them to retry this item/, /ask them to try (the open task|this item|it) again themselves(?![^.]*If their latest message)/],
  ['no new exercise + new item', /Do not set a new exercise this turn/, /ONE new item on the same point|give ONE new item in a new situation/],
  ['give the answer + do not name the correct form', /state the answer to this item/, /don't name the correct form|Never write the answer to an open lesson exercise\./],
  ['two tasks: rule-line new item + own sentence', /ask them to apply the rule to a new item/, /Write one sentence about a person you know/],
  ['two tasks: rule-line new item + release item', /ask them to apply the rule to a new item/, /ONE new item on the same point/],
  ['two tasks: rule-line new item + closing item', /ask them to apply the rule to a new item/, /give ONE new item in a new situation|The ONE new item in the answer-release/],
  ['no new exercise + rule-line new item', /Do not set a new exercise this turn/, /ask them to apply the rule to a new item/],
  ['faded (no rule) + rule line', /Fade the support: no rule statement/, /First time this lesson's rule comes up/],
];
const prompts = (): { env: string; sit: string; prompt: string }[] => {
  const out: { env: string; sit: string; prompt: string }[] = [];
  for (const env of ENVS) for (const [sit, s] of Object.entries(SITUATIONS)) out.push({ env, sit, prompt: withEnv(env, () => build(s.msg, s.hist, { level: 'A1', masteryStatus: 'emerging', ...(s.record ? { record: s.record } : {}) })).prompt });
  return out;
};

describe('ESL5 instruction matrix (64 switch combinations x 9 situations)', () => {
  it('no contradictory instruction pair in any prompt', () => {
    const hits: string[] = [];
    for (const { env, sit, prompt } of prompts()) for (const [name, x, y] of PAIRS) if (x.test(prompt) && y.test(prompt)) hits.push(`${name} | ${sit} | ${env}`);
    if (process.env.MATRIX_REPORT) console.log([...new Set(hits.map((h) => h.split(' | ').slice(0, 2).join(' | ')))].join('\n'), `\n${hits.length} hits`);
    // Known, NOT fixed: levelExplicit's rule line ("(3) ask them to apply the rule to a new item") next to the recap closing ("Do not set a new
    // exercise this turn") exists in plain levelExplicit today (no esl5 switch). Changing it would change levelExplicit output that the off-parity
    // hash protects; reviewOpen (the ESL5 closing) does not have it. Reported in docs/ESL5_INSTRUCTION_FIXES.md.
    const known = (h: string) => h.startsWith('no new exercise + rule-line new item | closing') && !h.includes('reviewOpen');
    expect(hits.filter((h) => !known(h))).toEqual([]);
    expect(hits.some((h) => known(h) && h.endsWith(`| ${BASE},levelExplicit`))).toBe(true);
  });
});
