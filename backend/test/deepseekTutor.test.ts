import { describe, expect, it } from 'vitest';
import { ageBand, answerCheck, examplesFor, gradedReply, markerOf, parseNumber, readGrade, replyProblems, spellingNote, turnKind, type ChatCall } from '../src/services/deepseekTutor';
import { parseAssessmentMarker } from '../src/services/languageLearningState';

// DeepSeek match (owner go 21 Nov 2026): grade first, code answer checks, examples, reply checks; every subject, English and Arabic.
describe('DeepSeek match: answer checks in code', () => {
  it('numbers by value: fractions, decimals, percent, mixed numbers, Arabic digits, units', () => {
    expect(parseNumber('1/2')?.value).toBe(0.5);
    expect(parseNumber('50%')?.value).toBe(0.5);
    expect(parseNumber('2 1/2')?.value).toBe(2.5);
    expect(parseNumber('٣٫٥')?.value).toBe(3.5);
    expect(parseNumber('12 cm')).toEqual({ value: 12, unit: 'cm' });
    expect(parseNumber('the answer is 1,000')?.value).toBe(1000);
    expect(parseNumber('photosynthesis')).toBeNull();
    expect(answerCheck('0.5', '1/2').verdict).toBe('CORRECT');
    expect(answerCheck('٥', '5').verdict).toBe('CORRECT');
    expect(answerCheck('7', '8').verdict).toBe('INCORRECT');
    expect(answerCheck('12', '12 cm')).toMatchObject({ verdict: 'PARTIALLY_CORRECT', note: expect.stringMatching(/unit/) });
    expect(answerCheck('12 m', '12 cm').verdict).toBe('PARTIALLY_CORRECT');
  });

  it('spelling: the exact letter, in English and Arabic', () => {
    expect(spellingNote('poard', 'board')).toBe('the first letter: "p" should be "b"');
    expect(spellingNote('fife', 'five')).toBe('the third letter: "f" should be "v"');
    expect(spellingNote('grandmther', 'grandmother')).toMatch(/missing: "o" after "grandm"/);
    expect(spellingNote('brid', 'bird')).toMatch(/swapped/);
    expect(spellingNote('مدرسة', 'مدرسه')).toMatch(/hamza, taa marbuta/);
    expect(spellingNote('cat', 'elephant')).toBeNull();
    expect(answerCheck('poard', 'board')).toEqual({ note: 'spelling: the first letter: "p" should be "b"' });
  });
});

describe('DeepSeek match: grading line and turn kinds', () => {
  it('reads a lenient JSON grade and builds a hidden line the engine parses', () => {
    const g = readGrade('```json\n{"verdict":"partially_correct","relevance":"ACTIVE_ITEM","next":"SAME_ITEM","criteria":[1,"2"],"item":"v2","expected":"board","answer":"poard","mistake":"first letter"}\n```')!;
    expect(g).toMatchObject({ verdict: 'PARTIALLY_CORRECT', next: 'SAME_ITEM', criteria: [1, 2], item: 'v2', expected: 'board' });
    const parsed = parseAssessmentMarker(markerOf(g))!;
    expect(parsed).toMatchObject({ verdict: 'PARTIALLY_CORRECT', relevance: 'ACTIVE_ITEM', next: 'SAME_ITEM', item: 'v2', criteria: [1, 2] });
    expect(readGrade('not json')).toBeNull();
    expect(readGrade('{"verdict":"GREAT","next":"later"}')).toMatchObject({ verdict: 'NOT_EVALUATED', next: 'NONE', relevance: 'NO_ACTIVE_ITEM' });
  });

  it('kinds and ages from the real prompt lines', () => {
    expect(turnKind('HIDDEN GRADING LINE (every reply, any subject): [[assess')).toBe('practice');
    expect(turnKind('<source n="1" file="x">t</source> [[assess')).toBe('sources');
    expect(turnKind('NOT IN THE COURSE MATERIALS: ...')).toBe('outOfScope');
    expect(turnKind('<language_teaching_context> [[assess')).toBe('language');
    expect(ageBand('This child is under 9: at most 3 sentences')).toBe('under9');
    expect(ageBand('Adult learner, B1')).toBe('older');
    expect(examplesFor('practice', 'older')).toMatch(/STYLE EXAMPLES/);
  });
});

describe('DeepSeek match: reply checks', () => {
  const grade = { verdict: 'PARTIALLY_CORRECT', relevance: 'ACTIVE_ITEM', next: 'SAME_ITEM', criteria: [], expected: 'board' };
  it('flags an answer given away, a missing task, a too-long child reply and the wrong language', () => {
    expect(replyProblems({ reply: 'Close! The word is board. Write it again.', grade, kind: 'language', band: 'under9', learnerText: 'poard' })[0]).toMatch(/gave the correct answer away/);
    expect(replyProblems({ reply: 'Close! Check the first letter. Write it again.', grade, kind: 'language', band: 'under9', learnerText: 'poard' })).toEqual([]);
    expect(replyProblems({ reply: 'Good thinking about plants.', grade: { ...grade, expected: 'oxygen' }, kind: 'practice', band: 'older', learnerText: 'carbon' })[0]).toMatch(/ONE clear task/);
    expect(replyProblems({ reply: 'The leaves make food. Try again: what gas comes out?', grade: { ...grade, expected: 'oxygen' }, kind: 'practice', band: 'older', learnerText: 'ما الغاز الذي يخرج من الورقة؟' })).toContain('The student wrote in Arabic: reply in Arabic.');
    const long = Array(60).fill('word').join(' ') + '?';
    expect(replyProblems({ reply: long, grade: null, kind: 'practice', band: 'under9', learnerText: 'hi' })[0]).toMatch(/under 9/);
    expect(replyProblems({ reply: 'Plants make food in the leaves.', grade: null, kind: 'sources', band: 'older', learnerText: 'where do plants make food?' })[0]).toMatch(/cite/);
  });
});

