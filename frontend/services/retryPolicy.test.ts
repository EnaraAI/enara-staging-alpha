import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_QUICK_CLOSES, MAX_RETRIES, retryDelayMs, transcriptionReconnectDelayMs } from './retryPolicy.ts';

// P20: read-only requests retry a 503 + Retry-After with jitter; nothing else is re-sent.
test('GET 503 with Retry-After waits Retry-After plus jitter', () => {
  assert.equal(retryDelayMs('GET', 503, '5', 0, () => 0), 5000);
  assert.equal(retryDelayMs('get', 503, '5', 1, () => 0.5), 6000);
});
test('jitter spreads a class over two seconds and the wait is capped', () => {
  assert.equal(retryDelayMs('GET', 503, '5', 0, () => 0.9999), 6999);
  assert.equal(retryDelayMs('GET', 503, '60', 0, () => 0), 10000);
});
test('at most two retries', () => {
  assert.equal(MAX_RETRIES, 2);
  assert.equal(retryDelayMs('GET', 503, '5', 2, () => 0), null);
});
test('requests that change data are never re-sent', () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(retryDelayMs(m, 503, '5', 0), null, m);
});
test('only 503 with a valid Retry-After is retried', () => {
  for (const s of [500, 502, 504, 429, 401, 200]) assert.equal(retryDelayMs('GET', s, '5', 0), null, String(s));
  for (const h of [null, '', 'soon', '-1']) assert.equal(retryDelayMs('GET', 503, h, 0), null, String(h));
});

// Live-call transcription reconnects: no tight loop that keeps buying tokens.
test('a session that lived normally reconnects after half a second', () => {
  assert.equal(transcriptionReconnectDelayMs(0, false), 500);
});
test('quick closes back off and stop after three in a row', () => {
  assert.equal(transcriptionReconnectDelayMs(1, false), 1000);
  assert.equal(transcriptionReconnectDelayMs(2, false), 2000);
  assert.equal(MAX_QUICK_CLOSES, 3);
  assert.equal(transcriptionReconnectDelayMs(3, false), null);
});
test('quota or authentication errors never reconnect', () => {
  assert.equal(transcriptionReconnectDelayMs(0, true), null);
});
