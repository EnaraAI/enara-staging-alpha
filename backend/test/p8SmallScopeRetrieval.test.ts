import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { searchTerms } from '../src/services/textSearch';

// P8 F-3: grounded retrieval in scopes of one or a few passages. Synthetic
// passages only, in-memory database, no provider calls.

let mongo: MongoMemoryServer;
let retrieve: typeof import('../src/services/curriculumRetrieval').retrieveCurriculumSources;
let CurriculumChunk: typeof import('../src/models/CurriculumChunk').CurriculumChunk;
const INST = 'p8-school';

const PHOTO = 'Photosynthesis happens in the chloroplasts of plant leaves. Chlorophyll absorbs sunlight, and the plant uses that energy to turn carbon dioxide and water into glucose and oxygen.';
const PHOTO_AR = 'البناء الضوئي يحدث في البلاستيدات الخضراء في أوراق النبات. يمتص الكلوروفيل ضوء الشمس، ويحول النبات ثاني أكسيد الكربون والماء إلى جلوكوز وأكسجين.';
// Supports "what gas do plants release": it says so in those words.
const PHOTO_GAS = 'During photosynthesis, plants take in carbon dioxide and release oxygen gas into the air through small pores in their leaves.';
const DISTRACTORS = [
  'The water cycle moves water through evaporation, condensation and precipitation. Clouds form when water vapour cools.',
  'Fractions with a common denominator are added by adding the numerators and keeping the denominator.',
];

