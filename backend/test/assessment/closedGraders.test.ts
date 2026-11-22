import { describe, expect, it } from 'vitest';
import { gradeClosed, InvalidItemError } from '../../src/assessment/grading-engine/graders/closed';
import { codeResult } from '../../src/assessment/grading-engine/graders/closed/result';
import { convert, normalizeNumberText, numberOf, sameExpression, splitUnit } from '../../src/assessment/grading-engine/graders/closed/numeric';
import { toBoolean } from '../../src/assessment/grading-engine/graders/closed/trueFalse';
import { kendallShare } from '../../src/assessment/grading-engine/graders/closed/ordering';
import { pairsOf } from '../../src/assessment/grading-engine/graders/closed/matching';

// Assessment engine P1a: every closed type graded by code, in Arabic and English (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3).

const base = (over: Record<string, unknown>) => ({ id: 'it-1', version: 1, subject: 'math', language: 'en', curriculum: 'eg-national', level: 'G5', objective_code: 'M5.1', difficulty: 2, stem: 'Q', ...over });

describe('mcq', () => {
  const item = base({ type: 'mcq', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5', error_code: 'counting_slip' }, { id: 'c', text: '6' }], answer_key: { correct: ['a'], multi: false } });
  it('single answer: right, wrong (with the misconception code), empty, array form', () => {
    expect(gradeClosed(item, 'a')).toMatchObject({ total: 1, max: 1, criteria: [{ reason_code: 'correct' }], grader: 'code', confidence: 1, flagged: false });
    expect(gradeClosed(item, 'b')).toMatchObject({ total: 0, error_codes: ['counting_slip'], criteria: [{ reason_code: 'wrong' }] });
    expect(gradeClosed(item, '')).toMatchObject({ total: 0, criteria: [{ reason_code: 'empty' }] });
    expect(gradeClosed(item, ['a']).total).toBe(1);
  });
  it('multi answer: set equality, all or nothing, points scaled', () => {
    const multi = base({ type: 'mcq', points: 2, options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }, { id: 'c', text: 'z' }], answer_key: { correct: ['a', 'c'], multi: true } });
    expect(gradeClosed(multi, ['c', 'a']).total).toBe(2);
    expect(gradeClosed(multi, ['a']).total).toBe(0);
    expect(gradeClosed(multi, ['a', 'b', 'c']).total).toBe(0);
  });
});

describe('true_false', () => {
  const item = base({ type: 'true_false', answer_key: { value: false }, error_codes: ['conceptual'] });
  it('accepts booleans and words in both languages', () => {
    for (const a of [false, 'false', 'F', 'No', 'خطأ', 'خاطئ', 'لا', '0']) expect(gradeClosed(item, a).total).toBe(1);
    for (const a of [true, 'true', 'صح', 'صحيح', 'نعم', 'yes']) expect(gradeClosed(item, a)).toMatchObject({ total: 0, error_codes: ['conceptual'] });
    expect(gradeClosed(item, 'maybe').criteria[0].reason_code).toBe('wrong');
    expect(gradeClosed(item, null).criteria[0].reason_code).toBe('empty');
    expect(toBoolean('صَحٌّ')).toBe(true);
  });
});

