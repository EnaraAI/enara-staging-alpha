// avatarSpeaking (NEXT_PLAN item 5): the last few seconds of the microphone as 16 kHz mono PCM, so the sentence the learner just finished
// can be sent once as a short WAV clip for pronunciation feedback (adults only; the server says when). Nothing is kept: the ring buffer is
// overwritten every 12 s and released when the call ends.
export const RATE = 16000;
const KEEP_S = 12;

/** Float32 samples at `from` Hz to 16 kHz Int16 (simple averaging decimation; speech only). */
export function toPcm16k(input: Float32Array, from: number): Int16Array {
  const ratio = from / RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = a; j < b; j++) sum += input[j];
    const v = b > a ? sum / (b - a) : 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}
/** A 16 kHz mono 16-bit PCM WAV file. */
export function wav(pcm: Int16Array): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
export function base64(bytes: Uint8Array): string {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class UtteranceRecorder {
  private ring = new Int16Array(RATE * KEEP_S);
  private write = 0;
  private filled = 0;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: ScriptProcessorNode;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    const rate = this.ctx.sampleRate;
    this.node.onaudioprocess = (e) => this.push(toPcm16k(e.inputBuffer.getChannelData(0), rate));
    src.connect(this.node); this.node.connect(this.ctx.destination);
  }
  private push(pcm: Int16Array): void {
    for (let i = 0; i < pcm.length; i++) { this.ring[this.write] = pcm[i]; this.write = (this.write + 1) % this.ring.length; }
    this.filled = Math.min(this.ring.length, this.filled + pcm.length);
  }
  /** The last `seconds` (at most 12) as a WAV clip. */
  lastClip(seconds: number): Uint8Array | null {
    const n = Math.min(this.filled, Math.round(Math.max(0.5, Math.min(seconds, KEEP_S)) * RATE));
    if (n < RATE / 2) return null;
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = this.ring[(this.write - n + i + this.ring.length) % this.ring.length];
    return wav(out);
  }
  stop(): void {
    try { this.node?.disconnect(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.ring.fill(0); this.filled = 0;
  }
}
