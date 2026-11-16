// DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md, "User decisions (A1–A2)")
// Vocabulary validity: a vocabulary form must not test only spelling in its error-correction slots.
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadJson, outcomeFiles } from './helpers/assessmentText';

const isSpelling = (t: unknown) => typeof t === 'string' && /^\s*spelling/i.test(t);

describe('vocabulary forms: error-correction items are not all spelling', () => {
  const files = outcomeFiles().filter((f) => /^EN-F-[A-C][12]-VO-/.test(path.basename(f)));
  it('finds vocabulary forms', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const d = loadJson(f);
    it(path.basename(f, '.json'), () => {
      const bad: string[] = [];
      for (const [k, items] of Object.entries<any[]>(d.forms)) {
        const ec = items.filter((i) => i.type === 'error_correction');
        if (ec.length && ec.every((i) => isSpelling(i.l1ErrorType))) bad.push(`form ${k}: every error-correction item is a spelling item`);
        if (ec.filter((i) => isSpelling(i.l1ErrorType)).length > 1) bad.push(`form ${k}: more than one spelling error-correction item`);
      }
      expect(bad).toEqual([]);
    });
  }
});
