// lms-speed-4b: with autoIndex off (lms-test entry), the deploy's migration step builds every model's indexes once,
// including models that other code loads only on demand.
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

  it('builds the indexes autoIndex would have built, for every model, with no failure', async () => {
    const res = await ensureAllIndexes();
    expect(res.failed).toEqual([]);
    expect(res.missing, 'every declared index exists').toEqual([]);
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
