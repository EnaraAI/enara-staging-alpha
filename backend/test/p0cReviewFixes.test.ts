import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P0c review fixes: avatar sessions are never deleted before they are metered,
// heartbeats are connection evidence (not billing records), the source
// provenance manifest, and the candidateV2Live exemption. Offline.
import { UsageLedger } from '../src/models/UsageLedger';
import { AvatarSession } from '../src/models/AvatarSession';
import { AVATAR_RETENTION_AFTER_FINALIZE_MS, AVATAR_STALE_MS, finalizeAvatarUsage, sweepAvatarUsage } from '../src/services/avatarUsage';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await UsageLedger.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  for (const c of ['usage_ledger', 'avatarsessions']) await mongoose.connection.collection(c).deleteMany({});
  vi.restoreAllMocks();
});

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-10-28T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
async function session(id: string, over: Record<string, unknown> = {}) {
  await AvatarSession.create({ id, userId: 'u1', studentId: 's1', institutionId: 'instA', role: 'student', language: 'english', avatarId: 'face-1', lastActivityAt: T0, ...over });
  await AvatarSession.collection.updateOne({ id }, { $set: { createdAt: T0 } });
}
const endCall = (id: string, when: Date) => AvatarSession.updateOne({ id, endedAt: null }, { endedAt: when });
const get = (id: string) => AvatarSession.findOne({ id }).lean();

