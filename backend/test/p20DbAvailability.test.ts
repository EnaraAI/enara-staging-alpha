import http from 'http';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// P20: 100 students starting at the same instant made every instance grow its
// MongoDB pool towards Atlas, which refused the connections; requests then waited
// on the database until the 60 s function limit (504). These tests use a real
// local MongoDB that is stopped mid-test. No AI provider is involved.

const ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: '1', SERVE_LOCAL_UPLOADS: 'false',
  MONGO_SERVER_SELECTION_TIMEOUT_MS: '1500',
};
let mongo: MongoMemoryServer;
let envMod: typeof import('../src/config/env');
let avail: typeof import('../src/config/dbAvailability');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'MONGO_MAX_POOL_SIZE']) delete process.env[k];
  envMod = await import('../src/config/env');
  avail = await import('../src/config/dbAvailability');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect().catch(() => undefined);
  await mongo.stop().catch(() => undefined);
});

beforeEach(() => avail.resetDbAvailabilityForTests());

describe('P20 bounded MongoDB pool per instance', () => {
  it('defaults to 10 connections per instance (driver default is 100), configurable, and bounded', async () => {
    const { openMongo } = await import('../src/config/db');
    envMod.resetConfigForTests();
    await openMongo();
    const opts = mongoose.connection.getClient().options;
    expect(opts.maxPoolSize).toBe(10);
    expect(opts.minPoolSize).toBe(0);
    expect(opts.maxConnecting).toBe(2);
    expect(opts.serverSelectionTimeoutMS).toBe(1500);
    expect(opts.waitQueueTimeoutMS).toBe(1500);
    expect(mongoose.get('bufferTimeoutMS')).toBe(1500);
    await mongoose.disconnect();

    process.env.MONGO_MAX_POOL_SIZE = '4';
    envMod.resetConfigForTests();
    await openMongo();
    expect(mongoose.connection.getClient().options.maxPoolSize).toBe(4);
    await mongoose.disconnect();

    for (const bad of ['0', '101', 'ten']) {
      process.env.MONGO_MAX_POOL_SIZE = bad;
      envMod.resetConfigForTests();
      expect(() => envMod.getConfig(), bad).toThrow(/MONGO_MAX_POOL_SIZE/);
    }
    delete process.env.MONGO_MAX_POOL_SIZE;
    envMod.resetConfigForTests();
  }, 60_000);
});

describe('P20 fail fast and retryable when the database is unreachable', () => {
  it('recognises driver and mongoose unavailability errors, and nothing else', () => {
    const err = (name: string, message = 'x') => Object.assign(new Error(message), { name });
    for (const n of ['MongoServerSelectionError', 'MongoNetworkError', 'MongoPoolClearedError', 'MongoWaitQueueTimeoutError']) expect(avail.isDbUnavailableError(err(n)), n).toBe(true);
    expect(avail.isDbUnavailableError(err('MongooseError', 'Operation `users.findOne()` buffering timed out after 1500ms'))).toBe(true);
    for (const e of [err('MongooseError', 'Cast failed'), err('ValidationError'), err('MongoServerError', 'E11000 duplicate key'), new Error('boom'), null]) expect(avail.isDbUnavailableError(e)).toBe(false);
  });

  it('an outage gives 503 + Retry-After within seconds (not 60 s), then answers at once; /health stays up; it recovers', async () => {
    const { openMongo } = await import('../src/config/db');
    envMod.resetConfigForTests();
    await openMongo();
    const app = (await import('../src/app')).createApp();
    const login = () => request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.20').send({ email: 'nobody@p20.test', password: 'not-a-real-password' });

    expect((await login()).status, 'database up: a normal answer').toBe(401);

    await mongo.stop({ doCleanup: false, force: false });
    let t = Date.now();
    const first = await login();
    const firstMs = Date.now() - t;
    expect(first.status).toBe(503);
    expect(first.headers['retry-after']).toBe(String(avail.DB_RETRY_AFTER_SECONDS));
    expect(first.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(first.body)).not.toMatch(/Mongo|mongodb:|127\.0\.0\.1/);
    expect(firstMs, `first request failed in ${firstMs} ms`).toBeLessThan(8_000);

    t = Date.now();
    const burst = await Promise.all(Array.from({ length: 20 }, () => login()));
    const burstMs = Date.now() - t;
    expect(burst.every((r) => r.status === 503 && r.headers['retry-after'] === '5'), 'later requests answered without waiting').toBe(true);
    expect(burstMs, `20 requests in ${burstMs} ms`).toBeLessThan(1_000);
    console.log(`P20_OUTAGE first=${firstMs}ms burst20=${burstMs}ms`);

    const health = await request(app).get('/health');
    expect(health.status, '/health never touches the database').toBe(200);

    await mongo.start(true);
    avail.resetDbAvailabilityForTests(); // the cool-down (5 s) has passed
    let back = 0;
    for (let i = 0; i < 20 && back !== 401; i++) {
      back = (await login()).status;
      if (back !== 401) { avail.resetDbAvailabilityForTests(); await new Promise((r) => setTimeout(r, 500)); }
    }
    expect(back, 'database back: normal answers again').toBe(401);
  }, 120_000);
});

