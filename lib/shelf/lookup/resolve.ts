import type { PaperRef, PaperSource } from '@/lib/providers/papers/types';
import type { Paper } from '@/lib/papers/types';
import { ShelfError } from '../errors';
import type { ParsedInput } from './parse-input';

/* Turn parsed input into papers to choose from.
   IDs (DOI, OpenAlex, PMID, PMCID) are single lookups: free.
   A title is one search, which costs and counts toward the user's daily
   search limit; the caller reserves it first. */

export const TITLE_MATCHES = 5;

export type LookupResult = { via: 'doi' | 'link' | 'title'; papers: Paper[] };

const refFor = (p: Exclude<ParsedInput, { kind: 'title' | 'empty' | 'unreadable_link' }>): PaperRef =>
  p.kind === 'doi' ? { kind: 'doi', doi: p.doi } : p.kind === 'openalex' ? { kind: 'id', id: p.id } : { kind: p.kind, id: p.id };

export async function resolveInput(papers: PaperSource, parsed: ParsedInput): Promise<LookupResult> {
  switch (parsed.kind) {
    case 'empty':
      throw new ShelfError('bad_request', 'Paste a DOI, a link or a title.');
    case 'unreadable_link':
      throw new ShelfError('bad_request', 'We couldn’t read a paper from this link. Try searching by its title, or enter the details by hand.');
    case 'title': {
      const { papers: found } = await papers.search({ text: parsed.title, perPage: TITLE_MATCHES });
      return { via: 'title', papers: found };
    }
    default: {
      const { paper } = await papers.getPaper(refFor(parsed));
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
