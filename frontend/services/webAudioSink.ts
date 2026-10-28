import type { AudioSink } from './avatarVoice';

// Plays the tutor's 16 kHz PCM speech in the browser, for voice-only calls when
// the video avatar can't connect. Chunks arrive paced to real time; each is
// scheduled right after the previous one so playback has no gaps.
export class WebAudioSink implements AudioSink {
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly ctx: AudioContext) {}

  sendAudioChunk(chunk: Uint8Array): void {
    const samples = Math.floor(chunk.length / 2);
    if (!samples) return;
    const view = new DataView(chunk.buffer, chunk.byteOffset, samples * 2);
    const buffer = this.ctx.createBuffer(1, samples, 16000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = view.getInt16(i * 2, true) / 32768;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const start = Math.max(this.ctx.currentTime + 0.05, this.nextTime);
    source.start(start);
    this.nextTime = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  endSequence(): void {
    // Nothing to flush: scheduled audio plays out on its own.
  }

  // The student talked over the tutor: stop what is playing now.
  stopPlayback(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }
}