describe('avatar session retention', () => {
  it('has no createdAt TTL; deletion keys only off retentionExpiresAt', async () => {
    await AvatarSession.createIndexes();
    const indexes = await AvatarSession.collection.indexes();
    expect(indexes.some((i) => i.key.createdAt === 1 && i.expireAfterSeconds !== undefined)).toBe(false);
    expect(indexes.find((i) => i.key.retentionExpiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('an unfinalized session older than 24 h has no expiry and stays sweep-eligible', async () => {
    await session('av-old', { lastActivityAt: at(30) });
    expect((await get('av-old'))!.retentionExpiresAt).toBeUndefined();
    const now = new Date(T0.getTime() + 25 * HOUR);
    const ledger = await import('../src/services/usageLedger');
    vi.spyOn(ledger, 'appendUsage').mockRejectedValue(new Error('db down'));
    expect(await sweepAvatarUsage({ now })).toEqual({ due: 1, finalized: 0 });
    vi.restoreAllMocks();
    expect((await get('av-old'))!.retentionExpiresAt).toBeUndefined();
    expect(await sweepAvatarUsage({ now })).toEqual({ due: 1, finalized: 1 });
  });

  it('a failed ledger append never sets retention', async () => {
    await session('av-f');
    await endCall('av-f', at(5));
    const ledger = await import('../src/services/usageLedger');
    vi.spyOn(ledger, 'appendUsage').mockRejectedValue(new Error('db down'));
    expect(await finalizeAvatarUsage('av-f')).toBe(false);
    const s = (await get('av-f'))!;
    expect(s.usageFinalizedAt).toBeUndefined();
    expect(s.retentionExpiresAt).toBeUndefined();
  });

  it('finalization sets expiry seven days after the finalization time, not the creation time', async () => {
    await session('av-ok');
    await endCall('av-ok', at(5));
    await finalizeAvatarUsage('av-ok');
    const s = (await get('av-ok'))!;
    expect(AVATAR_RETENTION_AFTER_FINALIZE_MS).toBe(7 * 24 * HOUR);
    expect(s.retentionExpiresAt!.getTime() - s.usageFinalizedAt!.getTime()).toBe(AVATAR_RETENTION_AFTER_FINALIZE_MS);
    expect(s.retentionExpiresAt!.getTime()).not.toBe(T0.getTime() + AVATAR_RETENTION_AFTER_FINALIZE_MS);
    // Repeating finalization keeps the first expiry.
    await finalizeAvatarUsage('av-ok');
    expect((await get('av-ok'))!.retentionExpiresAt).toEqual(s.retentionExpiresAt);
  });

  it('a crash between the append and finalization completes on retry with one ledger row', async () => {
    await session('av-c');
    await endCall('av-c', at(8));
    await finalizeAvatarUsage('av-c');
    // Simulate the crash: ledger row stored, session not yet marked.
    await AvatarSession.updateOne({ id: 'av-c' }, { $unset: { usageFinalizedAt: 1, retentionExpiresAt: 1 } });
    expect(await sweepAvatarUsage({})).toMatchObject({ finalized: 1 });
    const s = (await get('av-c'))!;
    expect(s.usageFinalizedAt).toBeInstanceOf(Date);
    expect(s.retentionExpiresAt!.getTime() - s.usageFinalizedAt!.getTime()).toBe(AVATAR_RETENTION_AFTER_FINALIZE_MS);
    expect(await UsageLedger.countDocuments({ operationKey: 'avatar:av-c' })).toBe(1);
  });

  it('a session finalized before this fix (no expiry) gets its expiry from the sweep', async () => {
    await session('av-legacy', { usageFinalizedAt: at(20), endedAt: at(10) });
    expect(await sweepAvatarUsage({})).toMatchObject({ due: 1, finalized: 1 });
    expect((await get('av-legacy'))!.retentionExpiresAt).toEqual(new Date(at(20).getTime() + AVATAR_RETENTION_AFTER_FINALIZE_MS));
    expect(await UsageLedger.countDocuments()).toBe(0); // no new charge for it
  });

  it('concurrent closes and sweeps: one charge, one expiry', async () => {
    await session('av-r', { lastActivityAt: at(2) });
    await endCall('av-r', at(9));
    const now = at(200);
    await Promise.all([finalizeAvatarUsage('av-r', now), finalizeAvatarUsage('av-r', now), sweepAvatarUsage({ now }), sweepAvatarUsage({ now })]);
    expect(await UsageLedger.countDocuments()).toBe(1);
    const s = (await get('av-r'))!;
    expect(s.retentionExpiresAt!.getTime() - s.usageFinalizedAt!.getTime()).toBe(AVATAR_RETENTION_AFTER_FINALIZE_MS);
  });
});

describe('migration 2026-10-29-avatar-session-retention', () => {
  it('drops only the old createdAt TTL, keeps other indexes, and installs the retention TTL', async () => {
    await AvatarSession.collection.dropIndexes().catch(() => undefined);
    await AvatarSession.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
    await AvatarSession.collection.createIndex({ userId: 1 });
    await AvatarSession.collection.createIndex({ createdAt: 1, userId: 1 }); // not a TTL: must stay
    const { MIGRATIONS } = await import('../src/migrations');
    const m = MIGRATIONS.find((x) => x.id === '2026-10-29-avatar-session-retention')!;
    // Appended after the price catalogue migration (later ones may follow it).
    const ids = MIGRATIONS.map((x) => x.id);
    expect(ids.indexOf(m.id)).toBeGreaterThan(ids.indexOf('2026-10-28-price-catalog-v1'));
    await m.up();
    await m.up(); // idempotent
    const indexes = await AvatarSession.collection.indexes();
    expect(indexes.some((i) => Object.keys(i.key).length === 1 && i.key.createdAt === 1)).toBe(false);
    expect(indexes.some((i) => i.key.userId === 1 && Object.keys(i.key).length === 1)).toBe(true);
    expect(indexes.some((i) => i.key.createdAt === 1 && i.key.userId === 1)).toBe(true);
    expect(indexes.find((i) => i.key.retentionExpiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
  });
});

describe('avatar duration evidence', () => {
  const heartbeat = async (id: string, body: Record<string, unknown>) => {
    const { avatarHeartbeat } = await import('../src/controllers/avatar.controller');
    const res = { status: vi.fn().mockReturnThis(), end: vi.fn() };
    await new Promise<void>((resolve, reject) => {
      res.end.mockImplementation(() => resolve());
      avatarHeartbeat({ params: { id }, body, user: { id: 'u1' } } as never, res as never, reject);
    });
    return res;
  };

  it('a heartbeat records connection evidence and the Anam session id, nothing else', async () => {
    await session('av-h', { lastActivityAt: new Date(Date.now() - 5 * 60_000) });
    const res = await heartbeat('av-h', { provider_session_id: 'anam-sess_123', transcript: 'should not be stored' });
    expect(res.status).toHaveBeenCalledWith(204);
    const s = (await get('av-h'))!;
    expect(s.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(Date.now() - s.lastActivityAt!.getTime()).toBeLessThan(5000);
    expect(s.providerSessionIds).toEqual(['anam-sess_123']);
    expect(JSON.stringify(s)).not.toContain('should not be stored');
    await heartbeat('av-h', { provider_session_id: '../../bad id' });
    expect((await get('av-h'))!.providerSessionIds).toEqual(['anam-sess_123']);
  });

  it('a heartbeat for an ended call is refused (404), so it cannot extend metered time', async () => {
    await session('av-e', { endedAt: at(3) });
    const { avatarHeartbeat } = await import('../src/controllers/avatar.controller');
    const err = await new Promise((resolve) => avatarHeartbeat({ params: { id: 'av-e' }, body: {}, user: { id: 'u1' } } as never, { status: vi.fn() } as never, resolve));
    expect(err).toMatchObject({ statusCode: 404 });
  });

  it('normal end is server-measured; lost heartbeats give an inferred lower bound, never relabelled as measured', async () => {
    await session('av-n', { lastActivityAt: at(14) });
    await endCall('av-n', at(15));
    await session('av-lost', { lastActivityAt: at(14), lastHeartbeatAt: at(14) });
    await sweepAvatarUsage({ now: at(14 + 61) });
    const rows = await UsageLedger.find().sort({ operationKey: 1 }).lean();
    expect(rows.map((r) => [r.operationKey, r.units?.avatarSeconds, r.unitsBasis, r.costStatus])).toEqual([
      ['avatar:av-lost', 840, 'inferred_from_activity', 'unpriced'],
      ['avatar:av-n', 900, 'server_measured', 'unpriced'],
    ]);
  });

  it('a long pause shorter than the idle threshold is not cut off', async () => {
    await session('av-p', { lastActivityAt: at(0) });
    expect(await finalizeAvatarUsage('av-p', new Date(T0.getTime() + AVATAR_STALE_MS - 60_000))).toBe(false);
    expect(await UsageLedger.countDocuments()).toBe(0);
  });
});

describe('source provenance manifest', () => {
  const repo = path.resolve(__dirname, '../..');
  const read = (rel: string) => JSON.parse(readFileSync(path.join(repo, rel), 'utf8'));

  it('keeps the V1 baseline untouched and records the current working-tree hashes separately', async () => {
    const { OUT_PATH, BASELINE_PATH, sha256, buildProvenance } = await import('../src/scripts/sourceProvenance');
    const m = read(OUT_PATH);
    expect(m.baseline_manifest).toEqual({ path: BASELINE_PATH, sha256: '5db3622cf66ba05648c2e8a206aba975683affd618d8af6bcef94d40bad742b8' });
    expect(sha256(BASELINE_PATH)).toBe(m.baseline_manifest.sha256);
    expect(m.commit_sha).toBeNull();
    expect(m.note).toMatch(/uncommitted working tree/);
    const baseline = read(BASELINE_PATH);
    for (const [file, v] of Object.entries<{ baseline_sha256: string; current_sha256: string; changed_since_baseline: boolean }>(m.production_sources)) {
      const name = file.replace('backend/src/services/', '');
      expect(v.baseline_sha256).toBe(baseline.evalv2.production_sources_sha256[name] ?? baseline.evalv2.harness_sha256);
      expect(v.current_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.changed_since_baseline).toBe(v.current_sha256 !== v.baseline_sha256);
    }
    // The metering changes are visible, not hidden.
    expect(m.production_sources['backend/src/services/aiCalls.ts'].changed_since_baseline).toBe(true);
    // Frozen artifacts: recorded unchanged, and still unchanged on disk now.
    for (const [file, v] of Object.entries<{ baseline_sha256: string; current_sha256: string; unchanged: boolean }>(m.frozen_artifacts.hybridV1)) {
      expect(v).toMatchObject({ unchanged: true, current_sha256: baseline.new_files_sha256[file] });
      expect(sha256(file)).toBe(v.baseline_sha256);
    }
    expect(m.frozen_artifacts.candidateV2Live['backend/src/services/candidateV2Live/promptProvider.ts'].unchanged).toBe(true);
    // The frozen section regenerates identically.
    expect(buildProvenance().frozen_artifacts).toEqual(m.frozen_artifacts);
  });
});

describe('candidateV2Live exemption', () => {
  it('is imported only by offline scripts, never by production runtime code', () => {
    const src = path.resolve(__dirname, '../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (!['scripts', 'candidateV2Live'].includes(name)) walk(full);
        } else if (/\.ts$/.test(name) && /candidateV2Live/.test(readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(src, full));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
