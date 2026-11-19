import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAnthropicChat } from '@/lib/providers/anthropic/chat';
import { chatModels } from '@/lib/providers/chat/catalog';
import { chatError, chatPolicy } from '@/lib/providers/chat/http';
import { CHAT_MODELS } from '@/lib/providers/chat/models';
import { CHAT_PROVIDERS } from '@/lib/providers/chat/registry';
import { costOf, type ChatMessage, type ChatModel, type ChatRequest } from '@/lib/providers/chat/types';
import { createGeminiChat } from '@/lib/providers/gemini/chat';
import { toGeminiSchema } from '@/lib/providers/gemini/schema';
import { createOpenAiChat } from '@/lib/providers/openai/chat';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;
const model = (provider: string, over: Partial<ChatModel> = {}): ChatModel => ({ id: `${provider}-m`, provider, label: 'M', vendorModel: 'vendor-m', inputUsdPerM: 1, outputUsdPerM: 4, ...over });

const TOOL = { name: 'search_papers', description: 'Search papers.', parameters: z.toJSONSchema(z.object({ query: z.string(), year: z.number().int().nullable() })) as Record<string, unknown> };

/* A conversation with one finished tool round. */
const HISTORY: ChatMessage[] = [
  { role: 'user', text: 'Find sleep papers' },
  { role: 'assistant', text: 'Searching.', toolCalls: [{ id: 'c1', name: 'search_papers', input: { query: 'sleep', year: null } }] },
  { role: 'tool', results: [{ callId: 'c1', name: 'search_papers', content: '[{"id":"openalex:W1"}]' }] },
];

const request = (provider: string, messages = HISTORY): ChatRequest => ({ model: model(provider), system: 'Be careful.', messages, tools: [TOOL], maxOutputTokens: 500 });

/* A fetch that answers with `body` and records what was sent. */
function fakeFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetch = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers }));
  const sent = () => {
    const [url, init] = fetch.mock.calls[0];
    return { url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) };
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

describe('Anthropic', () => {
  it('sends the Messages API request with the key in a header', async () => {
    const { fetch, sent } = fakeFetch({ content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } });
    const chat = createAnthropicChat({ ANTHROPIC_API_KEY: 'sk-ant' }, ungated, fetch)!;
    const r = await chat.complete(request('anthropic'));
    const s = sent();
    expect(s.url).toBe('https://api.anthropic.com/v1/messages');
    expect(s.url).not.toContain('sk-ant');
    expect(s.headers['x-api-key']).toBe('sk-ant');
    expect(s.body).toMatchObject({ model: 'vendor-m', max_tokens: 500, system: 'Be careful.', tools: [{ name: 'search_papers', input_schema: { type: 'object' } }] });
    expect(s.body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Find sleep papers' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Searching.' }, { type: 'tool_use', id: 'c1', name: 'search_papers', input: { query: 'sleep', year: null } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '[{"id":"openalex:W1"}]' }] },
    ]);
    expect(r).toMatchObject({ text: 'Done.', toolCalls: [], stop: 'end', usage: { inputTokens: 1000, outputTokens: 100 } });
    expect(r.costUsd).toBeCloseTo((1000 * 1 + 100 * 4) / 1e6);
  });

  it('reads tool calls, and sends its own earlier answer back as it came', async () => {
    const content = [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'tu_1', name: 'search_papers', input: { query: 'x' } }];
    const first = fakeFetch({ content, stop_reason: 'tool_use', usage: {} });
    const r = await createAnthropicChat({ ANTHROPIC_API_KEY: 'k' }, ungated, first.fetch)!.complete(request('anthropic', [{ role: 'user', text: 'hi' }]));
    expect(r).toMatchObject({ stop: 'tool_use', toolCalls: [{ id: 'tu_1', name: 'search_papers', input: { query: 'x' } }] });

    const second = fakeFetch({ content: [], stop_reason: 'end_turn' });
    await createAnthropicChat({ ANTHROPIC_API_KEY: 'k' }, ungated, second.fetch)!.complete(
      request('anthropic', [{ role: 'user', text: 'hi' }, { role: 'assistant', text: r.text, toolCalls: r.toolCalls, native: r.native }]),
    );
    expect(second.sent().body.messages[1]).toEqual({ role: 'assistant', content });
  });

  it('is not offered without a key', () => {
    expect(createAnthropicChat({}, ungated)).toBeNull();
  });
});

