import { describe, expect, it } from 'vitest';
import { editDistance, foldArabic, normalizeAnswer, normalizeArabic, scriptOf, westernDigits } from '../../src/assessment/text/ar';
import { foldArabic as tutorFold } from '../../src/services/deepseekTutor';

// Assessment engine P1a: one Arabic text helper for the engine and the tutor (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §2).
describe('Arabic text', () => {
  it('strips tashkeel and tatweel, folds alef forms and ى always; ة only when asked', () => {
    expect(normalizeArabic('مَدْرَسَةٌ')).toBe('مدرسة');
    expect(normalizeArabic('أإآٱ')).toBe('اااا');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
    expect(normalizeArabic('كتـــاب')).toBe('كتاب');
    expect(normalizeArabic('مدرسة')).toBe('مدرسة');
    expect(normalizeArabic('مدرسة', { taMarbuta: true })).toBe('مدرسه');
    expect(normalizeArabic('مسؤول قائد', { hamzaSeats: true })).toBe('مسوول قايد');
  });
  it('the tutor uses the same fold (one helper)', () => {
    expect(tutorFold).toBe(foldArabic);
    expect(foldArabic('مَسؤولة')).toBe('مسووله');
  });
  it('digits and marks: Arabic-Indic, Persian, decimal ٫ and thousands ٬', () => {
    expect(westernDigits('١٢٣٫٥')).toBe('123.5');
    expect(westernDigits('۴۵')).toBe('45');
    expect(westernDigits('١٬٢٥٠')).toBe('1,250');
  });
  it('answers folded for comparison in both languages', () => {
    expect(normalizeAnswer('  Paris. ')).toBe('paris');
    expect(normalizeAnswer('«القاهرةُ»؟', { taMarbuta: true })).toBe('القاهره');
    expect(normalizeAnswer('two   words')).toBe('two words');
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(12)).toBe('12');
  });
  it('script detection', () => {
    expect(scriptOf('مرحبا بكم')).toBe('ar');
    expect(scriptOf('Hello there')).toBe('latin');
    expect(scriptOf('Hello مرحبا')).toBe('mixed');
    expect(scriptOf('123 !')).toBe('none');
  });
  it('edit distance, capped', () => {
    expect(editDistance('goes', 'goess', 1)).toBe(1);
    expect(editDistance('kitten', 'sitting', 5)).toBe(3);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
    expect(editDistance('abcd', 'wxyz', 1)).toBe(2);
  });
});
