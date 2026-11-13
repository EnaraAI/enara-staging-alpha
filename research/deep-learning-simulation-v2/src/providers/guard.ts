import { readFileSync } from 'fs';
import { unitPriceUsd } from '../../../../backend/src/services/priceCatalog';
import { Ledger, BudgetExceeded } from '../ledger/ledger';
import { norm } from '../benchmark/scoring';

export interface CallCtx { campaign: string; studentId: string | null; blockId: string | null; role: string; }
export class LeakageDetected extends Error {}

/** Outgoing-request guard. `forbidden` = every assessment prompt/material/accepted phrase (>=2 words). Tutor-side and student-side
 *  requests are scanned; a hit aborts the call and is logged by the caller as a leakage event (never silently ignored). */
export class OutgoingScanner {
  private phrases: string[];
  constructor(phrases: string[]) { this.phrases = [...new Set(phrases.map((p) => norm(p).trim()).filter((p) => p.split(' ').length >= 3 && p.length >= 14))]; }
  scan(text: string): string | null { const n = norm(text); for (const p of this.phrases) if (n.includes(p)) return p; return null; }
  get size() { return this.phrases.length; }
}
export const readKey = (file = process.env.ENARA_KEY_FILE ?? ''): string => { if (!file) throw new Error('ENARA_KEY_FILE is not set'); return readFileSync(file, 'utf8').trim(); };

const price = (model: string, k: 'input_token' | 'output_token') => unitPriceUsd('anthropic', model, k);
export const costOf = (model: string, inTok: number | null, outTok: number | null): number | null => {
  const pi = price(model, 'input_token'); const po = price(model, 'output_token');
  if (inTok === null || outTok === null || pi == null || po == null) return null; return inTok * pi + outTok * po;
};

export interface ChatOpts { model: string; system: string; user: string; maxTokens?: number; effort?: 'low' | 'medium' | 'high'; temperature?: number; }
export class Provider {
  constructor(readonly ledger: Ledger, private key: string, private scanner: OutgoingScanner | null, private fetchImpl: typeof fetch = fetch, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}
  /** One logical call with up to 10 attempts; EVERY attempt (success or failure) is a ledger row. Retry rows carry retryOf. */
  async chat(o: ChatOpts, ctx: CallCtx): Promise<{ text: string; costUsd: number | null }> {
    if (this.scanner) { const hit = this.scanner.scan(o.system + '\n' + o.user); if (hit) throw new LeakageDetected(`assessment text in outgoing ${ctx.role} request: "${hit.slice(0, 60)}"`); }
    let firstSeq: number | null = null; let spent = 0;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      this.ledger.assertBudget();
      let status: number | null = null; let body = ''; let err: string | null = null;
      try {
        const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens ?? 1500, ...(o.effort ? { output_config: { effort: o.effort } } : {}), system: o.system, messages: [{ role: 'user', content: o.user }] }) });
        status = res.status; body = await res.text();
      } catch (e) { err = (e as Error).message; }
      let usage: { input_tokens?: number; output_tokens?: number } | null = null; let text = ''; let ok = status !== null && status >= 200 && status < 300;
      if (ok) { try { const j = JSON.parse(body); usage = j.usage ?? null; text = (j.content ?? []).filter((b: { type?: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('').trim(); if (!text) { ok = false; err = 'empty text'; } } catch { ok = false; err = 'unparseable body'; } }
      else if (!err) err = `http ${status}`;
      const inTok = usage?.input_tokens ?? null; const outTok = usage?.output_tokens ?? null;
      const cost = usage ? costOf(o.model, inTok, outTok) : null;
      const row = this.ledger.record({ campaign: ctx.campaign, studentId: ctx.studentId, blockId: ctx.blockId, role: ctx.role, provider: 'anthropic', model: o.model, httpStatus: status, ok, retryOf: firstSeq, inputTokens: inTok, outputTokens: outTok, cacheReadTokens: null, cacheWriteTokens: null, costUsd: cost, priced: cost !== null, error: ok ? null : err });
      if (firstSeq === null) firstSeq = row.seq; spent += cost ?? 0;
      if (ok) return { text, costUsd: spent };
      if (status === 400 || status === 404) throw new Error(`provider rejected request (${status})`);
      await this.sleep(Math.min(120000, 3000 * 2 ** attempt));
    }
    throw new Error('provider unavailable after 10 attempts');
  }
}
export { BudgetExceeded };

/** Intercept outbound fetches made by the in-process ENARA app (tutor route) so its provider calls land in the same ledger. */
export function installFetchGuard(ledger: Ledger, getCtx: () => CallCtx, scanner: OutgoingScanner | null, leaks: { push(x: string): void }): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('api.anthropic.com')) return orig(input as never, init);
    const ctx = getCtx(); ledger.assertBudget();
    const reqBody = typeof init?.body === 'string' ? init.body : '';
    if (scanner) { const hit = scanner.scan(reqBody); if (hit) { leaks.push(`${ctx.blockId}: ${hit.slice(0, 80)}`); throw new LeakageDetected('assessment text in outgoing tutor request'); } }
    let model = 'unknown'; try { model = JSON.parse(reqBody).model ?? 'unknown'; } catch { /* keep unknown */ }
    let res: Response | null = null; let err: string | null = null; try { res = await orig(input as never, init); } catch (e) { err = (e as Error).message; }
    let usage: { input_tokens?: number; output_tokens?: number } | null = null;
    if (res) { try { const j = await res.clone().json(); usage = j.usage ?? null; } catch { /* streaming or non-json: usage unknown */ } }
    const inTok = usage?.input_tokens ?? null; const outTok = usage?.output_tokens ?? null; const cost = usage ? costOf(model, inTok, outTok) : null;
    ledger.record({ campaign: ctx.campaign, studentId: ctx.studentId, blockId: ctx.blockId, role: ctx.role, provider: 'anthropic', model, httpStatus: res?.status ?? null, ok: !!res && res.ok, retryOf: null, inputTokens: inTok, outputTokens: outTok, cacheReadTokens: null, cacheWriteTokens: null, costUsd: cost, priced: cost !== null, error: res?.ok ? null : err ?? `http ${res?.status}` });
    if (!res) throw new Error(err ?? 'fetch failed'); return res;
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}
