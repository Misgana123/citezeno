import type { OpenAlexClient, QueryParams } from '../openalex/client';

/* What kind of OpenAlex call a request is, for pacing, pricing and caching. */
export type CallKind = 'semantic' | 'keyword' | 'list' | 'single';

export function callKind(path: string, params: QueryParams = {}): CallKind {
  if (params['search.semantic'] != null) return 'semantic';
  if (params.search != null) return 'keyword';
  return /^\/works\/[^/]+$/.test(path) ? 'single' : 'list';
}

/* Searches are what OpenAlex prices per search and what users' limits count. */
export const isSearch = (kind: CallKind) => kind === 'semantic' || kind === 'keyword';

/* A guard layer wraps one client in another with the same shape. */
export type Layer = (inner: OpenAlexClient) => OpenAlexClient;

export const compose = (base: OpenAlexClient, ...layers: Layer[]): OpenAlexClient =>
  layers.reduceRight((client, layer) => layer(client), base);
