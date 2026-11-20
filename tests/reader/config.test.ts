import { describe, expect, it } from 'vitest';
import { chatModels } from '@/lib/providers/chat/catalog';
import type { ChatModel, ChatProviderDefinition } from '@/lib/providers/chat/types';
import { readerConfig, readerModels } from '@/lib/reader/config';

const fake: ChatProviderDefinition = { name: 'p', create: () => ({ name: 'p', complete: async () => ({}) as never }) };
const catalog: ChatModel[] = [
  { id: 'big', provider: 'p', label: 'Big', vendorModel: 'big', inputUsdPerM: 3, outputUsdPerM: 15 },
  { id: 'small', provider: 'p', label: 'Small', vendorModel: 'small', inputUsdPerM: 0.1, outputUsdPerM: 0.4 },
];
const chat = (env: Record<string, string> = {}) => chatModels(env, (t) => t, catalog, { p: fake }, 'big');

describe('reader config', () => {
  it('has sensible defaults', () => {
    expect(readerConfig({})).toEqual({ model: null, fastModel: null, fullTextMaxTokens: 30000, maxPdfBytes: 50 * 1024 * 1024, sharedKeepDays: 90 });
    expect(readerConfig({ READER_FULLTEXT_MAX_TOKENS: 'lots' }).fullTextMaxTokens).toBe(30000);
    expect(readerConfig({ READER_MODEL: 'small', READER_FULLTEXT_MAX_TOKENS: '12000' })).toMatchObject({ model: 'small', fullTextMaxTokens: 12000 });
  });

  it('uses the assistant’s default for answers and the cheapest model for quick jobs', () => {
    expect(readerModels(chat(), readerConfig({}))).toMatchObject({ main: { id: 'big' }, fast: { id: 'small' } });
    expect(readerModels(chat(), readerConfig({ READER_MODEL: 'small', READER_FAST_MODEL: 'big' }))).toMatchObject({ main: { id: 'small' }, fast: { id: 'big' } });
    // a model that isn't on offer falls back
    expect(readerModels(chat(), readerConfig({ READER_MODEL: 'gone', READER_FAST_MODEL: 'gone' }))).toMatchObject({ main: { id: 'big' }, fast: { id: 'small' } });
  });

  it('is off when no AI model is set up', () => {
    expect(readerModels(chatModels({}, (t) => t, catalog, {}, 'big'), readerConfig({}))).toBeNull();
  });
});
