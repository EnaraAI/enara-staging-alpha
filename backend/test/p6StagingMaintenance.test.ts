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
    expect((await call({ action: 'drop' })).status).toBe(400);
  });
});