describe('fill_blank', () => {
  const en = base({ subject: 'language', type: 'fill_blank', stem: 'She {{blank_1}} to school every day and {{blank_2}} lunch at 1.', answer_key: { blanks: { blank_1: ['goes', 'walks'], blank_2: ['has', 'eats'] } }, error_codes: ['verb_conjugation'] });
  it('English: per-blank credit, case/space/punctuation folded, object or array answers', () => {
    expect(gradeClosed(en, { blank_1: ' Goes ', blank_2: 'has.' }).total).toBe(1);
    expect(gradeClosed(en, ['walks', 'eat'])).toMatchObject({ total: 0.5, error_codes: ['verb_conjugation'] });
    expect(gradeClosed(en, { blank_1: 'goes' }).criteria[1].reason_code).toBe('empty');
    expect(gradeClosed(en, 'goes').total).toBe(0.5);
  });
  it('lenient spelling: one letter off counts (4+ letters only)', () => {
    const lenient = { ...en, flags: { lenient_spelling: true } };
    expect(gradeClosed(lenient, { blank_1: 'goess', blank_2: 'hass' }).criteria.map((c) => c.reason_code)).toEqual(['spelling_close', 'wrong']);
    expect(gradeClosed(en, { blank_1: 'goess', blank_2: 'has' }).total).toBe(0.5);
  });
  const ar = base({ subject: 'language', language: 'ar', type: 'fill_blank', stem: 'ذهب الطالبُ إلى {{blank_1}} صباحًا.', answer_key: { blanks: { blank_1: ['المدرسة'] } } });
  it('Arabic: tashkeel and alef forms folded; ة only with the item flag', () => {
    expect(gradeClosed(ar, 'المَدْرَسَة').total).toBe(1);
    expect(gradeClosed(ar, 'المدرسه').total).toBe(0);
    expect(gradeClosed({ ...ar, flags: { ta_marbuta_fold: true } }, 'المدرسه').total).toBe(1);
    const alef = { ...ar, answer_key: { blanks: { blank_1: ['أحمد'] } } };
    expect(gradeClosed(alef, 'احمد').total).toBe(1);
    expect(gradeClosed(alef, 'إحمد').total).toBe(1);
  });
});

