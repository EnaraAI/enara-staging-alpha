import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// P0a: usage ledger model (append-only, idempotent on operationKey) and the
// additive price-catalogue migration. Offline: in-memory MongoDB, no AI calls.
let mongo: MongoMemoryServer;
let UsageLedger: typeof import('../src/models/UsageLedger').UsageLedger;
let PriceCatalogRow: typeof import('../src/models/PriceCatalog').PriceCatalogRow;
let appendUsage: typeof import('../src/services/usageLedger').appendUsage;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ UsageLedger } = await import('../src/models/UsageLedger'));
  ({ PriceCatalogRow } = await import('../src/models/PriceCatalog'));
  ({ appendUsage } = await import('../src/services/usageLedger'));
  await UsageLedger.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.collection('usage_ledger').deleteMany({});
});

const entry = (over: Record<string, unknown> = {}) => ({
  operationKey: 'req-1:0',
  institutionId: 'instA',
  userId: 'u1',
  feature: 'tutor_chat',
  provider: 'anthropic' as const,
  modelName: 'claude-opus-5-5',
  units: { inputTokens: 1200, outputTokens: 300 },
  status: 'ok' as const,
  priceCatalogVersion: 'v1',
  costInternal: 0.0108,
  costStatus: 'estimated' as const,
  ...over,
});

describe('usage ledger', () => {
  it('appends a row with defaults (live origin, USD, attempt 1)', async () => {
    const { row, created } = await appendUsage(entry());
    expect(created).toBe(true);
    expect(row).toMatchObject({ origin: 'live', currency: 'USD', attempt: 1, costStatus: 'estimated' });
    expect(row.id).toMatch(/^ul-/);
  });

  it('is idempotent on operationKey: a repeated write adds nothing and returns the first row', async () => {
    const first = await appendUsage(entry());
    const again = await appendUsage(entry({ requestId: 'r-retry' }));
    expect(again.created).toBe(false);
    expect(again.row.id).toBe(first.row.id);
    expect(again.row.costInternal).toBe(0.0108);
    expect(await UsageLedger.countDocuments()).toBe(1);
    // Retries are separate billed attempts with their own keys.
    await appendUsage(entry({ operationKey: 'req-1:1', attempt: 2, status: 'error', costInternal: null, costStatus: 'unpriced' }));
    expect(await UsageLedger.countDocuments()).toBe(2);
  });

  it('handles concurrent duplicate writes as one row', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => appendUsage(entry({ operationKey: 'req-race:0' }))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await UsageLedger.countDocuments({ operationKey: 'req-race:0' })).toBe(1);
  });

  it('validates required fields, enums and non-negative units', async () => {
    await expect(appendUsage(entry({ operationKey: ' ' }))).rejects.toThrow(/operationKey/);
    await expect(appendUsage(entry({ operationKey: 'k2', costStatus: 'guessed' }))).rejects.toThrow();
    await expect(appendUsage(entry({ operationKey: 'k3', provider: 'openai' }))).rejects.toThrow();
    await expect(appendUsage(entry({ operationKey: 'k4', units: { inputTokens: -5 } }))).rejects.toThrow();
    await expect(appendUsage(entry({ operationKey: 'k5', origin: 'test' }))).rejects.toThrow();
  });

  it('is append-only through the model: updates and deletes are refused', async () => {
    await appendUsage(entry());
    await expect(UsageLedger.updateOne({ operationKey: 'req-1:0' }, { $set: { costInternal: 0 } })).rejects.toThrow(/append-only/);
    await expect(UsageLedger.findOneAndUpdate({ operationKey: 'req-1:0' }, { $set: { costInternal: 0 } })).rejects.toThrow(/append-only/);
    await expect(UsageLedger.deleteOne({ operationKey: 'req-1:0' })).rejects.toThrow(/append-only/);
    await expect(UsageLedger.deleteMany({})).rejects.toThrow(/append-only/);
    expect((await UsageLedger.findOne({ operationKey: 'req-1:0' }))!.costInternal).toBe(0.0108);
  });
});

describe('migration 2026-10-28-price-catalog-v1', () => {
  it('runs with the other migrations, stores the v1 rows once, and is a no-op when re-run', async () => {
    const { MIGRATIONS } = await import('../src/migrations');
    const { runMigrations } = await import('../src/migrations/runner');
    const { PRICE_CATALOG } = await import('../src/services/priceCatalog');
    const ran = await runMigrations(MIGRATIONS);
    expect(ran).toContain('2026-10-28-price-catalog-v1');
    // Appended after the earlier migrations (later ones may follow it).
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('2026-10-28-price-catalog-v1')).toBeGreaterThan(ids.indexOf('2026-10-26-phase3-assessment-versions'));
    const n = PRICE_CATALOG[0].entries.length;
    expect(await PriceCatalogRow.countDocuments({ version: 'v1' })).toBe(n);
    expect(await PriceCatalogRow.findOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }).lean()).toMatchObject({ usdPerUnitBlock: 20, unitBlock: 1_000_000, source: 'list_estimate' });
    expect(await runMigrations(MIGRATIONS)).toEqual([]);
    // Re-applying the migration body never duplicates or changes stored rows.
    await PriceCatalogRow.updateOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }, { $set: { usdPerUnitBlock: 21 } });
    await MIGRATIONS.find((m) => m.id === '2026-10-28-price-catalog-v1')!.up();
    expect(await PriceCatalogRow.countDocuments({ version: 'v1' })).toBe(n);
    expect((await PriceCatalogRow.findOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }).lean())!.usdPerUnitBlock).toBe(21);
    const idx = await mongoose.connection.collection('usage_ledger').indexes();
    expect(idx.some((i) => i.key.operationKey === 1 && i.unique)).toBe(true);
  });
});
