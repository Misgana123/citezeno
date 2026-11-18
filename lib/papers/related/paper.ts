import { PapersError } from '../errors';
import { toWorkId } from '../ids';
import { toPaper } from '../mapper';
import type { OpenAlexClient } from '../openalex/client';
import { DETAIL_FIELDS, selectParam } from '../openalex/fields';
import type { OpenAlexWork } from '../openalex/types';
import type { Paper } from '../types';

/* A paper ID from the URL → "W123", or a bad_request. */
export function parsePaperId(raw: string): string {
  const id = toWorkId(decodeURIComponent(raw || ''));
  if (!id) throw new PapersError('bad_request', 'That is not a valid paper ID.');
  return id;
}

/* Full details for one paper (`/works/{id}`, free). */
export async function getPaper(client: OpenAlexClient, id: string): Promise<{ paper: Paper; costUsd: number }> {
  const { body, costUsd } = await client.get<OpenAlexWork>(`/works/${id}`, { select: selectParam(DETAIL_FIELDS) });
  const paper = toPaper(body);
  if (!paper) throw new PapersError('not_found', 'Paper not found.');
  return { paper, costUsd };
}