describe('matching', () => {
  const item = base({ type: 'matching', options: { left: [{ id: 'l1', text: 'Egypt' }, { id: 'l2', text: 'France' }, { id: 'l3', text: 'Japan' }, { id: 'l4', text: 'Peru' }], right: [{ id: 'r1', text: 'Cairo' }, { id: 'r2', text: 'Paris' }, { id: 'r3', text: 'Tokyo' }, { id: 'r4', text: 'Lima' }] }, answer_key: { pairs: [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3'], ['l4', 'r4']] } });
  it('partial credit = right pairs / pairs, from a list or a map', () => {
    expect(gradeClosed(item, [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3'], ['l4', 'r4']]).total).toBe(1);
    expect(gradeClosed(item, { l1: 'r1', l2: 'r3', l3: 'r2', l4: 'r4' }).total).toBe(0.5);
    expect(gradeClosed(item, [['l1', 'r1']]).criteria.map((c) => c.reason_code)).toEqual(['correct', 'empty', 'empty', 'empty']);
    expect(gradeClosed(item, null).total).toBe(0);
  });
  it('a left option given twice counts once (its first pairing)', () => {
    expect(pairsOf([['l1', 'r2'], ['l1', 'r1'], 'junk', [1, 2]]).get('l1')).toBe('r2');
  });
});

describe('numeric', () => {
  const item = (key: Record<string, unknown>, lang = 'en') => base({ type: 'numeric', language: lang, answer_key: key, error_codes: ['arithmetic'] });
  it('numbers in both scripts, decimal marks, thousands', () => {
    expect(gradeClosed(item({ value: 12.5 }), '12.5').total).toBe(1);
    expect(gradeClosed(item({ value: 12.5 }, 'ar'), '١٢٫٥').total).toBe(1);
    expect(gradeClosed(item({ value: 12.5 }, 'ar'), '12,5').total).toBe(1);
    expect(gradeClosed(item({ value: 1250 }), '1,250').total).toBe(1);
    expect(gradeClosed(item({ value: 0.75 }), '3/4').total).toBe(1);
    expect(gradeClosed(item({ value: 2 }), '1+1').total).toBe(1);
    expect(gradeClosed(item({ value: 12 }), '13')).toMatchObject({ total: 0, error_codes: ['arithmetic'] });
    expect(gradeClosed(item({ value: 12 }), 'twelve').criteria[0].reason_code).toBe('not_a_number');
    expect(gradeClosed(item({ value: 12 }), '').criteria[0].reason_code).toBe('empty');
  });
  it('tolerance: absolute, relative, and float noise', () => {
    expect(gradeClosed(item({ value: 3.14, tolerance_abs: 0.01 }), '3.149').total).toBe(1);
    expect(gradeClosed(item({ value: 3.14, tolerance_abs: 0.001 }), '3.149').total).toBe(0);
    expect(gradeClosed(item({ value: 200, tolerance_rel: 0.05 }), '209').total).toBe(1);
    expect(gradeClosed(item({ value: 0.3 }), '0.1+0.2').total).toBe(1);
  });
  it('units: converted, missing or wrong unit gives half marks', () => {
    const cm = item({ value: 120, unit: 'cm' });
    expect(gradeClosed(cm, '120 cm').total).toBe(1);
    expect(gradeClosed(cm, '1.2 m').total).toBe(1);
    expect(gradeClosed(cm, '120cm').total).toBe(1);
    expect(gradeClosed(item({ value: 120, unit: 'سم' }, 'ar'), '١٢٠ سم').total).toBe(1);
    expect(gradeClosed(item({ value: 120, unit: 'سم' }, 'ar'), '1.2 م').total).toBe(1);
    expect(gradeClosed(cm, '120')).toMatchObject({ total: 0.5, criteria: [{ reason_code: 'unit_missing' }], error_codes: ['units'] });
    expect(gradeClosed(cm, '120 kg')).toMatchObject({ total: 0.5, criteria: [{ reason_code: 'unit_wrong' }] });
    expect(gradeClosed(cm, '100 cm').total).toBe(0);
    expect(gradeClosed(cm, { value: '120', unit: 'cm' }).total).toBe(1);
    expect(gradeClosed(item({ value: 50, unit: 'جنيه' }, 'ar'), '50 جنيه').total).toBe(1);
    expect(gradeClosed(item({ value: 50, unit: 'جنيه' }, 'ar'), '50 ريال').criteria[0].reason_code).toBe('unit_wrong');
  });
  it('expressions: equal by algebra, not by spelling', () => {
    const ex = item({ value: '2*(x+1)', accept_equivalent_expression: true });
    expect(gradeClosed(ex, '2x+2').criteria[0].reason_code).toBe('equivalent_expression');
    expect(gradeClosed(ex, '2*(x+1)').criteria[0].reason_code).toBe('correct');
    expect(gradeClosed(ex, '2x+1').total).toBe(0);
    expect(gradeClosed(item({ value: 'x^2-1', accept_equivalent_expression: true }), '(x-1)(x+1)').total).toBe(1);
  });
  it('helpers are safe and plain', () => {
    expect(sameExpression('x', 'y=1')).toBe(false);
    expect(sameExpression('f(x)=x', 'x')).toBe(false);
    expect(sameExpression('a+b+c+d+e', 'e+d+c+b+a')).toBe(true); // proven by algebra
    expect(sameExpression('a*b+c*d+e', 'a+b+c+d+e')).toBe(false); // not provable and too many variables to sample: refused, not guessed
    expect(sameExpression('', 'x')).toBe(false);
    expect(numberOf('import("fs")')).toBeNull();
    expect(numberOf('sqrt(16)')).toBe(4);
    expect(numberOf('x+1')).toBeNull();
    expect(numberOf('1/0')).toBeNull();
    expect(numberOf('9'.repeat(200))).toBeNull();
    expect(normalizeNumberText('٣٫٥')).toBe('3.5');
    expect(splitUnit('12 m/s')).toEqual({ num: '12', unit: 'm/s' });
    expect(convert(1, 'km', 'm')).toBe(1000);
    expect(convert(1, 'riyal', 'pound_eg')).toBeNull();
    expect(convert(1, 'kg', 'm')).toBeNull();
  });
});

describe('ordering', () => {
  const item = base({ type: 'ordering', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }, { id: 'c', text: '3' }, { id: 'd', text: '4' }], answer_key: { order: ['a', 'b', 'c', 'd'] } });
  it('exact order full marks; Kendall partial credit otherwise', () => {
    expect(gradeClosed(item, ['a', 'b', 'c', 'd']).total).toBe(1);
    expect(gradeClosed(item, ['b', 'a', 'c', 'd'])).toMatchObject({ total: 0.83, criteria: [{ reason_code: 'order_partly_correct' }] });
    expect(gradeClosed(item, ['d', 'c', 'b', 'a']).criteria[0].reason_code).toBe('wrong');
    expect(gradeClosed(item, 'abcd').criteria[0].reason_code).toBe('empty');
    expect(gradeClosed(item, ['a', 'a', 'zz', 'b']).total).toBe(0.17);
    expect(kendallShare(['a'], ['a'])).toBe(0);
  });
});

describe('dropdown', () => {
  const item = base({ subject: 'language', language: 'ar', type: 'dropdown', stem: 'الطالبُ {{drop_1}} الدرسَ و{{drop_2}} الواجب.', options: { drop_1: ['كتبَ', 'كتبت'], drop_2: ['حلَّ', 'حلّت'] }, answer_key: { choices: { drop_1: 'كتبَ', drop_2: 'حلَّ' } }, error_codes: ['gender_agreement'] });
  it('per-drop credit; tashkeel folded; a wrong choice adds the item error code', () => {
    expect(gradeClosed(item, { drop_1: 'كتب', drop_2: 'حل' }).total).toBe(1);
    expect(gradeClosed(item, { drop_1: 'كتبت', drop_2: 'حلَّ' })).toMatchObject({ total: 0.5, error_codes: ['gender_agreement'] });
    expect(gradeClosed(item, {}).criteria.map((c) => c.reason_code)).toEqual(['empty', 'empty']);
  });
});

describe('invalid items are refused, never graded', () => {
  const bad: [string, Record<string, unknown>][] = [
    ['single mcq with two keys', base({ type: 'mcq', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], answer_key: { correct: ['a', 'b'], multi: false } })],
    ['mcq key not an option', base({ type: 'mcq', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], answer_key: { correct: ['z'], multi: false } })],
    ['mcq duplicate ids', base({ type: 'mcq', options: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }], answer_key: { correct: ['a'], multi: false } })],
    ['blank without key', base({ type: 'fill_blank', stem: '{{blank_1}} and {{blank_2}}', answer_key: { blanks: { blank_1: ['x'] } } })],
    ['no blank in stem', base({ type: 'fill_blank', stem: 'none', answer_key: { blanks: { blank_1: ['x'] } } })],
    ['blank twice', base({ type: 'fill_blank', stem: '{{blank_1}} {{blank_1}}', answer_key: { blanks: { blank_1: ['x'] } } })],
    ['pair with unknown option', base({ type: 'matching', options: { left: [{ id: 'l1', text: 'a' }, { id: 'l2', text: 'b' }], right: [{ id: 'r1', text: 'c' }, { id: 'r2', text: 'd' }] }, answer_key: { pairs: [['l1', 'r9'], ['l2', 'r2']] } })],
    ['left paired twice', base({ type: 'matching', options: { left: [{ id: 'l1', text: 'a' }, { id: 'l2', text: 'b' }], right: [{ id: 'r1', text: 'c' }, { id: 'r2', text: 'd' }] }, answer_key: { pairs: [['l1', 'r1'], ['l1', 'r2']] } })],
    ['expression key without the flag', base({ type: 'numeric', answer_key: { value: 'x+1' } })],
    ['order missing an option', base({ type: 'ordering', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }, { id: 'c', text: '3' }], answer_key: { order: ['a', 'b'] } })],
    ['drop key not a choice', base({ type: 'dropdown', stem: '{{drop_1}}', options: { drop_1: ['x', 'y'] }, answer_key: { choices: { drop_1: 'z' } } })],
    ['drop without choices', base({ type: 'dropdown', stem: '{{drop_1}} {{drop_2}}', options: { drop_1: ['x', 'y'] }, answer_key: { choices: { drop_1: 'x' } } })],
    ['no drop in stem', base({ type: 'dropdown', stem: 'none', options: { drop_1: ['x', 'y'] }, answer_key: { choices: { drop_1: 'x' } } })],
    ['unknown type', base({ type: 'essay', answer_key: {} })],
    ['bad difficulty', base({ type: 'true_false', difficulty: 9, answer_key: { value: true } })],
  ];
  for (const [name, item] of bad) it(name, () => { expect(() => gradeClosed(item, 'x')).toThrow(InvalidItemError); });
});

describe('result builder', () => {
  it('splits points per part and rounds to 2 decimals', () => {
    const r = codeResult(1, [{ code: 'a', fraction: 1, reason: 'correct' }, { code: 'b', fraction: 1, reason: 'correct' }, { code: 'c', fraction: 0, reason: 'wrong' }]);
    expect(r).toMatchObject({ total: 0.67, max: 1 });
    expect(codeResult(2, []).total).toBe(0);
  });
});
