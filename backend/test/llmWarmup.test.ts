import { afterEach, describe, expect, it } from 'vitest';
import { claimSlot, warmEveryMs, warmUp, warmupOn } from '../src/services/llmWarmup';

// Warm-up ping (owner, 21 Nov 2026): at most one per window across all instances; off unless dsWarmup and DeepSeek are on.
afterEach(() => { delete process.env.TUTOR_LLM_WARM_MIN; delete process.env.ENARA_ENGINE_V2; delete process.env.TUTOR_LLM_PROVIDER; });
describe('warm-up ping', () => {
  it('window: default 4 minutes, settable 1-30', () => {
    expect(warmEveryMs()).toBe(240_000);
    process.env.TUTOR_LLM_WARM_MIN = '10'; expect(warmEveryMs()).toBe(600_000);
    process.env.TUTOR_LLM_WARM_MIN = '0'; expect(warmEveryMs()).toBe(240_000);
  });
  it('one slot per window: a recent ping makes the claim fail (duplicate key), an old one is taken', async () => {
    let at: Date | null = null;
    const coll = () => ({ findOneAndUpdate: async (f: { at: { $lt: Date } }, u: { $set: { at: Date } }) => {
      if (at && at >= f.at.$lt) { const e = new Error('dup') as Error & { code: number }; e.code = 11000; throw e; }
      const before = at; at = u.$set.at; return before ? { _id: 'deepseek', at: before } : null;
    } });
    const t = new Date('2026-11-21T20:00:00Z');
    expect(await claimSlot(t, coll as never)).toBe(true);
    expect(await claimSlot(new Date(t.getTime() + 60_000), coll as never)).toBe(false);
    expect(await claimSlot(new Date(t.getTime() + 5 * 60_000), coll as never)).toBe(true);
  });
  it('does nothing unless dsWarmup is on and DeepSeek is the provider', async () => {
    expect(warmupOn()).toBe(false);
    expect(await warmUp()).toEqual({ sent: false });
    process.env.ENARA_ENGINE_V2 = 'dsWarmup';
    expect(warmupOn()).toBe(false); // provider not configured
  });
});