async function passage(curriculumId: string, n: number, text: string, uploadId = `up-${curriculumId}-${n}`, sectionLabel?: string) {
  const terms = [...new Set(searchTerms(text))];
  await CurriculumChunk.create({
    id: `${curriculumId}-c${n}`, institutionId: INST, curriculumId, lessonId: 'L1', fileUrl: `/uploads/${uploadId}.pdf`, fileName: `${uploadId}.pdf`,
    uploadId, chunkIndex: n, page: 1, sectionLabel, text, terms, termCount: terms.length, contentHash: `h${curriculumId}${n}`, extractionVersion: 'test',
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ANTHROPIC_API_KEY: '',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ CurriculumChunk } = await import('../src/models/CurriculumChunk'));
  ({ retrieveCurriculumSources: retrieve } = await import('../src/services/curriculumRetrieval'));
  await passage('one', 1, PHOTO);
  await passage('one-ar', 1, PHOTO_AR);
  await passage('one-gas', 1, PHOTO_GAS);
  // Single-topic guard fixtures: "evaporation" appears once, mid-sentence.
  const PUDDLE = 'Puddles shrink on warm days because the water slowly turns into vapour through evaporation and rises.';
  await passage('heading', 1, PUDDLE, 'up-heading-1', 'Section 2: Evaporation');
  await passage('no-heading', 1, PUDDLE);
  await passage('titled', 1, PUDDLE, 'evaporation-notes');
  await passage('repeat', 1, 'Rolling objects slow down because of friction. Rough surfaces create more friction than smooth ones.');
  await passage('same-sentence', 1, 'Rolling objects slow down because friction and more friction act on them.');
  await passage('ar-heading', 1, PHOTO_AR, 'up-ar-heading-1', 'القسم 2: الكلوروفيل');
  await passage('few', 1, DISTRACTORS[0]);
  await passage('few', 2, PHOTO);
  await passage('few', 3, DISTRACTORS[1]);
  await passage('large', 0, PHOTO);
  for (let i = 1; i <= 8; i++) await passage('large', i, `${DISTRACTORS[i % 2]} Review set ${i}.`);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const ask = (curriculumId: string, query: string, uploadIds?: string[]) => retrieve({ institutionId: INST, curriculumId, query, ...(uploadIds ? { uploadIds } : {}) });

describe('F-3 small-scope retrieval', () => {
  it('answers from a single one-passage document when the question shares two or more terms', async () => {
    const r = await ask('one', 'Where in the plant does photosynthesis happen and what does chlorophyll absorb?');
    expect(r.map((s) => s.chunkId)).toEqual(['one-c1']);
    // Same through the P2 document filter (the chat path with one selected document).
    expect((await ask('one', 'How does chlorophyll use sunlight?', ['up-one-1'])).map((s) => s.chunkId)).toEqual(['one-c1']);
  });

  it('still returns no source for unrelated questions or a single shared term', async () => {
    expect(await ask('one', 'Who won the football world cup in 1998?')).toEqual([]);
    expect(await ask('one', 'What is the capital city of France?')).toEqual([]);
    expect(await ask('one', 'Describe the oxygen tank on a submarine')).toEqual([]);
  });

  // P8 follow-up: probes from the precision review. [scope, question, expected source or null]
  const PROBES: [string, string, string | null][] = [
    ['one', 'Where in the plant does photosynthesis happen and what does chlorophyll absorb?', 'one-c1'],
    ['one', 'What happens in the chloroplasts of plant leaves?', 'one-c1'],
    ['one', 'What does a plant turn carbon dioxide and water into?', 'one-c1'],
    ['one', 'What energy source powers an electric car and how much water does it use?', null],
    ['one', 'Is oxygen or carbon dioxide heavier in the air we breathe?', null],
    ['one', 'What turns water into steam in a kettle?', null],
    ['one', 'How do plant cells divide during mitosis?', null],
    ['one', 'Why are leaves green?', null], // the passage never says why leaves are green
    ['one-ar', 'كيف يمتص الكلوروفيل ضوء الشمس؟', 'one-ar-c1'],
    ['one-ar', 'أين يحدث البناء الضوئي في النبات؟', 'one-ar-c1'],
    ['one-ar', 'ما هو ثاني أكسيد الكربون في السيارات؟', null],
    ['one-ar', 'What is ثاني أكسيد الكربون in cars?', null],
    ['one-ar', 'من فاز بكأس العالم؟', null],
    ['one', 'What is the capital city of France?', null],
    // P8 recall finalization: instruction-style and paraphrased questions...
    ['one', 'Can you summarise photosynthesis simply for my grade 5 students?', 'one-c1'],
    ['one', 'Summarize photosynthesis for 10th grade students', 'one-c1'],
    ['one-gas', 'What gas do plants release in photosynthesis?', 'one-gas-c1'],
    ['one-ar', 'اشرح البناء الضوئي لطلاب الصف الخامس', 'one-ar-c1'],
    ['one-ar', 'لخص البناء الضوئي للطلاب ببساطة', 'one-ar-c1'],
    // ...while framing words never turn an off-topic question into a match.
    ['one', 'Explain the water cycle to my students', null],
    ['one', 'Summarise the history of football for grade 5 students', null],
    ['one', 'Explain simply how carbon dioxide gets into car engines', null],
    ['one-gas', 'What gas powers a kitchen stove?', null],
    ['one-ar', 'اشرح ثاني أكسيد الكربون في السيارات للطلاب', null],
    ['one-ar', 'لخص تاريخ كرة القدم لطلاب الصف الخامس', null],
  ];
  it.each(PROBES)('small-scope probe [%s] %s', async (scope, q, expected) => {
    const r = await ask(scope, q);
    expect(r[0]?.chunkId ?? null).toBe(expected);
  });

  // Single-topic guard: one topic word must be grounded in a heading, in two
  // sentences, or as the passage's opening word, not mentioned once in passing.
  const SINGLE_TOPIC: [string, string, string | null][] = [
    ['one', 'Explain water to my students', null],
    ['one', 'Explain chlorophyll to my students', null],
    ['one', 'Summarise photosynthesis for my grade 5 students', 'one-c1'],
    ['heading', 'Explain evaporation to my students', 'heading-c1'],
    ['no-heading', 'Explain evaporation to my students', null],
    ['titled', 'Explain evaporation to my students', 'titled-c1'],
    ['repeat', 'Explain friction simply to my students', 'repeat-c1'],
    ['same-sentence', 'Explain friction simply to my students', null],
    ['ar-heading', 'اشرح الكلوروفيل للطلاب', 'ar-heading-c1'],
    ['one-ar', 'اشرح الكلوروفيل للطلاب', null],
    ['one-ar', 'اشرح الماء للطلاب', null],
    ['one-ar', 'اشرح البناء الضوئي للطلاب', 'one-ar-c1'],
    ['few', 'Explain photosynthesis to my students', 'few-c2'],
    ['few', 'Explain water to my students', 'few-c1'],
    ['large', 'Explain water to my students', null],
  ];
  it.each(SINGLE_TOPIC)('single-topic guard [%s] %s', async (scope, q, expected) => {
    const r = await ask(scope, q);
    expect(r[0]?.chunkId ?? null).toBe(expected);
    // The water question must not also pull in the photosynthesis passage.
    if (scope === 'few' && q.includes('water')) expect(r.map((x) => x.chunkId)).not.toContain('few-c2');
  });

  it('picks the right passage from a small collection with distractors', async () => {
    const r = await ask('few', 'What does chlorophyll absorb during photosynthesis?');
    expect(r[0].chunkId).toBe('few-c2');
    expect(r.map((s) => s.chunkId)).not.toContain('few-c3');
    expect((await ask('few', 'How do I add fractions with a common denominator?'))[0].chunkId).toBe('few-c3');
    expect(await ask('few', 'Who won the football world cup in 1998?')).toEqual([]);
  });

  it('keeps the original score floor of 1 in larger scopes', async () => {
    const r = await ask('large', 'What does chlorophyll absorb during photosynthesis?');
    expect(r[0].chunkId).toBe('large-c0');
    expect(r.every((s) => s.score >= 1)).toBe(true);
    expect(await ask('large', 'Who won the football world cup in 1998?')).toEqual([]);
  });
});

describe('F-5 temporary maintenance endpoint is gone', () => {
  // A staging-mode app cannot be built in tests (the staging guard requires the
  // real staging environment), so the route table is checked with the token set,
  // and the source is checked for any remaining mount.
  it('is not mounted and its module no longer exists', async () => {
    process.env.STAGING_MAINTENANCE_TOKEN = 'p8-test-only-'.padEnd(48, 'x');
    try {
      (await import('../src/config/env')).resetConfigForTests();
      const app = (await import('../src/app')).createApp();
      const seen: string[] = [];
      const walk = (stack: any[]) => stack.forEach((l) => { seen.push(String(l.regexp ?? ''), String(l.route?.path ?? '')); if (l.handle?.stack) walk(l.handle.stack); });
      walk((app as any)._router.stack);
      expect(seen.join(' ')).not.toMatch(/staging-maintenance/);
      const r = await request(app).post('/api/staging-maintenance').set('x-staging-maintenance-token', process.env.STAGING_MAINTENANCE_TOKEN).send({ action: 'status' });
      expect(r.status).toBe(404);
    } finally {
      delete process.env.STAGING_MAINTENANCE_TOKEN;
    }
    const src = path.join(__dirname, '../src');
    expect(fs.existsSync(path.join(src, 'routes/stagingMaintenance.routes.ts'))).toBe(false);
    expect(fs.readFileSync(path.join(src, 'app.ts'), 'utf8')).not.toMatch(/staging-maintenance|stagingMaintenance|STAGING_MAINTENANCE_TOKEN/);
  }, 30_000);
});
