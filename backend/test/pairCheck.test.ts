import { describe, expect, it } from 'vitest';
import { PAIR_RULE, findPairs, pairProblem, removeFalseWrongs } from '../src/services/pairCheck';
import { RULE_BANK } from '../src/services/ruleBank';
import { withEnv, build } from './esl5Helpers';

// planner2e fix 1 (owner: high priority): every "wrong" example must really be wrong English. Cases below come from PLN2f tutor replies and the
// rule bank, labelled by an independent Opus check (reports/exp4/pair_check).
describe('pair check: a "wrong" example must be wrong English', () => {
  it('every rule-bank pair and confusion pair passes (rb-v2)', () => {
    const bad = RULE_BANK.flatMap((e) => [[e.right, e.wrong], ...(e.confusion ? [[e.confusion.right, e.confusion.wrong]] : [])].map(([r, w]) => ({ id: e.id, r, w, why: pairProblem(r, w) }))).filter((x) => x.why);
    expect(bad).toEqual([]);
  });
  it('flags acceptable English labelled wrong', () => {
    const cases: [string, string, string][] = [
      ['A teacher works at a school.', 'A teacher works at a hospital.', 'meaning_swap'],
      ['I like milk.', 'I drink milk.', 'meaning_swap'],
      ['I see a van.', 'I see a fan.', 'meaning_swap'],
      ['The hotel is small but it is clean.', 'The hotel is small and it is clean.', 'joining_word_swap'],
      ['Lina feeds her rabbit.', 'Lina feeds his rabbit.', 'pronoun_swap'],
      ['Did they open the shop?', 'They opened the shop?', 'statement_question'],
      ['Do you have these shoes in black?', 'You have these shoes in black.', 'statement_question'], // PLN2g Opus check
      ['Can I have some juice, please?', 'Give me some juice.', 'politeness_only'],
      ['Do you have this shirt in green?', 'I want this shirt in green.', 'politeness_only'],
      ['Can I have some rice, please?', 'Can I have any rice, please?', 'some_any_question'],
      ['My sister likes rice but she does not like soup.', 'My sister likes rice but she likes soup.', 'negation_swap'],
      ['Ali is late because he missed the train.', 'Ali is late.', 'shorter_not_wrong'],
      ['I wear a coat.', 'I wear a coat.', 'same'],
    ];
    for (const [r, w, why] of cases) expect([r, w, pairProblem(r, w)]).toEqual([r, w, why]);
  });
  it('passes real form errors', () => {
    const ok: [string, string][] = [
      ['He works late on Fridays.', 'He work late on Fridays.'], ['She always eats fruit.', 'She eats always fruit.'], ['Did she call the client?', 'Did she called the client?'],
      ['How much milk do we need?', 'How many milk do we need?'], ['Today is hotter than yesterday.', 'Today is hoter than yesterday.'], ['We saw a film.', 'We seed a film.'],
      ['I swam in the lake.', 'I swimmed in the lake.'], ['Birds fly.', 'birds fly.'], ['Mia and I play.', 'Mia and i play.'], ['This is my father.', 'This is father.'],
      ['The robot has a blue pen.', 'The robot has a blue ben.'], ['It is stormy.', 'It is storm.'], ['an apple', 'a apple'], ['My bag is heavy.', 'My bag heavy.'],
      ['I have a big dog.', 'I have a dog big.'], ['Our neighbours are watching TV.', 'Our neighbours watching TV.'],
    ];
    for (const [r, w] of ok) expect([r, w, pairProblem(r, w)]).toEqual([r, w, null]);
  });
  it('the guard removes a false "wrong" sentence and keeps a real one', () => {
    const reply = 'Your sentence is clear. Right: I like milk. Wrong: I drink milk.  Now you: write one sentence. Also: Right: "He works." Wrong: "He work." Try it.';
    expect(findPairs(reply)).toHaveLength(2);
    const out = removeFalseWrongs(reply);
    expect(out.removed).toEqual(['meaning_swap']);
    expect(out.text).toContain('Example: I like milk.');
    expect(out.text).not.toContain('I drink milk');
    expect(out.text).toContain('Wrong: "He work."');
    const note = removeFalseWrongs('Right: "The hotel is small but it is clean." Wrong: "The hotel is small and it is clean." (and adds a similar idea) Now try.');
    expect(note.text).not.toMatch(/and it is clean|similar idea/);
  });
  it('the prompt carries the pair rule only when a pair-asking switch is on', () => {
    expect(withEnv('levelExplicit,esl5', () => build('an', [] as never)).prompt).toContain(PAIR_RULE);
    expect(withEnv('', () => build('an', [] as never)).prompt).not.toContain(PAIR_RULE);
  });
});
