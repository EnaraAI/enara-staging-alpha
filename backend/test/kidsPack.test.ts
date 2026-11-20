import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { lengthTarget, KIDS_PACK_CHILD_LENGTH } from '../src/services/languageTeachingContext';
import { checkLesson, inList, ladLines, loadKidsPack, starterTokens, type LadLesson, type StartersWord } from '../src/services/kidsPack';
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
  it('importer: reading-order format, wrapped entries, two entries on one line, nested notes, headings skipped (format fixture, not Cambridge content)', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kpi-'));
    writeFileSync(path.join(dir, 'w.txt'), ['A', 'a det', 'ask v at prep of place', 'B', 'candy (UK', 'sweet(s)) n', 'cool adj + excl', '25', 'her poss adj + pron', 'in prep of place', '+ time', 'Mr title', 'zebra n zoo n', 'Names', 'Candidates will be expected to recognise and write the following names:', 'Alex', 'May (as in girl’s', 'name)', '29'].join('\n'));
    execFileSync('python3', ['-I', path.resolve(__dirname, '../../scripts/kids/import_starters.py'), path.join(dir, 'w.txt'), path.join(dir, 'out')]);
    const words = JSON.parse(readFileSync(path.join(dir, 'out', 'WORDS.json'), 'utf8')) as StartersWord[];
    expect(words.map((w) => w.word)).toEqual(['a', 'ask', 'at', 'candy', 'cool', 'her', 'in', 'Mr', 'zebra', 'zoo']);
    expect(words.find((w) => w.word === 'candy')).toMatchObject({ note: 'UK sweet(s)', pos: ['n'] });
    expect(words.find((w) => w.word === 'her')!.pos).toEqual(['adj', 'poss', 'pron']);
    expect(words.find((w) => w.word === 'in')).toMatchObject({ use: 'of place + time' });
    expect(words.find((w) => w.word === 'Mr')).toMatchObject({ use: 'title', pos: ['n'] });
    expect(JSON.parse(readFileSync(path.join(dir, 'out', 'NAMES.json'), 'utf8'))).toEqual(['Alex', 'May (as in girl’s name)']);
  });
  it('the imported official data: 495 Starters entries, 10 Pre A1 can-dos, numbers 1-20, names', () => {
    const d = loadKidsPack()!;
    expect(d).not.toBeNull();
    expect(d.words.length).toBe(495);
    expect(d.outcomes.map((o) => o.id)).toEqual(Array.from({ length: 10 }, (_, i) => `PREA1-${String(i + 1).padStart(2, '0')}`));
    expect(d.outcomes[3].canDo).toBe('The learner can understand and follow simple instructions.');
    expect(d.numbers).toHaveLength(20);
    expect(d.names).toContain('Lucy');
    const t = starterTokens(d.words, d.numbers);
    for (const w of ['cat', 'children', 'feet', 'ice', 'cream', 'colour', 'twenty', 'point', 'clap']) expect(t.has(w), w).toBe(true);
    for (const w of ['extraordinary', 'mischievous', 'airport']) expect(t.has(w), w).toBe(false);
  });
  it('the 29 lessons (20 Starters + 9 A1-linked) pass the lesson checker and cover 9 of the 10 can-dos (copying needs the Kids app screen)', () => {
    const out = execFileSync('npx', ['tsx', path.resolve(__dirname, '../src/scripts/kidsLessonCheck.ts'), path.resolve(__dirname, '../../data/kids/prea1/LESSONS.json')], { encoding: 'utf8' });
    expect(out).toMatch(/OK: 29 lessons/);
    const d = loadKidsPack()!;
    const covered = new Set(d.lessons.flatMap((l) => l.outcomeIds));
    // PREA1-10 (copy words, phrases and short sentences) needs the written word on screen: a Kids app task, not a spoken lesson.
    expect(d.outcomes.filter((o) => !covered.has(o.id)).map((o) => o.id)).toEqual(['PREA1-10']);
  }, 60000);
});

describe('A1-linked lessons (PLN2k, amendment G)', () => {
  it('every one of the 12 under-9 A1 objectives has a lesson by outcome id; linkOnly lessons never match by a title word', async () => {
    const { loadKidsPack, lessonFor } = await import('../src/services/kidsPack');
    const d = loadKidsPack()!;
    const ids = ['EN-F-A1-VO-days-months', 'EN-F-A1-GR-article-a-an', 'EN-F-A1-GR-capitals-full-stops', 'EN-F-A1-VO-family', 'EN-F-A1-VO-home-rooms', 'EN-F-A1-VO-food-drink', 'EN-F-A1-VO-numbers-time', 'EN-F-A1-GR-article-the', 'EN-F-A1-GR-prepositions-time', 'EN-F-A1-VO-classroom-objects', 'EN-F-A1-GR-can-ability', 'EN-F-A1-GR-copula-be'];
    for (const id of ids) expect(lessonFor(d, id)?.outcomeIds).toContain(id);
    expect(lessonFor(d, 'EN-F-A1-GR-there-is-are', 'There is and there are')).toBeUndefined(); // "the", "be" topics must not catch it
    expect(lessonFor(d, undefined, 'What you can eat at the party')?.linkOnly).not.toBe(true);
  });
});
