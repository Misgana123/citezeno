import { describe, expect, it, vi } from 'vitest';
import { embedder, embeddingSettings, normalize } from '@/lib/providers/embeddings/embedder';
import { EMBEDDING_MODELS } from '@/lib/providers/embeddings/models';
import { EMBEDDINGS_PROVIDERS } from '@/lib/providers/embeddings/registry';
import type { EmbeddingsProviderDefinition, EmbedRequest } from '@/lib/providers/embeddings/types';
import { createGeminiEmbeddings, geminiEmbedRequest } from '@/lib/providers/gemini/embed';
import { ProviderError } from '@/lib/providers/errors';
import { createOpenRouterEmbeddings } from '@/lib/providers/openrouter/embed';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;
const model001 = EMBEDDING_MODELS.find((m) => m.id === 'gemini-embedding-001')!;
const routed = EMBEDDING_MODELS.find((m) => m.id === 'google/gemini-embedding-2')!;

describe('embedding settings', () => {
  it('defaults to Gemini Embedding 2 through OpenRouter at 768 dimensions', () => {
    expect(embeddingSettings({})).toEqual({ model: routed, dimensions: 768 });
    expect(routed).toMatchObject({ provider: 'openrouter', taskInText: true, fallback: 'gemini-embedding-2' });
    expect(embeddingSettings({ READER_EMBEDDING_MODEL: 'gemini-embedding-2', READER_EMBEDDING_DIMENSIONS: '1536' })).toMatchObject({ model: { id: 'gemini-embedding-2' }, dimensions: 1536 });
  });

  it('ignores an unknown model and out-of-range sizes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(embeddingSettings({ READER_EMBEDDING_MODEL: 'nope', READER_EMBEDDING_DIMENSIONS: '3072' })).toEqual({ model: routed, dimensions: 768 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('registers OpenRouter and Gemini, and builds them only with a key', () => {
    expect(Object.keys(EMBEDDINGS_PROVIDERS)).toEqual(['openrouter', 'gemini']);
    expect(embedder({}, ungated)).toBeNull();
    // only Gemini's key: the same model straight from Gemini, under the same ID (same vectors)
    expect(embedder({ GEMINI_API_KEY: 'g' }, ungated)?.model.id).toBe('google/gemini-embedding-2');
  });
});

