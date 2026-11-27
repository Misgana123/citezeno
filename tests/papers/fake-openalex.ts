import { speakingPapersErrors } from '@/lib/papers/source';
import { paperSources, type PaperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import type { QueryParams } from '@/lib/providers/openalex/client';
import { openAlexSource } from '@/lib/providers/openalex/source';

/* The real OpenAlex paper source over a fake transport: `get(path, params)`
   answers each raw call, so tests can check what reaches OpenAlex. Errors come
   out as Find Papers sees them (PapersErrors), as in the app. */

type Get = (path: string, params: QueryParams) => Promise<{ body: unknown; costUsd: number; status: number }>;

export function openAlexOver(get: Get): PaperSource {
  return speakingPapersErrors(openAlexSource({ call: (r) => get(r.path, r.params ?? {}) as never }, { maxQueryChars: 1500 }));
}

export const sourcesOver = (get: Get): PaperSources => paperSources([openAlexOver(get)]);
