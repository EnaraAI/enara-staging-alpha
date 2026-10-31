import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The API docs list every route the server has (hand-written details where
// they exist), at /api/docs (reachable on Vercel) and /api-docs.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const PASS = 'docs-test-password';
const basic = (p: string) => 'Basic ' + Buffer.from('anyone:' + p).toString('base64');
const getDocs = (url: string) => request(app).get(url).set('Authorization', basic(PASS));

describe('API docs password', () => {
  it('asks for the password, refuses a wrong one, accepts the right one', async () => {
    process.env.API_DOCS_PASSWORD = PASS;
    for (const url of ['/api/docs/ui', '/api/docs.json', '/api-docs/', '/api-docs.json', '/api/docs/swagger-ui-init.js']) {
      const none = await request(app).get(url);
      expect(none.status).toBe(401);
      expect(none.headers['www-authenticate']).toContain('Basic');
      expect((await request(app).get(url).set('Authorization', basic('wrong'))).status).toBe(401);
      expect((await getDocs(url)).status).toBe(200);
    }
  });
  it('is closed on a production server with no password set', async () => {
    delete process.env.API_DOCS_PASSWORD;
    process.env.NODE_ENV = 'production';
    try { expect((await request(app).get('/api/docs/ui')).status).toBe(404); } finally { process.env.NODE_ENV = 'test'; process.env.API_DOCS_PASSWORD = PASS; }
  });
});

describe('API docs', () => {
  it('lists every mounted route, keeping the hand-written ones', async () => {
    const r = await getDocs('/api/docs.json');
    expect(r.status).toBe(200);
    const paths = r.body.paths as Record<string, Record<string, any>>;
    expect(paths['/api/auth/login'].post.summary).not.toMatch(/^POST /); // hand-written kept
    expect(paths['/api/teaching/features'].get).toBeTruthy(); // listed from the server
    expect(paths['/api/lesson-plans/{id}/sections/{sectionId}/regenerate'].post.parameters.map((p: any) => p.name)).toEqual(['id', 'sectionId']);
    expect(paths['/api/teaching/features'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(paths).length).toBeGreaterThan(150);
    expect(Object.keys(paths).some((p) => p.includes(':') || p.includes('(?'))).toBe(false);
    console.log('paths:', Object.keys(paths).length, 'operations:', Object.values(paths).reduce((n, i) => n + Object.keys(i).length, 0));
  });
  it('serves the Swagger UI at both addresses', async () => {
    const go = await getDocs('/api/docs');
    expect(go.status).toBe(302);
    expect(go.headers.location).toBe('/api/docs/ui');
    for (const base of ['/api/docs/', '/api-docs/']) {
      const ui = await getDocs(base + 'ui');
      expect(ui.status).toBe(200);
      expect(ui.text).toContain('swagger-ui');
      const html = await getDocs(base);
      expect(html.status).toBe(200);
      expect(html.text).toContain('swagger-ui');
      const init = await getDocs(base + 'swagger-ui-init.js');
      expect(init.status).toBe(200);
      expect(init.text).toContain('/api/teaching/features');
    }
  });
});
