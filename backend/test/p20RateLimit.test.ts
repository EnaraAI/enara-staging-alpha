import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// P19-1 / P20: the general /api limit is per verified user (300/min), so a class
// behind one school IP no longer shares one budget. Forged or invalid tokens never
// get their own bucket (they fall back to the IP), and a coarse per-IP ceiling
// (3000/min) still bounds one address. No AI provider is involved: the requests
// go to an unknown /api path, which the limiters see before routing (404).

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let bearer: (id: string) => string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: '1', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const { signAccessToken } = await import('../src/auth/jwt');
  bearer = (id: string) => `Bearer ${signAccessToken({ id, email: `${id}@rl.test`, role: 'student', institutionId: 'rl', studentId: id } as never)}`;
  app = (await import('../src/app')).createApp();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const hit = (ip: string, auth?: string) => {
  let r = request(app).get('/api/p20-rate-limit-probe').set('X-Forwarded-For', ip);
  if (auth) r = r.set('Authorization', auth);
  return r;
};
async function burst(n: number, ip: string, auth: (i: number) => string | undefined) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i += 50) statuses.push(...(await Promise.all(Array.from({ length: Math.min(50, n - i) }, (_, j) => hit(ip, auth(i + j)).then((r) => r.status)))));
  return statuses;
}
const reset = () => mongoose.connection.collection('rate_limits').deleteMany({});

describe('P19-1 per-user API limit (no AI involved)', () => {
  it('two students on the same school IP each get their own 300/min budget', async () => {
    await reset();
    const a = await burst(301, '203.0.113.7', () => bearer('stu-a'));
    expect(a.slice(0, 300).every((s) => s !== 429), 'first 300 of user A pass').toBe(true);
    expect(a[300], "user A's 301st is limited").toBe(429);
    const b = await burst(50, '203.0.113.7', () => bearer('stu-b'));
    expect(b.every((s) => s !== 429), 'user B on the same IP is unaffected').toBe(true);
  }, 60_000);

  it('forged or invalid tokens cannot create new buckets: they share the IP budget', async () => {
    await reset();
    const s = await burst(320, '203.0.113.8', (i) => `Bearer forged-token-${i}`);
    expect(s.filter((x) => x === 429).length, 'requests beyond 300 from the IP are limited').toBeGreaterThanOrEqual(20);
  }, 60_000);

  it('unauthenticated traffic stays per IP', async () => {
    await reset();
    const s = await burst(305, '203.0.113.9', () => undefined);
    expect(s.filter((x) => x === 429).length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('one address is still bounded: 11 valid users x 280 from one IP hit the 3000/min ceiling', async () => {
    await reset();
    const statuses = await burst(3080, '203.0.113.10', (i) => bearer(`stu-${i % 11}`));
    const limited = statuses.filter((x) => x === 429).length;
    expect(limited, 'the per-IP ceiling refuses the overflow').toBeGreaterThanOrEqual(80);
    expect(limited).toBeLessThan(200);
  }, 180_000);
});
