import { describe, expect, it } from 'vitest';
import { guardedEmitter } from '../src/services/guardedStream';

// Speed step 6: the avatar speaks each sentence once the lesson guards keep it, one sentence behind, and nothing a guard removes.
const feed = (em: ReturnType<typeof guardedEmitter>, pieces: string[]) => { const out: string[] = []; for (const p of pieces) { const x = em.push(p); if (x) out.push(x); } const r = em.end(); if (r) out.push(r); return out; };
describe('guarded sentence stream', () => {
  it('speaks sentence by sentence, one behind, and the whole reply in the end', () => {
    const em = guardedEmitter((t) => ({ text: t }));
    const out = feed(em, ['Nice try. ', 'Check the first ', 'letter. ', 'Write it again.']);
    expect(out).toEqual(['Nice try. ', 'Check the first letter. Write it again.']); // the second waits for the third to start
    expect(em.diverged).toBe(false);
  });
  it('a sentence the guards remove is never spoken, even if it came first (bare praise before a correction)', () => {
    const guard = (t: string) => ({ text: /check/i.test(t) ? t.replace(/^Good\.\s*/, '') : t }); // like removeMixedPraise
    const out = feed(guardedEmitter(guard), ['Good. ', 'Check the first letter. ', 'Try again.']);
    expect(out.join('')).toBe('Check the first letter. Try again.');
  });
  it('what the final guards add (the closing ask) is spoken at the end', () => {
    const guard = (t: string) => ({ text: /again\.$/.test(t) ? `${t} Now say the rule in your own words.` : t });
    const out = feed(guardedEmitter(guard), ['Good try. ', 'Say it again.']);
    expect(out.join('')).toBe('Good try. Say it again. Now say the rule in your own words.');
  });
  it('nothing is spoken twice when a late guard changes what was already said (counted as diverged)', () => {
    let n = 0; const guard = (t: string) => ({ text: ++n > 2 ? t.replace('A first.', 'Changed.') : t });
    const em = guardedEmitter(guard);
    const out = feed(em, ['A first. ', 'B second. ', 'C third.']);
    expect(out.join('')).toBe('A first. ');
    expect(em.diverged).toBe(true);
  });
});
