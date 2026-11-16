import { describe, expect, it } from 'vitest';
import { ASSESSMENT_INSTRUCTION, renderLanguageContextParts } from '../src/services/languageTeachingContext';
import { parseAssessmentMarker, stripAssessmentMarkers } from '../src/services/languageLearningState';
import { u, a, open, wrong, withEnv, build } from './esl5Helpers';

// ESL5 instruction fix 1 ([[assess]] marker). The production chat and voice controllers parse and strip the leading [[assess ...]] marker
// (stripAssessmentMarkers -> finalizeLanguageTurn), so the engine must ask for it exactly once and never forbid it. The ESL5 "Do NOT write an
// [[assess ...]] marker" line came from the research runner's wrapper (esl5Study.ts tutorPrompt), not from the engine; see docs/ESL5_INSTRUCTION_FIXES.md.
const ENVS = ['', 'levelExplicit', 'levelExplicit,esl5', 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5', 'levelExplicit,liveError', 'levelExplicit,releaseAfterTwo', 'levelExplicit,reviewOpen', 'levelExplicit,fadeKnown', 'levelExplicit,ownSentence', 'levelExplicit,esl5,belief'];
const P = [u('Give me an exercise'), a('Complete: I saw ___ apple.', open('a1'))];
const CASES: [string, Parameters<typeof build>[1]][] = [['Give me an exercise', []], ['a', P], ['the', [...P, u('a'), a('Look at the first sound. Try again.', wrong('a1'))]]];
const FORBID = /do not (write|add|include)[^.\n]*(\[\[assess|marker)|no hidden markers?/i;

describe('[[assess]] marker: exactly one consistent instruction', () => {
  it.each(ENVS)('env "%s": one marker instruction, nothing forbidding it (both renderings)', (env) => {
    for (const [msg, hist] of CASES) {
      const c = withEnv(env, () => build(msg, hist, { record: { live: ['article_omitted'], knownPoints: {} } }));
      expect(c.prompt.split('[[assess').length - 1).toBe(1);
      expect(c.prompt.split('Start your reply with one hidden line').length - 1).toBe(1);
      expect(c.prompt).not.toMatch(FORBID);
      const parts = withEnv(env, () => renderLanguageContextParts(c));
      expect(`${parts.stable}\n${parts.dynamic}`.split('[[assess').length - 1).toBe(1);
    }
  });
  it('the production path parses and strips the marker the instruction asks for', () => {
    expect(ASSESSMENT_INSTRUCTION).toMatch(/^Start your reply with one hidden line/);
    const s = stripAssessmentMarkers('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]\nNot yet. Look at the first sound.');
    expect(s.text).toBe('Not yet. Look at the first sound.');
    expect(s.assessment?.verdict).toBe('INCORRECT');
    expect(parseAssessmentMarker('[[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=a2]]')?.item).toBe('a2');
  });
});