describe('OpenAI', () => {
  it('sends Chat Completions with tools and one message per tool result', async () => {
    const { fetch, sent } = fakeFetch({
      choices: [{ message: { content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'search_papers', arguments: '{"query":"memory"}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 200, completion_tokens: 20 },
    });
    const r = await createOpenAiChat({ OPENAI_API_KEY: 'sk-oa' }, ungated, fetch)!.complete(request('openai'));
    const s = sent();
    expect(s.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(s.headers.authorization).toBe('Bearer sk-oa');
    expect(s.body).toMatchObject({ model: 'vendor-m', max_completion_tokens: 500, tools: [{ type: 'function', function: { name: 'search_papers' } }] });
    expect(s.body.messages).toEqual([
      { role: 'system', content: 'Be careful.' },
      { role: 'user', content: 'Find sleep papers' },
      { role: 'assistant', content: 'Searching.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_papers', arguments: '{"query":"sleep","year":null}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '[{"id":"openalex:W1"}]' },
    ]);
    expect(r).toMatchObject({ text: '', stop: 'tool_use', toolCalls: [{ id: 'call_9', name: 'search_papers', input: { query: 'memory' } }], usage: { inputTokens: 200, outputTokens: 20 } });
  });

  it('survives arguments that are not valid JSON', async () => {
    const { fetch } = fakeFetch({ choices: [{ message: { content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 't', arguments: '{oops' } }] } }] });
    const r = await createOpenAiChat({ OPENAI_API_KEY: 'k' }, ungated, fetch)!.complete(request('openai'));
    expect(r.toolCalls[0].input).toEqual({});
  });
});

describe('Gemini', () => {
  it('sends generateContent with the key in a header and a Gemini-safe schema', async () => {
    const { fetch, sent } = fakeFetch({
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Found them.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 30, thoughtsTokenCount: 10 },
    });
    const r = await createGeminiChat({ GEMINI_API_KEY: 'g-key' }, ungated, fetch)!.complete(request('gemini'));
    const s = sent();
    expect(s.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/vendor-m:generateContent');
    expect(s.headers['x-goog-api-key']).toBe('g-key');
    expect(s.body.systemInstruction).toEqual({ parts: [{ text: 'Be careful.' }] });
    expect(s.body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Find sleep papers' }] },
      { role: 'model', parts: [{ text: 'Searching.' }, { functionCall: { name: 'search_papers', args: { query: 'sleep', year: null } } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'search_papers', response: { content: '[{"id":"openalex:W1"}]' } } }] },
    ]);
    const params = s.body.tools[0].functionDeclarations[0].parameters;
    expect(params).not.toHaveProperty('$schema');
    expect(params).not.toHaveProperty('additionalProperties');
    expect(params.properties.year).toEqual({ type: 'integer', nullable: true });
    expect(r).toMatchObject({ text: 'Found them.', stop: 'end', usage: { inputTokens: 300, outputTokens: 40 } });
  });

  it('makes up call IDs Gemini leaves out, and keeps them out of the results it gets back', async () => {
    const parts = [{ functionCall: { name: 'search_papers', args: { query: 'x' } }, thoughtSignature: 'sig' }];
    const first = fakeFetch({ candidates: [{ content: { parts }, finishReason: 'STOP' }] });
    const r = await createGeminiChat({ GEMINI_API_KEY: 'k' }, ungated, first.fetch)!.complete(request('gemini', [{ role: 'user', text: 'hi' }]));
    expect(r).toMatchObject({ stop: 'tool_use', toolCalls: [{ id: 'gemini_0', name: 'search_papers' }] });

    const second = fakeFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await createGeminiChat({ GEMINI_API_KEY: 'k' }, ungated, second.fetch)!.complete(
      request('gemini', [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: '', toolCalls: r.toolCalls, native: r.native },
        { role: 'tool', results: [{ callId: 'gemini_0', name: 'search_papers', content: 'none', isError: true }] },
      ]),
    );
    const contents = second.sent().body.contents;
    expect(contents[1]).toEqual({ role: 'model', parts }); // thought signature kept
    expect(contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'search_papers', response: { error: 'none' } } }] });
  });

  it('turns JSON Schema into Gemini’s subset', () => {
    const schema = z.toJSONSchema(z.object({ ids: z.array(z.string()).min(1), mode: z.enum(['a', 'b']).optional(), n: z.number().int() }));
    expect(toGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, mode: { type: 'string', enum: ['a', 'b'] }, n: { type: 'integer' } },
      required: ['ids', 'n'],
    });
  });
});

