import { describe, expect, it } from 'vitest';
import { SPOKEN_INPUT_RULE, guardSpokenMarker, misheardNote, spokenLines, spokenVerdictGuard } from '../src/services/spokenInput';

// Owner (22 Nov 2026): when the learner SAID it, never mark an error that may come from speech-to-text; ask them to say it again.
// The two real cases from the avatar test: "My pencil is green." heard as "Eye pencil is green.", "My friends come to my party." as "I friends ...".
describe('spoken input', () => {
  it('spots the two misheard cases from the avatar test', () => {
    expect(misheardNote('Eye pencil is green.')).toMatch(/"Eye pencil" was probably "My pencil"/);
    expect(misheardNote('I friends come to my party.')).toMatch(/"I friends" was probably "My friends"/);
  });
  it('leaves normal sentences that start with "I" alone', () => {
    for (const t of ['I like apples.', 'I have a cat.', 'I am nine.', "I'm ten years old.", 'I really like it.', 'I go to bed at nine.', 'I can swim.', 'He go to school.', 'My pencil is green.', 'Eye is blue.'])
      expect(misheardNote(t), t).toBeNull();
  });
  it('a wrong grade on a misheard answer becomes "say it again"; a clear error still counts', () => {
    expect(spokenVerdictGuard({ spoken: true, text: 'Eye pencil is green.', verdict: 'INCORRECT' })).toEqual({ verdict: 'AMBIGUOUS', next: 'SAME_ITEM' });
    expect(spokenVerdictGuard({ spoken: true, text: 'I friends come to my party.', verdict: 'PARTIALLY_CORRECT' })).toEqual({ verdict: 'AMBIGUOUS', next: 'SAME_ITEM' });
    expect(spokenVerdictGuard({ spoken: true, text: 'He go to school.', verdict: 'INCORRECT' })).toBeNull();
    expect(spokenVerdictGuard({ spoken: false, text: 'Eye pencil is green.', verdict: 'INCORRECT' })).toBeNull(); // typed: graded as written
    expect(spokenVerdictGuard({ spoken: true, text: 'Eye pencil is green.', verdict: 'CORRECT' })).toBeNull();
  });
  it('guards the hidden grading line, so nothing wrong is recorded', () => {
    const m = { text: 'Say it again?', assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', next: 'NEW_ITEM', criteria: [] } };
    expect(guardSpokenMarker(m, 'Eye pencil is green.')!.assessment).toMatchObject({ verdict: 'AMBIGUOUS', next: 'SAME_ITEM' });
    expect(guardSpokenMarker(m, 'He go to school.')!.assessment!.verdict).toBe('INCORRECT');
  });
  it('the prompt: the rule always on a spoken turn, plus the note when code sees a mishearing', () => {
    expect(spokenLines('I like apples.')).toContain(SPOKEN_INPUT_RULE);
    expect(spokenLines('I like apples.')).not.toMatch(/PROBABLY MISHEARD/);
    expect(spokenLines('Eye pencil is green.')).toMatch(/PROBABLY MISHEARD: "Eye pencil" was probably "My pencil" misheard\. Do not correct it/);
    expect(SPOKEN_INPUT_RULE).toMatch(/"I" or "Eye" for "My"/);
  });
});
