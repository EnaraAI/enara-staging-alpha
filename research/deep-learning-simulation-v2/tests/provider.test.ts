import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs'; import { tmpdir } from 'os'; import path from 'path';
import { Ledger } from '../src/ledger/ledger';
import { Provider, OutgoingScanner, LeakageDetected, installFetchGuard } from '../src/providers/guard';
const ok = (text: string, i = 100, o = 20) => new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: i, output_tokens: o } }), { status: 200 });
const mk = (cap = 5) => new Ledger(mkdtempSync(path.join(tmpdir(), 'pv-')), 'r', cap);
const ctx = { campaign: 'c', studentId: 's', blockId: 'b', role: 'tutor' };
describe('provider guard', () => {
  it('logs every attempt, marks retries, prices known models, never invents unknown usage', async () => {
    const l = mk(); let n = 0; const f = (async () => (++n === 1 ? new Response('x', { status: 503 }) : ok('hi'))) as unknown as typeof fetch;
    const p = new Provider(l, 'k', null, f, async () => {}); const r = await p.chat({ model: 'claude-haiku-5-5', system: 's', user: 'u' }, ctx);
    expect(r.text).toBe('hi'); const rows = Ledger.read(l.file); expect(rows.length).toBe(2); expect(rows[0].ok).toBe(false); expect(rows[0].costUsd).toBeNull(); expect(rows[1].retryOf).toBe(1); expect(rows[1].costUsd).toBeGreaterThan(0);
  });
  it('unpriced model: cost stays null (unknown), not zero', async () => {
    const l = mk(); const p = new Provider(l, 'k', null, (async () => ok('x')) as unknown as typeof fetch, async () => {}); await p.chat({ model: 'some-unpriced-model', system: 's', user: 'u' }, ctx);
    expect(Ledger.read(l.file)[0].costUsd).toBeNull(); expect(l.unknownCostAttempts).toBe(1);
  });
  it('blocks requests containing assessment text before any network call', async () => {
    const l = mk(); let called = 0; const p = new Provider(l, 'k', new OutgoingScanner(['Correct the verb: "My brother play football on Fridays."']), (async () => { called += 1; return ok('x'); }) as unknown as typeof fetch);
    await expect(p.chat({ model: 'claude-haiku-5-5', system: 'You tutor.', user: 'Please help with: correct the verb my brother play football on fridays' }, ctx)).rejects.toBeInstanceOf(LeakageDetected); expect(called).toBe(0);
  });
  it('stops safely at the budget cap', async () => {
    const l = mk(0.000001); const p = new Provider(l, 'k', null, (async () => ok('x', 1000, 1000)) as unknown as typeof fetch, async () => {}); await p.chat({ model: 'claude-haiku-5-5', system: 's', user: 'u' }, ctx);
    await expect(p.chat({ model: 'claude-haiku-5-5', system: 's', user: 'u' }, ctx)).rejects.toThrow(/budget/);
  });
  it('fetch guard logs the in-process tutor provider calls and blocks leaks', async () => {
    const l = mk(); const orig = globalThis.fetch; globalThis.fetch = (async () => ok('tutor reply', 500, 50)) as unknown as typeof fetch; const leaks: string[] = [];
    const restore = installFetchGuard(l, () => ctx, new OutgoingScanner(['She watches television every evening after school']), leaks);
    try { await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'hello' }] }) }); expect(Ledger.read(l.file).length).toBe(1); expect(Ledger.read(l.file)[0].role).toBe('tutor');
      await expect(fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'She watches television every evening after school' }] }) })).rejects.toBeInstanceOf(LeakageDetected); expect(leaks.length).toBe(1);
    } finally { restore(); globalThis.fetch = orig; }
  });
});
describe('scanner precision', () => {
  it('ignores short generic phrases (fewer than 6 words) but still catches full assessment sentences', () => { const sc = new OutgoingScanner(['what does it mean', 'Ben reads a book every night']); expect(sc.scan('Tutor: what does it mean here?')).toBeNull(); expect(new OutgoingScanner(['Ben reads a book every single night']).scan('Write: ben reads a book every single night.')).not.toBeNull(); expect(sc.scan('Please put these words in order: the dog is big or small today')).toBeNull(); });
});

import { costOf, CACHE_READ_MULT, CACHE_WRITE_MULT } from '../src/providers/guard';
import { unitPriceUsd } from '../../../backend/src/services/priceCatalog';
describe('cost accounting includes cached tokens', () => {
  const pi = unitPriceUsd('anthropic', 'claude-opus-5-5', 'input_token')!; const po = unitPriceUsd('anthropic', 'claude-opus-5-5', 'output_token')!;
  it('cache reads cost 0.1x and writes 1.25x the input price; without cache fields the cost is unchanged', () => {
    expect(costOf('claude-opus-5-5', 1000, 100)).toBeCloseTo(1000 * pi + 100 * po, 10);
    expect(costOf('claude-opus-5-5', 1000, 100, 1800, 0)).toBeCloseTo(1000 * pi + 100 * po + 1800 * pi * CACHE_READ_MULT, 10);
    expect(costOf('claude-opus-5-5', 1000, 100, 0, 1800)).toBeCloseTo(1000 * pi + 100 * po + 1800 * pi * CACHE_WRITE_MULT, 10);
    expect(costOf('claude-opus-5-5', null, 5, 100, 0)).toBeNull(); expect(costOf('unpriced-model', 10, 10, 5, 5)).toBeNull();
  });
  it('the ledger records cache tokens from the provider response and prices them', async () => {
    const l = mk(); const f = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 1800, cache_creation_input_tokens: 0 } }), { status: 200 })) as unknown as typeof fetch;
    await new Provider(l, 'k', null, f, async () => {}).chat({ model: 'claude-opus-5-5', system: 's', user: 'u' }, ctx); const row = Ledger.read(l.file)[0];
    expect(row.cacheReadTokens).toBe(1800); expect(row.costUsd).toBeCloseTo(100 * pi + 10 * po + 1800 * pi * 0.1, 10);
  });
});
