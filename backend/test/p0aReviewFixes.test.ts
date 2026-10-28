import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0a review fixes: append-only save/bulkWrite, conflicting idempotent
// retries, price-catalogue drift, and unknown-price reporting. Offline.
let mongo: MongoMemoryServer;
let UsageLedger: typeof import('../src/models/UsageLedger').UsageLedger;
let PriceCatalogRow: typeof import('../src/models/PriceCatalog').PriceCatalogRow;
let ledger: typeof import('../src/services/usageLedger');
let checkPriceCatalogDrift: typeof import('../src/services/priceCatalogDrift').checkPriceCatalogDrift;
let catalogRows: typeof import('../src/services/priceCatalog').catalogRows;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ UsageLedger } = await import('../src/models/UsageLedger'));
  ({ PriceCatalogRow } = await import('../src/models/PriceCatalog'));
  ledger = await import('../src/services/usageLedger');
  ({ checkPriceCatalogDrift } = await import('../src/services/priceCatalogDrift'));
  ({ catalogRows } = await import('../src/services/priceCatalog'));
  await UsageLedger.createIndexes();
  await PriceCatalogRow.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.collection('usage_ledger').deleteMany({});
  await mongoose.connection.collection('price_catalog').deleteMany({});
  await mongoose.connection.collection('ai_calls').deleteMany({});
});