describe('P20 serverless entry: a failed first connection is a quick 503, not a crash or a hang', () => {
  const serve = async (handler: (req: http.IncomingMessage, res: http.ServerResponse) => unknown) => request(http.createServer((q, s) => { void handler(q, s); }));

  it('answers 503 with Retry-After, does not reconnect during the cool-down, and serves once connected', async () => {
    const { serverlessHandler } = await import('../src/serverlessHandler');
    let connects = 0; let fail = true;
    const connect = async () => { connects += 1; if (fail) throw Object.assign(new Error('tlsv1 alert internal error'), { name: 'MongoServerSelectionError' }); };
    const app = (_q: http.IncomingMessage, s: http.ServerResponse) => { s.statusCode = 200; s.end('ok'); };
    const handler = serverlessHandler(app, connect);

    const r1 = await (await serve(handler)).get('/api/me/dashboard');
    expect(r1.status).toBe(503);
    expect(r1.headers['retry-after']).toBe('5');
    expect(r1.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(r1.body)).not.toMatch(/tlsv1|Mongo/);
    const r2 = await (await serve(handler)).get('/api/me/courses');
    expect(r2.status).toBe(503);
    expect(connects, 'no reconnect storm during the cool-down').toBe(1);

    avail.resetDbAvailabilityForTests(); fail = false;
    const r3 = await (await serve(handler)).get('/api/me/dashboard');
    expect(r3.status).toBe(200);
    expect(connects).toBe(2);
    await (await serve(handler)).get('/api/me/dashboard');
    expect(connects, 'connects once per warm instance').toBe(2);
  });
});

describe('P20 rerun: a full pool is a 503 for that request only, not a 5 s outage for the instance', () => {
  it('a wait-queue timeout answers 503 + Retry-After without blocking other requests; an unreachable database still does', async () => {
    const express = (await import('express')).default;
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const app = express();
    app.use(avail.dbAvailabilityGate);
    app.get('/api/pool-busy', () => { throw Object.assign(new Error('Timed out while checking out a connection from connection pool'), { name: 'MongoWaitQueueTimeoutError' }); });
    app.get('/api/down', () => { throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'MongoServerSelectionError' }); });
    app.get('/api/ok', (_q, s) => { s.json({ ok: true }); });
    app.use(errorHandler);

    expect(avail.isDbDownError(Object.assign(new Error(), { name: 'MongoWaitQueueTimeoutError' }))).toBe(false);
    const busy = await request(app).get('/api/pool-busy');
    expect(busy.status).toBe(503);
    expect(busy.headers['retry-after']).toBe('5');
    expect(avail.dbUnavailable(), 'a full pool does not mark the database down').toBe(false);
    expect((await request(app).get('/api/ok')).status, 'the next request is served').toBe(200);

    expect((await request(app).get('/api/down')).status).toBe(503);
    expect(avail.dbUnavailable(), 'an unreachable database does').toBe(true);
    expect((await request(app).get('/api/ok')).status, 'then answered at once during the cool-down').toBe(503);
  });
});

