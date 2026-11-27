import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInflight } from './inflight.ts';

test('the same key while in flight shares one call', async () => {
  const share = createInflight<string>();
  let calls = 0;
  let release!: (v: string) => void;
  const run = () => { calls++; return new Promise<string>((r) => { release = r; }); };
  const a = share('GET /api/me/assignments', run);
  const b = share('GET /api/me/assignments', run);
  assert.equal(calls, 1);
  release('body');
  assert.deepEqual(await Promise.all([a, b]), ['body', 'body']);
});

test('different keys (path or token) do not share', async () => {
  const share = createInflight<number>();
  let calls = 0;
  const run = () => Promise.resolve(++calls);
  await Promise.all([share('t1 /a', run), share('t1 /b', run), share('t2 /a', run)]);
  assert.equal(calls, 3);
});

test('nothing is kept after the call finished, including after a failure', async () => {
  const share = createInflight<number>();
  let calls = 0;
  await share('k', () => Promise.resolve(++calls));
  await share('k', () => Promise.resolve(++calls));
  assert.equal(calls, 2);
  await assert.rejects(share('e', () => Promise.reject(new Error('network'))));
  assert.equal(await share('e', () => Promise.resolve(7)), 7);
});

test('a failure reaches every caller that shared it', async () => {
  const share = createInflight<number>();
  const run = () => Promise.reject(new Error('offline'));
  const results = await Promise.allSettled([share('k', run), share('k', run)]);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
});
