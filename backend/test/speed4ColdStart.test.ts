// lms-speed-4: a fresh serverless instance answers /health without waiting for the database connection.
import http from 'http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { serverlessHandler } from '../src/serverlessHandler';

const serve = (handler: (req: http.IncomingMessage, res: http.ServerResponse) => unknown) => request(http.createServer((q, s) => { void handler(q, s); }));

describe('lms-speed-4 serverless entry: /health does not wait for the database', () => {
  it('answers /health at once, still starts the connection once, and other paths wait for it', async () => {
    let connects = 0;
    let release!: () => void;
    const connect = () => { connects += 1; return new Promise<void>((r) => { release = r; }); };
    const app = (q: http.IncomingMessage, s: http.ServerResponse) => { s.statusCode = 200; s.end(q.url); };
    const handler = serverlessHandler(app, connect);

    const health = await serve(handler).get('/health');
    expect(health.status).toBe(200);
    expect(connects, 'the connection was started').toBe(1);

    let apiDone = false;
    const api = serve(handler).get('/api/me/dashboard').then((r) => { apiDone = true; return r; });
    await new Promise((r) => setTimeout(r, 50));
    expect(apiDone, 'a data path waits for the connection').toBe(false);
    expect((await serve(handler).get('/health?x=1')).status).toBe(200);
    release();
    expect((await api).status).toBe(200);
    expect(connects, 'one connection per instance').toBe(1);
  });

  it('does not treat other paths that start with /health as database-free', async () => {
    let connects = 0;
    const handler = serverlessHandler((_q, s) => { s.end('ok'); }, async () => { connects += 1; });
    await serve(handler).get('/healthz');
    expect(connects).toBe(1);
  });
});
