import { describe, expect, it } from 'vitest';
import { OWN_QUESTION_LINE, NO_PRAISE_ON_ERROR_LINE, CHILD_EXPLAIN_LINE, ruleForms, formsClause, ruleBeforeFirstTryLine, renderLanguageContextPrompt } from '../src/services/languageTeachingContext';
import { removeMixedPraise } from '../src/services/languageTurnPipeline';
import { PLANNER_VERSION } from '../src/services/lessonPlanner';
import { withEnv, build } from './esl5Helpers';

// planner2g (owner "go", after PLN2h): tutor-writing fixes found by the judges, all behind the planner2 switch.
describe('planner2g: prompt rules', () => {
  const render = (env: string, child: boolean) => withEnv(env, () => {
    const c = build('an', [] as never);
    const learner = child ? { ...c.learner, ageBand: { status: 'known', value: 'child', source: 'student_birth_date' } } : c.learner;
    return renderLanguageContextPrompt({ ...c, learner } as never);
  });
  it('planner2 on: answer the learner\'s own question first, no praise on an error; a child also gets the two-sentence explanation rule', () => {
    const adult = render('levelExplicit,esl5,planner2', false);
    expect(adult).toContain(OWN_QUESTION_LINE);
    expect(adult).toContain(NO_PRAISE_ON_ERROR_LINE);
    expect(adult).not.toContain(CHILD_EXPLAIN_LINE);
    expect(render('levelExplicit,esl5,planner2', true)).toContain(CHILD_EXPLAIN_LINE);
  });
  it('planner2 off: none of the lines (unchanged prompt)', () => {
    const off = render('levelExplicit,esl5', true);
    for (const line of [OWN_QUESTION_LINE, NO_PRAISE_ON_ERROR_LINE, CHILD_EXPLAIN_LINE]) expect(off).not.toContain(line);
  });
  it('a rule that lists several endings asks for all of them in the rule sentence', () => {
    expect(ruleForms(['Adds -s or -es to the verb after he, she and it in the present simple'])).toEqual(['-s', '-es']);
    expect(ruleForms(['Forms the comparative correctly'])).toEqual([]);
    expect(ruleForms(['Uses a before a consonant sound'])).toEqual([]);
    const on = withEnv('planner2', () => ruleBeforeFirstTryLine({ texts: ['Adds -s or -es to the verb after he, she and it'] }));
    expect(on).toContain('names every ending it lists (-s, -es)');
    expect(withEnv('', () => formsClause(['Adds -s or -es']))).toBe('');
  });
  it('the planner version is v8', () => { expect(PLANNER_VERSION).toBe('planner2-v8'); });
});

describe('planner2g: no praise next to an error', () => {
  it('removes a bare "Good." from a reply that then points to an error', () => {
    const r = removeMixedPraise('Your sentence compares two things, and "than" is in the right place: "My new office is biger than my old office." Good.  Now check the comparative word again.');
    expect(r.removed).toBe(1);
    expect(r.text).not.toMatch(/\bGood\./);
    expect(r.text).toContain('Now check the comparative word again.');
  });
  it('keeps praise when the reply has no error cue, and keeps effort praise', () => {
    const ok = 'Correct. "sleeps" has -s after "the cat". Next one: My sister ___ (play) tennis.';
    expect(removeMixedPraise(ok)).toEqual({ text: ok, removed: 0 });
    const effort = 'Good try! The spelling needs one more letter. Look at the word again.';
    expect(removeMixedPraise(effort).text).toContain('Good try!');
  });
});