describe('DeepSeek match: the graded turn', () => {
  const parts = { gradeFirst: true, answerCheck: true, examples: true, replyChecks: true, tuning: true };
  it('grades first, lets code correct the value, writes the reply from the decision and adds the hidden line itself', async () => {
    const seen: { json?: boolean; system: string }[] = [];
    const call: ChatCall = async (q) => {
      seen.push({ json: q.json, system: q.messages[0].content });
      if (q.json) return { text: '{"verdict":"INCORRECT","relevance":"ACTIVE_ITEM","next":"SAME_ITEM","expected":"1/2","answer":"0.5","mistake":"wrong"}', finish: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } };
      return { text: '[[assess verdict=INCORRECT]]\nYes, 0.5 is the same as 1/2. Next: what is 1/4 as a decimal?', finish: 'end_turn', usage: { input_tokens: 120, output_tokens: 30 } };
    };
    const r = await gradedReply({ system: 'HIDDEN GRADING LINE (every reply, any subject): [[assess ...]]', messages: [{ role: 'user', content: '0.5' }], maxTokens: 500, parts, call });
    expect(r.meta.grade).toMatchObject({ verdict: 'CORRECT', next: 'NEW_ITEM' });
    expect(r.text.startsWith('[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]\nYes, 0.5')).toBe(true);
    expect(r.text.match(/\[\[assess/g)).toHaveLength(1);
    expect(seen[1].system).toMatch(/THE GRADING IS ALREADY DONE/);
    expect(seen[1].system).toMatch(/STYLE EXAMPLES/);
    expect(r.usage).toEqual({ input_tokens: 220, output_tokens: 50 });
  });

  it('one regeneration when the reply gives the answer away; the better draft is kept', async () => {
    let n = 0;
    const call: ChatCall = async (q) => {
      if (q.json) return { text: '{"verdict":"PARTIALLY_CORRECT","relevance":"ACTIVE_ITEM","next":"SAME_ITEM","expected":"board","answer":"poard"}', finish: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
      n += 1;
      expect(q.messages[0].content).toMatch(/the first letter: "p" should be "b"/);
      return { text: n === 1 ? 'Close! It is board. Write it again.' : 'Close! Check the first letter. Write it again.', finish: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    };
    const r = await gradedReply({ system: '<language_teaching_context> This child is under 9. [[assess', messages: [{ role: 'user', content: 'poard' }], maxTokens: 300, parts, call });
    expect(n).toBe(2);
    expect(r.text).toContain('Check the first letter');
    expect(r.meta.regenerated[0]).toMatch(/answer away/);
  });

  it('with grade-first off, the model still writes its own hidden line (nothing stripped)', async () => {
    const call: ChatCall = async () => ({ text: '[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]\nYes! Next: 2 + 2?', finish: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await gradedReply({ system: 'HIDDEN GRADING LINE (every reply, any subject): [[assess', messages: [{ role: 'user', content: '4' }], maxTokens: 300, parts: { ...parts, gradeFirst: false }, call });
    expect(r.text.startsWith('[[assess verdict=CORRECT')).toBe(true);
  });
});

describe('DeepSeek match: fixes after the 100-turn test', () => {
  it('out of scope must say so first; a question quoted back is not an answer given away; Arabic task words with marks count', () => {
    expect(replyProblems({ reply: 'Volume = πr²h. What is r?', grade: null, kind: 'outOfScope', band: 'older', learnerText: 'how do i find the volume of a cylinder' })[0]).toMatch(/not in their course materials/);
    expect(replyProblems({ reply: "This isn't in your course materials. General knowledge: V = πr²h. What is r?", grade: null, kind: 'outOfScope', band: 'older', learnerText: 'how do i find the volume of a cylinder' })).toEqual([]);
    const g = { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', next: 'SAME_ITEM', criteria: [], expected: '0.6' };
    expect(replyProblems({ reply: 'Not quite. Compare tenths: which is bigger, 0.6 or 0.59?', grade: g, kind: 'practice', band: 'older', learnerText: '0.59', taskText: 'Which is bigger, 0.6 or 0.59?' })).toEqual([]);
    expect(replyProblems({ reply: 'أحسنت! جرّب الآن معادلة فيها خطوتان: ٢س + ٣ = ١٧', grade: { ...g, verdict: 'CORRECT', next: 'NEW_ITEM', expected: 'س = 7' }, kind: 'practice', band: 'older', learnerText: 'س = ٧' })).toEqual([]);
  });

  it('a one-word answer with a spelling slip is partly right, never right', async () => {
    const call: ChatCall = async (q) => q.json
      ? { text: '{"verdict":"CORRECT_WITH_EQUIVALENT_FORMULATION","relevance":"ACTIVE_ITEM","next":"NEW_ITEM","expected":"المدرسة","answer":"المدرسه"}', finish: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
      : { text: 'قريب! انتبه لآخر حرف. اكتب الكلمة مرة أخرى.', finish: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    const r = await gradedReply({ system: 'HIDDEN GRADING LINE (every reply, any subject): [[assess', messages: [{ role: 'assistant', content: 'أكمل: ذهبتُ إلى ___' }, { role: 'user', content: 'المدرسه' }], maxTokens: 300, parts: { gradeFirst: true, answerCheck: true, examples: false, replyChecks: true, tuning: false }, call });
    expect(r.meta.grade).toMatchObject({ verdict: 'PARTIALLY_CORRECT', next: 'SAME_ITEM' });
  });
});

