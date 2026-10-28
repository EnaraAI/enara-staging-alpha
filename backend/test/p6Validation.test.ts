import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P6 integrated-alpha checks that no earlier suite covers on its own: every
// P0-P5 migration on a fresh disposable in-memory database (order,
// idempotency, no unrelated index or data dropped), all new features off by
// default, and provenance snapshots never overwritten. No providers, no
// network.

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  await mongoose.connect(mongo.getUri());
}, 60_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('migrations', () => {
  it('ids are unique and dated in order; all run once on a fresh DB, then nothing is pending', async () => {
    const { MIGRATIONS } = await import('../src/migrations');
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Run in array order; dates never go backwards.
    const dates = ids.map((i) => i.slice(0, 10));
    expect([...dates].sort()).toEqual(dates);
    for (const id of ['2026-10-29-p0d-budget-indexes', '2026-10-29-p1-account-token-indexes', '2026-10-29-p2-document-indexes', '2026-10-29-p3-educator-chat-indexes', '2026-10-29-p5-usage-indexes', '2026-10-29-avatar-session-retention']) {
      expect(ids).toContain(id);
    }
    // Existing data and an unrelated index that must survive.
    const db = mongoose.connection.db!;
    await db.collection('usage_ledger').insertOne({ id: 'pre-1', operationKey: 'pre-1', feature: 'chat', provider: 'anthropic', modelName: 'm', status: 'ok', priceCatalogVersion: 'v1', costStatus: 'measured', createdAt: new Date() });
    await db.collection('assignments').createIndex({ title: 1 }, { name: 'custom_unrelated_index' });
    await db.collection('assignments').insertOne({ id: 'a-pre', title: 'kept' });
    const { runMigrations, pendingMigrations } = await import('../src/migrations/runner');
    const applied = await runMigrations(MIGRATIONS);
    expect(applied).toEqual(ids);
    expect(await pendingMigrations(MIGRATIONS)).toEqual([]);
    expect(await runMigrations(MIGRATIONS)).toEqual([]);
    // Each one is safe to re-run (as after a crash between up() and the record).
    for (const m of MIGRATIONS) await m.up();
    expect(await db.collection('usage_ledger').countDocuments({ id: 'pre-1' })).toBe(1);
    expect(await db.collection('assignments').countDocuments({ id: 'a-pre' })).toBe(1);
    expect((await db.collection('assignments').indexes()).map((i) => i.name)).toContain('custom_unrelated_index');
    const ledgerIdx = (await db.collection('usage_ledger').indexes()).map((i) => i.name);
    expect(ledgerIdx).toEqual(expect.arrayContaining(['operationKey_1', 'requestId_1_userId_1']));
  }, 60_000);
});

describe('defaults', () => {
  it('every phase flag is off for a new institution', async () => {
    const { Institution } = await import('../src/models/Institution');
    await Institution.create({ id: 'fresh', name: 'Fresh' });
    const { getFeatureFlags, forgetFeatureFlags } = await import('../src/services/featureFlags');
    forgetFeatureFlags();
    const flags = await getFeatureFlags('fresh');
    for (const f of ['documents_workspace_enabled', 'educator_chat_enabled', 'connected_workflow_enabled', 'speaking_exams_enabled', 'speaking_exam_avatar_enabled', 'teaching_workflow_enabled', 'ai_grading_enabled']) {
      expect(flags[f as keyof typeof flags], f).toBe(false);
    }
  });

  it('no malware scanner and no avatar exam layer are configured outside tests', async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { getMalwareScanner } = await import('../src/services/malwareScan');
      expect(getMalwareScanner()).toBeNull();
    } finally {
      process.env.NODE_ENV = env;
    }
    const { avatarExamAvailable } = await import('../src/services/speakingExam');
    expect((await avatarExamAvailable('fresh')).available).toBe(false);
  });
});

describe('provenance snapshots', () => {
  it('an existing snapshot is never overwritten', () => {
    const repo = path.resolve(__dirname, '../..');
    const prior = 'docs/benchmarks/diagnostics/20261029T180000Z-p5-source-provenance/SOURCE_PROVENANCE_POST_P5.json';
    if (!fs.existsSync(path.join(repo, prior))) return;
    const before = fs.readFileSync(path.join(repo, prior));
    expect(() => execFileSync('npx', ['tsx', 'src/scripts/sourceProvenance.ts', '--phase', 'X', '--out', prior], { cwd: path.join(repo, 'backend'), stdio: 'pipe' })).toThrow();
    expect(fs.readFileSync(path.join(repo, prior)).equals(before)).toBe(true);
  }, 60_000);
});
