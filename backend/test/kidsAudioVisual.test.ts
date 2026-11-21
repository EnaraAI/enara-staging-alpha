import { afterEach, describe, expect, it } from 'vitest';
import { parseAssessmentMarker } from '../src/services/languageLearningState';
import { KIDS_PICS_LINE, kidsAudioVisualOn, pictureChoices, pictureIndex } from '../src/services/kidsPictures';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, selectLanguageMoves, type LanguageTeachingContext } from '../src/services/languageTeachingContext';

// kidsAudioVisual (NEXT_PLAN item 1, owner go 21 Nov 2026): under 9, the tutor names 2-4 picture choices in its hidden line; only words with
// a picture in ENARA's own set become choices; the choices never mark the right one; speaking stays off.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('kidsAudioVisual', () => {
  it("pictures are ENARA's own set: index and files agree, no OpenMoji files or credit line left", async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '../../frontend/public/kids/pics');
    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { _source: string; words: Record<string, string> };
    expect(idx._source).toMatch(/ENARA own picture set/);
    const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')));
    for (const s of Object.values(idx.words)) expect(files.has(s)).toBe(true);
    expect([...pictureIndex().entries()]).toEqual(Object.entries(idx.words));
    expect(readFileSync(join(__dirname, '../../frontend/kids/enaraKids.js'), 'utf8')).not.toMatch(/OpenMoji/);
    for (const f of files) expect(readFileSync(join(dir, `${f}.svg`), 'utf8')).not.toMatch(/openmoji/i);
  });

  it('the hidden line carries pics=, cleaned (spaces from _ or -, lower case, at most 4)', () => {
    const m = parseAssessmentMarker('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM pics=Cat|dog|ice_cream|bus|duck]]');
    expect(m?.pics).toEqual(['cat', 'dog', 'ice cream', 'bus']);
    expect(parseAssessmentMarker('[[assess verdict=CORRECT next=NONE]]')?.pics).toBeUndefined();
  });

  it('only words with a picture become choices; fewer than 2 known words gives none; nothing marks the answer', () => {
    expect(pictureIndex().size).toBeGreaterThan(100);
    const c = pictureChoices(['cat', 'dog', 'notaword']);
    expect(c).toEqual([{ word: 'cat', src: `/kids/pics/${pictureIndex().get('cat')}.svg` }, { word: 'dog', src: `/kids/pics/${pictureIndex().get('dog')}.svg` }]);
    expect(JSON.stringify(c)).not.toMatch(/right|correct|answer/i);
    expect(pictureChoices(['cat', 'notaword'])).toBeUndefined();
    expect(pictureChoices(undefined)).toBeUndefined();
  });

  it('the prompt line is given only to a child under 9 with the switch on; English only words', () => {
    const run = (years: number) => {
      const message = 'Hi';
      const signals = detectTurnSignals(message, [{ role: 'user', content: message }], undefined);
      const moves = selectLanguageMoves({ band: levelBand('A1'), targetLanguage: 'English', lessonStatus: 'none', signals });
      const base = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
      const learner = { ...base, ageBand: { status: 'known', value: 'child', source: 'test' } as never, ageYears: years };
      const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'none' } as never, signals, moves };
      return renderLanguageContextPrompt(ctx);
    };
    process.env.ENARA_ENGINE_V2 = 'childShort,kidsAudioVisual';
    expect(kidsAudioVisualOn()).toBe(true);
    expect(run(7)).toContain(KIDS_PICS_LINE);
    expect(run(10)).not.toContain(KIDS_PICS_LINE);
    process.env.ENARA_ENGINE_V2 = 'childShort';
    expect(run(7)).not.toContain(KIDS_PICS_LINE);
    expect(KIDS_PICS_LINE).toMatch(/never say which picture is right/);
  });
});