describe('Gemini embeddings', () => {
  it('uses task types (and titles) for 001, prefixes for 2', () => {
    expect(geminiEmbedRequest('gemini-embedding-001', 'document', { text: 'Passage.', title: 'Paper' }, 768)).toEqual({
      model: 'models/gemini-embedding-001',
      outputDimensionality: 768,
      content: { parts: [{ text: 'Passage.' }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      title: 'Paper',
    });
    expect(geminiEmbedRequest('gemini-embedding-001', 'query', { text: 'Q?' }, 768)).toMatchObject({ taskType: 'RETRIEVAL_QUERY' });
    expect(geminiEmbedRequest('gemini-embedding-2', 'document', { text: 'Passage.' }, 768)).toEqual({ model: 'models/gemini-embedding-2', outputDimensionality: 768, content: { parts: [{ text: 'title: none | text: Passage.' }] } });
    expect(geminiEmbedRequest('gemini-embedding-2', 'query', { text: 'Q?' }, 768).content).toEqual({ parts: [{ text: 'task: search result | query: Q?' }] });
  });

  it('sends a batch with the key in a header and prices it (estimated when usage is missing)', async () => {
    const fetch = vi.fn(async (_u: string | URL, _i?: RequestInit) => Response.json({ embeddings: [{ values: [3, 4] }, { values: [0, 2] }] }));
    const provider = createGeminiEmbeddings({ GEMINI_API_KEY: 'g' }, ungated, fetch as unknown as typeof globalThis.fetch)!;
    const req: EmbedRequest = { model: model001, kind: 'document', inputs: [{ text: 'a'.repeat(400) }, { text: 'b'.repeat(400) }], dimensions: 2 };
    const r = await provider.embed(req);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('g');
    expect(JSON.parse(String(init?.body)).requests).toHaveLength(2);
    expect(r.tokens).toBe(200);
    expect(r.costUsd).toBeCloseTo((200 * 0.15) / 1e6);
  });

  it('fails clearly on wrong-sized answers and vendor errors', async () => {
    const bad = createGeminiEmbeddings({ GEMINI_API_KEY: 'g' }, ungated, vi.fn(async () => Response.json({ embeddings: [{ values: [1] }] })) as never)!;
    await expect(bad.embed({ model: model001, kind: 'query', inputs: [{ text: 'q' }], dimensions: 2 })).rejects.toMatchObject({ code: 'unavailable' });
    const busy = createGeminiEmbeddings({ GEMINI_API_KEY: 'g' }, ungated, vi.fn(async () => Response.json({ error: { message: 'slow' } }, { status: 429 })) as never)!;
    await expect(busy.embed({ model: model001, kind: 'query', inputs: [{ text: 'q' }], dimensions: 2 })).rejects.toMatchObject({ code: 'busy' });
  });
});

describe('embedder', () => {
  it('batches by the model’s limit and normalizes every vector', async () => {
    const calls: number[] = [];
    const fake: EmbeddingsProviderDefinition = {
      name: 'fake',
      create: () => ({ name: 'fake', embed: async (r) => (calls.push(r.inputs.length), { vectors: r.inputs.map(() => [3, 4]), tokens: r.inputs.length, costUsd: 0.001 }) }),
    };
    const catalog = [{ id: 'm', provider: 'fake', vendorModel: 'm', usdPerM: 1, maxInputTokens: 100, maxBatch: 2 }];
    const e = embedder({ READER_EMBEDDING_MODEL: 'm' }, ungated, catalog, { fake })!;
    const r = await e.embed('document', [{ text: '1' }, { text: '2' }, { text: '3' }]);
    expect(calls).toEqual([2, 1]);
    expect(r.vectors).toEqual([[0.6, 0.8], [0.6, 0.8], [0.6, 0.8]]);
    expect(r.tokens).toBe(3);
    expect(r.costUsd).toBeCloseTo(0.002);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it('falls back to the same model by another route while the first is down, never on a bad request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent: string[] = [];
    let primaryError: unknown = new ProviderError('unavailable', 'down', { status: 502 });
    const def = (name: string): EmbeddingsProviderDefinition => ({
      name,
      create: () => ({
        name,
        embed: async (r) => {
          sent.push(`${name}:${r.model.id}`);
          if (name === 'a' && primaryError) throw primaryError;
          return { vectors: r.inputs.map(() => [1, 0]), tokens: 1, costUsd: 0 };
        },
      }),
    });
    const catalog = [
      { id: 'm', provider: 'a', vendorModel: 'm', usdPerM: 1, maxInputTokens: 100, maxBatch: 10, fallback: 'm-direct' },
      { id: 'm-direct', provider: 'b', vendorModel: 'm', usdPerM: 1, maxInputTokens: 100, maxBatch: 10 },
    ];
    const e = embedder({ READER_EMBEDDING_MODEL: 'm' }, ungated, catalog, { a: def('a'), b: def('b') })!;
    expect((await e.embed('query', [{ text: 'q' }])).vectors).toEqual([[1, 0]]);
    expect(sent).toEqual(['a:m', 'b:m-direct']);
    expect(e.model.id).toBe('m');
    primaryError = new ProviderError('bad_request', 'no');
    await expect(e.embed('query', [{ text: 'q' }])).rejects.toMatchObject({ code: 'bad_request' });
    warn.mockRestore();
  });
});

describe('OpenRouter embeddings', () => {
  it('sends the texts with the job written in, reads vectors in order and the stated cost', async () => {
    const fetch = vi.fn(async (_u: string | URL, _i?: RequestInit) => Response.json({ data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 12, cost: 0.0000024 } }));
    const provider = createOpenRouterEmbeddings({ OPENROUTER_API_KEY: 'or' }, ungated, fetch as unknown as typeof globalThis.fetch)!;
    const r = await provider.embed({ model: routed, kind: 'document', inputs: [{ text: 'Passage one.', title: 'Paper' }, { text: 'Two.' }], dimensions: 2 });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe('https://openrouter.ai/api/v1/embeddings');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer or');
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'google/gemini-embedding-2', input: ['title: Paper | text: Passage one.', 'title: none | text: Two.'], dimensions: 2, encoding_format: 'float' });
    expect(r).toEqual({ vectors: [[3, 4], [0, 2]], tokens: 12, costUsd: 0.0000024 });
  });

  it('is not built without a key, and fails clearly on wrong answers', async () => {
    expect(createOpenRouterEmbeddings({}, ungated)).toBeNull();
    const bad = createOpenRouterEmbeddings({ OPENROUTER_API_KEY: 'k' }, ungated, vi.fn(async () => Response.json({ data: [{ embedding: [1] }] })) as never)!;
    await expect(bad.embed({ model: routed, kind: 'query', inputs: [{ text: 'q' }], dimensions: 2 })).rejects.toMatchObject({ code: 'unavailable' });
    const broke = createOpenRouterEmbeddings({ OPENROUTER_API_KEY: 'k' }, ungated, vi.fn(async () => Response.json({ error: { message: 'no credits' } }, { status: 402 })) as never)!;
    await expect(broke.embed({ model: routed, kind: 'query', inputs: [{ text: 'q' }], dimensions: 2 })).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'credits' } });
  });
});
