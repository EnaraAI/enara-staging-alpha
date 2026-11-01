import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser } from './sse.ts';

test('events split across chunks are joined; keep-alive comments are skipped', () => {
  const got: any[] = [];
  const feed = createSseParser((e) => got.push(e));
  feed('data: {"type":"user","message":{"text":"hi"}}\n\n: waiting\n\ndata: {"type":"tok');
  feed('en","delta":"Hel"}\n\ndata: {"type":"token","delta":"lo"}\n');
  feed('\ndata: {"type":"done"}\n\n');
  assert.deepEqual(got.map((e) => e.type), ['user', 'token', 'token', 'done']);
  assert.equal(got.filter((e) => e.type === 'token').map((e) => e.delta).join(''), 'Hello');
});
test('a partial event is kept until it is complete; bad JSON is ignored', () => {
  const got: any[] = [];
  const feed = createSseParser((e) => got.push(e));
  feed('data: not json\n\ndata: {"type":"replace","text":"x"}');
  assert.equal(got.length, 0);
  feed('\n\n');
  assert.deepEqual(got, [{ type: 'replace', text: 'x' }]);
});
