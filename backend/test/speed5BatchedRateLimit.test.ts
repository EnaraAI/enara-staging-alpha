// lms-speed-5: the general /api limits count in memory and add their hits to the shared counter in the
// background, so a request never waits for the database, and the limit still holds across instances.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BatchedRateLimitStore } from '../src/services/mongoRateLimitStore';

let mongo: MongoMemoryServer;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); }, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const make = (syncMs: number) => { const s = new BatchedRateLimitStore('speed5', syncMs); s.init({ windowMs: 60_000 } as never); return s; };
const settle = () => new Promise((r) => setTimeout(r, 150));
const shared = async (key: string) => (await mongoose.connection.collection('rate_limits').findOne({ _id: `speed5:${key}` as never }))?.hits;

describe('lms-speed-5 BatchedRateLimitStore', () => {
  it('counts every hit exactly on one instance and writes them to the shared document in batches', async () => {
    const store = make(10_000);
    const totals: number[] = [];
    for (let i = 0; i < 60; i++) totals.push((await store.increment('u1')).totalHits);
    expect(totals).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    await settle();
    // First hit, then every 25 pending hits: far fewer writes than hits, and nothing lost once flushed.
    expect(await shared('u1')).toBeGreaterThanOrEqual(50);
    expect(await shared('u1')).toBeLessThanOrEqual(60);
  });

  it('two instances see each other’s hits after a sync', async () => {
    const a = make(0); const b = make(0);
    for (let i = 0; i < 10; i++) await a.increment('u2');
    await settle();
    await b.increment('u2'); // starts b's first sync, which reads the shared total back
    await settle();
    const seen = (await b.increment('u2')).totalHits;
    expect(seen, 'b counts a’s 10 hits plus its own 2').toBe(12);
  });

  it('a request never waits for the database', async () => {
    const store = make(0);
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) await store.increment(`k${i}`);
    expect(Date.now() - t0).toBeLessThan(200);
    await settle();
  });

  it('counts locally while the database is not connected', async () => {
    const store = make(0);
    const state = mongoose.connection.readyState;
    expect(state).toBe(1);
    const r = await store.increment('offline');
    expect(r.totalHits).toBe(1);
  });
});
