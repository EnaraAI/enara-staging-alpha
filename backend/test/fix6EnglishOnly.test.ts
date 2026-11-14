import { describe, expect, it } from 'vitest';
import * as LTC from '../src/services/languageTeachingContext';

// Fix 6 (owner decision): in English lessons the tutor replies in English only,
// never in Arabic, even when the learner writes in Arabic.
describe('fix 6: English-only replies in English lessons', () => {
  it('the Arabic-writer move asks for English only, with no Arabic words', () => {
    const t = LTC.moveText({ id: 'l1_support', reasons: [], decisionRefs: [] } as never);
    expect(t).toMatch(/only in simple English/i);
    expect(t).toMatch(/no Arabic/i);
    expect(t).not.toMatch(/[؀-ۿ]/);
  });
  it('the English-lesson rule overrides any instruction to reply in the student\'s language', () => {
    expect(LTC.ENGLISH_ONLY_RULE).toMatch(/only in English/i);
    expect(LTC.ENGLISH_ONLY_RULE).toMatch(/even if they write in Arabic/i);
  });
  it('a reply with Arabic script in an English lesson is flagged', () => {
    expect((LTC as unknown as { arabicInReply: (r: string) => boolean }).arabicInReply('milk = حليب')).toBe(true);
    expect((LTC as unknown as { arabicInReply: (r: string) => boolean }).arabicInReply('Milk is a drink.')).toBe(false);
  });
});
