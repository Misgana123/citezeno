import { resolvePaperId, type PaperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { PapersError } from '../errors';
import type { Paper } from '../types';

/* A paper as a source knows it: the source and its own ID for the paper. */
export type PaperTarget = { source: PaperSource; id: string };

/* A paper ID from the URL ("openalex:W123", or an ID / link an enabled source
   recognises) → its source and ID, or a bad_request. */
export function parsePaperId(sources: PaperSources, raw: string): PaperTarget {
  let text = raw || '';
  try {
    text = decodeURIComponent(text);
  } catch {
    // not encoded: use as is
  }
  const target = resolvePaperId(sources, text);
  if (!target) throw new PapersError('bad_request', 'That is not a valid paper ID.');
  return target;
}

/* Full details for one paper. */
export async function getPaper({ source, id }: PaperTarget): Promise<{ paper: Paper; costUsd: number }> {
  const { paper, costUsd } = await source.getPaper({ kind: 'id', id });
  if (!paper) throw new PapersError('not_found', 'Paper not found.');
  return { paper, costUsd };
}