const entry = (over: Record<string, unknown> = {}) => ({
  operationKey: 'req-1:0',
  institutionId: 'instA',
  userId: 'u1',
  requestId: 'r-1',
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

describe('usage ledger append-only: save and bulkWrite', () => {
  it('allows inserting via save but refuses saving a change to an existing row', async () => {
    const doc = new UsageLedger({ ...entry(), id: 'ul-a' });
    await doc.save();
    doc.costInternal = 0;
    await expect(doc.save()).rejects.toThrow(/append-only/);
    const fetched = (await UsageLedger.findOne({ id: 'ul-a' }))!;
    fetched.status = 'error';
    await expect(fetched.save()).rejects.toThrow(/append-only/);
    expect((await UsageLedger.findOne({ id: 'ul-a' }).lean())!).toMatchObject({ costInternal: 0.0108, status: 'ok' });
  });

  it('refuses document deleteOne', async () => {
    const { row } = await ledger.appendUsage(entry());
    await expect(row.deleteOne()).rejects.toThrow(/append-only/);
    expect(await UsageLedger.countDocuments()).toBe(1);
  });

  it('allows insert-only bulkWrite and refuses any bulkWrite that updates, replaces or deletes', async () => {
    await UsageLedger.bulkWrite([{ insertOne: { document: { ...entry(), id: 'ul-b' } } }]);
    expect(await UsageLedger.countDocuments()).toBe(1);
    const bad = [
      { updateOne: { filter: { id: 'ul-b' }, update: { $set: { costInternal: 0 } } } },
      { updateMany: { filter: {}, update: { $set: { costInternal: 0 } } } },
      { replaceOne: { filter: { id: 'ul-b' }, replacement: { ...entry(), id: 'ul-b', costInternal: 0 } } },
      { deleteOne: { filter: { id: 'ul-b' } } },
      { deleteMany: { filter: {} } },
    ];
    for (const op of bad) {
      // A mixed batch is refused as a whole: the insert does not happen either.
      await expect(UsageLedger.bulkWrite([{ insertOne: { document: { ...entry({ operationKey: 'k2' }), id: 'ul-c' } } }, op] as never)).rejects.toThrow(/append-only/);
    }
    expect(await UsageLedger.countDocuments()).toBe(1);
    expect((await UsageLedger.findOne({ id: 'ul-b' }).lean())!.costInternal).toBe(0.0108);
  });
});

describe('usage ledger idempotency conflicts', () => {
  it('returns the existing row for an equivalent retry, ignoring request metadata and defaults', async () => {
    const first = await ledger.appendUsage(entry());
    const again = await ledger.appendUsage(entry({ requestId: 'r-2', attempt: 1, currency: 'USD', origin: 'live', units: { outputTokens: 300, inputTokens: 1200 } }));
    expect(again).toMatchObject({ created: false });
    expect(again.row.id).toBe(first.row.id);
  });

  it('rejects the same key with different billing data, logs it, and keeps the original row', async () => {
    const { logger } = await import('../src/utils/logging');
    const spy = vi.spyOn(logger, 'error');
    await ledger.appendUsage(entry());
    for (const [over, field] of [
      [{ costInternal: 0.5 }, 'costInternal'],
      [{ units: { inputTokens: 1200, outputTokens: 301 } }, 'units'],
      [{ institutionId: 'instB' }, 'institutionId'],
      [{ modelName: 'claude-haiku-5-5' }, 'modelName'],
      [{ status: 'error' }, 'status'],
    ] as const) {
      const err = await ledger.appendUsage(entry(over)).catch((e) => e);
      expect(err).toBeInstanceOf(ledger.UsageLedgerConflictError);
      expect(err.code).toBe('USAGE_LEDGER_CONFLICT');
      expect(err.fields).toEqual([field]);
    }
    expect(spy).toHaveBeenCalledWith('usage_ledger_conflict', expect.objectContaining({ operationKey: 'req-1:0', fields: ['costInternal'] }));
    expect(await UsageLedger.countDocuments()).toBe(1);
    expect((await UsageLedger.findOne().lean())!.costInternal).toBe(0.0108);
    spy.mockRestore();
  });

  it('under concurrent writes: equivalent duplicates make one row; a conflicting one is rejected', async () => {
    const same = await Promise.allSettled(Array.from({ length: 8 }, () => ledger.appendUsage(entry())));
    expect(same.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(same.filter((r) => r.status === 'fulfilled' && r.value.created)).toHaveLength(1);
    const mixed = await Promise.allSettled([ledger.appendUsage(entry({ operationKey: 'k9' })), ledger.appendUsage(entry({ operationKey: 'k9', costInternal: 9 }))]);
    expect(mixed.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(mixed.filter((r) => r.status === 'rejected' && r.reason instanceof ledger.UsageLedgerConflictError)).toHaveLength(1);
    expect(await UsageLedger.countDocuments()).toBe(2);
  });
});

describe('price catalogue drift', () => {
  const seed = () => PriceCatalogRow.insertMany(catalogRows('v1'));

  it('reports no drift when the stored rows match the code', async () => {
    await seed();
    expect(await checkPriceCatalogDrift()).toEqual([]);
  });

  it('reports missing, unexpected and mismatched rows without repairing them', async () => {
    await seed();
    const col = mongoose.connection.collection('price_catalog');
    await col.updateOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }, { $set: { usdPerUnitBlock: 21, source: 'contract' } });
    await col.updateOne({ version: 'v1', modelName: 'claude-sonnet-5-5', unit: 'input_token' }, { $set: { effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    await col.deleteOne({ version: 'v1', modelName: 'claude-haiku-5-5', unit: 'cache_read_token' });
    await col.insertOne({ ...catalogRows('v1')[0], modelName: 'claude-other', createdAt: new Date() });
    const [drift, ...rest] = await checkPriceCatalogDrift();
    expect(rest).toEqual([]);
    expect(drift.version).toBe('v1');
    expect(drift.missing).toEqual(['anthropic/claude-haiku-5-5/cache_read_token']);
    expect(drift.unexpected).toEqual(['anthropic/claude-other/input_token']);
    expect(drift.mismatched).toEqual(
      expect.arrayContaining([
        { key: 'anthropic/claude-opus-5-5/output_token', fields: ['usdPerUnitBlock', 'source'] },
        { key: 'anthropic/claude-sonnet-5-5/input_token', fields: ['effectiveFrom'] },
      ]),
    );
    expect(drift.mismatched).toHaveLength(2);
    // Unchanged in storage.
    expect((await col.findOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }))!.usdPerUnitBlock).toBe(21);
  });

  it('reports an entirely missing version', async () => {
    const [drift] = await checkPriceCatalogDrift();
    expect(drift.missing).toHaveLength(catalogRows('v1').length);
  });

  it('the migration logs drift instead of overwriting it', async () => {
    const { logger } = await import('../src/utils/logging');
    const spy = vi.spyOn(logger, 'warn');
    await seed();
    await mongoose.connection.collection('price_catalog').updateOne({ version: 'v1', modelName: 'claude-opus-5-5', unit: 'output_token' }, { $set: { usdPerUnitBlock: 21 } });
    const { MIGRATIONS } = await import('../src/migrations');
    await MIGRATIONS.find((m) => m.id === '2026-10-28-price-catalog-v1')!.up();
    expect(spy).toHaveBeenCalledWith('price_catalog_drift', expect.objectContaining({ drift: [expect.objectContaining({ mismatched: [{ key: 'anthropic/claude-opus-5-5/output_token', fields: ['usdPerUnitBlock'] }] })] }));
    expect((await PriceCatalogRow.findOne({ modelName: 'claude-opus-5-5', unit: 'output_token' }).lean())!.usdPerUnitBlock).toBe(21);
    spy.mockRestore();
  });
});

describe('unknown-price AI calls are flagged, never shown as free', () => {
  const waitFor = async (n: number) => {
    const { AiCall } = await import('../src/models/AiCall');
    for (let i = 0; i < 50 && (await AiCall.countDocuments()) < n; i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('records costStatus on ai_calls and the usage report counts unpriced calls', async () => {
    const { recordAiCall, isPriced } = await import('../src/services/aiCalls');
    expect(isPriced('claude-opus-5-5-20261001')).toBe(true);
    expect(isPriced('mystery-model')).toBe(false);
    expect(isPriced('anything', 10)).toBe(true);
    recordAiCall({ feature: 'tutor_chat', modelName: 'claude-opus-5-5', status: 'ok', startedAt: Date.now(), usage: { input_tokens: 1000, output_tokens: 100 }, institutionId: 'instA' });
    recordAiCall({ feature: 'tutor_chat', modelName: 'mystery-model', status: 'ok', startedAt: Date.now(), usage: { input_tokens: 1000 }, institutionId: 'instA' });
    await waitFor(2);
    const { AiCall } = await import('../src/models/AiCall');
    const rows = await AiCall.find().sort({ modelName: 1 }).lean();
    expect(rows.map((r) => [r.modelName, r.costStatus, r.costUsd])).toEqual([
      ['claude-opus-5-5', 'estimated', 0.006],
      ['mystery-model', 'unpriced', 0],
    ]);

    const { getAiUsage } = await import('../src/controllers/analytics.controller');
    const res = { json: vi.fn() };
    await new Promise<void>((resolve, reject) => {
      res.json.mockImplementation(() => resolve());
      getAiUsage({ query: {}, user: { role: 'enara-admin' } } as never, res as never, reject);
    });
    const body = res.json.mock.calls[0][0];
    expect(body.costIsComplete).toBe(false);
    expect(body.totals).toMatchObject({ calls: 2, unpricedCalls: 1, costUsd: 0.006 });
    expect(body.byFeature.find((g: { model: string }) => g.model === 'mystery-model')).toMatchObject({ unpricedCalls: 1, costUsd: 0 });
    expect(body.byFeature.find((g: { model: string }) => g.model === 'claude-opus-5-5')).toMatchObject({ unpricedCalls: 0 });
  });
});
