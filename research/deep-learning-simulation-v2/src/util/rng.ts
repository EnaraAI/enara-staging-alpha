import { createHash } from 'crypto';
// Deterministic, seedable RNG (mulberry32) with string-derived sub-streams. No Math.random anywhere in the research code.
export function seedFrom(...parts: (string | number)[]): number {
  return createHash('sha256').update(parts.join('|')).digest().readUInt32BE(0);
}
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  static of(...parts: (string | number)[]): Rng { return new Rng(seedFrom(...parts)); }
  next(): number { this.s = (this.s + 0x6d2b79f5) >>> 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  int(n: number): number { return Math.floor(this.next() * n); }
  bool(p: number): boolean { return this.next() < p; }
  normal(mean = 0, sd = 1): number { const u = Math.max(this.next(), 1e-12); const v = this.next(); return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  clamp01Normal(mean: number, sd: number): number { return Math.min(1, Math.max(0, this.normal(mean, sd))); }
  shuffle<T>(a: readonly T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = this.int(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
}
export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