describe('errors and the gateway policy', () => {
  it('maps vendor failures to the common errors', () => {
    const h = (o: Record<string, string> = {}) => new Headers(o);
    expect(chatError('p', 'P', 429, {}, h({ 'retry-after': '2' }))).toMatchObject({ code: 'busy', details: { status: 429, retryAfterS: 2 } });
    expect(chatError('p', 'P', 429, { error: { message: 'You exceeded your current quota' } }, h())).toMatchObject({ code: 'budget' });
    expect(chatError('p', 'P', 401, {}, h())).toMatchObject({ code: 'unavailable', details: { reason: 'auth' } });
    expect(chatError('p', 'P', 404, {}, h())).toMatchObject({ code: 'unavailable' });
    expect(chatError('p', 'P', 400, { error: { message: 'bad' } }, h())).toMatchObject({ code: 'bad_request', details: { reason: 'bad' } });
    expect(chatError('p', 'P', 529, {}, h())).toMatchObject({ code: 'busy' });
  });

  it('turns network failures into "unavailable"', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    await expect(createGeminiChat({ GEMINI_API_KEY: 'k' }, ungated, fetch)!.complete(request('gemini'))).rejects.toMatchObject({ name: 'ProviderError', code: 'unavailable', details: { reason: 'network' } });
  });

  it('never caches, and caps each provider’s daily spending', () => {
    const p = chatPolicy('gemini', 'Gemini', { AI_DAILY_ALERT_USD: '1', AI_DAILY_CAP_USD: '3' });
    expect(p.describe({} as never)).toMatchObject({ cacheKey: null, search: false });
    expect(p.spend).toMatchObject({ dailyAlertUsd: 1, dailyCapUsd: 3 });
    expect(chatPolicy('x', 'X', {}).spend).toMatchObject({ dailyAlertUsd: 5, dailyCapUsd: 20 });
  });

  it('wires each provider through the gate', () => {
    const gate = vi.fn((t) => t) as unknown as Gate;
    CHAT_PROVIDERS.gemini.create({ GEMINI_API_KEY: 'k' }, gate);
    expect(gate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: 'gemini' }));
  });

  it('prices calls from token counts', () => {
    expect(costOf(model('x', { inputUsdPerM: 0.1, outputUsdPerM: 0.4 }), { inputTokens: 1_000_000, outputTokens: 500_000 })).toBeCloseTo(0.3);
  });
});

describe('the model catalog', () => {
  const keys = { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' };

  it('has the three v1 models, Gemini first and default, each with a registered provider', () => {
    expect(CHAT_MODELS.map((m) => m.provider)).toEqual(['gemini', 'openai', 'anthropic']);
    for (const m of CHAT_MODELS) expect(CHAT_PROVIDERS[m.provider]).toBeTruthy();
    expect(new Set(CHAT_MODELS.map((m) => m.id)).size).toBe(CHAT_MODELS.length);
    const c = chatModels(keys, ungated);
    expect(c.models).toHaveLength(3);
    expect(c.defaultModel?.provider).toBe('gemini');
  });

  it('offers only models whose provider has a key', () => {
    const c = chatModels({ OPENAI_API_KEY: 'o' }, ungated);
    expect(c.models.map((m) => m.provider)).toEqual(['openai']);
    expect(c.defaultModel?.provider).toBe('openai'); // Gemini isn't set up, so the first on offer
    expect(chatModels({}, ungated)).toMatchObject({ models: [], defaultModel: null });
  });

  it('follows AGENT_MODELS and AGENT_DEFAULT_MODEL, and picks the default for unknown IDs', () => {
    const c = chatModels({ ...keys, AGENT_MODELS: 'claude-haiku,gpt-luna', AGENT_DEFAULT_MODEL: 'gpt-luna' }, ungated);
    expect(c.models.map((m) => m.id)).toEqual(['claude-haiku', 'gpt-luna']);
    expect(c.pick('claude-haiku')?.id).toBe('claude-haiku');
    expect(c.pick('gemini-flash-lite')?.id).toBe('gpt-luna');
    expect(c.pick(null)?.id).toBe('gpt-luna');
    expect(c.provider(c.pick('claude-haiku')!).name).toBe('anthropic');
  });

  it('tells the browser only IDs, labels and providers', () => {
    const info = chatModels(keys, ungated).info();
    expect(info.defaultModel).toBe('gemini-flash-lite');
    for (const m of info.models) expect(Object.keys(m).sort()).toEqual(['id', 'label', 'provider']);
  });

  it('takes more models without other changes', () => {
    const more = [...CHAT_MODELS, { ...CHAT_MODELS[0], id: 'gemini-pro', label: 'Gemini Pro', vendorModel: 'gemini-pro-x' }];
    expect(chatModels(keys, ungated, more).models.map((m) => m.id)).toContain('gemini-pro');
  });
});
