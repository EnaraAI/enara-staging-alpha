import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// No network or browser APIs here: only the playback queue is under test.
// Run with: node --import tsx --experimental-test-module-mocks --test services/avatarVoiceInline.test.ts
mock.module('./apiService', { namedExports: { avatarFetch: async () => new Response(null, { status: 503 }) } });
const { AvatarVoice } = await import('./avatarVoice');

// Speech that arrives inside the reply stream (server-side speech) plays in
// sentence order, as one turn, and an interruption drops what is queued.
function sink() {
  const chunks: number[][] = [];
  let ends = 0;
  return {
    chunks,
    get ends() {
      return ends;
    },
    sendAudioChunk: (c: Uint8Array) => chunks.push([...c]),
    endSequence: () => {
      ends += 1;
    },
  };
}
const callbacks = { onUtterance() {}, onError() {} };
const sample = (v: number) => new Uint8Array([v, 0]);

test('plays inline sentences in order, even when later audio arrives first', async () => {
  const out = sink();
  const voice = new AvatarVoice('s1', out, callbacks);
  const first = voice.sayInline('First.');
  const second = voice.sayInline('Second.');
  second.push(sample(2));
  second.end();
  first.push(sample(1));
  first.end();
  await voice.finishTurn();
  // amplify() lifts the level 2.2x: 1 -> 2, 2 -> 4, 3 -> 7 (low byte of a 16-bit sample).
  assert.deepEqual(out.chunks.map((c) => c[0]), [2, 4]);
  assert.equal(out.ends, 1);
  assert.equal(voice.isSpeaking, false);
});

test('keeps 16-bit samples whole when a chunk has an odd length', async () => {
  const out = sink();
  const voice = new AvatarVoice('s2', out, callbacks);
  const s = voice.sayInline('Hello.');
  s.push(new Uint8Array([1]));
  s.push(new Uint8Array([0, 3, 0]));
  s.end();
  await voice.finishTurn();
  assert.deepEqual(out.chunks.flat(), [2, 0, 7, 0]);
});

test('an interruption drops inline audio still queued', async () => {
  const out = sink();
  const voice = new AvatarVoice('s3', out, callbacks);
  const s = voice.sayInline('Long answer.');
  voice.interrupt();
  s.push(sample(9));
  s.end();
  await voice.finishTurn();
  assert.equal(out.chunks.length, 0);
});

test('the tutor counts as speaking while inline sentences are queued (echo guard)', () => {
  const voice = new AvatarVoice('s4', sink(), callbacks);
  voice.sayInline('Queued words.');
  assert.equal(voice.isSpeaking, true);
});
