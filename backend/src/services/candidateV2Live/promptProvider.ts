import Anthropic from '@anthropic-ai/sdk';
import type { PromptProvider, PromptReply } from '../candidateV2/evalV2Criterion';
import { ProviderError } from '../candidateV2/provider';

// Live transport for candidate-v2-evalv2-criterion-laila. One attempt per call (no SDK
// retries), no AiCall/telemetry writes. Sends eval-v2's output_config effort when given.
export function anthropicPromptProvider(opts: { apiKey: string; model: string; effort?: 'low' | 'medium' | 'high'; onReply?: (r: PromptReply & { model: string; requestId: string; latencyMs: number }) => void }): PromptProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0 });
  return {
    name: `anthropic:${opts.model}`,
    async complete(p, { timeoutMs }) {
      const t0 = Date.now();
      try {
        const r = await client.messages.create(
          { model: opts.model, max_tokens: p.maxTokens, system: p.system, messages: [{ role: 'user', content: p.user }], ...(opts.effort ? { output_config: { effort: opts.effort } } : {}) },
          { timeout: timeoutMs },
        );
        const reply: PromptReply = { text: r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), stopReason: r.stop_reason, usage: { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens } };
        opts.onReply?.({ ...reply, model: r.model, requestId: r.id, latencyMs: Date.now() - t0 });
        return reply;
      } catch (e) {
        const status = (e as { status?: number }).status;
        const timeout = /timeout/i.test(String((e as Error).name) + String((e as Error).message));
        throw new ProviderError(status === 429 ? 'RATE_LIMITED' : status && status >= 500 ? 'UNAVAILABLE' : status ? 'BAD_REQUEST' : timeout ? 'TIMEOUT' : 'NETWORK', `provider call failed (${status ?? 'no status'})`);
      }
    },
  };
}
