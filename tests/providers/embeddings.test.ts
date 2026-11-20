import { describe, expect, it, vi } from 'vitest';
import { embedder, embeddingSettings, normalize } from '@/lib/providers/embeddings/embedder';
import { EMBEDDING_MODELS } from '@/lib/providers/embeddings/models';
import { EMBEDDINGS_PROVIDERS } from '@/lib/providers/embeddings/registry';
import type { EmbeddingsProviderDefinition, EmbedRequest } from '@/lib/providers/embeddings/types';
import { createGeminiEmbeddings, geminiEmbedRequest } from '@/lib/providers/gemini/embed';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;
const model001 = EMBEDDING_MODELS.find((m) => m.id === 'gemini-embedding-001')!;

describe('embedding settings', () => {
  it('defaults to the cheapest Gemini model at 768 dimensions', () => {
    expect(embeddingSettings({})).toEqual({ model: model001, dimensions: 768 });
    expect(embeddingSettings({ READER_EMBEDDING_MODEL: 'gemini-embedding-2', READER_EMBEDDING_DIMENSIONS: '1536' })).toMatchObject({ model: { id: 'gemini-embedding-2' }, dimensions: 1536 });
  });

  it('ignores an unknown model and out-of-range sizes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(embeddingSettings({ READER_EMBEDDING_MODEL: 'nope', READER_EMBEDDING_DIMENSIONS: '3072' })).toEqual({ model: model001, dimensions: 768 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('registers Gemini and builds it only with a key', () => {
    expect(Object.keys(EMBEDDINGS_PROVIDERS)).toEqual(['gemini']);
    expect(embedder({}, ungated)).toBeNull();
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
});
