import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEEPSEEK_REMINDER, _resetReasoningMode, deepseekClient, deepseekPrices, deepseekReady, fromChat, reasoningModeUsed, toChat, tutorProvider } from '../src/services/llmProvider';

// Tutor provider switch (owner, 21 Nov 2026): DeepSeek on Modal (OpenAI-compatible) behind the same call shape as the Anthropic client.
const ENV = { TUTOR_LLM_PROVIDER: 'deepseek', TUTOR_LLM_ENDPOINT: 'https://example.invalid/v1', TUTOR_LLM_MODEL: 'deepseek-v4.1-flash', TUTOR_LLM_API_KEY: 'wk-abc.ws-def' };
const setEnv = (e: Record<string, string>) => Object.assign(process.env, e);
afterEach(() => { for (const k of [...Object.keys(ENV), 'TUTOR_LLM_PRICE_IN', 'TUTOR_LLM_PRICE_OUT']) delete process.env[k]; vi.unstubAllGlobals(); _resetReasoningMode(); });
const body = { model: 'claude-opus-5-5', max_tokens: 300, temperature: 0.3, system: [{ type: 'text', text: 'You are a tutor.' }, { type: 'text', text: 'Brief.' }],
  messages: [{ role: 'user' as const, content: 'Hi' }, { role: 'assistant' as const, content: [{ type: 'text', text: 'Hello!' }] },
    { role: 'user' as const, content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0' } }, { type: 'text', text: 'What is 2+2?' }] }] };

describe('tutor LLM provider', () => {
  it('Anthropic stays the default; DeepSeek only when switched on and fully configured', () => {
    expect(tutorProvider()).toBe('anthropic');
    expect(deepseekReady()).toBe(false);
    setEnv({ TUTOR_LLM_PROVIDER: 'deepseek' });
    expect(deepseekReady()).toBe(false);
    setEnv(ENV);
    expect(deepseekReady()).toBe(true);
  });

  it('converts the request: system first, text only (PDF blocks left out), max tokens and temperature kept, our model id', () => {
    setEnv(ENV);
    const c = toChat(body as never, false) as { model: string; messages: { role: string; content: string }[]; max_tokens: number; temperature: number };
    expect(c.model).toBe('deepseek-v4.1-flash');
    expect(c.messages).toEqual([{ role: 'system', content: 'You are a tutor.\n\nBrief.' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'What is 2+2?' }]);
    expect(c.max_tokens).toBe(300); expect(c.temperature).toBe(0.3);
    expect(toChat(body as never, true)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('converts the reply: text content, stop reason and usage in the Anthropic shape', () => {
    const m = fromChat({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: '[[assess verdict=CORRECT]]\nYes!' }, finish_reason: 'length' }], usage: { prompt_tokens: 120, completion_tokens: 30 } });
    expect(m.content).toEqual([{ type: 'text', text: '[[assess verdict=CORRECT]]\nYes!' }]);
    expect(m.stop_reason).toBe('max_tokens');
    expect(m.usage).toEqual({ input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
  });

  it('create(): Bearer first; on 401 it retries once with Modal-Key / Modal-Secret; the key is never in the error', async () => {
    setEnv(ENV);
    const seen: Record<string, string>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers);
      if (init.headers.Authorization) return new Response('no', { status: 401 });
      return new Response(JSON.stringify({ model: 'deepseek-v4.1-flash', choices: [{ message: { content: 'Four.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 2 } }), { status: 200 });
    }));
    const r = await deepseekClient(5000).beta.messages.create(body as never) as unknown as { content: { text: string }[]; stop_reason: string };
    expect(r.content[0].text).toBe('Four.'); expect(r.stop_reason).toBe('end_turn');
    expect(seen[0].Authorization).toBe('Bearer wk-abc.ws-def');
    expect(seen[1]).toMatchObject({ 'Modal-Key': 'wk-abc', 'Modal-Secret': 'ws-def' });
  });

  it('stream(): SSE chunks become Anthropic text deltas; finalMessage has the text and usage', async () => {
    setEnv(ENV);
    const sse = ['data: {"model":"deepseek-v4.1-flash","choices":[{"delta":{"content":"Good "}}]}', 'data: {"choices":[{"delta":{"content":"job!"},"finish_reason":"stop"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":50,"completion_tokens":3}}', 'data: [DONE]', ''].join('\n');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200 })));
    const s = deepseekClient(5000).beta.messages.stream(body as never) as unknown as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }> & { finalMessage(): Promise<{ content: { text: string }[]; usage: { output_tokens: number } }> };
    let text = ''; const types: string[] = [];
    for await (const e of s) { types.push(e.type); if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') text += e.delta.text; }
    expect(text).toBe('Good job!');
    expect(types[0]).toBe('message_start'); expect(types.at(-1)).toBe('message_stop');
    const f = await s.finalMessage(); expect(f.content[0].text).toBe('Good job!'); expect(f.usage.output_tokens).toBe(3);
  });

  it('a provider error surfaces with its status (so the fallback and retries apply), without the key', async () => {
    setEnv(ENV);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    await expect(deepseekClient(5000).messages.create(body as never)).rejects.toMatchObject({ status: 503 });
    await expect(deepseekClient(5000).messages.create(body as never)).rejects.not.toThrow(/wk-abc/);
  });

  it('prices: set from settings; otherwise a cautious upper-bound default', () => {
    expect(deepseekPrices()).toEqual({ input: 1, output: 4 });
    setEnv({ TUTOR_LLM_PRICE_IN: '0.07', TUTOR_LLM_PRICE_OUT: '0.28' });
    expect(deepseekPrices()).toEqual({ input: 0.07, output: 0.28 });
  });

  it('reasoning is switched off (empty replies otherwise); a server that refuses that spelling (400) gets the next one, then none', async () => {
    setEnv(ENV);
    expect(toChat(body as never, false)).toMatchObject({ reasoning_effort: 'none' });
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body) as Record<string, unknown>; sent.push(b);
      if ('reasoning_effort' in b) return new Response('bad field', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Four.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 2 } }), { status: 200 });
    }));
    const r = await deepseekClient(5000).messages.create(body as never) as unknown as { content: { text: string }[] };
    expect(r.content[0].text).toBe('Four.');
    expect(sent[1]).toMatchObject({ chat_template_kwargs: { thinking: false } });
    expect(reasoningModeUsed()).toBe('chat_template_kwargs');
    await deepseekClient(5000).messages.create(body as never);
    expect(sent).toHaveLength(3); // learned: no second 400
  });

  it('adds the rule reminder at the end of the system prompt only when the request asks for the hidden grading line', () => {
    setEnv(ENV);
    const plain = toChat(body as never, false) as { messages: { role: string; content: string }[] };
    expect(plain.messages[0].content).toBe('You are a tutor.\n\nBrief.');
    const graded = toChat({ ...body, system: 'Start your reply with [[assess verdict=V ...]].' } as never, false) as { messages: { role: string; content: string }[] };
    expect(graded.messages[0].content.endsWith(DEEPSEEK_REMINDER)).toBe(true);
    expect(graded.messages[1].role).toBe('user');
  });
});
