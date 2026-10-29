import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { maintenanceToken, stagingMaintenanceRouter } from '../src/routes/stagingMaintenance.routes';

// Temporary staging set-up endpoint: hidden without a long token, answers a
// wrong token exactly like a missing route, and only runs the three actions.

const TOKEN = 'm'.repeat(48);
const deps = () => ({
  pending: vi.fn(async () => [{ id: '2026-10-29-p5-usage-indexes', description: 'x' }]),
  migrate: vi.fn(async () => ['2026-10-29-p5-usage-indexes']),
  seed: vi.fn(async () => ({ institution: 'enara-staging-school', setupLinks: {} })),
  createEnaraAdmin: vi.fn(async () => ({ email: 'enara.admin@x', created: true })),
});
const appWith = (d = deps()) => {
  const app = express();
  app.use(express.json());
  app.use('/api/staging-maintenance', stagingMaintenanceRouter(TOKEN, d));
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  return { app, d };
};

describe('staging maintenance endpoint', () => {
  it('is only enabled by a token of 32+ characters', () => {
    expect(maintenanceToken({})).toBeUndefined();
    expect(maintenanceToken({ STAGING_MAINTENANCE_TOKEN: 'short' })).toBeUndefined();
    expect(maintenanceToken({ STAGING_MAINTENANCE_TOKEN: TOKEN })).toBe(TOKEN);
  });

  it('answers a missing or wrong token exactly like an unknown route, and runs nothing', async () => {
    const { app, d } = appWith();
    const unknown = await request(app).post('/api/nope').send({});
    for (const headers of [{}, { 'x-staging-maintenance-token': 'wrong' }, { 'x-staging-maintenance-token': TOKEN.slice(1) + 'x' }]) {
      const r = await request(app).post('/api/staging-maintenance').set(headers).send({ action: 'migrate' });
      expect(r.status).toBe(404);
      expect(r.body).toEqual(unknown.body);
    }
    expect(d.migrate).not.toHaveBeenCalled();
    expect(d.seed).not.toHaveBeenCalled();
    expect(d.createEnaraAdmin).not.toHaveBeenCalled();
  });

  it('reports status, migrates, and seeds one validated institution', async () => {
    const { app, d } = appWith();
    const call = (body: object) => request(app).post('/api/staging-maintenance').set('x-staging-maintenance-token', TOKEN).send(body);
    expect((await call({ action: 'status' })).body).toEqual({ action: 'status', pending: ['2026-10-29-p5-usage-indexes'] });
    expect((await call({ action: 'migrate' })).body).toEqual({ action: 'migrate', applied: ['2026-10-29-p5-usage-indexes'] });
    expect((await call({ action: 'seed', institution: 'Bad Name!' })).status).toBe(400);
    const seeded = await call({ action: 'seed', institution: 'enara-staging-school' });
    expect(seeded.status).toBe(200);
    expect(d.seed).toHaveBeenCalledWith('enara-staging-school', { emitSetupLinks: false });
    await call({ action: 'seed', institution: 'enara-staging-school', emitSetupLinks: true });
    expect(d.seed).toHaveBeenLastCalledWith('enara-staging-school', { emitSetupLinks: true });
    expect((await call({ action: 'create-enara-admin' })).body).toMatchObject({ action: 'create-enara-admin', created: true });
    expect(d.createEnaraAdmin).toHaveBeenLastCalledWith({ accessToken: false, setupLink: false });
    await call({ action: 'create-enara-admin', accessToken: true, setupLink: 'yes' });
    expect(d.createEnaraAdmin).toHaveBeenLastCalledWith({ accessToken: true, setupLink: false });
    expect((await call({ action: 'drop' })).status).toBe(400);
  });
});

describe('staging ENARA admin creation (in-memory database)', () => {
  it('creates one global enara-admin, reuses it, and never takes over another account', async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongoose = (await import('mongoose')).default;
    const mongo = await MongoMemoryServer.create();
    for (const [k, v] of Object.entries({
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', APP_URL: 'https://staging.example.test',
    })) vi.stubEnv(k, v);
    (await import('../src/config/env')).resetConfigForTests();
    await mongoose.connect(mongo.getUri());
    try {
      const { createStagingEnaraAdmin, STAGING_ENARA_ADMIN_EMAIL } = await import('../src/routes/stagingMaintenance.routes');
      const { User } = await import('../src/models/User');
      const first = await createStagingEnaraAdmin({ accessToken: true, setupLink: true });
      expect(first).toMatchObject({ email: STAGING_ENARA_ADMIN_EMAIL, created: true });
      expect(String(first.accessToken)).toMatch(/^ey/);
      expect(String(first.setupLink)).toMatch(/^https:\/\/staging\.example\.test\/reset-password\?token=/);
      const u = await User.findOne({ email: STAGING_ENARA_ADMIN_EMAIL }).lean();
      expect(u).toMatchObject({ role: 'enara-admin', status: 'active' });
      expect(u!.institutionId).toBeFalsy();
      expect(await createStagingEnaraAdmin({ accessToken: false, setupLink: false })).toEqual({ email: STAGING_ENARA_ADMIN_EMAIL, created: false });
      await User.updateOne({ email: STAGING_ENARA_ADMIN_EMAIL }, { $set: { role: 'teacher', institutionId: 'instA' } });
      await expect(createStagingEnaraAdmin({ accessToken: true, setupLink: false })).rejects.toThrow(/refusing to change existing account/);
      expect(await User.countDocuments({ email: STAGING_ENARA_ADMIN_EMAIL })).toBe(1);
    } finally {
      await mongoose.disconnect();
      await mongo.stop();
    }
  });
});
