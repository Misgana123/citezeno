import type { PaperSource } from '@/lib/providers/papers/types';
import { PapersError } from '../errors';
import { toWorkId } from '../ids';
import type { Paper } from '../types';

/* A paper ID from the URL → "W123", or a bad_request. */
export function parsePaperId(raw: string): string {
  const id = toWorkId(decodeURIComponent(raw || ''));
  if (!id) throw new PapersError('bad_request', 'That is not a valid paper ID.');
  return id;
}

/* Full details for one paper. */
export async function getPaper(papers: PaperSource, id: string): Promise<{ paper: Paper; costUsd: number }> {
  const { paper, costUsd } = await papers.getPaper({ kind: 'id', id });
  if (!paper) throw new PapersError('not_found', 'Paper not found.');
  return { paper, costUsd };
}
