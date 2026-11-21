import { afterEach, describe, expect, it } from 'vitest';
import { MIXED_ITEM_CLAUSE, mixedReviewOn, REVIEW_FIRST_LINE } from '../src/services/languageTeachingContext';
import { briefLines } from '../src/services/errorsToWorkOn';

// mixedReview (NEXT_PLAN item 2, owner go 21 Nov 2026): review items mix the reviewed point with another known point (interleaving), so the
// learner must decide which rule applies. Builds on spacedReview and reviewFirst.
const ITEMS = [{ code: 'EN-F-A1-GR-article-a-an', title: 'a and an', errorCode: 'article_a_an', errorLabel: 'a/an before a vowel', occurrences: 1 }];
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('mixedReview', () => {
  it('needs spacedReview', () => {
    process.env.ENARA_ENGINE_V2 = 'mixedReview';
    expect(mixedReviewOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'spacedReview,mixedReview';
    expect(mixedReviewOn()).toBe(true);
  });

  it('the reviewFirst opening line asks for a mixed item; still one task, no rule before the try', () => {
    process.env.ENARA_ENGINE_V2 = 'spacedReview,reviewFirst,mixedReview';
    const line = REVIEW_FIRST_LINE(1, 2);
    expect(line).toContain(MIXED_ITEM_CLAUSE.trim());
    expect(line).toMatch(/must decide which rule fits/);
    expect(line).toMatch(/Still one task/);
  });

  it('the spaced review brief asks for mixed items', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview,mixedReview';
    expect(briefLines(ITEMS).join('\n')).toMatch(/Make each review item a MIXED one/);
  });

  it('switch off: the review lines are unchanged', () => {
    process.env.ENARA_ENGINE_V2 = 'workOn,spacedReview,reviewFirst';
    expect(REVIEW_FIRST_LINE(1, 2)).not.toMatch(/MIXED/);
    expect(briefLines(ITEMS).join('\n')).not.toMatch(/MIXED/);
  });
});
