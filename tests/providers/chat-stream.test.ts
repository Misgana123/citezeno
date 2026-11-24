import { describe, expect, it, vi } from 'vitest';
import { streamOrComplete, type ChatModel, type ChatProvider, type ChatRequest } from '@/lib/providers/chat/types';
import { createGeminiChat } from '@/lib/providers/gemini/chat';
import { createOpenRouterChat } from '@/lib/providers/openrouter/chat';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;
const model = (provider: string): ChatModel => ({ id: `${provider}-m`, provider, label: 'M', vendorModel: 'vendor-m', inputUsdPerM: 1, outputUsdPerM: 4 });
const request = (provider: string): ChatRequest => ({ model: model(provider), system: 'Answer from the passages.', messages: [{ role: 'user', text: 'What sample?' }], tools: [], maxOutputTokens: 300 });

/* A fetch that answers with server-sent events, split at awkward places like a real network. */
function sseFetch(events: (unknown | string)[], opts: { status?: number; chunk?: number } = {}) {
  const text = events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`)).join('');
  const bytes = new TextEncoder().encode(text);
  const size = opts.chunk ?? 7;
  const fetch = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size));
        c.close();
      },
    });
    return new Response(body, { status: opts.status ?? 200, headers: { 'content-type': 'text/event-stream' } });
  });
  const sent = () => {
    const [url, init] = fetch.mock.calls[0];
    return { url: String(url), body: JSON.parse(String(init?.body)) };
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

describe('streaming chat', () => {
  it('Gemini: streams text, skips thoughts, totals the cost at the end', async () => {
    const { fetch, sent } = sseFetch([
      { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: '1,200 nurses ' }] } }] },
      { candidates: [{ content: { parts: [{ text: '[p3-1].' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } },
    ]);
    const pieces: string[] = [];
    const r = await createGeminiChat({ GEMINI_API_KEY: 'g' }, ungated, fetch)!.stream!(request('gemini'), (t) => pieces.push(t));
    expect(sent().url).toContain(':streamGenerateContent?alt=sse');
    expect(pieces).toEqual(['1,200 nurses ', '[p3-1].']);
    expect(r).toMatchObject({ text: '1,200 nurses [p3-1].', stop: 'end', toolCalls: [], usage: { inputTokens: 1000, outputTokens: 100 } });
    expect(r.costUsd).toBeCloseTo((1000 * 1 + 100 * 4) / 1e6);
  });

  it('OpenRouter: streams text through its keep-alive comments and CRLF lines, with the stated cost from the last chunk', async () => {
    const { fetch, sent } = sseFetch(
      [
        ': OPENROUTER PROCESSING\r\n\r\n',
        'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\r\n\r\n',
        'data: {"choices":[{"delta":{"content":"This paper "}}]}\r\n\r\n',
        'data: {"choices":[{"delta":{"content":"doesn’t say."},"finish_reason":"stop"}]}\r\n\r\n',
        'data: {"choices":[],"usage":{"prompt_tokens":50,"completion_tokens":5,"cost":0.00001}}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
      ],
      { chunk: 5 },
    );
    const pieces: string[] = [];
    const r = await createOpenRouterChat({ OPENROUTER_API_KEY: 'k' }, ungated, fetch)!.stream!(request('openrouter'), (t) => pieces.push(t));
    expect(sent().body).toMatchObject({ stream: true, usage: { include: true } });
    expect(pieces.join('')).toBe('This paper doesn’t say.');
    expect(r).toMatchObject({ text: 'This paper doesn’t say.', stop: 'end', usage: { inputTokens: 50, outputTokens: 5 }, costUsd: 0.00001 });
  });

  it('turns an error sent mid-stream into a common error that is not retried', async () => {
    const { fetch } = sseFetch([{ choices: [{ delta: { content: 'Part' } }] }, { error: { code: 502, message: 'Provider returned error' }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] }]);
    await expect(createOpenRouterChat({ OPENROUTER_API_KEY: 'k' }, ungated, fetch)!.stream!(request('openrouter'), () => {})).rejects.toMatchObject({ name: 'ProviderError', code: 'unavailable' });
  });

  it('a refused stream request fails like a one-shot one (429 → busy, so the gateway retries it)', async () => {
    const fetch = vi.fn(async () => Response.json({ error: { message: 'slow down' } }, { status: 429 })) as unknown as typeof globalThis.fetch;
    await expect(createGeminiChat({ GEMINI_API_KEY: 'g' }, ungated, fetch)!.stream!(request('gemini'), () => {})).rejects.toMatchObject({ code: 'busy', details: { status: 429 } });
  });

  it('streamOrComplete falls back to the one-shot call', async () => {
    const res = { text: 'Whole answer.', toolCalls: [], stop: 'end' as const, usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, native: { provider: 'x', content: null } };
    const oneShot: ChatProvider = { name: 'x', complete: vi.fn(async () => res) };
    const pieces: string[] = [];
    expect(await streamOrComplete(oneShot, request('x'), (t) => pieces.push(t))).toBe(res);
    expect(pieces).toEqual(['Whole answer.']);
    // with tools, even a streaming provider makes the one-shot call
    const both: ChatProvider = { name: 'y', complete: vi.fn(async () => res), stream: vi.fn() };
    await streamOrComplete(both, { ...request('y'), tools: [{ name: 't', description: 'd', parameters: {} }] }, () => {});
    expect(both.stream).not.toHaveBeenCalled();
  });
});
