import { afterEach, describe, expect, it } from 'vitest';
import { groundedRefusalOn, isQuestion, OUT_OF_SCOPE_LINE, outOfScopeTurn } from '../src/services/groundedRefusal';

// groundedRefusal (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN D): a subject question the course materials do not cover is said plainly and
// flagged for teachers.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
const has = async () => true;
const none = async () => false;
const base = { language: false, answeringPractice: false, text: 'What causes earthquakes?', sourcesFound: 0, institutionId: 'i', curriculumId: 'c' };

describe('groundedRefusal', () => {
  it('named-only switch, off by default', () => {
    expect(groundedRefusalOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(groundedRefusalOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'groundedRefusal';
    expect(groundedRefusalOn()).toBe(true);
  });

  it('questions in English and Arabic; answers and greetings are not questions', () => {
    for (const t of ['What causes earthquakes?', 'explain the water cycle', 'ما هو البناء الضوئي', 'ليه السماء زرقاء؟', 'how do magnets work']) expect(isQuestion(t)).toBe(true);
    for (const t of ['12', 'hi', 'The answer is 7', 'ok next']) expect(isQuestion(t)).toBe(false);
  });

  it('flags only a subject question with no passage, in a course that has materials', async () => {
    expect(await outOfScopeTurn(base, has)).toBe(false); // switch off
    process.env.ENARA_ENGINE_V2 = 'groundedRefusal';
    expect(await outOfScopeTurn(base, has)).toBe(true);
    expect(await outOfScopeTurn(base, none)).toBe(false); // no materials: "nothing found" means nothing to say
    expect(await outOfScopeTurn({ ...base, sourcesFound: 2 }, has)).toBe(false);
    expect(await outOfScopeTurn({ ...base, language: true }, has)).toBe(false); // English lessons run from the lesson spec
    expect(await outOfScopeTurn({ ...base, answeringPractice: true }, has)).toBe(false);
    expect(await outOfScopeTurn({ ...base, text: 'The answer is 42' }, has)).toBe(false);
  });

  it('the line says so first, labels general knowledge, cites nothing', () => {
    expect(OUT_OF_SCOPE_LINE).toMatch(/isn't in your course materials/);
    expect(OUT_OF_SCOPE_LINE).toMatch(/clearly labelled as general knowledge/);
    expect(OUT_OF_SCOPE_LINE).toMatch(/Do not cite/);
  });
});
