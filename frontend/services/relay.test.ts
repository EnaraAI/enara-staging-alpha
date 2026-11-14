import assert from 'node:assert/strict';
import { test } from 'node:test';

// The relay check: reachable -> its URL; unreachable or slow -> null (direct);
// a failure is remembered so the next connection goes direct straight away.
const calls: string[] = [];
let healthy = true;
globalThis.fetch = (async (url: string) => {
  calls.push(String(url));
  if (!healthy) throw new Error('down');
  return new Response('{"ok":true}', { status: 200 });
}) as typeof fetch;

const relay = await import('./relay.ts');

test('uses the relay when it answers, and checks it only once a minute', async () => {
  assert.equal(await relay.relayBase(), 'https://rt.enara.app');
  assert.equal(await relay.relayBase(), 'https://rt.enara.app');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://rt.enara.app/health');
  assert.equal(relay.relayWsBase('https://rt.enara.app'), 'wss://rt.enara.app');
});

test('after a failed connection through it, calls go direct', async () => {
  relay.markRelayDown();
  assert.equal(await relay.relayBase(), null);
});
