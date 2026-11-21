import { afterEach, describe, expect, it } from 'vitest';
import { clearKeyStatusCache, hasFallback, keyStatus, modelFallbackOn, retryWaitMs, shouldFallBack, withFallback } from '../src/services/modelFallback';

// modelFallback (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN A): one rejected key stopped every tutor reply on lms-test while /ready said
// "configured". Backoff, a fallback key/model, and a real key check.
const err = (status?: number, name?: string) => Object.assign(new Error('x'), status !== undefined ? { status } : {}, name ? { name } : {});
afterEach(() => { delete process.env.ENARA_ENGINE_V2; delete process.env.ANTHROPIC_API_KEY_FALLBACK; delete process.env.ANTHROPIC_FALLBACK_MODEL; clearKeyStatusCache(); });

describe('modelFallback', () => {
  it('named-only switch, off by default', () => {
    expect(modelFallbackOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(modelFallbackOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'modelFallback';
    expect(modelFallbackOn()).toBe(true);
  });

  it('falls back on auth, rate limit, server errors and timeouts; not on bad requests', () => {
    for (const s of [401, 403, 429, 500, 529]) expect(shouldFallBack(err(s))).toBe(true);
    expect(shouldFallBack(err(undefined, 'APIConnectionTimeoutError'))).toBe(true);
    for (const s of [400, 404, 413, 422]) expect(shouldFallBack(err(s))).toBe(false);
  });

  it('backoff grows with jitter when on; the old fixed wait when off', () => {
    expect(retryWaitMs(500, 2, () => 0.5)).toBe(500);
    process.env.ENARA_ENGINE_V2 = 'modelFallback';
    expect(retryWaitMs(500, 0, () => 0)).toBe(500);
    expect(retryWaitMs(500, 1, () => 0.5)).toBe(1250);
    expect(retryWaitMs(500, 6, () => 0.99)).toBe(8000);
  });

  it('withFallback: runs the fallback once only with the switch on, a fallback configured and a fallback-worthy error', async () => {
    const fail401 = async () => { throw err(401); };
    const ok = async () => 'fallback';
    await expect(withFallback(fail401, ok)).rejects.toThrow();
    process.env.ENARA_ENGINE_V2 = 'modelFallback';
    await expect(withFallback(fail401, ok)).rejects.toThrow();
    expect(hasFallback()).toBe(false);
    process.env.ANTHROPIC_API_KEY_FALLBACK = 'test-fallback-key';
    let seen: number | undefined;
    await expect(withFallback(fail401, ok, (s) => { seen = s; })).resolves.toBe('fallback');
    expect(seen).toBe(401);
    await expect(withFallback(async () => { throw err(400); }, ok)).rejects.toThrow();
    delete process.env.ANTHROPIC_API_KEY_FALLBACK;
    process.env.ANTHROPIC_FALLBACK_MODEL = 'claude-haiku-5-5';
    await expect(withFallback(async () => { throw err(529); }, ok)).resolves.toBe('fallback');
  });

  it('keyStatus: a real check, 401/403 rejected, other failures error, cached; never returns the key', async () => {
    expect(await keyStatus(undefined)).toBe('not_configured');
    expect(await keyStatus('k1', async () => ({}))).toBe('accepted');
    expect(await keyStatus('k2', async () => { throw err(401); })).toBe('rejected');
    expect(await keyStatus('k3', async () => { throw err(500); })).toBe('error');
    let calls = 0;
    await keyStatus('k4', async () => { calls++; return {}; });
    await keyStatus('k4', async () => { calls++; return {}; });
    expect(calls).toBe(1);
  });
});
