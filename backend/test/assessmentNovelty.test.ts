import { describe, expect, it } from 'vitest';
import {
  assessmentTexts, backendSrcFiles, buildCorpus, findHits, formatHits, lessonFixtureFiles, researchFiles,
} from './helpers/assessmentText';

// Assessment items must be novel: no prompt / answer sentence (>=4 words) or
// 6-word shingle may appear in lesson fixtures, tutor engine strings, ESL1-ESL5
// post-tests and fixtures, or research benchmark/outcome files.

describe('assessment novelty', () => {
  const items = assessmentTexts();
  it('loads items', () => expect(items.length).toBeGreaterThan(500));
  const groups: Array<[string, () => string[]]> = [
    ['lesson fixtures', lessonFixtureFiles],
    ['backend/src tutor text', backendSrcFiles],
    ['research ESL post-tests, fixtures, benchmarks', researchFiles],
  ];
  for (const [name, files] of groups) {
    it(`no overlap with ${name}`, () => {
      const hits = findHits(items, buildCorpus(files()), { sentences: true });
      expect(hits, formatHits(hits)).toEqual([]);
    }, 300_000);
  }
});
