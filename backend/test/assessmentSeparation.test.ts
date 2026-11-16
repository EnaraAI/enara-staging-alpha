import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ROOT, assessmentTexts, backendSrcFiles, buildCorpus, findHits, formatHits, lessonFixtureFiles,
} from './helpers/assessmentText';

// Assessment content must stay out of teaching: no 6-word shingle of an item
// prompt/answer in engine code, tutor prompt builders or lesson data, and no
// backend/src import of data/assessments.

describe('assessment separation', () => {
  const items = assessmentTexts();

  it('no item shingle in backend/src (engine, prompt builders)', () => {
    const hits = findHits(items, buildCorpus(backendSrcFiles()), { sentences: false });
    expect(hits, formatHits(hits)).toEqual([]);
  }, 300_000);

  it('no item shingle in lesson data', () => {
    const hits = findHits(items, buildCorpus(lessonFixtureFiles()), { sentences: false });
    expect(hits, formatHits(hits)).toEqual([]);
  }, 300_000);

  it('no backend/src file imports or reads data/assessments', () => {
    const bad = backendSrcFiles().filter((f) =>
      /data\/assessments|['"`][./]*assessments\/(outcomes|placement)/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('documents the results storage plan (scores to learner record, raw answers to research store with consent)', () => {
    const doc = readFileSync(path.join(ROOT, 'docs/LEARNING_OUTCOMES.md'), 'utf8');
    const m = doc.match(/## [^\n]*Data separation[\s\S]*?(?=\n## |$)/);
    expect(m, 'missing "Data separation" section').toBeTruthy();
    const s = m![0].toLowerCase();
    expect(s).toMatch(/learner record[^\n]*scores only/);
    expect(s).toMatch(/raw answers[^\n]*separate research store/);
    expect(s).toMatch(/consent/);
  });
});
