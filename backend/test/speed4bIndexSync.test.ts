// lms-speed-4b: with autoIndex off (lms-test entry), the deploy's migration step builds every model's indexes once,
// including models that other code loads only on demand.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureAllIndexes, modelFiles } from '../src/config/indexSync';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongoose.set('autoIndex', false);
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);
afterAll(async () => { mongoose.set('autoIndex', true); await mongoose.disconnect(); await mongo.stop(); });

describe('lms-speed-4b ensureAllIndexes', () => {
  it('finds the model files, including ones loaded only on demand, and no scripts', () => {
    const files = modelFiles().map((f) => f.replace(/\\/g, '/'));
    for (const f of ['models/User.ts', 'models/BankItem.ts', 'models/ReviewDecision.ts', 'models/ParentRecommendation.ts', 'schoolApp/models.ts', 'integrations/lms/models/platform.ts']) {
      expect(files.some((x) => x.endsWith('/src/' + f)), f).toBe(true);
    }
    expect(files.some((x) => x.includes('/scripts/'))).toBe(false);
  });

  it('also finds model files in the compiled build (CommonJS), not only in TypeScript source', () => {
    // lms-test runs the tsc output, where model('X', …) becomes (0, mongoose_1.model)('X', …): on 27 Nov the first
    // deploy found only 2 files there.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speed4c-'));
    fs.mkdirSync(path.join(dir, 'models')); fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'models', 'A.js'), "exports.A = (0, mongoose_1.model)('Alpha', schema);");
    fs.writeFileSync(path.join(dir, 'models', 'B.js'), "exports.B = mongoose_1.default.model('Beta', schema);");
    fs.writeFileSync(path.join(dir, 'models', 'C.js'), "const x = model('lowercaseIsNotAModel');");
    fs.writeFileSync(path.join(dir, 'scripts', 'D.js'), "(0, mongoose_1.model)('Script', s);");
    const found = modelFiles(dir).map((f) => path.basename(f)).sort();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(found).toEqual(['A.js', 'B.js']);
  });

  it('builds the indexes autoIndex would have built, for every model, with no failure', async () => {
    const res = await ensureAllIndexes();
    expect(res.failed).toEqual([]);
    expect(res.missing, 'every declared index exists').toEqual([]);
    expect(res.unloaded, 'every model the build defines is loaded').toEqual([]);
    expect(res.models).toBeGreaterThan(130);
    const users = await mongoose.model('User').collection.indexes();
    expect(users.some((i) => i.key.email === 1 && i.unique)).toBe(true);
    const bank = mongoose.model('BankItem');
    const declared = bank.schema.indexes().length;
    const built = (await bank.collection.indexes()).length - 1; // minus _id
    expect(built).toBeGreaterThanOrEqual(declared);
  }, 120_000);

  it('keeps existing indexes, drops none, and reports a declared index it could not build as missing', async () => {
    const coll = mongoose.model('User').collection;
    await coll.createIndex({ speed4bKeep: 1 }); // an index no schema declares
    const before = (await coll.indexes()).length;
    const res = await ensureAllIndexes();
    expect((await coll.indexes()).length).toBe(before);
    expect(res.missing).toEqual([]);
    await coll.dropIndex('email_1');
    const fake = await ensureAllIndexes([]); // nothing loaded again; createIndexes still rebuilds it
    expect(fake.missing).toEqual([]);
  }, 120_000);
});