describe('P20 run 3: a database error during a credit reservation is a 503, not "credit limit exceeded"', () => {
  it('maps database errors to 503 and real credit refusals to 402', async () => {
    const express = (await import('express')).default;
    const { creditReservationError, errorHandler } = await import('../src/middleware/errorHandler');
    const app = express();
    app.get('/api/reserve-db-down', () => { throw creditReservationError(Object.assign(new Error('Connection pool was cleared'), { name: 'MongoPoolClearedError' })); });
    app.get('/api/reserve-limit', () => { throw creditReservationError(new Error('Credit limit reached')); });
    app.use(errorHandler);
    const down = await request(app).get('/api/reserve-db-down');
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(down.headers['retry-after']).toBe('5');
    const limit = await request(app).get('/api/reserve-limit');
    expect(limit.status).toBe(402);
    expect(limit.body.error.code).toBe('CREDIT_LIMIT_EXCEEDED');
    expect(limit.body.error.message).toBe('Credit limit reached');
  });

  it('every credit reservation in the AI controllers goes through that mapping', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(__dirname, '..', 'src', 'controllers');
    const direct = fs.readdirSync(dir).filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes("402, 'CREDIT_LIMIT_EXCEEDED'"));
    expect(direct, 'controllers that still turn any reservation error into 402').toEqual([]);
    for (const f of ['tutor.controller.ts', 'meAssessment.controller.ts', 'avatar.controller.ts']) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).toContain('creditReservationError(err)');
    }
  });
});

describe('P20 fix 1: GET deadline', () => {
  async function appWith(deadlineMs: number) {
    const express = (await import('express')).default;
    const { requestContext } = await import('../src/middleware/requestContext');
    const { requestDeadline } = await import('../src/middleware/requestDeadline');
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const { getCallContext, runWithCallContext } = await import('../src/utils/callContext');
    const late: string[] = [];
    const app = express();
    app.use(requestContext);
    app.use(requestDeadline(deadlineMs));
    // like auth: a fresh context object for the rest of the request
    app.use((_q, _s, next) => runWithCallContext({ ...getCallContext(), userId: 'u1' }, next));
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    app.get('/api/slow', async (_q, s, next) => { try { await wait(300); s.json({ ok: true }); late.push('slow answered'); } catch (e) { next(e); } });
    app.get('/api/slow-throws', async (_q, _s, next) => { await wait(300); late.push('throws'); next(new Error('late failure')); });
    app.get('/api/fast', (_q, s) => { s.json({ ok: true }); });
    app.post('/api/slow-write', async (_q, s) => { await wait(300); s.status(201).json({ ok: true }); });
    app.get('/api/slow-ai', async (_q, s) => { const sh = getCallContext().request; if (sh) sh.aiStarted = true; await wait(300); s.json({ ai: true }); });
    app.get('/api/stream', async (_q, s) => { s.setHeader('Content-Type', 'text/event-stream'); s.write('data: 1\n\n'); await wait(300); s.end('data: 2\n\n'); });
    app.get('/health', async (_q, s) => { await wait(300); s.json({ ok: true }); });
    app.use(errorHandler);
    return { app, late };
  }

  it('a slow GET answers 503 + Retry-After at the deadline; the late answer is dropped without a crash', async () => {
    const { app, late } = await appWith(100);
    const t = Date.now();
    const r = await request(app).get('/api/slow');
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('5');
    expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(Date.now() - t).toBeLessThan(290);
    const e = await request(app).get('/api/slow-throws');
    expect(e.status).toBe(503);
    await new Promise((res) => setTimeout(res, 400));
    expect(late).toEqual(['slow answered', 'throws']);
    expect(avail.dbUnavailable(), 'a slow request does not mark the database down').toBe(false);
  });

  it('fast GETs, writes, GETs with an AI call under way, streams already started and /health are never cut', async () => {
    const { app } = await appWith(100);
    expect((await request(app).get('/api/fast')).status).toBe(200);
    expect((await request(app).post('/api/slow-write')).status, 'writes keep the platform limit').toBe(201);
    const ai = await request(app).get('/api/slow-ai');
    expect(ai.status, 'an AI call under way is not cut off').toBe(200);
    expect(ai.body).toEqual({ ai: true });
    const st = await request(app).get('/api/stream');
    expect(st.status).toBe(200);
    expect(st.text).toContain('data: 2');
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('the deadline is configurable and bounded (default 25 s)', () => {
    envMod.resetConfigForTests();
    expect(envMod.getConfig().requestDeadlineMs).toBe(25_000);
    for (const bad of ['500', '60000']) {
      process.env.REQUEST_DEADLINE_MS = bad; envMod.resetConfigForTests();
      expect(() => envMod.getConfig(), bad).toThrow(/REQUEST_DEADLINE_MS/);
    }
    delete process.env.REQUEST_DEADLINE_MS; envMod.resetConfigForTests();
  });
});
