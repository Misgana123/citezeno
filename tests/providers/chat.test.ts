import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { chatModels, loadChatModels, popularRank, selectModels } from '@/lib/providers/chat/catalog';
import { withFallback } from '@/lib/providers/chat/fallback';
import { chatError, chatPolicy } from '@/lib/providers/chat/http';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, POPULAR_MODELS } from '@/lib/providers/chat/models';
import { CHAT_PROVIDERS } from '@/lib/providers/chat/registry';
import { costOf, type ChatMessage, type ChatModel, type ChatProvider, type ChatRequest } from '@/lib/providers/chat/types';
import { ProviderError } from '@/lib/providers/errors';
import { createGeminiChat } from '@/lib/providers/gemini/chat';
import { toGeminiSchema } from '@/lib/providers/gemini/schema';
import { createOpenRouterChat, toOpenRouterMessages } from '@/lib/providers/openrouter/chat';
import { modelListPolicy, openRouterModels, toChatModel, usableModels } from '@/lib/providers/openrouter/models';
import { openRouterPolicy } from '@/lib/providers/openrouter/policy';
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

describe('OpenRouter', () => {
  it('sends Chat Completions with tools, one message per tool result, and asks for the cost', async () => {
    const { fetch, sent } = fakeFetch({
      choices: [{ message: { content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'search_papers', arguments: '{"query":"memory"}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 200, completion_tokens: 20, cost: 0.00042 },
    });
    const r = await createOpenRouterChat({ OPENROUTER_API_KEY: 'sk-or' }, ungated, fetch)!.complete(request('openrouter'));
    const s = sent();
    expect(s.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(s.headers.authorization).toBe('Bearer sk-or');
    expect(s.body).toMatchObject({ model: 'vendor-m', max_tokens: 500, usage: { include: true }, tools: [{ type: 'function', function: { name: 'search_papers' } }] });
    expect(s.body.messages).toEqual([
      { role: 'system', content: 'Be careful.' },
      { role: 'user', content: 'Find sleep papers' },
      { role: 'assistant', content: 'Searching.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_papers', arguments: '{"query":"sleep","year":null}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '[{"id":"openalex:W1"}]' },
    ]);
    expect(r).toMatchObject({ text: '', stop: 'tool_use', toolCalls: [{ id: 'call_9', name: 'search_papers', input: { query: 'memory' } }], usage: { inputTokens: 200, outputTokens: 20 } });
    expect(r.costUsd).toBe(0.00042); // what OpenRouter says it charged, not our estimate
  });

  it('prices from tokens when no cost is stated, and survives arguments that are not valid JSON', async () => {
    const { fetch } = fakeFetch({ choices: [{ message: { content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 't', arguments: '{oops' } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
    const r = await createOpenRouterChat({ OPENROUTER_API_KEY: 'k' }, ungated, fetch)!.complete(request('openrouter'));
    expect(r.toolCalls[0].input).toEqual({});
    expect(r.costUsd).toBeCloseTo((1000 * 1 + 100 * 4) / 1e6);
  });

  it('sends a model’s reasoning details back with its own earlier turn, not with another provider’s', async () => {
    const reasoning = [{ type: 'reasoning.encrypted', data: 'abc' }];
    const turn = (provider: string): ChatMessage => ({ ...HISTORY[1], native: { provider, content: { content: 'Searching.', reasoning_details: reasoning } } } as ChatMessage);
    const own = toOpenRouterMessages('s', [HISTORY[0], turn('openrouter')])[2] as { reasoning_details?: unknown };
    expect(own.reasoning_details).toEqual(reasoning);
    const other = toOpenRouterMessages('s', [HISTORY[0], turn('gemini')])[2] as { reasoning_details?: unknown };
    expect(other.reasoning_details).toBeUndefined();
  });

  it('turns an answer without choices into "unavailable", and is not offered without a key', async () => {
    const { fetch } = fakeFetch({ error: { message: 'upstream failed' } });
    await expect(createOpenRouterChat({ OPENROUTER_API_KEY: 'k' }, ungated, fetch)!.complete(request('openrouter'))).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'upstream failed' } });
    expect(createOpenRouterChat({}, ungated)).toBeNull();
  });

  it('keeps calls to OpenRouter behind a breaker, so the fallback takes over at once', () => {
    expect(openRouterPolicy({}).breaker).toMatchObject({ failures: 3 });
    expect(openRouterPolicy({}).spend).toMatchObject({ dailyAlertUsd: 5, dailyCapUsd: 20 });
  });
});

describe('OpenRouter’s model list', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: `Maker: ${id.split('/')[1]}`,
    pricing: { prompt: '0.0000003', completion: '0.0000025' },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'max_tokens'],
    ...over,
  });

  it('keeps only models that call tools, answer in text and have a fixed price', () => {
    const kept = usableModels({
      data: [
        row('google/gemini-3.5-flash-lite', { name: 'Google: Gemini 3.5 Flash Lite' }),
        row('meta/text-only', { architecture: { input_modalities: ['text'], output_modalities: ['text'] } }),
        row('x/no-tools', { supported_parameters: ['max_tokens'] }),
        row('x/image-maker', { architecture: { input_modalities: ['text'], output_modalities: ['image', 'text'] } }),
        row('x/m:free'),
        row('x/m:batch'),
        row('~x/latest'),
        row('openrouter/auto'),
        row('x/variable', { pricing: { prompt: '-1', completion: '-1' } }),
        row('x/zero', { pricing: { prompt: '0', completion: '0' } }),
        { id: 42 },
      ],
    });
    expect(kept.map((m) => m.id)).toEqual(['google/gemini-3.5-flash-lite', 'meta/text-only']);
    expect(kept[1].images).toBe(false);
    expect(toChatModel(kept[0], 'openrouter')).toEqual({
      id: 'google/gemini-3.5-flash-lite',
      provider: 'openrouter',
      label: 'Gemini 3.5 Flash Lite',
      vendorModel: 'google/gemini-3.5-flash-lite',
      inputUsdPerM: 0.3,
      outputUsdPerM: 2.5,
      vendor: 'google',
      vendorName: 'Google',
      images: true,
    });
    expect(usableModels(null)).toEqual([]);
  });

  it('is fetched through the gate, cached for a day and kept while OpenRouter is down; an empty list is an error', async () => {
    const gate = vi.fn((t) => t) as unknown as Gate;
    const fetch = vi.fn(async (_u: string | URL) => Response.json({ data: [row('a/one')] }));
    const list = await openRouterModels(gate, 'openrouter', fetch as unknown as typeof globalThis.fetch)();
    expect(String(fetch.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/models');
    expect(list.map((m) => m.id)).toEqual(['a/one']);
    expect(gate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: 'openrouter-models', spend: null }));
    const p = modelListPolicy();
    expect(p.describe({ url: '' })).toMatchObject({ cacheTtlS: 86_400 });
    expect(p.staleS).toBeGreaterThanOrEqual(86_400);
    await expect(openRouterModels(ungated, 'openrouter', fakeFetch({ data: [] }).fetch)()).rejects.toMatchObject({ code: 'unavailable' });
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
      // another provider's turn: its tool call carries Gemini's stand-in signature
      { role: 'model', parts: [{ text: 'Searching.' }, { functionCall: { name: 'search_papers', args: { query: 'sleep', year: null } }, thoughtSignature: 'skip_thought_signature_validator' }] },
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
    // OpenRouter says which host behind it failed, and how
    const upstream = { error: { code: 502, message: 'Provider returned error', metadata: { provider_name: 'Google', raw: '{"error":\n "overloaded"}' } } };
    expect(chatError('p', 'P', 502, upstream, h()).details.reason).toBe('Provider returned error (Google): {"error": "overloaded"}');
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
  const live = (id: string, over: Partial<ChatModel> = {}): ChatModel => ({ id, provider: 'openrouter', label: id, vendorModel: id, inputUsdPerM: 1, outputUsdPerM: 2, ...over });
  /* OpenRouter with a fixed live list, and Gemini as in the app. */
  const registry = (list: ChatModel[] | Error, answer: () => Promise<unknown> = async () => ({})) => {
    const fake: ChatProvider = {
      name: 'openrouter',
      models: async () => {
        if (list instanceof Error) throw list;
        return list;
      },
      complete: answer as ChatProvider['complete'],
    };
    return { openrouter: { name: 'openrouter', create: (env: Record<string, string | undefined>) => (env.OPENROUTER_API_KEY ? fake : null) }, gemini: CHAT_PROVIDERS.gemini };
  };
  const LIVE = [live('google/gemini-3.5-flash-lite'), live('anthropic/claude-haiku-5.5'), live('anthropic/claude-sonnet-5'), live('openai/gpt-6-luna')];

  it('has fixed Gemini models with OpenRouter’s IDs, the default among them', () => {
    expect(CHAT_MODELS.every((m) => m.provider === 'gemini' && m.id === `google/${m.vendorModel}`)).toBe(true);
    expect(CHAT_MODELS.map((m) => m.id)).toContain(DEFAULT_CHAT_MODEL);
    expect(Object.keys(CHAT_PROVIDERS)).toEqual(['openrouter', 'gemini']);
    const c = chatModels({ GEMINI_API_KEY: 'g' }, ungated);
    expect(c.defaultModel?.id).toBe('google/gemini-3.5-flash-lite');
  });

  it('offers OpenRouter’s live list when it has a key; its entry wins over the fixed one with the same ID', async () => {
    const c = await loadChatModels({ OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'g' }, ungated, CHAT_MODELS, registry(LIVE));
    expect(c.models.map((m) => m.id)).toEqual([...LIVE.map((m) => m.id), 'google/gemini-3.5-flash']);
    expect(c.pick('google/gemini-3.5-flash-lite')?.provider).toBe('openrouter');
    expect(c.defaultModel?.id).toBe('google/gemini-3.5-flash-lite');
  });

  it('offers the fixed Gemini models when OpenRouter has no key or its list can’t be had', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noKey = await loadChatModels({ GEMINI_API_KEY: 'g' }, ungated, CHAT_MODELS, registry(LIVE));
    expect(noKey.models.every((m) => m.provider === 'gemini')).toBe(true);
    const down = await loadChatModels({ OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'g' }, ungated, CHAT_MODELS, registry(new Error('down')));
    expect(down.models.map((m) => m.provider)).toEqual(['gemini', 'gemini']);
    expect(await loadChatModels({}, ungated, CHAT_MODELS, registry(LIVE))).toMatchObject({ models: [], defaultModel: null });
    warn.mockRestore();
  });

  it('follows AGENT_MODELS (IDs or a maker’s models with *) and AGENT_DEFAULT_MODEL, and picks the default for unknown IDs', async () => {
    const env = { OPENROUTER_API_KEY: 'o', AGENT_MODELS: 'anthropic/*, openai/gpt-6-luna', AGENT_DEFAULT_MODEL: 'openai/gpt-6-luna' };
    const c = await loadChatModels(env, ungated, CHAT_MODELS, registry(LIVE));
    expect(c.models.map((m) => m.id)).toEqual(['anthropic/claude-haiku-5.5', 'anthropic/claude-sonnet-5', 'openai/gpt-6-luna']);
    expect(c.pick('anthropic/claude-haiku-5.5')?.id).toBe('anthropic/claude-haiku-5.5');
    expect(c.pick('google/gemini-3.5-flash-lite')?.id).toBe('openai/gpt-6-luna');
    expect(c.pick(null)?.id).toBe('openai/gpt-6-luna');
    expect(selectModels(LIVE, 'nothing/*').length).toBe(LIVE.length); // matches nothing: everything, with a warning
  });

  it('tells the browser only IDs, labels and makers', async () => {
    const info = (await loadChatModels({ OPENROUTER_API_KEY: 'o' }, ungated, CHAT_MODELS, registry([live('meta-llama/llama-5', { vendorName: 'Meta' }), live('mistralai/x')]))).info();
    expect(info.models).toEqual([
      { id: 'meta-llama/llama-5', label: 'meta-llama/llama-5', vendor: 'meta-llama', vendorName: 'Meta' },
      { id: 'mistralai/x', label: 'mistralai/x', vendor: 'mistralai', vendorName: 'Mistralai' },
    ]);
  });

  it('marks the popular models with their place, from POPULAR_MODELS or AGENT_POPULAR_MODELS, skipping those not on offer', async () => {
    const env = { OPENROUTER_API_KEY: 'o' };
    const info = (await loadChatModels(env, ungated, CHAT_MODELS, registry(LIVE))).info();
    const popular = (i: typeof info) => i.models.filter((m) => m.popular != null).sort((a, b) => a.popular! - b.popular!).map((m) => m.id);
    expect(popular(info)).toEqual(POPULAR_MODELS.filter((id) => info.models.some((m) => m.id === id)));
    expect(popular(info).slice(0, 3)).toEqual(['google/gemini-3.5-flash-lite', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna']);
    const mine = (await loadChatModels({ ...env, AGENT_POPULAR_MODELS: 'openai/gpt-6-luna, gone/model, anthropic/claude-sonnet-5' }, ungated, CHAT_MODELS, registry(LIVE))).info();
    expect(popular(mine)).toEqual(['openai/gpt-6-luna', 'anthropic/claude-sonnet-5']);
    // names as shown work too, whatever the case, spaces or hyphens
    const named = [live('google/gemini-3.5-flash-lite', { label: 'Gemini 3.5 Flash Lite' }), live('anthropic/claude-sonnet-5.5', { label: 'Claude Sonnet 5.5' }), live('x/other')];
    expect([...popularRank(named, 'Gemini 3.5 Flash-Lite, claude Sonnet 5.5, Nope 1').keys()]).toEqual(['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5.5']);
    // naming nothing on offer: the default list, with a warning
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...popularRank(named, 'Nothing, At All').keys()]).toEqual(['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5.5']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('the Gemini fallback', () => {
    const down = () => Promise.reject(new ProviderError('unavailable', 'OpenRouter answered 502.', { status: 502 }));
    const geminiAnswer = { candidates: [{ content: { parts: [{ text: 'From Gemini.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } };
    const env = { OPENROUTER_API_KEY: 'o', GEMINI_API_KEY: 'g' };

    it('sends the same model straight to Gemini while OpenRouter is down', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fetch, sent } = fakeFetch(geminiAnswer);
      vi.stubGlobal('fetch', fetch);
      try {
        const c = await loadChatModels(env, ungated, CHAT_MODELS, registry(LIVE, down));
        const r = await c.provider(c.pick('google/gemini-3.5-flash-lite')!).complete({ ...request('x'), model: c.pick('google/gemini-3.5-flash-lite')! });
        expect(r.text).toBe('From Gemini.');
        expect(sent().url).toContain('/models/gemini-3.5-flash-lite:generateContent');
      } finally {
        vi.unstubAllGlobals();
        warn.mockRestore();
      }
    });

    it('sends other makers’ models to AI_FALLBACK_MODEL; a bad request or our cap never falls back', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fetch, sent } = fakeFetch(geminiAnswer);
      vi.stubGlobal('fetch', fetch);
      try {
        const c = await loadChatModels({ ...env, AI_FALLBACK_MODEL: 'google/gemini-3.5-flash' }, ungated, CHAT_MODELS, registry(LIVE, down));
        const claude = c.pick('anthropic/claude-haiku-5.5')!;
        await c.provider(claude).complete({ ...request('x'), model: claude });
        expect(sent().url).toContain('/models/gemini-3.5-flash:generateContent');
        for (const e of [new ProviderError('bad_request', 'no'), new ProviderError('budget', 'cap')]) {
          const c2 = await loadChatModels(env, ungated, CHAT_MODELS, registry(LIVE, () => Promise.reject(e)));
          await expect(c2.provider(claude).complete({ ...request('x'), model: claude })).rejects.toBe(e);
        }
        // no Gemini key: no fallback, the failure stands
        const c3 = await loadChatModels({ OPENROUTER_API_KEY: 'o' }, ungated, CHAT_MODELS, registry(LIVE, down));
        await expect(c3.provider(claude).complete({ ...request('x'), model: claude })).rejects.toMatchObject({ code: 'unavailable' });
      } finally {
        vi.unstubAllGlobals();
        warn.mockRestore();
      }
    });

    it('switches a streamed answer only before its first words', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const backup: ChatProvider = { name: 'b', complete: async () => ({ text: 'B', toolCalls: [], stop: 'end', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, native: { provider: 'b', content: null } }) };
      const failing = (afterWords: boolean): ChatProvider => ({
        name: 'a',
        complete: down as never,
        stream: async (_r, onText) => {
          if (afterWords) onText('Half');
          return down() as never;
        },
      });
      const said: string[] = [];
      const r = await withFallback(failing(false), backup, live('b/m')).stream!({ ...request('x'), tools: [] }, (t) => said.push(t));
      expect(r.text).toBe('B');
      expect(said).toEqual(['B']);
      await expect(withFallback(failing(true), backup, live('b/m')).stream!({ ...request('x'), tools: [] }, () => {})).rejects.toMatchObject({ code: 'unavailable' });
      warn.mockRestore();
    });
  });
});
