import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { HardCapGuard } from '../src/scripts/p12HardCap';

// P12 hard-cap guard (offline). A fake upstream stands in for the network;
// every assertion is on what reached it and what the ledger recorded.
const HOST = 'api.anthropic.com';
const KEY = 'sk-test-not-a-real-key-0000';
const reply = (usage: Record<string, number> | null, status = 200) =>
  new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], ...(usage ? { usage } : {}) }), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });

function setup(capUsd: number, respond: (url: string) => Response | Promise<Response>, opts: { countTokens?: boolean } = {}) {
  const seen: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const upstream = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    seen.push(url);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return respond(url);
  }) as typeof fetch;
  const ledgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p12-')), 'ledger.json');
  const guard = new HardCapGuard({ capUsd, ledgerPath, allowHosts: [HOST], anthropicHost: HOST, upstream, countTokens: opts.countTokens });
  guard.planned = [{ label: 'grading', model: 'claude-opus-5-5', maxTokens: 3000 }, { label: 'tiny', model: 'claude-haiku-5-5', maxTokens: 10 }];
  const client = new Anthropic({ apiKey: KEY, fetch: guard.fetch, maxRetries: 0 });
  return { guard, client, seen, ledgerPath, maxInFlight: () => maxInFlight };
}
const ask = (c: Anthropic, model = 'claude-opus-5-5', max_tokens = 3000) => c.messages.create({ model, max_tokens, messages: [{ role: 'user', content: 'hello' }] });

describe('P12 hard-cap guard', () => {
  it('reserves the worst case before the call and settles the reported usage', async () => {
    const t = setup(1, (u) => (u.includes('count_tokens') ? new Response(JSON.stringify({ input_tokens: 100 })) : reply({ input_tokens: 100, output_tokens: 50 })), { countTokens: true });
    await ask(t.client);
    const [a] = t.guard.attempts;
    // 175 input tokens (ceil(100 * 1.1) + 64; the float product rounds up) at the cache-write rate ($5/M) + 3000 output at $20/M.
    expect(a).toMatchObject({ boundMethod: 'count_tokens+10%', inputTokenBound: 175, reservedUsd: 0.060875, status: 'ok', actualUsd: 0.0014, chargedUsd: 0.0014 });
    expect(t.guard.spentUsd).toBe(0.0014);
    const file = fs.readFileSync(t.ledgerPath, 'utf8');
    expect(file).not.toContain(KEY);
    expect(JSON.parse(file).attempts).toHaveLength(1);
  });

  it('refuses an attempt whose reservation would cross the cap; nothing leaves the process and STOP holds', async () => {
    const t = setup(0.05, () => reply({ input_tokens: 10, output_tokens: 10 }));
    await expect(ask(t.client)).rejects.toThrow();
    expect(t.seen).toHaveLength(0);
    expect(t.guard.exhausted).toBe(true);
    expect(t.guard.events.find((e) => e.type === 'STOP')?.detail).toMatchObject({ reason: 'EXHAUSTED' });
    // Even a call that would fit is refused after the stop.
    await expect(ask(t.client, 'claude-haiku-5-5', 10)).rejects.toThrow();
    expect(t.seen).toHaveLength(0);
    expect(t.guard.events.some((e) => e.type === 'refused_after_stop')).toBe(true);
  });

  it('blocks other hosts and unplanned model/max_tokens pairs', async () => {
    const t = setup(1, () => reply({ input_tokens: 1, output_tokens: 1 }));
    await expect(t.guard.fetch('https://api.elevenlabs.io/v1/text-to-speech', { method: 'POST' })).rejects.toThrow(/not allowed/);
    await expect(ask(t.client, 'claude-opus-5-5', 4000)).rejects.toThrow();
    expect(t.seen).toHaveLength(0);
    expect(t.guard.events.map((e) => e.type)).toEqual(expect.arrayContaining(['blocked_host', 'blocked_unplanned_call']));
  });

  it('runs concurrent attempts one at a time (grading consistency runs are parallel in the app)', async () => {
    const t = setup(1, () => reply({ input_tokens: 10, output_tokens: 10 }));
    await Promise.all([ask(t.client), ask(t.client), ask(t.client)]);
    expect(t.maxInFlight()).toBe(1);
    expect(t.guard.attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  it('charges the full reservation for HTTP errors and stops when usage is missing', async () => {
    let n = 0;
    const t = setup(1, () => (++n === 1 ? reply(null, 529) : reply(null)));
    await expect(ask(t.client)).rejects.toThrow();
    expect(t.guard.attempts[0]).toMatchObject({ status: 'http_error', httpStatus: 529 });
    expect(t.guard.spentUsd).toBe(t.guard.attempts[0].reservedUsd);
    await ask(t.client);
    expect(t.guard.attempts[1].status).toBe('usage_unknown');
    expect(t.guard.stopReason).toBe('usage_unknown');
    await expect(ask(t.client)).rejects.toThrow();
    expect(t.guard.attempts).toHaveLength(2);
  });

  it('falls back to the byte bound when token counting fails', async () => {
    const t = setup(1, (u) => (u.includes('count_tokens') ? new Response('{}', { status: 400 }) : reply({ input_tokens: 10, output_tokens: 10 })), { countTokens: true });
    await ask(t.client);
    expect(t.guard.attempts[0].boundMethod).toBe('byte_bound');
    expect(t.guard.attempts[0].inputTokenBound).toBeGreaterThan(1024);
  });
});
