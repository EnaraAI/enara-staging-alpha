import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { lengthTarget, KIDS_PACK_CHILD_LENGTH } from '../src/services/languageTeachingContext';
import { checkLesson, inList, ladLines, loadKidsPack, type LadLesson, type StartersWord } from '../src/services/kidsPack';
import { engineV2 } from '../src/services/engineV2';

const saved = process.env.ENARA_ENGINE_V2;
afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
const child = { value: 'child' as const, status: 'known' as const, source: 'test' };

// A tiny word list for the tests only (NOT the Cambridge list; the real one is imported from the official PDF).
const W: StartersWord[] = ['the', 'a', 'cat', 'dog', 'is', 'on', 'mat', 'point', 'to', 'touch', 'your', 'nose', 'clap', 'hands', 'red', 'blue', 'ball', 'look', 'big', 'small', 'it', 'run', 'sit', 'jump', 'one', 'two', 'three', 'see', 'can', 'i', 'my', 'say', 'hello', 'colour', 'at', 'that', 'with', 'me'].map((word) => ({ word, pos: ['n'] }));
const L: LadLesson = {
  id: 'test', outcomeIds: ['PREA1-LI-01'], topic: 'animals', words: ['cat', 'dog'],
  story: ['A cat is on the mat.', 'A dog can see the cat.', 'The dog says hello.', 'The cat can jump.'],
  chant: ['Cat, cat, on the mat.', 'Dog, dog, look at that.', 'One, two, three.', 'Clap your hands with me.'],
  commands: ['Point to the cat.', 'Touch your nose.', 'Clap your hands.', 'Colour the ball red.'],
};

describe('kidsPack', () => {
  it('is named-only and needs planner2 for the LAD content', () => {
    for (const env of ['', 'all', 'teach2', 'esl5']) { process.env.ENARA_ENGINE_V2 = env; expect(engineV2('kidsPack')).toBe(false); }
  });
  it('child reply length: unchanged when off; shorter when on (A1 30-50 instead of 45-70)', () => {
    process.env.ENARA_ENGINE_V2 = '';
    expect(lengthTarget(child, 'A1')).toMatchObject({ targetWords: 45, maxWords: 70 });
    process.env.ENARA_ENGINE_V2 = 'kidsPack';
    expect(lengthTarget(child, 'A1')).toMatchObject({ targetWords: 30, maxWords: 50 });
    expect(lengthTarget(child, 'Pre-A1')).toMatchObject({ targetWords: KIDS_PACK_CHILD_LENGTH.prea1[0], maxWords: KIDS_PACK_CHILD_LENGTH.prea1[1] });
    expect(lengthTarget({ value: 'adult', status: 'known', source: 't' }, 'A1')).toMatchObject({ targetWords: 70, maxWords: 110 });
  });
  it('lesson check: a clean lesson passes; off-list words, long lines and two actions are caught', () => {
    expect(checkLesson(L, W)).toEqual([]);
    const bad = { ...L, story: [...L.story.slice(0, 3), 'The cat is extraordinarily mischievous today.'], commands: ['Point to the cat and jump.', ...L.commands.slice(1)] };
    const p = checkLesson(bad, W).join('\n');
    expect(p).toMatch(/extraordinarily/);
    expect(p).toMatch(/more than one action/);
  });
  it('word check handles simple inflections only when the base is listed', () => {
    const s = new Set(['cat', 'run', 'colour']);
    expect(inList('cats', s)).toBe(true);
    expect(inList("cat's", s)).toBe(true);
    expect(inList('colouring', s)).toBe(true);
    expect(inList('dogs', s)).toBe(false);
  });
  it('LAD stage lines: code picks the content for each stage', () => {
    expect(ladLines(L, 'listen').join('\n')).toMatch(/A cat is on the mat/);
    expect(ladLines(L, 'do', 1).join('\n')).toMatch(/Touch your nose/);
    expect(ladLines(L, 'chant').join('\n')).toMatch(/Clap your hands with me/);
    expect(ladLines(L, 'check').join('\n')).toMatch(/Stage Check/);
    expect(ladLines(undefined, 'listen').join('\n')).toMatch(/No kids lesson content/);
    for (const st of ['listen', 'do', 'chant', 'check'] as const) expect(ladLines(L, st)[0]).toMatch(/at most 3 short sentences/);
  });
  it('without imported data the pack is inactive (no invented list)', () => {
    expect(loadKidsPack(mkdtempSync(path.join(os.tmpdir(), 'kp-')))).toBeNull();
  });
  it('importer parses the A-Z layout and the Can Do section (format fixture, not Cambridge content)', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kpi-'));
    writeFileSync(path.join(dir, 'w.txt'), 'A\na det         cat n          jump v\nabout prep    colour n, v    red adj\nAlphabetical list\n');
    writeFileSync(path.join(dir, 'c.txt'), 'Pre A1 Starters\nListening\n• Can understand fixture sentence one about pictures\nSpeaking\n• Can say fixture sentence two about themselves\nA1 Movers\nListening\n• Can understand something else entirely\n');
    execFileSync('python3', ['-I', path.resolve(__dirname, '../../scripts/kids/import_starters.py'), path.join(dir, 'w.txt'), path.join(dir, 'c.txt'), path.join(dir, 'out')]);
    const words = JSON.parse(readFileSync(path.join(dir, 'out', 'WORDS.json'), 'utf8'));
    expect(words.map((w: StartersWord) => w.word)).toEqual(['a', 'cat', 'jump', 'about', 'colour', 'red']);
    expect(words.find((w: StartersWord) => w.word === 'colour').pos).toEqual(['n', 'v']);
    const out = JSON.parse(readFileSync(path.join(dir, 'out', 'OUTCOMES.json'), 'utf8'));
    expect(out.map((o: { id: string }) => o.id)).toEqual(['PREA1-LI-01', 'PREA1-SP-01']);
  });
});
