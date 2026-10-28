import Anthropic from '@anthropic-ai/sdk';
import type { GraderRequest } from '../candidateV2/nativeGrader';
import { renderPrompt } from '../candidateV2/promptV1';
import { ProviderError, type Provider, type ProviderReply } from '../candidateV2/provider';

// Candidate V2-owned live provider (approved for the LAILA pilot). One attempt per call:
// no SDK retries, no AiCall/telemetry writes, no fallback model. Usage is returned to the
// caller for the run manifest. Sampling stays at provider defaults (D5).
export function anthropicProvider(opts: { apiKey: string; model: string; maxOutputTokens: number; onUsage?: (u: ProviderReply & { requestId?: string; stopReason?: string | null }) => void }): Provider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0 });
  return {
    name: `anthropic:${opts.model}`,
    async complete(request: GraderRequest, { timeoutMs }) {
      const { system, user } = renderPrompt(request);
      try {
        const r = await client.messages.create({ model: opts.model, max_tokens: opts.maxOutputTokens, system, messages: [{ role: 'user', content: user }] }, { timeout: timeoutMs });
        const reply = { text: r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), usage: { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens }, model: r.model };
        opts.onUsage?.({ ...reply, requestId: r.id, stopReason: r.stop_reason });
        return reply;
      } catch (e) {
        const status = (e as { status?: number }).status;
        const timeout = /timeout/i.test(String((e as Error).name) + String((e as Error).message));
        throw new ProviderError(status === 429 ? 'RATE_LIMITED' : status && status >= 500 ? 'UNAVAILABLE' : status ? 'BAD_REQUEST' : timeout ? 'TIMEOUT' : 'NETWORK', `provider call failed (${status ?? 'no status'})`);
      }
    },
  };
}
