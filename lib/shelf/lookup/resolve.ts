import { toPaper } from '@/lib/papers/mapper';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { CARD_FIELDS, DETAIL_FIELDS, selectParam } from '@/lib/papers/openalex/fields';
import type { OpenAlexWork } from '@/lib/papers/openalex/types';
import type { Paper } from '@/lib/papers/types';
import { ShelfError } from '../errors';
import { papersErrorCode } from '../papers-error';
import type { ParsedInput } from './parse-input';

/* Turn parsed input into OpenAlex papers to choose from.
   IDs (DOI, OpenAlex, PMID, PMCID) are single lookups: free.
   A title is one search (`/works?search=`), which costs and counts toward the
   user's daily search limit; the caller reserves it first. */

export const TITLE_MATCHES = 5;

export type LookupResult = { via: 'doi' | 'link' | 'title'; papers: Paper[] };

async function single(client: OpenAlexClient, path: string): Promise<Paper | null> {
  try {
    const { body } = await client.get<OpenAlexWork>(path, { select: selectParam(DETAIL_FIELDS) });
    return toPaper(body);
  } catch (e) {
    if (papersErrorCode(e) === 'not_found') return null;
    throw e;
  }
}

/* A DOI goes in the path as is: OpenAlex reads "doi:10.1/x" with its slash. */
const pathFor = (p: Exclude<ParsedInput, { kind: 'title' | 'empty' | 'unreadable_link' }>) =>
  p.kind === 'doi' ? `/works/doi:${p.doi}` : p.kind === 'openalex' ? `/works/${p.id}` : `/works/${p.kind}:${p.id}`;

export async function resolveInput(client: OpenAlexClient, parsed: ParsedInput): Promise<LookupResult> {
  switch (parsed.kind) {
    case 'empty':
      throw new ShelfError('bad_request', 'Paste a DOI, a link or a title.');
    case 'unreadable_link':
      throw new ShelfError('bad_request', 'We couldn’t read a paper from this link. Try searching by its title, or enter the details by hand.');
    case 'title': {
      const { body } = await client.get<{ results?: OpenAlexWork[] }>('/works', { search: parsed.title, per_page: TITLE_MATCHES, select: selectParam(CARD_FIELDS) });
      return { via: 'title', papers: (body.results ?? []).map(toPaper).filter((p): p is Paper => !!p) };
    }
    default: {
      const paper = await single(client, pathFor(parsed));
      const via = parsed.kind === 'doi' || parsed.kind === 'openalex' ? (parsed.fromLink ? 'link' : 'doi') : 'link';
      if (!paper) {
        throw new ShelfError(
          'not_found',
          parsed.kind === 'doi' ? 'We couldn’t find this DOI. You can enter the details by hand.' : 'We couldn’t find this paper. Try its title, or enter the details by hand.',
        );
      }
      return { via, papers: [paper] };
    }
  }
}
