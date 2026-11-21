import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RATE, toPcm16k, wav, base64 } from './utteranceRecorder.ts';

// avatarSpeaking: the clip sent for pronunciation is a 16 kHz mono 16-bit WAV (the server accepts only that).
test('48 kHz float samples become 16 kHz Int16, and wav() writes a valid header', () => {
  const input = new Float32Array(48000).fill(0.5);
  const pcm = toPcm16k(input, 48000);
  assert.equal(pcm.length, RATE);
  assert.ok(Math.abs(pcm[100] - 16384) <= 1);
  const w = wav(pcm);
  const v = new DataView(w.buffer);
  assert.equal(String.fromCharCode(...w.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...w.subarray(8, 12)), 'WAVE');
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(w.length, 44 + RATE * 2);
  assert.equal(typeof base64(w.subarray(0, 10)), 'string');
});
